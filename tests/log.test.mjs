/* Protokoll: mitschreiben, nachtragen, nichts Persoenliches. */
import test from "node:test";
import assert from "node:assert/strict";
import { protokollAnlegen, FASSUNG } from "../engine/log.js";
import { leererDraft, schluessel } from "../engine/state.js";

/** Ein Speicher wie localStorage, nur im Arbeitsspeicher. */
function speicherAttrappe({kaputt = false, voll = false} = {}) {
  const daten = new Map();
  return {
    getItem: (k) => { if (kaputt) throw new Error("kaputt");
                      return daten.has(k) ? daten.get(k) : null; },
    setItem: (k, v) => { if (voll) throw new Error("voll"); daten.set(k, v); },
    _daten: daten,
  };
}

const EMPFEHLUNGEN = [
  {champion: "Ornn", score: 74, confidence: 0.8, lookahead: {robustheit: "hoch"}},
  {champion: "Jax", score: 68, confidence: 0.7},
  {champion: "Gnar", score: 61, confidence: 0.6},
];

function lage() {
  const s = leererDraft({patch: "16.19.1", wirSind: "blue"});
  s.picks.red.push({champ: "Vladimir", rolle: "MIDDLE"});
  s.bans.blue.push("Zed");
  return s;
}

test("ein Eintrag haelt Lage, Empfehlung und Modellfassung", () => {
  const p = protokollAnlegen();
  const s = lage();
  const e = p.notiere(s, "TOP", EMPFEHLUNGEN, {risikoprofil: "ausgewogen"});
  assert.equal(e.rolle, "TOP");
  assert.equal(e.patch, "16.19.1");
  assert.equal(e.wirSind, "blue");
  assert.deepEqual(e.lage.picks.red, [["Vladimir", "MIDDLE"]]);
  assert.deepEqual(e.lage.bans.blue, ["Zed"]);
  assert.equal(e.empfohlen.length, 3);
  assert.equal(e.empfohlen[0].champ, "Ornn");
  assert.equal(e.empfohlen[0].robustheit, "hoch");
  assert.ok(e.modell.optimizer, "Modellfassung festgehalten");
  assert.ok(e.zeit);
});

test("nur die Spitze wird festgehalten", () => {
  const p = protokollAnlegen();
  const viele = Array.from({length: 40}, (_, i) =>
    ({champion: "C" + i, score: 90 - i, confidence: 0.5}));
  const e = p.notiere(lage(), "TOP", viele);
  assert.equal(e.empfohlen.length, 10);
});

test("nichts Persoenliches im Eintrag", () => {
  const p = protokollAnlegen();
  const roh = JSON.stringify(p.notiere(lage(), "TOP", EMPFEHLUNGEN));
  for (const wort of ["riotId", "#", "bandit", "label", "summoner"]) {
    assert.ok(!roh.includes(wort), "enthaelt " + wort);
  }
});

test("der tatsaechliche Pick laesst sich nachtragen", () => {
  const p = protokollAnlegen();
  const s = lage();
  p.notiere(s, "TOP", EMPFEHLUNGEN);
  assert.equal(p.alle()[0].gewaehlt, null);
  const k = schluessel(s, "TOP");
  const e = p.nachtragen(k, "Jax");
  assert.equal(e.gewaehlt, "Jax");
  assert.equal(p.alle()[0].gewaehlt, "Jax");
  assert.equal(p.nachtragen("gibtsnicht", "Ornn"), null);
});

test("Uebereinstimmung zaehlt Top-1 und Top-3 - und sagt, was sie nicht ist", () => {
  const p = protokollAnlegen();
  const s = lage();
  assert.equal(p.uebereinstimmung(), null, "ohne Picks keine Zahl");
  p.notiere(s, "TOP", EMPFEHLUNGEN, {gewaehlt: "Ornn"});
  p.notiere(s, "TOP", EMPFEHLUNGEN, {gewaehlt: "Gnar"});
  p.notiere(s, "TOP", EMPFEHLUNGEN, {gewaehlt: "Teemo"});
  const u = p.uebereinstimmung();
  assert.equal(u.n, 3);
  assert.ok(Math.abs(u.top1 - 1 / 3) < 1e-9);
  assert.ok(Math.abs(u.top3 - 2 / 3) < 1e-9);
  assert.match(u.hinweis, /nicht Erfolg/);
});

