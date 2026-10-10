/* Gegnermodell, Lookahead, Robustheit. */
import test from "node:test";
import assert from "node:assert/strict";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { teamAnlegen } from "../engine/team.js";
import { bewerterAnlegen } from "../engine/score.js";
import { sucheAnlegen } from "../engine/search.js";
import { leererDraft } from "../engine/state.js";
import { SUCHE } from "../engine/config.js";

const DATA = ladeDaten();
const quelle = quelleAnlegen(DATA.draft);
const leer = heuristikAnlegen({champions: {}});
const merkmale = merkmaleAnlegen(quelle, leer);
const comp = compAnlegen(merkmale, leer);
const team = teamAnlegen(DATA.teams);
const bewerter = bewerterAnlegen({quelle, merkmale, comp, team, heuristik: leer});
const S = sucheAnlegen({quelle, merkmale, bewerter});

function zustand({unsere = [], ihre = [], bans = []} = {}) {
  const s = leererDraft({patch: quelle.patch, wirSind: "blue"});
  for (const c of bans) s.bans.red.push(c);
  for (const p of unsere) s.picks.blue.push({champ: p.champ, rolle: p.rolle});
  for (const p of ihre) s.picks.red.push({champ: p.champ, rolle: p.rolle});
  return s;
}

/* Eine Lage mit vier belegten Rollen je Seite - dann ist die Suche klein
   genug fuer schnelle Tests und trotzdem echt. */
const SPAET = zustand({
  unsere: [{champ: "Ornn", rolle: "TOP"}, {champ: "Lee Sin", rolle: "JUNGLE"},
           {champ: "Jinx", rolle: "BOTTOM"}],
  ihre: [{champ: "Jax", rolle: "TOP"}, {champ: "Wukong", rolle: "JUNGLE"},
         {champ: "Vladimir", rolle: "MIDDLE"}, {champ: "Lulu", rolle: "UTILITY"}],
});

test("der Gegnervorrat enthaelt nur offene Rollen und freie Champions", () => {
  const v = S.gegnerVorrat(SPAET);
  assert.ok(v.length > 0 && v.length <= SUCHE.gegnerVorrat);
  for (const k of v) {
    assert.equal(k.rolle, "BOTTOM", "nur ihre offene Rolle");
    assert.ok(!["Ornn", "Jax", "Jinx", "Thresh", "Lulu"].includes(k.champ),
              k.champ + " ist vergeben");
  }
  // Nach Punkten sortiert.
  for (let i = 1; i < v.length; i++) assert.ok(v[i - 1].score >= v[i].score);
});

test("Antworten sind eine Verteilung, keine Gewissheit", () => {
  const a = S.gegnerAntworten(SPAET, S.gegnerVorrat(SPAET));
  assert.ok(a.length > 1, "mehrere Antworten");
  assert.ok(a.length <= SUCHE.beiteGegner);
  const summe = a.reduce((n, x) => n + x.p, 0);
  assert.ok(summe > 0.5 && summe <= 1.0001, "Masse: " + summe);
  for (const x of a) {
    assert.ok(x.p >= SUCHE.mindestWahrscheinlichkeit);
    assert.ok(x.p < 1, "keine Antwort ist sicher");
  }
  // Die beste Antwort ist die wahrscheinlichste.
  assert.equal(a[0].p, Math.max(...a.map((x) => x.p)));
});

test("eine weichere Temperatur gleicht die Verteilung an", () => {
  const v = S.gegnerVorrat(SPAET);
  const hart = S.gegnerAntworten(SPAET, v, {temperatur: 2});
  const weich = S.gegnerAntworten(SPAET, v, {temperatur: 30});
  assert.ok(hart[0].p > weich[0].p,
            "hart " + hart[0].p.toFixed(2) + " vs weich " + weich[0].p.toFixed(2));
});

test("Lookahead liefert Erwartung, Spanne und Robustheit", () => {
  const l = S.lookahead(SPAET, "Ahri", "MIDDLE");
  assert.ok(l, "Lookahead vorhanden");
  assert.ok(l.ev > 0.3 && l.ev < 0.7, "Siegquote, nicht Punkte: " + l.ev);
  assert.ok(l.schlechtester <= l.ev && l.ev <= l.bester);
  assert.ok(l.spanne >= 0);
  assert.ok(["hoch", "mittel", "niedrig"].includes(l.robustheit));
  assert.ok(l.aeste.length > 1);
  for (const a of l.aeste) {
    assert.ok(a.erwiderung, "jede Antwort hat unsere Erwiderung");
    assert.ok(a.p > 0);
  }
  assert.ok(l.konfidenz < 0.5, "Schaetzung, keine Beobachtung");
});

