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

   Seit Oktober 2026 zusaetzlich je Eintrag: der Modus (blind, teilweise,
   counter), die fuenf Kategorien, die Gruppenwerte, der
   Entscheidungswert - und eine Draft-Kennung, an die sich das ERGEBNIS
   haengen laesst. Erst mit dem Ergebnis wird aus "Uebereinstimmung" eine
   Frage, die man stellen darf: lagen wir bei gewonnenen Drafts naeher an
   der Empfehlung als bei verlorenen? Alte Eintraege bleiben lesbar; ihnen
   fehlen die neuen Felder.
*/

import { schluessel } from "./state.js";
import { VERSION } from "./config.js";
import { teilGruppen } from "./score.js";

export const FASSUNG = 1;

function runde(x) {
  return Number.isFinite(x) ? Math.round(x * 10000) / 10000 : null;
}

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
    kategorien = null, draft = null,
  } = {}) {
    const erste = (empfehlungen || [])[0] || null;
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
        entscheidung: r.entscheidung ?? null,
        robustheit: r.lookahead ? r.lookahead.robustheit : null,
        gruppen: teilGruppen(r),
        blind: r.blindDetail ? {ev: runde(r.blindDetail.ev),
                                schlecht: runde(r.blindDetail.schlechtestes),
                                konter: r.blindDetail.konter.slice(0, 3)
                                  .map((k) => k.champ)} : null,
      })),
      modus: erste ? erste.modus || null : null,
      kategorien: (kategorien || []).map((k) => ({art: k.art, champ: k.r.champion})),
      draft,
      ergebnis: null,
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

  /** Das Ergebnis eines Drafts an alle seine Eintraege haengen. */
  function ergebnis(draft, gewonnen) {
    if (draft === null || draft === undefined) return 0;
    let n = 0;
    for (const e of eintraege) {
      if (e.draft === draft) { e.ergebnis = gewonnen ? "sieg" : "niederlage"; n++; }
    }
    if (n) sichern();
    return n;
  }

  /** Uebereinstimmung getrennt nach Sieg und Niederlage. Auch das ist
   *  KEIN Beweis fuer Guete - bei einer Handvoll Drafts sagt der
   *  Unterschied nichts, und das steht dabei. */
  function auswertung() {
    const mit = eintraege.filter((e) => e.gewaehlt && e.ergebnis && e.empfohlen.length);
    const teil = (xs) => xs.length ? {
      n: xs.length,
      top1: xs.filter((e) => e.empfohlen[0].champ === e.gewaehlt).length / xs.length,
      top3: xs.filter((e) => e.empfohlen.slice(0, 3)
        .some((x) => x.champ === e.gewaehlt)).length / xs.length,
    } : null;
    const drafts = new Set(mit.map((e) => e.draft)).size;
    return {
      sieg: teil(mit.filter((e) => e.ergebnis === "sieg")),
      niederlage: teil(mit.filter((e) => e.ergebnis === "niederlage")),
      drafts,
      hinweis: drafts < 30
        ? "erst " + drafts + " Drafts mit Ergebnis \u2013 f\u00fcr eine Aussage zu wenig"
        : "Uebereinstimmung je Ausgang, kein Beweis fuer Ursache",
    };
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
    notiere, nachtragen, uebereinstimmung, ergebnis, auswertung,
    alle: () => eintraege.slice(),
    anzahl: () => eintraege.length,
    leeren: () => { eintraege = []; sichern(); },
    // Zum Herunterladen, damit die Eintraege das Geraet verlassen koennen.
    alsJson: () => JSON.stringify({fassung: FASSUNG, eintraege}, null, 1),
  };
}
