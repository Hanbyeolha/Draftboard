/* Der Match-Score: Teile, Spur, Konfidenz, Deckel. */
import test from "node:test";
import assert from "node:assert/strict";
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { teamAnlegen } from "../engine/team.js";
import { bewerterAnlegen } from "../engine/score.js";
import { leererDraft, zieh } from "../engine/state.js";
import { GEWICHTE, KOMFORT, VERSION } from "../engine/config.js";

const DATA = ladeDaten();
const quelle = quelleAnlegen(DATA.draft);
const leer = heuristikAnlegen({champions: {}});
const merkmale = merkmaleAnlegen(quelle, leer);
const comp = compAnlegen(merkmale, leer);
const team = teamAnlegen(DATA.teams);
const B = bewerterAnlegen({quelle, merkmale, comp, team, heuristik: leer});

/** Einen Zustand bauen, ohne die Zugfolge einzeln abzulaufen. */
function zustand({unsere = [], ihre = [], bans = []} = {}) {
  const s = leererDraft({patch: quelle.patch, wirSind: "blue"});
  for (const c of bans) s.bans.red.push(c);
  for (const p of unsere) s.picks.blue.push({champ: p.champ, rolle: p.rolle});
  for (const p of ihre) s.picks.red.push({champ: p.champ, rolle: p.rolle});
  return s;
}

test("ein leerer Draft bewertet allein nach Patchstaerke und Flex", () => {
  const r = B.bewerte(zustand(), "Ornn", "TOP");
  assert.equal(r.champion, "Ornn");
  assert.ok(r.components.meta, "Patchstaerke");
  assert.equal(r.components.matchup, undefined, "ohne Gegner kein Matchup");
  assert.equal(r.components.synergie, undefined);
  assert.equal(r.components.lookahead, undefined, "Phase 5 fehlt noch");
  assert.ok(r.score >= 0 && r.score <= 100, "Punkte: " + r.score);
  assert.equal(Number.isInteger(r.score), true, "keine Scheingenauigkeit");
});

test("ein Champion auf einer Nebenrolle wird nicht bewertet", () => {
  assert.equal(B.bewerte(zustand(), "Ahri", "TOP"), null);
});

test("Matchups tauchen erst mit gegnerischen Picks auf, mit Text", () => {
  // Seit Audit P1.1 getrennt: der Lanegegner zaehlt unter "lane", alle
  // uebrigen unter "matchup". Ornn auf Top ist fuer Jax der Lanegegner,
  // Ahri auf Mid nicht.
  const s = zustand({ihre: [{champ: "Ornn", rolle: "TOP"},
                            {champ: "Ahri", rolle: "MIDDLE"}]});
  const r = B.bewerte(s, "Jax", "TOP");
  assert.ok(r.components.matchup, "Matchup vorhanden");
  assert.equal(r.components.matchup.quelle, "draftgap");
  assert.match(r.components.matchup.text, /gegen 1 ihrer Picks/);
  assert.ok(r.components.matchup.konfidenz > 0);
  assert.ok(r.components.lane, "Lane vorhanden");
  assert.equal(r.components.lane.quelle, "draftgap");
  assert.match(r.components.lane.text, /gegen den Lanegegner/);
});

test("Synergien tauchen mit eigenen Picks auf", () => {
  const s = zustand({unsere: [{champ: "Thresh", rolle: "UTILITY"}]});
  const r = B.bewerte(s, "Caitlyn", "BOTTOM");
  assert.ok(r.components.synergie, "Synergie vorhanden");
  assert.match(r.components.synergie.text, /mit 1 eigenen Picks/);
});

