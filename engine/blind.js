/* Blindpicks: wie gut steht ein Pick gegen Gegner, die noch nicht feststehen?
   ---------------------------------------------------------------------------
   Die fruehere Fassung kannte nur eine Zahl: die Streuung der
   Matchupquoten. Das hat zwei Schwaechen, beide gemessen:

     1. Sie fragt nicht, WER kommt. Ein Champion mit einem einzigen
        katastrophalen Matchup gegen einen Champion, den niemand spielt,
        sah genauso riskant aus wie einer, dessen Counter jeder zweite
        Toplaner pickt.
     2. Sie mass zu einem guten Teil Rauschen. Von 3,85 Punkten
        beobachteter Standardabweichung sind 2,74 Zufall (22.004
        Lanepaarungen). Duenne Tabellen sahen konterbar aus.

   Jetzt wird gerechnet, was die Frage eigentlich ist:

     Ueber die wahrscheinlichen kuenftigen Lanegegner - wie gut steht
     der Pick im Mittel, und wie schlecht im schlechtesten Fuenftel?

   Die Wahrscheinlichkeiten kommen aus gemessener Spielhaeufigkeit auf der
   Rolle (DraftGap) und, wenn die gegnerische Mannschaft gescoutet ist, aus
   dem Rankedpool ihres Spielers. Gebannte, gepickte und durch Fearless
   gesperrte Champions sind nicht im Feld - ein gebannter Counter ist kein
   Risiko mehr.

   Was hier NICHT steht, und warum:

     - Dass der Gegner gezielt kontert, wird nicht ueber eine erfundene
       "Konterneigung" in die Wahrscheinlichkeiten gerechnet. Diese Sorge
       traegt das schlechteste Fuenftel (CVaR), und wie schwer es wiegt,
       entscheidet das Risikoprofil.
     - Rollenspezifische Feinheiten (Waveclear, Roaming, Invade, Selfpeel)
       haben keine Datenquelle. Rollenspezifisch ist die STRUKTUR: Top,
       Jungle und Mid sind ein Gegner, die Botlane ist ein Paar.

   Ueberschneidung mit anderen Teilen der Bewertung - bewusst vermieden:

     matchup    zaehlt die BEKANNTEN Gegner; hier nur die unbekannten
     lookahead  rechnet die Paarung Kandidat/Lanegegner nicht mehr mit
     risiko     enthaelt die Streuung nicht mehr
*/

import { wert } from "./provenance.js";
import { BLIND, RISIKOPROFILE, STANDARD_RISIKO, ROLLEN } from "./config.js";
import {
  ROLLEN_FOLGE, ROLLEN_WORT, gegenseite, gesperrt, schluessel,
} from "./state.js";
import { klemm } from "./features.js";

/** Welche gegnerischen Rollen stehen uns auf der Lane gegenueber. */
export const LANE_GEGNER = {
  TOP: ["TOP"],
  JUNGLE: ["JUNGLE"],
  MIDDLE: ["MIDDLE"],
  BOTTOM: ["BOTTOM", "UTILITY"],
  UTILITY: ["BOTTOM", "UTILITY"],
};

