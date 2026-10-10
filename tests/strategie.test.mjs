/* Das Lagebild: Bedarf, Gefahr, Siegbedingung, Rollenfolge. */
import test from "node:test";
import assert from "node:assert/strict";
import { welt } from "./synthetisch.mjs";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { blindAnlegen } from "../engine/blind.js";
import { strategieAnlegen } from "../engine/strategie.js";
import { leererDraft } from "../engine/state.js";

function aufbau(roh, tabelle) {
  const quelle = quelleAnlegen(roh);
  const h = heuristikAnlegen({champions: tabelle});
  const merkmale = merkmaleAnlegen(quelle, h);
  const comp = compAnlegen(merkmale, h);
  const blind = blindAnlegen({quelle});
  return strategieAnlegen({quelle, merkmale, comp, heuristik: h, blind});
}

function lage(unsere = [], ihre = [], patch = "99.1") {
  const s = leererDraft({patch, wirSind: "blue"});
  for (const [champ, rolle] of unsere) s.picks.blue.push({champ, rolle});
  for (const [champ, rolle] of ihre) s.picks.red.push({champ, rolle});
  return s;
}

const W = welt({champions: {
  E1: {TOP: [50000, 0.5]}, E2: {JUNGLE: [50000, 0.5]}, E3: {MIDDLE: [50000, 0.5]},
  G1: {TOP: [50000, 0.5]}, G2: {JUNGLE: [50000, 0.5]},
}});

test("ohne Einschaetzung gibt es kein Lagebild - und keine erfundenen Werte", () => {
  const S = aufbau(W, {});
  const L = S.lagebild(lage([["E1", "TOP"]], [["G1", "TOP"]]));
  assert.equal(L.groessterBedarf, null);
  assert.equal(L.groessteGefahr, null);
  assert.equal(L.siegbedingung, null);
  assert.equal(L.abdeckung.unser.belegt, 0);
});

test("der Bedarf waechst mit der gegnerischen Bedrohung", () => {
  // Wir: zwei Engager, kein Peel. Sie: Dive.
  const S = aufbau(W, {E1: {engage: 2}, E2: {engage: 2},
                       G1: {dive: 2}, G2: {dive: 2}});
  const ohneGegner = S.lagebild(lage([["E1", "TOP"], ["E2", "JUNGLE"]]));
  const gegenDive = S.lagebild(lage([["E1", "TOP"], ["E2", "JUNGLE"]],
                                    [["G1", "TOP"], ["G2", "JUNGLE"]]));
  const peel = (L) => L.bedarf.find((x) => x.achse === "peel")
    || {wert: 0};
  assert.equal(gegenDive.groessterBedarf.achse, "peel",
               "gegen Dive fehlt uns Peel am meisten");
  assert.ok(peel(gegenDive).wert > peel(ohneGegner).wert);
  assert.match(gegenDive.groessterBedarf.grund, /Dive/);
  assert.equal(gegenDive.groessteGefahr.achse, "dive");
  assert.equal(gegenDive.groessteGefahr.quelle, "heuristik",
               "als Einschaetzung gekennzeichnet");
});

test("eine gedeckte Achse steht unter Vermeiden", () => {
  const S = aufbau(W, {E1: {engage: 2}, E2: {engage: 2}});
  const L = S.lagebild(lage([["E1", "TOP"], ["E2", "JUNGLE"]]));
  assert.ok(L.vermeiden.some((x) => /Engage/.test(x.wort)), "weiterer Engage");
});

test("die Siegbedingung braucht mindestens zwei eingeschaetzte Picks", () => {
  const tab = {E1: {frontline: 2, teamfight: 2}, E2: {frontline: 2, teamfight: 2, peel: 2}};
  const S = aufbau(W, tab);
  assert.equal(S.lagebild(lage([["E1", "TOP"]])).siegbedingung, null);
  const zwei = S.lagebild(lage([["E1", "TOP"], ["E2", "JUNGLE"]])).siegbedingung;
  assert.equal(zwei.wort, "Front-to-Back-Teamfight");
  assert.equal(zwei.quelle, "heuristik");
});

/* ------------------------------------------------------ echte Daten */
const D = ladeDaten();
const q = quelleAnlegen(D.draft);
const leerH = heuristikAnlegen({champions: {}});
const m = merkmaleAnlegen(q, leerH);
const E = strategieAnlegen({quelle: q, merkmale: m, comp: compAnlegen(m, leerH),
                            heuristik: leerH, blind: blindAnlegen({quelle: q})});

