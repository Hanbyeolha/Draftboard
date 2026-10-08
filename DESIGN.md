---
name: Draft-Scouting AFC1
description: Scouting- und Draftboard einer Uni-League als Esport-Übertragung — dunkle Bühne, Rollenfarbe als Fläche, Zahlen aus drei Metern lesbar.
colors:
  ground: "#0b0d12"
  surface: "#151922"
  surface-sunk: "#10141b"
  border: "#242a36"
  border-strong: "#39404f"
  ink: "#f2f5f9"
  ink-muted: "#a3adbd"
  ink-faint: "#8f99a9"
  accent: "#5aa2ff"
  accent-ink: "#0b0d12"
  blue: "#5aa2ff"
  red: "#ff6b5e"
  brass: "#e0b44f"
  good: "#46cf8b"
  warn: "#e0b44f"
  warn-soft: "#2b2411"
  blue-soft: "#141f33"
  red-soft: "#2b1715"
  role-top: "#ff8a4c"
  role-jgl: "#3ddbc8"
  role-mid: "#b492ff"
  role-bot: "#ff6b85"
  role-sup: "#ffd45e"
  role-ink: "#10131a"
  seiten-ink: "#10131a"      # hell und im Druck "#ffffff"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  name:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.01em"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 700
    letterSpacing: "-0.005em"
  hero-number:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 700
    lineHeight: 1.15
    fontFeature: "tabular-nums"
  support-number:
    fontFamily: "Source Sans 3, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    fontFeature: "tabular-nums"
  body:
    fontFamily: "Source Sans 3, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums"
  table-header:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    letterSpacing: "0.06em"
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 700
    letterSpacing: "0.1em"
  mono:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.78rem"
    fontWeight: 400
  mono-lang:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.84rem"
    fontWeight: 400
  subheading:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
rounded:
  inner: "3px"
  xs: "2px"
  sm: "4px"
  tile: "6px"
  md: "10px"
  icon: "50%"
  pill: "99px"
spacing:
  hair: "0.1rem"
  xxs: "0.25rem"
  xs: "0.35rem"
  sm: "0.45rem"
  md: "0.6rem"
  lg: "0.7rem"
  xl: "1rem"
  xxl: "1.2rem"
  page: "1.5rem"
components:
  card-head-role:
    backgroundColor: "{colors.role-top}"
    textColor: "{colors.role-ink}"
    typography: "{typography.name}"
    rounded: "{rounded.md}"
    padding: "0.6rem 1rem 0.55rem"
  card-head-bench:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.name}"
    rounded: "{rounded.md}"
    padding: "0.6rem 1rem 0.55rem"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.9rem 1rem 1rem"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0.45rem 1rem"
  button-ghost:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "0.3rem 0.7rem"
  button-ghost-hover:
    textColor: "{colors.ink}"
  button-text-delete:
    backgroundColor: "transparent"
    textColor: "{colors.red}"
    rounded: "{rounded.xs}"
    padding: "0.1rem 0.3rem"
  tab:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.xs}"
    padding: "0.45rem 1.1rem"
  tab-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.xs}"
    padding: "0.45rem 1.1rem"
  switch-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "0.35rem 0.85rem"
  switch-button-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.md}"
    padding: "0.35rem 0.85rem"
  input-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.35rem 0.6rem"
  role-pill-on-field:
    backgroundColor: "rgba(255, 255, 255, 0.22)"
    textColor: "{colors.role-ink}"
    typography: "{typography.table-header}"
    rounded: "{rounded.xs}"
    padding: "0.1rem 0.45rem"
  chip:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.xs}"
    padding: "0.15rem 0.5rem"
  chip-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    rounded: "{rounded.xs}"
    padding: "0.15rem 0.5rem"
  badge-win:
    backgroundColor: "{colors.good}"
    textColor: "{colors.surface}"
    rounded: "{rounded.xs}"
    padding: "0.12rem 0.4rem"
  badge-loss:
    backgroundColor: "{colors.red}"
    textColor: "{colors.surface}"
    rounded: "{rounded.xs}"
    padding: "0.12rem 0.4rem"
  hinweis-marke:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.2rem 0.55rem"
---

# Design System: Draft-Scouting AFC1

## Overview

**Creative North Star: "Die dunkle Bühne"**

Das Board sieht aus wie die Grafik, vor der dieses Publikum ohnehin sitzt — die
Übertragung eines Profispiels. Der Grund ist eine fast schwarze Bühne
(`--ground: #0b0d12`), die Karten liegen darauf als beleuchtete Flächen: ein
Innenlicht an der Oberkante, darunter ein weicher Schlagschatten. Was aus drei
Metern gelesen werden muss, ist groß und schwer; was nur beim Nachlesen zählt,
ist klein und leise. Die Welt verweigert zweierlei: den Kategorie-Default der
Statistikwerkzeuge, bei dem alles gleich klein ist, und das Kostüm eines
Overlays mit nachgebauten Sendeplaketten — es gibt keine Scoreboard-Attrappe,
keinen Teamlogo-Rahmen, kein Sendesignet.

