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
  /* Wie gut steht der Pick ueber die wahrscheinlichen KUENFTIGEN
     Lanegegner? Ersetzt das fruehere "pickReihenfolge", das nur die
     Streuung der Matchups kannte. Gilt nur, solange der Lanegegner
     (ganz oder teilweise) unbekannt ist, und wiegt dann nach dem
     unbekannten Anteil - siehe blind.js. Gleich schwer wie "matchup":
     es ist dieselbe Frage, nur ueber Gegner, die noch nicht feststehen.
     Seit Audit P1.1 das Gewicht der LANE als Ganzes: der bekannte Teil
     zaehlt als "lane" (score.js), der unbekannte als blindSicherheit -
     zusammen in jedem Modus 18. */
  blindSicherheit: 18,
  lookahead: 10,       // Erwartungswert ueber wahrscheinliche Antworten
  /* Ein eigener Risikoabzug steht hier nicht mehr. Er enthielt die
     Streuung (die schon als Bonus zaehlte - dieselbe Zahl zweimal) und
     (1 - Konfidenz). Der schlechteste Ausgang wirkt jetzt in
     blindSicherheit und im Lookahead, beide ueber das Risikoprofil;
     Unsicherheit wirkt als Schrumpfung (KONFIDENZ.schrumpfBoden). */
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

/* ------------------------------------------------------ Teildeckung */
/* Achsen, die eine andere teilweise mittragen - Heuristik, keine Messung.
   Frontline steht zwischen Gegnern und Carries und faengt Dive ab; echten
   Peel (Schilde, Wegstossen) ersetzt sie nicht. Der Faktor kommt aus der
   Skala der Tabelle selbst: ausgepraegt (2) zaehlt als teilweise (1).
   Wirkt in heuristik.achse(), also ueberall gleich: Bedarf, Comp-Wertung,
   Stoerung. Eingetragen auf Hinweis des Teams am 10.10.2026. */
export const TEILDECKUNG = {
  peel: {frontline: 0.5},
};

/* ------------------------------------------------------------ Blindpicks */
/* Ein Blindpick wird gegen die wahrscheinlichen KUENFTIGEN Lanegegner
   gerechnet, nicht ueber eine einzelne Streuungszahl. Die fruehere Fassung
   (nur Streuung) mass zu einem guten Teil Rauschen: von 3,85 Punkten
   beobachteter Standardabweichung der Matchupabweichungen sind 2,74
   Zufall und nur 2,70 echt (22.004 Lanepaarungen, 10.10.2026). Ein
   Champion mit duenner Tabelle sah dadurch konterbarer aus, als er ist. */
