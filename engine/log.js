/* Mitschreiben, was empfohlen wurde - damit es spaeter pruefbar wird.
   ---------------------------------------------------------------------------
   Der Backtest ueber die 68 Turnierpartien kann nur den Endzustand gegen
   das Ergebnis halten: games.json hat keine Pick-Reihenfolge. Was dort
   fehlt, kann ab jetzt entstehen - aber nur, wenn wir es aufschreiben,
   WAEHREND gedraftet wird.

   Was ein Eintrag haelt:

     die Lage, in der entschieden wurde
     was empfohlen war, mit Noten und Konfidenz
     was tatsaechlich gepickt wurde
     welche Modellfassung und welche Daten das waren

   Was er NICHT haelt: Namen, Konten, irgendetwas Persoenliches ueber
   Dritte. Championnamen und Rollen reichen, um spaeter zu rechnen.

   Noch wird nichts ausgewertet. Erst Zaehlen, dann Deuten - ein Modell
   auf dreissig Eintraegen zu trimmen waere schlimmer als keines.
*/

import { schluessel } from "./state.js";
import { VERSION } from "./config.js";

export const FASSUNG = 1;

export function protokollAnlegen({speicher = null, grenze = 2000} = {}) {
  let eintraege = lade();

  function lade() {
    if (!speicher) return [];
    try {
      const roh = speicher.getItem("draft-protokoll");
      const d = roh ? JSON.parse(roh) : null;
      return d && d.fassung === FASSUNG && Array.isArray(d.eintraege)
        ? d.eintraege : [];
    } catch (e) {
      // Ein kaputter Speicher darf den Draft nicht aufhalten.
      return [];
    }
  }

  function sichern() {
    if (!speicher) return;
    try {
      speicher.setItem("draft-protokoll",
        JSON.stringify({fassung: FASSUNG, eintraege}));
    } catch (e) {
      // Voll oder gesperrt - dann eben nicht. Kein Abbruch.
    }
  }

  /** Eine Entscheidung festhalten. `empfehlungen` sind die bewerteten
   *  Kandidaten, `gewaehlt` der Champion, der wirklich gepickt wurde
   *  (darf spaeter nachgetragen werden). */
  function notiere(zustand, rolle, empfehlungen, {
    gewaehlt = null, risikoprofil = null, dauerMs = null,
  } = {}) {
    const eintrag = {
      zeit: new Date().toISOString(),
      schluessel: schluessel(zustand, rolle),
      patch: zustand.patch,
      wirSind: zustand.wirSind,
      rolle,
      lage: {
        bans: {blue: zustand.bans.blue.slice(), red: zustand.bans.red.slice()},
        picks: {
          blue: zustand.picks.blue.map((p) => [p.champ, p.rolle || null]),
          red: zustand.picks.red.map((p) => [p.champ, p.rolle || null]),
        },
        fearless: (zustand.fearless || []).length,
      },
      // Nur die Spitze: zehn Eintraege reichen, um spaeter Top-1 und
      // Top-3 zu zaehlen, und halten die Datei klein.
      empfohlen: (empfehlungen || []).slice(0, 10).map((r) => ({
        champ: r.champion,
        score: r.score,
        konfidenz: r.confidence,
        robustheit: r.lookahead ? r.lookahead.robustheit : null,
      })),
      gewaehlt,
      risikoprofil,
      dauerMs,
      modell: {optimizer: VERSION.optimizer, daten: VERSION.data},
    };
    eintraege.push(eintrag);
    if (eintraege.length > grenze) eintraege = eintraege.slice(-grenze);
    sichern();
    return eintrag;
  }

  /** Den tatsaechlichen Pick nachtragen - im Draft weiss man ihn oft
   *  erst einen Moment spaeter. */
  function nachtragen(schluesselWert, gewaehlt) {
    for (let i = eintraege.length - 1; i >= 0; i--) {
      if (eintraege[i].schluessel === schluesselWert
          && eintraege[i].gewaehlt === null) {
        eintraege[i].gewaehlt = gewaehlt;
        sichern();
        return eintraege[i];
      }
    }
    return null;
  }

  /** Wie oft lag die Empfehlung auf dem, was gepickt wurde? Das ist noch
   *  KEIN Guetemass - es misst Uebereinstimmung mit uns selbst, nicht
   *  Erfolg. Aussagekraft bekommt es erst zusammen mit Ergebnissen. */
  function uebereinstimmung() {
    const mit = eintraege.filter((e) => e.gewaehlt && e.empfohlen.length);
    if (!mit.length) return null;
    const top1 = mit.filter((e) => e.empfohlen[0].champ === e.gewaehlt).length;
    const top3 = mit.filter((e) => e.empfohlen.slice(0, 3)
      .some((x) => x.champ === e.gewaehlt)).length;
    return {n: mit.length, top1: top1 / mit.length, top3: top3 / mit.length,
            hinweis: "misst Uebereinstimmung, nicht Erfolg"};
  }

  return {
    notiere, nachtragen, uebereinstimmung,
    alle: () => eintraege.slice(),
    anzahl: () => eintraege.length,
    leeren: () => { eintraege = []; sichern(); },
    // Zum Herunterladen, damit die Eintraege das Geraet verlassen koennen.
    alsJson: () => JSON.stringify({fassung: FASSUNG, eintraege}, null, 1),
  };
}