Das tragende Element ist das **Rollenfarbfeld**. Die Rollenfarbe ist kein
Haarstrich mehr über der Karte, sondern eine vollflächige Bande, die den
Kartenkopf trägt: `.panel[data-role] > .card-head` zieht sich über negative
Ränder bis an die Kartenkante, führt die Rollenfarbe als Hintergrund und darauf
das Rollenkürzel und den Spielernamen in Versalien in einer einzigen dunklen
Schriftfarbe. Teamfarbe als Fläche, wie im Draft-Overlay. Dieses Feld ist die
Marke des Boards, und weil es die Marke ist, schlägt es zwischen hell und dunkel
nicht um: die fünf Rollentöne und `--role-ink` stehen in beiden Fassungen
identisch im Tokenset.

Im Rollenfeld sitzt rechts das **Rangschild**: eine um
`rgba(0, 0, 0, 0.16)` abgedunkelte Flaeche mit Emblem, Stufe und LP. Die
Abdunklung ist auf allen fuenf Rollentoenen dieselbe, damit das Schild
ueberall gleich sitzt. **Deckkraft taugt dort nicht als Hierarchiemittel** —
mit 0,75 fiel die LP-Zeile auf dem Bot-Ton auf 3,63:1. Die Abstufung traegt
die Schriftgroesse.

Die **Draftseite** folgt derselben Regel mit einem Unterschied: Blau und Rot sind in der dunklen Fassung helle Töne, in der hellen und im Druck tiefe. Darum kippt `--seiten-ink` mit dem Theme — dunkle Tinte auf hellem Feld, Weiß auf tiefem Feld. Das Feld ersetzt das frühere Etikett neben dem Teamnamen; es sagt dasselbe, ohne es zweimal zu sagen.

Drei Fassungen teilen sich ein Tokenset: hell (`:root`), dunkel
(`prefers-color-scheme: dark` und `[data-theme="dark"]`) und Druck
(`@media print`, weißer Grund, schwarze Schrift, Bedienwerk aus). Keine Fassung
hat eigene Regeln, nur eigene Werte — bis auf eine bewusste Ausnahme: im Druck
fällt die Ellipsen-Klemme der Championnamen weg, weil Papier weder Scrollen noch
Filtern noch Hover kennt.

**Key Characteristics:**
- Dunkle Bühne, Karten als beleuchtete Flächen mit Lichtkante und Schatten
- Rollenfarbe als vollflächiges Kopffeld, in beiden Themes derselbe Ton
- Drei Spielerkarten je Reihe ab 1240px, Werte groß statt fünf kleine Karten
- Zahlen in drei Stufen: Heldenzahl, Stützzahl, Beschriftung
- Genau eine Signaturbewegung (der Wipe), und sie läuft nur beim Einlauf

## Colors

Eine fast neutrale, leicht blaustichige Bühnenpalette, in die ausschließlich
semantische Farbe gesetzt wird; die fünf Rollentöne sind absichtlich aus anderen
Farbfamilien gewählt als Blau und Rot, die im Draft die Seiten markieren.

Normativ ist das Frontmatter: es führt die **dunkle Fassung**. Die helle Fassung
ist dasselbe Tokenset mit anderen Werten und steht in `.impeccable/design.json`
unter `colorMeta.<token>.lightValue`; die Druckfassung überschreibt dieselben
Tokens ein drittes Mal.

### Primary
- **Rollenfeld-Fünfer** (`--role-top`, `--role-jgl`, `--role-mid`, `--role-bot`,
  `--role-sup`): die fünf Teamfarben der Übertragung. Sie tragen als Fläche den
  Kartenkopf, dazu die Rollen-Pille und — als `--role` am Panel vererbt — den
  3px-Anlaufstrich, den eine Tabellenzeile beim Überfahren links bekommt. Auf
  allen fünf steht dieselbe Schriftfarbe **`--role-ink`**; ein Ton, der eine
  eigene Schriftfarbe bräuchte, gehört nicht in die Reihe. Die Bank bekommt kein
  Farbfeld, sondern `--border-strong` als `--role` und einen versenkten Kopf —
  sie spielt ja nicht.

### Secondary
- **Bühnenblau** (`--blue`, zugleich `--accent`): Blue Side, Solo-Rang, Links,
  Blind-Pick-Marker, Bearbeiten-Handlung, primäre Handlung, Fokusring,
  Textauswahl, Caret, Reiterunterkante, Akzentunterstrich des Masthead-Links.
  Weiche Variante `--blue-soft` als Kartengrund der Blue Side.
- **Bühnenrot** (`--red`): Red Side, Niederlage, Winrate unter der Schwelle,
  Löschhandlung, ungültige Eingabe, der diagonale Banstrich. Weiche Variante
  `--red-soft`.

