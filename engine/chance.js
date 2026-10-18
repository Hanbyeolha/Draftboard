/* Draft-Vorteil laut Patchdaten (Wunsch des Nutzers, 18.10.2026).
   ---------------------------------------------------------------------------
   Wie stuende dieser Draft bei durchschnittlichen Spielern auf dem Patch?
   Nach dem Prinzip von DraftGap, in Log-Odds addiert:

     Champions  jeder Pick mit seiner Patch-Winrate auf der Rolle
                (quelle.staerke) - unsere plus, ihre minus
     Matchups   je Paar (unser, ihr) nur der Teil, der ueber das hinausgeht,
                was die beiden Champions ohnehin erwarten lassen:
                logit(Matchup) - (logit(a) - logit(b))
     Synergien  je Paar im selben Team ebenso: logit(Duo) - (logit(a) + logit(b))

   Paarwerte werden rauschbereinigt wie ueberall in der Engine
   (BLIND.schrumpfK): bei wenigen Partien zaehlt die Abweichung weniger.

   WICHTIG, gemessen am 18.10.2026 an 75 Turnierspielen der Liga: die volle
   Rechnung traf 39-mal (52 %), Brier 0,272 - nicht besser als ein
   Muenzwurf (0,250). Der Wert beschreibt den Draft auf dem Patch, nicht eure
   Siegchance; die Oberflaeche zeigt die Trefferquote darum direkt daneben
   (treffer()). Er fliesst in KEINE Empfehlung ein. */

import { BLIND } from "./config.js";
import { gegenseite } from "./state.js";
import { LANE_GEGNER } from "./blind.js";

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/** Kern: zwei Aufstellungen [{champ, rolle}] -> Log-Odds je Teil. */
function rechne(quelle, wir, sie) {
  const r = (p) => {
    const s = p && p.champ && p.rolle ? quelle.staerke(p.champ, p.rolle) : null;
    return s ? logit(s.value) : null;
  };
  const schrumpf = (d, n) => d * n / (n + BLIND.schrumpfK);
  const teile = {champions: 0, matchups: 0, synergien: 0};
  const gezaehlt = {champions: 0, matchups: 0, synergien: 0};
  const ohneDaten = [];

  for (const [team, vz] of [[wir, 1], [sie, -1]]) {
    for (const p of team) {
      const x = r(p);
      if (x === null) { ohneDaten.push(p.champ); continue; }
      teile.champions += vz * x;
      gezaehlt.champions += 1;
    }
  }
  for (const a of wir) {
    for (const b of sie) {
      const ra = r(a), rb = r(b);
      if (ra === null || rb === null) continue;
      // Beide Richtungen zusammen: DraftGap misst a gegen b und b gegen a
      // getrennt, die Werte ergaenzen sich nicht exakt zu 100 % (Ahri gegen
      // Syndra 49,7 %, Syndra gegen Ahri 49,8 %). Gewichtet nach Partien -
      // so ist der Wert fuer beide Seiten derselbe.
      const ab = quelle.matchup(a.champ, a.rolle, b.champ, b.rolle);
      const ba = quelle.matchup(b.champ, b.rolle, a.champ, a.rolle);
      const n = (ab ? ab.sampleSize : 0) + (ba ? ba.sampleSize : 0);
      if (!n) continue;
      const q = ((ab ? ab.value * ab.sampleSize : 0) + (ba ? (1 - ba.value) * ba.sampleSize : 0)) / n;
      teile.matchups += schrumpf(logit(q) - (ra - rb), n / ((ab ? 1 : 0) + (ba ? 1 : 0)));
      gezaehlt.matchups += 1;
    }
  }
  for (const [team, vz] of [[wir, 1], [sie, -1]]) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const a = team[i], b = team[j], ra = r(a), rb = r(b);
        if (ra === null || rb === null) continue;
        // Auch hier beide Richtungen, gewichtet - sonst haenge der Wert
        // davon ab, in welcher Reihenfolge gepickt wurde.
        const ab = quelle.synergie(a.champ, a.rolle, b.champ, b.rolle);
        const ba = quelle.synergie(b.champ, b.rolle, a.champ, a.rolle);
        const n = (ab ? ab.sampleSize : 0) + (ba ? ba.sampleSize : 0);
        if (!n) continue;
        const q = ((ab ? ab.value * ab.sampleSize : 0) + (ba ? ba.value * ba.sampleSize : 0)) / n;
        teile.synergien += vz * schrumpf(logit(q) - (ra + rb), n / ((ab ? 1 : 0) + (ba ? 1 : 0)));
        gezaehlt.synergien += 1;
      }
    }
  }
  const summe = teile.champions + teile.matchups + teile.synergien;
  return {summe, teile, gezaehlt, ohneDaten};
}

/**
 * Draft-Vorteil fuer UNS in der aktuellen Lage.
 * @returns {{chance:number, punkte:number, teile:{champions,matchups,synergien},
 *            gezaehlt:object, ohneDaten:string[], leer:boolean}}
 *   chance 0..1; punkte = (chance - 0,5) * 100; teile in Prozentpunkten,
 *   anteilig aufgeteilt, so dass sie zusammen genau punkte ergeben.
 */
