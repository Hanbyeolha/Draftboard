/* Was unsere Spieler wirklich koennen.
   ---------------------------------------------------------------------------
   Drei Belege, die sich ergaenzen und nicht dasselbe sagen:

     Partien      wie oft jemand einen Champion gespielt hat (op.gg Ranked)
     Eigene Quote wie erfolgreich - aber erst ab zehn entschiedenen Partien,
                  darunter ist sie Rauschen
     Draftplan    was der Spieler selbst sagt: blind pickbar, spielt gerne

   Der Draftplan wiegt bewusst schwer: eine ausdrueckliche Ansage des
   Spielers ist belastbarer als eine Handvoll Ranked-Partien. Drei Partien
   auf einem Champion, den jemand blind picken wuerde, bedeuten etwas
   anderes als drei Partien auf einem, den er nie nennt.

   Komfort darf einen strategischen Nachteil daempfen, aber nicht
   ueberstimmen - dafuer sorgt KOMFORT.hoechstanteil in der Bewertung.
*/

import { wert } from "./provenance.js";
import { KOMFORT } from "./config.js";

/** Aus den eingebetteten Teamdaten eine Komfortquelle bauen.
 *
 *  queue/season waehlen den Pool aus. Standard ist RANKED in der neuesten
 *  Season - dieselbe Vorauswahl, die die Oberflaeche zeigt. Die Wahl steht
 *  hier ausdruecklich und nicht versteckt, weil ein anderer Pool andere
 *  Empfehlungen ergibt. */
export const VERBOTENE_QUEUE = "LIGA";

export function teamAnlegen(teams, {queue = "RANKED", season = null} = {}) {
  // Die Turnierpartien sind als Queue "LIGA" vorhanden, haben hier aber
  // nichts zu suchen. Zwei Gruende: es sind je Spieler eine Handvoll
  // Partien, und sie beschreiben, was jemand im Draft BEKOMMEN hat -
  // nicht, was er kann. Die Staerke eines Champions kommt ohnehin aus dem
  // Patch (DraftGap), nicht aus unseren eigenen Spielen.
  if (queue === VERBOTENE_QUEUE) {
    throw new Error("LIGA ist kein Komfortbeleg - Ranked, Solo oder Flex");
  }
  const spieler = new Map();          // label -> Datensatz
  const proTeam = new Map();          // team -> [label]

  const seasons = new Set();
  for (const t of teams || []) {
    for (const p of t.players || []) {
      for (const b of (p.queues || {})[queue] || []) {
        if (b.id !== null && b.id !== undefined) seasons.add(b.id);
      }
    }
  }
  const gewaehlt = season !== null ? season
    : (seasons.size ? Math.max(...seasons) : null);

  for (const t of teams || []) {
    const liste = [];
    for (const p of t.players || []) {
      spieler.set(spielerSchluessel(t.team, p.label), {
        label: p.label,
        team: t.team,
        rolle: p.role || null,
        bank: !!p.bench,
        pool: poolAus(p, queue, gewaehlt),
        plan: planAus(p),
      });
      liste.push(p.label);
    }
    proTeam.set(t.team, liste);
  }

  /** Der Spieler einer Mannschaft auf einer Rolle. Bankspieler zaehlen
   *  nicht - im Draft steht die Aufstellung. */
  function aufRolle(team, rolle) {
    for (const label of proTeam.get(team) || []) {
      const s = spieler.get(spielerSchluessel(team, label));
      if (s && !s.bank && s.rolle === rolle) return s;
    }
    return null;
  }

  function hole(team, label) {
    return spieler.get(spielerSchluessel(team, label)) || null;
  }

  /** Komfort 0..1 mit Begruendung. null, wenn wir ueber diesen Spieler
   *  nichts wissen - dann faellt der Faktor aus der Bewertung. */
  function komfort(team, label, champ) {
    const s = hole(team, label);
    if (!s) return null;
    const e = s.pool.get(champ) || null;
    const imPlan = s.plan.blind.has(champ) ? "blind"
                 : s.plan.likes.has(champ) ? "likes" : null;
    if (!e && !imPlan) {
      // Kein Beleg - und das ist NICHT dasselbe wie "kann er nicht".
      //
      // Frueher stand hier eine belegte 0. Das war ein Verstoss gegen die
      // eigene Regel: Fehlendes faellt aus Summe UND Hoechstwert, es wird
      // nicht als Nullwert verbucht. Gemessen wirkte der Komfort dadurch
      // wie ein Schalter - im Schnitt trug er nur 2,0 Punkte, bei den
      // wenigen gespielten Champions aber bis +14, und genau die standen
      // dann oben. Ein nie gespielter Champion bekam faktisch 14 Punkte
      // Abzug dafuer, dass wir nichts ueber ihn wissen.
      //
      // Ihn ganz wegfallen zu lassen war die Gegenprobe - und ebenso
      // falsch: der Hoechstwert schrumpfte mit, der Champion wurde
      // hochnormiert, und ploetzlich waren fuenf der sechs besten
      // Vorschlaege nie gespielt.
      //
      // Richtig ist dazwischen: moeglich, aber ungeuebt. Ein niedriger
      // belegter Wert mit niedriger Konfidenz.
      // ohneBeleg sagt es ausdruecklich: der Wert 0,15 allein laesst
      // sich nicht von "ungeuebt, aber gespielt" trennen (Audit P2.8).
      return {...wert(KOMFORT.ohneBeleg, {
        quelle: "team", stichprobe: 0,
        konfidenz: KOMFORT.ohneBelegKonfidenz,
        hinweis: "keine Rankedpartien, nicht im Draftplan ("
                 + queue + (gewaehlt !== null ? " S" + gewaehlt : "") + ")",
      }), ohneBeleg: true};
    }

    const partien = e ? e.play : 0;
    const erfahrung = Math.log10(1 + partien) / Math.log10(1 + KOMFORT.volleErfahrung);
    const planWert = imPlan === "blind" ? KOMFORT.blindPick
                   : imPlan === "likes" ? KOMFORT.spieltGerne : 0;

    // Erfahrung und Ansage ergaenzen sich: der hoehere der beiden traegt,
    // der andere hebt noch etwas an. Addieren wuerde dieselbe Aussage
    // zweimal zaehlen - wer einen Champion blind pickt, hat ihn meist
    // auch gespielt.
    const hoch = Math.max(erfahrung, planWert);
    const tief = Math.min(erfahrung, planWert);
    let v = hoch + (1 - hoch) * tief * 0.5;

    // Die eigene Quote justiert nach oben oder unten - aber nur, wenn sie
    // auf genug entschiedenen Partien beruht.
    const teile = [];
    if (partien) teile.push(partien + " Partien");
    if (imPlan) teile.push(imPlan === "blind" ? "blind pickbar" : "spielt gerne");
    if (e && e.decided >= KOMFORT.winrateAbPartien) {
      const q = e.win / e.decided;
      v *= 0.85 + 0.3 * klemm((q - 0.42) / 0.16, 0, 1);
      teile.push(Math.round(q * 100) + " % aus " + e.decided);
    }

    return wert(klemm(v, 0, 1), {
      quelle: "team",
      stichprobe: partien,
      // Konfidenz nicht aus der Stichprobe allein: eine Ansage im
      // Draftplan ist auch ohne viele Partien ein Beleg.
      konfidenz: klemm(0.35 + 0.45 * erfahrung + (imPlan ? 0.2 : 0), 0, 1),
      // Die Quelle gehoert in den Text: sonst liest jemand "107 Partien"
      // und denkt an Turnierpartien.
      hinweis: (teile.join(" · ") || "nichts bekannt")
               + " (" + queue + (gewaehlt !== null ? " S" + gewaehlt : "") + ")",
    });
  }

  /** Der ganze Pool eines Spielers, fuer Listen und Filter. */
  function pool(team, label) {
    const s = hole(team, label);
    return s ? s.pool : new Map();
  }

  return {queue, season: gewaehlt, seasons: [...seasons].sort((a, b) => b - a),
          aufRolle, hole, komfort, pool,
          mannschaften: [...proTeam.keys()]};
}

