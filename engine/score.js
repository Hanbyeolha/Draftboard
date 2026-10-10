/* Der Match-Score: aus benannten Teilen eine Zahl - und die Spur dahin.
   ---------------------------------------------------------------------------
   Eine Empfehlung ohne sichtbaren Grund ist ein Orakel. Darum gibt diese
   Datei nicht nur Punkte zurueck, sondern eine maschinenlesbare Spur: was
   hat beigetragen, wie viel, woher kam es, wie sicher ist es.

   Die Regel, die alles traegt:

     Fehlt ein Teil, faellt er aus Summe UND Hoechstwert.

   Er wird nicht geschaetzt, und der Rest wird nicht heimlich schwerer.
   Ein Champion ohne Matchupdaten bekommt darum keine schlechtere Note -
   nur eine unsicherere, und das steht dran.

   Die Teile ueberschneiden sich nicht. compFit traegt bereits
   Schadensbalance, Kurve und Rollenabdeckung; sie stehen deshalb nicht
   noch einmal einzeln. Ein frueher Entwurf hatte sie doppelt.

   Dieselbe Pruefung fuer die Lane (Stand 10.10.2026):
     lane             die BEKANNTEN Lanegegner, nach bekanntem Anteil
     blindSicherheit  die noch UNBEKANNTEN Lanegegner, nach Anteil
                      (lane + blindSicherheit = GEWICHTE.blindSicherheit
                      in jedem Modus - Audit P1.1)
     matchup          die uebrigen bekannten Gegner
     lookahead        ohne Kandidat/bekannte Gegner und ohne die
                      Lanepaarung - die stehen schon oben
     risiko           entfallen: Streuung und Konfidenz standen dort ein
                      zweites Mal. Der schlechteste Ausgang steckt im
                      Blindwert und im Lookahead (Risikoprofil).
*/

import { wert, konfidenzWort } from "./provenance.js";
import {
  GEWICHTE, KOMFORT, STOERUNG, STANDARD_RISIKO, ANZEIGE, VERSION, ROLLEN,
  BLIND,
} from "./config.js";
import { normQuote, normVorteil, klemm } from "./features.js";
import { GESCHAETZTE_ACHSEN, saettigen } from "./comp.js";
import { ROLLEN_FOLGE, ROLLEN_WORT, gegenseite, offeneRollen } from "./state.js";
import { moeglicheRollen } from "./data.js";
import { blindAnlegen, LANE_GEGNER } from "./blind.js";