export function draftChance(quelle, zustand) {
  const sie = gegenseite(zustand.wirSind);
  const wir = zustand.picks[zustand.wirSind] || [];
  const ihre = zustand.picks[sie] || [];
  const k = rechne(quelle, wir, ihre);
  const chance = sigmoid(k.summe);
  const punkte = (chance - 0.5) * 100;
  const anteil = (x) => (k.summe ? punkte * x / k.summe : 0);
  return {
    chance, punkte,
    teile: {champions: anteil(k.teile.champions), matchups: anteil(k.teile.matchups),
            synergien: anteil(k.teile.synergien)},
    gezaehlt: k.gezaehlt, ohneDaten: k.ohneDaten,
    leer: !wir.length && !ihre.length,
  };
}

/** Wie stuende der Draft, wenn WIR champ auf rolle picken? */
export function chanceMitPick(quelle, zustand, champ, rolle) {
  const seite = zustand.wirSind;
  const neu = {...zustand, picks: {...zustand.picks,
    [seite]: [...(zustand.picks[seite] || []), {champ, rolle, spieler: null, zug: null}]}};
  return draftChance(quelle, neu);
}

/**
 * Trefferquote an echten Partien: [{a:[{champ,rolle}], b:[...], aGewinnt}].
 * Nur volle Aufstellungen (5 gegen 5); Gleichstand (genau 50 %) zaehlt nicht.
 * @returns {{richtig:number, n:number, brier:number|null}}
 */
export function treffer(quelle, partien) {
  let richtig = 0, n = 0, brier = 0;
  for (const s of partien || []) {
    if (!s || (s.a || []).length !== 5 || (s.b || []).length !== 5) continue;
    const p = sigmoid(rechne(quelle, s.a, s.b).summe);
    if (Math.abs(p - 0.5) < 1e-9) continue;
    const sieg = s.aGewinnt ? 1 : 0;
    n += 1;
    if ((p > 0.5) === (sieg === 1)) richtig += 1;
    brier += (p - sieg) ** 2;
  }
  return {richtig, n, brier: n ? brier / n : null};
}

/* Lane-Analyse (Wunsch des Nutzers, 18.10.2026: "als Botlaner wissen, wie
   viel mir der Support hilft, wie sehr er dem Gegner schadet - und filtern
   koennen"). Fuer jeden Champion, der unsere Rolle glaubhaft spielt
   (quelle.staerke nicht null):

     allgemein  Patch-Winrate auf der Rolle
     gegen[i]   gemessene Winrate gegen jeden gepickten Lanegegner
                (Bot: ADC und Support; LANE_GEGNER)
     mit[i]     gemessene Duo-Winrate mit jedem unserer Lanepartner
                (Bot <-> Support), so wie DraftGap sie fuehrt
     chance     Draft laut Patchdaten, wenn wir ihn picken (chanceMitPick)

   Je Spalte der Schnitt aller (gegner[i].schnitt / partner[i].schnitt) -
   dieselbe Erwartung, die die Begruendung "sonst" nennt - und je Wert eine
   rauschbereinigte Fassung zum Sortieren (Abweichung vom Schnitt mal
   n / (n + BLIND.schrumpfK)). Filtern und Sortieren macht die Oberflaeche;
   hier wird nichts gewichtet oder zusammengezaehlt. */
export function laneAnalyse(quelle, zustand, rolle) {
  const sie = gegenseite(zustand.wirSind);
  const lane = new Set(LANE_GEGNER[rolle] || []);
  const mittel = (p, art) => {
    const m = quelle.paarMittel(p.champ, p.rolle, art);
    return m ? (art === "m" ? 1 - m.value : m.value) : null;
  };
  const gegner = ((zustand.picks || {})[sie] || [])
    .filter((p) => p && p.champ && lane.has(p.rolle))
    .map((p) => ({champ: p.champ, rolle: p.rolle, schnitt: mittel(p, "m")}));
  const partner = ((zustand.picks || {})[zustand.wirSind] || [])
    .filter((p) => p && p.champ && p.rolle !== rolle && lane.has(p.rolle))
    .map((p) => ({champ: p.champ, rolle: p.rolle, schnitt: mittel(p, "s")}));
  const bereinigt = (w, schnitt) => {
    if (!w) return null;
    const basis = schnitt === null ? 0.5 : schnitt;
    return basis + (w.value - basis) * w.sampleSize / (w.sampleSize + BLIND.schrumpfK);
  };
  const zeilen = [];
  for (const champ of quelle.champions) {
    const allgemein = quelle.staerke(champ, rolle);
    if (!allgemein) continue;
    const gegen = gegner.map((g) => quelle.matchup(champ, rolle, g.champ, g.rolle));
    const mit = partner.map((p) => quelle.synergie(champ, rolle, p.champ, p.rolle));
    zeilen.push({
      champ, allgemein, gegen, mit,
      gegenBereinigt: gegen.map((w, i) => bereinigt(w, gegner[i].schnitt)),
      mitBereinigt: mit.map((w, i) => bereinigt(w, partner[i].schnitt)),
      chance: chanceMitPick(quelle, zustand, champ, rolle).chance,
    });
  }
  return {gegner, partner, zeilen};
}
