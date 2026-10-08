---
version: 1
slug: "template-html"
primary_target: "template.html"
related_targets: []
---

Scope: template.html — die gesamte Oberfläche des Draftboards. Visitor mode: **Operate**.

Publikum: das eigene Team AFC1. Aufgabe: einen Championpool, einen Rang oder
einen gespielten Draft finden — unter Zeitdruck im Champ Select und in Ruhe am
Vorabend. Nebenbedingungen: helles und dunkles Theme, Druckfassung, eine
ausgelieferte Datei ohne Netz, deutsch.

Die Anordnung aus dem Oktober-Umbau bleibt (einzeilige Kopfleiste, Umfangszeile
je Reiter, Warnungen unten, Reiter unten am Handy). **Geändert wird die Dichte**:
drei Spielerkarten je Reihe statt fünf, Schrift und Abstände entsprechend größer.

Merkbarer Moment: die Spielerkarte, die aus Fernsehdistanz lesbar ist.

## Direction contract

THESIS: Das Board sieht aus wie die Grafik, vor der dieses Publikum ohnehin
sitzt — die Übertragung eines Profispiels. Es verweigert zweierlei: den
Kategorie-Default der Statistikwerkzeuge, bei dem alles gleich klein ist, und
das Kostüm eines Overlays mit nachgebauten Sendeplaketten. Übernommen wird,
was ein Broadcast kann: Die wichtige Zahl ist groß, die Nebensache klein, und
beides ist aus drei Metern lesbar.

OWN-WORLD: Dunkle Bühne als Grund, darauf die Karten als beleuchtete Flächen.
Die Rollenfarbe ist kein 3px-Strich mehr, sondern ein Farbfeld, das den
Kartenkopf trägt — Teamfarben als Fläche, wie im Draft-Overlay. Typografie:
eine Grotesk in genau zwei Schnitten, Versalien mit enger Laufweite für
Beschriftungen, die Werte groß und schwer. Zahlenhierarchie in drei Stufen:
Heldenzahl (Rang, Winrate) groß, Stützzahl (Spiele, KDA) mittel, Beschriftung
klein. Farbe ausschließlich semantisch: Rollenfeld, Sieg/Niederlage,
Blau/Rot für die Draftseiten, ein Signalton für Warnung.

STORY: Wer das Board öffnet, erkennt in einer Sekunde, wer vor ihm steht und
wie stark — Rollenfeld, Name, Rang groß. Erst danach liest er den Pool.

FIRST VIEWPORT: Kopfleiste wie gehabt, darunter die Umfangszeile. Dann drei
Spielerkarten nebeneinander, jede rund 420 px breit: oben ein Farbfeld in der
Rollenfarbe mit Rollenkürzel und Name in Versalien, darunter die beiden Ränge
als große Werte mit Emblem, darunter die Championtabelle mit 16px-Zeilen,
Championbildern in 26px und Winrate-Balken über 72px. Primäre Handlung — Team
wechseln — bleibt oben links.

FORM: Esport-Broadcast, **vom Nutzer gepinnt** nach zwei Neuwürfen; die
gewürfelten Hände (Lehrtafel, Abfahrtstafel, Werkzeug-Monochrom, Kataloghülle)
sind abgelehnt. Seed-Schlüssel bc600c41, Register bolder, Runde 2.
Signaturbewegung: **der Wipe** — beim Wechsel von Team, Queue oder Season
läuft das Rollenfarbfeld einmal von links durch den Kartenkopf, und die Werte
darunter landen. Einmal, nicht bei jedem Hover. Daneben bleibt `wr-grow`.
Technische Sperre aus PRODUCT.md: `header.bar` ohne `transform`, `filter`,
`backdrop-filter`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.
