/* Kein Test - ein Blick auf das, was die Comp-Schicht wirklich sagt. */
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";

const DATA = ladeDaten();
const q = quelleAnlegen(DATA.draft);
const h = heuristikAnlegen({champions: {}});
const C = compAnlegen(merkmaleAnlegen(q, h), h);

const unser = [{champ: "Malphite", rolle: "TOP"}, {champ: "Amumu", rolle: "JUNGLE"}];
const gegner = C.profil([
  {champ: "Ornn", rolle: "TOP"}, {champ: "Wukong", rolle: "JUNGLE"},
  {champ: "Vladimir", rolle: "MIDDLE"}, {champ: "Sivir", rolle: "BOTTOM"},
  {champ: "Lulu", rolle: "UTILITY"},
]);

const p = C.profil(unser);
console.log("Unsere zwei Picks:", unser.map((x) => x.champ).join(", "));
console.log("  magisch       ", (p.schaden.magisch.value * 100).toFixed(0) + " %",
            "-> Balance", p.schaden.balance.value.toFixed(2));
console.log("  Kurve         ",
            ["frueh", "mittel", "spaet"]
              .map((f) => f + " " + (p.kurve[f].value * 100).toFixed(1))
              .join("  "));
const v = C.phasenVorteil(p, gegner);
console.log("  gegen sie     ", Object.entries(v.je)
  .map(([k, x]) => k + " " + (x * 100 >= 0 ? "+" : "") + (x * 100).toFixed(1))
  .join("  "), "-> stark:", v.stark);

console.log("\nMarginalwert auf MID, nach Punkten:");
const kandidaten = ["Veigar", "Zed", "Ahri", "Yasuo", "Syndra", "Talon"];
const zeilen = kandidaten.map((c) => {
  const m = C.marginal(unser, {champ: c, rolle: "MIDDLE"}, {gegner});
  return {c, m};
}).filter((x) => x.m.punkte !== null)
  .sort((a, b) => b.m.punkte - a.m.punkte);
for (const {c, m} of zeilen) {
  const b = m.achsen.schadensbalance;
  console.log("  " + c.padEnd(9) + m.punkte.toFixed(3)
    + "   Balance " + b.vorher.toFixed(2) + " -> " + b.nachher.toFixed(2)
    + "   gemessen " + (m.anteilGemessen * 100).toFixed(0) + " %");
}
