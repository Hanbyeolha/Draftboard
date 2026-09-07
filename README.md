# AFC Draftboard

Scouting- und Draftboard für die Uni-Liga: Championpools aller Spieler aus op.gg,
dazu die eigenen Turnierspiele mit Picks, Bans und Notizen — alles in **einer
HTML-Datei**, die du deinem Team schicken kannst.

Aktuell drin: **AFC1** (8 Spieler), **AFC2** (5), **SV Innerstetal** (5),
**SSV Remlingen** (5), **MTV Lichtenberg** (7) und **TSV Salzgitter** (6) —
36 Accounts, Datenstand 04.09.2026, dazu die BO3-Fearless-Serie gegen Innerstetal.

---

## Als Programm starten (der bequeme Weg)

**`Draftboard starten.cmd` doppelklicken.** Es geht ein schwarzes Fenster auf,
das Board öffnet sich im Browser — fertig. Kein Terminal, keine Befehle.

In diesem Betrieb heißt der Knopf **Speichern** statt *herunterladen*: er
schreibt direkt in `draftplan.json` bzw. `games.json`, baut die Seite neu und
lädt sie frisch. Die gelbe „liegt nur in diesem Browser"-Leiste kann gar nicht
mehr auftauchen, weil nichts mehr nur im Browser liegt.

Unten auf der Seite steht dann zusätzlich der Block **Programm**:

| Knopf | Was er tut |
|---|---|
| *Datei für Mitspieler erzeugen* | baut `out/…-Draftboard.html` und nennt den vollen Pfad |
| *Ordner öffnen* | zeigt die Datei im Explorer |
| *op.gg neu laden* | startet `auto_scrape.py` für das gerade gewählte Team, mit Protokoll auf der Seite |
| *Neuer Spieler* | trägt jemanden ins Team ein und holt **nur dessen** op.gg — gut eine Minute statt acht |

**Neuen Spieler aufnehmen:** Riot-ID als `Name#TAG` eintippen, Rolle wählen,
bei Bedarf *Bank* ankreuzen, **Anlegen und scrapen**. Der Anzeigename ist
optional — ohne Angabe wird der Teil vor dem `#` genommen. Der Spieler landet in
`teams.json`, danach holt das Programm sein Profil und mischt es in die
vorhandene Rohdatei des Teams; die übrigen Spieler bleiben unangetastet. Ist der
Scrape durch, lädt die Seite von selbst neu.

Tippfehler fängt es vorher ab: fehlendes `#`, unbekanntes Team, unbekannte
Rolle, oder ein Name bzw. eine Riot-ID, die im Team schon steht. In diesen
Fällen wird nichts geschrieben. Gibt es das Konto auf op.gg nicht, steht der
Spieler zwar in `teams.json`, das Protokoll meldet aber „auf op.gg nicht
gefunden" und `build.py` warnt bei jedem Bau — dann die Riot-ID in `teams.json`
korrigieren.

Das schwarze Fenster muss offen bleiben, solange du arbeitest — Strg+C oder
Fenster schließen beendet das Programm.

**Nach einer Änderung am Programm neu starten.** Die Seite wird bei jedem Bau
frisch erzeugt, `serve.py` läuft aber weiter — nach einer Erweiterung kennt der
laufende Server neue Knöpfe noch nicht und antwortet mit „unbekannt". Der Block
*Programm* warnt in diesem Fall oben in Gelb und sperrt die betroffenen Knöpfe.
Abhilfe: Fenster schließen, `Draftboard starten.cmd` neu starten. Erreichbar ist es nur von deinem
Rechner (`127.0.0.1`).

Vor jedem Schreiben legt das Programm den vorherigen Stand als `.json.bak`
daneben. Und die Datei, die du deinen Mitspielern schickst, braucht davon
nichts: die läuft weiterhin allein durch Doppelklick, dort erscheinen dann
wieder die Herunterladen-Knöpfe.

---

## Schnellstart

```bash
python build.py --standalone
```

Ergebnis: `out/AFC1-Draftboard.html` — Doppelklick öffnet sie im Browser.
Das ist die Datei, die du weitergibst.

Es gibt zwei Bauvarianten:

