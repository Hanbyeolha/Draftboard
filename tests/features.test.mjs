/* Merkmalsschicht und Komfort, gegen die echten eingebetteten Daten. */
import test from "node:test";
import assert from "node:assert/strict";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import {
  merkmaleAnlegen, flexGrad, phasenAus, normQuote, normVorteil, normSkalierung,
} from "../engine/features.js";
import { teamAnlegen } from "../engine/team.js";

const DATA = ladeDaten();
const quelle = quelleAnlegen(DATA.draft);
const leereHeuristik = heuristikAnlegen({champions: {}});
const M = merkmaleAnlegen(quelle, leereHeuristik);

test("ein Merkmalsbuendel traegt Staerke, Kurve und Phasen", () => {
  const m = M.fuer("Ornn", "TOP");
  assert.equal(m.champ, "Ornn");
  assert.equal(m.staerke.source, "draftgap");
  assert.ok(m.kurve.value.length === 5);
  assert.ok(m.phasen.frueh && m.phasen.mittel && m.phasen.spaet);
  assert.ok(m.prioritaet.value > 1000);
});

test("Nebenrollen liefern kein Buendel statt eines leeren", () => {
  assert.equal(M.fuer("Ahri", "TOP"), null);
  assert.ok(M.fuer("Ahri", "MIDDLE"));
});

test("Phasen folgen der gemessenen Kurve", () => {
  const kayle = M.fuer("Kayle", "TOP").phasen;
  assert.ok(kayle.spaet.value > kayle.frueh.value + 0.05,
            "Kayle spaet " + kayle.spaet.value + " vs frueh " + kayle.frueh.value);
  const pantheon = M.fuer("Pantheon", "UTILITY").phasen;
  assert.ok(pantheon.frueh.value > pantheon.spaet.value,
            "Pantheon faellt ab");
});

test("Flexgrad: eindeutig ist 0, mehrdeutig ist mehr", () => {
  const thresh = M.fuer("Thresh", "UTILITY");
  assert.equal(thresh.flex.value, 0);
  assert.match(thresh.flex.note, /eindeutige Rolle/);
  // Mindestens ein Champion im Datensatz muss mehrdeutig sein, sonst
  // waere der Flexwert als Begriff sinnlos.
  const flexible = quelle.champions
    .map((c) => ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]
      .map((r) => M.fuer(c, r)).find(Boolean))
    .filter((m) => m && m.flex.value > 0.3);
  assert.ok(flexible.length > 5, "flexible Champions: " + flexible.length);
});

test("der Kandidatenkreis ist die Rolle, nicht der eigene Pool", () => {
  const top = M.kandidaten("TOP");
  assert.ok(top.length > 40, "Top-Kandidaten: " + top.length);
  assert.ok(top.every((m) => m.rolle === "TOP"));
  const ohne = M.kandidaten("TOP", {ausser: new Set([top[0].champ])});
  assert.equal(ohne.length, top.length - 1);
});

test("Merkmale werden gemerkt, nicht neu gerechnet", () => {
  const frisch = merkmaleAnlegen(quelle, leereHeuristik);
  assert.equal(frisch.groesse(), 0);
  const a = frisch.fuer("Ornn", "TOP");
  const b = frisch.fuer("Ornn", "TOP");
  assert.equal(a, b, "dasselbe Objekt");
  assert.equal(frisch.groesse(), 1);
});

test("die Heuristik haengt am Buendel, getrennt von den Messungen", () => {
  const h = heuristikAnlegen({_stand: "2026-10-09",
                              champions: {Ornn: {frontline: 2, engage: 2}}});
  const mm = merkmaleAnlegen(quelle, h);
  const m = mm.fuer("Ornn", "TOP");
  assert.equal(m.heuristik.frontline.source, "heuristik");
  assert.equal(m.staerke.source, "draftgap");
  assert.equal(mm.fuer("Jhin", "BOTTOM").heuristik, null);
});

test("Normierung klemmt und erfindet nichts", () => {
  assert.equal(normQuote(null), null);
  assert.equal(normQuote(0.40), 0);
  assert.equal(normQuote(0.60), 1);
  assert.ok(Math.abs(normQuote(0.50) - 0.5) < 1e-9);
  assert.ok(Math.abs(normVorteil(0) - 0.5) < 1e-9);
  assert.equal(normVorteil(0.05), 1);
  assert.ok(normSkalierung(0.15) > 0.9);
  assert.ok(normSkalierung(-0.06) < 0.3);
});

test("phasenAus kommt mit Luecken in der Kurve klar", () => {
  assert.equal(phasenAus(null), null);
  const p = phasenAus({value: [0.5, null, null, null, 0.6],
                       source: "draftgap", patch: "1.0", sampleSize: 100});
  assert.ok(p.frueh && p.spaet);
  assert.equal(p.mittel, undefined);
});

/* ------------------------------------------------------------- Komfort */

const T = teamAnlegen(DATA.teams);

test("die Teamquelle waehlt die neueste Season und sagt welche", () => {
  assert.equal(T.queue, "RANKED");
  assert.equal(T.season, T.seasons[0]);
  assert.ok(T.seasons.length >= 2, "Seasons: " + T.seasons);
});

