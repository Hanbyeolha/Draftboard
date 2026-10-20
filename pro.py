"""Pro-Picks aus den Spieldaten von Oracle's Elixir (20.10.2026).

    python pro.py

Wunsch des Nutzers: sehen, was in den Pro-Ligen gepickt wird - vor allem,
was dort BLIND gepickt wird (bevor der Gegner seine Lane gezeigt hat), um
gute Blind Picks besser abzuleiten. Vorerst nur anzeigen, die Note bleibt.

Quelle: oracleselixir.com, "Match Data Downloads" (Google Drive, CSV je
Jahr, einmal am Tag aktualisiert). Die Rohdatei legt der Nutzer nach
data/pro/roh/ (gitignored, 75 MB); hier entsteht nur die Zusammenfassung
data/pro/pro.json, die build.py einbettet. Spielstatistiken gehoeren Riot
Games; Oracle's Elixir stellt sie Analysten und Fans frei zur Verfuegung.

Auswahl (Nutzer, 20.10.2026): LCK, LPL, LEC, LCS, Worlds, MSI; der
aktuelle Patch und die drei vorherigen Patches, auf denen in diesen Ligen
gespielt wurde - im Oktober laeuft nur noch Worlds, die Ligen stehen auf
aelteren Patches.

Je Champion und Rolle: Picks, Siege, davon blind (vor dem Gegner derselben
Rolle gepickt); je Champion: Bans. Die Pickfolge steht in den Teamzeilen
(pick1..pick5 in Draftreihenfolge, firstPick = dieses Team pickt zuerst):
F1, S1, S2, F2, F3, S3 | S4, F4, F5, S5.
"""
import csv
import datetime
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
ROH = ROOT / "data" / "pro" / "roh"
ZIEL = ROOT / "data" / "pro" / "pro.json"

LIGEN = ("LCK", "LPL", "LEC", "LCS", "WLDs", "MSI")
LIGA_WORT = {"WLDs": "Worlds"}
PATCHES_ZURUECK = 3
ROLLE = {"top": "TOP", "jng": "JUNGLE", "mid": "MIDDLE", "bot": "BOTTOM", "sup": "UTILITY"}
# Globale Pickfolge: (zuerst pickendes Team?, Index in seinen fuenf Picks)
FOLGE = [(True, 0), (False, 0), (False, 1), (True, 1), (True, 2), (False, 2),
         (False, 3), (True, 3), (True, 4), (False, 4)]
PFLICHT = {"gameid", "league", "patch", "side", "position", "champion", "result", "firstPick",
           "pick1", "pick2", "pick3", "pick4", "pick5", "ban1", "ban2", "ban3", "ban4", "ban5", "date"}


def patch_schluessel(p):
    try:
        return tuple(int(x) for x in p.split("."))
    except ValueError:
        return (0,)


def spiele_lesen(datei):
    """gameid -> {liga, patch, datum, teams: {side: {...}}} - nur die gewaehlten Ligen."""
    spiele = {}
    with open(datei, encoding="utf-8", newline="") as d:
        leser = csv.DictReader(d)
        fehlt = PFLICHT - set(leser.fieldnames or [])
        if fehlt:
            raise SystemExit(f"{datei.name}: Spalten fehlen: {sorted(fehlt)} - Format geaendert?")
        for z in leser:
            if z["league"] not in LIGEN:
                continue
            g = spiele.setdefault(z["gameid"], {"liga": z["league"], "patch": z["patch"],
                                                "datum": z["date"][:10], "teams": {}})
            t = g["teams"].setdefault(z["side"], {"rollen": {}, "picks": [], "bans": [],
                                                  "zuerst": None, "sieg": None})
            if z["position"] == "team":
                t["picks"] = [z[f"pick{i}"] for i in range(1, 6)]
                t["bans"] = [z[f"ban{i}"] for i in range(1, 6) if z[f"ban{i}"]]
                t["zuerst"] = z["firstPick"] == "1"
                t["sieg"] = z["result"] == "1"
            elif z["position"] in ROLLE and z["champion"]:
                t["rollen"][z["champion"]] = ROLLE[z["position"]]
    return spiele


