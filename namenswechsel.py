"""Namenswechsel erkennen: Hat ein Spieler seine Riot-ID geaendert?

Die Riot-ID (Name#Tag) laesst sich jederzeit aendern; op.gg findet einen
umbenannten Spieler unter dem alten Namen dann nicht mehr - oder, schlimmer,
unter dem alten Namen steht inzwischen ein ANDERER Account. Was sich nie
aendert, ist die PUUID, Riots feste Kennung des Accounts. op.gg zeigt sie im
Quelltext der Profilseite; extract.js liest sie mit, auto_scrape.py merkt sie
sich je Spieler (meta.puuid in data/raw/*.json).

Den NEUEN Namen kennt op.gg ueber die PUUID nicht (getestet 13.10.2026:
404). Er kommt aus der Liga: leagueofregions.com fuehrt zu jedem Liga-Konto
den verknuepften Riot-Account (data/liga/riot-ids.json). Die PUUID bestaetigt
dann, dass hinter dem neuen Namen derselbe Account steht.

Urteile (Feld "art"):
  bestaetigt        neuer Name, gleiche PUUID - sicher derselbe Account
  uebernommen       neuer Name laut Liga-Konto, noch keine PUUID zum
                    Vergleich - uebernommen, damit keine Zahlen veralten
                    (Wunsch des Nutzers); ab jetzt wird die PUUID gespeichert
  liga-hinweis      die Liga fuehrt einen anderen Namen, aber unter dem
                    steht eine ANDERE PUUID als gespeichert - nicht
                    uebernommen, ein Mensch entscheidet
  nicht-gefunden    alter Name weg, keine Spur zum neuen
  anderer-account   unter dem Namen steht jetzt eine andere PUUID - die
                    Zahlen gehoeren nicht mehr zu unserem Spieler

Ergebnis: data/namenswechsel.json (eine Liste, je Mannschaft und Spieler der
letzte Stand). build.py bettet sie ein, das Board zeigt sie als Hinweis.
Keine Riot-API, kein Schluessel, keine Zugangsdaten.
"""
import datetime
import json
import pathlib

ROOT = pathlib.Path(__file__).parent
DATEI = ROOT / "data" / "namenswechsel.json"
ARTEN = ("bestaetigt", "uebernommen", "liga-hinweis", "nicht-gefunden", "anderer-account")
# Diese Urteile stellen teams.json auf den neuen Namen um.
UEBERNEHMEN = ("bestaetigt", "uebernommen")


def flach(riot_id):
    return (riot_id or "").strip().lower()


def liga_kandidat(label, alt_riot_id, liga_kader):
    """Die Riot-ID, unter der die Liga diesen Spieler JETZT fuehrt - wenn sie
    vom alten Namen abweicht. Gesucht wird ueber das Liga-Konto
    (Anzeigename = Label im Roster), nicht ueber die Riot-ID: genau die hat
    sich ja geaendert. liga_kader: {Anzeigename: {riotId, ...}}."""
    if not liga_kader:
        return None
    for anzeige, eintrag in liga_kader.items():
        if (anzeige or "").strip().lower() != (label or "").strip().lower():
            continue
        neu = (eintrag or {}).get("riotId")
        if neu and flach(neu) != flach(alt_riot_id):
            return neu
    return None


def urteil(*, gefunden, alte_puuid, neue_puuid, kandidat=None, kandidat_puuid=None):
    """Was ist mit diesem Spieler? None = alles in Ordnung.

    gefunden:       op.gg kennt den bisherigen Namen
    alte_puuid:     beim letzten Lauf gespeichert (oder None)
    neue_puuid:     jetzt unter dem bisherigen Namen gelesen (oder None)
    kandidat:       neuer Name laut Liga (oder None)
    kandidat_puuid: unter dem neuen Namen gelesen (None = nicht gefunden)
    """
    if gefunden:
        if alte_puuid and neue_puuid and alte_puuid != neue_puuid:
            return "anderer-account"
        return None
    if kandidat and kandidat_puuid and alte_puuid and kandidat_puuid == alte_puuid:
        return "bestaetigt"
    if kandidat and kandidat_puuid and not alte_puuid:
        return "uebernommen"
    if kandidat and kandidat_puuid:
        return "liga-hinweis"
    return "nicht-gefunden"


def eintrag(team, label, alt, art, neu=None, datum=None):
    if art not in ARTEN:
        raise ValueError("unbekannte Art: " + art)
    return {"team": team, "label": label, "alt": alt, "neu": neu, "art": art,
            "datum": datum or datetime.date.today().isoformat()}


def zusammenfuehren(bisher, neue, erledigt=()):
    """Je (Mannschaft, Spieler) gilt der neueste Eintrag. erledigt: Paare,
    die in diesem Lauf wieder unauffaellig waren - ihr alter Eintrag faellt
    weg, sonst stuende eine laengst geklaerte Warnung ewig im Board."""
    raus = {(e["team"], e["label"]): e for e in bisher or []}
    for paar in erledigt:
        raus.pop(tuple(paar), None)
    for e in neue:
        raus[(e["team"], e["label"])] = e
    return sorted(raus.values(), key=lambda e: (e["team"], e["label"]))


def uebernehmen(roster, eintraege):
    """Uebernommene Wechsel in den Roster (teams.json) schreiben: nur die
    Riot-ID; Label, Rolle, Bank, Draftplan und Turnierspiele haengen am
    Label und bleiben. Gibt die Zahl der Aenderungen zurueck. Ein
    liga-hinweis (andere PUUID) bleibt unangetastet - da entscheidet ein Mensch."""
    n = 0
    for e in eintraege:
        if e.get("art") not in UEBERNEHMEN or not e.get("neu"):
            continue
        for team in roster:
            if team.get("team") != e["team"]:
                continue
            for spieler in team.get("players") or []:
                if spieler.get("label") == e["label"] and flach(spieler.get("riotId")) == flach(e["alt"]):
                    spieler["riotId"] = e["neu"]
                    n += 1
    return n


def lesen(pfad=None):
    pfad = pfad or DATEI           # zur Laufzeit - Tests biegen DATEI um
    try:
        d = json.loads(pathlib.Path(pfad).read_text(encoding="utf-8"))
        return d if isinstance(d, list) else []
    except (OSError, ValueError):
        return []


def schreiben(eintraege, pfad=None):
    pfad = pathlib.Path(pfad or DATEI)
    pfad.parent.mkdir(parents=True, exist_ok=True)
    pfad.write_text(json.dumps(eintraege, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def text(e):
    """Eine Zeile fuer die Konsole."""
    wer = f"{e['team']}/{e['label']}"
    if e["art"] == "bestaetigt":
        return f"{wer}: heisst jetzt {e['neu']} (vorher {e['alt']}) - gleicher Account, PUUID geprueft"
    if e["art"] == "uebernommen":
        return (f"{wer}: heisst laut Liga jetzt {e['neu']} (vorher {e['alt']}) - "
                f"uebernommen, PUUID ab jetzt gespeichert")
    if e["art"] == "liga-hinweis":
        return (f"{wer}: die Liga fuehrt {e['neu']}, dort steht aber ein anderer "
                f"Account als bisher - nicht uebernommen")
    if e["art"] == "anderer-account":
        return (f"{wer}: unter {e['alt']} steht jetzt ein anderer Account - "
                f"alter Stand behalten, neuen Namen eintragen")
    return f"{wer}: {e['alt']} gibt es auf op.gg nicht mehr - vermutlich umbenannt"
