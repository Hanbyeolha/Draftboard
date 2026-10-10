/* Nachspielen: haette die Engine unsere echten Picks empfohlen?
   ---------------------------------------------------------------------------
   Der Backtest fragt "sagt das Modell den Sieger voraus" - und muss
   passen, weil 68 Partien dafuer nicht reichen. Diese Datei fragt etwas
   anderes und Beantwortbareres:

     Wenn wir die Lage einer echten Partie nachstellen und einen Pick
     herausnehmen - auf welchem Rang steht er in der Empfehlung?

   Das misst **Uebereinstimmung mit dem, was wirklich gespielt wurde**,
   nicht Richtigkeit. Ein Modell, das die Picks durchweg verreisst, ist
   entweder schlecht - oder es wurde schlecht gedraftet. Welches von
   beidem, sagt erst der Vergleich zwischen gewonnenen und verlorenen
   Partien:

     Stehen die Picks aus GEWONNENEN Partien hoeher als die aus
     verlorenen, verfolgt das Modell etwas Reales.
     Stehen sie gleich, misst es vor allem Meta-Gewohnheit.

   Drei Mengen, damit man die Teile auseinanderhalten kann:

     eigene, mit Komfort    volles Modell inklusive Spielerpool
     eigene, ohne Komfort   nur Daten: Matchup, Synergie, Comp, Meta
     gescoutete Teams       fremde Partien, Komfort gibt es dort nicht

   Der Unterschied zwischen den ersten beiden ist genau die Frage
   "zu stark auf die Vorlieben der Spieler zugeschnitten?" - als Zahl.

   Was dieser Test NICHT kann: die echte Draftreihenfolge nachstellen -
   games.json hat sie nicht. Beim Herausnehmen eines Picks sind die
   uebrigen neun bekannt, auch die, die in Wahrheit spaeter kamen. Der
   Test weiss also mehr, als man im Draft wusste. Er taugt fuer
   Uebereinstimmung, nicht fuer "haetten wir es damals gewusst".

       node tests/nachspielen.mjs
       node tests/nachspielen.mjs --details
*/

import { readFileSync } from "node:fs";
import { ladeDaten, ladePartien } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { teamAnlegen } from "../engine/team.js";
import { bewerterAnlegen } from "../engine/score.js";
import { sucheAnlegen } from "../engine/search.js";
import { leererDraft, ROLLEN_FOLGE } from "../engine/state.js";
import { VERSION } from "../engine/config.js";

const DETAILS = process.argv.includes("--details");

const DATA = ladeDaten();
const PARTIEN = ladePartien();
const quelle = quelleAnlegen(DATA.draft);
const heuristik = heuristikAnlegen(
  JSON.parse(readFileSync("data/champion-heuristik.json", "utf8")));
const merkmale = merkmaleAnlegen(quelle, heuristik);
const comp = compAnlegen(merkmale, heuristik);
const team = teamAnlegen(DATA.teams);
const bewerter = bewerterAnlegen({quelle, merkmale, comp, team, heuristik});
const suche = sucheAnlegen({quelle, merkmale, bewerter});

const EIGENE = new Set(DATA.ownTeams || []);

/* -------------------------------------------------------------- Lauf */

/** Eine Partie aus der Sicht einer der beiden Mannschaften nachspielen.
 *  Je Pick dieser Mannschaft ein Fall. */
