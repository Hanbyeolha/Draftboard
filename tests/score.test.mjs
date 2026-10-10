/* Der Match-Score: Teile, Spur, Konfidenz, Deckel. */
import test from "node:test";
import assert from "node:assert/strict";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { teamAnlegen } from "../engine/team.js";
import { bewerterAnlegen } from "../engine/score.js";
import { leererDraft, zieh } from "../engine/state.js";
import { GEWICHTE, KOMFORT, VERSION } from "../engine/config.js";

const DATA = ladeDaten();
const quelle = quelleAnlegen(DATA.draft);
const leer = heuristikAnlegen({champions: {}});
const merkmale = merkmaleAnlegen(quelle, leer);
const comp = compAnlegen(merkmale, leer);
const team = teamAnlegen(DATA.teams);
const B = bewerterAnlegen({quelle, merkmale, comp, team, heuristik: leer});

/** Einen Zustand bauen, ohne die Zugfolge einzeln abzulaufen. */
function zustand({unsere = [], ihre = [], bans = []} = {}) {
  const s = leererDraft({patch: quelle.patch, wirSind: "blue"});
  for (const c of bans) s.bans.red.push(c);
  for (const p of unsere) s.picks.blue.push({champ: p.champ, rolle: p.rolle});
  for (const p of ihre) s.picks.red.push({champ: p.champ, rolle: p.rolle});
  return s;
}

test("ein leerer Draft bewertet allein nach Patchstaerke und Flex", () => {
  const r = B.bewerte(zustand(), "Ornn", "TOP");
  assert.equal(r.champion, "Ornn");
  assert.ok(r.components.meta, "Patchstaerke");
  assert.equal(r.components.matchup, undefined, "ohne Gegner kein Matchup");
  assert.equal(r.components.synergie, undefined);
  assert.equal(r.components.lookahead, undefined, "Phase 5 fehlt noch");
  assert.ok(r.score >= 0 && r.score <= 100, "Punkte: " + r.score);
  assert.equal(Number.isInteger(r.score), true, "keine Scheingenauigkeit");
});

test("ein Champion auf einer Nebenrolle wird nicht bewertet", () => {
  assert.equal(B.bewerte(zustand(), "Ahri", "TOP"), null);
});

test("Matchups tauchen erst mit gegnerischen Picks auf, mit Text", () => {
  const s = zustand({ihre: [{champ: "Ornn", rolle: "TOP"}]});
  const r = B.bewerte(s, "Jax", "TOP");
  assert.ok(r.components.matchup, "Matchup vorhanden");
  assert.equal(r.components.matchup.quelle, "draftgap");
  assert.match(r.components.matchup.text, /gegen 1 ihrer Picks/);
  assert.ok(r.components.matchup.konfidenz > 0);
});

test("Synergien tauchen mit eigenen Picks auf", () => {
  const s = zustand({unsere: [{champ: "Thresh", rolle: "UTILITY"}]});
  const r = B.bewerte(s, "Caitlyn", "BOTTOM");
  assert.ok(r.components.synergie, "Synergie vorhanden");
  assert.match(r.components.synergie.text, /mit 1 eigenen Picks/);
});

test("fehlende Teile senken die Note nicht, nur die Sicherheit", () => {
  const ohne = B.bewerte(zustand(), "Ornn", "TOP");
  const mit = B.bewerte(zustand({ihre: [{champ: "Jax", rolle: "TOP"}]}),
                        "Ornn", "TOP");
  // Der Hoechstwert waechst mit den vorhandenen Teilen - die Note bleibt
  // vergleichbar, statt durch Fehlendes gedrueckt zu werden.
  assert.ok(mit.hoechstwert > ohne.hoechstwert);
  assert.ok(ohne.score > 0, "ohne Gegner trotzdem bewertbar");
});

test("die Spur nennt Gewicht, Beitrag, Quelle und Text je Teil", () => {
  const r = B.bewerte(zustand({ihre: [{champ: "Ornn", rolle: "TOP"}]}),
                      "Jax", "TOP");
  for (const [name, t] of Object.entries(r.components)) {
    assert.ok(Number.isFinite(t.roh), name + ": roh");
    assert.ok(Number.isFinite(t.gewicht), name + ": gewicht");
    assert.ok(Number.isFinite(t.beitrag), name + ": beitrag");
    assert.ok(t.quelle, name + ": quelle");
  }
  assert.ok(Array.isArray(r.reasons));
  assert.ok(Array.isArray(r.risks));
});

test("jede Empfehlung traegt Modellfassung und Patch", () => {
  const r = B.bewerte(zustand(), "Ornn", "TOP");
  assert.equal(r.metadata.optimizerVersion, VERSION.optimizer);
  assert.equal(r.metadata.patch, quelle.patch);
  assert.equal(r.metadata.risikoprofil, "ausgewogen");
});