### Tertiary
- **Messing** (`--brass`): nur noch zwei Dinge — der Vorlieben-Marker
  (`.plan-tag.likes`) und der linke Rand der Spielnotiz. In der dunklen Fassung
  teilt es seinen Wert mit `--warn`.
- **Gut** (`--good`): Sieg und Winrate über der Schwelle.
- **Warnung** (`--warn` auf `--warn-soft`): echter Alarm — ungespeicherte Daten,
  abgelaufener Ligazugang, doppelter Pick, fehlender Blind Pick. In der
  Hinweis-Marke und im Hinweisbalken tragen **Fläche und Rand** das Signal,
  während die Schrift auf `--ink` bleibt; warnfarbene Fließschrift war das
  schlechtere Geschäft.

### Neutral
- **Bühne** (`--ground`): der Seitengrund und zugleich die Schriftfarbe auf
  aktiven Schaltern — Umkehrung statt zweiter Farbe.
- **Fläche** (`--surface`) und **versenkte Fläche** (`--surface-sunk`): die
  Karte bzw. alles, was eine Stufe tiefer liegt — Chips, Balkenschiene,
  Zeilen-Hover, Bankkopf, Protokollfeld.
- **Rand** (`--border`) und **starker Rand** (`--border-strong`): 1px-Kartenrand
  und Zellkanten bzw. Rand der Bedienelemente, Unterkante des Tabellenkopfs,
  Scrollbalken.
- **Schrift** (`--ink`), **gedämpft** (`--ink-muted`), **leise**
  (`--ink-faint`): Werte, erläuternder Text, Beschriftungen. Alle drei erfüllen
  im ausgelieferten Stand die Schwelle (gemessen im Browser über die
  WCAG-Relativhelligkeit: 3342 Textelemente je Theme, keines darunter).

### Named Rules

**Die Rollenfeld-Regel.** Die Rollenfarbe ist eine Fläche, kein Strich. Wo eine
Rolle zu erkennen sein muss, trägt ein voll ausgefülltes Feld in der Rollenfarbe
die Beschriftung — mit `--role-ink` darauf, nie mit `--ink`. Prüfung: Auf
Daumennagelgröße verkleinert müssen die Rollen noch auseinandergehen.

**Die Farbe-arbeitet-Regel.** Jede Farbe außerhalb der Neutralen trifft eine
Aussage, die ohne sie verlorenginge: Rolle, Seite, Rang, Sieg, Niederlage,
Warnung. Lässt sie sich durch Grau ersetzen, ohne dass Information verschwindet,
gehört sie nicht aufs Board.

**Die Drei-Fassungen-Regel.** Hell, dunkel und Druck teilen ein Tokenset. Eine
neue Fläche schreibt keinen Hexwert direkt, sondern referenziert ein Token —
sonst bricht sie in mindestens einer der drei Fassungen. Ausgenommen sind allein
die beiden Deckschichten auf dem Rollenfeld (`rgba(255,255,255,0.22)` für die
Pille, `rgba(16,19,26,0.72)` für den Untertext): sie rechnen gegen die
Rollenfarbe, nicht gegen die Fassung, und sind deshalb absichtlich fassungslos.

## Typography

**Display Font:** Archivo (mit `ui-sans-serif, system-ui, sans-serif`)
**Body Font:** Source Sans 3 (mit `ui-sans-serif, system-ui, "Segoe UI", sans-serif`)
**Label/Mono Font:** IBM Plex Mono (mit `monospace`)

Alle drei sind variabel, werden von `build.py` als base64-woff2 eingebettet und
laufen ohne Netz; die Oberfläche fällt nie auf eine Systemschrift zurück.

**Character:** Archivo trägt in genau zwei Schnitten — **700** für alles, was
Gewicht hat (Namen, Überschriften, Rangstufe, Rollen-Pille, Beschriftungen), und
**600** für alles, was nur gliedert (Reiter, Schalter, Spaltenköpfe,
Aufklapp-Zeilen). Ein dritter Schnitt kommt nicht dazu. Source Sans 3 hält
Fließtext und Tabellenzahlen ruhig darunter. IBM Plex Mono ist dem Maschinenwert
vorbehalten: Riot-ID (`.sub.maschine`), Spieldauer (`.sub.maschine`),
Spielernamen unter den Kacheln (`.tile .who`, `.plan-champ .who`), Protokoll,
Ausgabefelder und Inline-`code`. `font-variant-numeric: tabular-nums` liegt
global auf `body`.

### Hierarchy
- **Display** (Archivo 700, `1.3rem`, `letter-spacing: -0.015em`): der Teamname
  im Masthead; auf ≤680px `1.05rem`.
- **Name** (Archivo 700, `1.25rem`, Versalien, `letter-spacing: 0.01em`): der
  Spielername auf dem Rollenfeld, die Seitenmannschaft, die Spielnummer, der
  Serienname.
- **Heldenzahl** (Archivo 700, `1.3rem`, `line-height: 1.15`): die Rangstufe in
  der Spielerkarte; auf dem Liga-Reiter der hervorgehobene Chipwert
  (`#panel-liga .chip b`, `1.05rem`).