function faelleAus(partie, unser, {mitKomfort}) {
  const ihr = unser === partie.blue ? partie.red : partie.blue;
  const unsere = (partie.picks || {})[unser] || [];
  const ihre = (partie.picks || {})[ihr] || [];
  if (unsere.length !== 5 || ihre.length !== 5) return [];

  const raus = [];
  for (const weg of unsere) {
    if (!weg.champ || !weg.role) continue;
    const s = leererDraft({patch: quelle.patch, wirSind: "blue"});
    for (const p of unsere) {
      if (p !== weg && p.champ && p.role) {
        s.picks.blue.push({champ: p.champ, rolle: p.role});
      }
    }
    for (const p of ihre) {
      if (p.champ && p.role) s.picks.red.push({champ: p.champ, rolle: p.role});
    }
    // Der Spieler, der den Pick wirklich hatte - sein Pool zaehlt nur,
    // wenn der Durchlauf den Komfort einschliesst.
    const spieler = mitKomfort ? team.aufRolle(unser, weg.role) : null;
    const liste = suche.rangliste(s, weg.role, {
      spielerTeam: spieler ? unser : null,
      spielerLabel: spieler ? spieler.label : null,
      // Lookahead aus: er setzt einen offenen Draft voraus, hier sind
      // neun Picks gesetzt. Und 400 Laeufe damit dauern Minuten.
      mitLookahead: false,
    });
    const rang = liste.findIndex((r) => r.champion === weg.champ);
    raus.push({
      partie: partie.series + " #" + partie.game,
      mannschaft: unser,
      rolle: weg.role,
      champ: weg.champ,
      gewonnen: partie.winner === unser,
      rang: rang < 0 ? null : rang + 1,
      von: liste.length,
      note: rang < 0 ? null : liste[rang].score,
      beste: liste.length ? liste[0].champion : null,
      besteNote: liste.length ? liste[0].score : null,
    });
  }
  return raus;
}

const eigenMit = [], eigenOhne = [], fremd = [];
for (const partie of PARTIEN) {
  if (!partie.winner || !partie.blue || !partie.red) continue;
  for (const seite of [partie.blue, partie.red]) {
    if (EIGENE.has(seite)) {
      eigenMit.push(...faelleAus(partie, seite, {mitKomfort: true}));
      eigenOhne.push(...faelleAus(partie, seite, {mitKomfort: false}));
    } else {
      fremd.push(...faelleAus(partie, seite, {mitKomfort: false}));
    }
  }
}

/* ------------------------------------------------------------- Masse */

function auswerten(name, menge) {
  const mit = menge.filter((f) => f.rang !== null);
  if (!mit.length) return null;
  const raenge = mit.map((f) => f.rang).sort((a, b) => a - b);
  const anteil = (k) => mit.filter((f) => f.rang <= k).length / mit.length;
  return {
    name, n: mit.length, fehlt: menge.length - mit.length,
    top1: anteil(1), top3: anteil(3), top10: anteil(10),
    median: raenge[Math.floor(raenge.length / 2)],
    kandidaten: Math.round(mit.reduce((a, f) => a + f.von, 0) / mit.length),
    schnittNote: mit.reduce((a, f) => a + f.note, 0) / mit.length,
    besteNote: mit.reduce((a, f) => a + f.besteNote, 0) / mit.length,
  };
}

function zeile(e) {
  if (!e) return "  (keine Faelle)";
  return "  " + e.name.padEnd(24) + "n=" + String(e.n).padStart(3)
    + "   Top-1 " + (e.top1 * 100).toFixed(0).padStart(3) + " %"
    + "   Top-3 " + (e.top3 * 100).toFixed(0).padStart(3) + " %"
    + "   Top-10 " + (e.top10 * 100).toFixed(0).padStart(3) + " %"
    + "   Median " + String(e.median).padStart(3) + "/" + e.kandidaten
    + "   Note " + e.schnittNote.toFixed(1)
    + " (beste " + e.besteNote.toFixed(1) + ")";
}

console.log("Nachspielen · Modell " + VERSION.optimizer
            + " · Patch " + quelle.patch);
console.log(new Set([...eigenMit, ...fremd].map((f) => f.partie)).size
            + " Partien, " + eigenMit.length + " eigene Picks, "
            + fremd.length + " gescoutete\n");

console.log(zeile(auswerten("eigene, mit Komfort", eigenMit)));
console.log(zeile(auswerten("eigene, ohne Komfort", eigenOhne)));
console.log(zeile(auswerten("gescoutete Teams", fremd)));

console.log("\nSieg gegen Niederlage (eigene, mit Komfort):");
console.log(zeile(auswerten("aus Siegen", eigenMit.filter((f) => f.gewonnen))));
console.log(zeile(auswerten("aus Niederlagen", eigenMit.filter((f) => !f.gewonnen))));

console.log("\nSieg gegen Niederlage (alle Partien, ohne Komfort):");
const alleOhne = [...eigenOhne, ...fremd];
console.log(zeile(auswerten("aus Siegen", alleOhne.filter((f) => f.gewonnen))));
console.log(zeile(auswerten("aus Niederlagen", alleOhne.filter((f) => !f.gewonnen))));

