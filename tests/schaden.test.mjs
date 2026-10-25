/* Schadensmischung einer Aufstellung nach Schaden je Partie (22.10.2026):
   ein Support zaehlt so viel, wie er Schaden macht - nicht pro Kopf. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";

const quelle = quelleAnlegen(ladeDaten().draft);
const h = heuristikAnlegen(JSON.parse(readFileSync(new URL("../data/champion-heuristik.json", import.meta.url), "utf8")));
const comp = compAnlegen(merkmaleAnlegen(quelle, h), h);
const auf = (xs) => xs.map(([champ, rolle]) => ({champ, rolle}));

test("Schaden je Partie ist eingebettet", () => {
  const leona = quelle.schaden("Leona", "UTILITY"), viktor = quelle.schaden("Viktor", "MIDDLE");
  assert.ok(leona.menge > 0 && viktor.menge > leona.menge, "Viktor macht mehr Schaden als Leona");
});

test("Aufstellung: nach Schaden gewichtet, nicht pro Kopf", () => {
  const picks = auf([["Mordekaiser", "TOP"], ["Pantheon", "JUNGLE"], ["Viktor", "MIDDLE"], ["Swain", "BOTTOM"], ["Leona", "UTILITY"]]);
  const s = picks.map((p) => quelle.schaden(p.champ, p.rolle));
  const proKopf = s.reduce((a, w) => a + w.value, 0) / s.length;
  const gewichtet = s.reduce((a, w) => a + w.value * w.menge, 0) / s.reduce((a, w) => a + w.menge, 0);
  const m = comp.profil(picks).schaden.magisch.value;
  assert.ok(Math.abs(m - gewichtet) < 1e-12 && Math.abs(m - proKopf) > 0.01);
});