- **Headline** (Archivo 700, `1.05rem`, `line-height: 1.25`): Abschnitts-
  überschriften, Summary der aufklappbaren Formulare, Seitenkopf der Draftkarte.
- **Title** (Archivo 700, `0.95rem`): Unterabschnitte innerhalb einer Karte.
- **Stützzahl / Body** (Source Sans 3 400, `0.95rem`, `line-height: 1.5`):
  Championzeilen und Fließtext. Spieler- und Liga-Reiter laufen auf derselben
  Leiter — „zu klein" galt für das Board, nicht für einen Reiter davon.
  Fließtext gedeckelt auf `max-width: 74ch`.
- **Table-Header** (Archivo 600, `0.72rem`, `letter-spacing: 0.06em`, Versalien,
  `--ink-faint`): Spaltenköpfe.
- **Label** (Archivo 700, `0.72rem`, `letter-spacing: 0.1em`, Versalien,
  `--ink-faint`): Beschriftungen der Bedienleiste; verwandte Staffelungen:
  Rollen-Pille `0.08em`, Rang-Art `0.12em`, Badge `0.07em`.
- **Mono** (IBM Plex Mono, `0.84rem` in der Kennzahlzeile, `0.78rem` als
  `.sub.maschine`, `0.72rem` in Kacheln, Protokoll und Ausgabefeldern).

Die Größen des Builds bilden eine geschlossene Leiter: `0.72 / 0.78 / 0.84 /
0.95 / 1.05 / 1.1 / 1.25 / 1.3rem`. Dazwischen wird nicht interpoliert.

### Named Rules

**Die Drei-Stufen-Regel.** Jede Datengruppe hat genau drei typografische Stufen:
**Heldenzahl** groß und schwer (Rangstufe, Winrate — Archivo 700, `1.3rem`),
**Stützzahl** mittel und ruhig (Spiele, KDA, Tabellenwerte — `0.95rem`, tabular),
**Beschriftung** klein, versal und leise (`0.72rem`, `--ink-faint`). Eine vierte
Stufe gibt es nicht; wer mehr Betonung braucht, nimmt die nächste vorhandene
Stufe, nicht einen Zwischenwert.

**Die Mono-gehört-der-Maschine-Regel.** IBM Plex Mono markiert ausschließlich,
was eine Maschine geschrieben hat: Riot-ID, Zeitstempel, Protokoll, Ausgabe,
Spielername unter einer Kachel. Zahlen, die gelesen und verglichen werden,
stehen **nicht** in Mono — dafür gibt es `tabular-nums`.

**Die Zwei-Schnitte-Regel.** Archivo läuft in 700 und 600, sonst nirgends.
Betonung entsteht über Größe, Versalien und Laufweite, nicht über einen dritten
Schnitt.

**Die Zahl-vor-Wort-Regel.** In einer Datenzeile ist die Zahl der größte und
dunkelste Teil, die Beschriftung der kleinste und leiseste. Beschriftungen stehen
in Versalien mit weiter Laufweite, Werte in `--ink`.

## Layout

Eine Spalte, `max-width: 1480px`, zentriert, `padding: 1.5rem 1.25rem 4rem`,
Blockabstand `1.2rem` (≤680px: `0.5rem 0.8rem 4.5rem` / `0.8rem`). Der obere
Rand ist absichtlich knapp: Das Bedienwerk über den Daten ist auf ≤150px bei
1440px gebunden; gemessen sind **146px**, und die größere Schrift der Bühne hätte
es ohne den gekürzten Rand darüber gehoben.

Der Kopf ist **eine Zeile** (`header.bar`, sticky, `z-index: 20`,
1px-Unterkante): Teamname, Reiter, Teamauswahl, Championfilter. Darunter die
Umfangszeile je Reiter (`.scope-row`) mit Geltungsbereich, Legendenband und
Hinweis-Marke. Mehr steht nicht zwischen dem Öffnen und der ersten Championzeile.
`header.bar` trägt **kein** `transform`, `filter` oder `backdrop-filter` — sonst
hängt die am Handy fest positionierte Reiterleiste still um.

Die Spielerkarten liegen in `.cards.columns`: `repeat(auto-fit, minmax(min(380px,
100%), 1fr))` mit `1rem` Lücke, ab `min-width: 1240px` fest `repeat(3, minmax(0,
1fr))` — drei große Karten je Reihe, nicht fünf kleine. Die fünf Rollenfelder des
Liga-Reiters folgen ab 1240px derselben Dichte. Im Druck wird auf
`repeat(3, 1fr)` gezwungen (Spaltenbreite rund 356px).

Rhythmus: rem-Schritte, die sich wiederholen — `0.1 / 0.25 / 0.35 / 0.45 / 0.6 /
0.7 / 1 / 1.2 / 1.5`. Karteninnenabstand `0.9rem 1rem 1rem`, Tabellenzellen
`0.3rem 0.45rem`, Spaltenköpfe `0.35rem 0.45rem`.

