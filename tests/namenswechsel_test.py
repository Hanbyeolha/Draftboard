"""Namenswechsel erkennen (namenswechsel.py) - ohne Netz.

    python tests/namenswechsel_test.py
"""
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import namenswechsel as nw  # noqa: E402

fehler = []


def pruefe(bedingung, text):
    print(("  ok    " if bedingung else "  FEHLER ") + text)
    if not bedingung:
        fehler.append(text)


def liga_riotids():
    """liga.py --riotids in einem Testordner: nur die Riot-ID wechselt, kein
    neuer Spieler, keine Rolle; der Befund landet in namenswechsel.json."""
    import json
    import liga
    with tempfile.TemporaryDirectory() as d:
        d = pathlib.Path(d)
        (d / "data" / "liga").mkdir(parents=True)
        roster = [{"team": "AFC2", "ligaName": "AFC II", "players": [
            {"label": "DeLouis", "riotId": "DeLouis#EUW", "role": "MIDDLE"},
            {"label": "Rest", "riotId": "Rest#1", "role": "UNKNOWN"}]}]
        (d / "teams.json").write_text(json.dumps(roster), encoding="utf-8")
        (d / "data" / "liga" / "riot-ids.json").write_text(json.dumps({"AFC II": {
            "DeLouis": {"riotId": "Louis#NEU", "rolle": "Mid"},
            "Rest": {"riotId": "Rest#1", "rolle": "Top"},
            "Neuling": {"riotId": "Neu#1", "rolle": "ADC"}}}), encoding="utf-8")
        alt = (liga.ROOT, liga.ZIEL, nw.DATEI)
        liga.ROOT, liga.ZIEL, nw.DATEI = d, d / "data" / "liga", d / "data" / "namenswechsel.json"
        try:
            liga.kader_abgleichen(eintragen=True, nur_riotid=True)
        finally:
            liga.ROOT, liga.ZIEL, nw.DATEI = alt
        neu = json.loads((d / "teams.json").read_text(encoding="utf-8"))
        spieler = {p["label"]: p for p in neu[0]["players"]}
        pruefe(spieler["DeLouis"]["riotId"] == "Louis#NEU" and spieler["DeLouis"]["role"] == "MIDDLE",
               "--riotids: neuer Name aus dem Liga-Konto uebernommen, Rolle bleibt")
        pruefe(spieler["Rest"]["role"] == "UNKNOWN", "--riotids: Rollen bleiben unangetastet")
        pruefe("Neuling" not in spieler, "--riotids: keine neuen Spieler")
        befund = json.loads((d / "data" / "namenswechsel.json").read_text(encoding="utf-8"))
        pruefe([(b["label"], b["art"], b["neu"]) for b in befund] == [("DeLouis", "uebernommen", "Louis#NEU")],
               "Befund fuers Board: uebernommen")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    kader = {"DeLouis": {"riotId": "Louis#NEU"}, "Aaghn": {"riotId": "Aaghn#EUW"}}
    pruefe(nw.liga_kandidat("DeLouis", "DeLouis#EUW", kader) == "Louis#NEU",
           "Liga fuehrt das Liga-Konto unter neuer Riot-ID")
    pruefe(nw.liga_kandidat("aaghn", "AAGHN#euw", kader) is None, "gleiche ID (Gross/Klein egal): kein Kandidat")
    pruefe(nw.liga_kandidat("Fremd", "X#1", kader) is None, "unbekanntes Liga-Konto: kein Kandidat")
    pruefe(nw.liga_kandidat("DeLouis", "DeLouis#EUW", {}) is None, "ohne Ligadaten: kein Kandidat")

    u = nw.urteil
    pruefe(u(gefunden=True, alte_puuid="A", neue_puuid="A") is None, "gefunden, gleiche PUUID: alles gut")
    pruefe(u(gefunden=True, alte_puuid=None, neue_puuid="A") is None, "erste PUUID: nur merken")
    pruefe(u(gefunden=True, alte_puuid="A", neue_puuid="B") == "anderer-account", "Name gehoert jetzt jemand anderem")
    pruefe(u(gefunden=False, alte_puuid="A", neue_puuid=None, kandidat="N#1", kandidat_puuid="A") == "bestaetigt",
           "neuer Name, gleiche PUUID: bestaetigt")
    pruefe(u(gefunden=False, alte_puuid="A", neue_puuid=None, kandidat="N#1", kandidat_puuid="B") == "liga-hinweis",
           "neuer Name, ANDERE PUUID: nur Hinweis, nicht uebernommen")
    pruefe(u(gefunden=False, alte_puuid=None, neue_puuid=None, kandidat="N#1", kandidat_puuid="B") == "uebernommen",
           "ohne gespeicherte PUUID: Liga-Name uebernehmen, damit nichts veraltet")
    pruefe(u(gefunden=False, alte_puuid="A", neue_puuid=None, kandidat="N#1", kandidat_puuid=None) == "nicht-gefunden",
           "Liga-Kandidat existiert auf op.gg nicht: nicht gefunden")
    pruefe(u(gefunden=False, alte_puuid="A", neue_puuid=None) == "nicht-gefunden", "keine Spur")

    alt = [nw.eintrag("AFC2", "DeLouis", "DeLouis#EUW", "nicht-gefunden", datum="2026-10-12"),
           nw.eintrag("AFC1", "Aaghn", "Aaghn#EUW", "anderer-account", datum="2026-10-12")]
    neu = [nw.eintrag("AFC2", "DeLouis", "DeLouis#EUW", "bestaetigt", "Louis#NEU", datum="2026-10-13")]
    z = nw.zusammenfuehren(alt, neu, erledigt=[("AFC1", "Aaghn")])
    pruefe([(e["team"], e["label"], e["art"]) for e in z] == [("AFC2", "DeLouis", "bestaetigt")],
           "neuester Eintrag gewinnt, Geklaertes faellt weg")

    roster = [{"team": "AFC2", "players": [{"label": "DeLouis", "riotId": "DeLouis#EUW", "role": "MIDDLE"},
                                           {"label": "X", "riotId": "X#1"}]}]
    roster[0]["players"].append({"label": "Z", "riotId": "Z#1", "bench": True})
    n = nw.uebernehmen(roster, z + [nw.eintrag("AFC2", "X", "X#1", "liga-hinweis", "Y#2"),
                                    nw.eintrag("AFC2", "Z", "Z#1", "uebernommen", "Zett#9")])
    pruefe(n == 2 and roster[0]["players"][0] == {"label": "DeLouis", "riotId": "Louis#NEU", "role": "MIDDLE"},
           "bestaetigt landet im Roster, Label und Rolle bleiben")
    pruefe(roster[0]["players"][2] == {"label": "Z", "riotId": "Zett#9", "bench": True},
           "uebernommen (Liga) landet im Roster, Bank bleibt")
    pruefe(roster[0]["players"][1]["riotId"] == "X#1", "Liga-Hinweis (andere PUUID) aendert den Roster nicht")

    with tempfile.TemporaryDirectory() as d:
        pfad = pathlib.Path(d) / "nw.json"
        pruefe(nw.lesen(pfad) == [], "fehlende Datei: leere Liste")
        nw.schreiben(z, pfad)
        pruefe(nw.lesen(pfad) == z, "schreiben und lesen")
    try:
        nw.eintrag("A", "B", "C", "quatsch")
        pruefe(False, "unbekannte Art wird abgelehnt")
    except ValueError:
        pruefe(True, "unbekannte Art wird abgelehnt")

    liga_riotids()
    print("namenswechsel:", "OK" if not fehler else f"{len(fehler)} Fehler")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