test("der Wert des Wartens ist nie negativ und ordnet die Rollen", () => {
  const s = lage([], [], q.patch);
  const w = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]
    .map((r) => E.warten(s, r));
  for (const x of w) {
    assert.ok(x.wert >= -1e-12, x.rolle + ": Wissen kann nicht schaden");
    assert.ok(x.bester, x.rolle + " hat einen besten Blindpick");
  }
  const L = E.lagebild(s);
  assert.ok(L.naechsteRolle, "eine Rolle fuer jetzt");
  assert.ok(L.naechsteRolle.wert <= Math.min(...w.map((x) => x.wert)) + 1e-12,
            "jetzt: die Rolle, bei der Warten am wenigsten bringt");
});

test("steht der Lanegegner schon, ist der Counterpick jetzt dran", () => {
  const s = lage([], [["Darius", "TOP"]], q.patch);
  const L = E.lagebild(s);
  assert.equal(L.naechsteRolle.rolle, "TOP");
  assert.equal(L.naechsteRolle.modus, "counter");
});

test("das Lagebild bleibt schnell", () => {
  const s = lage([["Ornn", "TOP"], ["Lee Sin", "JUNGLE"]],
                 [["Jax", "TOP"], ["Ahri", "MIDDLE"]], q.patch);
  const t0 = performance.now();
  E.lagebild(s);
  const dt = performance.now() - t0;
  assert.ok(dt < 100, "gebraucht: " + dt.toFixed(0) + " ms");
});

/* ------------------------------------------- Wer bringt den Bedarf mit */
import { mannschaft } from "./synthetisch.mjs";
import { teamAnlegen } from "../engine/team.js";

test("zu jedem Bedarf: wer bringt ihn mit, wer traegt ihn schon", () => {
  const w = welt({champions: {
    E1: {TOP: [50000, 0.5]}, E2: {MIDDLE: [50000, 0.5]}, G1: {TOP: [50000, 0.5]},
    J1: {JUNGLE: [50000, 0.52]}, J2: {JUNGLE: [50000, 0.53]}, J3: {JUNGLE: [50000, 0.55]},
    S1: {UTILITY: [50000, 0.52]}, S2: {UTILITY: [50000, 0.50]},
  }});
  const quelle = quelleAnlegen(w);
  const h = heuristikAnlegen({champions: {
    // E1 deckt alles ausser Peel - der traegt E1 nur ueber seine
    // Frontline mit (Teildeckung), E2 teilweise selbst. Damit bleibt Peel
    // gegen ihr Dive der groesste Bedarf.
    E1: {engage: 2, disengage: 2, frontline: 2, teamfight: 2, objective: 2,
         dive: 2, poke: 2, catch: 2, siege: 2, splitpush: 2},
    E2: {peel: 1}, G1: {dive: 2},
    J1: {peel: 2}, J2: {peel: 1}, J3: {engage: 2}, S1: {peel: 2}, S2: {peel: 2},
  }});
  const merkmale = merkmaleAnlegen(quelle, h);
  const team = teamAnlegen(mannschaft("Wir", [
    {label: "sup", rolle: "UTILITY", pool: {S2: [30, 20]}}]));
  const S = strategieAnlegen({quelle, merkmale, comp: compAnlegen(merkmale, h),
                              heuristik: h, blind: blindAnlegen({quelle}), team});
  const spielerFuer = (r) => r === "UTILITY" ? {team: "Wir", label: "sup"} : null;

  const s = lage([["E1", "TOP"], ["E2", "MIDDLE"]], [["G1", "TOP"]]);
  const L = S.lagebild(s, {spielerFuer});
  const peel = L.bedarf.find((x) => x.achse === "peel");
  assert.ok(peel, "Peel ist ein Bedarf gegen ihr Dive");
  assert.equal(L.groessterBedarf.achse, "peel");
  const namen = peel.bringer.map((x) => x.champ);
  assert.ok(!namen.includes("J3"), "J3 bringt kein Peel");
  assert.deepEqual(namen, ["S2", "J1", "S1", "J2"],
                   "ausgepraegt vor teilweise, Pool vor nicht, dann Patchstaerke");
  assert.equal(peel.bringer[0].pool, true);
  assert.equal(peel.bringer[0].spieler, "sup");
  assert.deepEqual(peel.bisher, ["E1 (\u00fcber Frontline)", "E2"],
                   "E2 traegt Peel teilweise, E1 ueber seine Frontline");

  // Gebannte bringen nichts mehr mit.
  const gebannt = lage([["E1", "TOP"], ["E2", "MIDDLE"]], [["G1", "TOP"]]);
  gebannt.bans.red.push("S2");
  const p2 = S.lagebild(gebannt, {spielerFuer}).bedarf.find((x) => x.achse === "peel");
  assert.ok(!p2.bringer.some((x) => x.champ === "S2"));
});

