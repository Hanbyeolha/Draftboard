"""Baut aus den op.gg-Rohdaten (data/raw/*.json) und teams.json eine einzelne
HTML-Datei.

    python build.py                -> out/scouting.html          (Arbeitsversion,
                                      Icons kommen vom op.gg-CDN, braucht Internet)
    python build.py --standalone   -> out/<Team>-Draftboard.html (zum Weitergeben:
                                      Icons als data:-URIs eingebettet, laeuft
                                      komplett offline, eine Datei ohne Zubehoer)

Die Rohdaten entstehen im Browser mit extract.js (siehe Kopf dieser Datei);
build.py macht daraus nur noch das Dokument.
"""

import base64
import io
import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).parent
RAW = ROOT / "data" / "raw"
ICON_CACHE = ROOT / "data" / "icons"
OUT = ROOT / "out" / "scouting.html"
# Die groesste Stelle, an der ein Championbild steht, ist die Draftkachel mit
# 72 px; auf einem Retina-Schirm sind das 144 echte Pixel. Mit 48 px Quelle
# sahen die Bilder dort ausgefranst aus.
ICON_PX = 128
ICON_URL = ("https://opgg-static.akamaized.net/meta/images/lol/{version}"
            "/champion/{key}.png?image=q_auto:good,f_webp,w_{px},h_{px}")
# Splash-Art fuer den Kopf der grossen Spielerkarte. Riot liefert 1215x717
# als JPEG mit rund 160 KB - das waere bei 67 Champions eine 13-MB-Datei.
# Auf 800 px verkleinert und als WebP neu kodiert sind es 28 KB, und hinter
# den dunklen Verlaeufen des Heros sieht man den Unterschied nicht.
# DraftGap (MIT, github.com/vigovlugt/draftgap) stellt seine aufbereiteten
# lolalytics-Daten oeffentlich bereit. Zwei Datensaetze: current-patch traegt
# die Staerke je Champion und Rolle, 30-days die Matchups und Synergien.
DRAFT_CACHE = ROOT / "data" / "draftgap"
DRAFT_URL = "https://bucket.draftgap.com/datasets/v5/{name}.json"
# Unter 50 Partien ist eine Matchup-Quote Rauschen - und sie kostet Platz:
# mit 20 als Grenze waere der Auszug 2,1 MB gzip statt 1,6.
DRAFT_MIN = 50
# DraftGap zaehlt die Rollen 0-4 in derselben Reihenfolge wie das Board
# (Top, Jungle, Mid, Bot, Support) - nachgeprueft an Thresh, Lee Sin, Ornn,
# Caitlyn und Ahri.

SPLASH_CACHE = ROOT / "data" / "splash"
# 560 statt 800: das Bild liegt hinter einem Verlauf von 45-86 % und wird im
# Raster rund 190 px breit gezeigt. Bei 800 px kosteten 126 Champions 4,3 MB
# eingebettet, bei 560 sind es 2,6 - sichtbar ist der Unterschied nicht.
SPLASH_PX = 560
SPLASH_Q = 72
SPLASH_URL = ("https://ddragon.leagueoflegends.com/cdn/img/champion/splash/"
              "{key}_0.jpg")

ROLE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY", "UNKNOWN"]
# Reihenfolge der Championtabellen-Spalten in den Rohdaten (siehe extract.js).
CHAMP_FIELDS = ["champ", "win", "lose", "winRate", "kda", "kp", "csPerMin"]
# op.gg-Queue -> Schluessel in der Seite. RANKED (Solo+Flex zusammen) steckt in
# den Spielerdateien, die uebrigen Queues in den queues-*.json.
# NORMAL wird bewusst NICHT eingebettet: Die Oberflaeche bietet die Queue in
# keinem Umschalter an (QUEUES in template.html), weil Normal-Spiele die
# Championpools verwaessern. Die Daten reisten bis Oktober 2026 umsonst mit.
QUEUE_KEYS = {"SOLORANKED": "SOLO", "FLEXRANKED": "FLEX"}
TIERS = ["iron", "bronze", "silver", "gold", "platinum", "emerald",
         "diamond", "master", "grandmaster", "challenger"]
MEDAL_URL = ("https://opgg-static.akamaized.net/images/medals_new/{tier}.png"
             "?image=q_auto:good,f_webp,w_72")

# Wie op.gg die Seasons im Dropdown auf /champions benennt. Frische Scrapes
# bringen die Namen selbst mit (seasonNames in der Rohdatei); diese Tabelle
# faengt die aelteren Dateien ab, die es noch ohne gibt.
SEASON_NAMES = {33: "Season 2026", 31: "Season 2025", 29: "Season 2024 S3",
                27: "Season 2024 S2", 25: "Season 2024 S1", 23: "Season 2023 S2",
                21: "Season 2023 S1", 19: "Season 2022", 17: "Season 2021",
                15: "Season 2020", 13: "Season 9", 11: "Season 8"}

FONT_CACHE = ROOT / "data" / "fonts"
FONT_CSS = ("https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700"
            "&family=IBM+Plex+Mono:wght@400;500"
            "&family=Rajdhani:wght@600;700"
            "&family=Source+Sans+3:wght@400;600&display=swap")
