import test from "node:test";
import assert from "node:assert/strict";
import { planGegenIst, imPlanAnteil } from "../engine/review.js";

const ROLLEN = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const PLAENE = {
  Mira: {blind: ["Ahri"], likes: ["Syndra"]},
  Kai: {blind: [], likes: []},
};
const planVon = (spieler) => PLAENE[spieler] || null;

const spiel = (mid, bot) => ({picks: [
  {role: "MIDDLE", champ: mid, player: "Mira"},
  {role: "BOTTOM", champ: bot, player: "Kai"},
]});

test("Status je Pick: blind, gerne, ausserhalb, ohne Plan", () => {
  const r = planGegenIst([spiel("Ahri", "Jinx"), spiel("Syndra", "Ezreal"), spiel("Zed", "Jinx")], planVon, ROLLEN);
  assert.deepEqual(r.zeilen.map((z) => z.picks[2].status), ["blind", "gerne", "ausserhalb"]);
  assert.deepEqual(r.zeilen.map((z) => z.picks[3].status), ["ohnePlan", "ohnePlan", "ohnePlan"]);
  assert.equal(r.zeilen[0].picks[0].champ, null, "fehlende Rolle bleibt leer, ohne Status");
  assert.equal(r.zeilen[0].picks[0].status, null);
});

test("Summen je Spieler und gesamt, Spieler in Rollenreihenfolge", () => {
  const r = planGegenIst([spiel("Ahri", "Jinx"), spiel("Syndra", "Ezreal"), spiel("Zed", "Jinx")], planVon, ROLLEN);
  assert.deepEqual(r.gesamt, {picks: 6, blind: 1, gerne: 1, ausserhalb: 1, ohnePlan: 3});
  assert.deepEqual(r.spieler.map((s) => [s.spieler, s.rolle, s.picks]), [["Mira", "MIDDLE", 3], ["Kai", "BOTTOM", 3]]);
});

test("Anteil im Plan nur ueber beurteilbare Picks", () => {
  const r = planGegenIst([spiel("Ahri", "Jinx"), spiel("Syndra", "Ezreal"), spiel("Zed", "Jinx")], planVon, ROLLEN);
  assert.equal(imPlanAnteil(r.spieler[0]), 2 / 3);
  assert.equal(imPlanAnteil(r.spieler[1]), null, "nur ohne Plan: kein Anteil statt 0 %");
});

test("keine Partien", () => {
  const r = planGegenIst([], planVon, ROLLEN);
  assert.deepEqual(r, {zeilen: [], spieler: [], gesamt: {picks: 0, blind: 0, gerne: 0, ausserhalb: 0, ohnePlan: 0}});
});
