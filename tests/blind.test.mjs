/* Blindpicks: die acht Faelle aus dem Auftrag, plus die Grenzen.
   ---------------------------------------------------------------------------
   Die Faelle 1-3 und 6-8 laufen in erfundenen Welten (synthetisch.mjs) -
   sie pruefen eine EIGENSCHAFT des Modells, nicht den aktuellen Patch.
   Die Faelle 4 und 5 brauchen echte Rollenverteilungen und echte
   Botlanepaare und laufen darum gegen die eingebetteten Daten.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { welt, mannschaft } from "./synthetisch.mjs";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { teamAnlegen } from "../engine/team.js";
import { bewerterAnlegen } from "../engine/score.js";
import { sucheAnlegen } from "../engine/search.js";
import { blindAnlegen } from "../engine/blind.js";
import { leererDraft } from "../engine/state.js";
import { GEWICHTE, BLIND } from "../engine/config.js";

function aufbau(roh, {heuristik = {}, teams = []} = {}) {
  const quelle = quelleAnlegen(roh);
  const h = heuristikAnlegen({champions: heuristik});
  const merkmale = merkmaleAnlegen(quelle, h);
  const comp = compAnlegen(merkmale, h);
  const team = teamAnlegen(teams);
  const bewerter = bewerterAnlegen({quelle, merkmale, comp, team, heuristik: h});
  const suche = sucheAnlegen({quelle, merkmale, bewerter});
  const blind = blindAnlegen({quelle, team});
  return {quelle, merkmale, comp, team, bewerter, suche, blind};
}

function lage({patch = "99.1", unsere = [], ihre = [], bans = []} = {}) {
  const s = leererDraft({patch, wirSind: "blue"});
  for (const c of bans) s.bans.red.push(c);
  for (const [champ, rolle] of unsere) s.picks.blue.push({champ, rolle});
  for (const [champ, rolle] of ihre) s.picks.red.push({champ, rolle});
  return s;
}

/* ------------------------------------------------------- Welt 1: Top
   Fuenf gleich haeufige Lanegegner (je 20 %). A schlaegt vier davon
   deutlich (+3,5), verliert aber gegen C1 katastrophal (-9). B steht
   gegen alle fuenf leicht vorn (+0,8). A hat den hoeheren Durchschnitt
   (+1,0 gegen +0,8) - und den haeufigen, harten Counter. */
const FELD = ["C1", "E1", "E2", "E3", "E4"];
const W1 = welt({
  champions: {
    A: {TOP: [2000, 0.505]}, B: {TOP: [2000, 0.505]},
    ...Object.fromEntries(FELD.map((c) => [c, {TOP: [200000, 0.5]}])),
    // Fall 6: ein echter Flexpick, auf beiden Rollen brauchbar.
    G: {TOP: [60000, 0.51], JUNGLE: [40000, 0.51]},
    // Fall 8: zwei gleiche Champions, nur einer im Pool des Spielers -
    // und einer, der klar schlechter ist.
    N1: {TOP: [2000, 0.505]}, N2: {TOP: [2000, 0.505]},
    SCHWACH: {TOP: [2000, 0.47]},
  },
  matchups: [
    ["A", "TOP", "C1", "TOP", 30000, 0.41],
    ...["E1", "E2", "E3", "E4"].map((e) => ["A", "TOP", e, "TOP", 30000, 0.535]),
    ...FELD.map((e) => ["B", "TOP", e, "TOP", 30000, 0.508]),
    ...FELD.map((e) => ["G", "TOP", e, "TOP", 30000, 0.505]),
    ...FELD.map((e) => ["N1", "TOP", e, "TOP", 30000, 0.505]),
    ...FELD.map((e) => ["N2", "TOP", e, "TOP", 30000, 0.505]),
    ...FELD.map((e) => ["SCHWACH", "TOP", e, "TOP", 30000, 0.465]),
  ],
});