Haltepunkte, wie sie tatsächlich vorkommen: `1240px` (drei feste Spalten,
Wipe-Staffelung, Liga-Rollen dreispaltig), `1239px`/`860px`
(Draftplan-Spalten 2/1), `900px` (Liga-Raster einspaltig), `780px` (Eingabe- und
Banraster klappen), `760px` (Draftseiten untereinander), `680px` (Handyfassung:
Reiter am unteren Rand, Teamauswahl und Filter teilen sich eine Zeile,
Masthead-Link aus).

### Named Rules

**Die Container-statt-Fenster-Regel.** Was von der **Kartenbreite** abhängt, wird
an der Karte gemessen, nicht am Fenster: `.panel { container-type: inline-size }`,
und unter `@container (max-width: 359px)` stapeln sich die beiden Rangblöcke
untereinander statt nebeneinander. Nur deshalb trägt dieselbe Regel das Handy und
die 356px breite Druckspalte, in der das Fenster breit und die Spalte schmal ist.

**Die Spalten-statt-Raster-Regel.** Karten, die sich in der Höhe um ein
Vielfaches unterscheiden, kommen nicht ins Raster. Der Draftplan nutzt deshalb
`#plan-cards { column-count: 3 }` mit `break-inside: avoid` — als Raster ließ er
rund 1200px Löcher stehen. Die Reihenfolge der Aufstellung bleibt erhalten.

**Die Gemeinsame-Höhe-Regel.** In `.cards.columns` strecken sich die Karten auf
die Zeilenhöhe (`height: 100%`) und der Aufklapp-Knopf wird nach unten geschoben
(`.more { margin-top: auto }`), damit die Championtabellen über die Reihe hinweg
auf derselben Linie liegen. Wo zeilenweise nichts zu vergleichen ist, steigt
`.cards.columns.nach-inhalt` aus.

**Die Gemeinsame-Skala-Regel.** Winrate-Balken haben eine feste Pixelbreite
(`76px × 8px` in Karten und auf dem Liga-Reiter, `46px × 6px` im Grundzustand)
und stehen damit über alle Karten hinweg auf derselben Skala. Ein Balken, der
sich nach seinem Container richtet, lügt im Vergleich.

**Die Keine-zweite-Scrollrichtung-Regel.** Keine Championtabelle scrollt intern,
keine Seite scrollt waagerecht (geprüft bei 390, 1280, 1366, 1440 und 1920px),
kein Championname bricht um. Lange Pools werden über die Zeilenzahl gekappt und
mit „Alle N Champions zeigen" geöffnet, nicht in einen eigenen Scrollbereich
gesperrt.

## Elevation & Depth

Die Karte ist eine **beleuchtete Fläche auf einer dunklen Bühne**, keine flache
Tafel. Tiefe entsteht zweistufig: aus den Tonlagen (`--ground` → `--surface` →
`--surface-sunk`) plus 1px-Rand, und aus einem **Schattenpaar**, das immer
zusammen aufgetragen wird — ein Innenlicht an der Oberkante und darunter ein
zweiteiliger Schlagschatten aus Kontakt- und Streuanteil.

### Shadow Vocabulary
- **Bühnenlicht** (`--licht`; dunkel `inset 0 1px 0 rgba(255,255,255,0.07)`,
  hell `inset 0 1px 0 rgba(255,255,255,0.55)`): die obere Lichtkante der Karte.
  Nie allein.
- **Bühnenschatten** (`--shadow`; dunkel `0 2px 4px rgba(0,0,0,0.5), 0 8px 16px
  -8px rgba(0,0,0,0.9)`, hell `0 1px 2px rgba(14,18,24,0.10), 0 6px 14px -8px
  rgba(14,18,24,0.30)`): Kontakt plus Streuung. Liegt auf `.panel` und sonst
  nirgends.
- **Anlaufstrich** (`box-shadow: inset 3px 0 0 var(--leader)`): kein Schatten im
  eigentlichen Sinn, sondern die Rollenfarbe, die eine Tabellenzeile bei Hover
  oder Fokus links anlegt (`140ms cubic-bezier(0.16, 1, 0.3, 1)`).
- **Reiterunterkante** (`inset 0 -3px 0 var(--accent)`, am Handy
  `inset 0 3px 0`): die Akzentmarkierung des aktiven Reiters.

### Named Rules

**Die Paar-Regel.** `--licht` und `--shadow` werden immer gemeinsam gesetzt:
`box-shadow: var(--licht), var(--shadow)`. Das Licht ohne den Schatten sieht nach
Fehler aus, der Schatten ohne das Licht nach Kategorie-Default. Wer eine neue
erhobene Fläche baut, nimmt das Paar oder gar nichts.

**Die Ruhe-Regel.** Flächen heben bei Hover nicht an. Die einzige Zustandstiefe
ist der Anlaufstrich der Tabellenzeile; alles andere bleibt, wo es liegt.

