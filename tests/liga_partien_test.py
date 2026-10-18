"""Riot-IDs aus Partien (liga.py riot_ids_aus_partien) - ohne Netz.

    python tests/liga_partien_test.py

Ein Teilnehmer, der in keinem Vereinskader steht, wird ueber sein Profil
aufgeloest (hier simuliert) und mit der haeufigsten Position in
riot-ids.json ergaenzt; Bekannte bleiben unangetastet; jedes Profil wird nur
einmal abgefragt; gespeichert wird nur die Riot-ID.
"""
import json
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import liga  # noqa: E402

fehler = []


def pruefe(bedingung, text):
    print(("  ok    " if bedingung else "  FEHLER ") + text)
    if not bedingung:
        fehler.append(text)


def partie(teilnehmer):
    return {"liste": {}, "stats": {
        "game_match_team": [{"red_or_blue_team": 100, "team": 7, "team_name": "Hub Peine I"},
                            {"red_or_blue_team": 200, "lor_team_name": "AFC II"}],
        "game_match_participant": teilnehmer}}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    abfragen = []

    def falsches_abrufen(anfrage, timeout, versuche=3):
        abfragen.append(anfrage.full_url)
        uid = anfrage.full_url.rstrip("/").split("/")[-1]
        return {"riot_summoner_name": "Neu" + uid, "riot_tag_line": "EUW",
                "username": "geheim", "email": "nie@speichern.de"}

    with tempfile.TemporaryDirectory() as d:
        d = pathlib.Path(d)
        alt = (liga.ZIEL, liga.abrufen, liga.PAUSE)
        liga.ZIEL, liga.abrufen, liga.PAUSE = d, falsches_abrufen, 0
        try:
            (d / "riot-ids.json").write_text(json.dumps(
                {"AFC II": {"Bekannt": {"riotId": "Bekannt#1", "rolle": "Mid", "verifiziert": True}}}),
                encoding="utf-8")
            partien = [
                partie([{"team_id": 100, "anzeige_name": "Pein", "user_id": 11, "team_position": "TOP"},
                        {"team_id": 200, "anzeige_name": "Bekannt", "user_id": 12, "team_position": "MIDDLE"}]),
                partie([{"team_id": 100, "anzeige_name": "Pein", "user_id": 11, "team_position": "TOP"}]),
                partie([{"team_id": 100, "anzeige_name": "Pein", "user_id": 11, "team_position": "JUNGLE"}]),
            ]
            liga.riot_ids_aus_partien({"Cookie": "x"}, partien)
            kader = json.loads((d / "riot-ids.json").read_text(encoding="utf-8"))
            pruefe(kader.get("Hub Peine I", {}).get("Pein") == {"riotId": "Neu11#EUW", "rolle": "Top",
                                                               "verifiziert": False, "quelle": "partie"},
                   "unbekannter Teilnehmer ergaenzt, Rolle = haeufigste Position (Top)")
            pruefe(kader["AFC II"]["Bekannt"]["verifiziert"] is True, "Vereinsangabe bleibt unangetastet")
            pruefe(len(abfragen) == 1, f"ein Profil, eine Abfrage ({len(abfragen)})")
            profile = json.loads((d / liga.PROFILE).read_text(encoding="utf-8"))
            pruefe(profile == {"11": "Neu11#EUW"}, "gespeichert wird nur die Riot-ID, keine Profildaten")
            liga.riot_ids_aus_partien({"Cookie": "x"}, partien)
            pruefe(len(abfragen) == 1, "zweiter Lauf: aus dem Zwischenspeicher, keine neue Abfrage")
            liga.riot_ids_aus_partien(None, partien)
            pruefe(len(abfragen) == 1, "ohne Anmeldung: nichts")
        finally:
            liga.ZIEL, liga.abrufen, liga.PAUSE = alt
    print("liga_partien:", "OK" if not fehler else f"{len(fehler)} Fehler")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