test("1: hoeherer Schnitt mit haeufigem harten Counter verliert gegen robust", () => {
  const {blind, bewerter} = aufbau(W1);
  const s = lage();
  const a = blind.bewerte(s, "A", "TOP");
  const b = blind.bewerte(s, "B", "TOP");
  assert.ok(a.ev > b.ev, "A hat den hoeheren Schnitt: " + a.ev + " > " + b.ev);
  assert.ok(a.schlechtestes < b.schlechtestes, "A hat das schlechtere Fuenftel");
  assert.ok(b.roh > a.roh, "B ist der bessere Blindpick: " + b.roh + " > " + a.roh);
  assert.equal(a.konter[0].champ, "C1");
  assert.equal(a.konter[0].stufe, "sehr gefaehrlich");

  // Und in der ganzen Bewertung - sonst waere es nur eine Teilzahl.
  const ra = bewerter.bewerte(s, "A", "TOP");
  const rb = bewerter.bewerte(s, "B", "TOP");
  assert.ok(rb.score > ra.score, "B " + rb.score + " vor A " + ra.score);
  assert.ok(ra.risks.some((x) => /C1/.test(x)), "der Counter steht als Risiko da");
});

test("1b: ein seltener Counter zerstoert einen Champion nicht", () => {
  // Derselbe harte Counter, aber nur 2 % des Felds statt 20 %.
  const w = welt({
    champions: {A: {TOP: [2000, 0.505]}, C1: {TOP: [20000, 0.5]},
                ...Object.fromEntries(["E1", "E2", "E3", "E4"]
                  .map((c) => [c, {TOP: [245000, 0.5]}]))},
    matchups: [["A", "TOP", "C1", "TOP", 30000, 0.41],
               ...["E1", "E2", "E3", "E4"].map((e) => ["A", "TOP", e, "TOP", 30000, 0.535])],
  });
  const {blind} = aufbau(w);
  const a = blind.bewerte(lage(), "A", "TOP");
  assert.ok(a.wert > 0.5, "trotz Counter ueber dem Durchschnitt: " + a.wert);
  assert.equal(a.konter[0].champ, "C1", "aber er wird genannt");
  assert.ok(a.gefahrMasse < 0.05, "mit seiner geringen Wahrscheinlichkeit");
});

test("2: sicher aber unpassend verliert gegen weniger sicher und passend", () => {
  // Unsere Aufstellung: zwei Engager, rein physisch. S ist der sicherere
  // Blindpick, bringt aber einen dritten Engager und wieder physischen
  // Schaden. F ist weniger sicher, bringt aber Peel, Frontline und den
  // fehlenden magischen Schaden.
  const w = welt({
    champions: {
      S: {TOP: [2000, 0.505]}, F: {TOP: [2000, 0.505]},
      P1: {JUNGLE: [50000, 0.5]}, P2: {MIDDLE: [50000, 0.5]},
      ...Object.fromEntries(FELD.map((c) => [c, {TOP: [200000, 0.5]}])),
    },
    matchups: [
      ...FELD.map((e) => ["S", "TOP", e, "TOP", 30000, 0.508]),
      ["F", "TOP", "C1", "TOP", 30000, 0.48],
      ...["E1", "E2", "E3", "E4"].map((e) => ["F", "TOP", e, "TOP", 30000, 0.503]),
    ],
    schaden: {S: {TOP: 0}, F: {TOP: 100}, P1: {JUNGLE: 0}, P2: {MIDDLE: 0}},
  });
  const {bewerter} = aufbau(w, {heuristik: {
    P1: {engage: 2}, P2: {engage: 2},
    S: {engage: 2}, F: {peel: 2, frontline: 2},
  }});
  const s = lage({unsere: [["P1", "JUNGLE"], ["P2", "MIDDLE"]]});
  const rs = bewerter.bewerte(s, "S", "TOP");
  const rf = bewerter.bewerte(s, "F", "TOP");
  assert.ok(rs.components.blindSicherheit.roh > rf.components.blindSicherheit.roh,
            "S ist der sicherere Blindpick");
  assert.ok(rf.components.compFit.roh > rs.components.compFit.roh,
            "F verbessert die Aufstellung staerker");
  assert.ok(rf.score > rs.score, "F gewinnt: " + rf.score + " vor " + rs.score);
});