export function bewerterAnlegen({quelle, merkmale, comp, team, heuristik,
                                 blind = null}) {
  // Ein Blindmodell fuer alle Bewertungen - sein Feldcache gilt ueber
  // Kandidaten hinweg.
  const blindModell = blind || blindAnlegen({quelle, team});
  // Die Note sieht nur gepruefte Einschaetzungen (Entscheidung A) - in
  // der Stoerung (P1.3) und im Comp-Marginalwert (P1.4).
  const hNote = heuristik ? (heuristik.geprueft || heuristik) : null;
  const compNote = comp ? (comp.geprueft || comp) : comp;

  /** Einen Kandidaten bewerten. Gibt die volle Spur zurueck - die
   *  Oberflaeche nimmt sich daraus, was sie zeigen will. */
  /* gegnerFuer(rolle) -> {team, label} | null: der gegnerische Spieler
     auf einer Rolle, wenn die Mannschaft gescoutet ist. Dann kommen die
     Blindszenarien zur Haelfte aus seinem Pool.
     schnell: ohne Blindszenarien. Fuer die Bewertungen INNERHALB der
     Suche (Gegnermodell, Erwiderung) - dort geht es um die Folgezuege,
     und die Szenarien je Ast neu zu bauen kostet Zeit, die der Draft
     nicht hat. Die Note, die angezeigt wird, rechnet immer voll. */
  function bewerte(zustand, champ, rolle, {
    spielerTeam = null, spielerLabel = null,
    risikoprofil = STANDARD_RISIKO, lookahead = null,
    gegnerFuer = null, schnell = false,
  } = {}) {
    const m = merkmale.fuer(champ, rolle);
    if (!m) return null;                 // auf dieser Rolle nicht gespielt

    const uns = zustand.wirSind, sie = gegenseite(uns);
    const unsere = zustand.picks[uns].map(mitRolle);
    const ihre = zustand.picks[sie].map(mitRolle);
    const teile = {};
    const gruende = [], risiken = [];

    let summe = 0, hoechst = 0, konfSumme = 0, konfGewicht = 0;

    const nimm = (name, roh, {quelle: q, konfidenz = null, text = null,
                              gewicht = null, paare = null,
                              ohneDaten = null} = {}) => {
      if (roh === null || roh === undefined || !Number.isFinite(roh)) return;
      const g = gewicht === null ? (GEWICHTE[name] || 0) : gewicht;
      if (!g) return;
      const v = klemm(roh, 0, 1);
      teile[name] = {roh: v, gewicht: g, beitrag: g * v, quelle: q,
                     konfidenz, text, paare, ohneDaten};
      summe += g * v;
      hoechst += Math.max(0, g);
      if (konfidenz !== null) {
        konfSumme += Math.abs(g) * konfidenz;
        konfGewicht += Math.abs(g);
      }
    };

    /* 1 ------------------------------------------------ Patchstaerke */
    nimm("meta", normQuote(m.staerke.value), {
      quelle: "draftgap", konfidenz: m.staerke.confidence,
      text: prozent(m.staerke.value) + " auf " + rolle + " im Patch",
    });

    /* 2 ---------------------------------- Gegen die gegnerischen Picks */
    /* Getrennt nach Lane und Rest (Audit P1.1). Vorher mittelte ein
       Teil ueber alle bekannten Gegner nach Partien - der Lanegegner
       verschwand im Counterfall zwischen den Paarungen quer ueber die
       Karte, waehrend blind die Lane mit vollem Gewicht zaehlte. Jetzt
       traegt die Lane in jedem Modus GEWICHTE.blindSicherheit: der
       bekannte Anteil hier, der unbekannte in blindSicherheit. */
    const lage = blindModell.lage(zustand, rolle);
    const laneRollen = new Set(LANE_GEGNER[rolle] || []);
    const gegenLane = paarSchnitt(champ, rolle, "m",
                                  ihre.filter((p) => laneRollen.has(p.rolle)));
    const gegen = paarSchnitt(champ, rolle, "m",
                              ihre.filter((p) => !laneRollen.has(p.rolle)));
    if (gegenLane) {
      nimm("lane", normVorteil(gegenLane.vorteil), {
        quelle: "draftgap", konfidenz: gegenLane.konfidenz,
        text: prozent(gegenLane.quote) + " gegen den Lanegegner",
        paare: gegenLane.teile, ohneDaten: gegenLane.ohneDaten,
        gewicht: GEWICHTE.blindSicherheit * (1 - lage.unbekannt),
      });
      // Der geschrumpfte Vorteil ungekappt - roh ist bei 1,0 gedeckelt.
      // Die Kategorie "aggressiv" vergleicht im Counterfall darauf
      // (search.js kategorien, Audit P2.9).
      if (teile.lane) teile.lane.vorteil = gegenLane.vorteil;
    }
    if (gegen) {
      nimm("matchup", normVorteil(gegen.vorteil), {
        quelle: "draftgap", konfidenz: gegen.konfidenz,
        text: prozent(gegen.quote) + " gegen " + gegen.n + " ihrer Picks",
        paare: gegen.teile, ohneDaten: gegen.ohneDaten,
      });
    }
    for (const t of [...(gegenLane ? gegenLane.teile : []),
                     ...(gegen ? gegen.teile : [])]) {
      const d = t.quote - t.erwartet;
      if (d >= 0.02) gruende.push("stark gegen " + t.wer
        + " (" + prozent(t.quote) + ", sonst " + prozent(t.erwartet) + ")");
      if (d <= -0.02) risiken.push("schwach gegen " + t.wer
        + " (" + prozent(t.quote) + ", sonst " + prozent(t.erwartet) + ")");
    }

    /* 3 ------------------------------------- Mit den eigenen Picks */
    const mit = paarSchnitt(champ, rolle, "s", unsere.filter((p) => p.rolle !== rolle));
    if (mit) {
      nimm("synergie", normVorteil(mit.vorteil), {
        quelle: "draftgap", konfidenz: mit.konfidenz,
        text: prozent(mit.quote) + " mit " + mit.n + " eigenen Picks",
        paare: mit.teile, ohneDaten: mit.ohneDaten,
      });
      for (const t of mit.teile) {
        const d = t.quote - t.erwartet;
        if (d >= 0.015) gruende.push("passt zu " + t.wer
          + " (" + prozent(t.quote) + ", sonst " + prozent(t.erwartet) + ")");
        if (d <= -0.015) risiken.push("harmoniert nicht mit " + t.wer
          + " (" + prozent(t.quote) + ", sonst " + prozent(t.erwartet) + ")");
      }
    }

    /* 4 ------------------------------------------------ Marginalwert */
    const gegnerProfil = ihre.length ? compNote.profil(ihre) : null;
    const marg = compNote.marginal(unsere, {champ, rolle},
                                   {gegner: gegnerProfil});
    if (marg.punkte !== null) {
      nimm("compFit", marg.punkte, {
        quelle: marg.anteilGemessen >= 0.99 ? "draftgap" : "gemischt",
        konfidenz: 0.4 + 0.5 * marg.anteilGemessen,
        text: marginalText(marg),
      });
      const bal = marg.achsen.schadensbalance;
      if (bal && bal.delta > 0.08) {
        gruende.push("bringt fehlenden Schadenstyp");
      } else if (bal && bal.delta < -0.08) {
        risiken.push("macht die Schadensverteilung einseitiger");
      }
    }

    /* 5 ------------------------------- Stoert er ihren Plan? */
    /* Nur mit gepflegter, vom Team gepruefter Heuristiktabelle. Ohne sie
       faellt der Teil vollstaendig weg - dafuer gibt es keine gemessene
       Grundlage. */
    const stoerung = stoerwert(champ, ihre);
    if (stoerung) {
      nimm("gegnerStoerung", stoerung.wert, {
        quelle: "heuristik", konfidenz: stoerung.konfidenz,
        text: stoerung.text,
      });
      if (stoerung.wert > 0.6) gruende.push(stoerung.text);
    }

    /* 6 --------------------------------------------- Informationswert */
    /* Haengt am Zustand, nicht nur am Champion. Gragas verbirgt nichts
       mehr, wenn unser Jungle schon steht; und wenn der Gegner nicht mehr
       pickt, verbirgt niemand etwas vor niemandem. */
    const fx = flexWert(zustand, champ, rolle, uns, sie);
    if (fx) {
      nimm("flex", fx.value, {quelle: "draftgap", konfidenz: 0.8,
                              text: fx.text});
      if (fx.value > 0.5) gruende.push("verr\u00e4t die Rolle nicht: " + fx.text);
    }

    /* 7 --------------------------------------------------- Komfort */
    let erfahrungsRisiko = null;
    const k = (spielerTeam && spielerLabel)
      ? team.komfort(spielerTeam, spielerLabel, champ) : null;
    if (k) {
      // Komfort darf einen strategischen Nachteil daempfen, aber nicht
      // ueberstimmen. Darum ein Deckel auf seinen Anteil am Ganzen.
      const deckel = KOMFORT.hoechstanteil * (hoechst + GEWICHTE.komfort);
      nimm("komfort", k.value, {
        quelle: "team", konfidenz: k.confidence, text: k.note,
        gewicht: Math.min(GEWICHTE.komfort, deckel),
      });
      if (k.value >= 0.7) gruende.push("Komfort: " + k.note);
      // Am Beleg festgemacht, nicht am Wert: vorher <= 0,1, aber Komfort
      // ohne Beleg ist KOMFORT.ohneBeleg (0,15) - der Text erschien nie
      // (Audit P2.8: 0 von 684 Bewertungen, 387 haetten ihn verdient).
      // Angehaengt wird er erst ganz am Ende, siehe unten.
      if (k.ohneBeleg) erfahrungsRisiko = "kaum Erfahrung: " + k.note;
    }

    /* 8 ------------------------------------- Blind, teilweise, Counter */
    /* Gilt nur fuer den UNBEKANNTEN Teil der Lane und wiegt nach diesem
       Anteil: ganz blind voll, Botlane halb bekannt halb, ein
       rollenunsicherer gegnerischer Flexpick nach seiner Unsicherheit.
       Der bekannte Teil steht unter "matchup" - zweimal zaehlt nichts. */
    const blindWert = (!schnell && lage.modus !== "counter")
      ? blindModell.bewerte(zustand, champ, rolle, {gegnerFuer, risikoprofil})
      : null;
    if (blindWert) {
      nimm("blindSicherheit", blindWert.wert, {
        quelle: "draftgap", konfidenz: blindWert.konfidenz,
        text: blindWert.text,
        gewicht: GEWICHTE.blindSicherheit * lage.unbekannt,
      });
      if (blindWert.wert >= 0.7) {
        gruende.push("sicher gegen die wahrscheinlichen Gegner ("
                     + blindWert.text + ")");
      }
      if (blindWert.guenstigMasse >= 0.3) {
        gruende.push("klar g\u00fcnstig gegen " + Math.round(blindWert.guenstigMasse * 100)
                     + " % der wahrscheinlichen Lanegegner");
      }
      for (const k of blindWert.konter) {
        if (k.stufe === "unguenstig" && k.p < 0.05) continue;
        risiken.push(STUFE_WORT[k.stufe] + " Counter noch verf\u00fcgbar: " + k.champ
          + " (" + Math.round(k.p * 100) + " % wahrscheinlich, "
          + prozent(k.quote) + ")");
      }
      if (blindWert.wert <= 0.3) {
        risiken.push("blind riskant: " + blindWert.text);
      }
    }

    /* 9 ------------------------------------------------- Lookahead */
    /* Eine Korrektur um den Median der Vorauswahl, kein gemittelter Teil
       (Audit P1.2): w = 0,5 laesst die Note unveraendert, darueber hebt
       sie, darunter senkt sie. Als gemittelter Teil zog der Lookahead die
       Note schon, wenn er nur unter dem eigenen Schnitt des Kandidaten
       lag - und Kandidaten ohne Vorausschau (ab Rang 13) hatten diesen
       Zug nicht. Darum: Beitrag in die Summe, nicht in den Hoechstwert,
       und nicht in die Konfidenz (die sonst nur fuer die Vorauswahl um
       die feste 0,4 des Gegnermodells saenke). */
    if (lookahead && Number.isFinite(lookahead.wert)) {
      const g = GEWICHTE.lookahead;
      const w = klemm(lookahead.wert, 0, 1);
      teile.lookahead = {roh: w, gewicht: g, beitrag: g * (w - 0.5),
                         quelle: "draftgap", konfidenz: lookahead.konfidenz ?? null,
                         text: lookahead.text || null, korrektur: true};
      summe += g * (w - 0.5);
    }

    /* Die Risiken werden auf vier gekuerzt. Der Erfahrungshinweis kommt
       zuletzt, damit er kein gemessenes Risiko (Konter aus den
       Blindszenarien) verdraengt - gemessen hatte er das bei 103 von
       1356 Bewertungen getan (Audit P2.8). */
    if (erfahrungsRisiko) risiken.push(erfahrungsRisiko);

    /* 10 -------------------------------------------------- Konfidenz */
    /* Kein Abzug mehr fuer Unsicherheit an dieser Stelle - sie wirkt in
       der Rangliste als Schrumpfung zum Median (KONFIDENZ.schrumpfBoden).
       Hier stand frueher ein Risikoabzug aus (1 - Konfidenz), Streuung und
       Lookaheadspanne; die Streuung zaehlte damit doppelt. */
    const konfidenz = konfGewicht ? konfSumme / konfGewicht : null;

    const punkte = hoechst > 0
      ? klemm(100 * summe / hoechst, 0, 100) : null;

    return {
      champion: champ,
      rolle,
      // Keine Scheingenauigkeit: 87, nicht 87,391728.
      score: punkte === null ? null
        : Number(punkte.toFixed(ANZEIGE.punkteNachkomma)),
      confidence: konfidenz === null ? null : Number(konfidenz.toFixed(2)),
      confidenceWort: konfidenzWort(konfidenz),
      // blind heisst: der Lanegegner steht (ganz oder teilweise) noch
      // nicht fest. modus unterscheidet die drei Lagen.
      blind: lage.modus !== "counter",
      modus: lage.modus,
      lage: {modus: lage.modus, text: lage.text, unbekannt: lage.unbekannt},
      blindDetail: blindWert,
      components: teile,
      hoechstwert: hoechst,
      reasons: eindeutig(gruende).slice(0, 5),
      risks: eindeutig(risiken).slice(0, 4),
      metadata: {
        optimizerVersion: VERSION.optimizer,
        dataVersion: VERSION.data,
        patch: quelle.patch,
        risikoprofil,
      },
    };
  }

  /* ------------------------------------------------------------ Helfer */

  function mitRolle(p) {
    return {champ: p.champ, rolle: p.rolle || hauptRolle(p.champ)};
  }

  function hauptRolle(champ) {
    for (const r of ROLLEN_FOLGE) {
      const m = merkmale.fuer(champ, r);
      if (m && m.rollen.length && m.rollen[0].rolle === r) return r;
    }
    return null;
  }

  /** Nach Partien gewichteter Schnitt ueber die gemessenen Paarungen -
   *  und daneben, was ein DURCHSCHNITTLICHER Champion in derselben Lage
   *  geholt haette.
   *
   *  Die Erwartung kommt aus dem Gegenueber selbst: Ornns eigener
   *  Matchupschnitt von 51,1 % heisst, dass ein beliebiger Gegner gegen
   *  ihn auf 48,9 % kommt. Jinx' Synergieschnitt von 52,6 % heisst, dass
   *  ein beliebiger Mitspieler neben ihr dort landet.
   *
   *  Warum nicht die Staerke des Kandidaten als Bezug? Gemessen an 87
   *  Topkandidaten lag die Synergiequote im Median 2,17 Punkte darueber
   *  und die Matchupquote gegen zwei Metachampions 2,10 darunter - die
   *  Komponente saettigte damit bei fast jedem und unterschied nichts.
   *  Mit der Erwartung aus dem Gegenueber liegt der Median bei -0,05
   *  beziehungsweise -0,29, und die Streuung traegt die Aussage.
   *
   *  Kein Modell: ein noch frueherer Entwurf addierte die Abweichungen
   *  der fuenf Matchups auf die Grundquote und landete bei JEDEM
   *  Champion unter 50 %, weil in jeder Quote die Staerke des Gegners
   *  schon steckt. */
  function paarSchnitt(champ, rolle, art, andere) {
    let summe = 0, erwartet = 0, gewicht = 0, bereinigt = 0;
    const teile = [], ohneDaten = [];
    for (const p of andere) {
      if (!p.rolle) continue;
      const e = art === "m" ? quelle.matchup(champ, rolle, p.champ, p.rolle)
                            : quelle.synergie(champ, rolle, p.champ, p.rolle);
      const eigen = e ? quelle.paarMittel(p.champ, p.rolle, art) : null;
      if (!e || !eigen) {
        // Nicht stumm ueberspringen: die Oberflaeche soll sagen koennen,
        // dass es zu dieser Paarung nichts gibt. Sonst sieht "keine
        // Daten" genauso aus wie "unauffaellig".
        ohneDaten.push(p.champ);
        continue;
      }
      const soll = art === "m" ? 1 - eigen.value : eigen.value;
      const n = e.sampleSize;
      teile.push({wer: p.champ, quote: e.value, erwartet: soll, spiele: n});
      summe += e.value * n;
      erwartet += soll * n;
      // Rauschbereinigt, wie im Blindmodell (BLIND.schrumpfK): bei 343
      // Partien ist eine Abweichung halb Zufall. Angezeigt werden weiter
      // die gemessenen Quoten - nur die Wertung schrumpft.
      bereinigt += (e.value - soll) * n * (n / (n + BLIND.schrumpfK));
      gewicht += n;
    }
    if (!gewicht) return null;
    return {quote: summe / gewicht, erwartet: erwartet / gewicht,
            vorteil: bereinigt / gewicht,
            vorteilRoh: (summe - erwartet) / gewicht,
            spiele: gewicht, n: teile.length, teile, ohneDaten,
            konfidenz: Math.min(1, Math.sqrt(gewicht / 2000))};
  }

  /** Wirkt unser Kandidat dem entgegen, was sie vorhaben? Braucht die
   *  gepruefte Heuristiktabelle auf beiden Seiten - ohne sie kein Wert. */
  function stoerwert(champ, ihre) {
    const heuristik = hNote;
    if (!heuristik || !heuristik.kennt(champ)) return null;
    let summe = 0, n = 0;
    const genannt = [];
    for (const [ihreAchse, unsere] of Object.entries(STOERUNG)) {
      // Wie stark ist diese Achse bei ihnen?
      const sie = ihre.map((p) => heuristik.achse(p.champ, ihreAchse))
                      .filter(Boolean);
      if (!sie.length) continue;
      // Saettigend wie in comp.js: ihr Plan wird nicht schwaecher, weil
      // ein weiterer Champion ihn nicht mittraegt.
      const staerke = saettigen(sie.map((w) => w.value));
      if (staerke < 0.2) continue;        // kein nennenswerter Plan
      // Was setzen wir dagegen? Der Kandidat ist eingeschaetzt; eine
      // Achse, die er nicht traegt, hat er nicht (Tabellenkonvention
      // "nur ungleich 0", heuristik.js) - also 0, nicht "unbekannt".
      // Vorher fiel der Teil ohne jede Antwort weg, und eine teilweise
      // Antwort stand schlechter da als keine (Audit P1.3).
      const gegen = unsere.map((a) => heuristik.achse(champ, a))
                          .filter(Boolean);
      const antwort = gegen.length ? Math.max(...gegen.map((w) => w.value)) : 0;
      summe += staerke * antwort;
      n += staerke;
      if (antwort >= 0.5) genannt.push(ihreAchse);
    }
    if (!n) return null;
    return {
      wert: klemm(summe / n, 0, 1),
      konfidenz: 0.45,
      text: genannt.length ? "wirkt gegen ihr " + genannt.join(" und ")
                           : summe > 0 ? "wenig gegen ihren Plan"
                           : "nichts gegen ihren Plan",
    };
  }

  function marginalText(marg) {
    const grosse = Object.entries(marg.achsen)
      .filter(([, a]) => Math.abs(a.delta) > 0.05)
      .sort((a, b) => Math.abs(b[1].delta) - Math.abs(a[1].delta))
      .slice(0, 2)
      .map(([name, a]) => name + " " + (a.delta > 0 ? "+" : "")
                          + (a.delta * 100).toFixed(0));
    return grosse.length ? grosse.join(", ") : "\u00e4ndert wenig";
  }

  /** Informationswert eines Picks in DIESER Lage.
   *
   *  null - es gibt nichts zu verbergen: der Gegner pickt nicht mehr, oder
   *         uns bleibt nur noch eine Rolle (dann kennt er sie ohnehin).
   *  0    - eindeutige Rolle, verraet die Lane.
   *  >0   - glaubhafte zweite Rolle, die bei uns noch offen ist und auf der
   *         der Champion etwas taugt. Wie flexGrad: zweitstaerkste Rolle
   *         im Verhaeltnis zur staerksten. */
  function flexWert(zustand, champ, rolle, uns, sie) {
    if (!offeneRollen(zustand, sie).length) return null;
    const unsereOffen = offeneRollen(zustand, uns);
    if (unsereOffen.length <= 1) return null;
    // Die eigene Rolle bleibt immer drin, auch wenn der Champion sie nur
    // zu 5-15 % spielt - sonst fehlt der Bezug fuer das Verhaeltnis.
    const rollen = moeglicheRollen(quelle, champ).filter((r) => {
      if (r.rolle === rolle) return true;
      if (r.anteil < ROLLEN.flexAbAnteil || !unsereOffen.includes(r.rolle)) {
        return false;
      }
      const st = quelle.staerke(champ, r.rolle);
      return st && st.value >= ROLLEN.flexMindestStaerke;
    });
    const andere = rollen.filter((r) => r.rolle !== rolle);
    if (!andere.length || rollen.length < 2) {
      return {value: 0, text: "eindeutige Rolle \u2013 verr\u00e4t die Lane"};
    }
    const sortiert = rollen.slice().sort((a, b) => b.anteil - a.anteil);
    const v = Math.min(1, sortiert[1].anteil / sortiert[0].anteil);
    return {value: v,
            text: "auch " + andere.map((r) => ROLLEN_WORT[r.rolle] + " "
                    + Math.round(r.anteil * 100) + " %").join(", ")
                  + ", bei uns noch offen"};
  }

  return {bewerte, blindModell};
}