test("fehlende Teile senken die Note nicht, nur die Sicherheit", () => {
  // Ein eigener Pick bringt die Synergie als zusaetzlichen Teil. (Ein
  // bekannter Lanegegner taugt dafuer nicht mehr: er TAUSCHT den
  // Szenarioteil gegen die gemessene Paarung, beide gleich schwer.)
  const ohne = B.bewerte(zustand(), "Ornn", "TOP");
  const mit = B.bewerte(zustand({unsere: [{champ: "Lee Sin", rolle: "JUNGLE"}]}),
                        "Ornn", "TOP");
  assert.equal(ohne.components.synergie, undefined);
  assert.ok(mit.components.synergie);
  // Der Hoechstwert waechst mit den vorhandenen Teilen - die Note bleibt
  // vergleichbar, statt durch Fehlendes gedrueckt zu werden.
  assert.ok(mit.hoechstwert > ohne.hoechstwert);
  assert.ok(ohne.score > 0, "ohne eigene Picks trotzdem bewertbar");
});

test("die Spur nennt Gewicht, Beitrag, Quelle und Text je Teil", () => {
  const r = B.bewerte(zustand({ihre: [{champ: "Ornn", rolle: "TOP"}]}),
                      "Jax", "TOP");
  for (const [name, t] of Object.entries(r.components)) {
    assert.ok(Number.isFinite(t.roh), name + ": roh");
    assert.ok(Number.isFinite(t.gewicht), name + ": gewicht");
    assert.ok(Number.isFinite(t.beitrag), name + ": beitrag");
    assert.ok(t.quelle, name + ": quelle");
  }
  assert.ok(Array.isArray(r.reasons));
  assert.ok(Array.isArray(r.risks));
});

test("jede Empfehlung traegt Modellfassung und Patch", () => {
  const r = B.bewerte(zustand(), "Ornn", "TOP");
  assert.equal(r.metadata.optimizerVersion, VERSION.optimizer);
  assert.equal(r.metadata.patch, quelle.patch);
  assert.equal(r.metadata.risikoprofil, "ausgewogen");
});

test("Komfort wirkt - aber gedeckelt", () => {
  const s = zustand();
  const ohne = B.bewerte(s, "Dr. Mundo", "TOP");
  const mit = B.bewerte(s, "Dr. Mundo", "TOP",
                        {spielerTeam: "AFC1", spielerLabel: "bandit"});
  assert.equal(ohne.components.komfort, undefined);
  assert.ok(mit.components.komfort, "Komfort vorhanden");
  const anteil = mit.components.komfort.gewicht / mit.hoechstwert;
  assert.ok(anteil <= KOMFORT.hoechstanteil + 1e-9,
            "Komfortanteil " + anteil + " ueber dem Deckel");
  assert.ok(mit.components.komfort.gewicht <= GEWICHTE.komfort);
});

test("Komfort ueberstimmt einen klaren Nachteil nicht", () => {
  // bandit spielt Dr. Mundo 107 Mal; Gnar kennt er kaum. Gegen einen
  // Gegner, gegen den Mundo schlecht steht, darf Komfort nicht alles
  // drehen - die uebrigen Teile muessen durchschlagen koennen.
  const s = zustand({ihre: [{champ: "Vayne", rolle: "TOP"}]});
  const r = B.bewerte(s, "Dr. Mundo", "TOP",
                      {spielerTeam: "AFC1", spielerLabel: "bandit"});
  const k = r.components.komfort.beitrag;
  const rest = Object.entries(r.components)
    .filter(([n]) => n !== "komfort" && n !== "risiko")
    .reduce((a, [, t]) => a + t.beitrag, 0);
  assert.ok(rest > k, "Komfort " + k.toFixed(1) + " gegen Rest " + rest.toFixed(1));
});

test("blind, Counter und teilweise sind verschiedene Lagen", () => {
  const blind = B.bewerte(zustand(), "Ornn", "TOP");
  const counter = B.bewerte(zustand({ihre: [{champ: "Jax", rolle: "TOP"}]}),
                            "Ornn", "TOP");
  assert.equal(blind.modus, "blind");
  assert.equal(blind.blind, true);
  assert.ok(blind.components.blindSicherheit, "blind: die Szenarien zaehlen");
  assert.equal(counter.modus, "counter");
  assert.equal(counter.blind, false);
  assert.equal(counter.components.blindSicherheit, undefined,
               "mit bekanntem Lanegegner zaehlt die echte Paarung (lane)");
  assert.ok(counter.components.lane);
  assert.equal(counter.components.lane.gewicht, GEWICHTE.blindSicherheit,
               "die Lane zaehlt im Counterfall voll (Audit P1.1)");
  // Botlane halb bekannt: Blindteil und Laneteil je zur Haelfte.
  const halb = B.bewerte(zustand({ihre: [{champ: "Thresh", rolle: "UTILITY"}]}),
                         "Jinx", "BOTTOM");
  assert.equal(halb.modus, "teilweise");
  assert.ok(halb.components.blindSicherheit && halb.components.lane);
  assert.equal(halb.components.blindSicherheit.gewicht,
               GEWICHTE.blindSicherheit / 2);
  assert.equal(halb.components.lane.gewicht, GEWICHTE.blindSicherheit / 2);
});

