/* Datenschicht gegen die echten eingebetteten Daten. */
import test from "node:test";
import assert from "node:assert/strict";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen, moeglicheRollen, istFlex, patchWarnung } from "../engine/data.js";
import { konfidenzAusStichprobe, konfidenzWort, patchAbstand } from "../engine/provenance.js";

const DATA = ladeDaten();
const q = quelleAnlegen(DATA.draft);

test("die Quelle kennt alle Champions und den Patch", () => {
  assert.ok(q.champions.length > 150, "Champions: " + q.champions.length);
  assert.match(q.patch, /^\d+\.\d+/);
  assert.ok(q.kennt("Ornn"));
  assert.ok(!q.kennt("Kein Champion"));
});

test("Patchstaerke kommt mit Herkunft und Stichprobe", () => {
  const w = q.staerke("Ornn", "TOP");
  assert.equal(w.source, "draftgap");
  assert.equal(w.patch, q.patch);
  assert.ok(w.sampleSize > 1000);
  assert.ok(w.value > 0.3 && w.value < 0.7, "Quote: " + w.value);
  assert.ok(w.confidence > 0.9);
});

test("Nebenrollen fallen weg statt zu raten", () => {
  // Ahri hat Partien auf Top, aber verschwindend wenige gegen Mid.
  assert.equal(q.staerke("Ahri", "TOP"), null);
  assert.ok(q.staerke("Ahri", "MIDDLE"));
});

test("Rollenverteilung statt einer einzelnen Rolle", () => {
  const r = moeglicheRollen(q, "Thresh");
  assert.equal(r[0].rolle, "UTILITY");
  assert.ok(r[0].anteil > 0.9, "Anteil: " + r[0].anteil);
});

test("Flex erkennt Mehrdeutigkeit", () => {
  // Thresh ist eindeutig Support, Pantheon wird auf mehreren Rollen gespielt.
  assert.equal(istFlex(q, "Thresh"), false);
  const p = moeglicheRollen(q, "Pantheon");
  assert.ok(p.length >= 2, "Pantheon-Rollen: " + JSON.stringify(p));
});

test("Matchup und Synergie liefern gemessene Quoten oder null", () => {
  const m = q.matchup("Ornn", "TOP", "Malphite", "TOP");
  if (m) {
    assert.equal(m.source, "draftgap");
    assert.ok(m.sampleSize >= 50, "unter der Mindeststichprobe: " + m.sampleSize);
  }
  // Eine Paarung, die es nicht gibt, wird nicht erfunden.
  assert.equal(q.matchup("Ornn", "TOP", "Kein Champion", "TOP"), null);
});

test("Schadensprofil ist ein Anteil", () => {
  const a = q.schaden("Veigar", "MIDDLE");
  const b = q.schaden("Zed", "MIDDLE");
  assert.ok(a.value > 0.8, "Veigar magisch: " + a.value);
  assert.ok(b.value < 0.2, "Zed magisch: " + b.value);
});

test("die Skalierungskurve ist gemessen und zeigt in die richtige Richtung", () => {
  const kayle = q.skalierung("Kayle", "TOP");
  const pantheon = q.skalierung("Pantheon", "UTILITY");
  assert.ok(kayle.value > 0.05, "Kayle skaliert: " + kayle.value);
  assert.ok(pantheon.value < 0, "Pantheon faellt ab: " + pantheon.value);
  const k = q.kurve("Kayle", "TOP");
  assert.equal(k.value.length, 5);
  assert.equal(k.source, "draftgap");
});

test("Konfidenz waechst mit der Stichprobe und saettigt", () => {
  assert.equal(konfidenzAusStichprobe(10), 0);
  assert.equal(konfidenzAusStichprobe(43), 0);
  assert.ok(konfidenzAusStichprobe(300) > 0.3);
  assert.ok(konfidenzAusStichprobe(2500) === 1);
  assert.ok(konfidenzAusStichprobe(2500) === konfidenzAusStichprobe(25000));
  assert.equal(konfidenzWort(0.8), "hoch");
  assert.equal(konfidenzWort(null), "unbekannt");
});

test("Patchabstand wird gemessen, nicht geraten", () => {
  assert.equal(patchAbstand("16.19.1", "16.21.0"), 2);
  assert.equal(patchAbstand("16.19.1", null), null);
  assert.equal(patchWarnung(q, q.patch), null);
  const w = patchWarnung(q, "16.25.0");
  assert.ok(w && w.abstand >= 2, JSON.stringify(w));
});

test("eine leere Quelle liefert ueberall null statt zu krachen", () => {
  const leer = quelleAnlegen(null);
  assert.equal(leer.staerke("Ornn", "TOP"), null);
  assert.equal(leer.matchup("Ornn", "TOP", "Jax", "TOP"), null);
  assert.deepEqual(leer.champions, []);
});
