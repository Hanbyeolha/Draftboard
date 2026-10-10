# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Das eigene Team **AFC1** einer Uni-League in League of Legends: der Betreiber des
Boards, der die Daten pflegt, und seine Mitspieler. Niemand sonst ist bestätigte
Zielgruppe — kein Coach, keine fremden Teams, keine Öffentlichkeit.

Die Mitspieler pflegen ihre eigenen Blind Picks und sehen sich vor dem Draft die
Gegner an. Der Betreiber holt die Daten, trägt Spiele nach und pflegt den Kader.

## Product Purpose

Scouting- und Draftboard für eine Uni-League. Es führt an einer Stelle zusammen,
was vor und nach einem Draft gebraucht wird: Championpools und Ränge aller
Spieler aus Soloqueue (op.gg), die tatsächlich gespielten Turnierpartien mit
Picks, Bans und Aufstellung (leagueofregions.com), ligaweite Statistiken und den
eigenen Draftplan je Spieler.

Erfolg heißt: Im entscheidenden Moment steht die passende Information da, ohne
Suchen — und zwar sowohl in Ruhe am Abend davor als auch unter Zeitdruck.

## Positioning

Die Verbindung zweier Quellen, die es sonst nur getrennt gibt: op.gg kennt die
Soloqueue-Form, die Liga kennt die echten Turnierpartien. Erst zusammen zeigt
sich, was jemand *gerne* spielt und was er *im Turnier tatsächlich* gespielt hat
— inklusive Rollenwechsel, die in keiner der beiden Quellen allein auffallen.

## Operating Context

Das Board wird in drei Situationen benutzt, und alle drei sind bestätigt:

1. **Live im Champ Select** — während des Drafts, unter Zeitdruck, parallel zum
   laufenden Spielclient. Hier zählt, wie schnell sich die richtige Zeile finden
   lässt.
2. **Vorbereitung vor dem Spiel** — Gegner durchgehen, Draftplan abstimmen,
   Notizen machen. Zeit zum Lesen ist vorhanden.
3. **Nachbereitung** — Picks und Bans der gespielten Serien durchsehen,
   Statistiken anschauen.

Betrieben wird es auf zwei Wegen: als lokales Programm (`serve.py`, Browser auf
127.0.0.1) zum Pflegen der Daten, und als gebaute Datei zum Lesen. Benutzt wird
es am Laptop, gelegentlich am Handy.

## Capabilities and Constraints

**Bestätigt bindend:** Helles und dunkles Theme bleiben beide erhalten.

**Aus dem Bestand (technische Gegebenheiten, nicht vom Nutzer als bindend
bestätigt):**

- Die Oberfläche liegt vollständig in `template.html` (HTML, CSS, JS in einer
  Datei); `build.py` baut daraus `index.html` und `out/*.html` mit eingebetteten
  Daten, Icons, Rangemblemen und Schriften als base64 — rund 2,6 MB, läuft ohne
  Server und ohne Netz.
- Eine Druckfassung existiert (`@media print`, erzwingt hellen Grund, blendet
  Bedienelemente aus).
- Die Oberfläche ist durchgängig deutschsprachig; Spielbegriffe (Champion, Pick,
  Ban, Fearless, Solo/Flex) bleiben englisch.
- Daten: `teams.json` (Kader), `games.json` (Turnierpartien), `draftplan.json`
  (Blind Picks und Vorlieben), `data/raw/*.json` (op.gg-Scrape),
  `data/liga/*.json` (Liga).
- Reiter: **Spieler** (Karten mit Rang, Championtabellen, Turnierrollen),
  **Draftplan**, **Liga** (Meta nach Rollen, Seiten, Mannschaften, Rekorde),
  **Turnierspiele** (Serien und Draftkarten mit Picks und Bans).
- Eine Darstellung für die Spielerkarten. Der Umschalter „Ansicht: Liste" ist
  im Oktober-Umbau entfallen — der Nutzer hat ihn nie benutzt; die vier
  Zusatzspalten stehen seither je Karte unter „Details".

**Offen gelassen:** Ob die Einzeldatei-Architektur, die deutsche Oberfläche und
die dichte Tabellendarstellung bindend sind, wurde nicht bestätigt — sie sind
Stand der Umsetzung, keine erklärte Anforderung.

## Brand Commitments

**Keine Stilbindung.** Der Nutzer hat die frühere Festlegung auf den
Kategoriestandard der League-Statistikwerkzeuge im Oktober 2026 ausdrücklich
aufgehoben: Das Board soll eine **eigene visuelle Welt** bekommen und nicht
länger aussehen wie jedes andere Scouting-Tool.

**dpm.lol, op.gg und Porofessor/u.gg bleiben die handwerkliche Messlatte** —
nicht als Stilvorgabe, sondern als Niveau: Das Board muss mindestens so
aufgeräumt, so dicht lesbar und so verlässlich beschriftet sein wie diese.
Beobachtet an dpm.lol: Karten mit einheitlichem Radius, großzügiger Abstand
zwischen den Blöcken, Zahlen als Blickfang, Beschriftungen klein und leise,
Farbe ausschließlich semantisch.

**Der Dichtehandel vom 7. Oktober 2026.** Der Nutzer hat die Fünferreihe
ausdrücklich aufgegeben: „das ist alles zu klein und so weiter ich will das es
wirklich viel professioneller und moderner aussieht fuer den profi bereich".
Gewählt wurde **drei große Karten je Reihe statt fünf kleinen**. Damit ist die
frühere Bindung „alle vierzehn Zeilen aller fünf Starter ohne Scrollen"
hinfällig; sie gilt neu als: **drei Starter mit allen vierzehn Zeilen bei
1440×900, die übrigen zwei in der zweiten Reihe.** Gemessen am Stand vom
8. Oktober 2026: seit den Mannschaftswerten ueber den Karten sind es
**13 von 14** Zeilen bei 1440×900 (bei 1920×1080 weiter 14). Die Leiste
kostet 32 px und damit genau eine Zeile — bewusst in Kauf genommen.

**Was aus dem Anordnungsumbau unverändert bindend bleibt** (gemessen am
ausgelieferten Stand): Bedienwerk über den Daten ≤ 150 px bei 1440 px Breite
(gemessen 146), keine intern scrollende Championtabelle (gemessen 0 bei 390,
1280, 1366, 1440 und 1920 px), auf dem Handy die Reiter am unteren Rand. Eine
neue Optik darf diese Werte nicht verschlechtern.