| Befehl | Ergebnis | wofür |
|---|---|---|
| `python build.py` | `out/scouting.html` (~900 KB) | Arbeitsversion, lädt Icons und Schriften aus dem Netz |
| `python build.py --standalone` | `out/AFC1-Draftboard.html` (~1,4 MB) | Weitergabe: Icons **und Schriften** eingebettet, läuft wirklich offline |

Voraussetzung: **Python 3** (kein pip-Paket nötig). Für `--standalone` beim
allerersten Lauf Internet — Icons und Schriften werden einmalig nach
`data/icons/` bzw. `data/fonts/` geladen und danach von dort genommen. Klappt
der Schriftdownload nicht, meldet `build.py` das und die Seite holt sie wie
bisher von Google; sie sieht dann ohne Internet anders aus, funktioniert aber.

Der dritte Befehl zieht die op.gg-Daten neu — ein Browserfenster geht auf,
arbeitet sich durch die Profile und schließt sich wieder:

```powershell
python auto_scrape.py                    # alle Teams, danach wird neu gebaut
python auto_scrape.py "SSV Remlingen"    # nur ein Team
```

Details unter *Daten aktualisieren*.

---

## Was liegt wo

```
teams.json          Rosters: welches Team, welche Spieler, welche Rolle
league.json         Vereine der Liga (Gegnerauswahl im Formular)
games.json          Turnierspiele: Picks, Bans, Ergebnis, Notizen
draftplan.json      wer was blind oder als First Pick spielt
build.py            baut aus allem die HTML-Datei
auto_scrape.py      holt die op.gg-Daten automatisch (Browser wird ferngesteuert)
scrape.py           druckt die Anleitung fuer den manuellen Weg
template.html       Layout + gesamte Logik der Seite (HTML/CSS/JS)
extract.js          op.gg-Extraktor, läuft in der Browser-Konsole
data/
  raw/*.json        gescrapte Spielerdaten (eine Datei je Team + Queue-Dateien)
  champions.json    Championliste für Eingabefelder und Namensprüfung
  icons/            Cache der Champion- und Rang-Bilder (wird automatisch gefüllt)
  fonts/            Cache der Schriften für die Weitergabe-Datei (automatisch)
out/                die gebauten HTML-Dateien
```

Von Hand bearbeitet werden nur **`teams.json`**, **`league.json`**,
**`games.json`** und **`draftplan.json`**. Alles unter `data/raw/` kommt aus dem
Scraper.

---

## Draftplan pflegen

Was jemand blind picken kann, steht in keiner Statistik — eine hohe Winrate sagt
nichts darüber, ob ein Champion ungekontert früh gepickt werden kann. Das ist
Kopfwissen und wird in **`draftplan.json`** eingetragen.

Zwei Fragen an jeden Spieler, damit alle dasselbe beantworten:

> **Blind Pick** — was kannst du picken, ohne den Gegner zu kennen, ohne hart
> gekontert zu werden?
>
> **Spielt gerne** — was spielst du am liebsten, unabhängig vom Draft?

Das ist absichtlich getrennt: ein Lieblingschampion kann hart konterbar sein und
taugt dann nicht als Blind Pick — und umgekehrt ist der sicherste Pick oft nicht
der, auf den jemand Lust hat. Beides zu wissen hilft im Champ Select.

### Der bequeme Weg: im Browser eintragen