test("der Blindwert rechnet ueber Szenarien und nennt die Counter", () => {
  const r = B.bewerte(zustand(), "Malphite", "TOP");
  const d = r.blindDetail;
  assert.ok(d.szenarien >= 20, "Szenarien: " + d.szenarien);
  assert.ok(d.abdeckung >= 0.6, "abgedeckt: " + d.abdeckung);
  assert.ok(d.schlechtestes <= d.ev && d.ev <= d.bestes,
            "Fuenftel liegen um den Erwartungswert");
  assert.match(r.components.blindSicherheit.text, /wahrscheinliche Gegner/);
  // Counter absteigend nach Wahrscheinlichkeit mal Schaden.
  const k = d.konter;
  for (let i = 1; i < k.length; i++) {
    assert.ok(k[i - 1].p * -k[i - 1].d >= k[i].p * -k[i].d - 1e-12);
  }
});

test("es gibt keinen zweiten Risikoabzug neben dem Blindwert", () => {
  // Frueher zog "risiko" fuer die Streuung ab, die zugleich als Bonus in
  // "pickReihenfolge" stand - dieselbe Zahl zweimal. Der schlechteste
  // Ausgang wirkt jetzt nur noch im Blindwert und im Lookahead.
  const r = B.bewerte(zustand(), "Malphite", "TOP");
  assert.equal(r.components.risiko, undefined);
  assert.equal(r.components.pickReihenfolge, undefined);
  const summe = Object.values(r.components)
    .reduce((a, t) => a + Math.max(0, t.gewicht), 0);
  assert.equal(r.hoechstwert, summe);
});

test("das Risikoprofil veraendert das Modell, nicht nur die Anzeige", () => {
  const s = zustand();
  const sicher = B.bewerte(s, "Malphite", "TOP", {risikoprofil: "sicher"});
  const mutig = B.bewerte(s, "Malphite", "TOP", {risikoprofil: "aggressiv"});
  const bs = sicher.components.blindSicherheit, bm = mutig.components.blindSicherheit;
  assert.ok(bs.roh < bm.roh,
            "sicher gewichtet das schlechteste Fuenftel: " + bs.roh + " < " + bm.roh);
  assert.ok(sicher.score <= mutig.score);
});

test("ohne Heuristiktabelle gibt es keine Stoerungsachse", () => {
  const s = zustand({ihre: [{champ: "Malphite", rolle: "TOP"},
                            {champ: "Amumu", rolle: "JUNGLE"}]});
  const r = B.bewerte(s, "Janna", "UTILITY");
  assert.equal(r.components.gegnerStoerung, undefined,
               "keine Grundlage, also kein Wert");
});

