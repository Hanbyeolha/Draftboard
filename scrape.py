"""Bereitet einen op.gg-Scrape vor: schreibt den Installer für die Browser-
Konsole und druckt die Befehle für jeden Spieler eines Teams.

    python scrape.py                  # zeigt alle Teams
    python scrape.py "SSV Remlingen"  # Anleitung für ein Team
    python scrape.py --all            # alle Teams nacheinander

Gescrapt wird immer im Browser (op.gg liefert die Zahlen nicht per HTTP).
Dieses Skript tippt nur die immer gleichen Zeilen für dich vor.

Normalfall ist inzwischen `python auto_scrape.py` - das macht dasselbe
automatisch. Diese Anleitung hier ist der Rückfallweg, wenn die Automatik
klemmt (op.gg-Umbau, Playwright fehlt).
"""

import json
import pathlib
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).parent
INSTALLER = ROOT / "out" / "install-scout.js"
SEASONS_RANKED = [33, 31, 29]        # Ranked gesamt: volle Historie
SEASONS_QUEUE = [33]                 # Solo/Flex/Normal: laufende Season
ROLE_LABEL = {"TOP": "Top", "JUNGLE": "Jungle", "MIDDLE": "Mid",
              "BOTTOM": "Bot", "UTILITY": "Support"}


def profile_url(region, riot_id):
    name, _, tag = riot_id.partition("#")
    return (f"https://op.gg/lol/summoners/{region}/"
            f"{urllib.parse.quote(name)}-{urllib.parse.quote(tag)}")


def write_installer():
    """Eine Zeile, die extract.js in den localStorage legt - einmal einfügen."""
    source = (ROOT / "extract.js").read_text(encoding="utf-8")
    line = ("localStorage.setItem('__scout', " + json.dumps(source) + "); "
            "eval(localStorage.__scout); 'Extraktor installiert'")
    INSTALLER.parent.mkdir(parents=True, exist_ok=True)
    INSTALLER.write_text(line, encoding="utf-8")
    return INSTALLER


def key_for(label):
    """Schlüssel ohne Sonderzeichen - der landet in data/raw/*.json."""
    return "".join(c for c in label if c.isalnum() or c in " _-").strip() or label


def steps_for_team(team, first=False):
    region = team.get("region", "euw")
    players = team["players"]
    ids = ",".join(p["riotId"] for p in players)
    multi = (f"https://op.gg/lol/multisearch/{region}"
             f"?summoners={urllib.parse.quote(ids, safe=',')}")

    print("=" * 78)
    print(f"  {team['team']}  ({len(players)} Spieler)")
    print("=" * 78)
    print("  Legende:  [PS ] = PowerShell-Terminal      [F12] = Browser-Konsole")
    print()
    print("1) Profile auffrischen - Seite öffnen, bei jedem Spieler auf 'Update'")
    print("   klicken, kurz warten:")
    print(f"   {multi}")
    print("   (oder gleich: python scrape.py \"" + team["team"] + "\" --open)")
    print()
    if first:
        print("2) Extraktor laden:")
        print(f"   [PS ]  Get-Content -Raw {INSTALLER.relative_to(ROOT)} | Set-Clipboard")
        print("   dann F12 -> Console -> einfügen -> Enter, danach dort:")
        print("   [F12]  resetScrape()")
        print()

    for i, player in enumerate(players, 1):
        key = key_for(player["label"])
        url = profile_url(region, player["riotId"])
        meta = {
            "riotId": player["riotId"],
            "label": player["label"],
            "team": team["team"],
            "role": player["role"],
            "region": region,
        }
        if player.get("bench"):
            meta["bench"] = True
        if player.get("note"):
            meta["note"] = player["note"]
        meta_js = json.dumps(meta, ensure_ascii=False)[1:-1]        # ohne { }

        print("-" * 78)
        print(f"  {i}/{len(players)}  {player['label']}  "
              f"({ROLE_LABEL.get(player['role'], player['role'])}"
              f"{', Bank' if player.get('bench') else ''})")
        print("-" * 78)
        print(f"  Seite: {url}")
        print("    [F12]  eval(localStorage.__scout); clickUpdate()     // ~10 s warten")
        print(f"    [F12]  saveP('{key}', Object.assign({{{meta_js},"
              f"opggUrl:location.href.split('?')[0]}}, scoutSummary()))")
        print()
        print(f"  Seite: {url}/style")
        print(f"    [F12]  eval(localStorage.__scout); saveP('{key}', {{style: scoutStyle()}})")
        print()
        print(f"  Seite: {url}/champions")
        for season in SEASONS_RANKED:
            print(f"    [F12]  await grabSeason('{key}', {season})")
        for queue in ("SOLORANKED", "FLEXRANKED"):
            for season in SEASONS_QUEUE:
                print(f"    [F12]  await grabQOne('{key}', '{queue}', {season})")
        print(f"    [F12]  await grabQOne('{key}', 'NORMAL', {SEASONS_QUEUE[0]})")
        print()

    stamp = __import__("datetime").date.today().isoformat()
    name = key_for(team["team"]).lower().replace(" ", "-")
    target = f"data\\raw\\{name}-{stamp}.json"
    old = sorted(p.name for p in (ROOT / "data" / "raw").glob("*.json")
                 if p.name.startswith(name.split("-")[0]) and p.name != pathlib.Path(target).name)
    print("-" * 78)
    print("  Zum Schluss:")
    print("    [F12]  copy(dumpAll())")
    print()
    print()
    print(f"    [PS ]  Get-Clipboard -Raw | Set-Content -Encoding utf8 {target}")
    for name_old in old:
        print(f"    [PS ]  Remove-Item data\\raw\\{name_old}      # alter Stand")
    print("    [PS ]  python build.py --standalone")
    print()


def main():
    roster = json.loads((ROOT / "teams.json").read_text(encoding="utf-8"))
    args = [a for a in sys.argv[1:]]

    if not args:
        print("Teams in teams.json:\n")
        for team in roster:
            print(f"  {team['team']:20} {len(team['players'])} Spieler")
        print("\nAufruf:  python scrape.py \"<Teamname>\"   oder   python scrape.py --all")
        return

    write_installer()
    open_pages = "--open" in args
    args = [a for a in args if not a.startswith("--")] or (["--all"] if "--all" in sys.argv else [])
    wanted = roster if "--all" in sys.argv else [
        t for t in roster if t["team"].lower() in {a.lower() for a in args}]
    if not wanted:
        print(f"Kein Team gefunden für: {', '.join(args)}")
        print("Vorhanden:", ", ".join(t["team"] for t in roster))
        return

    for i, team in enumerate(wanted):
        steps_for_team(team, first=(i == 0))
        if open_pages:
            region = team.get("region", "euw")
            ids = ",".join(p["riotId"] for p in team["players"])
            url = (f"https://op.gg/lol/multisearch/{region}"
                   f"?summoners={urllib.parse.quote(ids, safe=',')}")
            __import__("webbrowser").open(url)
            print(f"  -> Multisearch für {team['team']} im Browser geöffnet.\n")


if __name__ == "__main__":
    main()