**Technische Nebenbedingung aus demselben Umbau:** Die klebende Kopfleiste
(`header.bar`) darf **kein** `transform`, `filter` oder `backdrop-filter`
tragen — sonst hängt die auf dem Handy fest positionierte Reiterleiste
still um. Eine Milchglas-Leiste ist damit ausgeschlossen.

**Neue Mannschaften kommen von selbst ins Board** (8. Oktober 2026): Der Knopf
„Liga-Daten holen" gleicht bei jedem Lauf ab, welche Mannschaften die Liga
führt und welche in `teams.json` stehen, und übernimmt die fehlenden samt
Kader, Riot-IDs und Rollen. Von Hand geht dasselbe mit
`python liga.py --mannschaften` (nur zeigen) und `--mannschaften --eintragen`.

Zwei Fälle unterscheidet der Abgleich über die **Riot-IDs**, nicht über den
Namen: Eine Mannschaft, deren Accounts sich mit einer vorhandenen decken, ist
dieselbe unter anderem Namen — dort wird nur `ligaName`/`ligaTeamId` gesetzt,
kein Doppeleintrag angelegt. So wurde „Braunschweig eSports e.V. I" mit dem
bestehenden „… B" verknüpft (6 von 6 Accounts gleich), während die vier
Hub-Hannover-Mannschaften als echte Neuzugänge dazukamen. Der Lauf ist
wiederholbar: ein zweiter Durchgang ändert nichts.

Eine neu übernommene Mannschaft erscheint **sofort** im Board, auch ohne
op.gg-Daten — mit Riot-ID, Rolle und dem Hinweis, dass die Zahlen noch fehlen.
Vorher fiel sie beim Bauen stillschweigend heraus (`if not members: continue`),
und niemand hätte gemerkt, dass sie da ist.

**op.gg-Daten ohne Browser** (`schnell_scrape.py`, 8. Oktober 2026): op.gg
liefert die Championtabelle bereits im ausgelieferten HTML mit, eingebettet im
Next.js-Datenstrom (`self.__next_f`) unter `my_champion_stats`. Ein einfacher
HTTP-Abruf genügt — **rund eine Sekunde je Spieler statt sechzig**, ohne
sichtbares Browserfenster. Die 18 Spieler der neuen Hub-Hannover-Mannschaften
waren so in 30 Sekunden geholt.

Geliefert werden Spiele, Winrate, KDA, Kill-Participation und CS/min je
Champion, die Saisonbilanz und der Solo-Rang (aus der Meta-Beschreibung) —
also mehr Felder, als `extract.js` aus dem gerenderten Text liest.

**Was so nicht geht:** Solo und Flex getrennt sowie vergangene Seasons. Das
schaltet op.gg über Next.js-Server-Actions um, deren Kennung sich bei jedem
Deployment ändert; nachgebaut wäre das dauernd kaputt. Dafür bleibt
`auto_scrape.py` mit dem Browser zuständig. Damit der schnelle Weg nichts
zerstört, **ergänzt er nur**: Flex-Rang, Mastery, Style und ältere Seasons aus
vorhandenen Rohdaten bleiben unberührt (nachgemessen: 0 von 79 bestehenden
Spielern verändert).

Zwei Fallen, die beim Bauen auffielen: Der erste Eintrag in
`my_champion_stats` ist die **Summenzeile** der Season (`champion_id: null`,
`name: "1"`) — ungefiltert stand sie als Champion „1" mit 1203 Spielen in der
Tabelle. Und `season`/`queue` als Query-Parameter werden serverseitig
**ignoriert**; die Seite liefert immer die laufende Ranked-Season.

**Kaderabgleich gegen die Liga** (`python liga.py --kader`, 8. Oktober 2026):
prueft je Mannschaft fehlende Spieler, Umbenennungen, Rollen und Bank gegen
die Vereinsansicht. **Leitsatz: Eine ausdrueckliche Angabe der Liga gewinnt,
eine fehlende ueberschreibt nie.** Die Liga fuehrt zu vielen Spielern gar
keine Rolle — ein blinder Abgleich haette AFC1s gepflegtes `UTILITY` gegen
`UNKNOWN` getauscht. Geloescht wird nie: wer im Roster steht und der Liga
unbekannt ist, wird nur gemeldet.

**teams.json schlaegt die Scrape-Metadaten.** Bis zum 8. Oktober 2026 nahm
`build.py` Rolle und Bank aus `data/raw/*.json` — dort stehen sie so, wie sie
beim Scrapen galten. Jede Rollenaenderung im Kader blieb deshalb wirkungslos,
bis der Spieler zufaellig neu gescrapt wurde. Jetzt gewinnt der gepflegte
Kader.

**Der Kartenumbau vom 8. Oktober 2026.** Der Nutzer hat den Kopf zweimal
zurueckgewiesen — „das sieht so langweilig unprofessionell aus", dann „der
rank ist viel zu klein, denke dir allgemein eine komplette design anederung
aus" — und schliesslich einen eigenen HTML-Entwurf geliefert. Daraus wurde
die heutige Karte gebaut, mit einer ausdruecklichen Einschraenkung des
Nutzers: **Kompaktansicht bleibt Pflicht**, keine Vollbild-Spielerseite im
Raster. Der Entwurf lebt in der Grossansicht, das Raster bekommt seine
verdichtete Fassung.

- **Der Kartenkopf ist ein Hero mit Splash-Art.** Hintergrund ist das Riot-
  Splash des meistgespielten Champions, also automatisch das richtige Bild,
  sobald sich der Topchampion aendert. Gemessen **113 px** — die Vorgabe des
  Nutzers lautete 90–120. Er traegt jetzt vier Aussagen statt zweier: Rolle
  und Name, Mannschaft und Riot-ID, Rang mit LP, und den meistgespielten
  Champion mit Spielen und Winrate.
- **Rang und LP stehen nebeneinander, nicht gestapelt.** Gestapelt war der
  Rangblock 33 px hoch neben einem 22 px hohen Namen und hat die Kopfzeile um
  11 px aufgeblaeht, ohne etwas zu zeigen. Die Stufe ist dabei **groesser**
  geworden (1,15 rem), nicht kleiner — das war die urspruengliche Kritik.
- **Solo und Flex sind eine Zeile, die Winrate traegt die Farbe.** 33 px.
  Gruen ab 52 %, rot unter 48 %, sonst neutral; sonst waere jede Zahl gleich
  laut.
- **Die Turnierform ist eines von drei Kennzahlenfeldern** (Spiele, Winrate,
  Turnier), nicht mehr ein Chip. Das Turnierfeld bleibt anklickbar und zeigt
  alle Turnierpartien des Spielers. Das ist das Einzige, was kein anderes
  Werkzeug hat — es gehoert nicht hinter einen Klick.
