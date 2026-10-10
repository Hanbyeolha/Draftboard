/* Vorausschauen: was antwortet der Gegner, und wie gut stehen wir danach?
   ---------------------------------------------------------------------------
   Ein Pick, der gegen eine einzige Antwort grossartig ist und gegen die
   uebrigen einbricht, ist schlechter als einer, der ueberall gut steht.
   Das sieht man nur, wenn man einen Zug weiterdenkt.

   Die Rechnung ist bewusst flach:

     unser Kandidat -> wahrscheinliche Antwort -> unsere beste Erwiderung

   Tiefer zu gehen hiesse, Unsicherheit auf Unsicherheit zu stapeln. Das
   Gegnermodell ist eine Schaetzung; in der dritten Lage waere davon
   nichts mehr uebrig, was eine Entscheidung tragen koennte.

   Was hier NICHT behauptet wird: dass wir wissen, was der Gegner tut. Die
   Wahrscheinlichkeiten sind aus Metahaeufigkeit und Matchupwert
   abgeleitet, nicht beobachtet - uns fehlen aufgezeichnete
   Draftreihenfolgen, um sie zu pruefen (games.json hat keine). Sie
   tragen darum eine eigene, niedrige Konfidenz.
*/

import {
  SUCHE, RISIKOPROFILE, STANDARD_RISIKO, KONFIDENZ, ANZEIGE, COMP_REFERENZ,
} from "./config.js";
import { ROLLEN_FOLGE, gegenseite, offeneRollen, gesperrt } from "./state.js";
import { klemm } from "./features.js";
import { LANE_GEGNER } from "./blind.js";

