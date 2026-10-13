/* Plan gegen Ist (Draftboard 2.0, Phase 7 - REVIEW).
   ---------------------------------------------------------------------------
   Nach dem Spiel: Hat jeder gespielt, was im Draftplan stand? Je Pick ein
   Status:
     blind       steht im Plan als blind pickbar
     gerne       steht im Plan unter "spielt er gerne"
     ausserhalb  der Spieler hat einen Plan, der Champion steht nicht darin
     ohnePlan    fuer den Spieler ist kein Plan eingetragen - kein Urteil
   Nur Zaehlen, kein Gewicht, keine Schwelle. Verglichen wird mit dem Plan,
   den die Oberflaeche uebergibt (heute: der aktuelle - ein Plan von damals
   ist nicht gespeichert; die Oberflaeche sagt das dazu). */

export const PLAN_STATUS = ["blind", "gerne", "ausserhalb", "ohnePlan"];

function status(plan, champ) {
  if (!plan || (!plan.blind.length && !plan.likes.length)) return "ohnePlan";
  if (plan.blind.includes(champ)) return "blind";
  if (plan.likes.includes(champ)) return "gerne";
  return "ausserhalb";
}

/**
 * @param {{picks?: {role: string, champ: string, player?: string}[]}[]} spiele
 *   die Partien EINER Mannschaft, in der gewuenschten Reihenfolge
 * @param {(spieler: string|null, rolle: string) => {blind: string[], likes: string[]}|null} planVon
 * @param {string[]} rollen Reihenfolge der Rollen in jeder Zeile
 */
export function planGegenIst(spiele, planVon, rollen) {
  const jeSpieler = new Map();
  const gesamt = {picks: 0, blind: 0, gerne: 0, ausserhalb: 0, ohnePlan: 0};
  const zeilen = [];
  for (const spiel of spiele) {
    const picks = rollen.map((rolle) => {
      const pick = (spiel.picks || []).find((p) => p.role === rolle);
      if (!pick || !pick.champ) return {rolle, champ: null, spieler: null, status: null};
      const spieler = pick.player || null;
      const s = status(planVon(spieler, rolle), pick.champ);
      gesamt.picks += 1;
      gesamt[s] += 1;
      const schluessel = (spieler || "?") + "|" + rolle;
      const z = jeSpieler.get(schluessel)
        || {spieler, rolle, picks: 0, blind: 0, gerne: 0, ausserhalb: 0, ohnePlan: 0};
      z.picks += 1;
      z[s] += 1;
      jeSpieler.set(schluessel, z);
      return {rolle, champ: pick.champ, spieler, status: s};
    });
    zeilen.push({spiel, picks});
  }
  // Je Spieler in Rollenreihenfolge, bei gleicher Rolle der mit mehr Picks zuerst.
  const spieler = [...jeSpieler.values()].sort((a, b) =>
    rollen.indexOf(a.rolle) - rollen.indexOf(b.rolle) || b.picks - a.picks);
  return {zeilen, spieler, gesamt};
}

/** Anteil im Plan (blind + gerne) unter den beurteilbaren Picks, 0..1 oder
 *  null, wenn keiner beurteilbar ist (nur ohnePlan). */
export function imPlanAnteil(z) {
  const beurteilt = z.blind + z.gerne + z.ausserhalb;
  return beurteilt ? (z.blind + z.gerne) / beurteilt : null;
}
