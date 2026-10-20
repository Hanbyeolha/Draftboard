/* Komfort gegen einen klar schwachen Lanegegner (20.10.2026, Wunsch des
   Nutzers): viel gespielt heisst nicht gut in jedem Matchup. Mit echten
   Daten, aber ohne feste Namen - gesucht wird der Lieblingschampion eines
   Spielers und je ein Lanegegner, gegen den er klar schwach bzw. gut steht. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { teamAnlegen } from "../engine/team.js";
import { bewerterAnlegen, BEGRUENDUNG } from "../engine/score.js";
import { leererDraft } from "../engine/state.js";
import { KOMFORT } from "../engine/config.js";

const D = ladeDaten();
const quelle = quelleAnlegen(D.draft);
const h = heuristikAnlegen(JSON.parse(readFileSync(new URL("../data/champion-heuristik.json", import.meta.url), "utf8")));
const merkmale = merkmaleAnlegen(quelle, h);
const team = teamAnlegen(D.teams);
const bewerter = bewerterAnlegen({quelle, merkmale, comp: compAnlegen(merkmale, h), team, heuristik: h});

// Ein Spieler mit vollem Komfort auf einem Champion seiner Rolle.
const fall = (() => {
  for (const t of D.teams) {
    for (const p of t.players || []) {
      const rolle = p.role;
      for (const c of quelle.champions) {
        const k = team.komfort(t.team, p.label, c);
        if (k && k.value >= 0.95 && quelle.staerke(c, rolle)) return {t: t.team, label: p.label, rolle, champ: c};
      }
    }
  }
  return null;
})();

const bewerte = (gegner) => {
  const z = leererDraft({patch: quelle.patch, wirSind: "blue"});
  z.picks.red.push({champ: gegner, rolle: fall.rolle});
  return bewerter.bewerte(z, fall.champ, fall.rolle, {spielerTeam: fall.t, spielerLabel: fall.label, schnell: true});
};

test("Komfort zaehlt gegen einen klar schwachen Lanegegner nicht als Bonus", () => {
  assert.ok(fall, "ein Spieler mit vollem Komfort");
  const kandidaten = quelle.champions.filter((g) => g !== fall.champ && quelle.staerke(g, fall.rolle));
  const bewertet = kandidaten.map((g) => ({g, r: bewerte(g)}))
    .filter((x) => x.r && x.r.components.lane && x.r.components.lane.vorteil !== undefined);
  const schwach = bewertet.find((x) => x.r.components.lane.vorteil <= -BEGRUENDUNG.matchup);
  const gut = bewertet.find((x) => x.r.components.lane.vorteil >= 0);
  assert.ok(schwach && gut, "es gibt beide Lanegegner");
  assert.equal(schwach.r.components.komfort.roh, KOMFORT.mitte, "klar schwach: Bonus faellt weg");
  assert.ok(schwach.r.risks.some((t) => t.includes("Komfort zählt nur")), "und die Begruendung sagt es");
  assert.ok(gut.r.components.komfort.roh > 0.9, "gute Lane: voller Komfort");
  assert.ok(!gut.r.risks.some((t) => t.includes("Komfort zählt nur")));
});

test("ohne Lanegegner bleibt der Komfort, wie er ist", () => {
  const z = leererDraft({patch: quelle.patch, wirSind: "blue"});
  const r = bewerter.bewerte(z, fall.champ, fall.rolle, {spielerTeam: fall.t, spielerLabel: fall.label, schnell: true});
  assert.ok(r.components.komfort.roh > 0.9);
});
