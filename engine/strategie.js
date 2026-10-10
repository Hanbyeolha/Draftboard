/* Das Lagebild: was fehlt uns, was droht, wie gewinnen wir, was jetzt?
   ---------------------------------------------------------------------------
   Diese Datei bewertet keine Kandidaten - das tut score.js. Sie
   beantwortet die Fragen UEBER dem Draft, die sich nach jedem Pick und
   Ban aendern:

     groesster Bedarf     welche Achse fehlt uns am meisten
     groesste Gefahr      was ist die staerkste Seite des Gegners
     Siegbedingung        wie gewinnt diese Aufstellung
     naechste Rolle       welche Rolle jetzt, welche spaeter
     vermeiden            was jetzt falsch waere

   Herkunft, streng getrennt:

     gemessen     Schadensmischung, Kurve (DraftGap), Wert des Wartens
                  (aus den Lane-Matchups, siehe unten)
     Heuristik    Engage, Peel, Frontline und die uebrigen Achsen -
                  eure Tabelle oder die als ungeprueft gekennzeichnete
                  Ersteinschaetzung. Was daraus folgt, ist Heuristik und
                  steht so dran.

   Wert des Wartens (gemessen): Wie viel besser stuenden wir auf einer
   Rolle, wenn wir den Lanegegner kennten, als mit dem besten Blindpick?

     E[ max_c d(c gegen s) ]  -  max_c E[ d(c gegen s) ]

   ueber die wahrscheinlichen Lanegegner s und unsere Kandidaten c. Hoch
   heisst: die Rolle als Counterpick aufheben. Niedrig heisst: Warten
   bringt wenig, jetzt nehmen. Das ist die Pickreihenfolge als Zahl -
   ohne Faustregel wie "Mid immer zuletzt".
*/

import { COMP, STOERUNG, STRATEGIE, ROLLEN } from "./config.js";
import { GESCHAETZTE_ACHSEN, saettigen } from "./comp.js";
import { ROLLEN_WORT, gegenseite, offeneRollen, gesperrt, pickfolge } from "./state.js";

/* Woerter fuer die Anzeige. */
export const ACHSEN_WORT = {
  engage: "Engage", disengage: "Disengage", peel: "Peel",
  frontline: "Frontline", dive: "Dive", catch: "Catch", poke: "Poke",
  siege: "Siege", splitpush: "Splitpush", teamfight: "Teamfight",
  objective: "Objective Control",
};

/* Was droht vom Gegner. Verteidigende Achsen (Peel, Disengage, Frontline,
   Objective) sind keine Bedrohung, sondern Antworten. */
const BEDROHEND = ["engage", "dive", "catch", "poke", "siege", "splitpush",
                   "teamfight"];

/* Siegbedingungen als Muster ueber unsere Achsen - Heuristik. Jedes
   Muster nennt die Achsen, die es tragen; gewaehlt wird das am staerksten
   getragene. */
/* Die Spielidee ist allgemeines Spielwissen in einem Satz - Heuristik wie
   die Muster selbst, und so gekennzeichnet. */
const MUSTER = [
  {wort: "Front-to-Back-Teamfight", achsen: ["frontline", "teamfight", "peel"],
   idee: "Frontline vorn halten, Carries hinten sch\u00fctzen, geordnete 5v5 um Objectives suchen"},
  {wort: "Engage und Teamfight", achsen: ["engage", "teamfight", "frontline"],
   idee: "K\u00e4mpfe selbst er\u00f6ffnen, gruppiert um Drache und Baron spielen"},
  {wort: "Dive auf die hinteren Reihen", achsen: ["dive", "engage"],
   idee: "auf die Carries springen und K\u00e4mpfe kurz halten, bevor ihr Schaden steht"},
  {wort: "Pick-Comp (Catch)", achsen: ["catch", "dive"],
   idee: "Sicht kontrollieren, Einzelne abfangen, die \u00dcberzahl in Objectives umsetzen"},
  {wort: "Poke und Siege", achsen: ["poke", "siege", "disengage"],
   idee: "aus Distanz schw\u00e4chen, T\u00fcrme belagern, offenen Kampf vermeiden"},
  {wort: "Splitpush / Seitenlanes", achsen: ["splitpush", "siege"],
   idee: "Seitenlanes dr\u00fccken (1-3-1), Gegner aufteilen, gro\u00dfe K\u00e4mpfe meiden"},
  {wort: "Protect the Carry", achsen: ["peel", "disengage", "teamfight"],
   idee: "um den Carry herum spielen, Gegner kommen lassen und abfangen"},
];

