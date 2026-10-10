/* Backtest: sagt das Modell den Sieger voraus?
   ---------------------------------------------------------------------------
   Was hier geprueft werden KANN und was nicht.

   games.json haelt 68 vollstaendige Partien: beide Aufstellungen mit
   Rollen, die Seite, den Sieger. Was fehlt, ist die **Pick-Reihenfolge**.
   "Was waere an Pick 4 richtig gewesen" laesst sich damit nicht
   nachspielen - der Lookahead und die Pickfolge bleiben ungeprueft.

   Geprueft wird der Endzustand: aus beiden fertigen Aufstellungen eine
   Siegwahrscheinlichkeit, verglichen mit dem Ausgang. Das testet die
   Comp-Bewertung, nicht die Empfehlung.

   Und es testet sie an 68 Stichproben. Bei 60 Prozent Treffern reicht das
   95-Prozent-Intervall von rund 48 bis 71 Prozent - das Ergebnis kann
   also "nicht besser als Muenzwurf" nicht ausschliessen. Wer hier eine
   Aussage liest, die schaerfer klingt, liest zu viel hinein.

       node tests/backtest.mjs
       node tests/backtest.mjs --je-phase
*/

import { ladeDaten, ladePartien } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { teamAnlegen } from "../engine/team.js";
import { bewerterAnlegen } from "../engine/score.js";
import { sucheAnlegen } from "../engine/search.js";
import { leererDraft } from "../engine/state.js";
import { VERSION } from "../engine/config.js";
import { readFileSync } from "node:fs";

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

/* ------------------------------------------------------- Vorbereitung */

/** Eine Rohpartie in einen Endzustand uebersetzen. */
function zustandAus(partie) {
  const s = leererDraft({patch: quelle.patch, wirSind: "blue"});
  for (const [mannschaft, picks] of Object.entries(partie.picks || {})) {
    const seite = mannschaft === partie.blue ? "blue" : "red";
    for (const p of picks) {
      if (p.champ && p.role) s.picks[seite].push({champ: p.champ, rolle: p.role});
    }
  }
  for (const [mannschaft, bans] of Object.entries(partie.bans || {})) {
    const seite = mannschaft === partie.blue ? "blue" : "red";
    for (const c of bans) if (c) s.bans[seite].push(c);
  }
  return s;
}

/* ------------------------------------------------------ Die Vorhersagen */

/** Das Modell: die gemessene Quote aller Paarungen zwischen den
 *  Aufstellungen, als Siegwahrscheinlichkeit fuer Blau. */
const modell = (s) => suche.compQuote(s);

/** Rueckfall eins: immer Muenzwurf. */
const muenze = () => 0.5;

/** Rueckfall zwei: wer die staerkeren Champions im Patch hat. Testet, ob
 *  das Modell ueberhaupt mehr kann als "nimm die besseren Champions". */
