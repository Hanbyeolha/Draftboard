"""Holt die op.gg-Championtabelle ohne Browser - rund eine Sekunde je Spieler.

    python schnell_scrape.py                    # alle Teams aus teams.json
    python schnell_scrape.py "Hub Hannover I"   # nur ein Team
    python schnell_scrape.py --fehlende         # nur Spieler ohne Daten
    python schnell_scrape.py --no-build         # nur Rohdaten schreiben

Warum das geht: op.gg liefert die Championtabelle bereits im ausgelieferten
HTML mit, eingebettet im Next.js-Datenstrom (self.__next_f). Der Browser in
auto_scrape.py wird nur gebraucht, um Season und Queue UMZUSCHALTEN - das
laeuft ueber Server-Actions und laesst sich nicht stabil nachbauen.

Deshalb holt dieses Skript nur, was die Seite von sich aus mitschickt:
  - die Championtabelle "Ranked", laufende Season, mit Spielen, Winrate,
    KDA, Kill-Participation und CS/min
  - die Saisonbilanz
  - den Solo-Rang aus der Meta-Beschreibung

Nicht enthalten: Solo/Flex getrennt, vergangene Seasons, Mastery, Style,
Flex-Rang. Dafuer bleibt `python auto_scrape.py` zustaendig. Damit nichts
verlorengeht, werden vorhandene Rohdaten NICHT ueberschrieben, sondern
ergaenzt - was dieser Weg nicht liefert, bleibt stehen.
"""

import argparse
import datetime
import gzip
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).parent
RAW = ROOT / "data" / "raw"
PAUSE = 0.6                 # Sekunden zwischen Abrufen - nicht hetzen
SEASON = 33                 # laufende Season; op.gg liefert nur diese mit
KOPF = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip",
}
TIERS = {"IRON": "Iron", "BRONZE": "Bronze", "SILVER": "Silver", "GOLD": "Gold",
         "PLATINUM": "Platinum", "EMERALD": "Emerald", "DIAMOND": "Diamond",
         "MASTER": "Master", "GRANDMASTER": "Grandmaster",
         "CHALLENGER": "Challenger"}
ROEMISCH = ["", "I", "II", "III", "IV"]

RANG_MUSTER = re.compile(r"^([A-Za-z]+)(?:\s+([1-4]))?\s+([\d,]+)\s*LP$")
BILANZ_MUSTER = re.compile(r"^(\d+)Win\s+(\d+)Lose")
PATCH_MUSTER = re.compile(r"/lol/(\d+\.\d+\.\d+)/")


def profil_url(region, riot_id):
    name, _, tag = riot_id.partition("#")
    teil = urllib.parse.quote(f"{name}-{tag}" if tag else name)
    return f"https://op.gg/lol/summoners/{region}/{teil}"


def hole(url):
    anfrage = urllib.request.Request(url, headers=KOPF)
    with urllib.request.urlopen(anfrage, timeout=30) as antwort:
        roh = antwort.read()
        if antwort.headers.get("Content-Encoding") == "gzip":
            roh = gzip.decompress(roh)
    return roh.decode("utf-8", "replace")


def rsc_strom(html):
    """Die self.__next_f.push([1,"..."])-Stuecke zu einem Strom zusammensetzen.

    Bewusst ohne regulaeren Ausdruck: die Stuecke sind JSON-Stringliterale mit
    Maskierungen, und der JSON-Dekoder loest die zuverlaessiger auf."""
    marke = 'self.__next_f.push([1,'
    dec = json.JSONDecoder()
    teile, pos = [], 0
    while True:
        i = html.find(marke, pos)
        if i < 0:
            break
        j = i + len(marke)
        while j < len(html) and html[j] in " \t\n":
            j += 1
        if j < len(html) and html[j] == '"':
            try:
                wert, ende = dec.raw_decode(html, j)
                teile.append(wert)
                pos = ende
                continue
            except ValueError:
                pass
        pos = j
    return "".join(teile)


def tabelle_aus(strom):
    """Den Block mit my_champion_stats finden und zurueckgeben."""
    dec = json.JSONDecoder()
    stelle = strom.find('"my_champion_stats"')
    if stelle < 0:
        return None
    start = strom.rfind("{", 0, stelle)
    for _ in range(600):
        if start < 0:
            return None
        try:
            obj, _ende = dec.raw_decode(strom, start)
            if isinstance(obj, dict) and obj.get("my_champion_stats"):
                return obj
        except ValueError:
            pass
        start = strom.rfind("{", 0, start)
    return None