export function sucheAnlegen({quelle, merkmale, bewerter}) {

  /* --------------------------------------------- Gegnervorrat */
  /** Welche Champions kaemen fuer den Gegner ueberhaupt in Frage?
   *  Einmal fuer die aktuelle Lage bestimmt, dann je eigenem Kandidaten
   *  nur neu bewertet - 87 Bewertungen je Kandidat waeren zu teuer. */
  function gegnerVorrat(zustand, {vorrat = SUCHE.gegnerVorrat} = {}) {
    const sie = gegenseite(zustand.wirSind);
    const ihreSicht = {...zustand, wirSind: sie};
    const weg = gesperrt(zustand);
    // Erst nach Patchstaerke vorfiltern, dann bewerten. Sonst haengt die
    // Laufzeit daran, wie viele Rollen beim Gegner offen sind: in der
    // Draftmitte waren das fuenfmal so viele Bewertungen wie noetig.
    const offen = new Set(weg.keys());
    const eng = [];
    for (const rolle of offeneRollen(zustand, sie)) {
      for (const m of merkmale.kandidaten(rolle, {ausser: offen})
                        .sort((a, b) => b.staerke.value - a.staerke.value)
                        .slice(0, vorrat)) {
        eng.push({champ: m.champ, rolle});
      }
    }
    const raus = [];
    for (const k of eng) {
      const r = bewerter.bewerte(ihreSicht, k.champ, k.rolle, {schnell: true});
      if (r) raus.push({champ: k.champ, rolle: k.rolle, score: r.score});
    }
    raus.sort((a, b) => b.score - a.score);
    return raus.slice(0, vorrat);
  }

  /** Was antwortet der Gegner auf diese Lage? Verteilung, keine Gewissheit.
   *  Softmax ueber die Punkte aus SEINER Sicht. */
  function gegnerAntworten(zustand, vorrat, {
    beite = SUCHE.beiteGegner, temperatur = SUCHE.temperatur,
  } = {}) {
    const sie = gegenseite(zustand.wirSind);
    const ihreSicht = {...zustand, wirSind: sie};
    const weg = gesperrt(zustand);
    const bewertet = [];
    for (const k of vorrat) {
      if (weg.has(k.champ)) continue;
      const r = bewerter.bewerte(ihreSicht, k.champ, k.rolle, {schnell: true});
      if (r) bewertet.push({champ: k.champ, rolle: k.rolle, score: r.score});
    }
    if (!bewertet.length) return [];
    bewertet.sort((a, b) => b.score - a.score);
    const oben = bewertet.slice(0, beite);

    const bestes = oben[0].score;
    const roh = oben.map((k) => Math.exp((k.score - bestes) / temperatur));
    const summe = roh.reduce((a, b) => a + b, 0);
    return oben
      .map((k, i) => ({...k, p: roh[i] / summe}))
      .filter((k) => k.p >= SUCHE.mindestWahrscheinlichkeit);
  }

  /* ------------------------------------------------------- Lookahead */
  /** Wie gut stehen wir nach diesem Pick, ueber die wahrscheinlichen
   *  Antworten gemittelt? Gibt Erwartungswert, schlechtesten und besten
   *  Ausgang - und daraus die Robustheit. */
  function lookahead(zustand, kandidat, rolle, {
    vorrat, spielerFuer = null, risikoprofil = STANDARD_RISIKO,
  } = {}) {
    const nach = mitPick(zustand, zustand.wirSind, kandidat, rolle);
    const antworten = gegnerAntworten(nach, vorrat || gegnerVorrat(nach));
    if (!antworten.length) return null;

    /* Was der Lookahead NICHT noch einmal zaehlen darf: den Kandidaten
       gegen die Gegner, die schon feststehen (das ist "matchup"), und
       gegen seinen Lanegegner (das ist "blindSicherheit"). */
    const ohne = {
      champ: kandidat,
      bekannt: new Set(zustand.picks[gegenseite(zustand.wirSind)]
                         .map((p) => p.champ)),
      lane: new Set(LANE_GEGNER[rolle] || []),
    };

    const aeste = [];
    for (const a of antworten) {
      const danach = mitPick(nach, gegenseite(zustand.wirSind), a.champ, a.rolle);
      const w = zustandsWert(danach, spielerFuer, ohne);
      if (w === null) continue;
      aeste.push({antwort: a.champ, rolle: a.rolle, p: a.p, wert: w.wert,
                  erwiderung: w.erwiderung, art: w.art});
    }
    if (!aeste.length) return null;

    const masse = aeste.reduce((n, x) => n + x.p, 0);
    const ev = aeste.reduce((n, x) => n + x.p * x.wert, 0) / masse;
    const werte = aeste.map((x) => x.wert);
    const schlechtester = Math.min(...werte);
    const bester = Math.max(...werte);

    const profil = RISIKOPROFILE[risikoprofil] || RISIKOPROFILE[STANDARD_RISIKO];
    const gewichtet = profil.schlechtester * schlechtester
                    + profil.erwartet * ev
                    + profil.bester * bester;

    return {
      // Alles in Siegquoten, nicht in Punkten. Die Umrechnung auf 0..1
      // fuer die Bewertung macht rangliste() ueber die Vorauswahl.
      roh: gewichtet,
      ev, schlechtester, bester,
      spanne: bester - schlechtester,
      robustheit: robustheitWort(bester - schlechtester),
      aeste,
      // Das Gegnermodell ist eine Schaetzung, keine Beobachtung.
      konfidenz: 0.4,
      text: "erwartet " + (ev * 100).toFixed(1) + " %, schlechtestenfalls "
            + (schlechtester * 100).toFixed(1) + " %",
    };
  }

  /** Wie gut stehen wir in dieser Lage?
   *
   *  Zwei Faelle, und sie haben verschiedene Skalen - das ist in Ordnung,
   *  weil innerhalb EINES Lookaheads immer derselbe Fall gilt: entweder
   *  picken wir danach noch oder nicht.
   *
   *    picken wir noch  -> die Punkte unserer besten Erwiderung
   *    sonst            -> die gemessene Quote unserer fertigen
   *                        Aufstellung gegen ihre, auf 0..100 gelegt
   *
   *  Ohne den zweiten Fall waere der Lookahead ausgerechnet beim letzten
   *  Pick blind - und das ist der, bei dem es am meisten zaehlt. */
  function zustandsWert(zustand, spielerFuer, ohne = null) {
    // Haben wir noch einen Zug, gehoert unsere beste Antwort zur Lage:
    // ein Pick ist mehr wert, wenn uns danach noch etwas Gutes bleibt.
    let lage = zustand, erwiderung = null;
    if (offeneRollen(zustand, zustand.wirSind).length) {
      const b = besteErwiderung(zustand, spielerFuer);
      if (b) {
        erwiderung = b.champion;
        lage = mitPick(zustand, zustand.wirSind, b.champion, b.rolle);
      }
    }
    const q = compQuote(lage, ohne);
    if (q === null) return null;
    // Die gemessene Quote selbst, NICHT auf eine Punkteskala gelegt. Die
    // Normierung geschieht spaeter ueber die Vorauswahl - siehe
    // rangliste(). Eine absolute Abbildung haetten wir uns ausdenken
    // muessen; eine Rangordnung ist die ehrlichere Aussage.
    return {wert: q, erwiderung, art: erwiderung ? "mit Erwiderung" : "comp"};
  }

  /** Die nach Partien gewichtete Quote ueber ALLE gemessenen Paarungen
   *  zwischen unseren und ihren Picks. Keine Hochrechnung auf eine
   *  Teamstaerke - das, was diese Champions gegeneinander geholt haben. */
  function compQuote(zustand, ohne = null) {
    const sie = gegenseite(zustand.wirSind);
    let summe = 0, gewicht = 0;
    for (const a of zustand.picks[zustand.wirSind]) {
      for (const b of zustand.picks[sie]) {
        if (!a.rolle || !b.rolle) continue;
        if (ohne && a.champ === ohne.champ
            && (ohne.bekannt.has(b.champ) || ohne.lane.has(b.rolle))) {
          continue;
        }
        const e = quelle.matchup(a.champ, a.rolle, b.champ, b.rolle);
        if (!e) continue;
        summe += e.value * e.sampleSize;
        gewicht += e.sampleSize;
      }
    }
    return gewicht ? summe / gewicht : null;
  }

  /* -------------------------------------------- Woraus die Quote besteht */
  /** Dieselbe Rechnung wie compQuote, aber jede Paarung einzeln - damit
   *  man sieht, warum die Zahl fast immer bei 50 % liegt. Lane-Paarungen
   *  (dieselbe Rolle, Botlane als 2v2) stehen getrennt vom Rest. */
  function compAufschluesselung(zustand) {
    const sie = gegenseite(zustand.wirSind);
    const paare = [];
    let summe = 0, gewicht = 0, laneSumme = 0, laneGewicht = 0;
    for (const a of zustand.picks[zustand.wirSind]) {
      for (const b of zustand.picks[sie]) {
        if (!a.rolle || !b.rolle) continue;
        const lane = (LANE_GEGNER[a.rolle] || []).includes(b.rolle);
        const m = quelle.matchup(a.champ, a.rolle, b.champ, b.rolle);
        paare.push({wir: a.champ, wirRolle: a.rolle, sie: b.champ, sieRolle: b.rolle,
                    lane, quote: m ? m.value : null, spiele: m ? m.sampleSize : 0});
        if (!m) continue;
        summe += m.value * m.sampleSize; gewicht += m.sampleSize;
        if (lane) { laneSumme += m.value * m.sampleSize; laneGewicht += m.sampleSize; }
      }
    }
    return {
      quote: gewicht ? summe / gewicht : null,
      spiele: gewicht,
      paare,
      mitDaten: paare.filter((p) => p.quote !== null).length,
      lane: laneGewicht ? {quote: laneSumme / laneGewicht,
                           anteil: laneGewicht / gewicht} : null,
      rest: gewicht > laneGewicht
        ? {quote: (summe - laneSumme) / (gewicht - laneGewicht),
           anteil: (gewicht - laneGewicht) / gewicht} : null,
    };
  }

  /** Der Massstab: die Quote echter, vollstaendiger Drafts. drafts:
   *  [{wir: [{champ, rolle}], sie: [...]}] - am besten jede Partie aus
   *  beiden Sichten, dann liegt die Verteilung symmetrisch um 50 %. */
  function compReferenz(drafts) {
    const quoten = [], paare = [];
    for (const d of drafts || []) {
      if ((d.wir || []).length !== 5 || (d.sie || []).length !== 5) continue;
      const x = compAufschluesselung({wirSind: "blue",
                                      picks: {blue: d.wir, red: d.sie}});
      if (x.quote === null) continue;
      quoten.push(x.quote);
      for (const p of x.paare) if (p.quote !== null) paare.push(p.quote);
    }
    const sortiert = (xs) => xs.slice().sort((a, b) => a - b);
    const qs = sortiert(quoten), ps = sortiert(paare);
    const bei = (xs, k) => xs.length ? xs[Math.min(xs.length - 1, Math.floor(xs.length * k))] : null;
    return {quoten: qs, n: qs.length,
            min: qs.length ? qs[0] : null, max: qs.length ? qs[qs.length - 1] : null,
            p5: bei(qs, 0.05), p95: bei(qs, 0.95),
            paarP5: bei(ps, 0.05), paarP95: bei(ps, 0.95)};
  }

  /** Der Massstab aus dem Patch: Aufstellungen, gezogen nach der
   *  gemessenen Spielhaeufigkeit jeder Rolle (alle Partien im
   *  DraftGap-Datensatz), ohne doppelte Champions. Unabhaengig je Rolle -
   *  gemessen weicht das bei der Botlane um 0,18 Punkte je Paar von der
   *  echten gemeinsamen Haeufigkeit ab. Einmal gerechnet, dann gemerkt. */
  let globaleReferenz = null;
  function compReferenzGlobal() {
    if (globaleReferenz) return globaleReferenz;
    const felder = {};
    for (const r of ROLLEN_FOLGE) {
      felder[r] = quelle.champions
        .map((c) => ({c, n: (quelle.staerke(c, r) || {}).sampleSize || 0}))
        .filter((x) => x.n > 0);
    }
    const z = zufallAus(COMP_REFERENZ.saat);
    const ziehe = (rolle, weg) => {
      const f = felder[rolle];
      let summe = 0;
      for (const x of f) if (!weg.has(x.c)) summe += x.n;
      let u = z() * summe;
      for (const x of f) {
        if (weg.has(x.c)) continue;
        u -= x.n;
        if (u <= 0) return x.c;
      }
      return null;
    };
    const drafts = [];
    for (let i = 0; i < COMP_REFERENZ.anzahl; i++) {
      const weg = new Set(), wir = [], sie = [];
      for (const r of ROLLEN_FOLGE) {
        const a = ziehe(r, weg); if (a) { weg.add(a); wir.push({champ: a, rolle: r}); }
        const b = ziehe(r, weg); if (b) { weg.add(b); sie.push({champ: b, rolle: r}); }
      }
      drafts.push({wir, sie});
    }
    globaleReferenz = {...compReferenz(drafts), quelle: "draftgap",
                       art: "gezogen nach Spielhaeufigkeit im Patch"};
    return globaleReferenz;
  }

  /** Anteil der Referenzdrafts mit niedrigerer Quote, 0..1. */
  function compPerzentil(quote, referenz) {
    if (quote === null || !referenz || !referenz.n) return null;
    let unter = 0;
    for (const x of referenz.quoten) { if (x < quote) unter++; else break; }
    return unter / referenz.n;
  }

  /** Unsere beste Erwiderung in einer Lage. Beschraenkt auf die
   *  aussichtsreichsten Kandidaten - alle zu pruefen kostet Zeit, die
   *  der Draft nicht hat. */
  function besteErwiderung(zustand, spielerFuer) {
    const weg = new Set(gesperrt(zustand).keys());
    // Der Deckel gilt GLOBAL, nicht je Rolle: sonst waeren es bei vier
    // offenen Rollen viermal so viele Bewertungen, und die Laufzeit
    // haenge daran, wie frueh im Draft man steht. Eine volle Rangliste
    // lag damit bei 238 ms - zu nah an der Grenze.
    const kand = [];
    for (const rolle of offeneRollen(zustand, zustand.wirSind)) {
      for (const m of merkmale.kandidaten(rolle, {ausser: weg})) {
        kand.push({rolle, champ: m.champ, staerke: m.staerke.value});
      }
    }
    kand.sort((a, b) => b.staerke - a.staerke);
    let bestes = null;
    for (const m of kand.slice(0, SUCHE.beiteAntwort)) {
      const wer = spielerFuer ? spielerFuer(m.rolle) : null;
      const r = bewerter.bewerte(zustand, m.champ, m.rolle, {
        spielerTeam: wer ? wer.team : null,
        spielerLabel: wer ? wer.label : null,
        schnell: true,
      });
      if (r && (!bestes || r.score > bestes.score)) bestes = r;
    }
    return bestes;
  }

  /* -------------------------------------------------------- Rangliste */
  /** Die vollstaendige Liste fuer eine Rolle, die aussichtsreichsten mit
   *  Lookahead. Alles andere bekaeme sonst eine Zahl, die nicht gerechnet
   *  wurde. */
  function rangliste(zustand, rolle, {
    spielerTeam = null, spielerLabel = null, spielerFuer = null,
    risikoprofil = STANDARD_RISIKO, mitLookahead = true, gegnerFuer = null,
  } = {}) {
    const weg = gesperrt(zustand);
    const grund = [];
    for (const m of merkmale.kandidaten(rolle, {ausser: new Set(weg.keys())})) {
      const r = bewerter.bewerte(zustand, m.champ, rolle,
                                 {spielerTeam, spielerLabel, risikoprofil,
                                  gegnerFuer});
      if (r) grund.push(r);
    }
    grund.sort((a, b) => b.score - a.score);
    if (!mitLookahead) return entscheiden(grund);

    // Der Gegnervorrat wird EINMAL bestimmt und je Kandidat neu bewertet.
    const vorrat = gegnerVorrat(zustand);
    const oben = grund.slice(0, SUCHE.beiteEigen);
    const mitL = oben.map((r) => ({
      r, l: lookahead(zustand, r.champion, rolle,
                      {vorrat, spielerFuer, risikoprofil}),
    }));

    /* Die Lookaheadwerte liegen als Siegquoten vor. Gemessen wird gegen
       den Median DIESER Vorauswahl, auf fester Skala (SUCHE.lookaheadSpanne,
       geeicht): 0,5 heisst "wie der Median" und laesst die Note
       unveraendert (siehe score.js). Vorher wurde per Min-Max gestreckt -
       eine Spanne von 0,1 Punkten Rauschen fuellte dann die volle Skala,
       und der schlechteste der zwoelf rutschte unter Kandidaten, fuer die
       gar nicht vorausgerechnet wurde (Audit P1.1/P1.2).

       Die Vorauswahl ist deterministisch (die besten SUCHE.beiteEigen
       nach Grundnote), also ist auch das Ergebnis es. */
    const rohe = mitL.map((x) => x.l).filter(Boolean).map((l) => l.roh)
      .sort((a, b) => a - b);
    const median = rohe.length ? rohe[Math.floor(rohe.length / 2)] : null;

    const fertig = mitL.map(({r, l}) => {
      if (!l || median === null) return r;
      const anteil = klemm(0.5 + (l.roh - median) / (2 * SUCHE.lookaheadSpanne),
                           0, 1);
      const neu = bewerter.bewerte(zustand, r.champion, rolle, {
        spielerTeam, spielerLabel, risikoprofil, gegnerFuer,
        lookahead: {...l, wert: anteil},
      });
      return {...neu, lookahead: {...l, wert: anteil}};
    });
    return entscheiden(fertig.concat(grund.slice(SUCHE.beiteEigen)));
  }

  /* ---------------------------------------------------- Entscheidung */
  /** Je unsicherer, desto naeher am Durchschnitt.
   *
   *  Eine Note von 92 auf duenner Datenlage ist nicht mehr wert als 89
   *  auf dicker. Multiplizieren mit der Konfidenz waere falsch: es
   *  bestrafte jeden unsicheren Champion, auch einen schwachen. Hier
   *  wird zum Median der Liste geschrumpft - beide Enden ruecken zur
   *  Mitte, und genau das heisst "wir wissen es nicht genau".
   *
   *  Die Note selbst bleibt unveraendert stehen; sortiert wird nach dem
   *  Entscheidungswert. */
  function entscheiden(liste) {
    const noten = liste.map((r) => r.score).filter(Number.isFinite)
      .sort((a, b) => a - b);
    const median = noten.length ? noten[Math.floor(noten.length / 2)] : 50;
    const b = KONFIDENZ.schrumpfBoden;
    for (const r of liste) {
      const k = Number.isFinite(r.confidence) ? r.confidence : 0.5;
      const f = b + (1 - b) * k;
      r.entscheidung = Number((median + (r.score - median) * f).toFixed(1));
      r.median = median;
    }
    return liste.sort((x, y) => y.entscheidung - x.entscheidung
                             || y.score - x.score
                             || (x.champion < y.champion ? -1 : 1));
  }

  /* ---------------------------------------------------- Kategorien */
  /** Fuenf Antworten auf fuenf Fragen. Sie duerfen sich ueberschneiden.
   *
   *  Nur Kandidaten nahe am besten kommen in Frage (ANZEIGE.
   *  kategorieAbstand). Sonst waere der Komfortpick ein strategisch
   *  schlechter Champion, den jemand eben gern spielt - genau das soll
   *  Komfort nicht koennen. */
  function kategorien(liste) {
    if (!liste.length) return [];
    const bester = liste[0];
    const nahe = liste.filter((r) =>
      r.entscheidung >= bester.entscheidung - ANZEIGE.kategorieAbstand);
    const max = (xs, f) => {
      let top = null, v = -Infinity;
      for (const r of xs) {
        const w = f(r);
        if (Number.isFinite(w) && w > v) { v = w; top = r; }
      }
      return top ? {r: top, wert: v} : null;
    };
    const teil = (r, name) => r.components[name] ? r.components[name].roh : null;

    /* Eine Kennzahl je LISTE, nicht je Kandidat (Audit P2.9). Vorher
       nahm jeder Kandidat die erste, die er hatte - Blind-Fuenftel,
       Lookahead-Ast, Konfidenz - 1 oder den gekappten Matchup-Rohwert -
       und alle wurden in einem max() verglichen. Wer die gewaehlte
       Kennzahl nicht hat, faellt aus der Kategorie. Alle drei sind
       Abweichungen der Siegquote, also eine Skala:
         blind      schlechtestes / bestes Fuenftel der Lanegegner
         lookahead  schlechtester / bester Ast
         lane       alles steht fest: nur aggressiv, der geschrumpfte
                    Lane-Vorteil. "sicher" entfaellt - ohne Streuung gibt
                    es keinen schlechtesten Ausgang, und Datenkonfidenz
                    ist keine Sicherheit. */
    const laneVorteil = (r) => r.components.lane ? r.components.lane.vorteil : null;
    const mass = nahe.some((r) => r.blindDetail) ? "blind"
      : nahe.some((r) => r.lookahead) ? "lookahead"
      : nahe.some((r) => Number.isFinite(laneVorteil(r))) ? "lane" : null;
    const sicherheit = {
      blind: (r) => r.blindDetail ? r.blindDetail.schlechtestes : null,
      lookahead: (r) => r.lookahead ? r.lookahead.schlechtester - 0.5 : null,
    }[mass] || null;
    const aufwaerts = {
      blind: (r) => r.blindDetail ? r.blindDetail.bestes : null,
      lookahead: (r) => r.lookahead ? r.lookahead.bester - 0.5 : null,
      lane: laneVorteil,
    }[mass] || null;

    const raus = [];
    const dazu = (art, wort, treffer, grund) => {
      if (treffer) raus.push({art, wort, ...treffer, grund: grund(treffer.r)});
    };
    dazu("gesamt", "Bester Pick", {r: bester, wert: bester.entscheidung},
         (r) => "h\u00f6chster Entscheidungswert ("
                + String(r.entscheidung).replace(".", ",") + ")");
    if (sicherheit) {
      dazu("sicher", "Sicherster Pick", max(nahe, sicherheit),
           (r) => mass === "blind" ? "schlechtestes F\u00fcnftel "
                  + punkteText(r.blindDetail.schlechtestes)
                : "schlechtester Ast " + prozentText(r.lookahead.schlechtester));
    }
    if (aufwaerts) {
      dazu("aggressiv", "Aggressivster Pick", max(nahe, aufwaerts),
           (r) => mass === "blind" ? "bestes F\u00fcnftel " + punkteText(r.blindDetail.bestes)
                : mass === "lookahead" ? "bester Ast " + prozentText(r.lookahead.bester)
                : "Lane-Vorteil " + punkteText(laneVorteil(r)));
    }
    const flex = max(nahe.filter((r) => (teil(r, "flex") ?? 0) > 0.3),
                     (r) => teil(r, "flex"));
    dazu("flex", "Flexpick", flex, (r) => r.components.flex.text);
    const komfort = max(nahe.filter((r) => r.components.komfort),
                        (r) => teil(r, "komfort"));
    dazu("komfort", "Komfortpick", komfort, (r) => r.components.komfort.text);
    return raus;
  }

  return {gegnerVorrat, gegnerAntworten, lookahead, besteErwiderung,
          zustandsWert, compQuote, compAufschluesselung, compReferenz,
          compReferenzGlobal, compPerzentil, rangliste, kategorien, entscheiden};
}

