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
import { empfehlungAnsicht } from "../engine/ansicht.js";
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