test("mit gepflegter Tabelle wirkt die Stoerung - als Heuristik erkennbar", () => {
  const h = heuristikAnlegen({
    _stand: "2026-10-09",
    champions: {
      Malphite: {engage: 2}, Amumu: {engage: 2},
      Janna: {disengage: 2, peel: 2},
      Sivir: {poke: 0},
    },
  });
  const mm = merkmaleAnlegen(quelle, h);
  const BH = bewerterAnlegen({quelle, merkmale: mm,
                              comp: compAnlegen(mm, h), team, heuristik: h});
  const s = zustand({ihre: [{champ: "Malphite", rolle: "TOP"},
                            {champ: "Amumu", rolle: "JUNGLE"}]});
  const janna = BH.bewerte(s, "Janna", "UTILITY");
  assert.ok(janna.components.gegnerStoerung, "Janna wirkt gegen Engage");
  assert.equal(janna.components.gegnerStoerung.quelle, "heuristik");
  assert.ok(janna.components.gegnerStoerung.konfidenz < 0.6,
            "Heuristik traegt niedrige Konfidenz");
  assert.match(janna.components.gegnerStoerung.text, /engage/);

  // Seit Audit P1.3: Sivir ist eingeschaetzt und setzt nichts dagegen -
  // das ist eine 0, kein fehlender Wert (vorher fiel der Teil weg).
  const sivir = BH.bewerte(s, "Sivir", "BOTTOM");
  assert.equal(sivir.components.gegnerStoerung.roh, 0, "Sivir setzt nichts dagegen");
  assert.match(sivir.components.gegnerStoerung.text, /nichts gegen ihren Plan/);
});

/* Audit P1.3: eine teilweise Antwort darf nie schlechter dastehen als gar
   keine. Vorher fiel der Teil ohne jede Antwortachse weg (neutral), eine
   schwache Antwort zog ab. Gegner Vi/Zed: Dive und Catch. */
function stoerBewerter(tabelle) {
  const h = heuristikAnlegen(tabelle);
  const mm = merkmaleAnlegen(quelle, h);
  return bewerterAnlegen({quelle, merkmale: mm, comp: compAnlegen(mm, h),
                          team, heuristik: h});
}
const VI_ZED = {Vi: {engage: 1, dive: 2, catch: 2},
                Zed: {dive: 2, splitpush: 1, catch: 1}};

test("P1.3: ohne Antwort zaehlt die Stoerung als 0, nicht als fehlend", () => {
  const BH = stoerBewerter({champions: {...VI_ZED,
    Jayce: {poke: 2, siege: 2},                 // nichts gegen Dive/Catch
    Darius: {frontline: 1, splitpush: 1},       // Peel nur ueber Frontline
    Poppy: {disengage: 2, peel: 2, frontline: 2}}});
  const s = zustand({ihre: [{champ: "Vi", rolle: "JUNGLE"},
                            {champ: "Zed", rolle: "MIDDLE"}]});
  const st = (c) => BH.bewerte(s, c, "TOP").components.gegnerStoerung;
  assert.ok(st("Jayce"), "Jayce ist eingeschaetzt, ihr Plan steht - der Teil ist da");
  assert.equal(st("Jayce").roh, 0);
  assert.ok(st("Darius").roh > st("Jayce").roh, "teilweise > keine");
  assert.ok(st("Poppy").roh > st("Darius").roh, "voll > teilweise");
});

test("P1.3: ungepruefte Ersteinschaetzung bewegt die Stoerung nicht (Entscheidung A)", () => {
  const BH = stoerBewerter({champions: {},
    vorschlag: {...VI_ZED, Poppy: {disengage: 2, peel: 2, frontline: 2}}});
  const s = zustand({ihre: [{champ: "Vi", rolle: "JUNGLE"},
                            {champ: "Zed", rolle: "MIDDLE"}]});
  assert.equal(BH.bewerte(s, "Poppy", "TOP").components.gegnerStoerung, undefined,
               "nur vom Team gepruefte Eintraege gehen in die Note");
  // Gemischt: unser Kandidat geprueft, ihr Plan nur vorgeschlagen -> auch nichts.
  const gemischt = stoerBewerter({champions: {Poppy: {peel: 2}}, vorschlag: VI_ZED});
  assert.equal(gemischt.bewerte(s, "Poppy", "TOP").components.gegnerStoerung, undefined);
});

/* Audit P1.4, Entscheidung A: die ausgelieferte Tabelle ist komplett
   ungeprueft (vorschlag). Sie darf weder Note noch Konfidenz noch einen
   Teil bewegen - auch nicht ueber compFit. Vorher wich die Note bei 20
   von 77 Mid-Kandidaten ab. */