export function blindAnlegen({quelle, team = null}) {
  const feldCache = new Map();
  const lageCache = new Map();

  /* ------------------------------------------------------------ Feld */
  /** Wer kommt auf dieser Rolle wahrscheinlich? Gemessene Partien je
   *  Rolle, gesperrte Champions draussen, auf die haeufigsten bis
   *  BLIND.feldAnteil beschnitten. Optional mit dem Pool des gegnerischen
   *  Spielers gemischt. */
  function feld(rolle, weg, gegner) {
    const k = rolle + "|" + [...weg].sort().join(",") + "|"
      + (gegner ? gegner.team + "/" + gegner.label : "");
    if (feldCache.has(k)) return feldCache.get(k);

    const roh = [];
    let summe = 0;
    for (const c of quelle.champions) {
      if (weg.has(c)) continue;
      const s = quelle.staerke(c, rolle);
      if (!s || !s.sampleSize) continue;
      roh.push({champ: c, n: s.sampleSize});
      summe += s.sampleSize;
    }
    if (!summe) { feldCache.set(k, null); return null; }
    for (const x of roh) x.meta = x.n / summe;

    // Der Pool des gegnerischen Spielers, sofern bekannt und gross genug.
    let poolWort = null;
    if (gegner && team) {
      const pool = team.pool(gegner.team, gegner.label);
      let partien = 0;
      for (const x of roh) {
        const e = pool.get(x.champ);
        x.pool = e ? e.play : 0;
        partien += x.pool;
      }
      if (partien >= BLIND.gegnerPoolMindestPartien) {
        const a = BLIND.gegnerPoolAnteil;
        for (const x of roh) x.meta = (1 - a) * x.meta + a * (x.pool / partien);
        poolWort = gegner.label + " (" + partien
                   + " Rankedpartien mit Champions dieser Rolle)";
      }
    }

    roh.sort((a, b) => b.meta - a.meta || (a.champ < b.champ ? -1 : 1));
    const liste = [];
    let kum = 0;
    for (const x of roh) {
      liste.push({champ: x.champ, p: x.meta});
      kum += x.meta;
      if (kum >= BLIND.feldAnteil || liste.length >= BLIND.feldHoechstens) break;
    }
    const masse = liste.reduce((a, x) => a + x.p, 0);
    for (const x of liste) x.p /= masse;
    const out = {liste, abgedeckt: kum, poolWort};
    feldCache.set(k, out);
    return out;
  }

  /* ------------------------------------------------------------ Lage */
  /** Was wissen wir ueber unsere Lane? Je gegnerischer Lanerolle:
   *  bekannt (sicher), bekannt aber rollenunsicher, oder offen.
   *
   *  Gibt den Modus zurueck:
   *    "counter"    alle Lanegegner stehen fest
   *    "blind"      keiner
   *    "teilweise"  dazwischen - Botlane halb bekannt, oder ein
   *                 gegnerischer Flexpick, dessen Rolle nicht sicher ist
   */
  function lage(zustand, rolle) {
    const k = schluessel(zustand, "lage|" + rolle);
    if (lageCache.has(k)) return lageCache.get(k);

    const sie = gegenseite(zustand.wirSind);
    const ihre = zustand.picks[sie];
    const belegt = new Set(ihre.map((p) => p.rolle).filter(Boolean));
    const offen = ROLLEN_FOLGE.filter((r) => !belegt.has(r));

    const seiten = (LANE_GEGNER[rolle] || []).map((l) => {
      const p = ihre.find((x) => x.rolle === l);
      if (!p) return {rolle: l, champ: null, sicherheit: 0, unbekannt: 1};
      const r = rollenSicherheit(p.champ, l, offen);
      return {rolle: l, champ: p.champ, sicherheit: r.anteil,
              unbekannt: r.sicher ? 0 : 1 - r.anteil};
    });

    const unbekannt = seiten.length
      ? seiten.reduce((a, s) => a + s.unbekannt, 0) / seiten.length : 0;
    const modus = unbekannt === 0 ? "counter"
      : seiten.every((s) => s.unbekannt === 1) ? "blind" : "teilweise";
    const out = {modus, seiten, unbekannt, text: lageText(modus, seiten)};
    lageCache.set(k, out);
    return out;
  }

  /** Wie sicher spielt dieser gegnerische Champion die Rolle, auf die er
   *  eingetragen ist? Bezogen auf die Rollen, die ihm beim Gegner noch
   *  offenstehen - ein Champion, der zu 60 % Jungle spielt, ist auf Top
   *  sicher, wenn der Jungle schon besetzt ist.
   *
   *  Unsicher heisst: eine andere offene Rolle traegt mindestens
   *  ROLLEN.flexAbAnteil - die Flexdefinition des ganzen Boards. */
  function rollenSicherheit(champ, rolle, offen) {
    const v = quelle.rollenVerteilung(champ);
    // Unbekannt: wir glauben dem Eintrag.
    if (!v) return {anteil: 1, sicher: true};
    const moeglich = new Set([rolle, ...offen]);
    const anteile = [];
    let summe = 0;
    for (const [r, a] of Object.entries(v.value)) {
      if (!moeglich.has(r) || a < ROLLEN.mindestAnteil) continue;
      anteile.push([r, a]);
      summe += a;
    }
    if (!summe) return {anteil: 1, sicher: true};
    const hier = (anteile.find(([r]) => r === rolle) || [null, 0])[1] / summe;
    const sicher = !anteile.some(([r, a]) => r !== rolle
                                          && a / summe >= ROLLEN.flexAbAnteil);
    return {anteil: hier, sicher};
  }

  /* ------------------------------------------------------- Szenarien */
  /** Die moeglichen Lanegegner als Wahrscheinlichkeitsverteilung. Nur die
   *  UNBEKANNTEN Seiten tragen Szenarien; eine bekannte Seite bedingt
   *  hoechstens die andere (Botlane: wer spielt mit dem bekannten ADC?). */
  function szenarien(zustand, rolle, {gegnerFuer = null} = {}) {
    const l = lage(zustand, rolle);
    if (l.modus === "counter") return {lage: l, liste: [], seiten: []};
    const weg = new Set(gesperrt(zustand).keys());
    const offenSeiten = l.seiten.filter((s) => s.unbekannt > 0);

    // Ein Gegner: das Feld seiner Rolle.
    if (l.seiten.length === 1) {
      const s = offenSeiten[0];
      const f = feld(s.rolle, weg, gegnerFuer ? gegnerFuer(s.rolle) : null);
      if (!f) return {lage: l, liste: [], seiten: []};
      return {
        lage: l, feld: [f],
        liste: f.liste.map((x) => ({gegner: [{champ: x.champ, rolle: s.rolle}],
                                    p: x.p})),
        seiten: [s.rolle],
      };
    }

    // Botlane: zwei Gegner, als Paar.
    const [a, b] = l.seiten;                 // BOTTOM, UTILITY
    const fa = a.unbekannt > 0
      ? feld(a.rolle, weg, gegnerFuer ? gegnerFuer(a.rolle) : null) : null;
    const fb = b.unbekannt > 0
      ? feld(b.rolle, weg, gegnerFuer ? gegnerFuer(b.rolle) : null) : null;

    // Eine Seite bekannt: die andere bedingt auf den bekannten Partner,
    // nach gemessener gemeinsamer Partienzahl.
    if (!fa || !fb) {
      const bekannt = fa ? b : a;
      const offeneSeite = fa ? a : b;
      const f = fa || fb;
      if (!f) return {lage: l, liste: [], seiten: []};
      const roh = f.liste.map((x) => {
        const e = quelle.synergie(bekannt.champ, bekannt.rolle,
                                  x.champ, offeneSeite.rolle);
        return {champ: x.champ, n: e ? e.sampleSize : 0, meta: x.p};
      });
      const summe = roh.reduce((s, x) => s + x.n, 0);
      const liste = roh
        .map((x) => ({gegner: [{champ: x.champ, rolle: offeneSeite.rolle}],
                      // Ohne gemeinsame Partien bleibt die Metahaeufigkeit.
                      p: summe ? x.n / summe : x.meta}))
        .filter((x) => x.p > 0);
      return {lage: l, feld: [f], liste, seiten: [offeneSeite.rolle],
              bedingtAuf: bekannt.champ};
    }

    // Beide offen: Paare nach gemessener gemeinsamer Partienzahl.
    const roh = [];
    let summe = 0;
    for (const x of fa.liste.slice(0, BLIND.botBreite)) {
      for (const y of fb.liste.slice(0, BLIND.botBreite)) {
        if (x.champ === y.champ) continue;
        const e = quelle.synergie(x.champ, a.rolle, y.champ, b.rolle);
        if (!e || !e.sampleSize) continue;
        roh.push({x, y, n: e.sampleSize});
        summe += e.sampleSize;
      }
    }
    if (!summe) return {lage: l, liste: [], seiten: []};
    roh.sort((u, v) => v.n - u.n);
    const liste = roh.slice(0, BLIND.botPaareHoechstens).map((r) => ({
      gegner: [{champ: r.x.champ, rolle: a.rolle},
               {champ: r.y.champ, rolle: b.rolle}],
      p: r.n / summe,
    }));
    const masse = liste.reduce((s, x) => s + x.p, 0);
    for (const x of liste) x.p /= masse;
    return {lage: l, feld: [fa, fb], liste, seiten: [a.rolle, b.rolle]};
  }

  /* ------------------------------------------------------- Bewertung */
  /** Eine gemessene Abweichung, um Rauschen bereinigt. Bei 343 Partien
   *  ist eine Quote halb Signal, halb Zufall - siehe BLIND.schrumpfK. */
  function abweichung(champ, rolle, gegner, gegnerRolle) {
    const m = quelle.matchup(champ, rolle, gegner, gegnerRolle);
    const e = m ? quelle.paarMittel(gegner, gegnerRolle, "m") : null;
    if (!m || !e) return null;
    const n = m.sampleSize || 0;
    const roh = m.value - (1 - e.value);
    return {roh, d: roh * n / (n + BLIND.schrumpfK), n, quote: m.value,
            erwartet: 1 - e.value};
  }

  /** Den Kandidaten ueber die Szenarien rechnen. null, wenn der
   *  Lanegegner feststeht oder zu wenig des Felds Daten hat. */
  function bewerte(zustand, champ, rolle, {
    gegnerFuer = null, risikoprofil = STANDARD_RISIKO, szen = null,
  } = {}) {
    const sz = szen || szenarien(zustand, rolle, {gegnerFuer});
    if (!sz.liste.length) return null;

    const punkte = [];
    const jeGegner = new Map();          // fuer die Counterliste
    let abgedeckt = 0, konf = 0;
    for (const s of sz.liste) {
      let summe = 0, gewicht = 0, n = 0;
      for (const g of s.gegner) {
        const a = abweichung(champ, rolle, g.champ, g.rolle);
        const k = g.champ + "|" + g.rolle;
        if (!jeGegner.has(k)) {
          jeGegner.set(k, {champ: g.champ, rolle: g.rolle, p: 0, a});
        }
        jeGegner.get(k).p += s.p;
        if (!a) continue;
        // Innerhalb eines Paars nach Partien gewichtet, wie paarSchnitt.
        summe += a.d * a.n; gewicht += a.n; n += a.n;
      }
      if (!gewicht) continue;
      punkte.push({p: s.p, d: summe / gewicht});
      abgedeckt += s.p;
      konf += s.p * Math.min(1, Math.sqrt(n / 2000));
    }
    if (abgedeckt < BLIND.mindestAbdeckung) return null;

    for (const x of punkte) x.p /= abgedeckt;
    const ev = punkte.reduce((a, x) => a + x.p * x.d, 0);
    const schlecht = schwanz(punkte, BLIND.schwanzAnteil, "unten");
    const gut = schwanz(punkte, BLIND.schwanzAnteil, "oben");

    const profil = RISIKOPROFILE[risikoprofil] || RISIKOPROFILE[STANDARD_RISIKO];
    const roh = profil.schlechtester * schlecht + profil.erwartet * ev
              + profil.bester * gut;

    const konter = [...jeGegner.values()]
      .filter((x) => x.a && x.a.d <= BLIND.stufen.unguenstig)
      .map((x) => ({champ: x.champ, rolle: x.rolle, p: x.p, d: x.a.d,
                    quote: x.a.quote, spiele: x.a.n, stufe: stufeVon(x.a.d)}))
      .sort((u, v) => v.p * -v.d - u.p * -u.d);
    const gefahr = konter.filter((x) => x.stufe !== "unguenstig")
      .reduce((a, x) => a + x.p, 0);
    const guenstig = [...jeGegner.values()]
      .filter((x) => x.a && x.a.d >= -BLIND.stufen.unguenstig)
      .reduce((a, x) => a + x.p, 0) / (sz.seiten.length || 1);

    return {
      modus: sz.lage.modus,
      anteilUnbekannt: sz.lage.unbekannt,
      ev, schlechtestes: schlecht, bestes: gut, roh,
      wert: klemm(0.5 + roh / (2 * BLIND.spanne), 0, 1),
      konter: konter.slice(0, 6),
      gefahrMasse: gefahr / (sz.seiten.length || 1),
      guenstigMasse: guenstig,
      szenarien: sz.liste.length,
      abdeckung: abgedeckt,
      bedingtAuf: sz.bedingtAuf || null,
      poolWort: (sz.feld || []).map((f) => f && f.poolWort).filter(Boolean),
      konfidenz: abgedeckt ? klemm(konf / abgedeckt, 0, 1) : 0,
      text: "erwartet " + pp(ev) + ", schlechtestes F\u00fcnftel " + pp(schlecht)
            + " \u00fcber " + sz.liste.length + " wahrscheinliche "
            + (sz.seiten.length > 1 ? "Botlanes" : "Gegner")
            + (sz.lage.modus === "teilweise" ? " (Lane teilweise bekannt)" : ""),
    };
  }

  /** Ist der Champion auf dieser Rolle ein Prio-Pick? Gemessen: er
   *  gehoert zu den meistgespielten der Rolle, die zusammen
   *  BLIND.prioAnteil aller Rollenpartien stellen. Das ist "wird
   *  wahrscheinlich umkaempft" - keine Aussage ueber Staerke. */
  const prioCache = new Map();
  function prio(champ, rolle) {
    if (!prioCache.has(rolle)) {
      const f = feld(rolle, new Set(), null);
      const set = new Map();
      let kum = 0, rang = 0;
      for (const x of (f ? f.liste : [])) {
        rang += 1;
        set.set(x.champ, {rang, anteil: x.p, prio: kum < BLIND.prioAnteil});
        kum += x.p;
      }
      prioCache.set(rolle, set);
    }
    return prioCache.get(rolle).get(champ) || null;
  }

  return {lage, szenarien, bewerte, feld, abweichung, prio,
          leeren: () => { feldCache.clear(); lageCache.clear(); prioCache.clear(); }};
}

