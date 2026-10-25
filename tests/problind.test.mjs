/* Pro-Blindquote in der Note (22.10.2026): nur beim Blind Pick, zur Mitte
   geschrumpft, mit Grund bzw. Risiko im Text. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { teamAnlegen } from "../engine/team.js";
import { bewerterAnlegen } from "../engine/score.js";
import { leererDraft } from "../engine/state.js";
import { PRO_BLIND } from "../engine/config.js";

const D = ladeDaten();
const quelle = quelleAnlegen(D.draft);
const h = heuristikAnlegen(JSON.parse(readFileSync(new URL("../data/champion-heuristik.json", import.meta.url), "utf8")));
const merkmale = merkmaleAnlegen(quelle, h);
// Kleine feste Pro-Daten statt der echten Datei - der Test haengt nicht am Stand.
const pro = {champions: {Jinx: {BOTTOM: {picks: 20, blind: 2, siege: 10, blindSiege: 1}},
                         Ezreal: {BOTTOM: {picks: 20, blind: 18, siege: 10, blindSiege: 9}}}};
const b = bewerterAnlegen({quelle, merkmale, comp: compAnlegen(merkmale, h), team: teamAnlegen(D.teams), heuristik: h, pro});

test("blind: Pro-Blindquote zaehlt, geschrumpft, mit Text", () => {
  const z = leererDraft({patch: quelle.patch, wirSind: "blue"});
  const j = b.bewerte(z, "Jinx", "BOTTOM", {schnell: true}), e = b.bewerte(z, "Ezreal", "BOTTOM", {schnell: true});
  const erwartet = (2 + PRO_BLIND.mitte * PRO_BLIND.schrumpf) / (20 + PRO_BLIND.schrumpf);
  assert.ok(Math.abs(j.components.proBlind.roh - erwartet) < 1e-9);
  assert.ok(e.components.proBlind.roh > j.components.proBlind.roh);
  assert.ok(j.risks.some((t) => t.includes("in Pro selten blind gepickt (2 von 20)")));
  assert.ok(e.reasons.some((t) => t.includes("in Pro oft blind gepickt (18 von 20)")));
  const unbekannt = b.bewerte(z, "Kog'Maw", "BOTTOM", {schnell: true});
  assert.equal(unbekannt.components.proBlind.roh, PRO_BLIND.mitte, "nie in Pro gepickt: neutral");
});

test("counter: Lanegegner stehen fest - keine Pro-Blindquote", () => {
  const z = leererDraft({patch: quelle.patch, wirSind: "blue"});
  z.picks.red.push({champ: "Sivir", rolle: "BOTTOM"}, {champ: "Lulu", rolle: "UTILITY"});
  assert.equal(b.bewerte(z, "Jinx", "BOTTOM", {schnell: true}).components.proBlind, undefined);
});