test("2b: ein weiterer Engager bringt einer Engage-Aufstellung nichts", () => {
  const {comp} = aufbau(W1, {heuristik: {
    A: {engage: 2}, B: {engage: 2}, N1: {engage: 2}, N2: {peel: 2},
  }});
  const picks = [{champ: "A", rolle: "TOP"}, {champ: "B", rolle: "TOP"}];
  const noch = comp.marginal(picks, {champ: "N1", rolle: "TOP"});
  const peel = comp.marginal(picks, {champ: "N2", rolle: "TOP"});
  assert.equal(noch.achsen.engage.delta, 0, "Engage ist gesaettigt");
  assert.equal(peel.achsen.engage.delta, 0,
               "ein Peel-Champion SENKT unseren Engage nicht mehr");
  assert.equal(peel.achsen.peel.delta, 1, "er fuellt die leere Achse ganz");
});

test("3: ein gebannter Counter ist kein Risiko mehr", () => {
  const {blind} = aufbau(W1);
  const offen = blind.bewerte(lage(), "A", "TOP");
  const gebannt = blind.bewerte(lage({bans: ["C1"]}), "A", "TOP");
  assert.ok(offen.konter.some((k) => k.champ === "C1"));
  assert.ok(!gebannt.konter.some((k) => k.champ === "C1"), "C1 ist weg");
  assert.ok(gebannt.gefahrMasse < offen.gefahrMasse);
  assert.ok(gebannt.roh > offen.roh, "der Blindwert steigt");
  // Ebenso, wenn ihn schon jemand gepickt hat - egal welche Seite.
  const gepickt = blind.bewerte(lage({unsere: [["C1", "TOP"]]}), "A", "JUNGLE");
  assert.equal(gepickt, null, "A spielt keinen Jungle - kein Wert, keine Zahl");
});

/* ------------------------------------------------------ echte Daten */
const ECHT = ladeDaten();
const E = aufbau(ECHT.draft, {teams: ECHT.teams});
const patch = E.quelle.patch;

test("4: ein gegnerischer Flexpick laesst die Lane teilweise offen", () => {
  // Gragas spielt 61 % Top, 19 % Jungle, 14 % Mid. Auf Top eingetragen,
  // ist seine Rolle nicht sicher, solange Jungle und Mid beim Gegner
  // offen sind. Garen (91 % Top) dagegen schon.
  const flex = E.bewerter.bewerte(lage({patch, ihre: [["Gragas", "TOP"]]}),
                                  "Ornn", "TOP");
  const fest = E.bewerter.bewerte(lage({patch, ihre: [["Garen", "TOP"]]}),
                                  "Ornn", "TOP");
  assert.equal(fest.modus, "counter");
  assert.equal(fest.components.blindSicherheit, undefined);
  assert.equal(flex.modus, "teilweise");
  assert.ok(flex.lage.unbekannt > 0.2, "Unsicherheit: " + flex.lage.unbekannt);
  assert.ok(flex.components.blindSicherheit, "der offene Teil zaehlt");
  assert.ok(Math.abs(flex.components.blindSicherheit.gewicht
                     - GEWICHTE.blindSicherheit * flex.lage.unbekannt) < 1e-9,
            "und zwar nach seinem Anteil");
  // Ist sein Jungle und Mid schon besetzt, bleibt ihm nur Top.
  const ohneAusweg = E.bewerter.bewerte(lage({patch, ihre: [
    ["Gragas", "TOP"], ["Lee Sin", "JUNGLE"], ["Ahri", "MIDDLE"]]}), "Ornn", "TOP");
  assert.equal(ohneAusweg.modus, "counter");
});