**Der bewusst bezahlte Preis.** Das Paar kostet sechs
`gpt-thin-border-wide-shadow`-Hinweise: 1px-Rand plus 16px-Streuschatten gilt dem
Prüfer als Widerspruch. Der Handel wurde bewusst eingegangen — der Rand trägt die
Kartenkante im Druck und in der hellen Fassung, der Streuanteil trägt die Bühne
im Dunkeln. Der Hinweis wird nicht dadurch „behoben", dass der Rand entfällt oder
der Schatten gekürzt wird.

## Shapes

Ein Radius trägt alles Große: `--radius: 10px` für Karten, Eingabefelder,
Schalter, Reiterleiste, Hinweiszeilen, Textfelder und Protokoll. Darunter eine
kleine Staffel: `2px` für Chips, Pillen, Badges, Plan-Marker und den aktiven
Reiter, `--radius-sm: 4px` für Hinweis-Marke, Warnbalken, Ban-Kacheln und
Vorschaubilder, `3px` für die Winrate-Schiene, `6px` für Pick- und Plan-Kacheln,
`50%` für Champion-Icons in Tabellenzeilen, `99px` für den Scrollbalken.

Die wiederkehrende Silhouette ist die Karte mit 1px-Rand und **vollflächigem
Kopffeld**: `border-radius: var(--radius) var(--radius) 0 0`, über negative
Ränder (`margin: -0.9rem -1rem 0`) bis an die Kartenkante gezogen, die Karte
selbst `overflow: hidden`, damit das Feld sauber in die Rundung schneidet. Zwei
Abweichungen tragen Bedeutung: die links offene Form
`border-radius: 0 var(--radius) var(--radius) 0` für Draftseiten und
Spielnotizen, deren linke Kante die Seitenfarbe bzw. `--brass` führt, und die
Rollen-Pille, deren Rand in `currentColor` läuft.

Bans sind dreifach markiert, damit sie auch in Graustufen und auf Papier Bans
bleiben: entsättigt (`grayscale(0.85) contrast(0.9)`, `opacity: 0.7`), mit einer
feinen Schraffur (`repeating-linear-gradient(135deg, …)` in `--ink`,
`opacity: 0.38`) und einem diagonalen Strich in `--red` darüber. Hell genug, dass
der Champion erkennbar bleibt.

## Components

### Buttons
- **Shape:** gleichmäßig gerundet (10px, `--radius`), 1px-Rand.
- **Primär** (`button.action`): Akzentfläche auf `--accent-ink`, Rand in
  derselben Farbe, `0.45rem 1rem`, Gewicht 600. Hover: `brightness(1.08)`.
  Deaktiviert: `opacity: 0.45`.