FONT_LINK = "\n".join([
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="' + FONT_CSS + '">'])
# Ohne Browser-Kennung liefert Google veraltetes ttf statt woff2.
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"}


PATCH_LIVE = None


def patch_zahl(p):
    """ "16.20.1" -> (16, 20, 1); Unlesbares sortiert nach vorn."""
    try:
        return tuple(int(x) for x in str(p).split("."))
    except ValueError:
        return (-1,)


def load_raw():
    """Alle Scrape-Dateien einlesen: Spielerdateien (players) und die
    Queue-Dateien (queues). Bei mehreren gewinnt die neueste je Spieler."""
    players, queues, icons, version, scraped = {}, {}, {}, None, None
    names = {}
    global PATCH_LIVE
    PATCH_LIVE = None
    for path in sorted(RAW.glob("*.json")):
        blob = json.loads(path.read_text(encoding="utf-8"))
        icons.update(blob.get("icons", {}))
        # Season-Namen so, wie op.gg sie beim Scrapen anzeigte.
        names.update({int(k): v for k, v in (blob.get("seasonNames") or {}).items()})
        version = blob.get("version") or version
        # Bezug fuer die Patchwarnung: die NEUESTE Data-Dragon-Fassung,
        # nicht die der zuletzt gelesenen Datei (Audit P2.5).
        PATCH_LIVE = max(filter(None, [PATCH_LIVE, blob.get("version")]),
                         key=patch_zahl, default=None)
        scraped = max(scraped or "", blob.get("scrapedAt") or "")
        for key, player in blob.get("players", {}).items():
            players[key] = player
        for key, per_queue in blob.get("queues", {}).items():
            queues.setdefault(key, {}).update(per_queue)
    return players, queues, icons, version, scraped, names


def seasons_of(entries):
    """Rohe Season-Liste -> [{id, champions}] mit benannten Feldern."""
    out = []
    for season in entries or []:
        champs = [dict(zip(CHAMP_FIELDS, row)) for row in season.get("c", [])]
        out.append({"id": season.get("id"), "champions": champs})
    return out


def to_player(raw, per_queue):
    meta = raw["meta"]
    # RANKED = Solo+Flex zusammen, kommt aus der Spielerdatei; die einzelnen
    # Queues aus der queues-Datei. Leere Queues fliegen raus.
    queues = {"RANKED": seasons_of(raw.get("seasons"))}
    for op_key, key in QUEUE_KEYS.items():
        queues[key] = seasons_of((per_queue or {}).get(op_key))
    queues = {k: v for k, v in queues.items()
              if any(s["champions"] for s in v)}
    return {
        "label": meta["label"],
        "riotId": meta["riotId"],
        "role": meta.get("role", "UNKNOWN"),
        "bench": bool(meta.get("bench")),
        "team": meta["team"],
        "opggUrl": meta["opggUrl"],
        "note": meta.get("note"),
        "lastUpdated": meta.get("lastUpdated"),
        "solo": raw.get("solo"),
        "flex": raw.get("flex"),
        "mastery": [{"champ": c, "level": lvl, "points": pts}
                    for c, lvl, pts in raw.get("mastery", [])],
        "style": raw.get("style", {}),
        "queues": queues,
    }


def embed_icons(icons, version):
    """Championbilder einmal herunterladen (webp, ~2 KB) und als data:-URIs
    zurueckgeben. Der Cache unter data/icons/ bleibt liegen; die Kantenlaenge
    steht im Dateinamen, damit ein Wechsel nicht die alten Bilder weiterbenutzt."""
    ICON_CACHE.mkdir(parents=True, exist_ok=True)
    out, fetched = {}, 0
    for champ, key in sorted(icons.items()):
        path = ICON_CACHE / f"{version}-{ICON_PX}-{key}.webp"
        if not path.exists():
            url = ICON_URL.format(version=version, key=key, px=ICON_PX)
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            path.write_bytes(urllib.request.urlopen(request, timeout=30).read())
            fetched += 1
        blob = base64.b64encode(path.read_bytes()).decode("ascii")
        out[champ] = "data:image/webp;base64," + blob
    print(f"  Icons: {len(out)} eingebettet ({fetched} neu geladen)")
    return out


# Die Draft-Engine liegt als ES-Module in engine/. Node laedt sie direkt
# fuer Tests und Backtest; die ausgelieferte Datei bekommt sie gebuendelt.
# Reihenfolge ist Abhaengigkeitsreihenfolge - sie steht hier und nicht im
# Dateinamen, damit man sie lesen kann.
ENGINE_ORDNUNG = [
    "config.js", "provenance.js", "state.js", "heuristik.js", "data.js",
    "features.js", "team.js", "blind.js", "comp.js", "score.js", "search.js",
    "strategie.js", "log.js",
]
ENGINE_DIR = ROOT / "engine"
IMPORT_RE = re.compile(r"^import\s[^;]*?;\s*$", re.M | re.S)
EXPORT_RE = re.compile(r"^export\s+(?=(?:function|const|let|class)\s)", re.M)
NAME_RE = re.compile(
    r"^(?:export\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)", re.M)


def engine_buendeln():
    """engine/*.js zu einem Block, der im Browser laeuft.

    Gibt None zurueck, wenn der Ordner fehlt - dann rechnet die Seite wie
    bisher selbst, statt mit einem halben Modul zu starten."""
    if not ENGINE_DIR.exists():
        print("  Engine: engine/ fehlt - Seite rechnet selbst")
        return None

    teile, namen, oeffentlich = [], {}, []
    for datei in ENGINE_ORDNUNG:
        pfad = ENGINE_DIR / datei
        if not pfad.exists():
            raise SystemExit(f"Engine: {datei} fehlt")
        text = pfad.read_text(encoding="utf-8")

        # Was dieses Modul nach aussen gibt - das wird spaeter zurueckgegeben.
        for treffer in NAME_RE.finditer(text):
            if treffer.group(0).startswith("export"):
                oeffentlich.append(treffer.group(1))

        ohne = IMPORT_RE.sub("", text)
        if re.search(r"^\s*import\s", ohne, re.M):
            raise SystemExit(f"Engine: nicht erkanntes import in {datei}")
        ohne = EXPORT_RE.sub("", ohne)
        if re.search(r"^\s*export\s", ohne, re.M):
            raise SystemExit(f"Engine: nicht erkanntes export in {datei}")

        # Zwei gleiche Namen auf oberster Ebene waeren in einer gemeinsamen
        # Klammer ein Syntaxfehler - und zwar einer, der erst im Browser
        # auffaellt. Darum hier abbrechen.
        for treffer in NAME_RE.finditer(ohne):
            name = treffer.group(1)
            if name in namen:
                raise SystemExit(
                    f"Engine: '{name}' steht in {namen[name]} und {datei} - "
                    "in einer Datei kollidieren die beiden")
            namen[name] = datei

        teile.append(f"/* ---- engine/{datei} ---- */\n{ohne.strip()}\n")

    gibt = ", ".join(sorted(set(oeffentlich)))
    block = ("const DraftEngine = (() => {\n"
             + "\n".join(teile)
             + "\nreturn {" + gibt + "};\n})();\n")
    print(f"  Engine: {len(ENGINE_ORDNUNG)} Module, {len(namen)} Namen, "
          f"{len(set(oeffentlich))} oeffentlich ({len(block) // 1024} KB)")
    return block


def draft_holen(name):
    """Einen DraftGap-Datensatz laden, mit Ablage auf der Platte.

    30-days wiegt rund 52 MB - das holt man nicht bei jedem Bau neu."""
    DRAFT_CACHE.mkdir(parents=True, exist_ok=True)
    pfad = DRAFT_CACHE / f"{name}.json"
    if not pfad.exists():
        url = DRAFT_URL.format(name=name)
        anfrage = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(anfrage, timeout=600) as antwort:
            pfad.write_bytes(antwort.read())
    return json.loads(pfad.read_text(encoding="utf-8"))


def draft_daten():
    """Patch-Staerke, Matchups und Synergien, auf das Noetige eingedampft.

    Die Schluessel sind Nummern, keine Namen: "Dr. Mundo" stuende sonst
    hunderttausendfach in der Datei und kostete ein Drittel mehr Platz."""
    try:
        aktuell = draft_holen("current-patch")
        tage30 = draft_holen("30-days")
    except (urllib.error.HTTPError, urllib.error.URLError, OSError,
            ValueError) as exc:
        print(f"  Draft: nicht geholt ({exc}) - Berater bleibt leer")
        return None

    namen = sorted({c["name"] for c in tage30["championData"].values()})
    nr = {n: i for i, n in enumerate(namen)}

    # Staerke je Champion und Rolle aus dem laufenden Patch.
    basis = {}
    for c in aktuell["championData"].values():
        rollen = {}
        for r, st in (c.get("statsByRole") or {}).items():
            if st.get("games"):
                rollen[r] = [st["games"], round(1000 * st["wins"] / st["games"])]
        if rollen and c["name"] in nr:
            basis[str(nr[c["name"]])] = rollen

    # Schadensprofil je Champion und Rolle: Anteil magischer Schaden in
    # Prozent. Damit laesst sich sagen, ob eine Aufstellung einseitig wird,
    # ohne irgendetwas zu behaupten.
    schaden = {}
    for c in aktuell["championData"].values():
        if c["name"] not in nr:
            continue
        rollen = {}
        for r, st in (c.get("statsByRole") or {}).items():
            d = st.get("damageProfile") or {}
            summe = (d.get("physical") or 0) + (d.get("magic") or 0) + (d.get("true") or 0)
            if st.get("games") and summe > 0:
                rollen[r] = round(100 * (d.get("magic") or 0) / summe)
        if rollen:
            schaden[str(nr[c["name"]])] = rollen

    # Kurve ueber die Spieldauer: fuenf Eimer je Rolle. Kayle geht von
    # 43 auf 58 Prozent, Pantheon von 52 auf 47 - das ist Skalierung als
    # Messung statt als Behauptung.
    zeit = {}
    for c in aktuell["championData"].values():
        if c["name"] not in nr:
            continue
        rollen = {}
        for r, st in (c.get("statsByRole") or {}).items():
            eimer = st.get("statsByTime") or []
            if not st.get("games") or not eimer:
                continue
            rollen[r] = [[b.get("games") or 0,
                          round(1000 * (b.get("wins") or 0) / b["games"])
                          if b.get("games") else 0]
                         for b in eimer]
        if rollen:
            zeit[str(nr[c["name"]])] = rollen

    # Matchups und Synergien aus den letzten 30 Tagen.
    nach_id = tage30["championData"]
    paare = {}
    for c in nach_id.values():
        rollen = {}
        for r, st in (c.get("statsByRole") or {}).items():
            if not st.get("games"):
                continue
            eintrag = {}
            for kurz, feld in (("m", "matchup"), ("s", "synergy")):
                tabelle = {}
                for rolle2, karte in (st.get(feld) or {}).items():
                    innen = {}
                    for fremd_id, w in karte.items():
                        if w.get("games", 0) < DRAFT_MIN:
                            continue
                        fremd = nach_id.get(fremd_id)
                        if not fremd or fremd["name"] not in nr:
                            continue
                        innen[str(nr[fremd["name"]])] = [
                            w["games"], round(1000 * w["wins"] / w["games"])]
                    if innen:
                        tabelle[rolle2] = innen
                if tabelle:
                    eintrag[kurz] = tabelle
            if eintrag:
                rollen[r] = eintrag
        if rollen and c["name"] in nr:
            paare[str(nr[c["name"]])] = rollen

    gesamt = len(json.dumps({"basis": basis, "paare": paare},
                            separators=(",", ":"))) // 1024
    print(f"  Draft: Patch {aktuell.get('version')}, {len(basis)} Champions, "
          f"{len(paare)} mit Matchups ({gesamt} KB)")
    # Zwei Datensaetze, zwei Fenster (Audit P2.5): Staerke, Schaden und
    # Kurve aus dem laufenden Patch, Matchups und Synergien aus den
    # letzten 30 Tagen - die koennen ueber mehrere Patches reichen und
    # duerfen nicht das Etikett des Patches tragen.
    tage = str(tage30.get("version") or "")
    fenster = {
        "staerke": {"patch": aktuell.get("version"),
                    "stand": (aktuell.get("date") or "")[:10]},
        "paare": {"tage": int(tage) if tage.isdigit() else None,
                  "stand": (tage30.get("date") or "")[:10]},
    }
    return {"version": aktuell.get("version"),
            "stand": (aktuell.get("date") or "")[:10],
            "fenster": fenster,
            "namen": namen, "basis": basis, "paare": paare,
            "schaden": schaden, "zeit": zeit}


def embed_splashes(champs, icons):
    """Splash-Art der uebergebenen Champions einbetten.

    Geholt wird nur, was wirklich gebraucht wird: der meistgespielte Champion
    je Spieler. Ohne Pillow wird nicht verkleinert - dann lieber gar kein
    Splash als eine 13-MB-Datei."""
    if not champs:
        return {}
    try:
        from PIL import Image
    except ImportError:
        print("  Splash: Pillow fehlt - uebersprungen "
              "(pip install pillow, dann neu bauen)")
        return {}
    SPLASH_CACHE.mkdir(parents=True, exist_ok=True)
    out, geholt, fehler = {}, 0, []
    for champ in sorted(champs):
        key = icons.get(champ)
        if not key:
            continue
        pfad = SPLASH_CACHE / f"{key}-{SPLASH_PX}.webp"
        if not pfad.exists():
            url = SPLASH_URL.format(key=key)
            try:
                anfrage = urllib.request.Request(
                    url, headers={"User-Agent": "Mozilla/5.0"})
                roh = urllib.request.urlopen(anfrage, timeout=30).read()
                bild = Image.open(io.BytesIO(roh)).convert("RGB")
                hoehe = round(bild.height * SPLASH_PX / bild.width)
                bild = bild.resize((SPLASH_PX, hoehe), Image.LANCZOS)
                puffer = io.BytesIO()
                bild.save(puffer, "WEBP", quality=SPLASH_Q, method=6)
                pfad.write_bytes(puffer.getvalue())
                geholt += 1
            except (urllib.error.HTTPError, urllib.error.URLError, OSError,
                    ValueError) as exc:
                fehler.append(f"{champ} ({exc})")
                continue
        out[champ] = ("data:image/webp;base64,"
                      + base64.b64encode(pfad.read_bytes()).decode("ascii"))
    gesamt = sum(len(v) for v in out.values()) // 1024
    print(f"  Splash: {len(out)} eingebettet ({geholt} neu geladen, {gesamt} KB)")
    for f in fehler[:5]:
        print(f"    ! kein Splash fuer {f}")
    return out


# Die Queues, zwischen denen die Karte umschalten kann. LIGA kommt aus den
# Turnierpartien und hat keine Championbloecke.
SPLASH_QUEUES = ("RANKED", "SOLO", "FLEX")


def top_champions(teams):
    """Der meistgespielte Champion je Spieler - fuer JEDE Auswahl, die die
    Karte zulaesst.

    Frueher wurden hier alle Seasonbloecke aneinandergehaengt und daraus ein
    einziger Champion bestimmt. Die Karte rechnet aber je gewaehlter Queue
    und Season neu zusammen (siehe championRows/seasonEntries im Template) -
    fuer zehn Spieler war das ein anderer Champion, und deren Banner blieb
    leer. Darum hier dieselbe Rechnung wie dort, ueber alle Kombinationen."""
    seasons = {None}
    for team in teams:
        for spieler in team.get("players") or []:
            for queue in SPLASH_QUEUES:
                for block in (spieler.get("queues") or {}).get(queue) or []:
                    if block.get("id") is not None:
                        seasons.add(block["id"])

    raus = set()
    for team in teams:
        for spieler in team.get("players") or []:
            for queue in SPLASH_QUEUES:
                for season in seasons:
                    summe = {}
                    for block in (spieler.get("queues") or {}).get(queue) or []:
                        if (block.get("id") is not None and season is not None
                                and block["id"] != season):
                            continue
                        for c in block.get("champions") or []:
                            summe[c["champ"]] = (summe.get(c["champ"], 0)
                                                 + c["win"] + c["lose"])
                    if summe:
                        raus.add(max(summe, key=summe.get))
    raus.discard(None)
    raus.discard("")
    return raus


def multisearch_url(region, members):
    """op.gg-Multisearch: alle Riot-IDs eines Teams auf einer Seite."""
    if not members:
        return None
    ids = ",".join(p["riotId"] for p in members)
    return (f"https://op.gg/lol/multisearch/{region}"
            f"?summoners={urllib.parse.quote(ids, safe=',')}")


def own_teams(teams):
    """Die Teams des eigenen Vereins: der Verein aus league.json, zu dem das
    erste Team in teams.json gehoert. Die Teamauswahl stellt sie nach oben."""
    if not teams:
        return []
    first = teams[0]["team"]
    path = ROOT / "league.json"
    if path.exists():
        for club in json.loads(path.read_text(encoding="utf-8")):
            names = club.get("teams") or [club["club"]]
            if first in names:
                return [n for n in names if any(t["team"] == n for t in teams)]
    return [first]


def league_opponents(teams):
    """Alle Teamnamen der Liga fuer die Gegnerauswahl: gescoutete Teams plus die
    Vereine aus league.json, zu denen noch kein Roster existiert."""
    names = [t["team"] for t in teams]
    path = ROOT / "league.json"
    if path.exists():
        for club in json.loads(path.read_text(encoding="utf-8")):
            for name in (club.get("teams") or [club["club"]]):
                if name not in names:
                    names.append(name)
    return names


def load_liga():
    """data/liga/*.json -> {Teamname: Block}. Die Turnierzahlen der Liga
    (leagueofregions.com) - echte Partien statt Soloqueue. Fehlt der Ordner,
    baut das Board wie bisher."""
    ordner = ROOT / "data" / "liga"
    if not ordner.exists():
        return {}
    out = {}
    for path in sorted(ordner.glob("*.json")):
        blob = json.loads(path.read_text(encoding="utf-8"))
        # Im selben Ordner liegen auch Rohdaten und die Championnummern -
        # eine Teamdatei erkennt man am Feld "team".
        if isinstance(blob, dict) and blob.get("team") and blob.get("spieler"):
            out[blob["team"]] = blob
    return out


def meta_nach_rollen(icons):
    """Picks und Bans der Liga, aufgeteilt nach Position.

    Die Statistikseite kennt keine Rollen - erst die einzelnen Partien sagen,
    wer auf welcher Position welchen Champion gespielt hat. Bans haben von
    Haus aus gar keine Rolle; sie werden der Position zugeschlagen, auf der
    der Champion in dieser Liga am haeufigsten gespielt wurde. Wer nie gepickt
    wurde, laesst sich nicht zuordnen und wird gesondert ausgewiesen."""
    pfad = ROOT / "data" / "liga" / "partien-roh.json"
    if not pfad.exists():
        return None
    nummern_datei = ROOT / "data" / "liga" / "champion-ids.json"
    nummern = (json.loads(nummern_datei.read_text(encoding="utf-8"))
               if nummern_datei.exists() else {})
    nach_anzeige = {schluessel: name for name, schluessel in (icons or {}).items()}

    picks, rolle_von, bans = {}, {}, {}
    partien = json.loads(pfad.read_text(encoding="utf-8"))
    for eintrag in partien:
        stats = eintrag.get("stats") or {}
        for m in stats.get("game_match_participant") or []:
            rolle, champ = m.get("team_position"), m.get("champion_name")
            if not (rolle and champ):
                continue
            zahl = picks.setdefault(rolle, {}).setdefault(champ, [0, 0, 0, 0, 0])
            zahl[0] += 1
            zahl[1] += 1 if m.get("win") else 0
            zahl[2] += m.get("kills") or 0
            zahl[3] += m.get("deaths") or 0
            zahl[4] += m.get("assists") or 0
            rolle_von.setdefault(champ, {})
            rolle_von[champ][rolle] = rolle_von[champ].get(rolle, 0) + 1
        for t in stats.get("game_match_team") or []:
            for b in t.get("bans") or []:
                if b and b > 0:
                    champ = nummern.get(str(b))
                    if champ:
                        bans[champ] = bans.get(champ, 0) + 1

    # Jeder Ban landet dort, wo der Champion am oeftesten gespielt wurde.
    ban_je_rolle, ohne_rolle = {}, 0
    for champ, anzahl in bans.items():
        wo = rolle_von.get(champ)
        if not wo:
            ohne_rolle += anzahl
            continue
        beste = max(wo.items(), key=lambda x: x[1])[0]
        ban_je_rolle.setdefault(beste, {})[champ] = anzahl

    rollen = []
    for rolle in ROLE_ORDER:
        champs = picks.get(rolle) or {}
        gebannt = ban_je_rolle.get(rolle) or {}
        if not champs and not gebannt:
            continue
        zeilen = []
        for champ in set(champs) | set(gebannt):
            z = champs.get(champ) or [0, 0, 0, 0, 0]
            tode = z[3]
            zeilen.append({
                "champ": nach_anzeige.get(champ, champ),
                "picks": z[0], "siege": z[1],
                "quote": round(z[1] / z[0] * 100) if z[0] else None,
                "kda": round((z[2] + z[4]) / tode, 2) if tode else
                       (float(z[2] + z[4]) if z[0] else None),
                "bans": gebannt.get(champ, 0),
            })
        zeilen.sort(key=lambda r: (-r["picks"], -r["bans"], r["champ"]))
        rollen.append({"role": rolle,
                       "picks": sum(r["picks"] for r in zeilen),
                       "bans": sum(r["bans"] for r in zeilen),
                       "champs": zeilen})
    if not rollen:
        return None
    return {"rollen": rollen, "ohneRolle": ohne_rolle, "partien": len(partien)}


def liga_gesamt(icons):
    """Die ligaweiten Zahlen fuer den Reiter Liga: Meta, Seiten, Rekorde.

    Nur das Noetige - die Rohdatei ist 33 KB gross, davon braucht die Seite
    einen Bruchteil."""
    pfad = ROOT / "data" / "liga" / "gesamt.json"
    if not pfad.exists():
        return None
    d = json.loads(pfad.read_text(encoding="utf-8"))
    nach_anzeige = {schluessel: name for name, schluessel in (icons or {}).items()}
    zeige = lambda n: nach_anzeige.get(n, n)

    # Praesenz (Picks/Bans) und Bilanz stehen in zwei Listen - zusammenfuehren.
    bilanz = {c["name"]: c for c in (d.get("champions", {}).get("liste") or [])}
    meta = []
    for e in d.get("praesenz", {}).get("liste") or []:
        b = bilanz.get(e["name"], {})
        meta.append({"champ": zeige(e["name"]), "picks": e.get("picks", 0),
                     "bans": e.get("bans", 0), "praesenz": e.get("praesenz", 0),
                     "siege": b.get("siege"), "quote": b.get("quote"),
                     "kda": b.get("kda")})
    meta.sort(key=lambda m: (-m["praesenz"], -m["picks"], m["champ"]))

    rekorde = []
    for r in d.get("rekorde") or []:
        erster = (r.get("plaetze") or [{}])[0]
        wer = (erster.get("spieler") or {}).get("name") or (erster.get("mannschaft") or {}).get("name")
        if not wer:
            continue
        rekorde.append({"name": r.get("name"), "wer": wer,
                        "wert": erster.get("anzeige") or erster.get("wert"),
                        "einheit": r.get("einheit"),
                        "champ": zeige(erster["champion"]) if erster.get("champion") else None})

    return {
        "geholtAm": d.get("geholtAm"),
        "uebersicht": d.get("uebersicht"),
        "partienLiga": d.get("partienLiga"),
        "seiten": d.get("seiten"),
        "meta": meta,
        "mannschaften": [{"name": m["name"], "verein": m.get("verein"),
                          "partien": m["partien"], "siege": m["siege"],
                          "quote": m["quote"]}
                         for m in (d.get("mannschaften", {}).get("liste") or [])],
        "rekorde": rekorde,
        "rollen": d.get("rollenschnitt"),
        "nachRollen": meta_nach_rollen(icons),
    }


def rollen_aus_partien(icons):
    """Wer auf welcher Rolle was gespielt hat - aus den geholten Partien.

    Die Statistik-Endpunkte liefern nur Rollenanteile ohne Champions; erst die
    einzelnen Partien sagen, welcher Champion auf welcher Position lief."""
    pfad = ROOT / "data" / "liga" / "partien-roh.json"
    if not pfad.exists():
        return {}
    nach_anzeige = {schluessel: name for name, schluessel in (icons or {}).items()}
    gesammelt = {}
    for eintrag in json.loads(pfad.read_text(encoding="utf-8")):
        for m in (eintrag.get("stats") or {}).get("game_match_participant") or []:
            name = m.get("anzeige_name") or m.get("username")
            rolle = m.get("team_position") or m.get("individual_position")
            champ = m.get("champion_name")
            if not (name and rolle and champ):
                continue
            eintraege = gesammelt.setdefault(name.lower(), {}).setdefault(rolle, {})
            zahl = eintraege.setdefault(nach_anzeige.get(champ, champ), [0, 0])
            zahl[0] += 1
            zahl[1] += 1 if m.get("win") else 0

    fertig = {}
    for name, rollen in gesammelt.items():
        if len(rollen) < 2:            # nur wer wirklich gewechselt hat
            continue
        fertig[name] = sorted(
            ({"role": rolle,
              "partien": sum(z[0] for z in champs.values()),
              "champs": sorted(({"champ": c, "partien": z[0], "siege": z[1]}
                                for c, z in champs.items()),
                               key=lambda c: (-c["partien"], c["champ"]))}
             for rolle, champs in rollen.items()),
            key=lambda r: -r["partien"])
    return fertig


def load_riot_ids():
    """Die Riot-IDs, die die Liga zu ihren Spielern fuehrt.

    Nur damit lassen sich Ligaspieler und Rostereintraege sicher zusammen-
    bringen: Anzeigenamen aehneln sich gern, gehoeren aber zu verschiedenen
    Accounts."""
    pfad = ROOT / "data" / "liga" / "riot-ids.json"
    if not pfad.exists():
        return {}
    try:
        return json.loads(pfad.read_text(encoding="utf-8"))
    except ValueError:
        return {}


def attach_liga(teams, liga, icons, roster=None):
    """Die Ligazahlen als eigene Queue an die Spieler haengen.

    Bewusst nicht in "Alle" eingerechnet: dieselben Spiele stehen oft auch in
    games.json und wuerden sonst doppelt zaehlen."""
    # Die Liga nennt Champions wie Riot intern: DrMundo, JarvanIV, Kaisa.
    # icons bildet Anzeigename -> Riot-Schluessel ab; umgedreht wird daraus
    # die Uebersetzung, sonst findet die Seite kein Bild dazu.
    nach_anzeige = {schluessel: name for name, schluessel in (icons or {}).items()}

    def zeilen_zu_champions(zeilen):
        # Vier Werte seit der Umstellung auf den Spielerendpunkt: der liefert
        # auch die KDA. Aeltere Dateien haben nur drei.
        return [{"champ": nach_anzeige.get(z[0], z[0]),
                 "win": z[2], "lose": z[1] - z[2],
                 "winRate": round(z[2] / z[1] * 100) if z[1] else 0,
                 "kda": z[3] if len(z) > 3 else None,
                 "kp": None, "csPerMin": None}
                for z in zeilen]

    # Wer in teams.json steht, aber nie gescrapt wurde, taucht hier trotzdem
    # als Roster-Eintrag auf - damit er seine Riot-ID und Rolle behaelt.
    aus_roster = {}
    for eintrag in roster or []:
        for spieler in eintrag.get("players") or []:
            for name in (spieler["label"], (spieler.get("riotId") or "").partition("#")[0]):
                if name.strip():
                    aus_roster.setdefault((eintrag["team"], name.strip().lower()), spieler)

    wechsler = rollen_aus_partien(icons)
    riot_ids = load_riot_ids()
    regionen = {e["team"]: e.get("region", "euw") for e in roster or []}

    zusammen = {}
    for team in teams:
        block = liga.get(team["team"])
        if not block:
            continue
        rollen = block.get("rollen") or {}
        nummern = block.get("nummern") or {}

        # Die Liga kennt Spieler unter ihrem Riot-Namen, das Board oft unter
        # einem eigenen Anzeigenamen (Verveigar = TWM Nirwana). Deshalb auch
        # gegen den Namensteil der Riot-ID abgleichen.
        # Die Liga nennt ihre Mannschaften anders als wir ("... I").
        liga_ids = riot_ids.get(block.get("ligaName")) or {}

        nach_name, nach_riot = {}, {}
        for member in team["players"]:
            nach_name[member["label"].lower()] = member
            voll = (member.get("riotId") or "").strip().lower()
            if voll:
                nach_riot.setdefault(voll, member)
            # Von Hand gesetzt, wenn sich der Ligenname gar nicht ableiten
            # laesst - etwa nach einer Umbenennung. Steht in teams.json, nicht
            # in den Scrape-Daten, darum ueber den Rostereintrag.
            eintrag = aus_roster.get((team["team"], member["label"].lower())) or {}
            liganame = (eintrag.get("ligaName") or member.get("ligaName") or "").strip()
            member["ligaName"] = liganame or None
            if liganame:
                nach_name.setdefault(liganame.lower(), member)
            riot = (member.get("riotId") or "").partition("#")[0].strip().lower()
            if riot:
                nach_name.setdefault(riot, member)

        getroffen, zusaetzlich = 0, []
        for name, zeilen in (block.get("spieler") or {}).items():
            champions = zeilen_zu_champions(zeilen)
            # Zuerst ueber die Riot-ID, die die Liga zu diesem Spieler fuehrt -
            # die ist eindeutig. Erst danach ueber den Namen.
            liga_riot = (liga_ids.get(name) or {}).get("riotId")
            member = (nach_riot.get((liga_riot or "").strip().lower())
                      or nach_name.get(name.lower()))
            if member is not None:
                member["queues"]["LIGA"] = [{"id": None, "champions": champions}]
                rollen_wechsel = wechsler.get(name.lower())
                if rollen_wechsel:
                    member["ligaRollen"] = rollen_wechsel
                getroffen += 1
                continue
            # Nur der Liga bekannt: als eigene Karte aufnehmen, damit wirklich
            # alle Spieler eines Teams sichtbar sind. Ohne Riot-ID gibt es
            # dafuer keine Soloqueue-Zahlen.
            nummer = nummern.get(name)
            bekannt = aus_roster.get((team["team"], name.lower())) or {}
            # Die Liga kennt seine Riot-ID, auch wenn er in keinem Roster steht.
            riot_id = bekannt.get("riotId") or liga_riot or ""
            zusaetzlich.append({
                "label": bekannt.get("label") or name,
                "riotId": riot_id,
                "role": bekannt.get("role") or rollen.get(name) or "UNKNOWN",
                "bench": bool(bekannt.get("bench")),
                "team": team["team"],
                "opggUrl": (opgg_url(regionen.get(team["team"], "euw"), riot_id)
                            or (f"https://leagueofregions.com/stats/spieler/{nummer}"
                                if nummer else None)),
                "imRoster": bool(bekannt),
                "note": ("Noch nicht von op.gg geholt - Zahlen nur aus der Liga."
                         if riot_id else
                         "Nur aus der Liga bekannt, ohne hinterlegten Riot-Account."),
                "lastUpdated": None,
                "solo": None, "flex": None, "mastery": [], "style": {},
                "queues": {"LIGA": [{"id": None, "champions": champions}]},
                "ligaRollen": wechsler.get(name.lower()),
                "nurLiga": True,
            })

        if zusaetzlich:
            team["players"].extend(zusaetzlich)
            team["players"].sort(key=lambda p: (p["bench"], ROLE_ORDER.index(p["role"])
                                 if p["role"] in ROLE_ORDER else len(ROLE_ORDER)))

        zusammen[team["team"]] = {
            "name": block.get("ligaName"), "partien": block.get("partien"),
            "siege": block.get("siege"), "geholtAm": block.get("geholtAm"),
            "spieler": getroffen + len(zusaetzlich),
            "nurLiga": [p["label"] for p in zusaetzlich if not p.get("imRoster")],
            "ohneScrape": [p["label"] for p in zusaetzlich if p.get("imRoster")],
        }
    return zusammen


def load_plan():
    """draftplan.json -> {Team: {Spieler: {blind, likes, note}}}.

    Was jemand blind picken kann und was er gern spielt, steht in keiner
    Statistik - das traegt das Team selbst ein. Fehlt die Datei, baut das Board
    trotzdem, dann ist der Reiter eben leer."""
    path = ROOT / "draftplan.json"
    if not path.exists():
        return {}
    return {entry["team"]: entry.get("players") or {}
            for entry in json.loads(path.read_text(encoding="utf-8"))}


def opgg_url(region, riot_id):
    """Wie auto_scrape.py die Profiladresse baut - hier fuer Spieler, die
    mangels Daten nie durch den Scrape gelaufen sind."""
    if not riot_id:
        return None
    name, _, tag = riot_id.partition("#")
    return (f"https://op.gg/lol/summoners/{region}/"
            f"{urllib.parse.quote(name)}-{urllib.parse.quote(tag)}")


def nachtragen(teams, roster):
    """Wer in teams.json steht, bekommt eine Karte - auch ohne jede Zahl.

    Ohne das verschwindet ein Spieler spurlos, sobald op.gg sein Profil nicht
    findet (Umbenennung) und die Liga ihn noch nicht kennt. Gerade dann will
    man ihn aber sehen, denn nur so faellt auf, dass die Riot-ID nicht mehr
    stimmt."""
    nach_team = {t["team"]: t for t in teams}
    for eintrag in roster:
        ziel = nach_team.get(eintrag["team"])
        if ziel is None:
            continue
        # Hat die ganze Mannschaft noch keine Scrape-Daten, ist sie neu und
        # wurde schlicht noch nicht geholt - "vermutlich umbenannt" waere
        # dort eine Behauptung ins Blaue.
        nie_geholt = not ziel["players"]
        da = {p["label"].lower() for p in ziel["players"]}
        da |= {(p.get("riotId") or "").partition("#")[0].strip().lower()
               for p in ziel["players"]}
        neu = []
        for spieler in eintrag.get("players") or []:
            if spieler["label"].lower() in da:
                continue
            neu.append({
                "label": spieler["label"],
                "riotId": spieler.get("riotId") or "",
                "role": spieler.get("role") or "UNKNOWN",
                "bench": bool(spieler.get("bench")),
                "team": eintrag["team"],
                "opggUrl": opgg_url(eintrag.get("region", "euw"),
                                    spieler.get("riotId") or ""),
                "note": spieler.get("note") or (
                    "Für diese Mannschaft wurden noch keine op.gg-Daten "
                    "geholt — Knopf „Daten holen“ oder python auto_scrape.py."
                    if nie_geholt else
                    "Kein op.gg-Profil unter dieser Riot-ID und noch keine "
                    "Ligapartie - vermutlich umbenannt."),
                "ohneDaten": True,
                "lastUpdated": None,
                "solo": None, "flex": None, "mastery": [], "style": {},
                "queues": {},
            })
        if neu:
            ziel["players"].extend(neu)
            ziel["players"].sort(key=lambda p: (p["bench"],
                                 ROLE_ORDER.index(p["role"])
                                 if p["role"] in ROLE_ORDER else len(ROLE_ORDER)))


def attach_plan(teams, plan, known_champions):
    """Den Draftplan an die Spieler haengen und Tippfehler melden.

    Bewusst hier und nicht in to_player(): das liest die Scrape-Datei, ein Feld
    dort waere erst nach dem naechsten Scrape sichtbar. Der Plan aendert sich
    aber woechentlich."""
    warn = []
    for team in teams:
        per_team = plan.get(team["team"], {})
        for member in team["players"]:
            entry = per_team.get(member["label"]) or {}

            def clean(names, label=member["label"], name=team["team"]):
                """Reihenfolge behalten, Doppelte raus, Tippfehler melden."""
                seen, out = set(), []
                for champ in names or []:
                    if champ in seen:
                        continue
                    seen.add(champ)
                    out.append(champ)
                    if champ not in known_champions:
                        warn.append(f"{name}/{label}: \"{champ}\" ist kein Champion")
                return out

            # "first" gab es frueher als zweite Liste. Wer noch eine alte Datei
            # hat, soll die Eintraege nicht verlieren - sie wandern nach vorn.
            member["plan"] = {
                "blind": clean(list(entry.get("first") or [])
                               + list(entry.get("blind") or [])),
                "likes": clean(entry.get("likes")),
                "note": entry.get("note"),
            }
    return warn


def load_games():
    """games.json -> die flache Form, die die Seite intern nutzt.

    In games.json steht ein Spiel EINMAL, mit beiden Seiten:
      {"series": "...", "game": 1, "format": "fearless",
       "date": "2026-09-02", "blue": "AFC1", "red": "Innerstetal",
       "winner": "AFC1",
       "picks": {"AFC1": [{"role": "TOP", "player": "bandit", "champ": "Ornn"}, ...],
                 "Innerstetal": [...]},
       "bans":  {"AFC1": ["Ornn", ...], "Innerstetal": [...]}}
    Die Seite braucht pro Team einen Eintrag (Turnier-Spalte haengt am Team),
    also wird jedes Spiel zu zwei Datensaetzen aufgeklappt."""
    path = ROOT / "games.json"
    if not path.exists():
        return []
    out = []
    for entry in json.loads(path.read_text(encoding="utf-8")):
        sides = [entry["blue"], entry["red"]]
        for team in sides:
            other = sides[1] if team == sides[0] else sides[0]
            out.append({
                "fixed": True,
                "series": entry.get("series"),
                "game": entry.get("game"),
                "format": entry.get("format"),
                # Muss mitreisen: die Seite schreibt games.json zurueck.
                "matchId": entry.get("matchId"),
                "team": team,
                "opponent": other,
                "date": entry.get("date", ""),
                # Genaue Anstosszeit, wenn die Liga sie geliefert hat - nur
                # damit laesst sich Play-in vor Halbfinale vor Finale sortieren.
                "time": entry.get("time") or "",
                "side": "blue" if team == entry["blue"] else "red",
                # winner darf fehlen (Ergebnis noch nicht nachgetragen).
                "result": ("win" if entry.get("winner") == team
                           else "loss" if entry.get("winner") else "unknown"),
                "picks": entry.get("picks", {}).get(team, []),
                "bansOwn": entry.get("bans", {}).get(team, []),
                "bansOpp": entry.get("bans", {}).get(other, []),
                "note": entry.get("note") or "",
                # Die Zahlen der Partie - nur bei Spielen aus der Liga. Von
                # Hand eingetragene Spiele haben sie nicht, die Seite muss
                # also ohne sie auskommen.
                "dauer": entry.get("dauer"),
                "teamStats": (entry.get("teamStats") or {}).get(team),
                "teamStatsOpp": (entry.get("teamStats") or {}).get(other),
                "auszeichnungen": entry.get("auszeichnungen") or [],
            })
    return out


def embed_medals():
    """Rang-Embleme (medals_new, 72px webp) einbetten - nur zehn Bilder, die
    liegen in beiden Bauvarianten mit drin."""
    ICON_CACHE.mkdir(parents=True, exist_ok=True)
    out = {}
    for tier in TIERS:
        path = ICON_CACHE / f"medal-{tier}.webp"
        if not path.exists():
            request = urllib.request.Request(MEDAL_URL.format(tier=tier),
                                             headers={"User-Agent": "Mozilla/5.0"})
            path.write_bytes(urllib.request.urlopen(request, timeout=30).read())
        out[tier] = "data:image/webp;base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    return out


def embed_fonts():
    """Die drei Schriften als @font-face mit data:-URI zurueckgeben, damit die
    Standalone-Datei ohne Internet genauso aussieht wie hier. Klappt das nicht,
    kommt None zurueck und die Seite laedt weiter von Google."""
    FONT_CACHE.mkdir(parents=True, exist_ok=True)
    sheet = FONT_CACHE / "google-fonts.css"
    try:
        if not sheet.exists():
            request = urllib.request.Request(FONT_CSS, headers=BROWSER_UA)
            sheet.write_bytes(urllib.request.urlopen(request, timeout=30).read())
        css = sheet.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"  ! Schriften nicht geladen ({exc}) - Seite bleibt bei Google Fonts")
        return None

    # Google liefert je Schnitt einen @font-face-Block, davor ein Kommentar mit
    # dem Subset. latin deckt Deutsch ab, latin-ext Namen wie "Koestja" mit
    # durchgestrichenem o.
    groups, order = {}, []
    blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{[^}]*\})", css)
    for subset, block in blocks:
        if subset not in ("latin", "latin-ext"):
            continue
        found = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)", block)
        if not found:
            continue
        url = found.group(1)
        if url not in groups:
            groups[url] = []
            order.append(url)
        groups[url].append(block)

    faces, missing = [], 0
    for url in order:
        path = FONT_CACHE / url.rsplit("/", 1)[-1]
        try:
            if not path.exists():
                request = urllib.request.Request(url, headers=BROWSER_UA)
                path.write_bytes(urllib.request.urlopen(request, timeout=30).read())
        except OSError:
            missing += 1
            continue
        blob = base64.b64encode(path.read_bytes()).decode("ascii")
        face = groups[url][0].replace(url, "data:font/woff2;base64," + blob)
        # Archivo und Source Sans sind variabel: alle Gewichte stecken in
        # derselben Datei. Sie je Gewicht einzubetten wuerde die Seite ohne
        # jeden Gewinn aufblaehen - stattdessen eine Spanne eintragen.
        weights = []
        for block in groups[url]:
            found = re.search(r"font-weight:\s*([\d ]+);", block)
            if found:
                weights += [int(w) for w in found.group(1).split()]
        if weights and min(weights) != max(weights):
            face = re.sub(r"font-weight:\s*[\d ]+;",
                          f"font-weight: {min(weights)} {max(weights)};", face, count=1)
        faces.append(face)

    if not faces:
        print("  ! Keine Schrift eingebettet - Seite bleibt bei Google Fonts")
        return None
    size = sum(len(f) for f in faces) / 1024
    note = f", {missing} nicht geladen" if missing else ""
    print(f"  Schriften: {len(faces)} Schnitte eingebettet ({size:.0f} KB{note})")
    return "<style>\n" + "\n".join(faces) + "\n</style>"


