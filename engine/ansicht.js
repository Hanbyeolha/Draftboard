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
import { gegenseite } from "./state.js";
import { LANE_GEGNER } from "./blind.js";
import { BLIND } from "./config.js";

export const ANSICHT_TEILE = {
  spieler: ["komfort"],
  matchup: ["lane", "matchup", "blindSicherheit", "proBlind"],
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

/* Winraten zu einem Kandidaten (Wunsch des Nutzers, 18.10.2026): die
   allgemeine Winrate des Champions auf dieser Rolle und seine Winrate
   gegen jeden Gegner, der schon gepickt ist - so gemessen, wie DraftGap sie
   liefert, je mit Stichprobe und Quelle. Keine eigene Rechnung, keine
   Schwelle: das sind die rohen Zahlen NEBEN der Note, nicht ihr Ersatz.

     allgemein  quelle.staerke(champ, rolle) - Patch, alle Spieler; null,
                wenn die Rolle fuer diesen Champion eine Nebenrolle ist
     matchups   [{gegner, rolle, lane, wert, schnitt}] - wert =
                quelle.matchup(...), null, wenn DraftGap das Paar nicht
                fuehrt; schnitt = was alle Champions im Schnitt gegen diesen
                Gegner schaffen (1 - sein paarMittel) - dieselbe Erwartung,
                die score.js in der Begruendung "sonst" nennt. Die
                Lanegegner (LANE_GEGNER) zuerst, sonst in Pickreihenfolge */
export function winraten(quelle, zustand, champ, rolle) {
  const lane = new Set(LANE_GEGNER[rolle] || []);
  const sie = gegenseite(zustand.wirSind);
  const matchups = ((zustand.picks || {})[sie] || [])
    .filter((p) => p && p.champ)
    .map((p, i) => {
      const mittel = quelle.paarMittel(p.champ, p.rolle, "m");
      return {gegner: p.champ, rolle: p.rolle, lane: lane.has(p.rolle), i,
              wert: quelle.matchup(champ, rolle, p.champ, p.rolle),
              schnitt: mittel ? 1 - mittel.value : null};
    })
    .sort((a, b) => (b.lane - a.lane) || (a.i - b.i))
    .map(({i, ...x}) => x);
  // Mit unseren Picks (18.10.2026): Duo-Winrate je Mitspieler, Lanepartner
  // zuerst; schnitt = was alle im Schnitt mit ihm schaffen (paarMittel "s")
  // - dieselbe Erwartung wie "passt zu ... sonst" in der Begruendung.
  const mit = ((zustand.picks || {})[zustand.wirSind] || [])
    .filter((p) => p && p.champ && p.rolle !== rolle)
    .map((p, i) => {
      const mittel = quelle.paarMittel(p.champ, p.rolle, "s");
      return {partner: p.champ, rolle: p.rolle, lane: lane.has(p.rolle), i,
              wert: quelle.synergie(champ, rolle, p.champ, p.rolle),
              schnitt: mittel ? mittel.value : null};
    })
    .sort((a, b) => (b.lane - a.lane) || (a.i - b.i))
    .map(({i, ...x}) => x);
  return {allgemein: quelle.staerke(champ, rolle), matchups, mit};
}

/* Was ist gut gegen DIESEN Gegner? (Wunsch des Nutzers, 18.10.2026: "viel
   mehr sehen, was gut gegen den jeweiligen Laner ist".) Alle Champions, die
   unsere Rolle glaubhaft spielen (quelle.staerke nicht null), mit ihrer
   gemessenen Winrate gegen ihn.

   Sortiert nach der rauschbereinigten Quote: die Abweichung vom Schnitt
   aller gegen ihn wird mit n / (n + BLIND.schrumpfK) gewichtet - dieselbe
   Bereinigung wie in Bewertung und Blindmodell. Sonst stuende ein Champion
   mit 70 % aus 40 Spielen vor einem mit 56 % aus 9000. Angezeigt wird die
   gemessene Quote; die bereinigte ordnet nur.

   @returns [{champ, wert, schnitt, bereinigt}] - wert = quelle.matchup(...),
            schnitt = was alle im Schnitt gegen ihn schaffen (wie winraten) */
export function konter(quelle, gegner, gegnerRolle, rolle, {max = 40} = {}) {
  const mittel = quelle.paarMittel(gegner, gegnerRolle, "m");
  const schnitt = mittel ? 1 - mittel.value : null;
  const basis = schnitt === null ? 0.5 : schnitt;
  const raus = [];
  for (const champ of quelle.champions) {
    if (champ === gegner || !quelle.staerke(champ, rolle)) continue;
    const m = quelle.matchup(champ, rolle, gegner, gegnerRolle);
    if (!m) continue;
    const bereinigt = basis + (m.value - basis) * m.sampleSize / (m.sampleSize + BLIND.schrumpfK);
    raus.push({champ, wert: m, schnitt, bereinigt});
  }
  raus.sort((a, b) => b.bereinigt - a.bereinigt || a.champ.localeCompare(b.champ));
  return raus.slice(0, max);
}