Im Reiter **Draftplan** unten auf **Draftplan bearbeiten** klicken. Je Spieler
stehen dort zwei Championzeilen — **Blind** und **Gerne** — plus ein Notizfeld
für alles Weitere (mehrzeilig, z. B. „gegen Ranged-Top lieber Malphite" oder
„will Jungle lernen"). **Die Felder wachsen mit:** Am Ende ist immer eines frei
— sobald du es ausfüllst, erscheint das nächste. Wer drei Champions nennt,
braucht drei; wer zwölf nennt, tippt einfach weiter.

Ein Champion darf in beiden Listen stehen; doppelt in *derselben* Liste wird
gelb markiert.

Kurzformen werden erkannt (`j4` → Jarvan IV, `mundo` → Dr. Mundo, `morde` →
Mordekaiser), neben jedem Feld erscheint sofort das Championbild. Steht ein
Champion bei einem Spieler zweimal, wird das Feld gelb; unbekannte Namen
verhindern das Speichern.

**Speichern** legt den Plan zunächst nur in *deinem* Browser ab — dann erscheint
oben die gelbe Leiste (siehe *Exportieren*). Damit ihn alle sehen:

1. **draftplan.json herunterladen** drücken,
2. die Datei in den Projektordner legen (die alte ersetzen),
3. `python build.py --standalone`.

Die heruntergeladene Datei enthält immer **alle** Teams, nicht nur das gerade
bearbeitete.

### Der direkte Weg: Datei bearbeiten

Die Datei enthält bereits alle Teams und Spieler mit leeren Listen. Ausfüllen
heißt nur, Namen in die Klammern zu setzen:

```json
"bandit":    {"blind": ["Ornn", "Sett"], "likes": ["Dr. Mundo", "Zed"],
              "note": "gegen Ranged-Top lieber Malphite"},
"HartzFor":  {"blind": ["Sejuani", "Amumu"], "likes": []},
```

`blind`, `likes` und `note` sind optional, leer lassen ist in Ordnung. Schlüssel ist der
**`label`** aus `teams.json` — er muss zeichengenau passen. Danach
`python build.py --standalone`; ein neuer Scrape ist **nicht** nötig.

Frühere Fassungen kannten zusätzlich `"first"`. Steht das noch in einer Datei,
wandern die Einträge beim Bauen vorn in `blind` — es geht nichts verloren.

`build.py` prüft jeden Namen gegen `data/champions.json` und meldet Tippfehler:

```
! AFC1/bandit: "Ornnn" ist kein Champion
```

Gebaut wird trotzdem — der Champion taucht dann im Draftplan als „keine Spiele" auf.

Angezeigt wird das im Reiter **Draftplan** (eine Spalte je Spieler, unter jedem
Champion Spiele und Winrate aus der gewählten Queue und Season) und in den
Championtabellen als **B** (blind pickbar, blau) bzw. **G** (spielt er gerne,
gold). Ein Champion kann beide tragen.

---

## Turnierspiel eintragen

Das ist der häufigste Fall und geht komplett in der Seite selbst.

1. Datei öffnen → Reiter **Turnierspiele**.
2. Oben Datum, **Serie** (z. B. `Freundschaftsspiel BO3 gegen Innerstetal`),
   Spielnummer, Format (Fearless/Normal), Gegner, Seite, Ergebnis.
3. Die fünf Zeilen ausfüllen: je Rolle Spieler + Champion für **beide** Teams.
   Kurzformen reichen — `morde`, `j4`, `ori`, `mf`, `tk`, `sej`, `cass`,
   `mundo`, `xin` — ebenso jeder eindeutige Wortanfang (`cassio`, `mordek`).
   Rechts neben jedem Feld erscheint das Champion-Icon, sobald der Name erkannt
   ist; wird er nicht erkannt, färbt sich das Feld rot.
4. Zehn Ban-Felder, fünf je Team.
5. Optional **Notizen zum Spiel** — mehrzeilig, erscheint später unter der Karte.
6. **Spiel speichern.**

Die Seite prüft dabei:

* Ein Champion darf pro Spiel nur einmal vorkommen — als Pick der einen Seite,
  der anderen oder als Ban. Doppelte Felder werden gelb markiert.
* Bei Format *Fearless*: kein Champion, der in derselben Serie schon gepickt
  wurde (teamübergreifend). Meldung nennt das Spiel, in dem er vorkam.

### Damit es alle sehen

Gespeicherte Spiele liegen zunächst nur **in deinem Browser** (localStorage).
Unter dem Formular erscheint nach dem Speichern der fertige JSON-Block:

1. Text kopieren (oder Knopf **Als JSON für games.json kopieren**).
2. In `games.json` in die Liste einfügen — Komma zwischen den Einträgen nicht
   vergessen.
3. `python build.py --standalone` und die neue Datei verteilen.

Danach kannst du im Reiter Turnierspiele auf **Lokale Änderungen verwerfen**
klicken; das Spiel kommt jetzt aus der Datei.

### Bearbeiten und löschen

Jede Spielkarte hat oben rechts **bearbeiten** und eine Löschaktion:

| Karte zeigt | Knopf | Wirkung |
|---|---|---|
| `aus Datei` | ausblenden | verschwindet in deinem Browser, bleibt in `games.json` |
| `lokal` (überschreibt Datei-Spiel) | Änderung verwerfen | Dateistand kommt zurück |
| `lokal` (neu eingetragen) | löschen | weg |

**bearbeiten** lädt das komplette Spiel zurück ins Formular. Speichern ersetzt
den Eintrag (Kennung: Serie + Spielnummer + Team), es entsteht kein Duplikat.
Endgültig löschen kannst du ein Datei-Spiel nur, indem du seinen Eintrag aus
`games.json` entfernst und neu baust.

---

## games.json — Aufbau

Ein Spiel steht **einmal** in der Datei, mit beiden Seiten. Beim Bauen wird
daraus je Team ein Datensatz, damit die Picks in beiden Championtabellen
auftauchen.

```json
{
  "series": "AFC1 vs Innerstetal – BO3 Fearless (02.09.2026)",
  "game": 1,
  "format": "fearless",
  "date": "2026-09-02",
  "matchId": "EUW1_7970995761",
  "blue": "AFC1",
  "red": "SV Innerstetal",
  "winner": "SV Innerstetal",
  "note": "Drachenseele auf 27 verloren.",
  "picks": {
    "AFC1": [
      {"role": "TOP", "player": "jasxnbrg", "champ": "Olaf"}
    ],
    "SV Innerstetal": [
      {"role": "TOP", "player": "Thueringerkloss", "champ": "Gnar"}
    ]
  },
  "bans": {
    "AFC1": ["Zyra", "Sylas"],
    "SV Innerstetal": ["Jinx", "Seraphine"]
  }
}
```

* `series` — freier Text, gruppiert die Spiele in der Ansicht.
* `format` — `fearless` schaltet die Wiederholungsprüfung ein, `normal` nicht.
* `winner` — Teamname oder `null`, wenn das Ergebnis noch offen ist.
* `matchId`, `note` — optional.
* Rollen: `TOP`, `JUNGLE`, `MIDDLE`, `BOTTOM`, `UTILITY`.
* Championnamen exakt wie in `data/champions.json` (`Dr. Mundo`, `Jarvan IV`,
  `Nunu & Willump`, `Kai'Sa`).
* `player` darf leer sein — dann erscheint der Pick auf der Spielkarte, wird
  aber keiner Spielerkarte zugeordnet.

---

## Gegner ohne Roster hinzufügen

Für Teams, gegen die ihr spielt, aber (noch) keine Spielerdaten habt, reicht ein
Eintrag in `league.json`:

```json
{"club": "Braunschweig eSports e.V.", "tag": "BSeS", "ort": "Braunschweig", "teams": []}
```

Steht in `teams` nichts, wird der Vereinsname selbst als Teamname benutzt.
Solche Gegner erscheinen in der Auswahlliste des Formulars; Picks und Bans
werden vollständig angezeigt, nur ohne Spielerkarten.

---

## Neues Team scrapen

Nötig, wenn ein Team eigene Spielerkarten mit Championpool, Rängen und
Rollenverteilung bekommen soll.

### 1. Roster eintragen

In `teams.json` ergänzen:

```json
{
  "team": "MTV Lichtenberg",
  "region": "euw",
  "players": [
    {"label": "Spielername", "riotId": "Name#TAG", "role": "TOP"},
    {"label": "Ersatz", "riotId": "Name#TAG", "role": "MIDDLE", "bench": true}
  ]
}
```

* `label` ist der angezeigte Name, `riotId` muss auf op.gg auffindbar sein.
* `bench: true` sortiert den Spieler unter die Starter.
* Reihenfolge der Teams bestimmt den Seitentitel (erstes Team = `<Team>
  Draftboard`) und die Reihenfolge im Umschalter.

### 2. Daten holen

Ein Befehl, der Rest läuft von selbst:

```powershell
python auto_scrape.py "MTV Lichtenberg"
```

Ein Browserfenster geht auf, arbeitet die Profile ab und schreibt
`data/raw/<team>-<datum>.json`; danach wird die HTML neu gebaut. Rechne mit einer
Minute pro Spieler. Details und Schalter: siehe *Daten aktualisieren*.

Geht die Automatik nicht, druckt `python scrape.py "<Team>"` die Anleitung für den
manuellen Weg. **Was dabei im Browser passiert:**

1. Irgendeine op.gg-Seite öffnen, **F12 → Console**.
2. Inhalt von `extract.js` einfügen und ausführen.
3. Für spätere Seitenwechsel merken:
   ```js
   localStorage.setItem('__scout', "<Inhalt von extract.js>")
   ```
   Danach genügt nach jedem Seitenwechsel `eval(localStorage.__scout)`.
   (Bequemer: `resetScrape()` vorher aufrufen, wenn noch Daten vom letzten
   Team im Speicher liegen.)
4. Je Spieler die drei Seiten abklappern — `Key` ist ein frei gewählter
   Schlüssel, üblicherweise der Spielername ohne Sonderzeichen:

   ```js
   // https://op.gg/lol/summoners/euw/Name-TAG
   saveP('Key', Object.assign({riotId:'Name#TAG', label:'Name', team:'MTV Lichtenberg',
                               role:'TOP', region:'euw',
                               opggUrl: location.href.split('?')[0]}, scoutSummary()))

   // .../style
   saveP('Key', {style: scoutStyle()})

   // .../champions - eine Season je Aufruf
   await grabSeason('Key', 33)
   await grabSeason('Key', 31)
   await grabSeason('Key', 29)
   await grabQOne('Key', 'SOLORANKED', 33)
   await grabQOne('Key', 'FLEXRANKED', 33)
   await grabQOne('Key', 'NORMAL', 33)
   ```

   `clickUpdate()` klickt den Update-Knopf auf dem Profil. Es gibt auch
   `grabSeasons('Key', [33,31,29])` und `grabQ(...)` für mehrere Seasons auf
   einmal — bei großen Championpools laufen die aber in Zeitlimits, deshalb
   nutzt `scrape.py` die Einzelaufrufe.

5. Wenn alle Spieler durch sind:
   ```js
   copy(dumpAll())     // legt das JSON in die Zwischenablage
   ```
   Inhalt in `data/raw/<team>-<datum>.json` speichern.

6. `python build.py --standalone`

Namen mit Leerzeichen oder Umlauten in der URL kodieren:
`Köstja#ATZE` → `https://op.gg/lol/summoners/euw/K%C3%B8stja-ATZE`.

### Season-IDs

Stehen im Season-Dropdown auf `/champions`: **33** = Season 2026,
**31** = 2025, **29** = 2024 S3. Normal-Spiele kennt op.gg nicht nach Season —
deshalb dort nur `[33]`, das Ergebnis gilt als Gesamtwert.

Die *Namen* dazu liest `seasonNames()` beim Scrapen mit aus dem Dropdown und
legt sie als `seasonNames` in die Rohdatei; die Seite beschriftet ihre Knöpfe
damit. Für ältere Rohdateien ohne dieses Feld greift die Tabelle `SEASON_NAMES`
in `build.py`. Benennt op.gg eine Season um, reicht ein neuer Scrape.

---

## Einzelnen Spieler ergänzen

Kommt jemand ins Team, ohne dass das ganze Team neu gescrapt werden soll:

1. In `teams.json` beim Team eine Zeile ergänzen (`label`, `riotId`, `role`,
   optional `"bench": true`).
2. Nur diesen einen Spieler scrapen — Ablauf wie unter *Neues Team scrapen*,
   Schritt 2. Vorher `resetScrape()` aufrufen, damit nichts vom letzten Lauf
   mitkommt.
3. `dumpAll()` liefert dann eine Datei mit **nur diesem Spieler**. Die kannst du
   als eigene Datei ablegen, z. B. `data/raw/afc1-neuzugang-2026-10-01.json` —
   `build.py` liest alle Dateien in `data/raw/` ein und führt sie zusammen.
4. `python build.py --standalone`

Der Schlüssel im `players`-Objekt muss eindeutig sein. Trägst du denselben
Schlüssel zweimal ein (z. B. beim Nachscrapen), gewinnt die alphabetisch
zuletzt gelesene Datei — das ist genau der Mechanismus zum Aktualisieren.

Einen Spieler **entfernen**: Zeile aus `teams.json` löschen und seinen Block aus
der Rohdatei nehmen. Bleibt er in der Rohdatei, taucht er weiter als Karte auf.

---

## op.gg-Profile auffrischen

**Wichtig vor jedem Scrape.** op.gg zeigt nicht live, was Riot gerade weiß,
sondern den Stand des letzten Abrufs. Steht auf dem Profil *„Last updated:
6 days ago"*, scrapst du sechs Tage alte Zahlen — die letzten Spiele fehlen dann
komplett.

So aktualisierst du ein Profil:

1. `https://op.gg/lol/summoners/euw/<Name>-<TAG>` öffnen.
2. Oben rechts neben dem Namen auf **Update** klicken.
3. Warten, bis dort *„Last updated: seconds ago"* steht (ein paar Sekunden;
   bei vielen neuen Spielen etwas länger). Erst danach scrapen.