- **Was die Hoehe gekostet hat, und woher sie zurueckkam.** Der neue Kopf hat
  die Karte von 854 auf 984 px getrieben und damit die Bindung „14 Zeilen bei
  1440×900" gerissen (gemessen: nur noch 12 sichtbar). Zurueckgeholt wurden
  55 px — **ausschliesslich ueber Abstaende und Polsterung**, nicht ueber
  Schriftgroessen: Blockabstand 0,6→0,4 rem, Zeilenpolsterung 0,3→0,26 rem,
  Tabellenkopf 0,35→0,24 rem, Hero- und Kennzahlenpolsterung, und der
  einzeilige Rang. Ergebnis: letzte Zeile bei 896 von 900 px, 14/14 sichtbar,
  vier Pixel Luft.
- **Die Tabelle hat eine Rangfolge bekommen.** Vorher sah ein Champion mit
  5 Partien genauso wichtig aus wie einer mit 107 — gemessen ein Verhaeltnis
  von 10,7:1, dargestellt 1:1. Jetzt traegt jede Zeile einen Balken in der
  Rollenfarbe, dessen Laenge die Spielzahl im Verhaeltnis zum
  meistgespielten Champion ist, und die erste Zeile ist Blickfang (36-px-Bild,
  schwererer Satz). Damit holt die Rollenfarbe zugleich die Tabelle aus dem
  Grau-in-Grau.
- **Die Winrate-Balken fuellen ihre Spalte.** Sie waren 76 px breit in einer
  141-px-Spalte; 32 px blieben tot.
- **Verworfen: ein Signatur-Streifen** mit den drei meistgespielten Champions
  als grosse Portraits vor der Tabelle. Gebaut und gemessen — er verdoppelte
  die drei obersten Zeilen direkt darunter, machte die Karte 109 px hoeher und
  druckte die sichtbaren Championzeilen von 14 auf 12. Der Blickfang gehoert
  in die Tabelle, nicht davor.
- **Die T-Spalte ist als Einstieg erkennbar.** Die Zahl sitzt in einem
  Rahmen, der beim Ueberfahren der Zeile die Akzentfarbe annimmt — vorher sah
  man der Zeile nicht an, dass ein Klick die Partien oeffnet.

**Die Matchkarte, Stand 8. Oktober 2026.** Der Nutzer hat die Spiele-Ansicht
als zu gross und zu leer beschrieben und eine Esports-Matchcard verlangt.
Gemessen: Einzelkarte **452 → 438 px**, Seitenhoehe des Reiters
**12.859 → 7.870 px** (−39 %).

- **Ergebnis zuerst.** Oben stehen beide Mannschaften mit dem Stand
  dazwischen, darunter Ausgang, Dauer und wer First Blood beziehungsweise
  First Tower hatte. Vorher musste man sich das Ergebnis aus einem Etikett
  neben der Spielnummer zusammensuchen.
- **Der Stand ist der Serienstand, nicht der Einzelspielstand.** Erste
  Fassung zeigte je Spiel 1:0 oder 0:1. Auf Hinweis des Nutzers („bei game 2
  1:1 oder 2:0 oder 0:2“) zaehlt die Karte jetzt innerhalb der Serie mit:
  Finale gegen SSV Remlingen liest sich 1:0, 1:1, 1:2. Einzelspiele ohne
  Serie behalten 1:0 / 0:1. Die Farbe folgt dem Stand, nicht dem letzten
  Spiel — bei 1:1 leuchtet keine Seite.
- **Spielerzeilen statt Portraitkacheln.** Vorher fuenf Spalten mit 72-px-
  Bildern nebeneinander. Jetzt je Spieler eine Zeile: Rolle, 32-px-Bild,
  Champion und Spieler, KDA rechts. Nur die Tode tragen Farbe.
- **Die Farbe trennt jetzt eigene von gegnerischer Mannschaft** (Orange
  gegen Cyan) statt Blue Side von Red Side. Welche Seite wer im Draft hatte,
  steht weiter als eigenes Etikett mit Farbpunkt daneben — das ist eine
  andere Aussage und darf nicht in der Teamfarbe untergehen.
  Dafuer brauchte es neue Variablen `--eigen`/`--gegner`: `--accent` ist in
  diesem Board **blau**, taugte also nicht als „AFC1-Orange“.
- **Bans sind eine Zeile**, keine zweite Pickreihe aus fuenf Bloecken.
- **Die Werte stehen im Vergleich**, nicht zweimal untereinander: `21 : 10`
  Kills, `74,2k : 63,9k` Gold und so fort; wer vorn liegt, bekommt die Farbe.
  Interessant ist der Abstand, nicht die Zahl allein.
- **Nur ein Spiel je Serie steht offen**, die uebrigen sind anklickbare
  Zeilen. Das ist der eigentliche Grund fuer die 39 % — vorher standen alle
  23 Partien als volle Karten untereinander. Der Sprung aus der
  Championtabelle klappt sein Ziel vorher auf.

**Mannschaftswerte ueber den Spielerkarten.** Elf Werte aus denselben
Turnierpartien, die der Spiele-Reiter zeigt: Partien, Winrate, Ø Dauer,
Blue/Red, First Blood, Ø Kills, Ø Gold, Ø Tuerme/Drachen/Barone.
Erste Fassung als Kennzahlen-Raster schob die Karten um 300 px nach unten
und liess von vierzehn Championzeilen noch **fuenf** sichtbar. Als Chipzeile
kostet sie 32 px. **Damit sind bei 1440×900 noch 13 der 14 Zeilen sichtbar
statt 14** — die Bindung ist um eine Zeile teurer geworden, und das ist der
Preis fuer die Mannschaftswerte. Bei 1920×1080 bleiben es 14.

**Draftplan und Liga sprechen dieselbe Sprache wie der Rest.** Beide trugen
noch den alten Kartenkopf: dunkle Schrift auf voller Rollenfarbe. Jetzt
dunkler Kopf, Rollenfarbe auf Pille und Unterkante, Name in Rajdhani-
Versalien — wie der Hero der Spielerkarte. Das behob zugleich einen
Kontrastfehler, der dort seit laengerem stand: `.sub` auf dem Orange kam auf
**4,32:1**.

**Zehn Banner waren leer - und niemand hatte es gemerkt.** `top_champions()`
in `build.py` haengte die Seasonbloecke aneinander und bestimmte daraus
*einen* Champion je Spieler. Die Karte rechnet aber je gewaehlter Queue und
Season neu zusammen (`championRows`/`seasonEntries`). Fuer zehn Spieler war
das ein anderer Champion - Smolder, Amumu, Viktor, Briar und weitere hatten
darum kein eingebettetes Splash, und ihr Banner blieb schwarz. Exakt
dieselbe Falle wie im Vorschauskript, wo das Aneinanderhaengen der
Seasonbloecke jeden Champion mehrfach gezaehlt hatte.

