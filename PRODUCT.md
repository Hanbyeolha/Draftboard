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
1440×900, die übrigen zwei in der zweiten Reihe.**

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

**Die Spielerkarte, Stand 8. Oktober 2026.** Drei Aenderungen am Kopf, alle
bei gleicher Kartenhoehe (863 px, davon 62 % Championtabelle):

- **Solo traegt, Flex steht daneben.** Vorher zwei gleich grosse Rangbloecke;
  beim Scouting zaehlt fast immer Solo. Flex ist jetzt eine rechtsbuendige
  Nebenzeile auf derselben Hoehe.
- **Die Turnierform steht auf der Karte**, nicht mehr unter „Details":
  `Turnier 21 · 52%  KDA 1.79 (Liga 2.14)`. Das ist das Einzige, was kein
  anderes Werkzeug hat — es gehoert nicht hinter einen Klick. Der Chip ist
  anklickbar und zeigt alle Turnierpartien des Spielers mit Champion, Gegner
  und KDA. Ohne Turnierpartien faellt er weg.
- **Der Kartenkopf traegt zwei Objekte statt einer Zeile.** Gemessen waren
  **56 % des Rollenfarbfelds leer** (Inhalt endete bei 184 von 456 px),
  waehrend der Rang als duenne Zeile darunter stand. Jetzt: links Rollentag
  und Name, rechts ein **Rangschild** mit 40-px-Emblem, Stufe in 1,25 rem
  (so gross wie der Name), Division als kleinerer Zusatz und LP darunter.
  Das Schild hebt sich mit `rgba(0,0,0,.16)` ab — dieselbe Abdunklung auf
  jeder Rollenfarbe. Damit steht „wer" und „wie stark" in einer Aussage,
  wie es die STORY-Zeile des Richtungsvertrags verlangt. Darunter bleibt nur
  die Feinheit: LP-Bilanz, Flex, op.gg.
  Der Kopf richtet seit dieser Aenderung **mittig** aus, nicht an der
  Grundlinie — neben einem 40-px-Objekt haengt ein Name sonst schief.
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