/* Kleiner, schneller Zufallsgenerator mit Startwert (mulberry32). Nicht
   Math.random: derselbe Datenstand soll denselben Massstab ergeben. */
function zufallAus(saat) {
  let a = saat >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function punkteText(d) {
  const v = d * 100;
  return (v >= 0 ? "+" : "") + v.toFixed(1).replace(".", ",") + " Punkte";
}

function prozentText(q) {
  return (q * 100).toFixed(1).replace(".", ",") + " %";
}

/* ------------------------------------------------------------- Helfer */

/** Einen Pick setzen, ohne die Zugfolge zu bemuehen. Die Suche denkt in
 *  Lagen, nicht in Zugnummern - und die Zugnummer ist aus den Feldern der
 *  Oberflaeche ohnehin nur geschaetzt. */
function mitPick(zustand, seite, champ, rolle) {
  return {
    ...zustand,
    bans: {blue: zustand.bans.blue, red: zustand.bans.red},
    picks: {
      blue: seite === "blue"
        ? [...zustand.picks.blue, {champ, rolle}] : zustand.picks.blue,
      red: seite === "red"
        ? [...zustand.picks.red, {champ, rolle}] : zustand.picks.red,
    },
  };
}

/* Spanne in Siegquotenpunkten zwischen bestem und schlechtestem Ausgang,
   geeicht an 75 Lookaheads in drei Draftlagen: Median 0,15 Punkte,
   75. Perzentil 1,18, Maximum 3,73. Ein Pick von fuenf bewegt die
   Aufstellung eben nur um Zehntel - die Schwellen muessen dazu passen,
   sonst heisst alles "robust". */
function robustheitWort(spanne) {
  return spanne <= 0.003 ? "hoch" : spanne <= 0.012 ? "mittel" : "niedrig";
}