Der Bau rechnet jetzt jede waehlbare Kombination durch: **126 statt 65
Splashes**, und keine Karte bleibt mehr ohne Bild (nachgezaehlt). Damit das
nicht die Datei sprengt, ist **`SPLASH_PX` von 800 auf 560** gefallen - das
Bild liegt hinter einem Verlauf von 45-86 % und wird im Raster rund 190 px
breit gezeigt; im direkten Vergleich auf 1120 px gezogen ist der Unterschied
nicht auszumachen. Gemessen: 126 Splashes kosten bei 800 px **4,3 MB**
eingebettet, bei 560 px **2,6 MB**. `index.html` liegt damit bei 6.244 KB
und **3,06 MB gzip** - praktisch unveraendert gegenueber vorher, bei fast
doppelter Abdeckung. Niedrigere WebP-Qualitaet half nicht: ein bereits
komprimiertes WebP neu zu codieren sparte von q72 auf q48 nur 0,9 MB.

**Das Rangemblem steht wieder auf der Karte.** Beim Umbau zum Hero war der
Rang auf Text zusammengeschrumpft; Emblem gab es nur noch in der
Grossansicht. Jetzt 22 px neben der Stufe, und weil beides auf dem Splash
liegt, auf einer schmalen dunklen Platte - bei hellen Bildern wie Smolder
oder Ashe trug der Textschatten allein nicht mehr.

**Der Draft-Berater, Stand 8. Oktober 2026.** Der Nutzer fragte nach etwas
wie draftgap.com. Eine Anbindung im eigentlichen Sinn gibt es nicht - aber
DraftGap (MIT, `github.com/vigovlugt/draftgap`) stellt seine aus lolalytics
aufbereiteten Datensaetze offen bereit, und die lassen sich beim Bauen
ziehen wie op.gg und Data Dragon auch. Die fertige Datei bleibt offline.

Eingetragen werden die fuenf gegnerischen Picks und, soweit schon bekannt,
die eigenen. Je Starter zeigt das Board dann die fuenf besten Champions
**aus seinem eigenen Pool** - der Pool ist die Schranke, denn was niemand
spielt, hilft im Draft nicht. Daneben steht, warum: die gemessene Quote
gegen jeden eingetragenen Gegner und mit jedem eigenen Pick.

- **Gemessen, nicht hochgerechnet.** Ein erster Versuch rechnete nach
  DraftGaps Elo-Verfahren: Grundquote plus die Abweichung jedes der fuenf
  Matchups. Ergebnis: **jeder** Champion landete unter 50 %. In jeder
  einzelnen Matchup-Quote steckt die Staerke des Gegners bereits mit drin,
  und sie wurde so fuenfmal gezaehlt. Gezeigt wird jetzt der nach Partien
  gewichtete Schnitt der tatsaechlich gemessenen Quoten - jede Zahl auf dem
  Schirm ist eine gemessene Zahl.
- **Nebenrollen fliegen raus.** Der erste Vorschlag fuer den Toplaner war
  **Ahri** - sie hat 7.691 Partien auf Top, gemessen an ihren 236.000 auf
  Mid ist das Rauschen. Eine Rolle zaehlt jetzt erst ab einem Zwanzigstel
  der Partien des Champions und ab 1.000 Partien.
- **Pool-Untergrenze 10 Spiele.** Wer einen Champion fuenfmal gespielt hat,
  packt ihn im Turnier nicht aus.
- **Matchups ab 50 Partien.** Darunter ist eine Quote Rauschen - und sie
  kostet Platz: mit 20 als Grenze waere der Auszug 2,1 MB gzip statt 1,6.
  Die Schluessel sind Nummern statt Namen; "Dr. Mundo" stuende sonst
  hunderttausendfach in der Datei und kostete ein weiteres Drittel.

**Was es kostet:** `index.html` waechst von 6.244 auf **12.099 KB**, ueber
die Leitung von 3,06 auf **4,71 MB**. Der Nutzer hat diese Variante nach
gemessenen Zahlen ausdruecklich gewaehlt (Alternativen waren: nur Matchups
+1,2 MB, nur Patch-Staerke +7 KB, oder ganz ohne Fremddaten).

**Die Rangplatte steht unten rechts, nicht oben.** Am gebauten Vergleich
entschieden. Mein Einwand war, dass der Rang damit unter den
meistgespielten Champion rutscht und die Kopfzeile leer wirkt; der Nutzer
hat sich beide Varianten angesehen und sich fuer unten entschieden. Ein
Nebeneffekt ist gut: die Kopfzeile traegt jetzt allein den Namen, und der
bekommt die Breite zurueck, die ihm die Platte auf schmalen Karten genommen
hatte.

**Vom Berater zum Live-Draft-Assistenten, 8. Oktober 2026.** Der Nutzer hat
den Draft-Berater konzeptionell zurueckgewiesen: er beantwortete
„was hat dieser Spieler frueher oft gespielt“, gebraucht wird aber
„was kann und soll er JETZT picken“. Daraus sind zwei getrennte Ebenen
geworden - der Spieler-Reiter bleibt die Historie, ein **eigener Reiter
„Live Draft“** ist das Werkzeug fuer die laufende Partie.

- **Draftboard.** Beide Mannschaften nebeneinander, je fuenf Banfelder und
  fuenf Pickfelder in Lanereihenfolge, bei uns mit dem Spielernamen daneben.
  Alles eintippbar; das fokussierte Pickfeld ist das Ziel des Picken-Knopfs.
- **Sperrleiste.** Drei Gruppen mit Grund: Fearless gesperrt, gebannt, schon
  gepickt. Gesperrte Champions verschwinden aus den Empfehlungen - sie
  stehen unter dem Filter „Gesperrt“ mit Begruendung, aber ohne
  Picken-Knopf.
- **Breite Liste statt Top 5.** Auf Top sind rund 90 Champions waehlbar,
  gegliedert in Beste Treffer, Dein Pool, Alternativen und Selten gespielt.
  Ein Champion darf oben als bester Treffer und unten im eigenen Pool
  stehen - das sind zwei verschiedene Fragen.
- **Selten gespielte fallen nicht mehr raus.** Grundlage ist nicht mehr der
  eigene Pool, sondern **jeder Champion, der auf dieser Rolle im laufenden
  Patch gespielt wird**. Erfahrung ist einer von mehreren Faktoren, nicht
  die Eintrittskarte.