test("der Spieler einer Rolle ist der Starter, nicht die Bank", () => {
  const s = T.aufRolle("AFC1", "TOP");
  assert.ok(s, "kein Toplaner gefunden");
  assert.equal(s.bank, false);
  assert.equal(s.rolle, "TOP");
});

test("Komfort waechst mit Partien und traegt seine Begruendung", () => {
  const top = T.aufRolle("AFC1", "TOP");
  const viel = T.komfort("AFC1", top.label, "Dr. Mundo");
  assert.equal(viel.source, "team");
  assert.ok(viel.value > 0.6, "Dr. Mundo: " + viel.value);
  assert.match(viel.note, /Partien/);
  assert.ok(viel.sampleSize > 50);
});

test("ohne Beleg: niedrig und unsicher, nicht 0 und nicht weg", () => {
  // Beide Extreme waren gemessen falsch: eine belegte 0 gab 14 Punkte
  // Abzug fuer Unwissen, ein Wegfall normierte den Champion hoch (5 von
  // 6 besten Vorschlaegen waren nie gespielt).
  const top = T.aufRolle("AFC1", "TOP");
  const nix = T.komfort("AFC1", top.label, "Yuumi");
  assert.ok(nix, "der Teil faellt nicht weg - sonst wird hochnormiert");
  assert.ok(nix.value > 0 && nix.value < 0.3, "niedrig: " + nix.value);
  assert.ok(nix.confidence < 0.4, "und unsicher: " + nix.confidence);
  assert.match(nix.note, /keine Rankedpartien/);
  // Wenig gespielt ist etwas anderes als gar nicht bekannt: dort gibt es
  // einen niedrigen, aber belegten Wert.
  const wenig = T.komfort("AFC1", top.label, "Jarvan IV");
  assert.ok(wenig && wenig.value > 0 && wenig.value < 0.7,
            "Jarvan IV: " + (wenig && wenig.value));
});

test("der Draftplan traegt auch ohne viele Partien", () => {
  // HartzFor nennt Cho'Gath als Blindpick bei wenigen Ranked-Partien.
  const jgl = T.aufRolle("AFC1", "JUNGLE");
  const k = T.komfort("AFC1", jgl.label, "Cho'Gath");
  assert.ok(k.value > 0.5, "Blindpick trotz weniger Partien: " + k.value);
  assert.match(k.note, /blind pickbar/);
  assert.ok(k.confidence > 0.5, "Ansage hebt die Konfidenz");
});

test("ein unbekannter Spieler liefert null statt einer Zahl", () => {
  assert.equal(T.komfort("AFC1", "gibtsnicht", "Ornn"), null);
  assert.equal(T.komfort("Kein Team", "wer", "Ornn"), null);
});

test("eine leere Teamliste kracht nicht", () => {
  const leer = teamAnlegen([]);
  assert.equal(leer.aufRolle("AFC1", "TOP"), null);
  assert.equal(leer.komfort("AFC1", "x", "Ornn"), null);
});

/* Audit P2.7: Die BLIND-Marke las den Draftplan aus dem Browser
   (planOf), der Komfort der Note nur den eingebetteten aus DATA.teams.
   Ein im Browser eingetragener Blindpick zeigte "blind" - die Note
   rechnete ohne. Jetzt setzt planEinsetzen den Browserplan ein, nach
   derselben Regel wie planOf: ein lokaler Eintrag ersetzt den Spieler. */
test("P2.7: ein im Browser eingetragener Blindpick zaehlt im Komfort", async () => {
  const { planEinsetzen } = await import("../engine/team.js");
  const D = ladeDaten();
  const afc = D.teams.find((t) => t.team === "AFC1");
  const mid = afc.players.find((p) => p.role === "MIDDLE" && !p.bench);
  const champ = "Lux";
  const vorher = teamAnlegen(D.teams).komfort("AFC1", mid.label, champ);
  assert.ok(!/blind/.test(vorher ? vorher.note || "" : ""), "Voraussetzung: nicht im Dateiplan");
  const lokal = {AFC1: {[mid.label]: {blind: [champ], likes: []}}};
  const T = teamAnlegen(planEinsetzen(D.teams, lokal));
  const nachher = T.komfort("AFC1", mid.label, champ);
  assert.ok(nachher.value > (vorher ? vorher.value : 0),
            "Komfort steigt: " + (vorher && vorher.value) + " -> " + nachher.value);
  assert.match(nachher.note || "", /blind/);
  // Andere Spieler und Mannschaften bleiben unberuehrt.
  const top = afc.players.find((p) => p.role === "TOP" && !p.bench);
  assert.deepEqual(T.komfort("AFC1", top.label, "Ornn"),
                   teamAnlegen(D.teams).komfort("AFC1", top.label, "Ornn"));
  assert.deepEqual(planEinsetzen(D.teams, {}), D.teams.map((t) => ({...t, players: t.players})));
});

test("P2.7: die Oberflaeche baut die Engine-Mannschaft aus dem Browserplan", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync("template.html", "utf8");
  assert.match(html, /ENGINE\.teamAnlegen\(ENGINE\.planEinsetzen\(DATA\.teams, localPlan\)\)/);
  assert.match(html, /function writePlan\(\)[\s\S]{0,400}livePlanNeu\(\)/,
               "nach jeder Planaenderung neu angelegt");
});