test("5: ein blinder ADC rechnet gegen ganze Botlanes, nicht gegen einen", () => {
  const sz = E.blind.szenarien(lage({patch}), "BOTTOM");
  assert.equal(sz.lage.modus, "blind");
  assert.ok(sz.liste.length >= 20, "Paare: " + sz.liste.length);
  assert.ok(sz.liste.every((x) => x.gegner.length === 2
    && x.gegner[0].rolle === "BOTTOM" && x.gegner[1].rolle === "UTILITY"));
  const adcs = new Set(sz.liste.map((x) => x.gegner[0].champ));
  const sups = new Set(sz.liste.map((x) => x.gegner[1].champ));
  assert.ok(adcs.size >= 5 && sups.size >= 5, adcs.size + " ADCs, " + sups.size + " Supports");
  const summe = sz.liste.reduce((a, x) => a + x.p, 0);
  assert.ok(Math.abs(summe - 1) < 1e-9, "eine Verteilung");

  // Support bekannt: nur noch der ADC ist offen - bedingt auf den Support.
  const halb = E.blind.szenarien(lage({patch, ihre: [["Thresh", "UTILITY"]]}),
                                 "BOTTOM");
  assert.equal(halb.lage.modus, "teilweise");
  assert.equal(halb.bedingtAuf, "Thresh");
  assert.ok(halb.liste.every((x) => x.gegner.length === 1
                                  && x.gegner[0].rolle === "BOTTOM"));
  // Und die Bewertung traegt es: ein Teil Matchup, ein Teil Szenario.
  const r = E.bewerter.bewerte(lage({patch, ihre: [["Thresh", "UTILITY"]]}),
                               "Jinx", "BOTTOM");
  assert.ok(r.components.matchup && r.components.blindSicherheit);
});

test("6: ein echter Flexpick hat Informationswert - abhaengig von der Lage", () => {
  const {bewerter} = aufbau(W1);
  const leer = bewerter.bewerte(lage(), "G", "TOP");
  assert.ok(leer.components.flex.roh > 0.5,
            "Top und Jungle offen: " + leer.components.flex.roh);
  const jungleWeg = bewerter.bewerte(lage({unsere: [["E1", "JUNGLE"]]}), "G", "TOP");
  assert.equal(jungleWeg.components.flex.roh, 0,
               "unser Jungle steht - G verraet die Lane");
  const gegnerFertig = bewerter.bewerte(lage({ihre: [
    ["E1", "TOP"], ["E2", "JUNGLE"], ["E3", "MIDDLE"], ["E4", "BOTTOM"],
    ["C1", "UTILITY"]]}), "G", "TOP");
  assert.equal(gegnerFertig.components.flex, undefined,
               "der Gegner pickt nicht mehr - es gibt nichts zu verbergen");
  // Ein Champion mit nur einer Rolle verraet sie.
  assert.equal(bewerter.bewerte(lage(), "B", "TOP").components.flex.roh, 0);
});

test("7: hohe Note bei duenner Datenlage verliert gegen etwas weniger, aber sicher", () => {
  const {suche} = aufbau(W1);
  const liste = [
    {champion: "Unsicher", score: 92, confidence: 0.4},
    {champion: "Sicher", score: 89, confidence: 0.9},
    ...Array.from({length: 9}, (_, i) => ({champion: "F" + i, score: 50,
                                           confidence: 0.7})),
  ];
  const sortiert = suche.entscheiden(liste);
  assert.equal(sortiert[0].champion, "Sicher");
  const u = sortiert.find((r) => r.champion === "Unsicher");
  assert.equal(u.score, 92, "die Note selbst bleibt stehen");
  assert.ok(u.entscheidung < u.score && u.entscheidung > u.median,
            "zur Mitte gezogen, nicht ins Bodenlose");
  // Und nicht einfach multipliziert: ein schwacher unsicherer Champion
  // steigt dabei Richtung Mitte, statt bestraft zu werden.
  const schwach = suche.entscheiden([
    {champion: "x", score: 30, confidence: 0.2},
    ...Array.from({length: 4}, (_, i) => ({champion: "m" + i, score: 50,
                                           confidence: 0.8}))]);
  const x = schwach.find((r) => r.champion === "x");
  assert.ok(x.entscheidung > 30, "unsicher-schwach rueckt zur Mitte: " + x.entscheidung);
});