**Der Match-Score, und warum er nachvollziehbar ist.** Null bis hundert aus
bis zu sechs **benannten** Teilen, die unter jeder Karte einzeln stehen:
Patch-Staerke der Rolle, Draft-Fit (gemessene Quoten gegen die
eingetragenen Gegner und mit den eigenen Picks), Erfahrung des Spielers,
eigene Winrate (erst ab zehn entschiedenen Partien), Mischung (Anteil
magischen Schadens gegenueber der bisherigen eigenen Aufstellung) und
Draftplan. **Fehlt ein Teil, faellt er aus Summe UND Hoechstwert** - er wird
nicht geschaetzt, und der Rest wird nicht heimlich schwerer. Ohne
Gegnerpicks sagt die Liste das ausdruecklich.

**Drei Klassenkollisionen** sind dabei aufgetreten und waren im Bild sofort
sichtbar: mein Modifier `ban` traf die Ban-Kachel der Matchkarte (roter
Diagonalstrich quer durch die Sperrleiste, erzwungene 24x24), mein Modifier
`pick` traf meinen eigenen Picken-Knopf (Rahmen und Versalien um die
Pickliste), und die Rollenleiste zeigte „Top“, waehrend die Liste
Support fuehrte, weil der Fokus in einem Pickfeld die aktive Rolle
verschiebt, die Leiste aber nicht mitgezeichnet wurde.

**Drei Nachbesserungen nach dem ersten Lauf.** Der Gegnername kam aus der
gewaehlten Fearless-Serie - dadurch stand dort dauerhaft „SSV Remlingen“,
auch mit abgeschaltetem Fearless. Er ist jetzt ein eigenes Feld; die Serie
fuellt es nur vor, wenn es leer ist. Der Picken-Knopf setzte den Feldwert,
aber `champField` zeichnet seine Vorschau nur auf `input`/`change` - das
Icon blieb leer, bis jemand tippte. Und neu dazu: eine **Zusammenfassung
beider Aufstellungen** mit Schadensmischung je Seite und der nach Partien
gewichteten Quote ueber alle gemessenen Paarungen zwischen den Comps
(„48,5 % für AFC1 aus 5 gemessenen Paarungen“) - wieder keine
Hochrechnung auf eine Teamstaerke, sondern das, was diese Champions
gegeneinander geholt haben. Die Schadensleiste war zuerst grau/blau und sah
bei 7 px Hoehe durchgehend gefuellt aus; sie ist jetzt blau gegen gold.

**Was bewusst fehlt. Die Spezifikation nennt Faktoren, fuer die es keine
Datenquelle gibt - Flexibilitaet eines Champions, Pick-Reihenfolge,
Ban-Empfehlungen. Die sind nicht erfunden worden. Das Schadensprofil war
dagegen im DraftGap-Datensatz schon vorhanden und kostet neun KB; damit
beantwortet „Mischung“ die Frage nach der Zusammensetzung mit
gemessenen Zahlen.

**Die Draft-Engine zieht aus `template.html` aus, 9. Oktober 2026.**
Phase 1 eines groesseren Umbaus zum Live-Draft-Entscheidungssystem. Die
Engine lag in `template.html` mit der Darstellung verflochten und war
ausserhalb eines Browsers nicht pruefbar. Jetzt liegt sie in `engine/`
als reine Module: Node laedt sie fuer Tests, `build.py` fuegt sie beim
Bauen ein. Die Einzeldatei-Auslieferung bleibt unberuehrt. Siehe
`engine/README.md`.

Dazu neu:

- **Ein Draftzustand.** Vorher drei - `liveStand`, das Spielformular und
  die Partienliste, jede kannte einen Teil. `engine/state.js` haelt ihn
  einmal, mit Zugfolge und Cache-Schluessel.
- **Jeder Wert traegt seine Herkunft** `{value, source, patch,
  sampleSize, confidence}`. Konfidenz waechst mit der Stichprobe und
  saettigt bei 2.000 Partien; eine Quote aus 43 Partien zaehlt gar nicht.
- **Die Skalierungskurve ist eingebettet.** `statsByTime` aus den
  DraftGap-Daten: fuenf Eimer nach Spieldauer je Rolle. Kayle 43 % -> 58 %,
  Pantheon 52 % -> 47 %. Damit sind Skalierung und Frueh-/Mittel-/
  Spaetspiel **gemessen** statt behauptet. Kosten 62 KB roh.
- **Die Heuristiktabelle** `data/champion-heuristik.json` haelt zwoelf
  strukturelle Achsen (Engage, Peel, Frontline, Poke, Dive, Catch,
  Disengage, Siege, Splitpush, Teamfight, Objective, Scaling), fuer die
  es **keine Datenquelle** gibt. Sie wird von Hand gepflegt, traegt die
  eigene Quelle `heuristik` mit fester Konfidenz 0,45 und darf nirgends
  als Statistik auftreten. Bewusst **nicht** aus Data Dragon abgeleitet -
  das saehe genauer aus, als es waere.
- **28 Tests** unter Nodes eingebautem Laeufer, ohne Abhaengigkeiten. Die
  Datentests lesen die echte `index.html`.

**Phase 2: die Merkmalsschicht.** `engine/features.js` buendelt alles,
was nur von Champion, Rolle und Patch abhaengt - Patchstaerke,
Rollenverteilung, Flexgrad, Schadensanteil, Skalierungskurve und die
daraus abgeleiteten Phasen frueh/mittel/spaet. Gecacht, weil es fuer
einen Patch konstant ist. Matchups und Synergien gehoeren NICHT dorthin:
sie haengen am Draftzustand, und ein Cache darueber waere eine Luege.

`engine/team.js` rechnet den Komfort aus drei Belegen, die nicht dasselbe
sagen: Partien (logarithmisch), eigene Quote (erst ab zehn entschiedenen
Partien) und Draftplan. Erfahrung und Ansage werden **nicht addiert** -
wer einen Champion blind pickt, hat ihn meist auch gespielt; addieren
zaehlte dieselbe Aussage zweimal.

Gemessen: 342 Merkmalsbuendel in 3,0 ms, 8.700 Paarabfragen in 1,9 ms.
Die Zielmarke von 250 ms hat reichlich Luft. **44 Tests.**

**Phase 3: die Aufstellung, und was ein Pick ihr hinzufuegt.**
`engine/comp.js` beantwortet die Frage, auf die es im Draft ankommt -
nicht "wie gut ist Champion X", sondern "wie viel besser wird UNSERE
Aufstellung mit X". Ein starker Champion, der nichts beitraegt, was
fehlt, ist der schlechtere Pick als ein mittelmaessiger, der eine Luecke
schliesst.