test("ein Champion steht nur einmal unter den Bringern", async () => {
  // Gegen die echte Tabelle - mit leerer gaebe es keinen Bedarf, und der
  // Test waere immer gruen.
  const { readFileSync } = await import("node:fs");
  const h = heuristikAnlegen(JSON.parse(readFileSync("data/champion-heuristik.json", "utf8")));
  const mh = merkmaleAnlegen(q, h);
  const S = strategieAnlegen({quelle: q, merkmale: mh, comp: compAnlegen(mh, h),
                              heuristik: h, blind: blindAnlegen({quelle: q})});
  const L = S.lagebild(lage([["Ornn", "TOP"]], [["Vi", "JUNGLE"], ["Zed", "MIDDLE"]], q.patch));
  assert.ok(L.bedarf.length && L.bedarf.every((b) => b.bringer.length),
            "es gibt Bedarf und Bringer");
  for (const b of L.bedarf) {
    const namen = (b.bringer || []).map((x) => x.champ);
    assert.equal(new Set(namen).size, namen.length, b.wort + ": " + namen.join(", "));
  }
});

test("Bringer spielen die Rolle wirklich - keine Exoten ueber die Mindestgrenze", async () => {
  const { readFileSync } = await import("node:fs");
  const h = heuristikAnlegen(JSON.parse(readFileSync("data/champion-heuristik.json", "utf8")));
  const mh = merkmaleAnlegen(q, h);
  const S = strategieAnlegen({quelle: q, merkmale: mh, comp: compAnlegen(mh, h),
                              heuristik: h, blind: blindAnlegen({quelle: q})});
  // Nur Top offen: wir haben Jungle bis Support.
  const s = lage([["Sejuani", "JUNGLE"], ["Xerath", "MIDDLE"], ["Senna", "BOTTOM"],
                  ["Leona", "UTILITY"]],
                 [["Ambessa", "TOP"], ["Zac", "JUNGLE"], ["Ekko", "MIDDLE"],
                  ["Twitch", "BOTTOM"], ["Milio", "UTILITY"]], q.patch);
  const L = S.lagebild(s);
  const alle = L.bedarf.flatMap((b) => b.bringer.map((x) => x.champ));
  assert.ok(alle.length > 0);
  for (const c of ["Kalista", "Zilean", "Azir", "Ivern"]) {
    assert.ok(!alle.includes(c), c + " spielt kaum Top");
  }
  for (const x of L.bedarf.flatMap((b) => b.bringer)) {
    const v = q.rollenVerteilung(x.champ).value;
    const haupt = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
    assert.ok(haupt === x.rolle || v[x.rolle] >= 0.15,
              x.champ + " auf " + x.rolle + ": " + Math.round(v[x.rolle] * 100) + " %");
  }
});

test("Profil, Siegbedingung und Gefahr tragen ihre Details", () => {
  const S = aufbau(W, {
    E1: {engage: 2, teamfight: 2, frontline: 2}, E2: {engage: 2, teamfight: 2},
    G1: {disengage: 2, dive: 2}, G2: {peel: 2},
  });
  const L = S.lagebild(lage([["E1", "TOP"], ["E2", "JUNGLE"]],
                            [["G1", "TOP"], ["G2", "JUNGLE"]]));
  // Profil: jede Achse mit Stufe und Traegern, auch ueber Frontline.
  const u = L.profil.unser.achsen;
  assert.equal(u.catch.stufe, 0);
  assert.deepEqual(u.catch.traeger, []);
  assert.deepEqual(u.engage.traeger.map((t) => t.champ), ["E1", "E2"]);
  assert.equal(u.peel.traeger[0].ueber, "frontline");
  assert.equal(L.profil.ihr.achsen.dive.traeger[0].champ, "G1");

  // Siegbedingung: Traeger, Idee, Gefaehrdung (umgedrehte STOERUNG), Alternative.
  const sb = L.siegbedingung;
  assert.equal(sb.wort, "Engage und Teamfight");
  assert.ok(sb.idee && sb.idee.length > 10);
  assert.deepEqual(sb.achsen.find((a) => a.achse === "engage").traeger, ["E1", "E2"]);
  assert.deepEqual(sb.gefaehrdet.map((g) => g.achse).sort(), ["disengage", "peel"],
                   "ihr Disengage und Peel wirken gegen unseren Engage");
  assert.deepEqual(sb.gefaehrdet.find((g) => g.achse === "disengage").traeger, ["G1"]);
  assert.equal(sb.alternative.wort, "Front-to-Back-Teamfight");

  // Gefahr: ihr Dive - unsere Antworten und die schwaechste davon.
  const dive = L.gefahr.find((x) => x.achse === "dive");
  assert.deepEqual(dive.traeger, ["G1"]);
  assert.deepEqual(dive.antworten.map((a) => a.achse), ["peel", "disengage"]);
  assert.equal(dive.antworten.find((a) => a.achse === "peel").stufe, 0.5,
               "Peel nur ueber E1s Frontline");
  assert.equal(dive.antwortAchse, "disengage", "die duennste Antwort");
});
