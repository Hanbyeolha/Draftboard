/* Die Heuristiktabelle: getrennt, niedrig gewichtet, faellt sauber aus. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { heuristikAnlegen, achseUeberTeam, ACHSEN, GEMESSEN_VORHANDEN }
  from "../engine/heuristik.js";
import { KONFIDENZ } from "../engine/config.js";

const roh = JSON.parse(readFileSync("data/champion-heuristik.json", "utf8"));

test("die ausgelieferte Tabelle ist lesbar und dokumentiert die Achsen", () => {
  assert.ok(roh._achsen, "Achsen dokumentiert");
  assert.deepEqual(Object.keys(roh._achsen).sort(), ACHSEN.slice().sort());
  assert.ok(roh._stand, "Stand vermerkt");
});

test("eine leere Tabelle liefert ueberall null statt Nullen", () => {
  const h = heuristikAnlegen({champions: {}});
  assert.equal(h.achse("Ornn", "engage"), null);
  assert.equal(h.profil("Ornn"), null);
  assert.equal(h.kennt("Ornn"), false);
});

test("die Ersteinschaetzung ist als ungeprueft erkennbar und traegt weniger", () => {
  const h = heuristikAnlegen(roh);
  assert.equal(h.anzahlTeam, Object.keys(roh.champions).length);
  assert.ok(h.anzahlVorschlag > 100, "Vorschlaege: " + h.anzahlVorschlag);
  const w = h.achse("Ornn", "engage");
  assert.equal(w.source, "heuristik", "keine Messung");
  assert.equal(w.confidence, KONFIDENZ.heuristikVorschlag);
  assert.ok(KONFIDENZ.heuristikVorschlag < KONFIDENZ.heuristik);
  assert.match(w.note, /ungepr\u00fcft/);
  // Nichts geraten: wen ich nicht sicher kenne, der fehlt.
  for (const c of ["Locke", "Yunara", "Zaahen"]) {
    assert.equal(h.kennt(c), false, c + " ist nicht eingeschaetzt");
  }
});

test("ein Team-Eintrag ersetzt den Vorschlag ganz, nicht achsenweise", () => {
  const h = heuristikAnlegen({
    champions: {Ornn: {frontline: 2}},
    vorschlag: {Ornn: {engage: 2, frontline: 1, teamfight: 2}},
  });
  assert.equal(h.art("Ornn"), "team");
  assert.equal(h.achse("Ornn", "frontline").value, 1);
  assert.equal(h.achse("Ornn", "frontline").confidence, KONFIDENZ.heuristik);
  assert.match(h.achse("Ornn", "frontline").note, /Mannschaft/);
  assert.equal(h.achse("Ornn", "engage"), null,
               "keine Mischung: Engage aus dem Vorschlag gilt nicht mehr");
});

test("gepflegte Werte tragen Quelle heuristik und niedrige Konfidenz", () => {
  const h = heuristikAnlegen({
    _stand: "2026-10-09",
    champions: {Ornn: {frontline: 2, engage: 2, poke: 0}},
  });
  const w = h.achse("Ornn", "frontline");
  assert.equal(w.source, "heuristik");
  assert.equal(w.value, 1);                       // 2 von 2 -> 1.0
  assert.equal(w.confidence, KONFIDENZ.heuristik);
  assert.ok(w.confidence < 0.6, "bewusst niedrig");
  assert.match(w.note, /Einsch\u00e4tzung/);
  assert.equal(h.achse("Ornn", "poke").value, 0); // gepflegte Null bleibt
  assert.equal(h.achse("Ornn", "dive"), null);    // ungepflegt bleibt null
});

test("unbekannte Achsen fliegen auf, statt still null zu liefern", () => {
  const h = heuristikAnlegen({champions: {}});
  assert.throws(() => h.achse("Ornn", "gibtsnicht"), /unbekannte Achse/);
});

test("eine halb gepflegte Aufstellung wird als solche ausgewiesen", () => {
  const h = heuristikAnlegen({champions: {Ornn: {frontline: 2}}});
  const picks = [{champ: "Ornn"}, {champ: "Jhin"}, {champ: "Lulu"}];
  const w = achseUeberTeam(h, picks, "frontline");
  assert.equal(w.source, "heuristik");
  assert.match(w.note, /1 von 3/);
  assert.equal(achseUeberTeam(h, picks, "poke"), null);
});

test("Skalierung ist als gemessen markiert und zaehlt nicht doppelt", () => {
  assert.ok(GEMESSEN_VORHANDEN.has("scaling"));
});

test("Abdeckung sagt, wie viel ueberhaupt gepflegt ist", () => {
  const h = heuristikAnlegen({champions: {Ornn: {frontline: 2}}});
  const a = h.abdeckung(["Ornn", "Jhin", "Lulu", "Jax"]);
  assert.equal(a.gepflegt, 1);
  assert.equal(a.gesamt, 4);
  assert.equal(a.anteil, 0.25);
});

test("ausgepraegte Frontline traegt Peel teilweise mit - und sagt das", () => {
  const h = heuristikAnlegen({champions: {
    Ornn: {frontline: 2}, Leona: {frontline: 2, peel: 2}, Jhin: {poke: 2},
    Sion: {frontline: 1}}});
  const ornn = h.achse("Ornn", "peel");
  assert.equal(ornn.value, 0.5, "ausgepraegt (2) zaehlt als teilweise (1)");
  assert.equal(ornn.abgeleitetAus, "frontline");
  assert.match(ornn.note, /\u00fcber frontline/);
  assert.equal(h.achse("Leona", "peel").value, 1, "eigener Peel geht vor");
  assert.equal(h.achse("Leona", "peel").abgeleitetAus, undefined);
  assert.equal(h.achse("Sion", "peel").value, 0.25);
  assert.equal(h.achse("Jhin", "peel"), null, "ohne Frontline nichts abgeleitet");
  assert.equal(h.achse("Ornn", "frontline").value, 1, "die Quelle bleibt unveraendert");
});