An echten Daten, ohne jede Heuristik: zu Malphite und Amumu (75 %
magischer Schaden, Balance 0,85) rangiert die Schicht Talon, Yasuo und
Zed vor Ahri, Syndra und Veigar - weil ein weiterer magischer Champion
die Aufstellung billig konterbar macht. Das kommt aus dem gemessenen
Schadensprofil, nicht aus einer Behauptung.

- **"Skaliert besser" gibt es nur relativ.** Ohne Gegenueber ist das
  keine Aussage; `phasenVorteil` liefert nur etwas, wenn beide Kurven
  belegt sind, und der Marginalwert laesst die Kurvenachse ohne Gegner
  weg. Gegen die Beispielaufstellung steht unser Paar frueh +3,0 und
  spaet -1,1 - daraus folgt ein Plan, nicht aus einem absoluten Urteil.
- **Zwei Schwellen fuer dieselbe Achse.** Fuers Anzeigen braucht eine
  Heuristikachse zwei gepflegte Picks, sonst ist sie eine Aussage ueber
  einen Champion. Fuer eine DIFFERENZ gilt das nicht - sonst verschwaende
  sie genau dann, wenn der Kandidat sie erst belegbar macht. Ein Test
  hat das aufgedeckt.
- **Jeder Marginalwert nennt `anteilGemessen`** - wie viel der Aussage
  auf Messungen beruht statt auf Einschaetzung.

**58 Tests.**

**Phase 4: der Match-Score.** `engine/score.js` fuehrt die Teile zu einer
Zahl zusammen und gibt die Spur dahin mit zurueck - was hat beigetragen,
wie viel, woher kam es, wie sicher ist es. Eine Empfehlung ohne
sichtbaren Grund ist ein Orakel.

**Zwei Kalibrierungsfehler, die erst die Messung gezeigt hat:**

- Die Teile ueberlappten sich. `compFit` traegt Schadensbalance, Kurve
  und Rollenabdeckung bereits; sie standen zusaetzlich einzeln in den
  Gewichten und zaehlten damit doppelt. Jetzt nur noch in `compFit`.
- Die Bezugsgroesse fuer Matchup und Synergie war falsch. An der eigenen
  Patchstaerke gemessen lag die Synergiequote ueber 87 Topkandidaten im
  Median **+2,17 Punkte** und die Matchupquote **-2,10 Punkte** - beide
  Komponenten saettigten und unterschieden gar nichts. Der Grund ist die
  Lage, nicht der Champion: mit Jinx und Thresh zu spielen ist fuer jeden
  besser, gegen Ornn und Wukong fuer jeden schlechter. Richtig ist die
  Erwartung aus dem **Gegenueber**: Ornns eigener Matchupschnitt von
  51,1 % heisst, ein beliebiger Gegner kommt gegen ihn auf 48,9 %. Damit
  liegt der Median bei -0,05 beziehungsweise -0,29, und die Streuung
  traegt die Aussage.

**Konterbarkeit ist messbar.** Die Standardabweichung der Matchupquoten
ueber alle Lanegegner: Lee Sin 1,49, Ornn 2,49, Malphite 3,83, Kassadin
5,83, Neeko 6,62. Ein enger Wert heisst "steht gegen fast jeden gleich" -
der sichere Blindpick. Die Schwellen sind an der Verteilung ueber alle
342 Champion-Rollen-Paare geeicht, nicht geschaetzt. Steht der Lanegegner
schon, faellt der Teil weg: dann ist die echte Paarung gemessen, und die
Streuung noch einmal zu werten waere dieselbe Aussage zweimal.

**Komfort hat einen Deckel.** Er darf hoechstens ein Viertel des Ganzen
ausmachen (`KOMFORT.hoechstanteil`) - daempfen ja, ueberstimmen nein.

**Keine Turnierdaten in der Bewertung.** Auf Wunsch des Nutzers kommt die
Staerke eines Champions aus dem Patch, nicht aus unseren eigenen Spielen:
die sagen, was jemand im Draft bekommen hat, nicht was er kann. Der
Komfort kommt aus op.gg Ranked und nennt das im Text; die Queue LIGA ist
als Komfortbeleg gesperrt und wirft einen Fehler. Die einzige Stelle, die
auf vergangene Partien schaut, ist die Fearless-Sperre - und das ist die
Spielregel, kein Staerkeurteil. Fuenf Tests halten es fest.

**80 Tests.** 87 Kandidaten in 23 ms bewertet.

**Phase 5: vorausschauen.** `engine/search.js` fragt, was der Gegner
antwortet und wie wir danach stehen - unser Kandidat, wahrscheinliche
Antwort, unsere beste Erwiderung. Tiefer nicht: das Gegnermodell ist eine
Schaetzung, und in der dritten Lage waere davon nichts mehr uebrig.

**Ein Irrweg, den erst die Messung aufgedeckt hat.** Als Zustandswert
diente zuerst die Note unserer besten naechsten Wahl. Die wird aber von
DEREN Patchstaerke beherrscht und haengt kaum daran, was wir gerade
gepickt haben: in jeder Verzweigung gewann Rammus mit konstant 79
Punkten. Der Lookahead addierte ueberall dasselbe und unterschied nichts.
Jetzt traegt die gemessene Quote der Aufstellungen den Wert - sie bewegt
sich nur um Zehntelpunkte (Vex 51,56 % gegen Malzahar 51,19 %), weil ein
Pick von fuenf auch nicht mehr bewegen SOLL. Die Komponente wird darum
ueber die Vorauswahl normiert: sie ordnet diese Kandidaten, statt eine
absolute Siegchance zu behaupten.

**Laufzeit:** schlimmster Fall 168 von 250 ms (drei gegen drei). Zwei
Deckel halten das - der innere Kreis ist global begrenzt statt je Rolle,
und der Gegnervorrat wird vorgefiltert, bevor er bewertet wird. Ohne
beides hing die Laufzeit daran, wie frueh im Draft man steht.

**Phase 6: der Backtest - und sein unbequemes Ergebnis.**

| | n | Treffer | Brier |
|---|---|---|---|
| Modell (Comp-Quote) | 68 | 54,4 % ± 11,8 | 0,2495 |
| nur Patchstaerke | 68 | 57,4 % ± 11,8 | 0,2493 |
| Muenzwurf | 68 | - | 0,2500 |