function nurPatchstaerke(s) {
  const schnitt = (picks) => {
    const xs = picks.map((p) => quelle.staerke(p.champ, p.rolle))
                    .filter(Boolean).map((w) => w.value);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const a = schnitt(s.picks.blue), b = schnitt(s.picks.red);
  if (a === null || b === null) return null;
  // Differenz auf eine Wahrscheinlichkeit legen: ein Punkt Unterschied im
  // Schnitt entspricht grob einem Punkt Siegchance.
  return 0.5 + (a - b);
}

/* -------------------------------------------------------------- Masse */

function auswerten(name, vorhersagen) {
  const gueltig = vorhersagen.filter((x) => x.p !== null);
  if (!gueltig.length) return null;
  const n = gueltig.length;
  const treffer = gueltig.filter((x) => (x.p > 0.5) === (x.blauGewann)
                                     || (x.p === 0.5)).length;
  // Brier: mittlerer quadratischer Fehler. 0 ist perfekt, 0,25 ist
  // "immer 50 Prozent sagen".
  const brier = gueltig.reduce(
    (a, x) => a + Math.pow(x.p - (x.blauGewann ? 1 : 0), 2), 0) / n;
  const entschieden = gueltig.filter((x) => x.p !== 0.5);
  const quote = entschieden.length ? treffer / n : null;
  // Wald-Intervall, grob. Bei n=68 ist es breit, und das soll man sehen.
  const fehler = quote === null ? null
    : 1.96 * Math.sqrt(quote * (1 - quote) / n);
  return {name, n, treffer, quote, fehler, brier,
          spanne: {min: Math.min(...gueltig.map((x) => x.p)),
                   max: Math.max(...gueltig.map((x) => x.p))}};
}

function zeile(e) {
  if (!e) return "  (keine gueltigen Vorhersagen)";
  const q = e.quote === null ? "   -  "
    : (e.quote * 100).toFixed(1).padStart(5) + " %";
  const ci = e.fehler === null ? ""
    : " ± " + (e.fehler * 100).toFixed(1);
  return "  " + e.name.padEnd(22) + "n=" + String(e.n).padStart(3)
    + "   Treffer " + q + ci
    + "   Brier " + e.brier.toFixed(4)
    + "   Spanne " + (e.spanne.min * 100).toFixed(1)
    + "-" + (e.spanne.max * 100).toFixed(1) + " %";
}

/* ------------------------------------------------------------ Lauf */

const zeilen = [];
for (const partie of PARTIEN) {
  if (!partie.winner || !partie.blue || !partie.red) continue;
  const s = zustandAus(partie);
  if (s.picks.blue.length !== 5 || s.picks.red.length !== 5) continue;
  zeilen.push({
    partie,
    blauGewann: partie.winner === partie.blue,
    modell: modell(s),
    muenze: muenze(s),
    patch: nurPatchstaerke(s),
  });
}

console.log("Backtest · Modell " + VERSION.optimizer
            + " · Patch " + quelle.patch);
console.log(PARTIEN.length + " Partien in games.json, "
            + zeilen.length + " davon vollstaendig und entschieden\n");

const ergebnisse = [
  auswerten("Modell (Comp-Quote)", zeilen.map((z) => ({p: z.modell, blauGewann: z.blauGewann}))),
  auswerten("nur Patchstaerke", zeilen.map((z) => ({p: z.patch, blauGewann: z.blauGewann}))),
  auswerten("Muenzwurf", zeilen.map((z) => ({p: z.muenze, blauGewann: z.blauGewann}))),
];
for (const e of ergebnisse) console.log(zeile(e));

/* --------------------------------------------------------- Kalibrierung */
console.log("\nKalibrierung des Modells (vorhergesagt gegen tatsaechlich):");
const eimer = [[0, 0.48], [0.48, 0.50], [0.50, 0.52], [0.52, 1]];
for (const [von, bis] of eimer) {
  const drin = zeilen.filter((z) => z.modell !== null
                                 && z.modell >= von && z.modell < bis);
  if (!drin.length) continue;
  const vorhergesagt = drin.reduce((a, z) => a + z.modell, 0) / drin.length;
  const tatsaechlich = drin.filter((z) => z.blauGewann).length / drin.length;
  console.log("  " + (von * 100).toFixed(0) + "-" + (bis * 100).toFixed(0)
    + " %  n=" + String(drin.length).padStart(3)
    + "   gesagt " + (vorhergesagt * 100).toFixed(1)
    + " %   eingetreten " + (tatsaechlich * 100).toFixed(1) + " %");
}

/* ------------------------------------------------------------ Einordnung */
const m = ergebnisse[0];
console.log("\nEinordnung:");
if (m && m.fehler !== null) {
  const unten = (m.quote - m.fehler) * 100;
  console.log("  Das 95-Prozent-Intervall der Trefferquote reicht von "
    + unten.toFixed(1) + " bis " + ((m.quote + m.fehler) * 100).toFixed(1) + " %.");
  console.log("  " + (unten > 50
    ? "Es liegt ueber 50 % - der Muenzwurf ist damit ausgeschlossen."
    : "Es schliesst 50 % ein: ein Muenzwurf ist NICHT ausgeschlossen."));
}
console.log("  Brier unter 0,25 heisst besser als 'immer 50 Prozent sagen'.");
console.log("  Die Pick-Reihenfolge fehlt in games.json - Lookahead und");
console.log("  Pickfolge bleiben darum ungeprueft.");
