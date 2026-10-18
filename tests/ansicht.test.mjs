/* Das Ansichtsmodell einer Empfehlung (Draftboard 2.0, Phase 1): eine
   strukturierte Sicht fuer das Cockpit, ohne eigene Rechnung. */
import test from "node:test";
import assert from "node:assert/strict";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { teamAnlegen } from "../engine/team.js";
import { bewerterAnlegen, teilGruppen, teilWert, SCORE_GRUPPEN } from "../engine/score.js";
import { empfehlungAnsicht, winraten, konter } from "../engine/ansicht.js";
import { leererDraft } from "../engine/state.js";

const DATA = ladeDaten();
const quelle = quelleAnlegen(DATA.draft);
const h = heuristikAnlegen({champions: {}});
const merkmale = merkmaleAnlegen(quelle, h);
const team = teamAnlegen(DATA.teams);
const B = bewerterAnlegen({quelle, merkmale, comp: compAnlegen(merkmale, h), team, heuristik: h});
const top = team.aufRolle("AFC1", "TOP");
const opt = {spielerTeam: "AFC1", spielerLabel: top.label};

function lage(ihre = []) {
  const s = leererDraft({patch: quelle.patch});
  s.picks.blue.push({champ: "Lee Sin", rolle: "JUNGLE"});
  for (const [c, r] of ihre) s.picks.red.push({champ: c, rolle: r});
  return s;
}

/** Die Mittelung, wie teilGruppen sie bis Phase 1 selbst rechnete. */
function alteGruppe(r, teile) {
  let b = 0, w = 0;
  for (const t of teile) {
    const x = r.components[t];
    if (!x || x.gewicht <= 0) continue;
    b += x.roh * x.gewicht; w += x.gewicht;
  }
  return w ? Math.round(100 * b / w) : null;
}

test("teilGruppen rechnet nach dem Herausziehen von teilWert wie vorher", () => {
  for (const s of [lage(), lage([["Jax", "TOP"], ["Viego", "JUNGLE"]])]) {
    for (const champ of ["Ornn", "Malphite", "Gnar", "Jayce"]) {
      const r = B.bewerte(s, champ, "TOP", opt);
      if (!r) continue;
      const g = teilGruppen(r);
      for (const [name, def] of Object.entries(SCORE_GRUPPEN)) {
        assert.equal(g[name], alteGruppe(r, def.teile), champ + "/" + name);
        assert.equal(teilWert(r, def.teile), g[name]);
      }
    }
  }
});

test("die Ansicht traegt Note, Gruende und Werte - ohne eigene Rechnung", () => {
  const r = B.bewerte(lage([["Jax", "TOP"], ["Viego", "JUNGLE"]]), "Ornn", "TOP", opt);
  const a = empfehlungAnsicht(r, {plan: "blind", pool: true});
  assert.equal(a.champion, "Ornn");
  assert.equal(a.rolle, "TOP");
  assert.equal(a.score, r.score);
  assert.equal(a.entscheidung, r.entscheidung ?? null);
  assert.equal(a.gruende, r.reasons, "dieselben Gruende, nicht neu formuliert");
  assert.equal(a.risiken, r.risks);
  assert.equal(a.plan, "blind");
  assert.equal(a.pool, true);
  assert.equal(a.werte.spieler, teilWert(r, ["komfort"]));
  assert.equal(a.werte.matchup, teilWert(r, ["lane", "matchup", "blindSicherheit"]));
  assert.equal(a.werte.comp, teilWert(r, ["synergie", "compFit"]));
  assert.equal(a.werte.meta, teilWert(r, ["meta"]));
  for (const v of Object.values(a.werte)) {
    assert.ok(v === null || (Number.isInteger(v) && v >= 0 && v <= 100), "0..100 oder null: " + v);
  }
  assert.deepEqual(a.gruppen, teilGruppen(r));
});

