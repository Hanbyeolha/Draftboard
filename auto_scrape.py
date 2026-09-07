"""Holt die op.gg-Daten automatisch: Browser fernsteuern, Rohdaten schreiben,
HTML neu bauen.

    python auto_scrape.py                     # alle Teams aus teams.json
    python auto_scrape.py "SSV Remlingen"     # nur ein Team
    python auto_scrape.py --no-update         # ohne Update-Klick (schneller)
    python auto_scrape.py --no-build          # nur Rohdaten schreiben
    python auto_scrape.py --keep-old          # alte Rohdatei behalten

Das Fenster muss sichtbar bleiben: op.gg antwortet einem headless-Browser mit
"ERROR: The request could not be satisfied". Die gesamte Kenntnis über den
Seitenaufbau steckt in extract.js - dieses Skript ruft sie nur auf.

Manueller Weg (falls das hier klemmt): python scrape.py "<Team>"
"""

import argparse
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright
from playwright.sync_api import Error as PlaywrightError

ROOT = pathlib.Path(__file__).parent
RAW = ROOT / "data" / "raw"
EXTRACT = ROOT / "extract.js"

SEASONS_RANKED = [33, 31, 29]          # Ranked gesamt: volle Historie
SEASON_QUEUE = [33]                    # Solo/Flex: laufende Season (--queue-seasons)
QUEUES = ["SOLORANKED", "FLEXRANKED", "NORMAL"]
PAGE_TIMEOUT = 45_000
SETTLE_MS = 6_000                      # Wartezeit nach dem Laden
FRESH = re.compile(r"\b(second|minute)s?\s+ago", re.I)


def slug(text):
    keep = "".join(c if c.isalnum() else "-" for c in text.lower())
    return re.sub(r"-+", "-", keep).strip("-")


def key_for(label):
    """Schlüssel im Rohdatensatz - ohne Zeichen, die JSON-Pfade stören."""
    return "".join(c for c in label if c.isalnum() or c in " _-").strip() or label


def profile_url(region, riot_id):
    name, _, tag = riot_id.partition("#")
    return (f"https://op.gg/lol/summoners/{region}/"
            f"{urllib.parse.quote(name)}-{urllib.parse.quote(tag)}")


def compact(rows):
    """Championzeilen in die Kurzform von data/raw/*.json."""
    return [[c["champ"], c["win"], c["lose"], c["winRate"],
             c["kda"], c["kp"], c["csPerMin"]] for c in rows]


class Scout:
    """Eine Browserseite plus der injizierte Extraktor."""

    def __init__(self, page, source):
        self.page = page
        self.source = source
        # Wie op.gg die Seasons benennt - einmal eingesammelt, gilt fuer alle.
        self.season_names = {}

    def open(self, url):
        # Nach jedem Seitenwechsel ist der JS-Kontext neu - erneut injizieren.
        self.page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT)
        self.page.wait_for_timeout(SETTLE_MS)
        self.page.evaluate(self.source)

    def summary(self):
        return self.page.evaluate("scoutSummary()")

    def style(self):
        return self.page.evaluate("scoutStyle()")

    def refresh(self, wait_s=20):
        """Update-Knopf drücken und warten, bis op.gg neu geladen hat."""
        if not self.page.evaluate("clickUpdate()"):
            return False
        deadline = time.time() + wait_s
        while time.time() < deadline:
            self.page.wait_for_timeout(2000)
            stamp = self.page.evaluate("scoutSummary().lastUpdated") or ""
            if FRESH.search(stamp):
                return True
        return False

    def table(self, season, queue=None, tries=3):
        """Eine Championtabelle holen und prüfen, dass Season/Queue stimmen."""
        if queue:
            self.page.evaluate(f"setQueue({json.dumps(queue)})")
        self.page.evaluate(f"setSeason({season})")
        result = self.page.evaluate("scoutChamps()")
        for _ in range(tries - 1):
            season_ok = result["seasonId"] == season or result["seasonId"] is None
            queue_ok = queue is None or result["queueType"] == queue
            if result["ok"] and season_ok and queue_ok:
                break
            self.page.wait_for_timeout(2500)
            result = self.page.evaluate("scoutChamps()")
        return result


