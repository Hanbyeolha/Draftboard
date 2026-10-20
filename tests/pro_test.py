"""Pro-Picks (pro.py) - ohne Netz, mit einer kleinen CSV.

    python tests/pro_test.py

Ein Spiel, Team Rot pickt zuerst. Pickfolge F1 S1 S2 F2 F3 S3 | S4 F4 F5 S5:
blind ist, wer vor dem Gegner derselben Rolle gepickt hat. Andere Ligen und
zu alte Patches fallen weg; je Spiel ist genau die Haelfte der Picks blind.
"""
import csv
import io
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import pro  # noqa: E402

fehler = []


def pruefe(bedingung, text):
    print(("  ok    " if bedingung else "  FEHLER ") + text)
    if not bedingung:
        fehler.append(text)


SPALTEN = ["gameid", "datacompleteness", "league", "date", "patch", "side", "position", "champion",
           "result", "firstPick"] + [f"ban{i}" for i in range(1, 6)] + [f"pick{i}" for i in range(1, 6)]
POS = ["top", "jng", "mid", "bot", "sup"]


def spiel(w, gid, liga, patch, blau, rot, rot_zuerst=True, blau_sieg=True):
    """blau/rot: je fuenf (Rolle, Champion) in Pickreihenfolge des Teams."""
    for seite, picks, zuerst, sieg in (("Blue", blau, not rot_zuerst, blau_sieg),
                                       ("Red", rot, rot_zuerst, not blau_sieg)):
        basis = {"gameid": gid, "datacompleteness": "complete", "league": liga, "date": "2026-10-18 10:00:00",
                 "patch": patch, "side": seite, "result": "1" if sieg else "0", "firstPick": "1" if zuerst else "0"}
        team = dict(basis, position="team", champion="",
                    **{f"ban{i}": ("Zed" if i == 1 else "") for i in range(1, 6)},
                    **{f"pick{i}": picks[i - 1][1] for i in range(1, 6)})
        w.writerow(team)
        for rolle, champ in picks:
            w.writerow(dict(basis, position=rolle, champion=champ,
                            **{f"ban{i}": "" for i in range(1, 6)}, **{f"pick{i}": "" for i in range(1, 6)}))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    puffer = io.StringIO()
    w = csv.DictWriter(puffer, fieldnames=SPALTEN)
    w.writeheader()
    # Rot zuerst: R1 Ryze(mid), B1 Jinx(bot), B2 Lee Sin(jng), R2 Vi(jng), R3 Ezreal(bot), B3 Lulu(sup),
    # B4 Ornn(top), R4 Rell(sup), R5 Gnar(top), B5 Azir(mid).
    blau = [("bot", "Jinx"), ("jng", "Lee Sin"), ("sup", "Lulu"), ("top", "Ornn"), ("mid", "Azir")]
    rot = [("mid", "Ryze"), ("jng", "Vi"), ("bot", "Ezreal"), ("sup", "Rell"), ("top", "Gnar")]
    spiel(w, "g1", "LEC", "16.20", blau, rot)
    spiel(w, "g2", "LFL", "16.20", blau, rot)                      # andere Liga: faellt weg
    spiel(w, "g3", "LCK", "16.10", blau, rot)                      # zu alter Patch
    for i, p in enumerate(["16.17", "16.16", "16.15"]):
        spiel(w, f"g{4 + i}", "LPL", p, blau, rot)                 # im Fenster (3 zurueck)
    with tempfile.TemporaryDirectory() as d:
        datei = pathlib.Path(d) / "t.csv"
        datei.write_text(puffer.getvalue(), encoding="utf-8")
        a = pro.auswerten(pro.spiele_lesen(datei))
    pruefe(a["spiele"] == 4 and a["patches"] == ["16.15", "16.16", "16.17", "16.20"],
           f"Fenster: aktueller + 3 vorherige Patches, nur gewaehlte Ligen ({a['spiele']}, {a['patches']})")
    c = a["champions"]
    pruefe(c["Ryze"]["MIDDLE"]["blind"] == 4 and c["Azir"]["MIDDLE"]["blind"] == 0, "Mid: Ryze blind, Azir Konter")
    pruefe(c["Jinx"]["BOTTOM"]["blind"] == 4 and c["Ezreal"]["BOTTOM"]["blind"] == 0, "Bot: Jinx vor Ezreal")
    pruefe(c["Lee Sin"]["JUNGLE"]["blind"] == 4 and c["Vi"]["JUNGLE"]["blind"] == 0, "Jungle: B2 vor R2")
    pruefe(c["Lulu"]["UTILITY"]["blind"] == 4 and c["Rell"]["UTILITY"]["blind"] == 0, "Support: B3 vor R4")
    pruefe(c["Ornn"]["TOP"]["blind"] == 4 and c["Gnar"]["TOP"]["blind"] == 0, "Top: B4 vor R5")
    pruefe(c["Jinx"]["BOTTOM"]["siege"] == 4 and c["Ezreal"]["BOTTOM"]["siege"] == 0, "Siege je Seite")
    blind = sum(r["blind"] for v in c.values() for r in v.values())
    picks = sum(r["picks"] for v in c.values() for r in v.values())
    pruefe(picks == 40 and blind == 20, f"genau die Haelfte blind ({blind}/{picks})")
    pruefe(a["bans"].get("Zed") == 8, "Bans gezaehlt (je Team einer)")
    print("pro:", "OK" if not fehler else f"{len(fehler)} Fehler")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
