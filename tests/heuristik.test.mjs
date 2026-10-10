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
  const h = heuristikAnlegen(roh);
  assert.equal(h.achse("Ornn", "engage"), null);
  assert.equal(h.profil("Ornn"), null);
  assert.equal(h.kennt("Ornn"), false);
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
  assert.match(w.note, /Einschaetzung/);
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
