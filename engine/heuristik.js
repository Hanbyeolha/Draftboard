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

   Gepflegt wird in data/champion-heuristik.json, in zwei Ebenen:

     champions  eure Einschaetzung              Konfidenz 0,45
     vorschlag  Ersteinschaetzung (Claude),     Konfidenz 0,30
                vom Team ungeprueft

   Ein Eintrag in "champions" ersetzt den Vorschlag fuer diesen Champion
   vollstaendig - nicht Achse fuer Achse, damit nie eine Mischung aus
   beiden entsteht, die keiner so gemeint hat.
*/

import { wert } from "./provenance.js";
import { KONFIDENZ, TEILDECKUNG } from "./config.js";

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
  const team = (roh && roh.champions) || {};
  const vorschlag = (roh && roh.vorschlag) || {};
  const stand = (roh && roh._stand) || null;
  const vorschlagStand = (roh && roh._vorschlag_stand) || null;
  const fassung = (roh && roh._fassung) || null;

  /** Woher kommt die Einschaetzung zu diesem Champion? */
  function eintrag(champ) {
    if (team[champ]) return {e: team[champ], art: "team"};
    if (vorschlag[champ]) return {e: vorschlag[champ], art: "vorschlag"};
    return null;
  }

  /** Eine Achse eines Champions, 0..1 normiert. null, wenn nicht gepflegt.
   *  Ein gepflegter Champion OHNE diese Achse hat sie nicht (0) - die
   *  Tabelle traegt nur, was ungleich 0 ist. */
  function achse(champ, name) {
    if (!ACHSEN.includes(name)) throw new Error("unbekannte Achse: " + name);
    const x = eintrag(champ);
    if (!x) return null;
    const stufeVon = (v) => (v === undefined || v === null) ? null
      : Math.max(0, Math.min(2, Number(v) || 0)) / 2;
    const eigen = stufeVon(x.e[name]);
    // Teildeckung (config.js): eine andere Achse traegt diese mit.
    let abgeleitet = 0, aus = null;
    for (const [quelleAchse, faktor] of Object.entries(TEILDECKUNG[name] || {})) {
      const w = stufeVon(x.e[quelleAchse]);
      if (w !== null && w * faktor > abgeleitet) { abgeleitet = w * faktor; aus = quelleAchse; }
    }
    if (eigen === null && !abgeleitet) return null;
    const ueber = abgeleitet > (eigen ?? 0);
    const w = wert(ueber ? abgeleitet : eigen, {
      quelle: "heuristik",
      konfidenz: x.art === "team" ? KONFIDENZ.heuristik
                                  : KONFIDENZ.heuristikVorschlag,
      hinweis: (x.art === "team"
        ? "Einsch\u00e4tzung der Mannschaft, Stand " + (stand || "?")
        : "Ersteinsch\u00e4tzung, vom Team ungepr\u00fcft (Stand "
          + (vorschlagStand || "?") + ")")
        + (ueber ? ", teilweise \u00fcber " + aus : ""),
    });
    return ueber ? {...w, abgeleitetAus: aus} : w;
  }

  /** Alle gepflegten Achsen eines Champions. */
  function profil(champ) {
    const x = eintrag(champ);
    if (!x) return null;
    const e = x.e;
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
    const liste = champions || [...new Set([...Object.keys(team),
                                            ...Object.keys(vorschlag)])];
    const gepflegt = liste.filter((c) => eintrag(c)).length;
    const vomTeam = liste.filter((c) => team[c]).length;
    return {gepflegt, vomTeam, gesamt: liste.length,
            anteil: liste.length ? gepflegt / liste.length : 0};
  }

  const h = {stand, fassung, achse, profil, abdeckung,
          kennt: (champ) => !!eintrag(champ),
          art: (champ) => { const x = eintrag(champ); return x ? x.art : null; },
          anzahl: new Set([...Object.keys(team), ...Object.keys(vorschlag)]).size,
          anzahlTeam: Object.keys(team).length,
          anzahlVorschlag: Object.keys(vorschlag).length};
  /* Sicht fuer Note und Score: nur vom Team gepruefte Eintraege
     (Entscheidung A, Audit P1.3, 10.10.2026). Die ungepruefte
     Ersteinschaetzung bleibt Kontext fuers Lagebild und bewegt keine
     Zahl der Note. Gleiche Schnittstelle, damit die Aufrufer nur die
     Sicht waehlen, nicht anders rechnen. */
  h.geprueft = Object.keys(vorschlag).length
    ? heuristikAnlegen({...(roh || {}), vorschlag: {}}) : h;
  return h;
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
  // Saettigend wie in comp.js - siehe saettigen() dort. Hier ohne Import,
  // weil heuristik.js vor comp.js gebuendelt wird.
  let rest = 1;
  for (const x of werte) rest *= 1 - x;
  return wert(1 - rest, {
    quelle: "heuristik",
    hinweis: werte.length + " von " + picks.length + " Picks gepflegt",
  });
}

