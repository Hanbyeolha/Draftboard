/* Shortlist und Status je Champion (Draftboard 2.0, Phase 2).
   ---------------------------------------------------------------------------
   Waehrend eines Drafts merkt sich das Team, worueber es schon gesprochen
   hat: gemerkt (Shortlist), erwogen, verworfen. Verworfenes verschwindet
   nicht, es tritt nur zurueck - sonst wuerde dieselbe Frage zweimal
   diskutiert. Ohne Eintrag ist ein Champion UNREVIEWED.

   Reine Funktionen auf einem einfachen Objekt {Champion: Status}: die
   Oberflaeche haelt den Stand, speichert ihn und zeigt ihn. Die
   Reihenfolge der Shortlist ist die Reihenfolge des Merkens. */

export const MERK_STATUS = ["SHORTLISTED", "CONSIDERED", "REJECTED"];

export function merkStatus(liste, champ) {
  return (liste && liste[champ]) || "UNREVIEWED";
}

export function merkSetzen(liste, champ, status) {
  if (status !== "UNREVIEWED" && !MERK_STATUS.includes(status)) {
    throw new Error("unbekannter Status: " + status);
  }
  const neu = {...(liste || {})};
  delete neu[champ];
  if (status !== "UNREVIEWED") neu[champ] = status;
  return neu;
}

/** Derselbe Status noch einmal nimmt ihn zurueck - ein Knopf, zwei Wege. */
export function merkUmschalten(liste, champ, status) {
  return merkSetzen(liste, champ, merkStatus(liste, champ) === status ? "UNREVIEWED" : status);
}

/** gesperrt: alles, was nicht mehr waehlbar ist (Set oder Map der Namen). */
export function merkAuswertung(liste, gesperrt) {
  const weg = (c) => !!gesperrt && gesperrt.has(c);
  const eintraege = Object.entries(liste || {});
  const shortlist = eintraege.filter(([, s]) => s === "SHORTLISTED")
    .map(([champ]) => ({champ, vergeben: weg(champ)}));
  return {
    shortlist,
    frei: shortlist.filter((x) => !x.vergeben).length,
    erwogen: eintraege.filter(([, s]) => s === "CONSIDERED").map(([c]) => c),
    verworfen: eintraege.filter(([, s]) => s === "REJECTED").map(([c]) => c),
  };
}

/** Welche Champions der Shortlist sind seit dem letzten Stand vergeben
 *  worden? Fuer die Meldung "Orianna vergeben - noch 2 frei". */
export function merkNeuVergeben(liste, vorher, nachher) {
  return Object.entries(liste || {})
    .filter(([c, s]) => s === "SHORTLISTED" && nachher.has(c) && !vorher.has(c))
    .map(([c]) => c);
}
