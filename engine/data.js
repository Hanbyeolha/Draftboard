/* Die Datenschicht: Zugriff auf die eingebetteten Daten, immer mit Herkunft.
   ---------------------------------------------------------------------------
   Oberhalb dieser Datei kennt niemand mehr das Format von DATA.draft. Wer
   eine Zahl will, bekommt sie als {value, source, patch, sampleSize,
   confidence} - oder null. Niemals eine geschaetzte Zahl.

   Die vier Quellen bleiben getrennt:
     draftgap   gemessen (Matchups, Synergien, Patchstaerke, Schaden, Zeit)
     riot       statische Championdaten
     team       unsere op.gg-Pools und der Draftplan - NICHT unsere
                Turnierpartien, siehe team.js
     heuristik  eigene Datei, siehe heuristik.js
*/

import { wert } from "./provenance.js";
import { ROLLEN, KONFIDENZ } from "./config.js";
import { ROLLEN_FOLGE } from "./state.js";

/* DraftGap zaehlt Rollen 0..4 in derselben Reihenfolge wie wir - nachgeprueft
   an Thresh (4), Lee Sin (1), Ornn (0), Caitlyn (3), Ahri (2). */
export const rollenNr = (rolle) => ROLLEN_FOLGE.indexOf(rolle);
export const rollenName = (nr) => ROLLEN_FOLGE[nr] || null;