**Das Modell schlaegt den Muenzwurf nicht nachweisbar.** Das
95-Prozent-Intervall reicht von 42,6 bis 66,2 % und schliesst 50 % ein.
Die simple Grundlinie "wer hat die staerkeren Champions" ist sogar
minimal besser; bei 68 Partien ist beides nicht unterscheidbar.

Das ist kein Grund, das Modell wegzuwerfen, aber einer, es nicht zu
ueberschaetzen. Der Ausgang eines Uniliga-Spiels haengt vor allem an
Spielstaerke, Form und Ausfuehrung - der Draft erklaert davon einen
kleinen Teil. Ein Modell, das aus dem Draft allein 70 % traefe, waere
verdaechtig, nicht gut. Die Richtung stimmt immerhin: im Eimer 48-50 %
traten 47,4 % ein, im Eimer 50-52 % dann 52,0 %. Und das Modell gibt sich
zurueckhaltend - es sagt nie mehr als 52,9 % oder weniger als 47,3 %.

**Was der Backtest nicht pruefen kann:** games.json hat keine
Pick-Reihenfolge. Lookahead und Pickfolge bleiben ungeprueft. Dafuer
schreibt `engine/log.js` ab Phase 7 mit, was in echten Drafts empfohlen
und was gepickt wurde - ohne Namen, ohne Konten. Erst zaehlen, dann
deuten: ein Modell auf dreissig Eintraegen zu trimmen waere schlimmer als
keines.

**102 Tests.**

**Phase 7: der Reiter rechnet nicht mehr selbst.** `build.py` ersetzt
einen vierten Platzhalter `__ENGINE__`; der Buendler haengt die elf Module
in Abhaengigkeitsreihenfolge aneinander, streicht import und export und
packt sie in eine Klammer (88 KB). Zwei Wachhunde brechen den Bau ab,
bevor etwas still schiefgeht: doppelte Namen auf oberster Ebene - davon
gab es drei - und nicht erkannte import/export-Zeilen.

Neu sichtbar im Reiter: **Konfidenz** je Empfehlung, die vollstaendige
**Erklaerungsspur** mit Beitrag je Teil (geschaetzte Teile gestrichelt
umrandet), die **Vorausschau** mit Robustheit, und die **Herkunft im
Text** ("67 Partien · 54 % aus 67 (RANKED S33)").

**Und die Warnung steht an der Empfehlung**, nicht im Kleingedruckten:
der Backtest kann nicht zeigen, dass das Modell besser trifft als ein
Muenzwurf. Die Begruendungen darunter sind gemessen, die Rangfolge ist
ein Vorschlag. Eine Oberflaeche, die 76 Punkte zeigt und verschweigt, was
die Zahl wert ist, waere unehrlich.

Gemessen im Browser: eine volle Rangliste 141 ms, beim zweiten Mal aus
dem Cache. `index.html` 12.287 KB, **4,76 MB gzip**.

**Zwei Rueckmeldungen aus dem ersten Gebrauch, 10. Oktober 2026.**

*"Zu sehr auf die Vorlieben des Spielers geschnitten, ich sehe kaum
gruen."* Die Messung gab halb recht: Komfort trug im Schnitt nur 2,0
Punkte, bei gespielten Champions aber bis +14 - er wirkte wie ein
Schalter. Beide naheliegenden Korrekturen waren falsch, und beide
gemessen: eine belegte 0 gab 14 Punkte Abzug dafuer, dass wir nichts
wissen; den Teil wegfallen zu lassen liess den Hoechstwert mitschrumpfen,
und ploetzlich waren fuenf der sechs besten Vorschlaege nie gespielt.
Richtig ist dazwischen - 0,15 bei Konfidenz 0,25, "moeglich, aber
ungeuebt". Dass jemand einen Champion in dieser Season nicht gespielt
hat, ist echte schwache Information, nicht fehlende.

Und das Gruen: die Schwellen standen bei 70 und 55, bei einer Verteilung
mit Median 43. Jetzt 60 und 50, geeicht ueber 310 Kandidaten in vier
Draftlagen - 9 % gruen, 19 % orange. Die Sterne hingen an Punkte/20,
fuenf Sterne haette es erst ab 90 gegeben.

*"Ich kann die fertige Draft nicht voruebergehend speichern."* Stimmte:
Fearless kannte nur Serien aus games.json, also nur Eingetragenes.
Waehrend einer laufenden Bo3 nuetzt das nichts. Jetzt gibt es **Spiel
merken**: die zehn Picks wandern in die Serie, das Brett wird frei, und
der naechste Draft sperrt sie. Gemerkt wird im Browser - ein
Zwischenstand fuer den Abend, kein Ergebnis; eingetragen wird weiterhin
ueber den Reiter Turnierspiele. Gemerkte Spiele lassen sich einzeln
wieder entfernen, und die Serienauswahl steht jetzt auf "nur gemerkte
Spiele": vorher zog sie ungefragt die zuletzt gespielte Serie mit hinein.

*"Warum sehe ich nicht, wie gut Wukong gegen Jarvan waere?"* Die
Paarung WAR gerechnet - Wukong Jungle gegen Jarvan IV 52,8 % aus 12.083
Partien, erwartet 50,9, also +1,9 Punkte. Die Schwelle fuers Nennen lag
bei 2,0. Damit sah "nicht gezaehlt" genauso aus wie "unauffaellig", und
das ist der schlechteste Zustand fuer eine Erklaerung. Jede Karte zeigt
jetzt ALLE eingetragenen Paarungen als Chips mit Quote und Abstand zur
Erwartung; eine ohne Daten steht gestrichelt mit "-" da, statt zu fehlen.

**Mein Kontrastpruefer hatte die dritte blinde Stelle.** `color-mix()`
liefert `color(srgb 0.88 0.92 0.92)` - Anteile von 0 bis 1. Der Pruefer
las sie als 0 bis 255, hielt die gruen getoente Karte fuer fast schwarz
und meldete acht Verstoesse, die keine waren. Dahinter lag genau einer:
kleine gruene Schrift kam auf der Toenung in Hell auf 4,34:1 und hat
jetzt einen eigenen, dunkleren Ton.

**Die Regel, die das Modell ehrlich haelt:** fehlt ein Wert, faellt er aus
Summe UND Hoechstwert. Er wird nicht geschaetzt, und der Rest wird nicht
heimlich schwerer.

**Was der Audit ergeben hat.** Der Partienkorpus ist besser als gedacht:
68 vollstaendige Spiele mit Seite, Sieger, allen zehn Picks samt Rollen
und Bans. **Aber ohne Pick-Reihenfolge** - ein "was waere an Pick 4
richtig gewesen" laesst sich damit nicht nachspielen. Backtesten laesst
sich der Endzustand gegen das Ergebnis; bei 68 Stichproben mit breiten
Fehlerbalken.