/* Die Gefahrenstufen aus blind.js als Adjektiv fuer die Risikozeile. */
const STUFE_WORT = {
  "unguenstig": "ung\u00fcnstiger",
  "gefaehrlich": "gef\u00e4hrlicher",
  "sehr gefaehrlich": "sehr gef\u00e4hrlicher",
};

/* -------------------------------------------------------------- Gruppen */
/* Die Teile der Bewertung, fuer die Anzeige zusammengefasst. KEINE neue
   Rechnung und keine neuen Gewichte: jede Gruppe ist der gewichtete
   Schnitt ihrer vorhandenen Teile. So bleibt DraftGap als eigenes Signal
   sichtbar, getrennt von dem, was wir daraus fuer UNSER Team machen. */
export const SCORE_GRUPPEN = {
  draftgap: {wort: "DraftGap", teile: ["meta", "lane", "matchup", "synergie"]},
  team: {wort: "Team-Fit", teile: ["compFit", "gegnerStoerung", "flex", "lookahead"]},
  spieler: {wort: "Spieler-Fit", teile: ["komfort"]},
  blind: {wort: "Blind-Sicherheit", teile: ["blindSicherheit"]},
};

/** {draftgap, team, spieler, blind} -> 0..100 oder null, wenn die Gruppe
 *  in dieser Lage keinen Teil hat. */
