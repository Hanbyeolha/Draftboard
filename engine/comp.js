/* Die Aufstellung bewerten - und was ein Champion ihr hinzufuegt.
   ---------------------------------------------------------------------------
   Zwei Fragen, die oft verwechselt werden:

     "Wie gut ist Champion X?"        -> features.js
     "Wie viel besser wird UNSERE
      Aufstellung mit Champion X?"    -> hier

   Die zweite ist die, auf die es im Draft ankommt. Ein starker Champion,
   der nichts beitraegt, was der Aufstellung fehlt, ist der schlechtere
   Pick als ein mittelmaessiger, der eine Luecke schliesst.

   Zwei Sorten Achsen, strikt getrennt gehalten:

     gemessen     Schadensmischung, Kurve, Rollenabdeckung
                  (DraftGap, Zehntausende Partien)
     geschaetzt   Engage, Peel, Frontline und die uebrigen neun
                  (unsere Einschaetzung, data/champion-heuristik.json)

   Fehlt eine Achse, faellt sie aus Summe UND Hoechstwert. Eine leere
   Heuristiktabelle verzerrt darum nichts - sie macht das Urteil nur
   unsicherer, und die Abdeckung steht dabei.
*/

import { wert } from "./provenance.js";
import { COMP } from "./config.js";
import { ACHSEN, GEMESSEN_VORHANDEN } from "./heuristik.js";
import { klemm } from "./features.js";
import { ROLLEN_FOLGE } from "./state.js";

/** Die gemessenen Achsen - die, hinter denen Partien stehen. */
export const GEMESSENE_ACHSEN = ["schadensbalance", "kurveGegenGegner",
                                 "rollenabdeckung"];

/** Die geschaetzten Achsen: alle aus der Heuristiktabelle, ausser denen,
 *  fuer die es eine Messung gibt (Scaling - dafuer gibt es die Kurve). */
export const GESCHAETZTE_ACHSEN = ACHSEN.filter((a) => !GEMESSEN_VORHANDEN.has(a));