export function strategieAnlegen({quelle, merkmale, comp, heuristik, blind,
                                  team = null}) {

  /** Wie stark tragen diese Picks jede Achse - und auf wie vielen
   *  eingeschaetzten Picks beruht das? */
  function stufen(picks) {
    const out = {};
    const bekannt = heuristik ? picks.filter((p) => heuristik.kennt(p.champ)) : [];
    for (const a of GESCHAETZTE_ACHSEN) {
      const xs = [];
      for (const p of bekannt) {
        const w = heuristik.achse(p.champ, a);
        xs.push(w ? w.value : 0);
      }
      out[a] = bekannt.length ? saettigen(xs) : null;
    }
    return {stufe: out, belegt: bekannt.length, gesamt: picks.length,
            vorschlag: bekannt.filter((p) => heuristik.art(p.champ) === "vorschlag").length};
  }

  /** Das ganze Achsenprofil einer Seite: Stufe und Traeger je Achse.
   *  Traeger ist jeder Pick mit einem Beitrag > 0, abgeleitete Beitraege
   *  (Frontline -> Peel) sagen das. */
  function achsenProfil(picks) {
    const st = stufen(picks);
    const achsen = {};
    for (const a of GESCHAETZTE_ACHSEN) {
      const traeger = [];
      for (const p of picks) {
        const w = heuristik ? heuristik.achse(p.champ, a) : null;
        if (w && w.value > 0) {
          traeger.push({champ: p.champ, wert: w.value, ueber: w.abgeleitetAus || null});
        }
      }
      traeger.sort((x, y) => y.wert - x.wert || (x.champ < y.champ ? -1 : 1));
      achsen[a] = {achse: a, wort: ACHSEN_WORT[a], stufe: st.stufe[a], traeger};
    }
    return {achsen, belegt: st.belegt, gesamt: st.gesamt, vorschlag: st.vorschlag};
  }

  /* ----------------------------------------------- Wer bringt was */
  /** Wie stark bringt ein Champion diesen Bedarf mit? 0..1 oder null.
   *  Achsen aus der Einschaetzung, Schaden aus der Messung. */
  function bringt(champ, rolle, achse) {
    if (achse === "magisch" || achse === "physisch") {
      const s = quelle.schaden(champ, rolle);
      if (!s) return null;
      const anteil = achse === "magisch" ? s.value : 1 - s.value;
      return anteil >= STRATEGIE.schadenTraegerAb ? anteil : null;
    }
    const w = heuristik ? heuristik.achse(champ, achse) : null;
    return w && w.value >= 0.5 ? w.value : null;
  }

  /** Wer in unserer Aufstellung traegt die Achse schon (teilweise)? Wer
   *  sie nur ueber eine andere traegt (Frontline -> Peel), sagt das. */
  function bisherig(unsere, achse) {
    return unsere.filter((p) => p.rolle && bringt(p.champ, p.rolle, achse) !== null)
      .map((p) => {
        const w = heuristik && GESCHAETZTE_ACHSEN.includes(achse)
          ? heuristik.achse(p.champ, achse) : null;
        return p.champ + (w && w.abgeleitetAus
          ? " (\u00fcber " + (ACHSEN_WORT[w.abgeleitetAus] || w.abgeleitetAus) + ")" : "");
      });
  }

  /** Spielt der Champion diese Rolle wirklich? Rollenanteil ab
   *  ROLLEN.flexAbAnteil oder Hauptrolle. Die Mindestgrenze fuer
   *  Kandidaten (5 %, 1.000 Partien) liess Kalista, Zilean, Azir und
   *  Ivern als Top-Bringer durch - mit 6 bis 9 % ihrer Partien dort. */
  function spieltRolle(champ, rolle) {
    const v = quelle.rollenVerteilung(champ);
    if (!v) return false;
    const anteile = Object.entries(v.value);
    const haupt = anteile.reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0])[0];
    return haupt === rolle || (v.value[rolle] || 0) >= ROLLEN.flexAbAnteil;
  }

  /** Verfuegbare Champions fuer unsere offenen Rollen, die den Bedarf
   *  mitbringen. Sortiert: ausgepraegt vor teilweise, im Pool des
   *  Spielers vor nicht, Prio auf der Rolle vor Exoten, dann
   *  Patchstaerke. */
  function bringer(zustand, achse, spielerFuer) {
    const weg = new Set(gesperrt(zustand).keys());
    const alle = [];
    const offen = offeneRollen(zustand, zustand.wirSind);
    // Die Plaetze auf die offenen Rollen verteilen: bei einer offenen
    // Rolle alle fuenf dort, bei vielen hoechstens bringerJeRolle je Rolle.
    const jeRolleMax = Math.max(STRATEGIE.bringerJeRolle,
      Math.ceil(STRATEGIE.bringerAnzahl / Math.max(1, offen.length)));
    for (const rolle of offen) {
      const sp = spielerFuer ? spielerFuer(rolle) : null;
      const jeRolle = [];
      for (const m of merkmale.kandidaten(rolle, {ausser: weg})) {
        if (!spieltRolle(m.champ, rolle)) continue;
        const stufe = bringt(m.champ, rolle, achse);
        if (stufe === null) continue;
        const k = sp && team ? team.komfort(sp.team, sp.label, m.champ) : null;
        const pr = blind ? blind.prio(m.champ, rolle) : null;
        jeRolle.push({champ: m.champ, rolle, stufe,
                      pool: !!(k && k.value >= STRATEGIE.poolAb),
                      prio: !!(pr && pr.prio),
                      spieler: sp ? sp.label : null,
                      staerke: m.staerke.value});
      }
      jeRolle.sort(bringerOrdnung);
      alle.push(...jeRolle.slice(0, jeRolleMax));
    }
    // Ein Champion nur einmal, auf seiner besten Rolle - "Zilean Top,
    // Zilean Mid" sagte zweimal dasselbe und verdraengte andere.
    const gesehen = new Set();
    return alle.sort(bringerOrdnung)
      .filter((x) => !gesehen.has(x.champ) && gesehen.add(x.champ))
      .slice(0, STRATEGIE.bringerAnzahl);
  }

  /* ------------------------------------------------------- Bedarf */
  function bedarf(unsere, ihre, unserProfil) {
    const u = stufen(unsere), i = stufen(ihre);
    const liste = [];
    if (u.belegt >= STRATEGIE.abPicks) {
      for (const a of GESCHAETZTE_ACHSEN) {
        if (u.stufe[a] === null) continue;
        // Wichtig ist eine Achse aus sich heraus (COMP.achsen) - und
        // mehr, wenn der Gegner genau das hat, wogegen sie hilft.
        let gewicht = COMP.achsen[a] || 0;
        const wegen = [];
        for (const [ihreAchse, antworten] of Object.entries(STOERUNG)) {
          if (!antworten.includes(a) || i.stufe[ihreAchse] == null) continue;
          if (i.stufe[ihreAchse] >= 0.5) {
            gewicht += i.stufe[ihreAchse] * (COMP.achsen[ihreAchse] || 0);
            wegen.push(ACHSEN_WORT[ihreAchse]);
          }
        }
        const wert = (1 - u.stufe[a]) * gewicht;
        if (wert <= 0) continue;
        liste.push({achse: a, wort: ACHSEN_WORT[a], wert,
                    stufe: u.stufe[a], quelle: "heuristik",
                    grund: (u.stufe[a] < 0.25 ? "fehlt fast ganz" : "d\u00fcnn")
                           + (wegen.length ? ", gegen ihr " + wegen.join(" und ") : "")});
      }
    }
    // Gemessen: die Schadensmischung, sobald zwei Picks sie tragen.
    const s = unserProfil.schaden;
    if (s && unserProfil.n >= 2) {
      const m = s.magisch.value;
      if (m < COMP.schadenBandVon) {
        liste.push({achse: "magisch", wort: "magischer Schaden", quelle: "draftgap",
                    wert: (COMP.schadenBandVon - m) / COMP.schadenBandVon
                          * COMP.achsen.schadensbalance,
                    grund: Math.round(m * 100) + " % magisch \u2013 ein R\u00fcstungswert reicht ihnen"});
      } else if (m > COMP.schadenBandBis) {
        liste.push({achse: "physisch", wort: "physischer Schaden", quelle: "draftgap",
                    wert: (m - COMP.schadenBandBis) / (1 - COMP.schadenBandBis)
                          * COMP.achsen.schadensbalance,
                    grund: Math.round(m * 100) + " % magisch \u2013 ein Magieresistenzwert reicht ihnen"});
      }
    }
    return {liste: liste.sort((x, y) => y.wert - x.wert), abdeckung: u};
  }

  /* ------------------------------------------------------- Gefahr */
  function gefahr(ihre, unsere, unserProfil, ihrProfil) {
    const i = stufen(ihre);
    const u = stufen(unsere);
    const liste = [];
    if (i.belegt >= STRATEGIE.abPicks) {
      for (const a of BEDROHEND) {
        if (i.stufe[a] === null || i.stufe[a] < 0.5) continue;
        const traeger = ihre.filter((p) => {
          const w = heuristik.achse(p.champ, a);
          return w && w.value >= 0.5;
        }).map((p) => p.champ);
        const antwort = (STOERUNG[a] || []).map((x) => ACHSEN_WORT[x]);
        // Was setzen wir schon dagegen? Je Antwortachse unsere Stufe und
        // wer sie traegt.
        const antworten = (STOERUNG[a] || []).map((x) => ({
          achse: x, wort: ACHSEN_WORT[x],
          stufe: u.belegt ? (u.stufe[x] ?? 0) : null,
          bisher: bisherig(unsere, x),
        }));
        liste.push({achse: a, wort: ACHSEN_WORT[a], quelle: "heuristik",
                    wert: i.stufe[a] * (COMP.achsen[a] || 0), stufe: i.stufe[a],
                    antwort, antworten, traeger,
                    grund: (traeger.length ? "durch " + traeger.join(", ") : "")
                           + (antwort.length ? (traeger.length ? " \u00b7 " : "")
                              + "Antwort: " + antwort.join(" oder ") : "")});
      }
    }
    // Gemessen: wer in welcher Phase vorn liegt.
    const pv = (ihrProfil.n && unserProfil.n)
      ? comp.phasenVorteil(ihrProfil, unserProfil) : null;
    if (pv && pv.vorsprung >= STRATEGIE.phasenVorsprung) {
      const wort = pv.stark === "spaet" ? "Skalierung (sp\u00e4t st\u00e4rker)"
                 : pv.stark === "frueh" ? "fr\u00fche St\u00e4rke" : "Midgame-St\u00e4rke";
      liste.push({achse: "phase-" + pv.stark, wort, quelle: "draftgap",
                  wert: pv.vorsprung * 100 * 2, stufe: null,
                  grund: "+" + (pv.vorsprung * 100).toFixed(1).replace(".", ",")
                         + " Punkte in der Phase, gemessen"});
    }
    return {liste: liste.sort((x, y) => y.wert - x.wert), abdeckung: i};
  }

  /* ------------------------------------------------ Siegbedingung */
  function siegbedingung(unsere, ihre, unserProfil, ihrProfil) {
    const u = stufen(unsere);
    // Ein Muster ueber eine Aufstellung braucht mehr als einen Champion.
    if (u.belegt < COMP.heuristikAbPicks) return null;
    const bewertet = MUSTER.map((m) => {
      const xs = m.achsen.map((a) => u.stufe[a] ?? 0);
      return {...m, traegt: xs.reduce((a, b) => a + b, 0) / xs.length};
    }).sort((x, y) => y.traegt - x.traegt);
    const bestes = bewertet[0];
    if (!bestes || bestes.traegt < STRATEGIE.musterAb) return null;
    const zweites = bewertet[1] && bewertet[1].traegt >= STRATEGIE.musterAb
      ? bewertet[1] : null;
    const pv = (ihrProfil.n && unserProfil.n)
      ? comp.phasenVorteil(unserProfil, ihrProfil) : null;
    const phase = pv && pv.vorsprung >= STRATEGIE.phasenVorsprung
      ? (pv.stark === "spaet" ? "auf sp\u00e4t spielen" : pv.stark === "frueh"
         ? "fr\u00fch entscheiden" : "im Midgame entscheiden") : null;
    // Was gefaehrdet den Plan? Was IHRE Seite gegen unsere tragenden
    // Achsen setzt - dieselbe Beziehung wie in STOERUNG, umgedreht.
    const i = stufen(ihre);
    const gefaehrdet = [];
    if (i.belegt) {
      const gesehen = new Set();
      for (const a of bestes.achsen) {
        for (const x of STOERUNG[a] || []) {
          if (gesehen.has(x) || (i.stufe[x] ?? 0) < 0.5) continue;
          gesehen.add(x);
          gefaehrdet.push({achse: x, wort: ACHSEN_WORT[x], stufe: i.stufe[x],
                           gegen: ACHSEN_WORT[a], traeger: bisherig(ihre, x)});
        }
      }
    }
    return {wort: bestes.wort, traegt: bestes.traegt, phase,
            quelle: phase ? "heuristik + draftgap" : "heuristik",
            idee: bestes.idee,
            achsen: bestes.achsen.map((a) => ({achse: a, wort: ACHSEN_WORT[a],
              stufe: u.stufe[a] ?? 0, traeger: bisherig(unsere, a)})),
            // Gemessen: unser Vorsprung je Phase gegen ihre Kurve.
            phasen: pv ? pv.je : null,
            gefaehrdet,
            alternative: zweites ? {wort: zweites.wort, traegt: zweites.traegt} : null,
            grund: bestes.achsen.map((a) => ACHSEN_WORT[a] + " "
                     + Math.round((u.stufe[a] ?? 0) * 100)).join(", ")};
  }

  /* ------------------------------------------------ Wert des Wartens */
  /** Fuer eine Rolle: bester Blindpick, bester Erwartungswert, und wie
   *  viel ein bekannter Lanegegner im Mittel dazugaebe. */
  function warten(zustand, rolle) {
    const sz = blind.szenarien(zustand, rolle);
    if (sz.lage.modus === "counter") {
      return {rolle, modus: "counter", wert: 0, bester: null,
              text: "Lanegegner steht \u2013 Counterpick jetzt m\u00f6glich"};
    }
    if (!sz.liste.length) return null;
    const weg = new Set(gesperrt(zustand).keys());
    const kand = merkmale.kandidaten(rolle, {ausser: weg})
      .sort((a, b) => b.staerke.value - a.staerke.value)
      .slice(0, STRATEGIE.wartenKandidaten);
    if (!kand.length) return null;

    // d[c][s]: geschrumpfte Abweichung, Szenarien als Paare gemittelt.
    const tafel = kand.map((m) => sz.liste.map((s) => {
      let summe = 0, n = 0;
      for (const g of s.gegner) {
        const a = blind.abweichung(m.champ, rolle, g.champ, g.rolle);
        if (a) { summe += a.d * a.n; n += a.n; }
      }
      return n ? summe / n : null;
    }));
    let bestesEv = -Infinity, bester = null, wissen = 0, masse = 0;
    kand.forEach((m, ci) => {
      let ev = 0, p = 0;
      sz.liste.forEach((s, si) => {
        const d = tafel[ci][si];
        if (d !== null) { ev += s.p * d; p += s.p; }
      });
      if (p >= 0.6 && ev / p > bestesEv) { bestesEv = ev / p; bester = m.champ; }
    });
    sz.liste.forEach((s, si) => {
      let top = -Infinity;
      for (let ci = 0; ci < kand.length; ci++) {
        const d = tafel[ci][si];
        if (d !== null && d > top) top = d;
      }
      if (top > -Infinity) { wissen += s.p * top; masse += s.p; }
    });
    if (!bester || !masse) return null;
    const wert = wissen / masse - bestesEv;
    return {rolle, modus: sz.lage.modus, wert, bester, bestesEv,
            text: "Counterpick bringt im Mittel +" + (wert * 100).toFixed(1)
                    .replace(".", ",") + " Punkte gegen\u00fcber dem besten "
                  + "Blindpick (" + bester + ")"};
  }

  /* ------------------------------------------------------ Lagebild */
  /* spielerFuer(rolle) -> {team, label} | null: unser Spieler auf einer
     Rolle. Nur fuer die Sortierung "im Pool" der Bringer. */
  function lagebild(zustand, {spielerFuer = null} = {}) {
    const uns = zustand.wirSind, sie = gegenseite(uns);
    const unsere = zustand.picks[uns], ihre = zustand.picks[sie];
    const unserProfil = comp.profil(unsere), ihrProfil = comp.profil(ihre);

    const b = bedarf(unsere, ihre, unserProfil);
    for (const x of b.liste.slice(0, 3)) {
      x.bringer = bringer(zustand, x.achse, spielerFuer);
      x.bisher = bisherig(unsere, x.achse);
    }
    const g = gefahr(ihre, unsere, unserProfil, ihrProfil);
    // Zu jeder der drei groessten Gefahren: wer die Antwort mitbringen
    // wuerde - fuer die Antwortachse, die bei uns am duennsten ist.
    for (const x of g.liste.slice(0, 3)) {
      if (!x.antworten || !x.antworten.length) continue;
      const schwaechste = x.antworten.slice()
        .sort((p, q) => (p.stufe ?? 0) - (q.stufe ?? 0))[0];
      x.antwortAchse = schwaechste.achse;
      x.antwortBringer = bringer(zustand, schwaechste.achse, spielerFuer);
    }
    const sieg = siegbedingung(unsere, ihre, unserProfil, ihrProfil);

    // Rollen: wo steht der Gegner schon (Counter jetzt), wo bringt
    // Warten am wenigsten (jetzt nehmen), wo am meisten (aufheben).
    const offen = offeneRollen(zustand, uns);
    const w = offen.map((r) => warten(zustand, r)).filter(Boolean);
    const counter = w.filter((x) => x.modus === "counter");
    const blindR = w.filter((x) => x.modus !== "counter")
      .sort((x, y) => x.wert - y.wert);
    const naechste = counter[0]
      || (blindR.length ? blindR[0] : null);
    // Aufheben lohnt nur, wenn der Gegner vor unserem letzten Pick noch
    // pickt - sonst zeigt Warten nichts (Audit P2.10: 59 von 440
    // Empfehlungen in 68 Partien waren so, alle als Blau).
    const pf = pickfolge(zustand);
    const spaeter = pf.gegnerVorUnseremLetzten > 0
      && blindR.length > 1
      && blindR[blindR.length - 1].wert >= STRATEGIE.wartenLohntAb
      ? blindR[blindR.length - 1] : null;

    const vermeiden = [];
    if (spaeter) {
      vermeiden.push({wort: ROLLEN_WORT[spaeter.rolle] + " jetzt blind",
                      grund: spaeter.text, quelle: "draftgap"});
    }
    const u = b.abdeckung;
    if (u.belegt >= STRATEGIE.abPicks) {
      for (const a of GESCHAETZTE_ACHSEN) {
        if (u.stufe[a] !== null && u.stufe[a] >= STRATEGIE.gesaettigtAb
            && (COMP.achsen[a] || 0) >= 5) {
          vermeiden.push({wort: "weiterer " + ACHSEN_WORT[a],
                          grund: "schon gedeckt (" + Math.round(u.stufe[a] * 100) + ")",
                          quelle: "heuristik"});
        }
      }
    }

    return {
      bedarf: b.liste.slice(0, 3),
      groessterBedarf: b.liste[0] || null,
      gefahr: g.liste.slice(0, 3),
      groessteGefahr: g.liste[0] || null,
      siegbedingung: sieg,
      profil: {unser: achsenProfil(unsere), ihr: achsenProfil(ihre)},
      naechsteRolle: naechste ? {...naechste, wort: ROLLEN_WORT[naechste.rolle]} : null,
      spaeterRolle: spaeter ? {...spaeter, wort: ROLLEN_WORT[spaeter.rolle]} : null,
      warten: w,
      pickfolge: pf,
      vermeiden: vermeiden.slice(0, 3),
      abdeckung: {
        unser: {belegt: b.abdeckung.belegt, gesamt: b.abdeckung.gesamt,
                vorschlag: b.abdeckung.vorschlag},
        ihr: {belegt: g.abdeckung.belegt, gesamt: g.abdeckung.gesamt,
              vorschlag: g.abdeckung.vorschlag},
      },
    };
  }

  return {lagebild, warten, stufen, bringer, achsenProfil};
}

/* Ausgepraegt vor teilweise, Pool vor nicht, auf der Rolle viel gespielt
   (Prio) vor Exoten, dann Patchstaerke, dann Name - deterministisch.
   Ohne die Prio fuellten knapp starke Nischenpicks die Liste (Hwei, Lux,
   Karthus als ADC), waehrend Lulu und Janna fehlten. */
function bringerOrdnung(a, b) {
  return (b.stufe - a.stufe) || (b.pool - a.pool) || (b.prio - a.prio)
    || (b.staerke - a.staerke) || (a.champ < b.champ ? -1 : 1);
}

