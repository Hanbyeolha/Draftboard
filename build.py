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
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).parent
RAW = ROOT / "data" / "raw"
ICON_CACHE = ROOT / "data" / "icons"
OUT = ROOT / "out" / "scouting.html"
ICON_URL = ("https://opgg-static.akamaized.net/meta/images/lol/{version}"
            "/champion/{key}.png?image=q_auto:good,f_webp,w_48,h_48")

ROLE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY", "UNKNOWN"]
# Reihenfolge der Championtabellen-Spalten in den Rohdaten (siehe extract.js).
CHAMP_FIELDS = ["champ", "win", "lose", "winRate", "kda", "kp", "csPerMin"]
# op.gg-Queue -> Schluessel in der Seite. RANKED (Solo+Flex zusammen) steckt in
# den Spielerdateien, die uebrigen Queues in den queues-*.json.
QUEUE_KEYS = {"SOLORANKED": "SOLO", "FLEXRANKED": "FLEX", "NORMAL": "NORMAL"}
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
            "&family=Source+Sans+3:wght@400;600&display=swap")
FONT_LINK = "\n".join([
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="' + FONT_CSS + '">'])
# Ohne Browser-Kennung liefert Google veraltetes ttf statt woff2.
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"}


def load_raw():
    """Alle Scrape-Dateien einlesen: Spielerdateien (players) und die
    Queue-Dateien (queues). Bei mehreren gewinnt die neueste je Spieler."""
    players, queues, icons, version, scraped = {}, {}, {}, None, None
    names = {}
    for path in sorted(RAW.glob("*.json")):
        blob = json.loads(path.read_text(encoding="utf-8"))
        icons.update(blob.get("icons", {}))
        # Season-Namen so, wie op.gg sie beim Scrapen anzeigte.
        names.update({int(k): v for k, v in (blob.get("seasonNames") or {}).items()})
        version = blob.get("version") or version
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
    """Championbilder einmal herunterladen (48px webp, ~0.5 KB) und als
    data:-URIs zurueckgeben. Der Cache unter data/icons/ bleibt liegen."""
    ICON_CACHE.mkdir(parents=True, exist_ok=True)
    out, fetched = {}, 0
    for champ, key in sorted(icons.items()):
        path = ICON_CACHE / f"{version}-{key}.webp"
        if not path.exists():
            url = ICON_URL.format(version=version, key=key)
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            path.write_bytes(urllib.request.urlopen(request, timeout=30).read())
            fetched += 1
        blob = base64.b64encode(path.read_bytes()).decode("ascii")
        out[champ] = "data:image/webp;base64," + blob
    print(f"  Icons: {len(out)} eingebettet ({fetched} neu geladen)")
    return out


def multisearch_url(region, members):
    """op.gg-Multisearch: alle Riot-IDs eines Teams auf einer Seite."""
    if not members:
        return None
    ids = ",".join(p["riotId"] for p in members)
    return (f"https://op.gg/lol/multisearch/{region}"
            f"?summoners={urllib.parse.quote(ids, safe=',')}")


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
                "side": "blue" if team == entry["blue"] else "red",
                # winner darf fehlen (Ergebnis noch nicht nachgetragen).
                "result": ("win" if entry.get("winner") == team
                           else "loss" if entry.get("winner") else "unknown"),
                "picks": entry.get("picks", {}).get(team, []),
                "bansOwn": entry.get("bans", {}).get(team, []),
                "bansOpp": entry.get("bans", {}).get(other, []),
                "note": entry.get("note") or "",
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


def build(embed=False):
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
        if not members:
            continue
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

    plan_warn = attach_plan(teams, plan, set(champion_list))

    seasons = sorted({s["id"] for p in players for q in p["queues"].values()
                      for s in q if s["id"] is not None}, reverse=True)
    champions = sorted(set(champion_list) | set(icons))

    # Rohdatei schlaegt Tabelle: was op.gg beim Scrapen anzeigte, gilt.
    named = {**SEASON_NAMES, **raw_names}
    data = {
        "version": version,
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
    }
    if embed:
        data["iconData"] = embed_icons(icons, version)

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
                .replace("__DATA__", payload),
        encoding="utf-8")

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
    build(embed="--standalone" in sys.argv or "--embed-icons" in sys.argv)
