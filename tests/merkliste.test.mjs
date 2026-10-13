/* Shortlist und Status je Champion (Draftboard 2.0, Phase 2): gemerkt,
   erwogen, verworfen - und was passiert, wenn der Gegner einen nimmt. */
import test from "node:test";
import assert from "node:assert/strict";
import { merkSetzen, merkUmschalten, merkStatus, merkAuswertung, merkNeuVergeben }
  from "../engine/merkliste.js";

test("Status setzen, lesen, zuruecknehmen - ohne die alte Liste zu veraendern", () => {
  const leer = {};
  const a = merkSetzen(leer, "Aurora", "SHORTLISTED");
  assert.deepEqual(leer, {}, "unveraenderlich");
  assert.equal(merkStatus(a, "Aurora"), "SHORTLISTED");
  assert.equal(merkStatus(a, "Syndra"), "UNREVIEWED");
  const b = merkSetzen(a, "Aurora", "UNREVIEWED");
  assert.equal(merkStatus(b, "Aurora"), "UNREVIEWED");
  assert.deepEqual(b, {});
  assert.throws(() => merkSetzen(a, "X", "UNSINN"));
});

test("Umschalten: derselbe Status nimmt ihn zurueck, ein anderer ersetzt ihn", () => {
  let l = merkUmschalten({}, "Syndra", "SHORTLISTED");
  assert.equal(merkStatus(l, "Syndra"), "SHORTLISTED");
  l = merkUmschalten(l, "Syndra", "REJECTED");
  assert.equal(merkStatus(l, "Syndra"), "REJECTED");
  l = merkUmschalten(l, "Syndra", "REJECTED");
  assert.equal(merkStatus(l, "Syndra"), "UNREVIEWED");
});

test("Auswertung: Shortlist in Reihenfolge, vergebene markiert, freie gezaehlt", () => {
  let l = {};
  for (const c of ["Aurora", "Orianna", "Syndra"]) l = merkSetzen(l, c, "SHORTLISTED");
  l = merkSetzen(l, "Viktor", "REJECTED");
  const a = merkAuswertung(l, new Set(["Orianna"]));
  assert.deepEqual(a.shortlist.map((x) => [x.champ, x.vergeben]),
                   [["Aurora", false], ["Orianna", true], ["Syndra", false]]);
  assert.equal(a.frei, 2);
  assert.deepEqual(a.verworfen, ["Viktor"]);
});

test("neu vergeben: nur, was seit dem letzten Stand weggeschnappt wurde", () => {
  let l = {};
  for (const c of ["Aurora", "Orianna", "Syndra"]) l = merkSetzen(l, c, "SHORTLISTED");
  l = merkSetzen(l, "Ahri", "CONSIDERED");
  const vorher = new Set(["Zed"]);
  const nachher = new Set(["Zed", "Orianna", "Ahri", "Jax"]);
  assert.deepEqual(merkNeuVergeben(l, vorher, nachher), ["Orianna"],
                   "nur die Shortlist meldet - nicht Erwogenes, nicht Fremdes");
  assert.deepEqual(merkNeuVergeben(l, nachher, nachher), []);
});
