/* Frueher Laufzeitblick. Kein Test - eine Messung. */
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { teamAnlegen } from "../engine/team.js";

const DATA = ladeDaten();
const t0 = performance.now();
const quelle = quelleAnlegen(DATA.draft);
const T = teamAnlegen(DATA.teams);
const M = merkmaleAnlegen(quelle, heuristikAnlegen({champions: {}}));
const t1 = performance.now();

const rollen = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
let n = 0;
const t2 = performance.now();
for (const r of rollen) n += M.kandidaten(r).length;
const t3 = performance.now();
for (const r of rollen) M.kandidaten(r);        // jetzt aus dem Cache
const t4 = performance.now();

// Paarabfragen: 90 Kandidaten x 10 Paarungen, wie im Live-Draft
const top = M.kandidaten("TOP");
const gegner = ["Ornn", "Wukong", "Vladimir", "Sivir", "Lulu"];
const t5 = performance.now();
let treffer = 0;
for (let runde = 0; runde < 10; runde++) {
  for (const m of top) {
    for (let i = 0; i < 5; i++) {
      if (quelle.matchup(m.champ, "TOP", gegner[i], rollen[i])) treffer++;
      if (quelle.synergie(m.champ, "TOP", gegner[i], rollen[i])) treffer++;
    }
  }
}
const t6 = performance.now();

const ms = (a, b) => (b - a).toFixed(1) + " ms";
console.log("Quellen anlegen      ", ms(t0, t1));
console.log("Kandidaten, 5 Rollen ", ms(t2, t3), "->", n, "Buendel");
console.log("  dieselben, gecacht ", ms(t3, t4));
console.log("Paarabfragen         ", ms(t5, t6), "->",
            (10 * top.length * 10).toLocaleString("de-DE"), "Abfragen,",
            treffer.toLocaleString("de-DE"), "Treffer");
console.log("  je 1.000 Abfragen  ",
            ((t6 - t5) / (10 * top.length * 10) * 1000).toFixed(2) + " ms");
