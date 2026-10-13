/* Das Ansichtsmodell einer Empfehlung (Draftboard 2.0, Phase 1).
   ---------------------------------------------------------------------------
   Das Cockpit soll eine Empfehlung lesen, nicht nachrechnen. Diese Sicht
   ordnet, was die Bewertung (score.js) schon geliefert hat - Note,
   Entscheidungswert, Gruende, Risiken, die Teile - in Felder, die die
   Oberflaeche direkt zeigt. Keine eigene Gewichtung, keine Schwellen.

   werte (je 0..100 oder null, wenn der Teil in dieser Lage fehlt):
     spieler  Komfort des Spielers                       (komfort)
     matchup  gegen die Gegner, bekannte und erwartete   (lane, matchup,
                                                          blindSicherheit)
     comp     passt zur eigenen Aufstellung              (synergie, compFit)
     meta     Patchstaerke auf der Rolle                 (meta)
   Gemittelt wie die Anzeigegruppen (score.js teilWert).

   Was die Engine nicht weiss, kommt vom Aufrufer: plan ("blind" | "likes"
   | null) aus dem Draftplan, pool (gespielt), prio (Meta-Prioritaet). */

import { teilWert, teilGruppen } from "./score.js";

export const ANSICHT_TEILE = {
  spieler: ["komfort"],
  matchup: ["lane", "matchup", "blindSicherheit"],
  comp: ["synergie", "compFit"],
  meta: ["meta"],
};

export function empfehlungAnsicht(r, {plan = null, pool = null, prio = null} = {}) {
  const werte = {};
  for (const [name, teile] of Object.entries(ANSICHT_TEILE)) werte[name] = teilWert(r, teile);
  return {
    champion: r.champion,
    rolle: r.rolle,
    score: r.score,
    entscheidung: r.entscheidung ?? null,
    konfidenz: r.confidence ?? null,
    modus: r.lage ? r.lage.modus : null,
    gruende: r.reasons,
    risiken: r.risks,
    werte,
    gruppen: teilGruppen(r),
    plan, pool, prio,
  };
}