## Technische Merkposten

**Die Dateigröße ist kleiner, als sie aussieht.** `index.html` wiegt roh rund
3,3 MB, über die Leitung sind es aber **rund 1,0 MB** — GitHub Pages liefert
gzip aus (30 % der Rohgröße). Wer hier sparen will, spart an der falschen
Stelle.

**`RANKED` ist nicht die Summe aus `SOLO` und `FLEX`.** Der Block kostet
711 KB und sieht nach einer leichten Einsparung aus: zur Laufzeit aus den
beiden anderen Listen zusammenrechnen. Geprüft über alle 7471 RANKED-Zeilen
weichen **320 (4,3 %)** von der Summe ab — op.gg bildet `RANKED` anders. Die
Optimierung erzeugt stillschweigend falsche Winrates und ist deshalb
gestorben. Nicht erneut versuchen.

**`NORMAL` ist seit Oktober 2026 nicht mehr eingebettet** (48 KB): Die Queue
taucht in keinem Umschalter auf, die Daten reisten umsonst mit.

## Evidence on Hand

Echte Daten, keine Platzhalter: 86 Spieler in 10 Mannschaften, 66 Turnierpartien
mit vollständigen Picks, Bans und Aufstellungen, 101 verifizierte Riot-IDs aus
der Liga, ligaweite Statistiken über 66 Partien, dazu Soloqueue-Championpools
über drei Seasons.

**Seit dem 8. Oktober 2026 auch die Partiezahlen** (sie lagen schon im
Zwischenstand der Liga, erreichten das Board aber nicht): je Spieler KDA, CS,
Gold, Schaden ausgeteilt und eingesteckt, Visionswertung und Level; je
Mannschaft Türme, Drachen, Barone, Herolde, Inhibitoren sowie First Blood und
First Tower; je Partie die Spieldauer und die Auszeichnungen der Liga. Auf der
Draftkarte stehen KDA und die Objektzeile, der Rest hängt im Tooltip der
Kachel. Von Hand eingetragene Spiele haben diese Zahlen nicht — die
Darstellung kommt ohne sie aus und behauptet keine Null.

Nicht vorhanden und nicht zu erfinden: Draft-/Pick-Reihenfolge (weder Riot noch
die Liga geben sie heraus — nur die Ban-Reihenfolge je Mannschaft ist erhalten).

**Die Championzeile ist eine Tuer** (8. Oktober 2026): Ein Klick auf eine
Zeile in der Spielerkarte zeigt alle Turnierpartien dieses Spielers mit diesem
Champion — und laesst sich auf alle Partien der Liga mit diesem Champion
umschalten, egal von wem gespielt. Von dort fuehrt ein Klick weiter auf die
Draftkarte der Partie; liegt sie bei einer anderen Mannschaft, wechselt das
Board die Mannschaft mit. Tastatur: je Tabelle ein Tabstopp, Pfeile wandern,
Enter oeffnet.

**Steckbrief je Mannschaft** (8. Oktober 2026): Der Liga-Reiter zeigt zur oben
gewählten Mannschaft, was sie pickt, was sie bannt, womit sie den ersten Ban
setzt, was sie **gegen uns** tut und wie die Bilanz gegen jeden Gegner steht.
Bei einer eigenen Mannschaft kippt die Blickrichtung auf „Gegner bannen gegen
uns". Gerechnet wird im Browser aus `games`, nicht im Build — der Datenblock
wächst nicht, und im Browser eingetragene Spiele zählen sofort mit.

Die „gegen uns"-Zeilen tragen ihren Nenner im Klartext („aus 5 Partien gegen
AFC1") und werden unter drei Partien gedämpft dargestellt. Grund: Die Dichte
schwankt stark (SC Victoria 6, SSV Remlingen 5, TSV Salzgitter 1). Ein Ban aus
einer Partie ist eine Beobachtung, keine Tendenz — und als Prozentwert wäre er
eine Lüge in Zahlenform.

**Turnierform je Spieler** (8. Oktober 2026): Unter „Details" auf der
Spielerkarte stehen Partien, KDA, CS/min, Schaden/min und Vision aus den
Turnierpartien — **jeweils neben dem Ligaschnitt derselben Rolle**, der schon
als `ligaGesamt.rollen` in der Seite lag und bis dahin nie gelesen wurde. Ohne
diesen Vergleich sagt „8,7 CS/min" nichts. Maßgeblich ist die **häufigste**
Rolle des Spielers, nicht die erstbeste gefundene — sonst würde ein einmaliger
Aushilfseinsatz gegen den Schnitt einer fremden Rolle verglichen.

## Product Principles

1. **Der entscheidende Moment ist der Draft.** Alles andere darf länger dauern,
   das Auffinden einer Championzeile nicht.
2. **Gemessenes und Geschätztes bleiben unterscheidbar.** Was aus den Partien
   stammt, was aus Soloqueue und was abgeleitet ist, muss am Board ablesbar
   bleiben — das Board behauptet nie mehr, als die Daten hergeben.
3. **Zwei Quellen, ein Bild.** Soloqueue-Form und Turnierrealität gehören
   nebeneinander, nicht in getrennte Welten.
4. **Dichte ist Funktion, nicht Sparsamkeit.** Ein Championpool hat 20 bis 60
   Zeilen; die Darstellung muss damit umgehen, ohne zu zerfallen.
5. **Es gehört dem Team.** Kein fremdes Publikum, keine Verkaufsfläche — die
   Oberfläche darf Fachsprache voraussetzen.

## Accessibility & Inclusion

Kein produktspezifischer Standard festgelegt. Stand der Messung vom
7. Oktober 2026 (im Browser, WCAG-Relativhelligkeit, beide Themes, alle vier
Reiter): **3342 Textelemente je Theme, keines unter der Schwelle** — die
früher notierten `--ink-faint`-Verstöße sind behoben. `<main>` umschließt alle
vier Reiterpanels, `<nav>` trägt die Bedienleiste, 18 `aria-label` und vier
`aria-labelledby` sind gesetzt, die Reiter folgen dem ARIA-Muster mit
rovierendem Tabindex.

Der statische Detektor meldet weiterhin elf `low-contrast`-Treffer. Sie sind
**Fehlalarme**: Er paart das `--ink: #000` der Druckfassung mit den dunklen
Flächen des dunklen Themes und dessen `--ink: #f2f5f9` mit dem Weiß des
Drucks. Diese Kombinationen können nicht gleichzeitig auftreten — der Druck
erzwingt hellen Grund.
