import test from "node:test";
import assert from "node:assert/strict";
import { championSuche } from "../engine/championsuche.js";

const ALLE = ["Aatrox", "Aurelion Sol", "Aurora", "Kai'Sa", "Miss Fortune", "Rell", "Sona",
              "Zed", "Dr. Mundo", "Nunu & Willump", "Soraka"];

test("Anfang vor Wortanfang vor enthaelt, innerhalb alphabetisch", () => {
  assert.deepEqual(championSuche("aur", ALLE).map((t) => t.champ), ["Aurelion Sol", "Aurora"]);
  const so = championSuche("so", ALLE);
  assert.deepEqual(so.map((t) => [t.champ, t.stufe]), [
    ["Sona", "anfang"], ["Soraka", "anfang"], ["Aurelion Sol", "wortanfang"]]);
});

test("Wortanfang mit Satzzeichen im Namen", () => {
  assert.equal(championSuche("sa", ALLE)[0].champ, "Kai'Sa");
  assert.equal(championSuche("mundo", ALLE)[0].champ, "Dr. Mundo");
  assert.equal(championSuche("willump", ALLE)[0].champ, "Nunu & Willump");
  assert.equal(championSuche("kaisa", ALLE)[0].stufe, "genau");
});

test("Kuerzel aus der Aliasliste zaehlen als genau", () => {
  const t = championSuche("MF", ALLE, {aliase: {mf: "Miss Fortune"}});
  assert.deepEqual(t[0], {champ: "Miss Fortune", stufe: "genau", gesperrt: null});
});

test("enthaelt erst ab zwei Zeichen, damit ein Buchstabe nicht alles findet", () => {
  assert.deepEqual(championSuche("e", ALLE).map((t) => t.champ), []);
  assert.deepEqual(championSuche("ell", ALLE).map((t) => t.champ), ["Rell"]);
});

test("Gesperrte bleiben sichtbar, mit Grund, aber hinter den freien", () => {
  const gesperrt = new Map([["Sona", "gebannt"]]);
  const t = championSuche("so", ALLE, {gesperrt});
  assert.deepEqual(t.map((x) => x.champ), ["Soraka", "Aurelion Sol", "Sona"]);
  assert.equal(t[2].gesperrt, "gebannt");
  assert.deepEqual(championSuche("zed", ALLE, {gesperrt: new Map([["Zed", "gebannt"]])}),
                   [{champ: "Zed", stufe: "genau", gesperrt: "gebannt"}]);
});

test("ein genauer Treffer steht vorn, auch wenn er gesperrt ist", () => {
  const namen = ["Vi", "Viego", "Viktor"];
  const t = championSuche("vi", namen, {gesperrt: new Map([["Vi", "gebannt"]])});
  assert.deepEqual(t.map((x) => [x.champ, x.gesperrt]), [["Vi", "gebannt"], ["Viego", null], ["Viktor", null]]);
});

test("leer und ohne Treffer", () => {
  assert.deepEqual(championSuche("", ALLE), []);
  assert.deepEqual(championSuche("  ", ALLE), []);
  assert.deepEqual(championSuche("xyzq", ALLE), []);
  assert.equal(championSuche("a", ALLE, {max: 2}).length, 2);
});