export const BLIND = {
  /* Rauschkorrektur: eine gemessene Abweichung wird mit n / (n + k)
     geschrumpft. k = 0,25 / tau^2 mit tau = 2,70 Punkten echter Streuung
     ergibt 343 - bei 343 Partien ist eine Quote halb Signal, halb Zufall.
     Gemessen, nicht gesetzt. */
  schrumpfK: 343,

  /* Das Szenariofeld: die haeufigsten Lanegegner bis zu diesem Anteil
     ihrer Rollenpartien. Eine erste Fassung schnitt bei 90 % ab - dann
     fiel ein seltener Counter ganz heraus und wurde nicht einmal mehr
     genannt. Jetzt das ganze Feld: der Schwanz zaehlt mit seiner
     geringen Wahrscheinlichkeit, und seine duennen Paarungen schrumpft
     die Rauschkorrektur ohnehin. Die Obergrenze ist nur ein Sicherheitsnetz
     (Top hat 87 Champions). */
  feldAnteil: 1.0,
  feldHoechstens: 100,
  // Botlane: ADC- und Supportpaare nach gemessener gemeinsamer Partienzahl.
  // 15 x 15 haeufigste: alle 225 Paare haben Daten.
  botBreite: 15,
  botPaareHoechstens: 80,

  /* Unter dieser abgedeckten Wahrscheinlichkeitsmasse ist der Wert keine
     Aussage ueber das Feld, sondern ueber ein paar Paarungen - dann
     faellt die Komponente weg (Summe UND Hoechstwert). Gesetzt. */
  mindestAbdeckung: 0.6,

  /* Gefahrenstufen fuer einen Counter, aus der gemessenen Verteilung
     aller Lane-Abweichungen (12.358 Paarungen mit >= 200 Partien):
       ungünstig       schlechtestes Fuenftel   <= -2,40 Punkte
       gefaehrlich     schlechtestes Zehntel    <= -3,85 Punkte
       sehr gefaehrlich schlechtestes Zwanzigstel <= -5,32 Punkte
     Die Stufen gelten fuer die geschrumpfte Abweichung. */
  stufen: {unguenstig: -0.024, gefaehrlich: -0.0385, sehrGefaehrlich: -0.0532},

  /* Wie viel Wahrscheinlichkeitsmasse das "schlechteste Fuenftel"
     (CVaR) umfasst. Ein seltener Counter allein fuellt es nicht - er
     zieht den Wert nur im Mass seiner Wahrscheinlichkeit herunter, statt
     den Champion zu zerstoeren. */
  schwanzAnteil: 0.20,

  /* Abbildung des Rohwerts (Punkte Siegquote) auf 0..1. 0,5 = so gut wie
     ein durchschnittlicher Champion gegen dieses Feld. Geeicht an allen
     342 Kandidaten im leeren Draft, Profil "ausgewogen": p5 -2,82,
     Median -0,15, p95 +1,64 Punkte. Mit 3,0 landet p5 bei 0,03 und p95
     bei 0,77 - kaum etwas wird abgeschnitten. 2,5 haette das untere
     Zwanzigstel auf 0 gekappt. */
  spanne: 0.030,

  /* Kennen wir die gegnerische Mannschaft (gescoutet), ist ihr Spieler auf
     der Rolle die bessere Quelle als das Metafeld: wer 120 Partien Aatrox
     hat, pickt eher Aatrox. Gemischt wird, weil auch ein Pool kein
     Versprechen ist. Der Mischanteil ist GESETZT, nicht gemessen - uns
     fehlen beobachtete Gegnerdrafts, um ihn zu pruefen. */
  gegnerPoolAnteil: 0.5,
  // Unter so vielen Rankedpartien traegt ein gegnerischer Pool nichts.
  gegnerPoolMindestPartien: 20,

  /* Prio-Pick: gehoert zu den meistgespielten der Rolle, die zusammen
     die Haelfte aller Rollenpartien stellen. Gemessen sind das 18 (Top),
     14 (Jungle), 14 (Mid), 7 (ADC) und 11 (Support) Champions. */
  prioAnteil: 0.5,

  /* Ab welchem Blindwert ein Kandidat als "sicher" markiert wird.
     Gemessen ueber 342 Kandidaten im leeren Draft: Median 0,472,
     p75 0,598, p90 0,703. 0,6 heisst also "im besten Viertel gegen das
     wahrscheinliche Feld". Robust UND Prio sind dann z. B. Malphite,
     Garen, Gangplank, Wukong, Cho'Gath, Ahri, Jinx, Tristana, Leona,
     Thresh, Blitzcrank. */
  sicherAb: 0.6,

  /* Rollenunsicherheit beim Gegner: KEINE eigene Schwelle. Unsicher ist
     die Rolle eines gegnerischen Champions genau dann, wenn eine andere,
     beim Gegner noch offene Rolle mindestens ROLLEN.flexAbAnteil seiner
     Partien hat - dieselbe Definition von "flexibel", die das Board
     ueberall benutzt. Gemessen: Jax 13 % Jungle, Darius 10 % -> sicher;
     Gragas 19 % Jungle, Sylas, Pantheon -> unsicher. Eine erste Fassung
     mit 90 % Rollenanteil haette auch Darius als Flexpick gefuehrt. */
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
  // Die Ersteinschaetzung (Abschnitt "vorschlag") hat noch niemand aus
  // der Mannschaft geprueft - sie traegt darum noch weniger.
  heuristikVorschlag: 0.3,
  // Schwellen fuer die Anzeige
  hoch: 0.7,
  mittel: 0.45,
  /* Entscheidungswert statt roher Note: eine Note mit duenner Datenlage
     wird zum Median der Liste hin gezogen, nicht mit der Konfidenz
     multipliziert. Multiplizieren wuerde jeden unsicheren Champion
     bestrafen, auch einen schwachen - schrumpfen zieht beide Enden zur
     Mitte, und genau das heisst "wir wissen es nicht genau".

       entscheidung = median + (note - median) * (boden + (1 - boden) * konfidenz)

     Bei Konfidenz 1 bleibt die Note, bei 0 bleibt die Haelfte des
     Abstands. Gesetzt. */
  schrumpfBoden: 0.5,
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
  /* Fuer den Informationswert zaehlt eine zweite Rolle nur, wenn der
     Champion dort auch etwas taugt - eine Rolle, auf der er 46 % holt,
     verbirgt nichts, weil niemand ihn dort erwartet. Gesetzt knapp unter
     dem Mittel. */
  flexMindestStaerke: 0.485,
};

/* --------------------------------------------------------------- Komfort */
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
  /* Skala des Lookaheads (Audit P1.2): Abweichung vom Median der
     Vorauswahl, die auf den Rand 0 bzw. 1 faellt. Gemessen am 10.10.2026
     ueber 680 echte Zwischenstaende der 68 Partien (8.160 Lookaheads):
     |Rohwert - Median| p50 0,07, p75 0,39, p90 1,38, p95 2,53, p99 4,87
     Punkte. 2,5 = p95, so wie BLIND.spanne geeicht ist. Vorher Min-Max
     ueber die Vorauswahl - deren Spanne lag im Median bei 0,56 Punkten,
     es wurde also meist Rauschen auf die volle Skala gezogen. */
  lookaheadSpanne: 0.025,
};