Kontrolle im fertigen Draftboard: in der Ansicht **Liste** trägt jede
Spielerkarte einen Chip wie `op.gg: 2 days ago` (die Angabe kommt im Original
von op.gg). Der zeigt den Stand zum Zeitpunkt des Scrapes — daran siehst du
sofort, welche Accounts damals veraltet waren. In der Spaltenansicht ist der
Chip ausgeblendet.

Bei einem kompletten Team also: erst alle fünf bis acht Profile per Update
anstoßen, dann der Reihe nach scrapen.

---

## Daten aktualisieren

Championpools veralten. **Der Normalfall ist ein einziger Befehl:**

```powershell
python auto_scrape.py                    # alle Teams
python auto_scrape.py "SSV Remlingen"    # nur eins
```

Das Skript steuert einen Browser fern: Profil öffnen, *Update* klicken, Ränge,
Stil und Championtabellen auslesen, `data/raw/<team>-<datum>.json` schreiben, die
alte Datei des Teams löschen und am Ende `build.py --standalone` aufrufen. Rechne
mit **etwa einer Minute pro Spieler** — fünf Teams also gut eine halbe Stunde.

Wichtig: **Das Browserfenster muss offen bleiben.** op.gg beantwortet Anfragen
eines unsichtbaren (headless) Browsers mit „ERROR: The request could not be
satisfied". Der Rechner kann in der Zeit anderes tun, das Fenster darf nur nicht
geschlossen werden.

