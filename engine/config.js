/* Alle Stellschrauben der Draft-Engine an einem Ort.
   ---------------------------------------------------------------------------
   Absicht: Gewichte und Schwellen stehen NICHT verstreut im Code. Wer das
   Modell nachstellt, aendert diese Datei - und nur diese.

   Die Zahlen hier sind ein Ausgangspunkt, kein Ergebnis. Sie sind bewusst
   nicht auf einzelne Drafts getrimmt worden; dafuer braucht es erst den
   Backtest (Phase 6). Bis dahin gilt: plausibel gesetzt, nachvollziehbar
   dokumentiert, jederzeit aenderbar.
*/

export const VERSION = {
  optimizer: "0.1.0",
  // Wird beim Bauen gesetzt und wandert in jede Empfehlung, damit sich
  // spaetere Auswertungen einer Modellfassung zuordnen lassen.
  data: null,
};

/* --------------------------------------------------------------- Gewichte */
/* Jede Komponente liefert 0..1 und wird hier gewichtet. Faellt eine
   Komponente mangels Daten aus, faellt ihr Gewicht aus Summe UND
   Hoechstwert - der Rest wird nicht heimlich schwerer. Siehe score.js. */
/* Die Komponenten muessen sich NICHT ueberlappen, sonst zaehlt dieselbe
   Aussage zweimal. Darum stehen Schadensbalance, Kurve und
   Rollenabdeckung hier NICHT mehr einzeln: sie stecken in compFit, das
   sie intern ueber COMP.achsen gewichtet. Ein frueher Entwurf hatte sie
   doppelt. */
export const GEWICHTE = {
  meta: 14,            // Staerke des Champions auf dieser Rolle im Patch
  matchup: 18,         // gemessen gegen die gegnerischen Picks
  synergie: 18,        // gemessen mit den eigenen Picks
  compFit: 16,         // Marginalwert fuer die eigene Aufstellung
  gegnerStoerung: 8,   // stoert er ihren Plan (braucht die Heuristiktabelle)
  flex: 5,             // Rollen-Mehrdeutigkeit als Informationswert
  komfort: 14,         // was unsere Spieler wirklich koennen
  pickReihenfolge: 7,  // blind sicher vs. counterbar
  lookahead: 10,       // Erwartungswert ueber wahrscheinliche Antworten
  risiko: -8,          // Abzug fuer Volatilitaet
};

/* Welche unserer Achsen welcher gegnerischen entgegenwirkt. Das ist eine
   Modellannahme ueber Beziehungen zwischen den Achsen - keine erfundenen
   Championdaten. Sie steht hier, damit sie diskutierbar bleibt, und
   greift nur, soweit die Heuristiktabelle gepflegt ist.

   Frontline bleibt bewusst ohne Gegenstueck: was Panzer bricht, sind
   Gegenstaende, keine Championeigenschaft. */
export const STOERUNG = {
  engage:    ["disengage", "peel"],
  dive:      ["peel", "disengage"],
  poke:      ["engage"],
  siege:     ["disengage"],
  splitpush: ["catch"],
  catch:     ["peel"],
};

/* Blind oder Counter: wie stark die Streuung der Matchupquoten zaehlt.
   Ein Champion, dessen Quoten je nach Gegner weit auseinanderliegen, ist
   leicht konterbar - als spaeter Pick wertvoll, als blinder riskant.
   Die Streuung ist gemessen, die Schwelle gesetzt. */
export const PICKFOLGE = {
  // An der gemessenen Verteilung ueber alle 342 Champion-Rollen-Paare
  // geeicht, nicht geschaetzt: Median 2,77, 25. Perzentil 2,35,
  // 75. Perzentil 3,42. Die engsten sind Jungler ohne festen Lanegegner
  // (Lee Sin 1,49), die weitesten Kassadin 5,83 und Neeko 6,62.
  streuungEng: 0.024,
  streuungWeit: 0.034,
  // Mindestzahl Gegner mit Daten, damit die Streuung etwas aussagt
  mindestGegner: 20,
};

/* ------------------------------------------------------------- Konfidenz */
/* Stichprobengroesse -> Konfidenz. Eine Matchup-Quote aus 43 Partien darf
   nicht so schwer wiegen wie eine aus 2500. Die Kurve saettigt, weil der
   Unterschied zwischen 5000 und 20000 Partien praktisch keiner mehr ist. */