export function compAnlegen(merkmale, heuristik) {

  /* ------------------------------------------------------------- Profil */
  /** Was diese Aufstellung ist. picks: [{champ, rolle}] - Picks ohne
   *  Rolle zaehlen fuer die Rollenabdeckung nicht mit, fuer alles andere
   *  schon, sofern sich eine Rolle erschliessen laesst. */
  function profil(picks) {
    const mit = [];
    for (const p of picks || []) {
      const rolle = p.rolle || hauptRolle(p.champ);
      const m = rolle ? merkmale.fuer(p.champ, rolle) : null;
      if (m) mit.push({...p, rolle, merkmal: m});
    }

    return {
      picks: mit,
      n: mit.length,
      gesamt: (picks || []).length,
      schaden: schadenAus(mit),
      kurve: kurveAus(mit),
      rollen: rollenAus(picks || []),
      struktur: strukturAus(mit),
      abdeckung: abdeckungAus(mit),
    };
  }

  function hauptRolle(champ) {
    for (const r of ROLLEN_FOLGE) {
      const m = merkmale.fuer(champ, r);
      if (m && m.rollen.length && m.rollen[0].rolle === r) return r;
    }
    return null;
  }

  /* --------------------------------------------------------- Schaden */
  /* Der Anteil magischen Schadens ueber die Aufstellung. Liegt er
     ausserhalb des Bandes, reicht dem Gegner ein Widerstand - das ist der
     Grund, warum die Mischung ueberhaupt zaehlt, nicht ein Selbstzweck. */
  function schadenAus(mit) {
    const xs = mit.map((p) => p.merkmal.schaden).filter(Boolean);
    if (!xs.length) return null;
    const magisch = xs.reduce((a, w) => a + w.value, 0) / xs.length;
    return {
      magisch: wert(magisch, {quelle: "draftgap",
                              hinweis: xs.length + " von " + mit.length + " Picks"}),
      balance: wert(bandWert(magisch), {quelle: "draftgap",
        hinweis: Math.round(magisch * 100) + " % magisch"}),
      abdeckung: mit.length ? xs.length / mit.length : 0,
    };
  }

  /** 1 innerhalb des Bandes, faellt davor und danach linear auf 0.
   *  Die Bandgrenzen stehen in der Konfiguration und sind gesetzt, nicht
   *  gemessen - es gibt keine Quelle, die sagt, wo genau es kippt. */
  function bandWert(x) {
    const {schadenBandVon: a, schadenBandBis: b} = COMP;
    if (x >= a && x <= b) return 1;
    return x < a ? klemm(x / a, 0, 1) : klemm((1 - x) / (1 - b), 0, 1);
  }

  /* ----------------------------------------------------------- Kurve */
  /* Die Aufstellung ueber die Spieldauer: Mittel der gemessenen
     Einzelkurven. Gleichgewichtet - es gibt keine Quelle dafuer, dass ein
     Carry staerker zaehlen sollte als ein Support. */
  function kurveAus(mit) {
    const phasen = ["frueh", "mittel", "spaet"];
    const out = {};
    let belegt = 0;
    for (const phase of phasen) {
      const xs = mit.map((p) => p.merkmal.phasen && p.merkmal.phasen[phase])
                    .filter(Boolean);
      if (!xs.length) continue;
      belegt = Math.max(belegt, xs.length);
      out[phase] = wert(xs.reduce((a, w) => a + w.value, 0) / xs.length, {
        quelle: "draftgap",
        stichprobe: xs.reduce((a, w) => a + (w.sampleSize || 0), 0),
        hinweis: xs.length + " von " + mit.length + " Picks",
      });
    }
    if (!Object.keys(out).length) return null;
    out.abdeckung = mit.length ? belegt / mit.length : 0;
    return out;
  }

  /* --------------------------------------------------------- Rollen */
  function rollenAus(picks) {
    const belegt = new Set(picks.map((p) => p.rolle).filter(Boolean));
    const offen = ROLLEN_FOLGE.filter((r) => !belegt.has(r));
    return {belegt: [...belegt], offen,
            vollstaendig: offen.length === 0};
  }

  /* ------------------------------------------------------- Struktur */
  /* Die geschaetzten Achsen. Jede traegt, auf wie vielen gepflegten Picks
     sie beruht - unter zwei ist es eine Aussage ueber einen Champion, nicht
     ueber die Aufstellung, und faellt weg. */
  function strukturAus(mit) {
    return strukturRoh(mit, COMP.heuristikAbPicks);
  }

  /* Die rohe Fassung ohne Mindestzahl. Zwei Nutzungen, zwei Schwellen:
     fuers ANZEIGEN gilt COMP.heuristikAbPicks, weil eine Achse auf einem
     einzigen gepflegten Pick eine Aussage ueber diesen Champion ist und
     nicht ueber die Aufstellung. Fuer eine DIFFERENZ muessen dagegen
     beide Seiten dieselbe Formel tragen - sonst verschwindet eine Achse
     genau dann, wenn der Kandidat sie erst belegbar macht. */
  function strukturRoh(mit, abPicks) {
    if (!heuristik) return null;
    const out = {};
    for (const achse of GESCHAETZTE_ACHSEN) {
      const xs = [];
      for (const p of mit) {
        const w = heuristik.achse(p.champ, achse);
        if (w) xs.push(w.value);
      }
      if (!xs.length || xs.length < abPicks) continue;
      out[achse] = wert(xs.reduce((a, b) => a + b, 0) / mit.length, {
        quelle: "heuristik",
        hinweis: xs.length + " von " + mit.length + " Picks gepflegt",
      });
    }
    return Object.keys(out).length ? out : null;
  }

  function abdeckungAus(mit) {
    const gepflegt = heuristik
      ? mit.filter((p) => heuristik.kennt(p.champ)).length : 0;
    return {
      gemessen: mit.length ? mit.filter((p) => p.merkmal.schaden).length / mit.length : 0,
      heuristik: mit.length ? gepflegt / mit.length : 0,
      picks: mit.length,
    };
  }

  /* ---------------------------------------------------------- Vergleich */
  /** Unsere Aufstellung gegen ihre. Nur Achsen, die auf BEIDEN Seiten
   *  belegt sind - sonst waere der Vergleich eine Behauptung. */
  function vergleich(unser, ihr) {
    const raus = {};
    if (unser.schaden && ihr.schaden) {
      raus.schaden = {
        unser: unser.schaden.magisch.value,
        ihr: ihr.schaden.magisch.value,
        hinweis: "Anteil magischen Schadens",
      };
    }
    if (unser.kurve && ihr.kurve) {
      raus.kurve = {};
      for (const phase of ["frueh", "mittel", "spaet"]) {
        if (unser.kurve[phase] && ihr.kurve[phase]) {
          raus.kurve[phase] = unser.kurve[phase].value - ihr.kurve[phase].value;
        }
      }
    }
    if (unser.struktur && ihr.struktur) {
      raus.struktur = {};
      for (const achse of GESCHAETZTE_ACHSEN) {
        if (unser.struktur[achse] && ihr.struktur[achse]) {
          raus.struktur[achse] =
            unser.struktur[achse].value - ihr.struktur[achse].value;
        }
      }
    }
    return raus;
  }

  /** In welcher Phase stehen wir besser als sie? Das ist die ehrliche
   *  Fassung von "wer skaliert besser": nicht absolut, sondern relativ -
   *  und nur, wenn beide Kurven belegt sind. */
  function phasenVorteil(unser, ihr) {
    if (!unser.kurve || !ihr.kurve) return null;
    const out = {};
    for (const phase of ["frueh", "mittel", "spaet"]) {
      if (unser.kurve[phase] && ihr.kurve[phase]) {
        out[phase] = unser.kurve[phase].value - ihr.kurve[phase].value;
      }
    }
    const paare = Object.entries(out);
    if (!paare.length) return null;
    const beste = paare.reduce((a, b) => (b[1] > a[1] ? b : a));
    return {je: out, stark: beste[0], vorsprung: beste[1]};
  }

  /* -------------------------------------------------------- Marginalwert */
  /** Was aendert sich, wenn wir X dazunehmen? Gibt die Differenz je Achse
   *  zurueck UND eine gewichtete Summe. Die Summe benutzt die Gewichte aus
   *  der Konfiguration - sie ist abgeleitet, nicht gemessen, und heisst
   *  darum auch so. */
  function marginal(picks, kandidat, {gegner = null} = {}) {
    const ohne = profil(picks);
    const mit = profil([...picks, kandidat]);

    const achsen = {};
    let summe = 0, hoechst = 0;
    const nimm = (name, vorher, nachher, quelle) => {
      if (vorher === null || nachher === null
          || vorher === undefined || nachher === undefined) return;
      const g = COMP.achsen[name] || 0;
      const d = nachher - vorher;
      achsen[name] = {vorher, nachher, delta: d, gewicht: g, quelle};
      // Die Differenz liegt in [-1, 1]; auf [0, 1] abgebildet ist 0.5
      // "aendert nichts".
      summe += g * klemm((d + 1) / 2, 0, 1);
      hoechst += g;
    };

    nimm("schadensbalance",
         ohne.schaden ? ohne.schaden.balance.value : null,
         mit.schaden ? mit.schaden.balance.value : null, "draftgap");

    nimm("rollenabdeckung",
         (5 - ohne.rollen.offen.length) / 5,
         (5 - mit.rollen.offen.length) / 5, "draftgap");

    // Kurve nur gegen einen bekannten Gegner: "skaliert besser" ohne
    // Gegenueber ist keine Aussage.
    if (gegner) {
      const a = phasenVorteil(ohne, gegner), b = phasenVorteil(mit, gegner);
      if (a && b) {
        nimm("kurveGegenGegner",
             schnitt(Object.values(a.je)) / 2 + 0.5,
             schnitt(Object.values(b.je)) / 2 + 0.5, "draftgap");
      }
    }

    // Fuer die Differenz die rohe Fassung: dieselbe Formel auf beiden
    // Seiten. Eine Achse, die vorher auf null gepflegten Picks beruhte,
    // beginnt bei 0 - das ist kein Raten, sondern "bislang traegt sie
    // niemand bei".
    const rohOhne = strukturRoh(ohne.picks, 0) || {};
    const rohMit = strukturRoh(mit.picks, 0) || {};
    for (const achse of GESCHAETZTE_ACHSEN) {
      const a = rohOhne[achse], b = rohMit[achse];
      if (!a && !b) continue;
      nimm(achse, a ? a.value : 0, b ? b.value : 0, "heuristik");
    }

    const gemessen = Object.entries(achsen)
      .filter(([, a]) => a.quelle === "draftgap")
      .reduce((n, [, a]) => n + a.gewicht, 0);

    return {
      ohne, mit, achsen,
      // 0..1, 0.5 heisst "aendert nichts". Abgeleitet aus den Gewichten
      // in COMP.achsen, nicht gemessen.
      punkte: hoechst ? summe / hoechst : null,
      hoechstwert: hoechst,
      // Wie viel der Aussage auf Messungen beruht statt auf Einschaetzung
      anteilGemessen: hoechst ? gemessen / hoechst : 0,
    };
  }

  return {profil, vergleich, phasenVorteil, marginal};
}

function schnitt(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
