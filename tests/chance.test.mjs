/* Draft-Vorteil laut Patchdaten (engine/chance.js). */
import test from "node:test";
import assert from "node:assert/strict";
import { ladeDaten, ladePartien } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { leererDraft } from "../engine/state.js";
import { draftChance, chanceMitPick, treffer, laneAnalyse } from "../engine/chance.js";

const quelle = quelleAnlegen(ladeDaten().draft);
const lage = (wir = [], sie = []) => {
  const z = leererDraft({patch: quelle.patch});
  for (const [champ, rolle] of wir) z.picks.blue.push({champ, rolle});
  for (const [champ, rolle] of sie) z.picks.red.push({champ, rolle});
  return z;
};

test("leerer Draft: 50 %, nichts gezaehlt", () => {
  const c = draftChance(quelle, lage());
  assert.equal(c.chance, 0.5);
  assert.equal(c.punkte, 0);
  assert.equal(c.leer, true);
});

test("ein eigener Pick allein: genau seine Patch-Winrate", () => {
  const c = draftChance(quelle, lage([["Ahri", "MIDDLE"]]));
  assert.ok(Math.abs(c.chance - quelle.staerke("Ahri", "MIDDLE").value) < 1e-12);
  assert.deepEqual(c.gezaehlt, {champions: 1, matchups: 0, synergien: 0});
});

test("Seiten tauschen spiegelt den Wert", () => {
  const wir = [["Ahri", "MIDDLE"], ["Thresh", "UTILITY"], ["Jinx", "BOTTOM"]];
  const sie = [["Syndra", "MIDDLE"], ["Lee Sin", "JUNGLE"]];
  const a = draftChance(quelle, lage(wir, sie));
  const b = draftChance(quelle, lage(sie, wir));
  assert.ok(Math.abs(a.chance + b.chance - 1) < 1e-12);
  assert.ok(a.gezaehlt.matchups === 6 && a.gezaehlt.synergien === 4);
});

test("Teile ergeben zusammen genau die Punkte", () => {
  const c = draftChance(quelle, lage([["Ahri", "MIDDLE"], ["Thresh", "UTILITY"]], [["Syndra", "MIDDLE"]]));
  const summe = c.teile.champions + c.teile.matchups + c.teile.synergien;
  assert.ok(Math.abs(summe - c.punkte) < 1e-9);
});

test("chanceMitPick = Lage mit diesem Pick", () => {
  const z = lage([["Thresh", "UTILITY"]], [["Syndra", "MIDDLE"]]);
  const m = chanceMitPick(quelle, z, "Ahri", "MIDDLE");
  const d = draftChance(quelle, lage([["Thresh", "UTILITY"], ["Ahri", "MIDDLE"]], [["Syndra", "MIDDLE"]]));
  assert.equal(m.chance, d.chance);
  assert.equal(z.picks.blue.length, 1, "die Lage selbst bleibt unveraendert");
});

test("Trefferquote an den Turnierspielen: nur volle Aufstellungen, ehrliche Zaehlung", () => {
  const partien = ladePartien()
    .filter((g) => g.winner && g.picks && Object.keys(g.picks).length === 2)
    .map((g) => {
      const [a, b] = Object.keys(g.picks);
      const auf = (l) => l.map((p) => ({champ: p.champ, rolle: p.role}));
      return {a: auf(g.picks[a]), b: auf(g.picks[b]), aGewinnt: g.winner === a};
    });
  const t = treffer(quelle, partien);
  const voll = partien.filter((s) => s.a.length === 5 && s.b.length === 5).length;
  assert.ok(t.n > 0 && t.n <= voll);
  assert.ok(t.richtig >= 0 && t.richtig <= t.n);
  assert.ok(t.brier > 0 && t.brier < 1);
  assert.deepEqual(treffer(quelle, [{a: [], b: [], aGewinnt: true}]), {richtig: 0, n: 0, brier: null});
});

test("Lane-Analyse Bot: gegen ADC und Support, mit unserem Support, Chance je Kandidat", () => {
  const z = lage([["Thresh", "UTILITY"]], [["Jinx", "BOTTOM"], ["Lulu", "UTILITY"], ["Syndra", "MIDDLE"]]);
  const a = laneAnalyse(quelle, z, "BOTTOM");
  assert.deepEqual(a.gegner.map((g) => g.champ), ["Jinx", "Lulu"], "nur die Bot-Lane, nicht Syndra");
  assert.deepEqual(a.partner.map((p) => p.champ), ["Thresh"]);
  assert.equal(a.partner[0].schnitt, quelle.paarMittel("Thresh", "UTILITY", "s").value);
  assert.equal(a.gegner[0].schnitt, 1 - quelle.paarMittel("Jinx", "BOTTOM", "m").value);
  const kaisa = a.zeilen.find((x) => x.champ === "Kai'Sa");
  assert.ok(kaisa, "Kai'Sa spielt Bot");
  assert.deepEqual(kaisa.gegen[0], quelle.matchup("Kai'Sa", "BOTTOM", "Jinx", "BOTTOM"));
  assert.deepEqual(kaisa.mit[0], quelle.synergie("Kai'Sa", "BOTTOM", "Thresh", "UTILITY"));
  assert.equal(kaisa.chance, chanceMitPick(quelle, z, "Kai'Sa", "BOTTOM").chance);
  assert.ok(a.zeilen.every((x) => quelle.staerke(x.champ, "BOTTOM")), "nur Champions der Rolle");
  // Bereinigt liegt nie weiter vom Schnitt weg als gemessen.
  for (const x of a.zeilen) {
    x.gegen.forEach((w, i) => { if (w) assert.ok(Math.abs(x.gegenBereinigt[i] - a.gegner[i].schnitt) <= Math.abs(w.value - a.gegner[i].schnitt) + 1e-12); });
  }
  // Mid hat keinen Lanepartner.
  assert.deepEqual(laneAnalyse(quelle, z, "MIDDLE").partner, []);
});