test("das Risikoprofil verschiebt den Wert zwischen bester und schlechtester Lage", () => {
  const v = S.gegnerVorrat(SPAET);
  const sicher = S.lookahead(SPAET, "Ahri", "MIDDLE", {vorrat: v, risikoprofil: "sicher"});
  const mutig = S.lookahead(SPAET, "Ahri", "MIDDLE", {vorrat: v, risikoprofil: "aggressiv"});
  assert.equal(sicher.ev, mutig.ev, "die Erwartung selbst aendert sich nicht");
  if (sicher.bester > sicher.schlechtester) {
    assert.ok(sicher.roh < mutig.roh,
              "sicher gewichtet den schlechtesten Ausgang staerker");
  }
});

test("Robustheit unterscheidet stabile von schwankenden Picks", () => {
  const v = S.gegnerVorrat(SPAET);
  const mitte = merkmale.kandidaten("MIDDLE").slice(0, 25);
  const spannen = mitte
    .map((m) => S.lookahead(SPAET, m.champ, "MIDDLE", {vorrat: v}))
    .filter(Boolean)
    .map((l) => l.spanne);
  assert.ok(spannen.length > 5);
  const min = Math.min(...spannen), max = Math.max(...spannen);
  assert.ok(max > min, "die Spannen unterscheiden sich: " + min + " .. " + max);
});

test("ohne offene Rolle beim Gegner gibt es keinen Lookahead", () => {
  const voll = zustand({
    ihre: [{champ: "Jax", rolle: "TOP"}, {champ: "Wukong", rolle: "JUNGLE"},
           {champ: "Vladimir", rolle: "MIDDLE"}, {champ: "Sivir", rolle: "BOTTOM"},
           {champ: "Lulu", rolle: "UTILITY"}],
  });
  assert.deepEqual(S.gegnerVorrat(voll), []);
  assert.equal(S.lookahead(voll, "Ahri", "MIDDLE"), null);
});

test("die Rangliste traegt den Lookahead nur bei den aussichtsreichsten", () => {
  const liste = S.rangliste(SPAET, "MIDDLE");
  assert.ok(liste.length > SUCHE.beiteEigen);
  const mit = liste.filter((r) => r.lookahead);
  assert.ok(mit.length > 0 && mit.length <= SUCHE.beiteEigen,
            "mit Lookahead: " + mit.length);
  // Absteigend nach Entscheidungswert - der Note, zum Median geschrumpft,
  // je unsicherer sie ist. Die Note selbst bleibt daneben stehen.
  for (let i = 1; i < liste.length; i++) {
    assert.ok(liste[i - 1].entscheidung >= liste[i].entscheidung,
              "Reihenfolge bei " + i);
  }
  for (const r of liste) {
    assert.ok(Math.abs(r.entscheidung - r.median)
              <= Math.abs(r.score - r.median) + 0.05,
              "Schrumpfen zieht zur Mitte, nie weg davon: " + r.champion);
  }
  // Wer einen Lookahead hat, traegt ihn auch als Teil der Bewertung.
  assert.ok(mit[0].components.lookahead, "Lookahead ist ein Teil");
  assert.equal(mit[0].components.lookahead.quelle, "draftgap");
});

test("ohne Lookahead bleibt die Rangliste die reine Grundbewertung", () => {
  const ohne = S.rangliste(SPAET, "MIDDLE", {mitLookahead: false});
  assert.ok(ohne.every((r) => !r.lookahead));
  assert.ok(ohne.every((r) => !r.components.lookahead));
});

test("gesperrte Champions tauchen nirgends auf", () => {
  const s = zustand({
    unsere: [{champ: "Ornn", rolle: "TOP"}],
    ihre: [{champ: "Jax", rolle: "TOP"}],
    bans: ["Ahri", "Syndra"],
  });
  const liste = S.rangliste(s, "MIDDLE", {mitLookahead: false});
  const namen = new Set(liste.map((r) => r.champion));
  for (const c of ["Ahri", "Syndra", "Ornn", "Jax"]) {
    assert.ok(!namen.has(c), c + " darf nicht vorkommen");
  }
});