test("fehlt ein Teil, ist der Wert null - nicht 0", () => {
  const r = B.bewerte(lage(), "Ornn", "TOP");      // ohne Spieler: kein Komfort
  const a = empfehlungAnsicht(r);
  assert.equal(r.components.komfort, undefined);
  assert.equal(a.werte.spieler, null);
  assert.equal(a.plan, null);
  assert.equal(a.pool, null);
});

test("Winraten: allgemein und je gepicktem Gegner, roh aus DraftGap, Lane zuerst", () => {
  const z = leererDraft({patch: quelle.patch});
  z.picks.red.push({champ: "Lee Sin", rolle: "JUNGLE"}, {champ: "Syndra", rolle: "MIDDLE"});
  const w = winraten(quelle, z, "Ahri", "MIDDLE");
  assert.deepEqual(w.allgemein, quelle.staerke("Ahri", "MIDDLE"), "allgemein = Patchstaerke, unveraendert");
  assert.ok(w.allgemein.value > 0.3 && w.allgemein.value < 0.7 && w.allgemein.sampleSize > 0);
  assert.deepEqual(w.matchups.map((m) => [m.gegner, m.lane]), [["Syndra", true], ["Lee Sin", false]],
                   "Lanegegner zuerst, dann die uebrigen");
  assert.deepEqual(w.matchups[0].wert, quelle.matchup("Ahri", "MIDDLE", "Syndra", "MIDDLE"));
  assert.equal(w.matchups[0].schnitt, 1 - quelle.paarMittel("Syndra", "MIDDLE", "m").value,
               "Schnitt gegen Syndra = dieselbe Erwartung wie 'sonst' in der Begruendung");
  // Unsere eigenen Picks sind keine Matchups.
  z.picks.blue.push({champ: "Thresh", rolle: "UTILITY"});
  assert.equal(winraten(quelle, z, "Ahri", "MIDDLE").matchups.length, 2);
  // Ohne Gegnerpick: keine Matchups. Nebenrolle: keine allgemeine Winrate.
  assert.deepEqual(winraten(quelle, leererDraft({patch: quelle.patch}), "Ahri", "MIDDLE").matchups, []);
  assert.equal(winraten(quelle, z, "Ahri", "TOP").allgemein, null);
  // Mit unseren Picks: Duo-Winrate je Mitspieler, Schnitt wie "sonst" in der Begruendung.
  const m = winraten(quelle, z, "Ahri", "MIDDLE").mit;
  assert.deepEqual(m.map((x) => x.partner), ["Thresh"]);
  assert.deepEqual(m[0].wert, quelle.synergie("Ahri", "MIDDLE", "Thresh", "UTILITY"));
  assert.equal(m[0].schnitt, quelle.paarMittel("Thresh", "UTILITY", "s").value);
});

test("Konter gegen einen Lanegegner: nur Champions der Rolle, nach bereinigter Quote", () => {
  const k = konter(quelle, "Syndra", "MIDDLE", "MIDDLE", {max: 15});
  assert.equal(k.length, 15);
  assert.ok(k.every((x) => x.champ !== "Syndra" && quelle.staerke(x.champ, "MIDDLE")), "nur echte Midlaner, nicht Syndra selbst");
  for (let i = 1; i < k.length; i++) assert.ok(k[i - 1].bereinigt >= k[i].bereinigt, "absteigend bereinigt");
  assert.equal(k[0].schnitt, 1 - quelle.paarMittel("Syndra", "MIDDLE", "m").value);
  assert.deepEqual(k[0].wert, quelle.matchup(k[0].champ, "MIDDLE", "Syndra", "MIDDLE"), "angezeigt wird die gemessene Quote");
  // Bereinigung zieht zum Schnitt: nie weiter weg als die gemessene Quote.
  assert.ok(k.every((x) => Math.abs(x.bereinigt - x.schnitt) <= Math.abs(x.wert.value - x.schnitt) + 1e-12));
});