/* ------------------------------------------------------------- Lagebild */
/* Schwellen fuer strategie.js. Gemessen am 10.10.2026, Patch 16.19.1. */
export const STRATEGIE = {
  // Ab so vielen eingeschaetzten Picks einer Seite gibt es Bedarf und
  // Gefahr. Eins reicht, weil beides relativ ist ("was fehlt am
  // meisten"). Die Siegbedingung braucht COMP.heuristikAbPicks.
  abPicks: 1,
  // Ein Siegmuster zaehlt erst, wenn seine Achsen im Mittel halb
  // getragen sind. Gesetzt.
  musterAb: 0.5,
  // Ab hier gilt eine Achse als gedeckt: ein weiterer Champion bringt
  // dort fast nichts mehr (siehe saettigen in comp.js). Gesetzt.
  gesaettigtAb: 0.9,
  /* Ab wann eine Seite in einer Phase "vorn" ist. Gemessen ueber die 68
     Turnierpartien (Betrag der staerksten Phasendifferenz): p25 0,52,
     Median 0,81, p75 1,68, p90 2,50 Punkte. Gewaehlt ist p75 - nur das
     obere Viertel der Unterschiede wird genannt. */
  phasenVorsprung: 0.0168,
  // So viele Kandidaten je Rolle (nach Patchstaerke) gehen in den Wert
  // des Wartens. 20 decken die realistischen Picks; 26 ms fuer alle fuenf
  // Rollen im leeren Draft.
  wartenKandidaten: 20,
  /* Ab wann "spaeter picken" genannt wird. Gemessen im leeren Draft:
     Mid 2,79, Top 2,76, Jungle 1,65, ADC 1,46, Support 0,68 Punkte -
     die bekannte Reihenfolge "Support frueh, Mid und Top als Counter",
     hier aus den Matchups und ohne Faustregel. Die Schwelle liegt beim
     Median der fuenf. */
  wartenLohntAb: 0.0165,
  /* "Bringt das mit": so viele Champions je Bedarf, hoechstens so viele
     je Rolle. Gesetzt - es ist eine Liste zum Nachschlagen, keine Wertung. */
  bringerAnzahl: 5,
  bringerJeRolle: 2,
  // Ab diesem Komfort gilt ein Champion als "im Pool" des Spielers.
  // Nach der Formel in team.js sind 0,5 rund 10 Rankedpartien
  // (log10 11 / log10 101 = 0,52) oder ein Eintrag im Draftplan
  // ("spielt gerne" 0,65, "blind" 1,0). Gesetzt.
  poolAb: 0.5,
  // Ab welchem magischen (bzw. physischen) Anteil ein Champion als
  // Traeger dieses Schadens gilt. Gesetzt, ausserhalb des Mischbands.
  schadenTraegerAb: 0.6,
};

/* -------------------------------------------------- Massstab der Comp-Quote */
/* Woran wird die Comp-Quote gemessen? NICHT an unseren Ligapartien - 68
   sind zu wenige, und die Staerke kommt aus dem Patch, nicht aus unseren
   Spielen. Stattdessen Aufstellungen, gezogen nach der gemessenen
   Spielhaeufigkeit jeder Rolle in den DraftGap-Daten. Gemessen am
   10.10.2026: ab 2.000 stehen die Raender (p5 48,27, Median 50,00,
   p95 51,74 %); 500 schwanken noch, 5.000 aendern nichts mehr und kosten
   das Dreifache. Fester Startwert - gleiche Daten, gleicher Massstab. */
export const COMP_REFERENZ = {
  anzahl: 2000,
  saat: 20261010,
};

/* ------------------------------------------------------------ Risikoprofil */
/* Veraendert das Modell, nicht nur die Anzeige: SICHER gewichtet den
   schlechtesten Ausgang mit, AGGRESSIV den besten. Gilt an zwei Stellen,
   die sich nicht ueberschneiden: im Blindwert (schlechtestes und bestes
   Fuenftel der Lanegegner) und im Lookahead (schlechtester und bester
   Ast der uebrigen Draftfolge). */
export const RISIKOPROFILE = {
  sicher:     {schlechtester: 0.45, erwartet: 0.55, bester: 0.00},
  ausgewogen: {schlechtester: 0.20, erwartet: 0.70, bester: 0.10},
  aggressiv:  {schlechtester: 0.05, erwartet: 0.60, bester: 0.35},
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
  /* Fuer "sicherster", "aggressivster", "Flex"- und "Komfortpick" kommen
     nur Kandidaten in Frage, die hoechstens so viele Punkte hinter dem
     besten liegen. Sonst waere der Komfortpick ein strategisch
     schlechter Champion, den der Spieler eben gern spielt. Gesetzt. */
  kategorieAbstand: 10,
};
