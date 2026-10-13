/* Der Draft-Ablauf: wer ist dran, in welcher Phase, bei welchem Schritt.
   ---------------------------------------------------------------------------
   Grundlage fuer Fortschrittsleiste und Zustandskopf des Cockpits
   (Draftboard 2.0, Phase 1). Liest nur die Zahl der Bans und Picks je
   Seite - die Felder der Oberflaeche wissen nicht, in welcher Reihenfolge
   eingetragen wurde, und brauchen es nicht: die Turnierfolge legt sie fest.

   Zwei Dinge aus dem Gebrauch:
     - Bans werden oft nicht eingetragen. Ein Ban-Schritt, hinter dem
       schon gepickt wurde, gilt als "uebersprungen", nicht als offen -
       sonst stuende der Draft nach fuenf Picks noch bei Blaus erstem Ban.
     - Ein fehlender PICK bleibt offen. Hat Blau zweimal gepickt und Rot
       noch nicht, ist Rot dran, nicht Blau ein drittes Mal.

   Kein Timer, kein "gesperrt": das Board kennt den Client nicht
   (Entscheidung des Nutzers, 13.10.2026). */

import { ZUGFOLGE } from "./state.js";

/* Ranked Solo/Flex: alle zehn bannen gleichzeitig, dann dieselbe
   Pickfolge wie im Turnier (B R R B B R R B B R), keine zweite Banrunde. */
const SOLO_PICKS = ZUGFOLGE.filter((z) => z.art === "pick");

function zaehlen(s) {
  const seite = (x) => ({ban: (s.bans[x] || []).filter(Boolean).length,
                         pick: (s.picks[x] || []).filter((p) => p && p.champ).length});
  return {blue: seite("blue"), red: seite("red")};
}

/** Welche Schritte sind erledigt? Der Reihe nach je Seite und Art. */
function erledigt(folge, getan) {
  const zaehl = {blue: {ban: 0, pick: 0}, red: {ban: 0, pick: 0}};
  return folge.map((z) => {
    if (getan[z.seite][z.art] > zaehl[z.seite][z.art]) {
      zaehl[z.seite][z.art] += 1;
      return true;
    }
    return false;
  });
}

/** Der aktuelle Schritt: zuerst ein offener Pick VOR dem letzten
 *  erledigten Schritt (der fehlt wirklich), sonst der erste offene danach.
 *  Offene Bans davor sind uebersprungen. */
function aktuellerIndex(folge, fertig) {
  const letzter = fertig.lastIndexOf(true);
  for (let i = 0; i < letzter; i++) {
    if (!fertig[i] && folge[i].art === "pick") return i;
  }
  for (let i = letzter + 1; i < folge.length; i++) {
    if (!fertig[i]) return i;
  }
  return -1;
}

function fortschrittVon(getan) {
  const je = (x) => ({bans: {getan: getan[x].ban, gesamt: 5},
                      picks: {getan: getan[x].pick, gesamt: 5}});
  return {blue: je("blue"), red: je("red")};
}

/** Der Ablauf eines Drafts.
 *  modus: "turnier" (ZUGFOLGE mit zwei Banrunden) oder "solo" (Ranked).
 *  Liefert {zustand, phase, runde, schritt, schritte, fortschritt}:
 *    zustand  IDLE | OUR_TURN | OPPONENT_TURN | COMPLETE
 *    phase    BAN_PHASE | PICK_PHASE | null (fertig)
 *    schritt  {nr, seite, art, runde, wir} oder null
 *    schritte je Schritt {nr, seite, art, runde, status}
 *             status: fertig | aktuell | offen | uebersprungen */
export function ablauf(s, {modus = "turnier"} = {}) {
  const getan = zaehlen(s);
  const nichts = !getan.blue.ban && !getan.red.ban && !getan.blue.pick && !getan.red.pick;
  const fortschritt = fortschrittVon(getan);
  if (modus === "solo") return ablaufSolo(s, getan, nichts, fortschritt);

  const fertig = erledigt(ZUGFOLGE, getan);
  const k = aktuellerIndex(ZUGFOLGE, fertig);
  const schritte = ZUGFOLGE.map((z, i) => ({
    nr: z.nr, seite: z.seite, art: z.art, runde: z.phase,
    status: fertig[i] ? "fertig" : i === k ? "aktuell" : i < k || k < 0 ? "uebersprungen" : "offen",
  }));
  if (k < 0) {
    return {zustand: "COMPLETE", phase: null, runde: null, schritt: null, schritte, fortschritt};
  }
  const z = ZUGFOLGE[k];
  const wir = z.seite === s.wirSind;
  return {
    zustand: nichts ? "IDLE" : wir ? "OUR_TURN" : "OPPONENT_TURN",
    phase: z.art === "ban" ? "BAN_PHASE" : "PICK_PHASE",
    runde: z.phase,
    schritt: {nr: z.nr, seite: z.seite, art: z.art, runde: z.phase, wir},
    schritte, fortschritt,
  };
}

function ablaufSolo(s, getan, nichts, fortschritt) {
  const bansFertig = getan.blue.ban + getan.red.ban >= 10;
  const gepickt = getan.blue.pick + getan.red.pick > 0;
  const banStatus = bansFertig ? "fertig" : gepickt ? "uebersprungen" : "aktuell";
  const fertig = erledigt(SOLO_PICKS, getan);
  const k = bansFertig || gepickt ? aktuellerIndex(SOLO_PICKS, fertig) : null;
  const schritte = [{nr: 0, seite: "beide", art: "ban", runde: "ban", status: banStatus}]
    .concat(SOLO_PICKS.map((z, i) => ({
      nr: i + 1, seite: z.seite, art: "pick", runde: "pick",
      status: fertig[i] ? "fertig" : i === k ? "aktuell" : k !== null && (k < 0 || i < k)
        ? "uebersprungen" : "offen",
    })));
  if (banStatus === "aktuell") {
    return {zustand: nichts ? "IDLE" : "OUR_TURN", phase: "BAN_PHASE", runde: "ban",
            schritt: {nr: 0, seite: "beide", art: "ban", runde: "ban", wir: true},
            schritte, fortschritt};
  }
  if (k < 0) {
    return {zustand: "COMPLETE", phase: null, runde: null, schritt: null, schritte, fortschritt};
  }
  const z = SOLO_PICKS[k];
  const wir = z.seite === s.wirSind;
  return {zustand: wir ? "OUR_TURN" : "OPPONENT_TURN", phase: "PICK_PHASE", runde: "pick",
          schritt: {nr: k + 1, seite: z.seite, art: "pick", runde: "pick", wir},
          schritte, fortschritt};
}
