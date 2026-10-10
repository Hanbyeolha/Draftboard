/* Die manuell gepflegte Championeinschaetzung.
   ---------------------------------------------------------------------------
   Strikt getrennt von den gemessenen Daten: eigene Quelle ("heuristik"),
   eigene niedrige Konfidenz, eigener Zugriff. Nichts hiervon darf als
   Statistik auftreten.

   Fehlt ein Champion oder eine Achse, wird NICHT geschaetzt. Der Wert ist
   dann null, und die aufrufende Bewertung laesst die Achse aus Summe und
   Hoechstwert fallen (siehe score.js). Das ist der Grund, warum eine
   halbgefuellte Tabelle das Ergebnis nicht verzerrt: sie macht es nur
   unsicherer, und das steht dann auch dran.

   Gepflegt wird in data/champion-heuristik.json.
*/

import { wert } from "./provenance.js";

export const ACHSEN = [
  "engage", "disengage", "peel", "frontline", "dive", "catch",
  "poke", "siege", "splitpush", "teamfight", "objective", "scaling",
];

/* Fuer diese Achsen gibt es eine gemessene Entsprechung. Die Messung hat
   Vorrang; die Einschaetzung dient dann nur als Gegenprobe und geht NICHT
   zusaetzlich in die Bewertung ein - sonst zaehlte dieselbe Aussage
   zweimal, einmal gemessen und einmal geschaetzt. */
export const GEMESSEN_VORHANDEN = new Set(["scaling"]);

export function heuristikAnlegen(roh) {
  const tabelle = (roh && roh.champions) || {};
  const stand = (roh && roh._stand) || null;
  const fassung = (roh && roh._fassung) || null;

  /** Eine Achse eines Champions, 0..1 normiert. null, wenn nicht gepflegt. */
  function achse(champ, name) {
    if (!ACHSEN.includes(name)) throw new Error("unbekannte Achse: " + name);
    const e = tabelle[champ];
    if (!e) return null;
    const v = e[name];
    if (v === undefined || v === null) return null;
    const stufe = Math.max(0, Math.min(2, Number(v) || 0));
    return wert(stufe / 2, {
      quelle: "heuristik",
      hinweis: "Einschaetzung der Mannschaft, Stand " + (stand || "?"),
    });
  }

  /** Alle gepflegten Achsen eines Champions. */
  function profil(champ) {
    const e = tabelle[champ];
    if (!e) return null;
    const out = {};
    for (const a of ACHSEN) {
      const w = achse(champ, a);
      if (w) out[a] = w;
    }
    return Object.keys(out).length ? out : null;
  }

  /** Wie viel der Tabelle ist ueberhaupt gefuellt? Die Oberflaeche zeigt
   *  das, damit niemand eine leere Tabelle fuer ein Urteil haelt. */
  function abdeckung(champions) {
    const liste = champions || Object.keys(tabelle);
    const gepflegt = liste.filter((c) => tabelle[c]).length;
    return {gepflegt, gesamt: liste.length,
            anteil: liste.length ? gepflegt / liste.length : 0};
  }

  return {stand, fassung, achse, profil, abdeckung,
          kennt: (champ) => !!tabelle[champ],
          anzahl: Object.keys(tabelle).length};
}

/** Summe einer Achse ueber eine Aufstellung. Gibt mit zurueck, auf wie
 *  vielen Picks die Aussage beruht - fuenf gepflegte Champions tragen
 *  anders als einer. */
export function achseUeberTeam(heuristik, picks, name) {
  const werte = [];
  for (const p of picks) {
    const w = heuristik.achse(p.champ, name);
    if (w) werte.push(w.value);
  }
  if (!werte.length) return null;
  return wert(werte.reduce((a, b) => a + b, 0) / picks.length, {
    quelle: "heuristik",
    hinweis: werte.length + " von " + picks.length + " Picks gepflegt",
  });
}

