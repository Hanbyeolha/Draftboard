/* Championmerkmale: alles, was nur von (Champion, Rolle, Patch) abhaengt.
   ---------------------------------------------------------------------------
   Diese Grenze ist mit Absicht gezogen. Was hier steht, ist fuer einen
   Patch konstant und laesst sich einmal rechnen und behalten. Alles, was
   vom Draftzustand abhaengt - Matchups gegen die gegnerischen Picks,
   Synergien mit den eigenen - gehoert nicht hierher, sondern in die
   Bewertung.

   Jedes Merkmal behaelt seine Herkunft. Fehlt eines, ist es null und
   nicht etwa 0 oder ein Mittelwert: die Bewertung laesst es dann aus
   Summe UND Hoechstwert fallen.
*/

import { wert } from "./provenance.js";
import { moeglicheRollen, istFlex } from "./data.js";
import { ROLLEN, BLINDSICHER } from "./config.js";
import { ROLLEN_FOLGE } from "./state.js";

/* Die fuenf Eimer der Skalierungskurve nach Spieldauer, zu drei Phasen
   zusammengefasst. Die Grenzen sind eine Lesehilfe, keine Messung - der
   Datensatz nennt keine Minutenwerte, nur die Reihenfolge frueh -> spaet. */
export const PHASEN = {
  frueh:  [0, 1],
  mittel: [2],
  spaet:  [3, 4],
};

export function merkmaleAnlegen(quelle, heuristik) {
  const cache = new Map();

  /** Alle Merkmale eines Champions auf einer Rolle. null, wenn der
   *  Champion dort nicht glaubhaft gespielt wird. */
  function fuer(champ, rolle) {
    const k = champ + "|" + rolle;
    if (cache.has(k)) return cache.get(k);
    const m = rechne(champ, rolle);
    cache.set(k, m);
    return m;
  }

  function rechne(champ, rolle) {
    const staerke = quelle.staerke(champ, rolle);
    if (!staerke) return null;          // Nebenrolle oder unbekannt

    const rollen = moeglicheRollen(quelle, champ);
    const kurve = quelle.kurve(champ, rolle);

    return {
      champ,
      rolle,
      // Wie stark ist der Champion auf dieser Rolle im laufenden Patch
      staerke,
      // Wie oft wird er ueberhaupt gespielt - Meta-Prioritaet fuers
      // Gegnermodell, nicht als Qualitaetsurteil
      prioritaet: quelle.prioritaet(champ),
      // Rollenverteilung als Verteilung, nicht als eine Rolle
      rollen,
      flex: flexGrad(rollen),
      // Anteil magischen Schadens
      schaden: quelle.schaden(champ, rolle),
      // Konterbarkeit, gemessen: wie weit liegen die Quoten je nach
      // Lanegegner auseinander
      streuung: quelle.streuung(champ, rolle),
      // Die gemessene Kurve und ihre Ableitungen
      kurve,
      phasen: phasenAus(kurve),
      skalierung: quelle.skalierung(champ, rolle),
      // Lohnt es sich, ihn blind zu picken - also bevor der Lanegegner
      // steht? Siehe blindSicher() weiter unten.
      blindsicher: blindSicher(quelle, champ, rolle, staerke),
      // Die handgepflegte Einschaetzung - bewusst in einem eigenen Feld,
      // damit sie beim Lesen nicht mit den Messungen verschwimmt
      heuristik: heuristik ? heuristik.profil(champ) : null,
    };
  }

  /** Jeder Champion, der auf dieser Rolle glaubhaft gespielt wird.
   *  Das ist der Kandidatenkreis - nicht der eigene Pool. Wer selten
   *  gespielte Champions aus dem Kreis wirft, findet sie nie. */
  function kandidaten(rolle, {ausser} = {}) {
    const raus = [];
    for (const champ of quelle.champions) {
      if (ausser && ausser.has(champ)) continue;
      const m = fuer(champ, rolle);
      if (m) raus.push(m);
    }
    return raus;
  }

  return {fuer, kandidaten, leeren: () => cache.clear(),
          groesse: () => cache.size};
}

/* ------------------------------------------------------------- Ableitungen */

/** Blindsicherheit: haengt das Ergebnis wenig davon ab, was auf der
 *  Lane gegenuebersteht?
 *
 *  Gemessen wird die Streuung der Matchupquoten, verglichen INNERHALB
 *  der Rolle. Absolute Werte taugen dafuer nicht: der Jungle-Median liegt
 *  bei 2,27 Punkten, der Top-Median bei 3,28. Eine feste Schwelle haette
 *  fast jeden Jungler markiert und fast keinen Toplaner - das waere eine
 *  Aussage ueber die Rolle gewesen, nicht ueber den Champion.
 *
 *  Zweite Bedingung ist die Staerke: einen unterdurchschnittlichen
 *  Champion blind zu picken ist kein Gewinn, nur ein kalkulierbarer
 *  Verlust. Streuung und Staerke sind praktisch unabhaengig (r = -0,07),
 *  die Bedingung streicht also keine halbe Liste weg.
 *
 *  Das ist ausdruecklich NICHT dasselbe wie der Blindpick-Eintrag im
 *  Draftplan. Der sagt, was ein Spieler sich zutraut; das hier sagt, was
 *  der Patch hergibt. Beides kann zutreffen, keines ersetzt das andere.
 *  null, wenn die Tabelle zu duenn ist - nicht false. */