test("P1.4: die ungepruefte Ersteinschaetzung bewegt keine Zahl der Note", async () => {
  const { readFileSync } = await import("node:fs");
  const roh = JSON.parse(readFileSync("data/champion-heuristik.json", "utf8"));
  assert.equal(Object.keys(roh.champions || {}).length, 0,
               "Voraussetzung: noch nichts vom Team geprueft");
  const BV = stoerBewerter(roh);
  const s = zustand({unsere: [{champ: "Ornn", rolle: "TOP"}, {champ: "Lee Sin", rolle: "JUNGLE"},
                              {champ: "Jinx", rolle: "BOTTOM"}],
                     ihre: [{champ: "Jax", rolle: "TOP"}, {champ: "Syndra", rolle: "MIDDLE"},
                            {champ: "Lulu", rolle: "UTILITY"}]});
  let n = 0;
  for (const k of merkmale.kandidaten("MIDDLE")) {
    const a = BV.bewerte(s, k.champ, "MIDDLE"), b = B.bewerte(s, k.champ, "MIDDLE");
    if (!a || !b) continue;
    n++;
    assert.equal(a.score, b.score, k.champ + ": Note");
    assert.equal(a.confidence, b.confidence, k.champ + ": Konfidenz");
    assert.deepEqual(Object.keys(a.components).sort(), Object.keys(b.components).sort());
    if (a.components.compFit) {
      assert.equal(a.components.compFit.roh, b.components.compFit.roh, k.champ + ": compFit");
      assert.equal(a.components.compFit.quelle, b.components.compFit.quelle);
    }
  }
  assert.ok(n > 40, "genug Kandidaten: " + n);
});

test("Gruende und Risiken kommen aus den Teilen, nicht aus der Luft", () => {
  const s = zustand({ihre: [{champ: "Ornn", rolle: "TOP"},
                            {champ: "Wukong", rolle: "JUNGLE"}]});
  const r = B.bewerte(s, "Jax", "TOP",
                      {spielerTeam: "AFC1", spielerLabel: "bandit"});
  for (const g of r.reasons.concat(r.risks)) {
    assert.equal(typeof g, "string");
    assert.ok(g.length > 3);
  }
  // Doppelte werden zusammengefasst.
  assert.equal(r.reasons.length, new Set(r.reasons).size);
});

test("derselbe Zustand ergibt dasselbe Ergebnis", () => {
  const s = zustand({ihre: [{champ: "Ornn", rolle: "TOP"}]});
  const a = B.bewerte(s, "Jax", "TOP");
  const b = B.bewerte(s, "Jax", "TOP");
  assert.deepEqual(a, b, "deterministisch");
});

/* -------------------------------------------------- Keine Turnierdaten */
/* Der Nutzer hat es ausdruecklich verlangt: die Staerke eines Champions
   kommt aus dem Patch, nicht aus unseren eigenen Turnierpartien, und auf
   vergangene Picks und Bans soll sich kaum etwas beziehen. Diese Tests
   halten das fest, damit es niemand versehentlich wieder einbaut. */

test("jeder Teil der Bewertung nennt eine erlaubte Quelle", () => {
  const s = zustand({unsere: [{champ: "Jinx", rolle: "BOTTOM"}],
                     ihre: [{champ: "Ornn", rolle: "TOP"}]});
  const r = B.bewerte(s, "Jax", "TOP",
                      {spielerTeam: "AFC1", spielerLabel: "bandit"});
  const erlaubt = new Set(["draftgap", "team", "heuristik", "gemischt",
                           "abgeleitet"]);
  for (const [name, t] of Object.entries(r.components)) {
    assert.ok(erlaubt.has(t.quelle), name + " hat Quelle " + t.quelle);
  }
});

test("Championstaerke kommt aus dem Patch, nicht aus unseren Partien", () => {
  const r = B.bewerte(zustand(), "Ornn", "TOP");
  assert.equal(r.components.meta.quelle, "draftgap");
  assert.equal(r.metadata.patch, quelle.patch);
  // Die Patchquote muss der DraftGap-Zahl entsprechen, nicht einer aus
  // games.json gerechneten.
  const direkt = quelle.staerke("Ornn", "TOP");
  assert.match(r.components.meta.text, new RegExp(
    (direkt.value * 100).toFixed(1).replace(".", "[.,]")));
});

