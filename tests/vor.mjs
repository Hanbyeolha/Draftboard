/* Kein Test - ein Blick darauf, was der Lookahead aendert. */
import { ladeDaten } from "./daten.mjs";
import { quelleAnlegen } from "../engine/data.js";
import { heuristikAnlegen } from "../engine/heuristik.js";
import { merkmaleAnlegen } from "../engine/features.js";
import { compAnlegen } from "../engine/comp.js";
import { teamAnlegen } from "../engine/team.js";
import { bewerterAnlegen } from "../engine/score.js";
import { sucheAnlegen } from "../engine/search.js";
import { leererDraft } from "../engine/state.js";

const DATA = ladeDaten();
const q = quelleAnlegen(DATA.draft);
const h = heuristikAnlegen({champions: {}});
const me = merkmaleAnlegen(q, h);
const B = bewerterAnlegen({quelle: q, merkmale: me, comp: compAnlegen(me, h),
                           team: teamAnlegen(DATA.teams), heuristik: h});
const S = sucheAnlegen({quelle: q, merkmale: me, bewerter: B});

const s = leererDraft({patch: q.patch, wirSind: "blue"});
s.picks.blue.push({champ: "Ornn", rolle: "TOP"}, {champ: "Jinx", rolle: "BOTTOM"},
                  {champ: "Thresh", rolle: "UTILITY"});
s.picks.red.push({champ: "Jax", rolle: "TOP"}, {champ: "Wukong", rolle: "JUNGLE"},
                 {champ: "Lulu", rolle: "UTILITY"});

console.log("Wir: Ornn, Jinx, Thresh   Sie: Jax, Wukong, Lulu   -> wir picken MID\n");
const antworten = S.gegnerAntworten(s, S.gegnerVorrat(s));
console.log("Was sie danach vermutlich tun (Schaetzung, keine Beobachtung):");
for (const a of antworten) {
  console.log("  " + (a.p * 100).toFixed(0).padStart(3) + " %  "
    + a.champ.padEnd(13) + a.rolle);
}

const ohne = S.rangliste(s, "MIDDLE", {mitLookahead: false}).slice(0, 5);
const mit = S.rangliste(s, "MIDDLE", {spielerTeam: "AFC1", spielerLabel: "K\u00f8stja"});
console.log("\nohne Lookahead:   " + ohne.map((r) => r.champion).join(", "));
console.log("mit Lookahead:    "
  + mit.slice(0, 5).map((r) => r.champion).join(", "));
console.log("\nTop drei mit Vorausschau:");
for (const r of mit.slice(0, 3)) {
  const l = r.lookahead;
  console.log("  " + String(r.score).padStart(3) + "  " + r.champion.padEnd(12)
    + "erwartet " + (l.ev * 100).toFixed(2) + " %  schlechtestenfalls "
    + (l.schlechtester * 100).toFixed(2) + "  bestenfalls "
    + (l.bester * 100).toFixed(2) + "   Robustheit " + l.robustheit);
}
