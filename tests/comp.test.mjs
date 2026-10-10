/* Aufstellungsbewertung und Marginalwert, gegen die echten Daten. */
import test from "node:test";
import assert from "node:assert/strict";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen, GESCHAETZTE_ACHSEN } from "../engine/comp.js";
import { COMP } from "../engine/config.js";

const DATA = ladeDaten();
const quelle = quelleAnlegen(DATA.draft);
const leer = heuristikAnlegen({champions: {}});
const M = merkmaleAnlegen(quelle, leer);
const C = compAnlegen(M, leer);

/* Eine klar physische und eine klar magische Aufstellung. */
const PHYSISCH = [
  {champ: "Jax", rolle: "TOP"}, {champ: "Lee Sin", rolle: "JUNGLE"},
  {champ: "Zed", rolle: "MIDDLE"}, {champ: "Caitlyn", rolle: "BOTTOM"},
  {champ: "Thresh", rolle: "UTILITY"},
];
const MAGISCH = [
  {champ: "Malphite", rolle: "TOP"}, {champ: "Amumu", rolle: "JUNGLE"},
  {champ: "Veigar", rolle: "MIDDLE"}, {champ: "Seraphine", rolle: "BOTTOM"},
  {champ: "Lulu", rolle: "UTILITY"},
];

test("ein Profil traegt Schaden, Kurve, Rollen und Abdeckung", () => {
  const p = C.profil(PHYSISCH);
  assert.equal(p.n, 5);
  assert.ok(p.schaden.magisch.source === "draftgap");
  assert.ok(p.kurve.frueh && p.kurve.spaet);
  assert.equal(p.rollen.vollstaendig, true);
  assert.equal(p.abdeckung.heuristik, 0, "leere Tabelle");
});

test("eine einseitige Aufstellung wird als solche erkannt", () => {
  const phys = C.profil(PHYSISCH);
  const mag = C.profil(MAGISCH);
  assert.ok(phys.schaden.magisch.value < 0.3,
            "physisch: " + phys.schaden.magisch.value);
  assert.ok(mag.schaden.magisch.value > 0.7,
            "magisch: " + mag.schaden.magisch.value);
  // Beide liegen ausserhalb des Bandes und werden abgewertet.
  assert.ok(phys.schaden.balance.value < 1);
  assert.ok(mag.schaden.balance.value < 1);
});

test("eine gemischte Aufstellung bekommt die volle Balance", () => {
  const gemischt = [
    {champ: "Ornn", rolle: "TOP"}, {champ: "Lee Sin", rolle: "JUNGLE"},
    {champ: "Veigar", rolle: "MIDDLE"}, {champ: "Caitlyn", rolle: "BOTTOM"},
    {champ: "Lulu", rolle: "UTILITY"},
  ];
  const p = C.profil(gemischt);
  const m = p.schaden.magisch.value;
  assert.ok(m > COMP.schadenBandVon && m < COMP.schadenBandBis,
            "Anteil magisch: " + m);
  assert.equal(p.schaden.balance.value, 1);
});

test("offene Rollen werden gezaehlt, Picks ohne Rolle zaehlen nicht", () => {
  const p = C.profil([{champ: "Ornn", rolle: "TOP"}, {champ: "Ahri"}]);
  assert.deepEqual(p.rollen.offen.length, 4);
  assert.equal(p.rollen.vollstaendig, false);
});

test("der Phasenvorteil ist relativ und braucht beide Seiten", () => {
  const unser = C.profil([{champ: "Kayle", rolle: "TOP"}]);
  const ihr = C.profil([{champ: "Pantheon", rolle: "UTILITY"}]);
  const v = C.phasenVorteil(unser, ihr);
  assert.ok(v.je.spaet > v.je.frueh, "Kayle gegen Pantheon spaeter besser");
  assert.equal(v.stark, "spaet");
  assert.equal(C.phasenVorteil(unser, C.profil([])), null);
});

test("der Vergleich nennt nur Achsen, die beide Seiten belegen", () => {
  const v = C.vergleich(C.profil(PHYSISCH), C.profil(MAGISCH));
  assert.ok(v.schaden.unser < v.schaden.ihr);
  assert.ok(v.kurve.frueh !== undefined);
  assert.equal(v.struktur, undefined, "leere Heuristik -> kein Strukturvergleich");
});

/* ------------------------------------------------------- Marginalwert */