def build(embed=False, pages=False):
    raw_players, raw_queues, icons, version, scraped, raw_names = load_raw()
    plan = load_plan()
    roster = json.loads((ROOT / "teams.json").read_text(encoding="utf-8"))
    champion_list = json.loads((ROOT / "data" / "champions.json").read_text(encoding="utf-8"))

    players = [to_player(p, raw_queues.get(key)) for key, p in raw_players.items()]
    known = {p["label"] for p in players}
    missing = [(t["team"], e["label"]) for t in roster for e in t["players"]
               if e["label"] not in known]

    teams = []
    for entry in roster:
        members = [p for p in players if p["team"] == entry["team"]]
        # Eine neu aus der Liga uebernommene Mannschaft hat noch keine
        # op.gg-Daten. Sie trotzdem zeigen: nachtragen() baut die Karten aus
        # teams.json, und nur so sieht man ueberhaupt, dass sie da ist und
        # dass ihr noch Daten fehlen. Nur wirklich leere Eintraege fallen raus.
        if not members and not (entry.get("players") or []):
            continue
        # teams.json ist der gepflegte Kader und schlaegt die Scrape-Metadaten:
        # dort steht die Rolle nur so, wie sie beim Scrapen galt. Ohne das
        # bleibt jede Rollen- oder Bankaenderung wirkungslos, bis der Spieler
        # zufaellig neu gescrapt wird.
        gepflegt = {}
        for e in entry.get("players") or []:
            for schluessel in ((e.get("riotId") or "").strip().lower(),
                               (e.get("label") or "").strip().lower()):
                if schluessel:
                    gepflegt.setdefault(schluessel, e)
        for member in members:
            e = (gepflegt.get((member.get("riotId") or "").strip().lower())
                 or gepflegt.get((member.get("label") or "").strip().lower()))
            if not e:
                continue
            if e.get("role"):
                member["role"] = e["role"]
            member["bench"] = bool(e.get("bench"))
            if e.get("label"):
                member["label"] = e["label"]

        # Starter zuerst (in Rollenreihenfolge), danach die Bank.
        members.sort(key=lambda p: (p["bench"], ROLE_ORDER.index(p["role"])
                     if p["role"] in ROLE_ORDER else len(ROLE_ORDER)))
        teams.append({
            "team": entry["team"],
            "players": members,
            # Ein Link, der alle Profile des Teams auf op.gg oeffnet - von dort
            # ist der Update-Knopf je Spieler einen Klick entfernt.
            "multisearch": multisearch_url(entry.get("region", "euw"), members),
        })
    # Teams, die nur in den Rohdaten stehen (noch nicht in teams.json), anhaengen.
    for name in dict.fromkeys(p["team"] for p in players):
        if not any(t["team"] == name for t in teams):
            teams.append({"team": name, "players": [p for p in players if p["team"] == name]})

    # Erst die Liga: sie kann Spieler ergaenzen, die nur dort bekannt sind.
    # Der Draftplan laeuft danach, damit auch die einen Eintrag bekommen.
    liga = attach_liga(teams, load_liga(), icons, roster)
    nachtragen(teams, roster)
    plan_warn = attach_plan(teams, plan, set(champion_list))

    seasons = sorted({s["id"] for p in players for q in p["queues"].values()
                      for s in q if s["id"] is not None}, reverse=True)
    champions = sorted(set(champion_list) | set(icons))

    # Rohdatei schlaegt Tabelle: was op.gg beim Scrapen anzeigte, gilt.
    named = {**SEASON_NAMES, **raw_names}
    data = {
        "version": version,
        # Laufender Patch laut Data Dragon zum Zeitpunkt des Scrapes - der
        # Bezug fuer die Patchwarnung im Live Draft (Audit P2.5).
        "patchLive": PATCH_LIVE,
        "scrapedAt": scraped,
        "seasons": seasons,
        "seasonNames": {str(s): named[s] for s in seasons if s in named},
        "icons": icons,
        "medals": embed_medals(),
        "champions": champions,
        "teams": teams,
        "games": load_games(),
        # Vereine der Liga: Gegner, zu denen (noch) keine Spielerdaten
        # vorliegen - stehen nur als Auswahl im Turnierformular.
        "opponents": league_opponents(teams),
        "liga": liga,
        "ligaGesamt": liga_gesamt(icons),
        "ownTeams": own_teams(teams),
    }
    if embed:
        data["iconData"] = embed_icons(icons, version)
        # Splash nur fuer die Champions, die als Kopfbild gebraucht werden -
        # der meistgespielte je Spieler.
        data["splashData"] = embed_splashes(top_champions(teams), icons)
        # Matchups und Synergien fuer den Draft-Berater.
        draft = draft_daten()
        if draft:
            data["draft"] = draft

    # Die handgepflegte Championeinschaetzung. Sie wird IMMER eingebettet,
    # auch ohne --pages: ohne sie fehlen der Comp-Bewertung die
    # strukturellen Achsen. Fehlt die Datei, laeuft alles weiter - die
    # Achsen fallen dann aus Summe und Hoechstwert.
    heuristik_datei = ROOT / "data" / "champion-heuristik.json"
    if heuristik_datei.exists():
        roh = json.loads(heuristik_datei.read_text(encoding="utf-8"))
        gepflegt = len(roh.get("champions") or {})
        vorschlag = len(set(roh.get("vorschlag") or {}) - set(roh.get("champions") or {}))
        data["heuristik"] = roh
        print(f"  Heuristik: {gepflegt} vom Team gepflegt, {vorschlag} als"
              " ungepruefte Ersteinschaetzung"
              + (" - die strukturellen Achsen bleiben leer"
                 if not (gepflegt or vorschlag) else ""))

    # Seitenname = eigenes Team (erster Eintrag in teams.json) + Draftboard.
    title = (teams[0]["team"] + " Draftboard") if teams else "Draftboard"
    # Die Standalone-Datei traegt den Namen, den die Mitspieler im Chat sehen.
    target = OUT.parent / (title.replace(" ", "-") + ".html") if embed else OUT
    template = (ROOT / "template.html").read_text(encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    # Die Weitergabe-Datei traegt die Schriften selbst, die Arbeitsversion holt
    # sie wie bisher von Google.
    fonts = (embed_fonts() or FONT_LINK) if embed else FONT_LINK
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        template.replace("__TITLE__", title).replace("__FONTS__", fonts)
                .replace("__ENGINE__", engine_buendeln() or "")
                .replace("__DATA__", payload),
        encoding="utf-8")

    # Fuer GitHub Pages muss die Seite als index.html im Hauptordner liegen.
    if pages:
        page = ROOT / "index.html"
        page.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"index.html  {page.stat().st_size / 1024:.0f} KB  (fuer GitHub Pages)")
    print(f"{target.relative_to(ROOT)}  {target.stat().st_size / 1024:.0f} KB")
    for team in teams:
        counts = {}
        for player in team["players"]:
            for name, entries in player["queues"].items():
                counts[name] = counts.get(name, 0) + sum(len(s["champions"]) for s in entries)
        detail = ", ".join(f"{k} {v}" for k, v in sorted(counts.items()))
        planned = sum(1 for p in team["players"]
                      if p["plan"]["blind"] or p["plan"]["likes"])
        extra = f" | Draftplan {planned}/{len(team['players'])}" if planned else ""
        l = liga.get(team["team"])
        extra += (f" | Liga {l['partien']} Partien, {l['spieler']} Spieler"
                  if l else "")
        print(f"  {team['team']}: {len(team['players'])} Spieler | "
              f"Zeilen: {detail}{extra}")
    if data["games"]:
        series = {g["series"] for g in data["games"] if g.get("series")}
        print(f"  Turnierspiele: {len(data['games']) // 2} in {len(series)} Serie(n)")
    print("  Seasons: " + ", ".join(named.get(s, "S" + str(s)) for s in seasons))
    for team, label in missing:
        print(f"  ! {team}/{label}: keine Scrape-Daten in data/raw/")
    for line in plan_warn:
        print("  ! " + line)


if __name__ == "__main__":
    # --pages bettet immer ein: die Seite im Netz darf nichts nachladen.
    pages = "--pages" in sys.argv
    build(embed=pages or "--standalone" in sys.argv or "--embed-icons" in sys.argv,
          pages=pages)
