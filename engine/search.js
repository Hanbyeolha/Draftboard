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

import { SUCHE, RISIKOPROFILE, STANDARD_RISIKO } from "./config.js";
import { gegenseite, offeneRollen, gesperrt } from "./state.js";
import { klemm } from "./features.js";

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
      const r = bewerter.bewerte(ihreSicht, k.champ, k.rolle);
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
      const r = bewerter.bewerte(ihreSicht, k.champ, k.rolle);
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

    const aeste = [];
    for (const a of antworten) {
      const danach = mitPick(nach, gegenseite(zustand.wirSind), a.champ, a.rolle);
      const w = zustandsWert(danach, spielerFuer);
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
  function zustandsWert(zustand, spielerFuer) {
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
    const q = compQuote(lage);
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
  function compQuote(zustand) {
    const sie = gegenseite(zustand.wirSind);
    let summe = 0, gewicht = 0;
    for (const a of zustand.picks[zustand.wirSind]) {
      for (const b of zustand.picks[sie]) {
        if (!a.rolle || !b.rolle) continue;
        const e = quelle.matchup(a.champ, a.rolle, b.champ, b.rolle);
        if (!e) continue;
        summe += e.value * e.sampleSize;
        gewicht += e.sampleSize;
      }
    }
    return gewicht ? summe / gewicht : null;
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
    risikoprofil = STANDARD_RISIKO, mitLookahead = true,
  } = {}) {
    const weg = gesperrt(zustand);
    const grund = [];
    for (const m of merkmale.kandidaten(rolle, {ausser: new Set(weg.keys())})) {
      const r = bewerter.bewerte(zustand, m.champ, rolle,
                                 {spielerTeam, spielerLabel, risikoprofil});
      if (r) grund.push(r);
    }
    grund.sort((a, b) => b.score - a.score);
    if (!mitLookahead) return grund;

    // Der Gegnervorrat wird EINMAL bestimmt und je Kandidat neu bewertet.
    const vorrat = gegnerVorrat(zustand);
    const oben = grund.slice(0, SUCHE.beiteEigen);
    const mitL = oben.map((r) => ({
      r, l: lookahead(zustand, r.champion, rolle,
                      {vorrat, spielerFuer, risikoprofil}),
    }));

    /* Die Lookaheadwerte liegen als Siegquoten vor und unterscheiden sich
       nur um Zehntelpunkte - ein Pick von fuenf soll die Aufstellung auch
       nicht umwerfen. Absolut waere die Komponente damit wirkungslos.
       Darum wird sie ueber die Vorauswahl normiert: sie ordnet DIESE
       Kandidaten, statt eine absolute Siegchance zu behaupten.

       Die Vorauswahl ist deterministisch (die besten SUCHE.beiteEigen
       nach Grundnote), also ist auch das Ergebnis es. */
    const rohe = mitL.map((x) => x.l).filter(Boolean).map((l) => l.roh);
    const spanne = rohe.length > 1
      ? {min: Math.min(...rohe), max: Math.max(...rohe)} : null;

    const fertig = mitL.map(({r, l}) => {
      if (!l) return r;
      const anteil = spanne && spanne.max > spanne.min
        ? (l.roh - spanne.min) / (spanne.max - spanne.min) : 0.5;
      const neu = bewerter.bewerte(zustand, r.champion, rolle, {
        spielerTeam, spielerLabel, risikoprofil,
        lookahead: {...l, wert: anteil},
      });
      return {...neu, lookahead: {...l, wert: anteil}};
    });
    const alle = fertig.concat(grund.slice(SUCHE.beiteEigen));
    alle.sort((a, b) => b.score - a.score);
    return alle;
  }

  return {gegnerVorrat, gegnerAntworten, lookahead, besteErwiderung,
          zustandsWert, compQuote, rangliste};
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