export function quelleAnlegen(roh) {
  if (!roh || !roh.namen) return leereQuelle();

  const nr = new Map();
  roh.namen.forEach((n, i) => nr.set(n, String(i)));
  const patch = roh.version || null;

  /* --------------------------------------------------- Patchstaerke je Rolle */
  function staerke(champ, rolle) {
    const i = nr.get(champ);
    if (i === undefined) return null;
    const alle = roh.basis[i] || {};
    const e = alle[String(rollenNr(rolle))];
    if (!e) return null;
    const gesamt = Object.values(alle).reduce((n, x) => n + x[0], 0);
    // Nebenrollen aussortieren, sonst stand Ahri beim Toplaner ganz oben.
    if (e[0] < ROLLEN.mindestPartien || e[0] < gesamt * ROLLEN.mindestAnteil) {
      return null;
    }
    return wert(e[1] / 1000, {quelle: "draftgap", patch, stichprobe: e[0]});
  }

  /* ------------------------------------------------- Rollenverteilung / Flex */
  /* Wie oft wird dieser Champion auf welcher Rolle gespielt? Das ist die
     Grundlage fuer Rollenunsicherheit UND fuer den Flexwert: ein Champion,
     der glaubhaft auf zwei Rollen geht, verraet die Aufstellung nicht. */
  function rollenVerteilung(champ) {
    const i = nr.get(champ);
    if (i === undefined) return null;
    const alle = roh.basis[i] || {};
    const gesamt = Object.values(alle).reduce((n, x) => n + x[0], 0);
    if (!gesamt) return null;
    const out = {};
    for (const [r, e] of Object.entries(alle)) {
      const name = rollenName(Number(r));
      if (name) out[name] = e[0] / gesamt;
    }
    return wert(out, {quelle: "draftgap", patch, stichprobe: gesamt});
  }

  /* ----------------------------------------------------------- Matchup */
  function matchup(champ, rolle, gegner, gegnerRolle) {
    return paar(champ, rolle, "m", gegner, gegnerRolle);
  }
  function synergie(champ, rolle, verbuendeter, dessenRolle) {
    return paar(champ, rolle, "s", verbuendeter, dessenRolle);
  }
  function paar(champ, rolle, art, fremd, fremdRolle) {
    const i = nr.get(champ), j = nr.get(fremd);
    if (i === undefined || j === undefined) return null;
    const stufe = (((roh.paare[i] || {})[String(rollenNr(rolle))] || {})[art]
                   || {})[String(rollenNr(fremdRolle))];
    const e = stufe && stufe[j];
    if (!e) return null;
    return wert(e[1] / 1000, {quelle: "draftgap", patch, stichprobe: e[0]});
  }

  /* ------------------------------------------------------ Schadensprofil */
  /* Anteil magischen Schadens in Prozent. Physisch und true sind der Rest -
     der Datensatz liefert alle drei, eingebettet ist der magische Anteil. */
  function schaden(champ, rolle) {
    const i = nr.get(champ);
    if (i === undefined || !roh.schaden) return null;
    const e = (roh.schaden[i] || {})[String(rollenNr(rolle))];
    if (e === undefined) return null;
    return wert(e / 100, {quelle: "draftgap", patch, konfidenz: 0.9,
                          hinweis: "Anteil magischen Schadens"});
  }

  /* ----------------------------------------------------- Skalierungskurve */
  /* Fuenf Eimer nach Spieldauer. Kayle 43 % -> 58 %, Pantheon 52 % -> 47 %.
     Gemessen, nicht behauptet - das deckt Scaling und Frueh/Mittel/Spaet. */
  function kurve(champ, rolle) {
    const i = nr.get(champ);
    if (i === undefined || !roh.zeit) return null;
    const e = (roh.zeit[i] || {})[String(rollenNr(rolle))];
    if (!e || !e.length) return null;
    const n = e.reduce((s, x) => s + x[0], 0);
    return wert(e.map((x) => (x[0] ? x[1] / 1000 : null)),
                {quelle: "draftgap", patch, stichprobe: n,
                 hinweis: "Quote je Spieldauer-Eimer, frueh nach spaet"});
  }

  /** Steigung der Kurve: positiv = skaliert, negativ = frueh stark. */
  function skalierung(champ, rolle) {
    const k = kurve(champ, rolle);
    if (!k) return null;
    const xs = k.value.filter((x) => x !== null);
    if (xs.length < 3) return null;
    const frueh = xs[0], spaet = xs[xs.length - 1];
    return wert(spaet - frueh, {quelle: "draftgap", patch,
                                stichprobe: k.sampleSize,
                                hinweis: "spaet minus frueh"});
  }

  /* ------------------------------------------- Streuung der Matchups */
  /* Wie weit liegen die Quoten dieses Champions je nach Laneggner
     auseinander? Das ist Konterbarkeit, gemessen: ein Champion mit enger
     Streuung steht gegen fast jeden gleich - ein sicherer Blindpick. Einer
     mit weiter Streuung gewinnt stark und verliert stark, was als spaeter
     Pick ein Vorteil und als blinder ein Risiko ist.

     Gerechnet ueber die GEGNERISCHE LANE, also dieselbe Rolle - das ist
     die Paarung, um die es beim Blindpick geht. */
  /* Streuung je Rolle, einmal sortiert. Gebraucht fuer die Frage
     "robuster als wie viele andere auf dieser Rolle" - absolute Werte
     taugen dafuer nicht, weil die Rollen weit auseinanderliegen. */
  const streuungsFeldCache = new Map();
  function streuungsFeld(rolle) {
    if (streuungsFeldCache.has(rolle)) return streuungsFeldCache.get(rolle);
    const xs = [];
    for (const c of roh.namen) {
      /* staerke() faellt auf Nebenrollen weg (zu wenige Partien oder zu
         kleiner Rollenanteil). Diese Champions gehoeren auch hier nicht
         ins Feld: ihre Matchuptabellen sind duenn und streuen darum
         erratisch, was echte Laner robuster aussehen liesse als sie
         sind. Dasselbe Sieb wie bei den Kandidaten. */
      if (!staerke(c, rolle)) continue;
      const s = streuung(c, rolle);
      if (s) xs.push(s.streuung.value);
    }
    xs.sort((a, b) => a - b);
    streuungsFeldCache.set(rolle, xs);
    return xs;
  }

  /** Anteil der Champions dieser Rolle, die WENIGER streuen. 0 ist der
   *  robusteste, 1 der anfaelligste. null ohne Messung. */
  function streuungsPerzentil(champ, rolle) {
    const s = streuung(champ, rolle);
    if (!s) return null;
    const xs = streuungsFeld(rolle);
    if (xs.length < 10) return null;
    let unter = 0;
    for (const x of xs) { if (x < s.streuung.value) unter++; else break; }
    return unter / xs.length;
  }

  const streuungCache = new Map();
  function streuung(champ, rolle) {
    const k = champ + "|" + rolle;
    if (streuungCache.has(k)) return streuungCache.get(k);
    const out = rechneStreuung(champ, rolle);
    streuungCache.set(k, out);
    return out;
  }

  function rechneStreuung(champ, rolle) {
    const i = nr.get(champ);
    if (i === undefined) return null;
    const r = String(rollenNr(rolle));
    const tabelle = (((roh.paare[i] || {})[r] || {}).m || {})[r];
    if (!tabelle) return null;
    const eintraege = Object.values(tabelle);
    if (eintraege.length < 5) return null;

    let summe = 0, gewicht = 0;
    for (const [n, q] of eintraege) { summe += (q / 1000) * n; gewicht += n; }
    const mittel = summe / gewicht;
    let abw = 0;
    for (const [n, q] of eintraege) {
      abw += n * Math.pow(q / 1000 - mittel, 2);
    }
    return {
      mittel: wert(mittel, {quelle: "draftgap", patch, stichprobe: gewicht}),
      streuung: wert(Math.sqrt(abw / gewicht), {
        quelle: "draftgap", patch, stichprobe: gewicht,
        hinweis: "Standardabweichung ueber " + eintraege.length + " Lanegegner"}),
      gegner: eintraege.length,
    };
  }

  /* ------------------------------------------ Eigene Grundlinie */
  /* Die Staerke eines Champions ist NICHT die richtige Bezugsgroesse fuer
     Matchups und Synergien - gemessen an 87 Topkandidaten liegt die
     Synergiequote im Median 2,17 Punkte UEBER der Basis und die
     Matchupquote gegen zwei Metachampions 2,10 Punkte DARUNTER. Die Basis
     enthaelt eben Partien mit beliebigen Mitspielern und Gegnern.

     Richtig ist der eigene Schnitt ueber die jeweilige Tabelle: "besser
     als dieser Champion es ueblicherweise mit Mitspielern hat" statt
     "besser als er allein dasteht". Damit zentriert sich die Aussage
     selbst, ohne vom Kandidatenfeld abzuhaengen. */
  const mittelCache = new Map();
  function paarMittel(champ, rolle, art) {
    const k = champ + "|" + rolle + "|" + art;
    if (mittelCache.has(k)) return mittelCache.get(k);
    const out = rechnePaarMittel(champ, rolle, art);
    mittelCache.set(k, out);
    return out;
  }

  function rechnePaarMittel(champ, rolle, art) {
    const i = nr.get(champ);
    if (i === undefined) return null;
    const tabelle = ((roh.paare[i] || {})[String(rollenNr(rolle))] || {})[art];
    if (!tabelle) return null;
    let summe = 0, gewicht = 0, n = 0;
    for (const je of Object.values(tabelle)) {
      for (const [spiele, q] of Object.values(je)) {
        summe += (q / 1000) * spiele; gewicht += spiele; n += 1;
      }
    }
    if (!gewicht) return null;
    return wert(summe / gewicht, {
      quelle: "draftgap", patch, stichprobe: gewicht,
      hinweis: "eigener Schnitt ueber " + n + (art === "m" ? " Gegner" : " Mitspieler"),
    });
  }

  /** Wie oft wird der Champion ueberhaupt gespielt - als Meta-Prioritaet
   *  fuer das Gegnermodell. */
  function prioritaet(champ) {
    const i = nr.get(champ);
    if (i === undefined) return null;
    const alle = roh.basis[i] || {};
    const gesamt = Object.values(alle).reduce((n, x) => n + x[0], 0);
    return gesamt ? wert(gesamt, {quelle: "draftgap", patch,
                                  stichprobe: gesamt}) : null;
  }

  return {
    patch,
    stand: roh.stand || null,
    champions: roh.namen.slice(),
    kennt: (champ) => nr.has(champ),
    staerke, rollenVerteilung, matchup, synergie, schaden, kurve,
    skalierung, prioritaet, streuung, streuungsPerzentil, paarMittel,
  };
}