export const KONFIDENZ = {
  // n, ab dem eine Quote ueberhaupt zaehlt
  mindestStichprobe: 50,
  // n, ab dem sie als voll belastbar gilt
  volleStichprobe: 2000,
  // Abschlag je Patch Abstand zwischen Datenstand und aktuellem Patch
  abschlagJePatch: 0.12,
  // Ab hier gilt ein Datensatz als veraltet und die Oberflaeche warnt
  veraltetAbPatches: 2,
  // Konfidenz der Team-Heuristik. Bewusst niedrig: sie ist eine
  // Einschaetzung unserer Mannschaft, keine Messung. Siehe heuristik.js.
  heuristik: 0.45,
  // Schwellen fuer die Anzeige
  hoch: 0.7,
  mittel: 0.45,
};

/* -------------------------------------------------------------- Rollenwahl */
export const ROLLEN = {
  // Eine Rolle zaehlt fuer einen Champion erst, wenn sie genug Partien hat.
  // Ahri hat 7.691 Partien auf Top - gemessen an 236.000 auf Mid ist das
  // Rauschen, und sie stand einmal als bester Vorschlag beim Toplaner.
  mindestPartien: 1000,
  mindestAnteil: 0.05,
  // Ab diesem Anteil auf einer zweiten Rolle gilt ein Champion als flexibel
  flexAbAnteil: 0.15,
};

/* --------------------------------------------------------------- Komfort */
/* Wann lohnt es sich, einen Champion blind zu picken - also bevor man
   den Lanegegner kennt? Gemessen wird die Streuung seiner Matchupquoten;
   wenig Streuung heisst, der Gegner aendert wenig.

   Das Perzentil gilt INNERHALB der Rolle. Die Rollen liegen weit
   auseinander (Jungle-Median 2,27 Punkte gegen Top-Median 3,28), eine
   feste Schwelle haette darum vor allem die Rolle markiert und nicht den
   Champion. Gemessen am 10.10.2026 ueber 342 Paare. */
export const BLINDSICHER = {
  // Robuster als dieser Anteil der Champions derselben Rolle
  perzentil: 0.20,
  // Ein robuster, aber unterdurchschnittlicher Champion ist kein Gewinn.
  // Streuung und Staerke sind praktisch unabhaengig (r = -0,07), die
  // Bedingung streicht also nicht einfach die Haelfte weg.
  mindestStaerke: 0.50,
  // Unter so wenigen Lanegegnern in der Tabelle ist die Streuung selbst
  // zu unsicher, um daraus etwas abzuleiten.
  mindestGegner: 30,
};

export const KOMFORT = {
  // Eigene Partien, ab denen Erfahrung voll zaehlt
  volleErfahrung: 100,
  // Eigene Winrate zaehlt erst ab so vielen entschiedenen Partien
  winrateAbPartien: 10,
  // Zuschlag aus dem Draftplan
  blindPick: 1.0,
  spieltGerne: 0.65,
  /* Kein einziger Beleg: weder Partien noch Draftplan.
     Beide Extreme waren falsch und beide gemessen:
       0        -> der Champion bekam 14 Punkte Abzug dafuer, dass wir
                   nichts wissen; oben standen nur gespielte Champions
       weglassen -> der Hoechstwert schrumpfte mit, der Champion wurde
                   hochnormiert; 5 der 6 besten waren nie gespielt
     Richtig ist dazwischen: "moeglich, aber ungeuebt". Unsere Spieler
     koennen einen Champion auch ohne Rankedpartien in dieser Season -
     nur ist es ein Risiko, und das wiegt der Wert ab. Die Konfidenz
     bleibt niedrig, damit die Aussage nicht schwerer wirkt als sie ist. */
  ohneBeleg: 0.15,
  ohneBelegKonfidenz: 0.25,
  // Komfort darf einen strategischen Nachteil daempfen, aber nicht
  // ueberstimmen: so viel vom Gesamtergebnis darf er hoechstens ausmachen.
  hoechstanteil: 0.25,
};