def scrape_player(scout, entry, team, region, do_update, warn):
    """Alle drei Seiten eines Spielers. Gibt (player, queues, icons) zurück."""
    label = entry["label"]
    base = profile_url(region, entry["riotId"])
    icons = {}

    scout.open(base)
    summary = scout.summary()
    if not summary["ok"]:
        warn.append(f"{team}/{label}: auf op.gg nicht gefunden ({entry['riotId']})")
        return None, None, icons
    if do_update and scout.refresh():
        summary = scout.summary()          # nach dem Update neu auslesen

    scout.open(base + "/style")
    style = scout.style()

    scout.open(base + "/champions")
    scout.season_names.update(scout.page.evaluate("seasonNames()"))
    seasons = []
    for season in SEASONS_RANKED:
        result = scout.table(season)
        icons.update({c["champ"]: c["icon"] for c in result["champions"]})
        seasons.append({"id": result["seasonId"], "c": compact(result["champions"])})

    queues = {}
    for queue in QUEUES:
        # Normal kennt keine Season - dort reicht ein Durchgang.
        wanted = [SEASON_QUEUE[0]] if queue == "NORMAL" else SEASON_QUEUE
        entries = []
        for season in wanted:
            result = scout.table(season, queue=queue)
            icons.update({c["champ"]: c["icon"] for c in result["champions"]})
            entries.append({"id": result["seasonId"], "q": result["queueType"],
                            "c": compact(result["champions"])})
        queues[queue] = entries

    meta = {
        "riotId": entry["riotId"], "label": label, "team": team,
        "role": entry.get("role", "UNKNOWN"), "bench": bool(entry.get("bench")),
        "region": region, "opggUrl": base, "note": entry.get("note"),
        "lastUpdated": summary["lastUpdated"], "ladderRank": summary["ladderRank"],
    }
    player = {
        "meta": meta,
        "solo": summary["solo"],
        "flex": summary["flex"],
        "mastery": [[m["champ"], m["level"], m["points"]] for m in summary["mastery"]],
        "style": style,
        "seasons": seasons,
    }

    if not summary["solo"] and not summary["flex"]:
        warn.append(f"{team}/{label}: kein Rang gefunden")
    if not any(s["c"] for s in seasons):
        warn.append(f"{team}/{label}: keine Ranked-Championdaten")

    rank = "/".join(
        f"{r['tier']} {r['division']}".strip() if r else "—"
        for r in (summary["solo"], summary["flex"]))
    counts = "/".join(str(len(s["c"])) for s in seasons)
    per_queue = " ".join(f"{q[:4]} {len(queues[q][0]['c'])}" for q in QUEUES)
    print(f"      Rang {rank} | Stil {style['games'] or '—'} | "
          f"Ranked {counts} | {per_queue}", flush=True)
    return player, queues, icons


def load_existing(team_name):
    """Neueste Rohdatei dieses Teams. Gebraucht, wenn nur einzelne Spieler
    nachgezogen werden - die uebrigen sollen dabei nicht verlorengehen."""
    found = {}
    for path in sorted(RAW.glob("*.json")):
        blob = json.loads(path.read_text(encoding="utf-8"))
        teams_inside = {p["meta"]["team"] for p in blob.get("players", {}).values()}
        if teams_inside == {team_name}:
            found = blob                      # sortiert: die juengste gewinnt
    return found


def write_team(team_name, players, queues, icons, season_names, keep_old, base=None):
    version = None
    icon_keys = {}
    for champ, url in icons.items():
        m = re.search(r"lol/([\d.]+)/champion/(.+)\.png$", url)
        if m:
            version = m.group(1)
            icon_keys[champ] = m.group(2)

    # Bei einer Ergaenzung steht der alte Stand darunter, das Neue obendrauf.
    if base:
        players = {**base.get("players", {}), **players}
        queues = {**base.get("queues", {}), **queues}
        icon_keys = {**base.get("icons", {}), **icon_keys}
        season_names = season_names or base.get("seasonNames") or {}
        version = version or base.get("version")

    stamp = time.strftime("%Y-%m-%d")
    name = slug(team_name)
    target = RAW / f"{name}-{stamp}.json"
    target.write_text(json.dumps({
        "version": version, "scrapedAt": stamp, "icons": icon_keys,
        "seasonNames": season_names, "players": players, "queues": queues,
    }, ensure_ascii=False), encoding="utf-8")

    removed = []
    if not keep_old:
        stems = {name, name.split("-")[0]}
        fresh_keys = set(players)
        for path in RAW.glob("*.json"):
            if path == target:
                continue
            blob = json.loads(path.read_text(encoding="utf-8"))
            teams_inside = {p["meta"]["team"] for p in blob.get("players", {}).values()}
            stale = teams_inside == {team_name} or path.stem.rsplit("-", 3)[0] in stems
            # Reine Queue-Dateien aus der Handarbeit tragen keinen Teamnamen.
            # Sie würden die frischen Zahlen beim Bauen überschreiben.
            if not blob.get("players") and set(blob.get("queues", {})) & fresh_keys:
                stale = True
            if stale:
                path.unlink()
                removed.append(path.name)
    return target, removed