function leereQuelle() {
  const nix = () => null;
  return {
    patch: null, stand: null, champions: [], kennt: () => false,
    staerke: nix, rollenVerteilung: nix, matchup: nix, synergie: nix,
    schaden: nix, kurve: nix, skalierung: nix, prioritaet: nix,
    streuung: nix, streuungsPerzentil: () => null, paarMittel: nix,
  };
}

/** Welche Rollen kommen fuer diesen Champion glaubhaft in Frage?
 *  Gibt eine Verteilung zurueck, keine einzelne Rolle - Rollenunsicherheit
 *  wird nicht wegdefiniert. */
export function moeglicheRollen(quelle, champ) {
  const v = quelle.rollenVerteilung(champ);
  if (!v) return [];
  return Object.entries(v.value)
    .filter(([, anteil]) => anteil >= ROLLEN.mindestAnteil)
    .sort((a, b) => b[1] - a[1])
    .map(([rolle, anteil]) => ({rolle, anteil}));
}

/** Flexibel heisst: mindestens zwei Rollen ueber der Schwelle. */
export function istFlex(quelle, champ) {
  return moeglicheRollen(quelle, champ)
    .filter((r) => r.anteil >= ROLLEN.flexAbAnteil).length >= 2;
}

/** Warnung, wenn der Datenstand zu alt ist. Gibt null, wenn alles passt. */
export function patchWarnung(quelle, aktuellerPatch) {
  if (!quelle.patch || !aktuellerPatch) return null;
  const m = (p) => {
    const x = /^(\d+)\.(\d+)/.exec(String(p));
    return x ? Number(x[1]) * 100 + Number(x[2]) : null;
  };
  const a = m(quelle.patch), b = m(aktuellerPatch);
  if (a === null || b === null) return null;
  const abstand = Math.abs(b - a);
  if (abstand < KONFIDENZ.veraltetAbPatches) return null;
  return {abstand, datenPatch: quelle.patch, aktuell: aktuellerPatch,
          text: "Daten sind " + abstand + " Patches alt"};
}