Nützliche Schalter:

| Schalter | Wirkung |
|---|---|
| `--no-update` | ohne Klick auf *Update* — schneller, nimmt op.ggs letzten Stand |
| `--no-build` | schreibt nur die Rohdaten |
| `--keep-old` | alte Rohdatei des Teams behalten (zum Vergleichen) |

Am Ende steht eine Warnliste: Spieler ohne Rang, leere Tabellen und Accounts, die
op.gg nicht kennt (typisch nach einer Umbenennung). Der Lauf bricht dabei nicht ab,
der betroffene Spieler fehlt nur in der Datei.

### Der manuelle Weg

Falls die Automatik klemmt (op.gg-Umbau, Playwright fehlt), geht es weiterhin von
Hand. `scrape.py` druckt dafür die Anleitung:

```powershell
python scrape.py "SSV Remlingen"
```

Dann abarbeiten, was dort steht:

1. **Multisearch-Link öffnen** (steht als erstes in der Ausgabe) und bei jedem
   Spieler auf *Update* klicken. Mit `--open` macht das Skript die Seite gleich
   selbst auf:

   ```powershell
   python scrape.py "SSV Remlingen" --open
   ```
2. **Installer in die Zwischenablage** holen:

   ```powershell
   Get-Content -Raw out\install-scout.js | Set-Clipboard   # PowerShell
   ```
   ```bash
   clip < out/install-scout.js                             # Git Bash / cmd
   ```

   Dann **Browser-Konsole (F12)** öffnen, einfügen, Enter — es erscheint
   `'Extraktor installiert'`. Danach einmal `resetScrape()`, damit nichts vom
   letzten Team im Speicher liegt. Der Installer muss einmal pro
   Browser-Sitzung rein.