export function blindSicher(quelle, champ, rolle, staerke) {
  const s = quelle.streuung(champ, rolle);
  if (!s || s.gegner < BLINDSICHER.mindestGegner) return null;
  const p = quelle.streuungsPerzentil(champ, rolle);
  if (p === null) return null;
  const robust = p <= BLINDSICHER.perzentil;
  const stark = !!staerke && staerke.value >= BLINDSICHER.mindestStaerke;
  /* Die Zusatzfelder haengen AUSSEN am Wert: wert() nimmt nur die
     Provenienzfelder und wuerde alles andere stillschweigend schlucken. */
  const w = wert(robust && stark, {
    quelle: "draftgap",
    patch: s.streuung.patch,
    stichprobe: s.streuung.sampleSize,
    konfidenz: s.streuung.confidence,
    hinweis: "streut " + (s.streuung.value * 100).toFixed(2)
             + " Punkte ueber " + s.gegner + " Lanegegner, robuster als "
             + Math.round((1 - p) * 100) + " % auf dieser Rolle"
             + (robust && !stark
                ? " — aber nur " + (staerke.value * 100).toFixed(1)
                  + " % Patchstaerke" : ""),
  });
  return {...w, perzentil: p, streuung: s.streuung.value, robust, stark};
}

/** Flexgrad 0..1: wie gut laesst sich die Rolle aus dem Pick NICHT ablesen.
 *  Eindeutiger Champion -> 0. Zwei gleich starke Rollen -> nahe 1.
 *  Das ist Informationswert: ein Flexpick verraet die Aufstellung nicht. */
export function flexGrad(rollen) {
  const ernst = rollen.filter((r) => r.anteil >= ROLLEN.flexAbAnteil);
  if (ernst.length < 2) {
    return wert(0, {quelle: "draftgap",
                    hinweis: "eindeutige Rolle"});
  }
  // Zweitstaerkste Rolle im Verhaeltnis zur staerksten.
  const v = ernst[1].anteil / ernst[0].anteil;
  return wert(Math.min(1, v), {
    quelle: "draftgap",
    hinweis: ernst.map((r) => r.rolle + " " + Math.round(r.anteil * 100) + " %")
                  .join(", "),
  });
}

/** Die fuenf Eimer zu frueh / mittel / spaet zusammenfassen. */
export function phasenAus(kurve) {
  if (!kurve) return null;
  const out = {};
  for (const [name, eimer] of Object.entries(PHASEN)) {
    const xs = eimer.map((i) => kurve.value[i]).filter((x) => x !== null
                                                          && x !== undefined);
    if (!xs.length) continue;
    out[name] = wert(xs.reduce((a, b) => a + b, 0) / xs.length, {
      quelle: kurve.source, patch: kurve.patch, stichprobe: kurve.sampleSize,
      hinweis: "Quote im " + name + "en Spiel",
    });
  }
  return Object.keys(out).length ? out : null;
}

/* ------------------------------------------------------------ Normierung */
/* Die Bewertung will 0..1. Die Baender stehen hier und nicht verstreut im
   Code, damit nachvollziehbar bleibt, was "gut" heisst. */

/** Siegquote -> 0..1 ueber ein Band von 46 bis 54 Prozent. Darunter und
 *  darueber wird geklemmt: der Unterschied zwischen 44 und 42 Prozent
 *  aendert an der Draftentscheidung nichts mehr. */
export function normQuote(q, {von = 0.46, bis = 0.54} = {}) {
  if (q === null || q === undefined) return null;
  return klemm((q - von) / (bis - von), 0, 1);
}

/** Abweichung von einer Grundquote -> 0..1, Mitte bei 0.5.
 *  +2 Punkte Vorteil schoepfen aus, -2 sind 0. */
/* Spanne an der gemessenen Streuung innerhalb einer Lage geeicht: mit
   der Erwartung aus dem Gegenueber liegen 25. und 75. Perzentil bei rund
   einem Punkt, die Extreme bei vier bis acht. */
export function normVorteil(d, spanne = 0.025) {
  if (d === null || d === undefined) return null;
  return klemm((d + spanne) / (2 * spanne), 0, 1);
}

/** Skalierung -> 0..1. Kayle liegt bei rund +0,15, Pantheon bei -0,06. */
export function normSkalierung(d, spanne = 0.12) {
  if (d === null || d === undefined) return null;
  return klemm((d + spanne) / (2 * spanne), 0, 1);
}

export function klemm(x, a, b) {
  return Number.isFinite(x) ? Math.max(a, Math.min(b, x)) : a;
}

/** Die Rollen in Lanereihenfolge - damit niemand anderswo sortiert. */
export const rollenFolge = () => ROLLEN_FOLGE.slice();
