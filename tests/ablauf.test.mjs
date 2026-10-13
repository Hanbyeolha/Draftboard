/* Der Draft-Ablauf: wer ist dran, welche Phase, welcher Schritt (Draftboard 2.0,
   Phase 1). Grundlage fuer Fortschrittsleiste und Zustandskopf. */
import test from "node:test";
import assert from "node:assert/strict";
import { ablauf } from "../engine/ablauf.js";
import { leererDraft } from "../engine/state.js";

/** Ein Zustand mit nb/nr Bans und pb/pr Picks je Seite. */
function lage({wirSind = "blue", nb = 0, nr = 0, pb = 0, pr = 0} = {}) {
  const s = leererDraft({wirSind});
  for (let i = 0; i < nb; i++) s.bans.blue.push("BB" + i);
  for (let i = 0; i < nr; i++) s.bans.red.push("RB" + i);
  for (let i = 0; i < pb; i++) s.picks.blue.push({champ: "BP" + i, rolle: null});
  for (let i = 0; i < pr; i++) s.picks.red.push({champ: "RP" + i, rolle: null});
  return s;
}

test("leerer Draft: wartet, erster Schritt ist Blaus Ban", () => {
  const a = ablauf(lage());
  assert.equal(a.zustand, "IDLE");
  assert.equal(a.phase, "BAN_PHASE");
  assert.deepEqual([a.schritt.nr, a.schritt.seite, a.schritt.art, a.schritt.wir], [0, "blue", "ban", true]);
  assert.equal(a.schritte.length, 20);
  assert.equal(a.schritte.filter((x) => x.status === "aktuell").length, 1);
});

test("Turnierfolge: Ban um Ban, dann die erste Pickrunde", () => {
  assert.equal(ablauf(lage({nb: 1})).zustand, "OPPONENT_TURN");
  assert.equal(ablauf(lage({nb: 1})).schritt.seite, "red");
  const a = ablauf(lage({nb: 3, nr: 3}));
  assert.equal(a.phase, "PICK_PHASE");
  assert.equal(a.zustand, "OUR_TURN");
  assert.equal(a.schritt.nr, 6);
  assert.equal(a.runde, "pick1");
  // B R R: nach Blaus erstem Pick ist Rot zweimal dran.
  assert.equal(ablauf(lage({nb: 3, nr: 3, pb: 1})).schritt.seite, "red");
  assert.equal(ablauf(lage({nb: 3, nr: 3, pb: 1, pr: 1})).schritt.seite, "red");
  assert.equal(ablauf(lage({nb: 3, nr: 3, pb: 1, pr: 2})).schritt.seite, "blue");
});

test("zweite Banrunde und letzter Pick", () => {
  const a = ablauf(lage({nb: 3, nr: 3, pb: 3, pr: 3}));
  assert.equal(a.runde, "ban2");
  assert.equal(a.schritt.seite, "red", "Rot beginnt die zweite Banrunde");
  const z = ablauf(lage({nb: 5, nr: 5, pb: 5, pr: 4}));
  assert.equal(z.schritt.nr, 19);
  assert.equal(z.zustand, "OPPONENT_TURN");
  const fertig = ablauf(lage({nb: 5, nr: 5, pb: 5, pr: 5}));
  assert.equal(fertig.zustand, "COMPLETE");
  assert.equal(fertig.schritt, null);
});

test("nicht eingetragene Bans gelten als uebersprungen, nicht als offen", () => {
  const a = ablauf(lage({pb: 1, pr: 1}));
  assert.equal(a.schritt.nr, 8, "Rot pickt ein zweites Mal");
  assert.equal(a.schritte.slice(0, 6).every((x) => x.status === "uebersprungen"), true);
  assert.notEqual(a.zustand, "IDLE");
});

test("ein fehlender Pick bleibt offen - er wird nicht uebersprungen", () => {
  // Blau hat zwei Picks, Rot keinen: Rot ist mit Pick 7 dran.
  const a = ablauf(lage({nb: 3, nr: 3, pb: 2}));
  assert.equal(a.schritt.nr, 7);
  assert.equal(a.schritt.seite, "red");
});

test("rote Seite: Blau beginnt, wir warten", () => {
  const a = ablauf(lage({wirSind: "red"}));
  assert.equal(a.schritt.seite, "blue");
  assert.equal(a.schritt.wir, false);
  assert.equal(ablauf(lage({wirSind: "red", nb: 1})).zustand, "OUR_TURN");
});

test("Fortschritt je Seite und Art", () => {
  const a = ablauf(lage({nb: 3, nr: 2, pb: 1}));
  assert.deepEqual(a.fortschritt.blue, {bans: {getan: 3, gesamt: 5}, picks: {getan: 1, gesamt: 5}});
  assert.deepEqual(a.fortschritt.red, {bans: {getan: 2, gesamt: 5}, picks: {getan: 0, gesamt: 5}});
});

test("Solo Queue: alle bannen gleichzeitig, dann B R R B B R R B B R", () => {
  const leer = ablauf(lage(), {modus: "solo"});
  assert.equal(leer.phase, "BAN_PHASE");
  assert.equal(leer.schritt.seite, "beide");
  assert.equal(leer.schritte.length, 11, "eine Banphase plus zehn Picks");
  const bans = ablauf(lage({nb: 5, nr: 5}), {modus: "solo"});
  assert.equal(bans.phase, "PICK_PHASE");
  assert.equal(bans.schritt.seite, "blue");
  // Ein Pick beendet die Banphase, auch wenn nicht alle Bans eingetragen sind.
  const ohne = ablauf(lage({pb: 1}), {modus: "solo"});
  assert.equal(ohne.schritt.seite, "red");
  assert.equal(ohne.schritte[0].status, "uebersprungen");
  assert.equal(ablauf(lage({nb: 5, nr: 5, pb: 5, pr: 5}), {modus: "solo"}).zustand, "COMPLETE");
});