3. **Je Spieler** die ausgegebenen Zeilen abarbeiten: Seite öffnen, Zeile
   kopieren, Enter. Acht Zeilen pro Spieler.
4. In der Konsole `copy(dumpAll())` — das legt das JSON in die Zwischenablage.
   Von dort in eine **neue** Datei unter `data/raw/`, Datum im Namen; den
   genauen Namen nennt die Ausgabe von `scrape.py`:

   ```powershell
   Get-Clipboard -Raw | Set-Content -Encoding utf8 data\raw\ssv-remlingen-2026-10-01.json
   ```
5. Die alte Datei desselben Teams löschen — sonst liegen zwei Stände
   nebeneinander und es gewinnt der alphabetisch letzte Dateiname.
6. `python build.py --standalone`

Ein Team dauert so etwa zehn Minuten.

Turnierspiele in `games.json` und die Rosters in `teams.json` bleiben davon
unberührt; nur die Statistiken werden ersetzt.

Der Datenstand steht danach im Kopf der Seite („Daten von op.gg, Stand …") und
kommt aus dem Feld `scrapedAt` der Rohdateien.

---

## Bedienung der Seite

Alle Schalter sitzen in der Leiste unter dem Titel. Sie bleibt beim Scrollen
oben stehen, damit man aus einer langen Championtabelle heraus die Queue oder
die Season wechseln kann, ohne hochzuscrollen. Auf dem Handy scrollt sie mit.

* **Team-Umschalter** rechts in der Leiste: gilt für beide Reiter.
* **Queue**: Ranked (Solo+Flex), Solo/Duo, Flex, Normal 5v5, Turnier, Alle.
  „Alle" zählt Ranked + Normal + Turnier — Solo und Flex einzeln wären doppelt.
* **Season**: 2026 / 2025 / 2024 S3 / Alle. Die Beschriftung kommt aus op.gg
  selbst; der volle Name steht im Tooltip des Knopfes. Bei Normal und Turnier
  ausgeblendet, weil es dort keine Season-Aufteilung gibt.
* **Ansicht**: *Spalten* (fünf Spalten, eine je Rolle, Bank in Reihe zwei) oder
  *Liste* (volle Tabelle mit KDA, KP, CS/min, Rollenverteilung, Mastery).
  In der Spaltenansicht stehen KDA/KP/CS im Tooltip der Zeile.
  Die farbige Oberkante der Karte zeigt die Rolle: Top orange, Jungle grün,
  Mid violett, Bot rot, Support türkis, Bank grau.
* **Champion filtern**: durchsucht alle Spieler gleichzeitig.
* **Hell / Dunkel / System** oben rechts. Die Wahl bleibt im Browser gespeichert;
  *System* folgt der Einstellung von Windows.
* **Drucken** (Strg+P) gibt aus, was gerade sichtbar ist — ohne Bedienelemente
  und immer auf hellem Grund. Praktisch für einen Draft auf Papier.

Im Reiter **Draftplan** steht je Spieler, was er als First Pick oder blind
spielt — siehe *Draftplan pflegen*. Queue und Season gelten dort mit: die Zahlen
unter den Champions zeigen Spiele und Winrate aus der gewählten Auswahl.

Im Reiter **Turnierspiele** stehen die Drafts oben. Das Eingabeformular sitzt
darunter hinter *Spiel eintragen oder bearbeiten* und ist zugeklappt; beim
Klick auf *bearbeiten* an einem Spiel öffnet es sich von selbst.

---

## Exportieren — welcher Knopf wofür

Es gibt zwei völlig verschiedene Zwecke. Das ist der ganze Trick:

| Zweck | Knopf | Ergebnis |
|---|---|---|
| **Menschen sollen es lesen** | *Als Text kopieren* (Reiter Turnierspiele) | Text für Discord/WhatsApp |
| | Strg+P → „Als PDF speichern" | PDF zum Ausdrucken |
| **Das Programm soll es behalten** | *draftplan.json herunterladen* (Reiter Draftplan) | Datei für den Projektordner |
| | *Als JSON für games.json kopieren* (im Spielformular) | JSON für `games.json` |

**Zum Lesen.** *Als Text kopieren* legt den Draftplan, jede Serie mit Ergebnis
und jedes Spiel mit Seite, Picks, Bans **und Notizen** als Text in die
Zwischenablage — ein paar Kilobyte statt 1,4 MB HTML. Auch das, was nur in
deinem Browser steht, ist drin. Dieser Text geht **nicht** zurück ins Programm,
er ist nur zum Anschauen. Sperrt der Browser die Zwischenablage — bei lokal
geöffneten Dateien kommt das vor —, erscheint der Text in einem Feld darunter
zum Markieren.

**Zum Behalten.** Alles, was du im Browser einträgst — Spiele, Notizen,
Draftplan — liegt zunächst nur bei dir. Beim nächsten `build.py` wäre es weg
und deine Mitspieler sehen es nie.

Damit das nicht passiert, erscheint dann ganz oben — auf **jedem** Reiter — eine
gelbe Leiste:

> **Der Draftplan von AFC1 und 1 Turnierspiel liegen nur in diesem Browser.**
> [draftplan.json herunterladen] [Draftplan verwerfen] [Zu den Spielen] [Spiele verwerfen]
> Danach: Datei in den Projektordner legen (dort, wo build.py liegt), dann `python build.py --standalone`

Sie nennt genau, was offen ist, und hat den passenden Knopf gleich dabei.
Verschwunden ist sie erst, wenn nichts mehr ungesichert ist. Im Einzelnen:

* **Draftplan:** *draftplan.json herunterladen* → Datei in den Projektordner
  legen (die alte ersetzen) → `python build.py --standalone`.
* **Turnierspiele:** *Als JSON für games.json kopieren* → den Block in
  `games.json` einfügen → neu bauen.

Merksatz: **Text = zum Zeigen, JSON = zum Behalten.**

---

## Grenzen und Fallstricke

* **localStorage** — im Browser eingetragene Spiele hängen am jeweiligen
  Browser. Dauerhaft und für alle sichtbar wird ein Spiel erst über
  `games.json`. Öffnest du die Datei über einen Pfad, den der Browser als
  eigenständig behandelt, kann localStorage gesperrt sein; die Seite sagt das
  dann oben im Formular.
* **drafter.lol** taugt nicht als Importquelle. Beim erneuten Aufruf eines
  Serien-Links stellt die Seite nur die *Picks* aller Spiele wieder her; die
  Pick- und Ban-Boards der einzelnen Spiele sind leer, auch über `?game=N`.
  Bans, Seiten und Ergebnisse musst du also von Hand oder vom Scoreboard
  übernehmen.
* **Custom- und Turniercode-Spiele stehen nicht auf op.gg** — Match-IDs wie
  `EUW1_7970995761` lassen sich dort nicht auflösen. Verlässliche Quellen sind
  die Scoreboard-Screenshots nach dem Spiel oder die `.rofl`-Replays aus dem
  Client (`Dokumente\League of Legends\Replays`).
* **Umbenennungen** — op.gg cached alte Namen. Wenn ein Spieler ingame anders
  heißt als auf op.gg, `label` in `teams.json` und in der Rohdatei auf den
  aktuellen Namen setzen und die alte `riotId` stehen lassen (so gehandhabt bei
  *TWM Nirwana* = `Verveigar#SVI` und *Summer Vibes* = `AutoAttackAndy#2077`).
* **Icons** kommen in der Arbeitsversion vom op.gg-CDN; ohne Internet bleiben
  dort die Bilder leer. Die Standalone-Datei hat sie eingebettet.

---

## Wenn etwas nicht baut

| Meldung / Symptom | Ursache | Lösung |
|---|---|---|
| `! <Team>/<Spieler>: keine Scrape-Daten` | Spieler steht in `teams.json`, aber nicht in `data/raw/` | Spieler scrapen oder Eintrag entfernen |
| Team fehlt im Umschalter | keine Spielerdaten vorhanden | Team scrapen; als reiner Gegner gehört es nach `league.json` |
| `json.decoder.JSONDecodeError` | Komma oder Klammer in einer JSON-Datei kaputt | Datei prüfen, `python -c "import json;json.load(open('games.json',encoding='utf-8'))"` |
| Championtabelle leer | Queue/Season-Kombination ohne Spiele | anderen Filter wählen |
| Turnier-Spalte zeigt `—` | Spiel ohne Ergebnis (`winner: null`) | Ergebnis nachtragen |
#   D r a f t b o a r d  
 