- **Ghost** (`.more`, „Alle N Champions zeigen"): versenkte Fläche, starker Rand,
  `--ink-muted`, `0.3rem 0.7rem`. Hover: Rand auf `--ink-faint`, Schrift auf
  `--ink`.
- **Textuell** (`button.del`, `.edit`): rahmenlos in `--red` bzw. `--blue`, Hover
  unterstreicht.
- **Link mit Akzentunterstrich** (`.opgg-all`): kein Rahmen,
  `text-decoration-color: var(--accent)`, 2px dick, 4px Abstand; Hover färbt den
  Text auf den Akzent.
- **Fokus:** durchgehend `outline: 2px solid var(--accent); outline-offset: 2px`.

### Chips
- **Style:** Archivo, `2px`-Radius, versenkte Fläche, 1px-Rand, `0.78rem`
  (Liga-Reiter `0.84rem`), `--ink-muted`; der hervorgehobene Wert steht als `<b>`
  in `--ink` (auf dem Liga-Reiter als Heldenzahl, `1.05rem`).
- **State:** `.chip.main` (starker Rand, voller Kontrast — der Bilanzchip),
  `.chip.warn` (Warnfläche, Warnrand, Warnschrift), `.chip.mix` (Inline-Flex mit
  15px-Champion-Icon und senkrechtem Trenner).

### Cards / Containers
- **Corner Style:** 10px (`--radius`), `overflow: hidden`.
- **Background:** `--surface` auf `--ground`.
- **Shadow Strategy:** das Paar `var(--licht), var(--shadow)`, siehe Elevation.
- **Border:** 1px `--border`; die Rollenzugehörigkeit trägt das Kopffeld, nicht
  der Rand.
- **Internal Padding:** `0.9rem 1rem 1rem`, Blockabstand innen `0.6–0.7rem`.
- **Gliederung ohne Rahmen:** `.section` ist ein reiner Flex-Stapel — eine Karte
  in einer Karte wäre eine zu viel.

### Inputs / Fields
- **Style:** `--surface`, 1px `--border-strong`, 10px, `0.35rem 0.6rem`,
  `0.84rem`. Das Teamfeld (`.team-select`) baut seinen Pfeil aus zwei
  `linear-gradient`-Dreiecken in `currentColor` statt aus einer Grafik.
- **Focus:** `outline: 2px solid var(--accent); outline-offset: 1px`.
- **Error:** `input.bad` — Rand und Schrift in `--red`. **Dublette:**
  `input.dup` — Warnrand, Warnfläche, Warnschrift.

### Navigation
- **Reiterleiste** (`.tabs`): Gruppe mit `--border`-Grund, 1px-Rand, 10px und 2px
  Innenabstand; Reiter `2px`-Radius, Archivo 600, `0.84rem`. Inaktiv `--surface`
  auf `--ink-muted`; aktiv invertiert auf `--ink` mit
  `inset 0 -3px 0 var(--accent)`.
- **Segmentierte Schalter** (`.switch`): dieselbe Logik in groß — 10px-Radius,
  starker Rand, `aria-pressed="true"` invertiert auf `--ink`/`--ground`. Trägt
  Theme, Queue und Season.
- **Mobil (≤680px):** die Reiterleiste wird `position: fixed` am unteren Rand,
  randlos über die volle Breite, Reiter `flex: 1` in `0.72rem` ohne Unterzeile;
  die Akzentmarke wandert auf `inset 0 3px 0`. Der Seiteninhalt bekommt dafür
  `4.5rem` unteren Rand.

### Spielerkarte (Signature)
Die tragende Karte des Boards. Von oben: das **Rollenfarbfeld** über die volle
Kartenbreite mit Rollen-Pille (Versalien, `0.08em`, halbtransparentes Weiß als
Fläche, Rand in `rgba(16,19,26,0.45)`), dem Spielernamen in Versalien
(Archivo 700, `1.25rem`) und der Riot-ID in `rgba(16,19,26,0.72)`. Darunter die
beiden Ränge als `grid-template-columns: 1fr 1fr` — Emblem 44px, Rangstufe als
Heldenzahl (`1.3rem`), darüber die Rang-Art als versale Beschriftung, darunter LP
und Bilanz als Stützzeile (`0.72rem`). Ein fehlender Rang wird nicht versteckt,
sondern mit `opacity: 0.55` und kursiver Unterzeile gezeigt. Dann der Bilanzchip,
die Championtabelle, der Aufklapp-Knopf und zuletzt „Details". Bankkarten
behalten den Aufbau, tauschen aber das Farbfeld gegen einen versenkten Kopf mit
starker Unterkante.

### Championtabelle (Signature)
`border-collapse: collapse`, volle Breite, `0.95rem`. Spaltenkopf in Versalien
(Archivo 600, `0.72rem`) mit 2px-Unterkante in `--border-strong`. **Jede** Spalte
ab der zweiten bekommt eine linke Kante (`th:not(:first-child),
td:not(:first-child)`), damit der Block als Raster liest. Spalte 1 ist immer der
Champion (26px-Icon, `border-radius: 50%`, Name mit Ellipsen-Klemme auf 46%
Spaltenbreite); Zahlenspalten rechtsbündig mit `nowrap` und `tabular-nums`. Die
Turnierspalte steht meist auf „—" und bekommt nur `width: 1%`. Zeilen-Hover legt
`--surface-sunk` unter und den Anlaufstrich in der Rollenfarbe links an. Im Druck
fällt die Ellipsen-Klemme weg (`white-space: normal`, `max-width: none`) — Papier
hat kein Scrollen, kein Hover und kein Filtern, und ein abgeschnittener
Championname auf dem Blatt wäre unlesbar.

### Winrate-Balken (Signature)
Feste Schiene (`76px × 8px` in Karten und Liga, Grundzustand `46px × 6px`,
Radius 3px, Grund `--surface-sunk`) mit Füllbalken: `--ink-faint` neutral,
`--good` über der Schwelle, `--red` darunter. Davor der Prozentwert rechtsbündig
mit fester Mindestbreite (`2.1rem` in Karten, `2.4rem` sonst), damit alle Balken
auf derselben Startlinie beginnen.

### Named Rules

**Die Ein-Einlauf-Regel.** Das Board hat genau eine Signaturbewegung — den
**Wipe**: ein Licht läuft einmal von links durch das Rollenfarbfeld
(`700ms cubic-bezier(0.22, 1, 0.36, 1)`), und die Winrate-Balken darunter landen
(`wr-grow`, `520ms`, gestaffelt in 26ms-Schritten über acht Zeilen, ab der
neunten gesammelt bei 208ms). Sie hängt an **einem einzigen Auslöser**:
`mitEinlauf()` hängt die Klasse `einlauf` nur dann an den Zeichenbehälter, wenn
die Einlauf-Fahne gesetzt ist — erstes Zeichnen, Teamwechsel, Queuewechsel,
Seasonwechsel. Tippen in einem der beiden Championfilter zeichnet dieselben
Karten **still** neu. Gemessen: 149 laufende Animationen beim ersten Aufbau, 147
beim Queuewechsel, 113 beim Teamwechsel, **0 bei jedem Filteranschlag**. Die
3n-Staffelung steht in `@media (min-width: 1240px)`, weil eine Staffelung in
einer einzigen Spalte eine Reihenfolge behaupten würde, die es dort nicht gibt.
Alles liegt in `@media (prefers-reduced-motion: no-preference)`.

## Do's and Don'ts

### Do:
- **Do** die Rollenzugehörigkeit als **Fläche** zeigen: Kopffeld in der
  Rollenfarbe, Schrift darauf in `--role-ink`, Rundung oben über
  `border-radius: var(--radius) var(--radius) 0 0` und negative Ränder.
- **Do** jede Farbe aus einem Token ziehen (`var(--ink)`, `var(--accent)`,
  `var(--role)`), nie als Hexwert direkt — sonst bricht die Fläche in hell,
  dunkel oder Druck.
- **Do** erhobene Flächen mit dem vollständigen Paar
  `box-shadow: var(--licht), var(--shadow)` versehen.
- **Do** Zahlen in den drei vorhandenen Stufen setzen — Heldenzahl `1.3rem`
  Archivo 700, Stützzahl `0.95rem`, Beschriftung `0.72rem` versal — und auf der
  Größenleiter `0.72 / 0.78 / 0.84 / 0.95 / 1.05 / 1.25 / 1.3rem` bleiben.
- **Do** Zahlenspalten rechtsbündig mit `tabular-nums` setzen und jeder
  Balkenskala eine feste Pixelbreite geben.
- **Do** Breitenentscheidungen am Container messen
  (`container-type: inline-size`, `@container`), wenn dieselbe Fläche im Fenster
  und in einer Druckspalte steht.
- **Do** neue Bedienelemente mit `outline: 2px solid var(--accent);
  outline-offset: 2px` fokussieren.
- **Do** neue Bewegung an `prefers-reduced-motion: no-preference` **und** an die
  `einlauf`-Fahne binden, damit sie beim Filtern stumm bleibt.
- **Do** eine Zustandsmarkierung dreifach absichern, wenn sie im Druck überleben
  muss — Form, Muster und Farbe, wie beim Ban.

### Don't:
- **Don't** die Rollenfarbe auf einen Haarstrich zurücknehmen oder sie als
  Schriftfarbe auf dunklem Grund verwenden. Sie ist eine Fläche.
- **Don't** einen sechsten Rollenton oder eine Rollenfarbe einführen, die ihre
  eigene Schriftfarbe bräuchte — `--role-ink` gilt für alle fünf.
- **Don't** die Rollentöne zwischen hell und dunkel umschlagen lassen. Teamfarben
  tun das in einer Übertragung auch nicht.
- **Don't** eine zweite Akzentfarbe einführen. `--accent` ist ein Token;
  Betonung entsteht sonst über Größe, Versalien und Gewicht.
- **Don't** Farbe dekorativ setzen. Lässt sie sich durch Grau ersetzen, ohne dass
  Information verlorengeht, gehört sie nicht aufs Board.
- **Don't** `--licht` ohne `--shadow` setzen oder umgekehrt, und **don't** die
  sechs `gpt-thin-border-wide-shadow`-Hinweise dadurch „beheben", dass der
  1px-Rand oder der Streuanteil des Schattens verschwindet.
- **Don't** einen dritten Archivo-Schnitt aufnehmen oder einer Rolle die Familie
  wechseln.
- **Don't** IBM Plex Mono für Werte verwenden, die verglichen werden — Mono ist
  dem Maschinenwert vorbehalten.
- **Don't** `header.bar` ein `transform`, `filter` oder `backdrop-filter` geben.
  Eine Milchglas-Leiste hängt die am Handy fest positionierte Reiterleiste still
  um.
- **Don't** die Signaturbewegung an einen zweiten Auslöser hängen (Hover,
  Reiterwechsel, Tastenanschlag im Filter). Sie läuft beim Einlauf, sonst nie.
- **Don't** Karten mit stark unterschiedlicher Höhe in ein Raster setzen —
  `column-count` statt `grid`.
- **Don't** eine Championtabelle intern scrollen lassen oder einen Championnamen
  umbrechen.
- **Don't** `--ink: #000` aus dem `@media print`-Block gegen den dunklen Grund
  rechnen — und umgekehrt `--ink: #f2f5f9` nicht gegen das Weiß des Drucks. Genau
  diese unmöglichen Paarungen erzeugen die elf `low-contrast`-Treffer des
  statischen Prüfers; sie sind Fehlalarme, weil der Druck hellen Grund erzwingt.
- **Don't** `--ink-faint` für einen Mangel halten: die früher notierten
  AA-Verstöße (3,0–4,0:1) sind mit dem Oktober-Umbau behoben und gelten für den
  ausgelieferten Stand **nicht** mehr. Es bleibt trotzdem die Beschriftungsfarbe;
  Werte und Fließtext nehmen `--ink-muted` oder `--ink`.