/* ------------------------------------------------- je Draft, nicht je Pick
   Fuenf Picks aus einem Draft sind keine fuenf unabhaengigen Stichproben:
   sie stehen in derselben Lage, gegen dieselbe Gegneraufstellung, aus
   demselben Pool. Wer die Pickzahlen als n nimmt, rechnet sich die
   Stichprobe um den Faktor fuenf schoen. Darum hier noch einmal mit dem
   Draft als Einheit. */
function jeDraft(menge, nurTeam = null) {
  const nach = new Map();
  for (const f of menge) {
    if (f.rang === null) continue;
    if (nurTeam && f.mannschaft !== nurTeam) continue;
    const k = f.partie + "|" + f.mannschaft;
    if (!nach.has(k)) nach.set(k, {gewonnen: f.gewonnen, raenge: []});
    nach.get(k).raenge.push(f.rang);
  }
  const raus = [];
  for (const d of nach.values()) {
    if (d.raenge.length < 5) continue;       // Teildrafts verzerren den Median
    const r = [...d.raenge].sort((a, b) => a - b);
    raus.push({gewonnen: d.gewonnen, median: r[Math.floor(r.length / 2)]});
  }
  return raus;
}

const drafts = jeDraft(eigenMit);
const dS = drafts.filter((d) => d.gewonnen);
const dN = drafts.filter((d) => !d.gewonnen);
const mw = (xs) => xs.reduce((a, d) => a + d.median, 0) / xs.length;
const sa = (xs) => {
  const m = mw(xs);
  return Math.sqrt(xs.reduce((a, d) => a + (d.median - m) ** 2, 0)
                   / (xs.length - 1));
};
console.log("\nJe Draft statt je Pick (eigene, mit Komfort):");
if (dS.length > 1 && dN.length > 1) {
  console.log("  " + drafts.length + " Drafts (" + dS.length + " gewonnen, "
    + dN.length + " verloren), Median-Rang je Draft:");
  console.log("    gewonnen  " + mw(dS).toFixed(1) + " ± " + sa(dS).toFixed(1));
  console.log("    verloren  " + mw(dN).toFixed(1) + " ± " + sa(dN).toFixed(1));
  const se = Math.sqrt(sa(dS) ** 2 / dS.length + sa(dN) ** 2 / dN.length);
  const t = (mw(dN) - mw(dS)) / se;
  console.log("    Unterschied " + (mw(dN) - mw(dS)).toFixed(1)
    + " Raenge, Standardfehler " + se.toFixed(1)
    + ", t = " + t.toFixed(2));
  console.log("    " + (Math.abs(t) > 2
    ? "|t| > 2 - aber erst die Aufteilung nach Mannschaft sagt, ob das"
      + "\n    etwas bedeutet. Siehe die zwei Zeilen darunter."
    : "|t| < 2: nicht von Rauschen zu trennen. Die Pickzahlen oben"
      + "\n    sehen nach mehr aus, als die Stichprobe hergibt."));
} else {
  console.log("  zu wenige vollstaendige Drafts");
}

/* Der naheliegende Stoerfaktor: AFC1 und AFC2 in einem Topf. Hat die eine
   Mannschaft sowohl mehr Niederlagen ALS AUCH duennere Championpools,
   entsteht der Unterschied oben ohne jeden Draftbezug - das Modell wuerde
   dann nur "welche Mannschaft war das" messen. Darum je Mannschaft
   getrennt: bleibt der Unterschied in beiden erhalten, taugt er etwas. */