test("Eintraege ueberleben einen Neustart", () => {
  const sp = speicherAttrappe();
  protokollAnlegen({speicher: sp}).notiere(lage(), "TOP", EMPFEHLUNGEN);
  const zweites = protokollAnlegen({speicher: sp});
  assert.equal(zweites.anzahl(), 1);
  assert.equal(zweites.alle()[0].empfohlen[0].champ, "Ornn");
});

test("ein kaputter oder voller Speicher haelt den Draft nicht auf", () => {
  const kaputt = protokollAnlegen({speicher: speicherAttrappe({kaputt: true})});
  assert.equal(kaputt.anzahl(), 0);
  const voll = protokollAnlegen({speicher: speicherAttrappe({voll: true})});
  assert.doesNotThrow(() => voll.notiere(lage(), "TOP", EMPFEHLUNGEN));
  assert.equal(voll.anzahl(), 1, "im Arbeitsspeicher steht er trotzdem");
});

test("eine fremde Fassung wird nicht gelesen", () => {
  const sp = speicherAttrappe();
  sp.setItem("draft-protokoll",
             JSON.stringify({fassung: FASSUNG + 1, eintraege: [{x: 1}]}));
  assert.equal(protokollAnlegen({speicher: sp}).anzahl(), 0);
});

test("die Grenze haelt die aeltesten raus", () => {
  const p = protokollAnlegen({grenze: 5});
  for (let i = 0; i < 9; i++) {
    p.notiere(lage(), "TOP", EMPFEHLUNGEN, {gewaehlt: "C" + i});
  }
  assert.equal(p.anzahl(), 5);
  assert.equal(p.alle()[0].gewaehlt, "C4");
});

test("das Protokoll laesst sich ausgeben", () => {
  const p = protokollAnlegen();
  p.notiere(lage(), "TOP", EMPFEHLUNGEN);
  const d = JSON.parse(p.alsJson());
  assert.equal(d.fassung, FASSUNG);
  assert.equal(d.eintraege.length, 1);
});

test("ein Eintrag haelt Modus, Kategorien und Gruppen - und spaeter das Ergebnis", () => {
  const p = protokollAnlegen({speicher: null});
  const r = {champion: "Ornn", score: 70, confidence: 0.8, entscheidung: 68,
             modus: "blind",
             components: {meta: {gewicht: 14, beitrag: 10},
                          blindSicherheit: {gewicht: 18, beitrag: 12}},
             blindDetail: {ev: 0.012, schlechtestes: -0.02,
                           konter: [{champ: "Jax"}]}};
  const e = p.notiere(leererDraft({patch: "1.0"}), "TOP", [r], {
    draft: 7, kategorien: [{art: "gesamt", r}]});
  assert.equal(e.modus, "blind");
  assert.deepEqual(e.kategorien, [{art: "gesamt", champ: "Ornn"}]);
  assert.equal(e.empfohlen[0].gruppen.draftgap, 71);
  assert.equal(e.empfohlen[0].gruppen.spieler, null, "fehlt -> null, nicht 0");
  assert.deepEqual(e.empfohlen[0].blind.konter, ["Jax"]);
  assert.equal(e.ergebnis, null);
  assert.equal(p.ergebnis(7, true), 1);
  assert.equal(p.alle()[0].ergebnis, "sieg");
  p.nachtragen(e.schluessel, "Ornn");
  const a = p.auswertung();
  assert.equal(a.sieg.n, 1);
  assert.equal(a.sieg.top1, 1);
  assert.match(a.hinweis, /zu wenig/);
});