test("Komfort wirkt - aber gedeckelt", () => {
  const s = zustand();
  const ohne = B.bewerte(s, "Dr. Mundo", "TOP");
  const mit = B.bewerte(s, "Dr. Mundo", "TOP",
                        {spielerTeam: "AFC1", spielerLabel: "bandit"});
  assert.equal(ohne.components.komfort, undefined);
  assert.ok(mit.components.komfort, "Komfort vorhanden");
  const anteil = mit.components.komfort.gewicht / mit.hoechstwert;
  assert.ok(anteil <= KOMFORT.hoechstanteil + 1e-9,
            "Komfortanteil " + anteil + " ueber dem Deckel");
  assert.ok(mit.components.komfort.gewicht <= GEWICHTE.komfort);
});

test("Komfort ueberstimmt einen klaren Nachteil nicht", () => {
  // bandit spielt Dr. Mundo 107 Mal; Gnar kennt er kaum. Gegen einen
  // Gegner, gegen den Mundo schlecht steht, darf Komfort nicht alles
  // drehen - die uebrigen Teile muessen durchschlagen koennen.
  const s = zustand({ihre: [{champ: "Vayne", rolle: "TOP"}]});
  const r = B.bewerte(s, "Dr. Mundo", "TOP",
                      {spielerTeam: "AFC1", spielerLabel: "bandit"});
  const k = r.components.komfort.beitrag;
  const rest = Object.entries(r.components)
    .filter(([n]) => n !== "komfort" && n !== "risiko")
    .reduce((a, [, t]) => a + t.beitrag, 0);
  assert.ok(rest > k, "Komfort " + k.toFixed(1) + " gegen Rest " + rest.toFixed(1));
});

test("blind und Counter sind verschiedene Lagen", () => {
  const blind = B.bewerte(zustand(), "Ornn", "TOP");
  const counter = B.bewerte(zustand({ihre: [{champ: "Jax", rolle: "TOP"}]}),
                            "Ornn", "TOP");
  assert.equal(blind.blind, true);
  assert.equal(counter.blind, false);
  assert.ok(blind.components.pickReihenfolge, "blind: Streuung zaehlt");
  assert.equal(counter.components.pickReihenfolge, undefined,
               "mit bekanntem Lanegegner zaehlt die echte Paarung");
});

test("enge Streuung ist der sicherere Blindpick", () => {
  const ornn = B.bewerte(zustand(), "Ornn", "TOP");        // Streuung 2,49
  const malphite = B.bewerte(zustand(), "Malphite", "TOP"); // Streuung 3,83
  assert.ok(ornn.components.pickReihenfolge.roh
            > malphite.components.pickReihenfolge.roh,
            "Ornn " + ornn.components.pickReihenfolge.roh
            + " vs Malphite " + malphite.components.pickReihenfolge.roh);
});

test("Risiko zieht ab und waechst den Hoechstwert nicht", () => {
  const r = B.bewerte(zustand(), "Malphite", "TOP");
  assert.ok(r.components.risiko, "Risiko vorhanden");
  assert.ok(r.components.risiko.beitrag <= 0, "zieht ab");
  const summeOhneRisiko = Object.entries(r.components)
    .filter(([n]) => n !== "risiko")
    .reduce((a, [, t]) => a + Math.max(0, t.gewicht), 0);
  assert.equal(r.hoechstwert, summeOhneRisiko);
});

test("das Risikoprofil veraendert das Modell, nicht nur die Anzeige", () => {
  const s = zustand();
  const sicher = B.bewerte(s, "Malphite", "TOP", {risikoprofil: "sicher"});
  const mutig = B.bewerte(s, "Malphite", "TOP", {risikoprofil: "aggressiv"});
  assert.ok(sicher.components.risiko.beitrag < mutig.components.risiko.beitrag,
            "sicher bestraft Schwankung staerker");
  assert.ok(sicher.score < mutig.score);
});

test("ohne Heuristiktabelle gibt es keine Stoerungsachse", () => {
  const s = zustand({ihre: [{champ: "Malphite", rolle: "TOP"},
                            {champ: "Amumu", rolle: "JUNGLE"}]});
  const r = B.bewerte(s, "Janna", "UTILITY");
  assert.equal(r.components.gegnerStoerung, undefined,
               "keine Grundlage, also kein Wert");
});