/* ------------------------------------------------------ Aufstellung */
export const COMP = {
  // Schadensmischung: ausserhalb dieses Bandes wird eine Aufstellung
  // billig konterbar, weil ein Widerstand reicht. Die Grenzen sind
  // gesetzt, nicht gemessen - es gibt keine Quelle, die sagt, wo genau
  // es kippt. Sie stehen hier, damit man sie diskutieren kann.
  schadenBandVon: 0.30,
  schadenBandBis: 0.70,

  // Gewichte der Comp-Achsen untereinander. Die gemessenen wiegen
  // schwerer als die geschaetzten - nicht aus Vorsicht, sondern weil
  // hinter ihnen Zehntausende Partien stehen und hinter den anderen
  // eine Einschaetzung.
  achsen: {
    schadensbalance: 20,
    kurveGegenGegner: 16,
    rollenabdeckung: 8,
    // heuristisch, zusammen bewusst kleiner als die gemessenen
    engage: 7, disengage: 5, peel: 6, frontline: 8, dive: 5,
    catch: 4, poke: 5, siege: 4, splitpush: 4, teamfight: 8, objective: 6,
  },

  // Unter so vielen gepflegten Picks ist eine Heuristikachse keine
  // Aussage ueber die Aufstellung, sondern ueber einen Champion.
  heuristikAbPicks: 2,
};

/* -------------------------------------------------------------- Lookahead */
export const SUCHE = {
  // Tiefe 2 heisst: unser Pick -> wahrscheinliche Antwort -> unsere Antwort.
  tiefe: 2,
  // Wie viele Gegnerantworten je Knoten verfolgt werden
  beiteGegner: 6,
  // Wie viele eigene Kandidaten ueberhaupt in die Suche gehen. Die Liste
  // zeigt mehr - aber einen Lookahead fuer 87 Kandidaten zu rechnen
  // kostet Zeit, die der Draft nicht hat.
  beiteEigen: 12,
  // Wie viele eigene Antworten je Gegnerzug geprueft werden
  beiteAntwort: 8,
  // Wie gross der Vorrat ist, aus dem die Gegnerantworten kommen. Er wird
  // EINMAL fuer die aktuelle Lage bestimmt und dann je eigenem Kandidaten
  // neu bewertet - sonst waeren es 87 Bewertungen je Kandidat.
  gegnerVorrat: 20,
  // Unterhalb dieser Wahrscheinlichkeit wird eine Antwort nicht verfolgt
  mindestWahrscheinlichkeit: 0.03,
  // Weichheit des Gegnermodells. Die Punkte stehen auf 0..100; bei 8
  // ist eine um zehn Punkte bessere Antwort rund dreieinhalbmal so
  // wahrscheinlich. Gesetzt, nicht gemessen - fuer eine Messung fehlen
  // uns beobachtete Draftreihenfolgen.
  temperatur: 8,
};

/* ------------------------------------------------------------ Risikoprofil */
/* Veraendert das Modell, nicht nur die Anzeige: SICHER gewichtet den
   schlechtesten Ausgang mit, AGGRESSIV den besten. */
export const RISIKOPROFILE = {
  sicher:     {schlechtester: 0.45, erwartet: 0.55, bester: 0.00, risiko: 1.4},
  ausgewogen: {schlechtester: 0.20, erwartet: 0.70, bester: 0.10, risiko: 1.0},
  aggressiv:  {schlechtester: 0.05, erwartet: 0.60, bester: 0.35, risiko: 0.6},
};
export const STANDARD_RISIKO = "ausgewogen";

/* ----------------------------------------------------------- Darstellung */
export const ANZEIGE = {
  // Keine Scheingenauigkeit: 87, nicht 87,391728.
  punkteNachkomma: 0,
  /* Ab wann eine Note hervorgehoben wird. An der gemessenen Verteilung
     ueber drei Draftlagen geeicht (Median 43, 75. Perzentil 55,
     90. 61, 95. 66) - vorher standen hier 70 und 55, und damit war
     praktisch nie etwas gruen. Die Note ist relativ: sie wird durch die
     Summe der VERFUEGBAREN Gewichte geteilt, haengt also davon ab, wie
     viel ueber eine Lage bekannt ist. */
  gruenAb: 60,
  orangeAb: 50,
  /* Sterne: dieselbe Verteilung in fuenf Stufen statt Punkte/20, was
     fuenf Sterne erst ab 90 ergeben haette - also nie. */
  sterne: [30, 42, 52, 62],
  quoteNachkomma: 1,
  topEmpfehlungen: 5,
  avoidEmpfehlungen: 3,
};