def icon_schluessel(eintrag):
    """Aus der Bild-URL den Riot-Schluessel ziehen: .../champion/DrMundo.png."""
    url = eintrag.get("image_url") or ""
    name = url.rsplit("/", 1)[-1]
    return name.rsplit(".", 1)[0] or None


def version_aus(eintrag):
    """Die Patchnummer steckt im Bildpfad: /meta/images/lol/16.20.1/champion/."""
    treffer = PATCH_MUSTER.search(eintrag.get("image_url") or "")
    return treffer.group(1) if treffer else None


def zeile(c):
    """Ein Championeintrag in der Kompaktform von data/raw/*.json:
    [champ, win, lose, winRate, kda, kp, csPerMin]."""
    kda = (c.get("kda") or {}).get("kda")
    quote = c.get("win_rate")
    return [c.get("name"), c.get("win"), c.get("lose"),
            round(quote) if isinstance(quote, (int, float)) else None,
            kda, c.get("kill_participation"), c.get("cs_per_min")]


def solo_rang(html):
    """Den Solo-Rang aus der Meta-Beschreibung lesen.

    Format: "name#tag / Diamond 3 4 LP / 181Win 173Lose Win rate 51% / ..."
    Master und darueber haben keine Division."""
    marke = 'name="description" content="'
    stelle = html.find(marke)
    if stelle < 0:
        return None
    ende = html.find('"', stelle + len(marke))
    teile = [t.strip() for t in html[stelle + len(marke):ende].split(" / ")]
    if len(teile) < 3:
        return None
    rang = RANG_MUSTER.match(teile[1])
    bilanz = BILANZ_MUSTER.match(teile[2])
    if not rang or not bilanz:
        return None
    tier = TIERS.get(rang.group(1).upper())
    if not tier:
        return None
    return {"tier": tier,
            "division": ROEMISCH[int(rang.group(2))] if rang.group(2) else "",
            "lp": int(rang.group(3).replace(",", "")),
            "wins": int(bilanz.group(1)),
            "losses": int(bilanz.group(2))}


def alte_rohdaten():
    """Was schon da ist - je Spieler gewinnt die neueste Datei, wie in build.py."""
    spieler, icons, namen = {}, {}, {}
    for pfad in sorted(RAW.glob("*.json")):
        try:
            blob = json.loads(pfad.read_text(encoding="utf-8"))
        except ValueError:
            continue
        icons.update(blob.get("icons") or {})
        namen.update(blob.get("seasonNames") or {})
        spieler.update(blob.get("players") or {})
    return spieler, icons, namen


def spieler_holen(eintrag, team, region, alt):
    """Einen Spieler holen und mit dem alten Stand zusammenfuehren."""
    basis = profil_url(region, eintrag["riotId"])
    html = hole(basis + "/champions")
    block = tabelle_aus(rsc_strom(html))
    if not block:
        # Es gibt zwei Gruende: das Profil existiert nicht, oder es hat noch
        # keine Ranked-Partie. Die Meta-Beschreibung verraet, welcher.
        return None, {}, ("ohne Ranked-Partien" if 'name="description" content="'
                          in html and "Lv." in html else "Profil nicht gefunden")

    # Der erste Eintrag ist die Summenzeile der Season (name "1",
    # champion_id None, play = Gesamtzahl). Sie ist kein Champion und haette
    # sonst als Zeile "1" mit 1203 Spielen in der Tabelle gestanden.
    champs = [c for c in (block.get("my_champion_stats") or [])
              if c.get("champion_id") and c.get("name")]
    icons, version = {}, None
    for c in champs:
        schluessel = icon_schluessel(c)
        if c.get("name") and schluessel:
            icons[c["name"]] = schluessel
        version = version or version_aus(c)

    vorher = alt.get(eintrag["label"]) or {}
    # Seasons zusammenfuehren: die geholte ersetzt ihren Jahrgang, alle
    # anderen bleiben stehen. Sonst verschwaenden 2025 und 2024.
    season_id = block.get("season_id") or SEASON
    seasons = [s for s in (vorher.get("seasons") or []) if s.get("id") != season_id]
    seasons.append({"id": season_id, "c": [zeile(c) for c in champs]})
    seasons.sort(key=lambda s: -(s.get("id") or 0))

    meta = dict(vorher.get("meta") or {})
    meta.update({
        "riotId": eintrag["riotId"], "label": eintrag["label"], "team": team,
        "role": eintrag.get("role", "UNKNOWN"), "bench": bool(eintrag.get("bench")),
        "region": region, "opggUrl": basis, "note": eintrag.get("note"),
        "lastUpdated": "gerade geholt",
    })
    return {
        "meta": meta,
        "solo": solo_rang(html) or vorher.get("solo"),
        # Was dieser Weg nicht liefert, bleibt wie es war - nie verschlechtern.
        "flex": vorher.get("flex"),
        "mastery": vorher.get("mastery") or [],
        "style": vorher.get("style") or {},
        "seasons": seasons,
    }, icons, version