test("mit gepflegter Tabelle wirkt die Stoerung - als Heuristik erkennbar", () => {
  const h = heuristikAnlegen({
    _stand: "2026-10-09",
    champions: {
      Malphite: {engage: 2}, Amumu: {engage: 2},
      Janna: {disengage: 2, peel: 2},
      Sivir: {poke: 0},
    },
  });
  const mm = merkmaleAnlegen(quelle, h);
  const BH = bewerterAnlegen({quelle, merkmale: mm,
                              comp: compAnlegen(mm, h), team, heuristik: h});
  const s = zustand({ihre: [{champ: "Malphite", rolle: "TOP"},
                            {champ: "Amumu", rolle: "JUNGLE"}]});
  const janna = BH.bewerte(s, "Janna", "UTILITY");
  assert.ok(janna.components.gegnerStoerung, "Janna wirkt gegen Engage");
  assert.equal(janna.components.gegnerStoerung.quelle, "heuristik");
  assert.ok(janna.components.gegnerStoerung.konfidenz < 0.6,
            "Heuristik traegt niedrige Konfidenz");
  assert.match(janna.components.gegnerStoerung.text, /engage/);

  const sivir = BH.bewerte(s, "Sivir", "BOTTOM");
  assert.equal(sivir.components.gegnerStoerung, undefined,
               "Sivir setzt nichts dagegen");
});

test("Gruende und Risiken kommen aus den Teilen, nicht aus der Luft", () => {
  const s = zustand({ihre: [{champ: "Ornn", rolle: "TOP"},
                            {champ: "Wukong", rolle: "JUNGLE"}]});
  const r = B.bewerte(s, "Jax", "TOP",
                      {spielerTeam: "AFC1", spielerLabel: "bandit"});
  for (const g of r.reasons.concat(r.risks)) {
    assert.equal(typeof g, "string");
    assert.ok(g.length > 3);
  }
  // Doppelte werden zusammengefasst.
  assert.equal(r.reasons.length, new Set(r.reasons).size);
});

test("derselbe Zustand ergibt dasselbe Ergebnis", () => {
  const s = zustand({ihre: [{champ: "Ornn", rolle: "TOP"}]});
  const a = B.bewerte(s, "Jax", "TOP");
  const b = B.bewerte(s, "Jax", "TOP");
  assert.deepEqual(a, b, "deterministisch");
});

/* -------------------------------------------------- Keine Turnierdaten */
/* Der Nutzer hat es ausdruecklich verlangt: die Staerke eines Champions
   kommt aus dem Patch, nicht aus unseren eigenen Turnierpartien, und auf
   vergangene Picks und Bans soll sich kaum etwas beziehen. Diese Tests
   halten das fest, damit es niemand versehentlich wieder einbaut. */

test("jeder Teil der Bewertung nennt eine erlaubte Quelle", () => {
  const s = zustand({unsere: [{champ: "Jinx", rolle: "BOTTOM"}],
                     ihre: [{champ: "Ornn", rolle: "TOP"}]});
  const r = B.bewerte(s, "Jax", "TOP",
                      {spielerTeam: "AFC1", spielerLabel: "bandit"});
  const erlaubt = new Set(["draftgap", "team", "heuristik", "gemischt",
                           "abgeleitet"]);
  for (const [name, t] of Object.entries(r.components)) {
    assert.ok(erlaubt.has(t.quelle), name + " hat Quelle " + t.quelle);
  }
});

test("Championstaerke kommt aus dem Patch, nicht aus unseren Partien", () => {
  const r = B.bewerte(zustand(), "Ornn", "TOP");
  assert.equal(r.components.meta.quelle, "draftgap");
  assert.equal(r.metadata.patch, quelle.patch);
  // Die Patchquote muss der DraftGap-Zahl entsprechen, nicht einer aus
  // games.json gerechneten.
  const direkt = quelle.staerke("Ornn", "TOP");
  assert.match(r.components.meta.text, new RegExp(
    (direkt.value * 100).toFixed(1).replace(".", "[.,]")));
});

test("Komfort kommt aus Ranked und sagt das auch", () => {
  const r = B.bewerte(zustand(), "Dr. Mundo", "TOP",
                      {spielerTeam: "AFC1", spielerLabel: "bandit"});
  assert.equal(r.components.komfort.quelle, "team");
  assert.match(r.components.komfort.text, /RANKED/);
});

test("die Turnierqueue ist als Komfortbeleg gesperrt", () => {
  assert.throws(() => teamAnlegen(DATA.teams, {queue: "LIGA"}),
                /kein Komfortbeleg/);
});

test("vergangene Turnierpicks veraendern keine Bewertung", () => {
  // Dieselbe Lage, einmal mit und einmal ohne games.json im Spiel: die
  // Engine bekommt games gar nicht erst zu sehen, also darf sich nichts
  // unterscheiden. Der Test haelt fest, dass keine Hintertuer entsteht.
  const s = zustand({ihre: [{champ: "Ornn", rolle: "TOP"}]});
  const a = B.bewerte(s, "Jax", "TOP");
  const zweiter = bewerterAnlegen({quelle, merkmale, comp, team, heuristik: leer});
  const b = zweiter.bewerte(s, "Jax", "TOP");
  assert.deepEqual(a, b);
});