test("Marginalwert misst die Aenderung, nicht die Staerke", () => {
  // Vier physische Picks: ein magischer Champion muss die Balance heben,
  // ein weiterer physischer nicht.
  const vier = PHYSISCH.slice(0, 4);
  const magisch = C.marginal(vier, {champ: "Veigar", rolle: "UTILITY"});
  const physisch = C.marginal(vier, {champ: "Pyke", rolle: "UTILITY"});
  assert.ok(magisch.achsen.schadensbalance.delta > 0,
            "Veigar hebt: " + magisch.achsen.schadensbalance.delta);
  assert.ok(magisch.punkte > physisch.punkte,
            "magisch " + magisch.punkte + " vs physisch " + physisch.punkte);
});

test("eine geschlossene Rollenluecke zaehlt", () => {
  const m = C.marginal([{champ: "Ornn", rolle: "TOP"}],
                       {champ: "Lee Sin", rolle: "JUNGLE"});
  assert.ok(m.achsen.rollenabdeckung.delta > 0);
  assert.equal(m.achsen.rollenabdeckung.vorher, 0.2);
  assert.equal(m.achsen.rollenabdeckung.nachher, 0.4);
});

test("ohne Gegner gibt es keine Kurvenachse - das waere keine Aussage", () => {
  const ohne = C.marginal(PHYSISCH.slice(0, 2), {champ: "Veigar", rolle: "MIDDLE"});
  assert.equal(ohne.achsen.kurveGegenGegner, undefined);
  const mit = C.marginal(PHYSISCH.slice(0, 2), {champ: "Veigar", rolle: "MIDDLE"},
                         {gegner: C.profil(MAGISCH)});
  assert.ok(mit.achsen.kurveGegenGegner, "mit Gegner gibt es sie");
});

test("mit leerer Heuristik beruht alles auf Messungen", () => {
  const m = C.marginal(PHYSISCH.slice(0, 3), {champ: "Veigar", rolle: "BOTTOM"});
  assert.equal(m.anteilGemessen, 1);
  for (const a of GESCHAETZTE_ACHSEN) {
    assert.equal(m.achsen[a], undefined, a + " darf nicht auftauchen");
  }
});

test("gepflegte Heuristik taucht auf - und bleibt als solche erkennbar", () => {
  const h = heuristikAnlegen({
    _stand: "2026-10-09",
    champions: {
      Jax: {frontline: 1, splitpush: 2},
      "Lee Sin": {engage: 2, dive: 2},
      Zed: {dive: 2},
      Caitlyn: {poke: 2, siege: 2},
      Thresh: {engage: 2, peel: 2, catch: 2},
      Ornn: {frontline: 2, engage: 2, teamfight: 2},
    },
  });
  const CH = compAnlegen(merkmaleAnlegen(quelle, h), h);
  const p = CH.profil(PHYSISCH);
  assert.ok(p.struktur.engage, "Engage belegt");
  assert.equal(p.struktur.engage.source, "heuristik");
  assert.match(p.struktur.engage.note, /von 5 Picks gepflegt/);
  assert.equal(p.abdeckung.heuristik, 1);

  const m = CH.marginal(PHYSISCH.slice(0, 4), {champ: "Ornn", rolle: "UTILITY"});
  assert.ok(m.achsen.frontline, "Frontline wird bewertet");
  assert.equal(m.achsen.frontline.quelle, "heuristik");
  assert.ok(m.anteilGemessen < 1 && m.anteilGemessen > 0,
            "gemischt: " + m.anteilGemessen);
});

test("eine Achse auf nur einem Pick ist keine Aussage ueber die Aufstellung", () => {
  const h = heuristikAnlegen({champions: {Jax: {splitpush: 2}}});
  const CH = compAnlegen(merkmaleAnlegen(quelle, h), h);
  const p = CH.profil(PHYSISCH);
  assert.equal(p.struktur, null, "ein gepflegter Pick reicht nicht");
  assert.ok(COMP.heuristikAbPicks >= 2);
});

test("eine leere Aufstellung kracht nicht", () => {
  const p = C.profil([]);
  assert.equal(p.n, 0);
  assert.equal(p.schaden, null);
  assert.equal(p.kurve, null);
  assert.equal(p.rollen.offen.length, 5);
  const m = C.marginal([], {champ: "Ornn", rolle: "TOP"});
  assert.ok(m.punkte !== null, "Rollenabdeckung traegt auch allein");
});

test("ein unbekannter Champion faellt heraus, statt zu kippen", () => {
  const p = C.profil([{champ: "Gibtsnicht", rolle: "TOP"},
                      {champ: "Ornn", rolle: "JUNGLE"}]);
  assert.equal(p.n, 0, "Ornn ist kein Jungler, Gibtsnicht kein Champion");
  assert.equal(p.gesamt, 2);
});
