# ui/ – die Oberfläche in Teilen

Seit Draftboard 2.0, Phase 1 (13.10.2026). Jede Datei hier ist ein Abschnitt
des Seitenskripts. In `template.html` steht an ihrer Stelle eine Zeile

    //@ui live/draft.js

und `build.py` (`ui_einsetzen`) setzt die Datei beim Bauen genau dort ein –
im selben Skript, im selben Gültigkeitsbereich. Die Teile teilen sich noch
Zustand und Helfer der Seite (`el`, `team`, `DATA`, `ENGINE`, …); sie sind
keine eigenständigen Module wie `engine/`.

| Datei | Inhalt |
|---|---|
| `zustand.js` | kleiner Zustandsspeicher (`storeAnlegen`) |
| `live/draft.js` | Team-Live-Draft: Zustand, Rangliste, Board, Lagebild, Protokoll, Karten |
| `zustaende.js` | `zustandsHinweis`: Leer-, Fehl-, Fertigzustände mit Titel und Satz |
| `live/cockpit.js` | LIVE-Cockpit (Standard des Team-Drafts): Zustandskopf, Schrittfolge, Empfehlungen, Suche, Tastatur |
| `live/briefing.js` | Reiter Briefing (LIVE): Gegner, wahrscheinliche Picks, Ableitungen, Draftplan |
| `live/solo.js` | Reiter Solo Queue |
| `scout/einschaetzung.js` | Reiter Einschätzung (Heuristik prüfen) |
| `scout/zahlen.js` | Zahlenzeile (`zahlenZeile`) für Kennzahlen statt Kästchen |
| `scout/filter.js` | Rollen- und Spielerfilter für Spieler und Draftplan |
| `review/plan-ist.js` | Reiter Plan gegen Ist (REVIEW), rechnet in `engine/review.js` |

Die Modi LIVE / SCOUT / REVIEW stehen im Kopf von `template.html`
(`data-modus` an jedem Reiter, `zeigeModus`, `REITER_JE_MODUS`).

Prüfen: `tests/oberflaeche.test.mjs` (jede Zeile hat ihre Datei, keine
verwaist), im Browser `tests/ui_board.py`, `tests/ui_live.py`,
`tests/ui_scout.py`, `tests/ui_briefing.py`. Eine Aufteilung darf die
gebaute `index.html` nicht verändern – beim Verschieben byte-gleich prüfen.