export function teilGruppen(r) {
  const out = {};
  for (const [name, g] of Object.entries(SCORE_GRUPPEN)) {
    let b = 0, w = 0;
    for (const t of g.teile) {
      const x = r.components && r.components[t];
      if (!x || x.gewicht <= 0) continue;
      // roh * gewicht statt beitrag: beim Lookahead ist der Beitrag eine
      // Korrektur um 0,5 (P1.2), sein Wert fuer die Anzeige bleibt roh.
      b += x.roh * x.gewicht; w += x.gewicht;
    }
    out[name] = w ? Math.round(100 * b / w) : null;
  }
  return out;
}

/* ------------------------------------------------------------- Kleinkram */

/* Der Formatierer wird EINMAL angelegt. toLocaleString baut bei jedem
   Aufruf einen neuen - das kostete im Profil 34,5 % der gesamten
   Ranglistenzeit, weil es fuer jeden Begruendungstext jeder Bewertung
   laeuft, auch tief in der Suche. Ausgabe identisch. (toFixed mit Komma
   waere schneller, rundet aber an 285 von 100.001 Halbstellen anders.) */
const PROZENT_FORMAT = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: ANZEIGE.quoteNachkomma,
  maximumFractionDigits: ANZEIGE.quoteNachkomma,
});
function prozent(q) {
  return PROZENT_FORMAT.format(q * 100) + " %";
}

function eindeutig(xs) {
  return [...new Set(xs)];
}
