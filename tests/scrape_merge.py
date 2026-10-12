"""auto_scrape.py: ergaenzen statt ersetzen - ohne op.gg, im Testordner.

    python tests/scrape_merge.py

Prueft die Regeln vom 12.10.2026, ausgeloest durch DeLouis (AFC2), der
nach einem vollen Lauf mit leeren Tabellen seine 79 Zeilen verlor:
  - load_existing fuehrt ALLE Dateien eines Teams zusammen, je Spieler die
    juengste mit Championzeilen
  - write_team behaelt den alten Stand, wenn ein Spieler leere Tabellen
    liefert, und nimmt nur Spieler mit, die noch im Kader stehen
Keine Netzzugriffe, nichts in data/raw wird angefasst.
"""
import json
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import auto_scrape as A  # noqa: E402


def spieler(label, zeilen):
    return {"meta": {"team": "X", "label": label},
            "seasons": [{"id": 33, "c": [{"champ": "Ahri"}] * zeilen}]}


def zeilen(p):
    return sum(len(s.get("c") or []) for s in (p or {}).get("seasons") or [])


def main():
    fehler = []
    with tempfile.TemporaryDirectory() as tmp:
        A.RAW = pathlib.Path(tmp)
        (A.RAW / "x-2026-10-06.json").write_text(json.dumps(
            {"players": {"A": spieler("A", 5), "B": spieler("B", 7),
                         "Ehemalig": spieler("Ehemalig", 3)}, "queues": {}}), encoding="utf-8")
        (A.RAW / "x-2026-10-10.json").write_text(json.dumps(
            {"players": {"A": spieler("A", 9), "B": spieler("B", 0)}, "queues": {}}),
            encoding="utf-8")
        (A.RAW / "x-2026-10-11.json").write_text(json.dumps(
            {"players": {"A": spieler("A", 11)}, "queues": {}}), encoding="utf-8")

        base = A.load_existing("X")
        z = {k: zeilen(v) for k, v in base["players"].items()}
        if z != {"A": 11, "B": 7, "Ehemalig": 3}:
            fehler.append(f"load_existing: {z} statt A 11, B 7, Ehemalig 3")

        # Neuer Lauf: A frisch, B mit leeren Tabellen, Ehemalig nicht mehr im Kader.
        ziel, _, behalten = A.write_team(
            "X", {"A": spieler("A", 13), "B": spieler("B", 0)}, {}, {}, {}, False,
            base, roster_keys={"A", "B"})
        neu = json.loads(ziel.read_text(encoding="utf-8"))["players"]
        z = {k: zeilen(v) for k, v in neu.items()}
        if z != {"A": 13, "B": 7}:
            fehler.append(f"write_team: {z} statt A 13, B 7 (ohne Ehemalig)")
        if behalten != ["B"]:
            fehler.append(f"write_team meldet behalten={behalten} statt ['B']")
        uebrig = sorted(p.name for p in A.RAW.glob("*.json"))
        if uebrig != [ziel.name]:
            fehler.append(f"alte Dateien nicht ersetzt: {uebrig}")

    for f in fehler:
        print("FEHLER:", f)
    print("scrape_merge:", "OK" if not fehler else f"{len(fehler)} Fehler")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