/* ------------------------------------------------------------ Helfer */

/** Erwartungswert ueber das schlechteste (oder beste) Stueck der
 *  Wahrscheinlichkeitsmasse. Ein Szenario am Rand zaehlt anteilig. */
function schwanz(punkte, anteil, seite) {
  const sortiert = punkte.slice().sort((a, b) =>
    seite === "unten" ? a.d - b.d : b.d - a.d);
  let rest = anteil, summe = 0;
  for (const x of sortiert) {
    const nimm = Math.min(rest, x.p);
    summe += nimm * x.d;
    rest -= nimm;
    if (rest <= 1e-12) break;
  }
  const genommen = anteil - rest;
  return genommen > 0 ? summe / genommen : 0;
}

function stufeVon(d) {
  const s = BLIND.stufen;
  return d <= s.sehrGefaehrlich ? "sehr gefaehrlich"
       : d <= s.gefaehrlich ? "gefaehrlich" : "unguenstig";
}

function lageText(modus, seiten) {
  if (modus === "counter") {
    return "Lanegegner bekannt: " + seiten.map((s) => s.champ).join(" + ");
  }
  if (modus === "blind") {
    return seiten.length > 1 ? "Botlane des Gegners offen"
                             : "Lanegegner noch offen";
  }
  return seiten.map((s) => s.unbekannt === 1 ? ROLLEN_WORT[s.rolle] + " offen"
    : s.unbekannt > 0 ? s.champ + " (Rolle " + Math.round(s.sicherheit * 100)
                        + " % sicher)"
    : s.champ + " bekannt").join(", ");
}

function pp(d) {
  const v = d * 100;
  return (v >= 0 ? "+" : "") + v.toFixed(1).replace(".", ",") + " Punkte";
}