def slug(name):
    raus = "".join(z if z.isalnum() else "-" for z in name.lower())
    return re.sub(r"-+", "-", raus).strip("-")


def main():
    parser = argparse.ArgumentParser(
        description="op.gg-Championtabellen ohne Browser holen")
    parser.add_argument("teams", nargs="*", help="Teamnamen (leer = alle)")
    parser.add_argument("--fehlende", action="store_true",
                        help="nur Spieler, fuer die noch keine Rohdaten da sind")
    parser.add_argument("--no-build", action="store_true",
                        help="nur Rohdaten schreiben, nicht neu bauen")
    args = parser.parse_args()

    roster = json.loads((ROOT / "teams.json").read_text(encoding="utf-8"))
    if args.teams:
        gesucht = {t.lower() for t in args.teams}
        roster = [t for t in roster if t["team"].lower() in gesucht]
        if not roster:
            print("Keine passende Mannschaft in teams.json.")
            return 1

    alt_spieler, alt_icons, alt_namen = alte_rohdaten()
    RAW.mkdir(parents=True, exist_ok=True)
    heute = datetime.date.today().isoformat()
    gesamt_neu = gesamt_fehler = 0
    t_start = time.time()

    for team in roster:
        region = team.get("region", "euw")
        mitglieder = team.get("players") or []
        if args.fehlende:
            mitglieder = [m for m in mitglieder if m["label"] not in alt_spieler]
        if not mitglieder:
            continue
        print(f"{team['team']} ({len(mitglieder)} Spieler)")
        spieler, icons, version = {}, {}, None
        for m in mitglieder:
            if not m.get("riotId"):
                print(f"  ! {m['label']}: keine Riot-ID hinterlegt")
                gesamt_fehler += 1
                continue
            try:
                daten, neue_icons, v = spieler_holen(m, team["team"], region,
                                                     alt_spieler)
            except (urllib.error.HTTPError, urllib.error.URLError, OSError) as exc:
                print(f"  ! {m['label']}: {exc}")
                gesamt_fehler += 1
                time.sleep(PAUSE)
                continue
            if not daten:
                print(f"  ! {m['label']}: {v or 'keine Championtabelle'} "
                      f"({m['riotId']})")
                gesamt_fehler += 1
                time.sleep(PAUSE)
                continue
            spieler[m["label"]] = daten
            icons.update(neue_icons)
            version = version or v
            rang = daten["solo"]
            print(f"  {m['label']:22} {len(daten['seasons'][0]['c']):3} Zeilen"
                  + (f"  {rang['tier']} {rang['division']}".rstrip()
                     if rang else "  ohne Rang"))
            gesamt_neu += 1
            time.sleep(PAUSE)

        if not spieler:
            continue
        datei = RAW / f"{slug(team['team'])}-{heute}.json"
        datei.write_text(json.dumps({
            "version": version or "",
            "scrapedAt": heute,
            "icons": {**alt_icons, **icons},
            "seasonNames": alt_namen,
            "players": spieler,
            # Solo/Flex getrennt liefert dieser Weg nicht - der alte Stand aus
            # den uebrigen Rohdateien bleibt dadurch unberuehrt.
            "queues": {},
        }, ensure_ascii=False), encoding="utf-8")
        print(f"  -> {datei.relative_to(ROOT)}")

    dauer = time.time() - t_start
    print(f"\n{gesamt_neu} Spieler geholt, {gesamt_fehler} Fehler, {dauer:.0f}s")
    if gesamt_neu and not args.no_build:
        print("Baue neu ...")
        subprocess.run([sys.executable, str(ROOT / "build.py"), "--pages"],
                       cwd=ROOT, check=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