console.log("  Je Mannschaft getrennt (derselbe Stoerfaktor ausgeschlossen):");
for (const m of [...EIGENE]) {
  const d = jeDraft(eigenMit, m);
  const s = d.filter((x) => x.gewonnen), n = d.filter((x) => !x.gewonnen);
  if (s.length < 2 || n.length < 2) {
    console.log("    " + m.padEnd(6) + " zu wenige Drafts ("
      + s.length + " gewonnen, " + n.length + " verloren)");
    continue;
  }
  const se = Math.sqrt(sa(s) ** 2 / s.length + sa(n) ** 2 / n.length);
  console.log("    " + m.padEnd(6) + s.length + " gewonnen Median "
    + mw(s).toFixed(1) + "   " + n.length + " verloren Median "
    + mw(n).toFixed(1) + "   Unterschied " + (mw(n) - mw(s)).toFixed(1)
    + "   t = " + ((mw(n) - mw(s)) / se).toFixed(2));
}
console.log("    Gemessen (Stand 10.10.2026): getrennt bleibt in keiner der");
console.log("    beiden Mannschaften ein auffaelliger Unterschied uebrig. Der");
console.log("    gepoolte Wert kam vor allem daher, dass AFC2 sowohl mehr");
console.log("    verliert als auch duennere Pools hat. Die Richtung stimmt in");
console.log("    beiden - das ist alles, was man sagen kann.");

console.log("\nJe Rolle (eigene, mit Komfort):");
for (const rolle of ROLLEN_FOLGE) {
  console.log(zeile(auswerten(rolle, eigenMit.filter((f) => f.rolle === rolle))));
}

/* -------------------------------------------------------- Einordnung */
const mitK = auswerten("x", eigenMit);
const ohneK = auswerten("x", eigenOhne);
const sieg = auswerten("s", alleOhne.filter((f) => f.gewonnen));
const pleite = auswerten("n", alleOhne.filter((f) => !f.gewonnen));

console.log("\nEinordnung:");
if (mitK) {
  console.log("  Zufall traefe Top-3 in rund "
    + (300 / mitK.kandidaten).toFixed(0) + " % der Faelle (bei ~"
    + mitK.kandidaten + " Kandidaten je Rolle), das Modell liegt bei "
    + (mitK.top3 * 100).toFixed(0) + " %.");
}
if (mitK && ohneK) {
  const d = (mitK.top3 - ohneK.top3) * 100;
  console.log("  Der Komfort hebt die Top-3-Uebereinstimmung um "
    + (d >= 0 ? "+" : "") + d.toFixed(0) + " Punkte"
    + " (Median " + ohneK.median + " → " + mitK.median + ").");
  console.log("  " + (d > 25
    ? "Das ist der Anteil, der am Spielerpool haengt und nicht an Daten -"
      + "\n  viel. Wer die Daten sehen will, muss den Komfort senken."
    : "Der Spielerpool traegt also nicht allein."));
}
if (sieg && pleite) {
  const d = (sieg.top3 - pleite.top3) * 100;
  console.log("  Picks aus Siegen stehen " + (d >= 0 ? "+" : "")
    + d.toFixed(0) + " Punkte haeufiger in den Top 3 als die aus Niederlagen"
    + " (n=" + sieg.n + "/" + pleite.n + ").");
  console.log("  " + (Math.abs(d) < 8
    ? "Das ist zu wenig, um daraus etwas zu schliessen: das Modell"
      + "\n  trennt gewonnene nicht von verlorenen Drafts."
    : "Das ist ein Hinweis, dass das Modell etwas Reales verfolgt -"
      + "\n  bei dieser Stichprobe aber kein Beweis."));
}
console.log("  Gemessen wird UEBEREINSTIMMUNG mit dem, was gespielt wurde,");
console.log("  nicht Richtigkeit. Und der Test kennt beim Herausnehmen eines");
console.log("  Picks die uebrigen neun - mehr, als man im Draft wusste.");

if (DETAILS) {
  console.log("\nWo das Modell am staerksten widerspricht (eigene):");
  const schlimm = eigenMit.filter((f) => f.rang !== null)
    .sort((a, b) => b.rang - a.rang).slice(0, 12);
  for (const f of schlimm) {
    console.log("  Rang " + String(f.rang).padStart(3) + "/" + f.von
      + "  " + f.rolle.padEnd(8) + f.champ.padEnd(14)
      + (f.gewonnen ? "Sieg " : "Nied.") + "  statt " + f.beste
      + " (" + f.besteNote + " gegen " + f.note + ")");
  }
  console.log("\nWo es zustimmt (Rang 1):");
  for (const f of eigenMit.filter((f) => f.rang === 1).slice(0, 10)) {
    console.log("  " + f.rolle.padEnd(8) + f.champ.padEnd(14)
      + (f.gewonnen ? "Sieg" : "Nied."));
  }
}