test("Komfort kommt aus Ranked und sagt das auch", () => {
  const r = B.bewerte(zustand(), "Dr. Mundo", "TOP",
                      {spielerTeam: "AFC1", spielerLabel: "bandit"});
  assert.equal(r.components.komfort.quelle, "team");
  assert.match(r.components.komfort.text, /RANKED/);
});

test("die Turnierqueue ist als Komfortbeleg gesperrt", () => {
  assert.throws(() => teamAnlegen(DATA.teams, {queue: "LIGA"}),
                /kein Komfortbeleg/);
});

test("vergangene Turnierpicks veraendern keine Bewertung", () => {
  // Dieselbe Lage, einmal mit und einmal ohne games.json im Spiel: die
  // Engine bekommt games gar nicht erst zu sehen, also darf sich nichts
  // unterscheiden. Der Test haelt fest, dass keine Hintertuer entsteht.
  const s = zustand({ihre: [{champ: "Ornn", rolle: "TOP"}]});
  const a = B.bewerte(s, "Jax", "TOP");
  const zweiter = bewerterAnlegen({quelle, merkmale, comp, team, heuristik: leer});
  const b = zweiter.bewerte(s, "Jax", "TOP");
  assert.deepEqual(a, b);
});

test("aus der Sicht des Gegners: mit SEINEN Picks, gegen UNSERE", () => {
  // Das Board bewertet einen Gegnerslot, indem es denselben Zustand mit
  // getauschtem wirSind uebergibt. Dann muss "mit" die Gegnerpicks und
  // "gegen" unsere meinen - sonst galt ein gegnerischer Kandidat als
  // gut, wenn er zu unserem Team passte.
  const s = zustand({unsere: [{champ: "Jarvan IV", rolle: "JUNGLE"}],
                     ihre: [{champ: "Gnar", rolle: "TOP"}]});
  const ihreSicht = {...s, wirSind: "red"};
  const r = B.bewerte(ihreSicht, "Ahri", "MIDDLE");
  const mit = r.components.synergie, gegen = r.components.matchup;
  const namen = (t) => [...(t.paare || []).map((x) => x.wer), ...(t.ohneDaten || [])];
  assert.deepEqual(namen(mit), ["Gnar"], "Synergie mit ihrem Toplaner");
  assert.deepEqual(namen(gegen), ["Jarvan IV"], "Matchup gegen unseren Jungler");
});

/* Audit P2.8: "kaum Erfahrung" hing an k.value <= 0,1 - Komfort ohne
   Beleg ist aber KOMFORT.ohneBeleg (0,15). Gemessen: 0 von 684
   Bewertungen trugen den Text, 387 haetten ihn verdient. Jetzt haengt er
   am Beleg selbst: 0 Partien und nicht im Draftplan. */
test("P2.8: ohne Partien und ohne Plan steht 'kaum Erfahrung' im Risiko", () => {
  const top = team.aufRolle("AFC1", "TOP");
  const opt = {spielerTeam: "AFC1", spielerLabel: top.label};
  let ohne = null, belegt = null;
  for (const k of merkmale.kandidaten("TOP")) {
    const ko = team.komfort("AFC1", top.label, k.champ);
    if (!ohne && ko && ko.sampleSize === 0 && /nicht im Draftplan/.test(ko.note)) ohne = k.champ;
    if (!belegt && ko && ko.sampleSize >= 20) belegt = k.champ;
  }
  assert.ok(ohne && belegt, "Testfaelle gefunden: " + ohne + ", " + belegt);
  const a = B.bewerte(zustand(), ohne, "TOP", opt);
  assert.ok(a.risks.some((r) => /^kaum Erfahrung/.test(r)), ohne + ": " + a.risks.join(" | "));
  const b = B.bewerte(zustand(), belegt, "TOP", opt);
  assert.ok(!b.risks.some((r) => /^kaum Erfahrung/.test(r)), belegt + " ist gespielt");
});