def auswerten(spiele):
    """Zaehlt je Champion und Rolle. Ein Spiel zaehlt nur, wenn beide Teams
    fuenf Picks mit Rolle und eindeutig einen Erstpicker haben."""
    patches = sorted({g["patch"] for g in spiele.values()}, key=patch_schluessel)
    fenster = patches[-(PATCHES_ZURUECK + 1):]
    champs, bans = {}, {}
    gezaehlt, ausgelassen = 0, 0
    je_liga = {}
    for g in spiele.values():
        if g["patch"] not in fenster:
            continue
        teams = list(g["teams"].values())
        if len(teams) != 2 or any(len([c for c in t["picks"] if c]) != 5 or len(t["rollen"]) != 5
                                  or set(t["picks"]) != set(t["rollen"]) for t in teams) \
                or sum(1 for t in teams if t["zuerst"]) != 1:
            ausgelassen += 1
            continue
        gezaehlt += 1
        je_liga[LIGA_WORT.get(g["liga"], g["liga"])] = je_liga.get(LIGA_WORT.get(g["liga"], g["liga"]), 0) + 1
        erst = next(t for t in teams if t["zuerst"])
        zweit = next(t for t in teams if not t["zuerst"])
        # Wann wurde welche Rolle auf welcher Seite gepickt (0..9)?
        wann = {}
        for nr, (ist_erst, i) in enumerate(FOLGE):
            t = erst if ist_erst else zweit
            champ = t["picks"][i]
            wann[(id(t), t["rollen"][champ])] = nr
        for t, gegner in ((erst, zweit), (zweit, erst)):
            for champ in t["picks"]:
                rolle = t["rollen"][champ]
                blind = wann[(id(t), rolle)] < wann[(id(gegner), rolle)]
                e = champs.setdefault(champ, {}).setdefault(rolle, {"picks": 0, "siege": 0, "blind": 0,
                                                                     "blindSiege": 0})
                e["picks"] += 1
                e["siege"] += 1 if t["sieg"] else 0
                if blind:
                    e["blind"] += 1
                    e["blindSiege"] += 1 if t["sieg"] else 0
            for b in t["bans"]:
                bans[b] = bans.get(b, 0) + 1
    return {"patches": fenster, "spiele": gezaehlt, "ausgelassen": ausgelassen, "jeLiga": je_liga,
            "champions": champs, "bans": bans}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    dateien = sorted(ROH.glob("*.csv"))
    if not dateien:
        raise SystemExit("Keine Rohdatei in data/pro/roh/ - die CSV von oracleselixir.com dort ablegen.")
    datei = max(dateien, key=lambda p: p.stat().st_mtime)
    spiele = spiele_lesen(datei)
    a = auswerten(spiele)
    stand = max((g["datum"] for g in spiele.values()), default="")
    raus = {"quelle": "Oracle's Elixir (oracleselixir.com) · Spieldaten von Riot Games",
            "datei": datei.name, "stand": stand, "erzeugt": datetime.date.today().isoformat(),
            "ligen": [LIGA_WORT.get(x, x) for x in LIGEN], **a}
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    ZIEL.write_text(json.dumps(raus, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    print(f"Pro-Picks: {a['spiele']} Spiele (Patches {', '.join(a['patches'])}; "
          f"{a['ausgelassen']} ohne vollstaendige Pickfolge ausgelassen) -> {ZIEL.relative_to(ROOT)}")
    print("  je Liga:", ", ".join(f"{k} {v}" for k, v in sorted(a["jeLiga"].items())))
    oben = sorted(((sum(r["picks"] for r in v.values()), c) for c, v in a["champions"].items()), reverse=True)[:8]
    print("  meistgepickt:", ", ".join(f"{c} {n}" for n, c in oben))


if __name__ == "__main__":
    main()
