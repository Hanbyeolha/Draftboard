/* Zustandsmodell: Zugfolge, Sperren, Schluessel. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  leererDraft, zieh, zurueck, amZug, phase, fertig, gesperrt,
  offeneRollen, schluessel, ausFeldern, ZUGFOLGE,
} from "../engine/state.js";

test("leerer Draft steht auf dem ersten Ban von Blau", () => {
  const s = leererDraft();
  assert.equal(amZug(s).seite, "blue");
  assert.equal(amZug(s).art, "ban");
  assert.equal(phase(s), "ban1");
  assert.equal(fertig(s), false);
});

test("Zugfolge hat 10 Bans und 10 Picks", () => {
  assert.equal(ZUGFOLGE.filter((z) => z.art === "ban").length, 10);
  assert.equal(ZUGFOLGE.filter((z) => z.art === "pick").length, 10);
  assert.equal(ZUGFOLGE.filter((z) => z.seite === "blue").length, 10);
});

test("ein voller Draft laeuft bis complete", () => {
  let s = leererDraft();
  for (let i = 0; i < ZUGFOLGE.length; i++) s = zieh(s, "C" + i);
  assert.equal(fertig(s), true);
  assert.equal(phase(s), "complete");
  assert.equal(s.picks.blue.length, 5);
  assert.equal(s.picks.red.length, 5);
  assert.equal(s.bans.blue.length, 5);
});

test("zieh veraendert den alten Zustand nicht", () => {
  const s = leererDraft();
  const t = zieh(s, "Ornn");
  assert.equal(s.zug, 0);
  assert.equal(t.zug, 1);
  assert.equal(s.bans.blue.length, 0);
});

test("ein gesperrter Champion kann nicht noch einmal gezogen werden", () => {
  let s = zieh(leererDraft(), "Ornn");
  assert.throws(() => zieh(s, "Ornn"), /nicht mehr verfuegbar/);
});

test("Fearless sperrt, mit Grund", () => {
  const s = leererDraft({fearless: ["Jax"]});
  const g = gesperrt(s);
  assert.equal(g.get("Jax").art, "fearless");
  assert.throws(() => zieh(s, "Jax"), /nicht mehr verfuegbar/);
});

test("zurueck nimmt genau einen Zug zurueck", () => {
  let s = leererDraft();
  s = zieh(s, "A");
  s = zieh(s, "B");
  s = zurueck(s);
  assert.equal(s.zug, 1);
  assert.deepEqual(s.bans.blue, ["A"]);
  assert.deepEqual(s.bans.red, []);
  assert.equal(zurueck(leererDraft()).zug, 0);
});

test("offene Rollen zaehlen nur zugeordnete Picks", () => {
  let s = leererDraft();
  for (let i = 0; i < 6; i++) s = zieh(s, "B" + i);   // Banphase
  s = zieh(s, "Ornn", {rolle: "TOP"});
  assert.equal(offeneRollen(s, "blue").length, 4);
  assert.ok(!offeneRollen(s, "blue").includes("TOP"));
  s = zieh(s, "Ahri");                                 // Rolle offen
  assert.equal(offeneRollen(s, "red").length, 5);
});

test("gleicher Zustand ergibt gleichen Schluessel, anderer nicht", () => {
  const a = zieh(leererDraft({patch: "16.19.1"}), "Ornn");
  const b = zieh(leererDraft({patch: "16.19.1"}), "Ornn");
  const c = zieh(leererDraft({patch: "16.19.1"}), "Jax");
  assert.equal(schluessel(a), schluessel(b));
  assert.notEqual(schluessel(a), schluessel(c));
});

test("ausFeldern uebersetzt die Oberflaeche und markiert die Schaetzung", () => {
  const s = ausFeldern({
    wirSind: "blue",
    picks: {eigen: ["Ornn", null, null, null, null],
            gegner: ["Jax", null, null, null, null]},
    bans: {eigen: ["Zed"], gegner: []},
  });
  assert.equal(s.picks.blue[0].champ, "Ornn");
  assert.equal(s.picks.blue[0].rolle, "TOP");
  assert.equal(s.picks.red[0].champ, "Jax");
  assert.deepEqual(s.bans.blue, ["Zed"]);
  assert.equal(s.zugGeschaetzt, true);
});

/* Audit P2.6: vorher pruefte nur das Ban-Feld (in template.html). Ein
   Pick-Feld nahm Gebanntes, schon Gepicktes und durch Fearless
   Gesperrtes an. Jetzt eine Pruefung fuer beide Feldarten. */
test("P2.6: Pick- und Ban-Felder sperren dasselbe, das eigene Feld nicht", async () => {
  const { feldSperre } = await import("../engine/state.js");
  const felder = {picks: {eigen: [null, null, "Syndra", null, null],
                          gegner: ["Ornn", null, null, null, null]},
                  bans: {eigen: ["Zed", null, null, null, null], gegner: []}};
  const pick = (champ, seite, i, fearless = []) =>
    feldSperre(felder, champ, {art: "picks", seite, i, fearless});
  assert.equal(pick("Zed", "eigen", 2), "schon gebannt");
  assert.equal(pick("Ornn", "eigen", 0), "schon gepickt");
  assert.match(pick("Ahri", "eigen", 2, ["Ahri"]), /Fearless/);
  assert.equal(pick("Syndra", "eigen", 2), null, "das eigene Feld bestaetigen geht");
  assert.equal(pick("Syndra", "gegner", 2), "schon gepickt", "auf der anderen Seite nicht");
  assert.equal(pick("Jax", "eigen", 0), null);
  assert.equal(pick(null, "eigen", 0), null);
  // Ban-Felder wie bisher (liveBanSperre)
  const ban = (champ, seite, i) => feldSperre(felder, champ, {art: "bans", seite, i});
  assert.equal(ban("Zed", "eigen", 0), null, "eigener Ban bestaetigt");
  assert.equal(ban("Zed", "gegner", 0), "schon gebannt");
  assert.equal(ban("Syndra", "eigen", 1), "schon gepickt");
});

test("P2.6: die Oberflaeche prueft Pick-Felder mit derselben Funktion", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync("template.html", "utf8");
  assert.ok(!/art === "bans" && champ \? liveBanSperre/.test(html),
            "die Pruefung haengt nicht mehr nur am Ban-Feld");
  assert.match(html, /ENGINE\.feldSperre\(/);
});