test("die Suche ist deterministisch", () => {
  const a = S.rangliste(SPAET, "MIDDLE");
  const b = S.rangliste(SPAET, "MIDDLE");
  assert.deepEqual(a.map((r) => [r.champion, r.score]),
                   b.map((r) => [r.champion, r.score]));
});

test("eine volle Rangliste bleibt unter 250 ms", () => {
  const t0 = performance.now();
  const liste = S.rangliste(SPAET, "MIDDLE",
                            {spielerTeam: "AFC1", spielerLabel: "Køstja"});
  const dt = performance.now() - t0;
  assert.ok(liste.length > 20);
  assert.ok(dt < 250, "gebraucht: " + dt.toFixed(0) + " ms");
});

test("die Aufschluesselung ergibt genau die Comp-Quote", () => {
  const x = S.compAufschluesselung(SPAET);
  assert.ok(Math.abs(x.quote - S.compQuote(SPAET)) < 1e-12, "dieselbe Rechnung");
  assert.equal(x.paare.length, 3 * 4, "jede Paarung einzeln");
  assert.ok(x.paare.some((p) => p.lane) && x.paare.some((p) => !p.lane));
  // Ornn (Top) gegen Jax (Top) ist Lane, Ornn gegen Lulu nicht.
  assert.equal(x.paare.find((p) => p.wir === "Ornn" && p.sie === "Jax").lane, true);
  assert.equal(x.paare.find((p) => p.wir === "Ornn" && p.sie === "Lulu").lane, false);
  // Jinx (ADC) gegen Lulu (Support) ist Botlane, also Lane.
  assert.equal(x.paare.find((p) => p.wir === "Jinx" && p.sie === "Lulu").lane, true);
  assert.ok(Math.abs(x.lane.anteil + x.rest.anteil - 1) < 1e-12);
});

test("die Referenz ordnet eine Quote gegen echte Drafts ein", async () => {
  const { ladePartien } = await import("./daten.mjs");
  const drafts = [];
  for (const p of ladePartien()) {
    const pk = (t) => (p.picks[t] || []).filter((x) => x.champ && x.role)
      .map((x) => ({champ: x.champ, rolle: x.role}));
    drafts.push({wir: pk(p.blue), sie: pk(p.red)}, {wir: pk(p.red), sie: pk(p.blue)});
  }
  const ref = S.compReferenz(drafts);
  assert.equal(ref.n, 136, "68 Partien aus beiden Sichten");
  assert.ok(ref.min > 0.45 && ref.max < 0.55, "Spanne " + ref.min + " - " + ref.max);
  // Aus beiden Sichten liegt die Verteilung symmetrisch um 50 %.
  assert.ok(Math.abs(ref.quoten[68] - 0.5) < 0.003, "Median " + ref.quoten[68]);
  assert.equal(S.compPerzentil(ref.max + 0.01, ref), 1);
  assert.equal(S.compPerzentil(ref.min - 0.01, ref), 0);
  assert.ok(ref.paarP5 < ref.p5 && ref.paarP95 > ref.p95,
            "einzelne Paarungen streuen weiter als der Schnitt aus 25");
});

test("der Massstab kommt aus dem Patch, nicht aus der Liga", () => {
  const ref = S.compReferenzGlobal();
  assert.equal(ref.n, 2000);
  assert.equal(ref.quelle, "draftgap");
  assert.ok(Math.abs(ref.quoten[1000] - 0.5) < 0.002, "Median " + ref.quoten[1000]);
  assert.ok(ref.p5 > 0.47 && ref.p95 < 0.53, ref.p5 + " .. " + ref.p95);
  assert.equal(S.compReferenzGlobal(), ref, "einmal gerechnet, dann gemerkt");
  // Deterministisch: eine zweite Suche auf denselben Daten zieht dasselbe.
  const S2 = sucheAnlegen({quelle, merkmale, bewerter});
  assert.deepEqual(S2.compReferenzGlobal().quoten.slice(0, 20), ref.quoten.slice(0, 20));
});