/** Den im Browser eingetragenen Draftplan einsetzen (Audit P2.7).
 *  lokal: {Mannschaft: {Spieler: {blind, likes, note}}} - dieselbe Regel
 *  wie planOf() in der Oberflaeche: ein lokaler Eintrag ersetzt den Plan
 *  des Spielers ganz, nicht Liste fuer Liste. Vorher rechnete die Note
 *  nur mit dem eingebetteten Plan, waehrend die BLIND-Marke den lokalen
 *  zeigte. Gibt neue Objekte zurueck, die Eingabe bleibt unberuehrt. */
export function planEinsetzen(teams, lokal) {
  return (teams || []).map((t) => ({...t, players: (t.players || []).map((p) => {
    const l = ((lokal || {})[t.team] || {})[p.label];
    return l ? {...p, plan: l} : p;
  })}));
}

/* ------------------------------------------------------------------ intern */

/* Eigener Name: schluessel() in state.js ist der Cache-Schluessel eines
   Draftzustands und hat damit nichts zu tun. In der gebuendelten Datei
   teilen sich alle Module einen Namensraum. */
function spielerSchluessel(team, label) {
  return team + "\u0000" + label;
}

function poolAus(p, queue, season) {
  const raus = new Map();
  for (const b of (p.queues || {})[queue] || []) {
    if (b.id !== null && b.id !== undefined && season !== null && b.id !== season) {
      continue;
    }
    for (const c of b.champions || []) {
      const alt = raus.get(c.champ) || {play: 0, win: 0, decided: 0};
      const n = (c.win || 0) + (c.lose || 0);
      alt.play += n;
      alt.win += c.win || 0;
      alt.decided += n;
      raus.set(c.champ, alt);
    }
  }
  return raus;
}

function planAus(p) {
  const plan = p.plan || {};
  // "first" hiess die Liste frueher - alte Staende nicht verlieren.
  const blind = (plan.first || []).concat(plan.blind || []);
  return {blind: new Set(blind), likes: new Set(plan.likes || [])};
}

/* klemm kommt aus features.js - eine zweite Fassung waere in der
   gebuendelten Datei ein Syntaxfehler. */
import { klemm } from "./features.js";
