/* Kein Test - ein Blick auf die Rangfolge in einer echten Lage. */
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { teamAnlegen } from "../engine/team.js";
import { bewerterAnlegen } from "../engine/score.js";
import { leererDraft } from "../engine/state.js";

const DATA = ladeDaten();
const quelle = quelleAnlegen(DATA.draft);
const h = heuristikAnlegen({champions: {}});
const merkmale = merkmaleAnlegen(quelle, h);
const comp = compAnlegen(merkmale, h);
const team = teamAnlegen(DATA.teams);
const B = bewerterAnlegen({quelle, merkmale, comp, team, heuristik: h});

const s = leererDraft({patch: quelle.patch, wirSind: "blue"});
s.picks.red.push({champ: "Ornn", rolle: "TOP"},
                 {champ: "Wukong", rolle: "JUNGLE"},
                 {champ: "Vladimir", rolle: "MIDDLE"});
s.picks.blue.push({champ: "Jinx", rolle: "BOTTOM"},
                  {champ: "Thresh", rolle: "UTILITY"});
s.bans.red.push("Jax", "Camille");

const t0 = performance.now();
const liste = merkmale.kandidaten("TOP")
  .map((m) => B.bewerte(s, m.champ, "TOP",
                        {spielerTeam: "AFC1", spielerLabel: "bandit"}))
  .filter(Boolean)
  .sort((a, b) => b.score - a.score);
const t1 = performance.now();

console.log("Lage: sie Ornn/Wukong/Vladimir, wir Jinx/Thresh. Wir picken TOP.");
console.log(liste.length + " Kandidaten in " + (t1 - t0).toFixed(1) + " ms\n");
for (const r of liste.slice(0, 6)) {
  console.log(String(r.score).padStart(3) + "  " + r.champion.padEnd(13)
    + r.confidenceWort.padEnd(8)
    + Object.entries(r.components)
        .sort((a, b) => Math.abs(b[1].beitrag) - Math.abs(a[1].beitrag))
        .slice(0, 3)
        .map(([n, t]) => n + " " + (t.beitrag >= 0 ? "+" : "")
                         + t.beitrag.toFixed(1)).join("  "));
  if (r.reasons.length) console.log("     + " + r.reasons.slice(0, 2).join(" | "));
  if (r.risks.length) console.log("     ! " + r.risks.slice(0, 2).join(" | "));
}
console.log("\nSchlusslichter:");
for (const r of liste.slice(-3)) {
  console.log(String(r.score).padStart(3) + "  " + r.champion.padEnd(13)
    + (r.risks[0] || ""));
}