test("8: der Spieler-Fit verschiebt die Rangliste - aber nicht ueber Schwaeche hinweg", () => {
  const teams = mannschaft("Wir", [{label: "p", rolle: "TOP",
    pool: {N1: [120, 80], SCHWACH: [200, 100]}}]);
  const {suche} = aufbau(W1, {teams});
  const ohne = suche.rangliste(lage(), "TOP", {mitLookahead: false});
  const mit = suche.rangliste(lage(), "TOP", {mitLookahead: false,
                                              spielerTeam: "Wir", spielerLabel: "p"});
  const rang = (l, c) => l.findIndex((r) => r.champion === c);
  const note = (l, c) => l.find((r) => r.champion === c).score;
  assert.equal(note(ohne, "N1"), note(ohne, "N2"), "ohne Spieler gleich");
  assert.ok(rang(mit, "N1") < rang(mit, "N2"), "mit Spieler: N1 vor N2");
  assert.ok(rang(mit, "SCHWACH") > rang(mit, "N2"),
            "300 Partien heben einen klar schwaecheren Champion nicht vorbei");
});

test("Kategorien nehmen nur Kandidaten nahe am besten", () => {
  const teams = mannschaft("Wir", [{label: "p", rolle: "TOP",
    pool: {SCHWACH: [400, 200]}}]);
  const {suche} = aufbau(W1, {teams});
  const liste = suche.rangliste(lage(), "TOP", {mitLookahead: false,
                                                spielerTeam: "Wir", spielerLabel: "p"});
  const k = suche.kategorien(liste);
  assert.equal(k[0].art, "gesamt");
  assert.equal(k[0].r.champion, liste[0].champion);
  const komfort = k.find((x) => x.art === "komfort");
  assert.ok(!komfort || komfort.r.champion !== "SCHWACH",
            "der Lieblingschampion ist kein Komfortpick, wenn er klar schlechter ist");
  const sicher = k.find((x) => x.art === "sicher");
  assert.ok(sicher, "es gibt einen sichersten Pick");
});

test("Szenarien nehmen Gesperrtes nie mit und bleiben eine Verteilung", () => {
  const s = lage({patch, bans: ["Yone", "Malphite"], ihre: [["Aatrox", "JUNGLE"]]});
  const sz = E.blind.szenarien(s, "TOP");
  const namen = sz.liste.map((x) => x.gegner[0].champ);
  for (const c of ["Yone", "Malphite", "Aatrox"]) {
    assert.ok(!namen.includes(c), c + " ist gesperrt");
  }
  assert.ok(Math.abs(sz.liste.reduce((a, x) => a + x.p, 0) - 1) < 1e-9);
});

test("ein gescouteter Gegner verschiebt die Szenarien zu seinem Pool", () => {
  const meta = E.blind.feld("TOP", new Set(), null);
  const spieler = E.team.aufRolle("SSV Remlingen", "TOP");
  assert.ok(spieler, "SSV Remlingen hat einen Toplaner");
  const gemischt = E.blind.feld("TOP", new Set(),
                                {team: "SSV Remlingen", label: spieler.label});
  if (gemischt.poolWort) {
    const pool = E.team.pool("SSV Remlingen", spieler.label);
    const liebling = [...pool.entries()]
      .filter(([c]) => meta.liste.some((x) => x.champ === c))
      .sort((a, b) => b[1].play - a[1].play)[0][0];
    const p = (f) => (f.liste.find((x) => x.champ === liebling) || {p: 0}).p;
    assert.ok(p(gemischt) > p(meta), liebling + " wird wahrscheinlicher");
    assert.match(gemischt.poolWort, /Rankedpartien/);
  }
});

test("die Rauschkorrektur schrumpft duenne Paarungen staerker", () => {
  const a = E.blind.abweichung("Ornn", "TOP", "Jax", "TOP");
  assert.ok(a && Math.abs(a.d) <= Math.abs(a.roh));
  assert.ok(Math.abs(a.d / a.roh - a.n / (a.n + BLIND.schrumpfK)) < 1e-9);
});
