/* Herkunft und Belastbarkeit jedes Wertes.
   ---------------------------------------------------------------------------
   Kein Wert wandert ohne Herkunft durch die Engine. Das ist nicht Zierde:
   es ist der Mechanismus, der verhindert, dass eine Quote aus 43 Partien
   genauso schwer wiegt wie eine aus 2500, und dass eine Einschaetzung
   unserer Mannschaft wie eine Messung aussieht.

   Vier Quellen, bewusst getrennt gehalten:

     "draftgap"  gemessen, aus lolalytics aufbereitet, mit Stichprobe
     "riot"      Riots eigene statische Championdaten (Data Dragon)
     "team"      unsere op.gg-Pools und der Draftplan. NICHT unsere
                 Turnierpartien: die sagen, was jemand im Draft
                 bekommen hat, nicht was er kann.
     "heuristik" manuell gepflegte Einschaetzung der Mannschaft

   "heuristik" ist KEINE Statistik und darf nirgends als eine dargestellt
   werden. Sie traegt eine eigene, niedrige Konfidenz und bleibt in der
   Erklaerungsspur als solche erkennbar.
*/

import { KONFIDENZ } from "./config.js";

export const QUELLEN = ["draftgap", "riot", "team", "heuristik"];

/** Ein Wert mit Herkunft. `value` ist die Zahl, alles andere sagt, wie
 *  ernst man sie nehmen darf. */
export function wert(value, {quelle, patch = null, stichprobe = null,
                            konfidenz = null, hinweis = null} = {}) {
  if (!QUELLEN.includes(quelle)) {
    throw new Error("unbekannte Quelle: " + quelle);
  }
  return {
    value,
    source: quelle,
    patch,
    sampleSize: stichprobe,
    confidence: konfidenz === null ? konfidenzAus(quelle, stichprobe) : konfidenz,
    note: hinweis,
  };
}

/** Konfidenz aus der Stichprobe. Saettigt, weil der Unterschied zwischen
 *  5.000 und 20.000 Partien praktisch keiner mehr ist. */
export function konfidenzAusStichprobe(n) {
  if (!n || n < KONFIDENZ.mindestStichprobe) return 0;
  if (n >= KONFIDENZ.volleStichprobe) return 1;
  // Wurzelkurve: waechst schnell am Anfang, flacht dann ab.
  const a = KONFIDENZ.mindestStichprobe, b = KONFIDENZ.volleStichprobe;
  return Math.sqrt((n - a) / (b - a));
}

function konfidenzAus(quelle, stichprobe) {
  if (quelle === "heuristik") return KONFIDENZ.heuristik;
  if (quelle === "riot") return 1;            // statische Fakten
  if (stichprobe === null) return null;        // unbekannt, nicht geraten
  return konfidenzAusStichprobe(stichprobe);
}

/** Abschlag, wenn die Daten aus einem aelteren Patch stammen. Wird NICHT
 *  still gemacht - der Aufrufer bekommt den Abstand zurueck und die
 *  Oberflaeche zeigt ihn. */
export function patchAbschlag(datenPatch, aktuellerPatch) {
  const abstand = patchAbstand(datenPatch, aktuellerPatch);
  if (abstand === null) return {faktor: 1, abstand: null, veraltet: false};
  const faktor = Math.max(0.3, 1 - abstand * KONFIDENZ.abschlagJePatch);
  return {faktor, abstand, veraltet: abstand >= KONFIDENZ.veraltetAbPatches};
}

/** Patchnummern wie "16.19.1" vergleichen. Gibt null, wenn eine Seite
 *  fehlt oder nicht lesbar ist - dann wird nicht geraten. */
export function patchAbstand(a, b) {
  const zahl = (p) => {
    const m = /^(\d+)\.(\d+)/.exec(String(p || ""));
    return m ? Number(m[1]) * 100 + Number(m[2]) : null;
  };
  const x = zahl(a), y = zahl(b);
  if (x === null || y === null) return null;
  return Math.abs(y - x);
}

/** Mehrere Werte zu einem zusammenfassen, nach Stichprobe gewichtet.
 *  Gibt null zurueck, wenn nichts Belastbares dabei ist - und erfindet
 *  dann keinen Mittelwert. */
export function zusammen(werte, {quelle, patch = null} = {}) {
  const gute = werte.filter((w) => w && typeof w.value === "number"
                                 && (w.sampleSize === null || w.sampleSize > 0));
  if (!gute.length) return null;
  const gewichtet = gute.every((w) => typeof w.sampleSize === "number");
  let summe = 0, gewicht = 0;
  for (const w of gute) {
    const g = gewichtet ? w.sampleSize : 1;
    summe += w.value * g;
    gewicht += g;
  }
  const n = gewichtet ? gewicht : null;
  return wert(summe / gewicht, {
    quelle: quelle || gute[0].source,
    patch: patch || gute[0].patch,
    stichprobe: n,
    konfidenz: gewichtet ? konfidenzAusStichprobe(n)
      : mittel(gute.map((w) => w.confidence).filter((c) => c !== null)),
  });
}

function mittel(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Konfidenz in ein Wort fuer die Oberflaeche. Keine Nachkommastellen -
 *  sie waeren Scheingenauigkeit. */
export function konfidenzWort(c) {
  if (c === null || c === undefined) return "unbekannt";
  if (c >= KONFIDENZ.hoch) return "hoch";
  if (c >= KONFIDENZ.mittel) return "mittel";
  return "niedrig";
}