def main():
    parser = argparse.ArgumentParser(description="op.gg-Daten automatisch holen")
    parser.add_argument("teams", nargs="*", help="Teamnamen (leer = alle)")
    parser.add_argument("--no-update", action="store_true",
                        help="Update-Knopf auf op.gg nicht drücken")
    parser.add_argument("--no-build", action="store_true",
                        help="build.py am Ende nicht aufrufen")
    parser.add_argument("--keep-old", action="store_true",
                        help="alte Rohdateien nicht löschen")
    parser.add_argument("--queue-seasons", default="33",
                        help="Seasons für Solo/Flex, z. B. 33,31,29 (Standard 33)")
    parser.add_argument("--only", action="append", default=[], metavar="SPIELER",
                        help="nur diese Spieler holen (Label, mehrfach angebbar); "
                             "die uebrigen bleiben aus der vorhandenen Datei")
    parser.add_argument("--headless", action="store_true",
                        help="unsichtbar - funktioniert NICHT, op.gg blockt das")
    args = parser.parse_args()

    global SEASON_QUEUE
    SEASON_QUEUE = [int(x) for x in args.queue_seasons.split(",") if x.strip()]

    roster = json.loads((ROOT / "teams.json").read_text(encoding="utf-8"))
    wanted = roster if not args.teams else [
        t for t in roster if t["team"].lower() in {a.lower() for a in args.teams}]
    if not wanted:
        print("Kein Team gefunden. Vorhanden:",
              ", ".join(t["team"] for t in roster))
        return 1

    source = EXTRACT.read_text(encoding="utf-8")
    RAW.mkdir(parents=True, exist_ok=True)
    warn, written = [], []
    started = time.time()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=args.headless)
        page = browser.new_page(locale="en-US")
        scout = Scout(page, source)

        for team in wanted:
            name = team["team"]
            region = team.get("region", "euw")
            roster = team["players"]
            base = None
            if args.only:
                pick = {o.lower() for o in args.only}
                roster = [p for p in roster if p["label"].lower() in pick]
                if not roster:
                    continue
                base = load_existing(name)      # die uebrigen Spieler behalten
                if not base:
                    warn.append(f"{name}: keine vorhandene Datei - darin steht "
                                f"danach nur "
                                + ", ".join(p["label"] for p in roster))
            print(f"\n=== {name} ({len(roster)} Spieler) ===", flush=True)
            players, queues, icons = {}, {}, {}

            for i, entry in enumerate(roster, 1):
                t0 = time.time()
                print(f"[{i}/{len(roster)}] {entry['label']}", flush=True)
                try:
                    player, per_queue, found = scrape_player(
                        scout, entry, name, region, not args.no_update, warn)
                except PlaywrightError as exc:
                    warn.append(f"{name}/{entry['label']}: {type(exc).__name__} "
                                f"{str(exc).splitlines()[0][:80]}")
                    print("      übersprungen (Fehler)", flush=True)
                    continue
                if player:
                    key = key_for(entry["label"])
                    players[key] = player
                    queues[key] = per_queue
                    icons.update(found)
                print(f"      {time.time() - t0:.0f}s", flush=True)
                page.wait_for_timeout(2000)          # op.gg nicht fluten

            if players:
                target, removed = write_team(name, players, queues, icons,
                                             scout.season_names, args.keep_old, base)
                written.append(target)
                print(f"  -> {target.relative_to(ROOT)}"
                      + (f"  (ersetzt {', '.join(removed)})" if removed else ""), flush=True)
            else:
                warn.append(f"{name}: nichts geschrieben, kein Spieler erfolgreich")

        browser.close()

    print(f"\nFertig in {(time.time() - started) / 60:.1f} min, "
          f"{len(written)} Datei(en) geschrieben.")
    for line in warn:
        print("  ! " + line, flush=True)

    if written and not args.no_build:
        print()
        subprocess.run([sys.executable, "build.py", "--standalone"], cwd=ROOT, check=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
