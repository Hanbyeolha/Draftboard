"""Holt die Turnierzahlen von leagueofregions.com.

Die Liga fuehrt dort Buch ueber die gespielten Partien - anders als op.gg also
echte Turnierdaten statt Soloqueue. Oeffentlich und ohne Anmeldung erreichbar
sind die Statistiken je Mannschaft: Championpool, Bans, Gegnerbilanz, Kader.

    python liga.py              # alle zugeordneten Teams holen
    python liga.py "AFC1"       # nur eines
    python liga.py --liste      # nur zeigen, welche Mannschaften es dort gibt

Geholt wird ohne Modusfilter: Freundschaftsspiele und Ligaspiele zusammen.
Geschrieben wird nach data/liga/<team>.json; build.py macht daraus die Queue
"Turnier" neben Ranked, Solo und Flex.

Die einzelnen Partien mit Picks und Bans liegen hinter /api/spiele/ und
verlangen ein Bearer-Token, also einen Login. Dieses Skript kommt bewusst ohne
Zugangsdaten aus.
"""

import argparse
import http.cookies
import datetime
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).parent
ZIEL = ROOT / "data" / "liga"
API = "https://leagueofregions.com/api"
BASIS = API + "/statistik"
# Ohne Filter kommt alles: Freundschaftsspiele und Ligaspiele. Frueher stand
# hier "friendly" - sobald die Liga richtig losgeht, haetten dann ausgerechnet
# die Ligaspiele gefehlt.
NUR_LIGA = "?modi=liga"                # nur zum Aufteilen der Zahlen
ROEMISCH = {1: "I", 2: "II", 3: "III", 4: "IV"}
PAUSE = 0.35                           # Sekunden zwischen den Abrufen
TOKEN_DATEI = ROOT / "liga-token.txt"  # steht in .gitignore
SPIELE_PFAD = "/spiele/alle/"          # unterhalb von /api/, nicht /api/statistik/


def hole(pfad, versuche=3):
    """Einen Abruf machen - hoeflich, mit Pause und Nachsicht bei 429.

    Fuer jeden Spieler ist ein eigener Abruf noetig; ohne Bremse antwortet die
    Liga irgendwann mit "Too Many Requests"."""
    anfrage = urllib.request.Request(BASIS + pfad,
                                     headers={"User-Agent": "Draftboard/1.0"})
    for versuch in range(versuche):
        try:
            time.sleep(PAUSE)
            with urllib.request.urlopen(anfrage, timeout=30) as antwort:
                return json.loads(antwort.read().decode("utf-8"))
        except urllib.error.HTTPError as fehler:
            if fehler.code != 429 or versuch == versuche - 1:
                raise
            warten = int(fehler.headers.get("Retry-After") or 0) or 5 * (versuch + 1)
            print(f"      (Liga bremst, warte {warten}s)", flush=True)
            time.sleep(warten)
    raise urllib.error.URLError("zu viele Versuche")


def zugang():
    """Die Anmeldung aus liga-token.txt als fertige Kopfzeilen.

    Die Seite schickt ihre Schluessel als Cookie (access_token=...), aeltere
    Wege nutzen "Authorization: Bearer ...". Beides wird angenommen, damit es
    egal ist, was man aus dem Netzwerk-Reiter kopiert hat. Die Datei steht in
    .gitignore und landet nie im oeffentlichen Repo."""
    if not TOKEN_DATEI.exists():
        return None
    wert = " ".join(TOKEN_DATEI.read_text(encoding="utf-8").split())
    if not wert:
        return None
    if "access_token=" in wert or "refresh_token=" in wert:
        return {"Cookie": wert}
    if wert.lower().startswith("cookie:"):
        return {"Cookie": wert.split(":", 1)[1].strip()}
    return {"Authorization": "Bearer " + wert.split()[-1]}


def erneuern(kopf):
    """Den Zugang auffrischen, bevor damit gearbeitet wird.

    Der access_token der Liga lebt nur Minuten - eine Stunde nach dem Kopieren
    war die Datei bisher wertlos. Daneben steht ein refresh_token, der laenger
    haelt; damit gibt POST /auth/token/refresh/ ein frisches Paar aus. Die
    neuen Werte kommen zurueck in liga-token.txt, sonst laeuft auch der
    refresh_token irgendwann ab, weil die Liga ihn bei jedem Mal austauscht."""
    if not kopf or "Cookie" not in kopf:
        return kopf
    try:
        anfrage = urllib.request.Request(
            API + "/auth/token/refresh/", method="POST", data=b"",
            headers={"User-Agent": "Draftboard/1.0",
                     "Content-Type": "application/json", **kopf})
        with urllib.request.urlopen(anfrage, timeout=30) as antwort:
            gesetzt = antwort.headers.get_all("Set-Cookie") or []
    except (urllib.error.HTTPError, urllib.error.URLError, OSError, ValueError):
        return kopf

    frisch = {}
    for zeile in gesetzt:
        keks = http.cookies.SimpleCookie()
        keks.load(zeile)
        for name, wert in keks.items():
            frisch[name] = wert.value
    if not frisch:
        return kopf

    # Was sonst noch in der Zeile stand, bleibt stehen - die Liga schickt nur
    # die beiden Schluessel zurueck, nicht den ganzen Cookie.
    alt = {}
    for teil in kopf["Cookie"].split(";"):
        name, _, wert = teil.strip().partition("=")
        if name:
            alt[name] = wert
    alt.update(frisch)
    neu = "; ".join(f"{k}={v}" for k, v in alt.items())
    try:
        TOKEN_DATEI.write_text(neu + chr(10), encoding="utf-8")
    except OSError:
        pass
    return {"Cookie": neu}


def riot_ids_holen(kopf):
    """Die hinterlegten Riot-IDs aller Mannschaften einsammeln.

    Jeder Spieler verknuepft bei der Anmeldung seinen Riot-Account; die
    Vereinsansicht gibt ihn als riot_summoner_name/riot_tag_line heraus. Das
    ist die einzige Stelle, an der die Liga die Riot-ID herausrueckt - die
    Statistik kennt nur die Anzeigenamen. Damit bekommen auch Spieler ein
    op.gg-Profil, die in keinem Roster stehen."""
    if not kopf:
        return {}
    def hol(pfad):
        anfrage = urllib.request.Request(
            API + pfad, headers={"User-Agent": "Draftboard/1.0", **kopf})
        time.sleep(PAUSE)
        with urllib.request.urlopen(anfrage, timeout=30) as antwort:
            return json.loads(antwort.read().decode("utf-8"))

    try:
        vereine = hol("/clubs/")
    except (urllib.error.HTTPError, urllib.error.URLError, OSError, ValueError):
        return {}

    gesammelt = {}
    for verein in vereine:
        try:
            mannschaften = hol(f"/clubs/{verein['id']}/teams/")
        except (urllib.error.HTTPError, urllib.error.URLError, OSError, ValueError):
            continue
        for mannschaft in mannschaften:
            eintraege = {}
            for spieler in mannschaft.get("players") or []:
                name = spieler.get("riot_summoner_name")
                tag = spieler.get("riot_tag_line")
                anzeige = spieler.get("anzeige_name") or spieler.get("username")
                if name and tag and anzeige:
                    eintraege[anzeige] = {
                        "riotId": f"{name}#{tag}",
                        "rolle": spieler.get("team_role"),
                        "verifiziert": bool(spieler.get("riot_verified")),
                    }
            if eintraege:
                gesammelt[mannschaft["name"]] = eintraege
    if gesammelt:
        ZIEL.mkdir(parents=True, exist_ok=True)
        (ZIEL / "riot-ids.json").write_text(
            json.dumps(gesammelt, ensure_ascii=False, indent=2), encoding="utf-8")
        anzahl = sum(len(v) for v in gesammelt.values())
        print(f"  Riot-IDs: {anzahl} Spieler in {len(gesammelt)} Mannschaften "
              f"-> data/liga/riot-ids.json")
    return gesammelt


def spiele_liste(kopf):
    """Die Partienliste holen - alle Seiten, nur die eigene Liga.

    Die Liste blaettert (30 je Seite) und zeigt alle Regionen, auch fremde.
    Beides zusammen hiess frueher: nur die juengsten 30 Partien kamen an, und
    die haetten Spiele fremder Vereine mitgebracht. Darum jede Seite holen und
    auf die Mannschaften eingrenzen, die auch in der Statistik stehen."""
    try:
        unsere = {m["name"] for m in hole("/")["mannschaften"]["liste"]}
    except (urllib.error.URLError, OSError, ValueError, KeyError):
        unsere = set()

    alle, seite, seiten = [], 1, 1
    while seite <= seiten:
        try:
            anfrage = urllib.request.Request(
                f"{API}{SPIELE_PFAD}?seite={seite}",
                headers={"User-Agent": "Draftboard/1.0", **kopf})
            time.sleep(PAUSE)
            with urllib.request.urlopen(anfrage, timeout=60) as antwort:
                block = json.loads(antwort.read().decode("utf-8"))
        except urllib.error.HTTPError as fehler:
            print("Das Token wird abgelehnt (401). Abgelaufen? Neu kopieren."
                  if fehler.code == 401 else f"Fehlgeschlagen: {fehler}")
            return []
        except (urllib.error.URLError, OSError, ValueError) as fehler:
            print("Fehlgeschlagen:", fehler)
            return []
        alle += block.get("eintraege") or []
        seiten = block.get("seiten") or 1
        seite += 1

    if not unsere:
        return alle
    eigene = [e for e in alle
              if {e.get("seite_a"), e.get("seite_b")} <= unsere]
    if len(alle) != len(eigene):
        print(f"  Partienliste: {len(alle)} Eintraege auf {seiten} Seiten, "
              f"{len(eigene)} davon aus eurer Liga")
    return eigene


def hole_spiele(nur_uebernehmen=False):
    """Die einzelnen Partien holen und nach games.json uebernehmen.

    Picks, Bans, Aufstellung und Ergebnis liegen hinter dem Login. Ohne Zugang
    wird der zuletzt gesicherte Stand aus data/liga/partien-roh.json benutzt -
    das Uebernehmen geht also auch spaeter noch, wenn der Schluessel laengst
    abgelaufen ist."""
    cache = ZIEL / "partien-roh.json"
    partien = []
    kopf = erneuern(zugang())
    riot_ids_holen(kopf)

    if not nur_uebernehmen and kopf:
        liste = spiele_liste(kopf)

        ohne_daten = 0
        for i, e in enumerate(liste, 1):
            try:
                anfrage = urllib.request.Request(
                    f"{API}/matches/{e['id']}/stats/",
                    headers={"User-Agent": "Draftboard/1.0", **kopf})
                time.sleep(PAUSE)
                with urllib.request.urlopen(anfrage, timeout=45) as antwort:
                    roh = json.loads(antwort.read().decode("utf-8"))
                partien.append({"liste": ohne_wappen(e), "stats": ohne_wappen(roh)})
            except urllib.error.HTTPError as fehler:
                # 404 heisst: zu dieser Partie wurden nie Riot-Daten hinterlegt.
                ohne_daten += 1 if fehler.code == 404 else 0
            except (urllib.error.URLError, OSError, ValueError):
                ohne_daten += 1
        if partien:
            ZIEL.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(partien, ensure_ascii=False), encoding="utf-8")
            print(f"{len(partien)} von {len(liste)} Partien geholt "
                  f"({ohne_daten} ohne hinterlegte Spieldaten) -> {cache.relative_to(ROOT)}")
    elif not kopf and not nur_uebernehmen:
        print("Keine Anmeldung gefunden. So kommst du daran - ohne Riot-Passwort:")
        print("  1. Auf leagueofregions.com anmelden (wie immer ueber Riot).")
        print("  2. F12 -> Reiter Netzwerk -> einen Aufruf an /api/ anklicken.")
        print("  3. Bei den Anfrage-Kopfzeilen die Zeile 'Cookie:' suchen,")
        print("     den ganzen Wert kopieren und in " + TOKEN_DATEI.name + " speichern.")
        print()
        print("WICHTIG: Das ist ein Zugangsschluessel. Nur in diese Datei, nie")
        print("in einen Chat, nie als Screenshot. Die Datei steht in .gitignore.")

    if not partien:
        if not cache.exists():
            return 1
        partien = json.loads(cache.read_text(encoding="utf-8"))
        print(f"Benutze den gesicherten Stand: {len(partien)} Partien")

    icons = {}
    for datei in sorted((ROOT / "data" / "raw").glob("*.json")):
        icons.update({v: k for k, v in
                      json.loads(datei.read_text(encoding="utf-8")).get("icons", {}).items()})
    return in_games_schreiben(partien, champion_namen(), icons)


def ohne_wappen(o):
    """Vereinswappen stecken als Base64 in der Antwort - die blaehen nur auf."""
    if isinstance(o, dict):
        return {k: ohne_wappen(v) for k, v in o.items()
                if not (isinstance(v, str) and v.startswith("data:image"))}
    if isinstance(o, list):
        return [ohne_wappen(x) for x in o]
    return o


def champion_namen():
    """Championnummer -> Riot-Name. Die Liga bannt mit Nummern.

    Die Praesenzliste der Liga kennt nur Champions, die auch vorkamen - fuer
    einen Ban wie Nummer 50 stuende dort nichts. Deshalb zuerst Riots eigene
    Liste, einmal geholt und gespeichert."""
    cache = ZIEL / "champion-ids.json"
    if cache.exists():
        return {int(k): v for k, v in
                json.loads(cache.read_text(encoding="utf-8")).items()}
    nummern = {}
    try:
        stand = json.loads(urllib.request.urlopen(
            "https://ddragon.leagueoflegends.com/api/versions.json",
            timeout=30).read().decode("utf-8"))[0]
        daten = json.loads(urllib.request.urlopen(
            f"https://ddragon.leagueoflegends.com/cdn/{stand}/data/en_US/champion.json",
            timeout=30).read().decode("utf-8"))
        nummern = {int(c["key"]): name for name, c in (daten.get("data") or {}).items()}
    except (urllib.error.URLError, OSError, ValueError, KeyError, IndexError):
        pass
    if not nummern:                      # Notnagel: was die Liga selbst kennt
        try:
            for e in hole("/").get("praesenz", {}).get("liste") or []:
                if e.get("champion_id") and e.get("name"):
                    nummern[e["champion_id"]] = e["name"]
        except (urllib.error.URLError, OSError, ValueError):
            pass
    if nummern:
        ZIEL.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps({str(k): v for k, v in nummern.items()},
                                    ensure_ascii=False), encoding="utf-8")
    return nummern


def anzeige_name(riot_name, icons):
    """Riot schreibt DrMundo, das Board Dr. Mundo."""
    return icons.get(riot_name, riot_name)


def unsere_namen():
    """Liga-Mannschaftsnummer -> unser Teamname aus teams.json."""
    roster = json.loads((ROOT / "teams.json").read_text(encoding="utf-8"))
    return {t["ligaTeamId"]: t["team"] for t in roster if t.get("ligaTeamId")}


def partie_umbauen(eintrag, nummern, icons, teams):
    """Eine Partie der Liga in die Form von games.json bringen."""
    stats = eintrag["stats"]
    liste = eintrag["liste"]
    seiten = {t["red_or_blue_team"]: t for t in stats.get("game_match_team") or []}
    if len(seiten) != 2:
        return None

    def name_von(seite):
        t = seiten[seite]
        return teams.get(t.get("lor_team_id")) or t.get("lor_team_name") or "?"

    blau, rot = name_von(100), name_von(200)
    sieger = next((name_von(s) for s, t in seiten.items() if t.get("win")), None)

    picks, bans = {blau: [], rot: []}, {blau: [], rot: []}
    for m in stats.get("game_match_participant") or []:
        ziel = blau if m.get("team_id") == 100 else rot
        picks[ziel].append({
            "role": m.get("team_position") or m.get("individual_position") or "UNKNOWN",
            "champ": anzeige_name(m.get("champion_name") or "", icons),
            "player": m.get("anzeige_name") or m.get("username") or "",
        })
    for seite, t in seiten.items():
        ziel = blau if seite == 100 else rot
        # Auch Bans auf die Anzeigenamen des Boards bringen, sonst stuende
        # dort DrMundo statt Dr. Mundo und das Bild fehlte.
        bans[ziel] = [anzeige_name(nummern.get(b, str(b)), icons)
                      for b in (t.get("bans") or []) if b and b > 0]

    titel = (liste.get("titel") or "").replace("·", "-")
    teil, _, nummer = titel.rpartition("Spiel")
    datum = (liste.get("zeitpunkt") or "")[:10]
    tag = f"{datum[8:10]}.{datum[5:7]}.{datum[0:4]}" if len(datum) == 10 else datum
    # Blau und Rot wechseln zwischen den Spielen einer Serie - der Serienname
    # muss deshalb aus einer festen Reihenfolge kommen, sonst zerfaellt eine
    # BO3 in drei Einzelserien.
    paarung = " vs ".join(sorted([blau, rot]))
    serie = f"{paarung} - {(teil or titel).strip(' -')} ({tag})"
    return {
        "series": serie,
        "game": int(nummer.strip()) if nummer.strip().isdigit() else 1,
        "format": "normal",
        "date": datum,
        "matchId": (stats.get("game_match") or {}).get("match_id"),
        "blue": blau,
        "red": rot,
        "winner": sieger,
        "picks": picks,
        "bans": bans,
        "modus": liste.get("modus"),
        "draftArt": (liste.get("serie") or {}).get("draft_art"),
        "zeit": liste.get("zeitpunkt") or "",
    }


def schluessel(spiel):
    """Zwei Eintraege meinen dieselbe Partie, wenn die Riot-Nummer passt -
    sonst bei gleichem Datum, gleicher Paarung und gleicher Spielnummer."""
    if spiel.get("matchId"):
        return ("riot", spiel["matchId"])
    paarung = tuple(sorted([spiel.get("blue") or "", spiel.get("red") or ""]))
    return ("datum", spiel.get("date"), paarung, spiel.get("game"))


def fearless_erkennen(neue):
    """Fearless erkennen. Steht die Draftart in der Serie, gilt sie; sonst der
    alte Schluss: wiederholt sich in einer Serie kein Champion, war es aller
    Wahrscheinlichkeit nach Fearless."""
    offen = []
    for s in neue:
        art = s.pop("draftArt", None)
        if art:
            s["format"] = "fearless" if "fearless" in art else "normal"
        else:
            offen.append(s)
    neue = offen

    nach_serie = {}
    for s in neue:
        nach_serie.setdefault(s["series"], []).append(s)
    for serie, spiele in nach_serie.items():
        if len(spiele) < 2:
            continue
        alle = [p["champ"] for s in spiele for liste in s["picks"].values() for p in liste]
        if len(alle) == len(set(alle)):
            for s in spiele:
                s["format"] = "fearless"


def nummern_entwirren(neue):
    """Zwei Freundschaftsspiele am selben Tag heissen beide nur
    "Freundschaftsspiel" und bekommen darum beide die Spielnummer 1. Stossen
    Nummern in einer Serie zusammen, wird nach Uhrzeit durchgezaehlt."""
    nach_serie = {}
    for s in neue:
        nach_serie.setdefault(s["series"], []).append(s)
    for spiele in nach_serie.values():
        if len(spiele) == len({s["game"] for s in spiele}):
            continue
        for nr, s in enumerate(sorted(spiele, key=lambda x: x.get("zeit") or ""), 1):
            s["game"] = nr


def in_games_schreiben(partien, nummern, icons, trocken=False):
    """Die geholten Partien nach games.json uebernehmen - ohne Vorhandenes
    anzufassen. Eigene Eintragungen bleiben also, wie sie sind."""
    teams = unsere_namen()
    umgebaut = [p for p in (partie_umbauen(e, nummern, icons, teams) for e in partien) if p]
    fearless_erkennen(umgebaut)
    nummern_entwirren(umgebaut)

    pfad = ROOT / "games.json"
    vorhanden = json.loads(pfad.read_text(encoding="utf-8")) if pfad.exists() else []
    bekannt = {schluessel(s) for s in vorhanden}

    neu, uebersprungen = [], []
    for spiel in umgebaut:
        modus = spiel.pop("modus", None)
        spiel.pop("zeit", None)
        if schluessel(spiel) in bekannt:
            uebersprungen.append(spiel)
            continue
        bekannt.add(schluessel(spiel))
        neu.append(spiel)

    print(f"  {len(umgebaut)} Partien umgebaut: {len(neu)} neu, "
          f"{len(uebersprungen)} schon in games.json")
    for s in neu:
        gewinner = s["winner"] or "offen"
        print(f"    + {s['date']} {s['series'][:56]:56} Spiel {s['game']} "
              f"({s['format']}, Sieger {gewinner})")
    if trocken or not neu:
        return 0
    zusammen = vorhanden + neu
    zusammen.sort(key=lambda s: (s.get("date") or "", s.get("series") or "", s.get("game") or 0))
    text = json.dumps(zusammen, ensure_ascii=False, indent=2).replace(chr(13), "")
    pfad.write_text(text + chr(10), encoding="utf-8")
    print(f"  games.json: {len(vorhanden)} -> {len(zusammen)} Spiele")
    return 0


def nummer_aus(name):
    """Mannschaftsnummer aus dem Namen: AFC2 -> 2, "SSV Remlingen 2" -> 2."""
    treffer = re.search(r"(\d+)\s*$", name)
    return int(treffer.group(1)) if treffer else 1


def verein_von(team_name, liga_json):
    """Der Verein laut league.json, sonst der Name selbst."""
    pfad = ROOT / "league.json"
    if pfad.exists():
        for verein in json.loads(pfad.read_text(encoding="utf-8")):
            if team_name in (verein.get("teams") or []):
                return verein["club"]
    return re.sub(r"\s*\d+\s*$", "", team_name).strip()


def zuordnen(team, mannschaften):
    """Zu einem Team aus teams.json die Mannschaft der Liga finden.

    Feste Zuordnung schlaegt alles: steht ligaTeamId im Roster, gilt die."""
    if team.get("ligaTeamId"):
        return next((m for m in mannschaften
                     if m["team_id"] == team["ligaTeamId"]), None)

    verein = verein_von(team["team"], mannschaften)
    passend = [m for m in mannschaften if m.get("verein") == verein]
    if not passend:
        # Zweiter Versuch ueber den Namen: "MTV Hattorf" -> "MTV Hattorf I"
        rumpf = re.sub(r"\s*\d+\s*$", "", team["team"]).strip().lower()
        passend = [m for m in mannschaften
                   if m["name"].lower().startswith(rumpf)]
    if not passend:
        return None
    if len(passend) == 1:
        return passend[0]
    # Mehrere Mannschaften eines Vereins: ueber die Nummer im Namen.
    ziffer = nummer_aus(team["team"])
    roemisch = ROEMISCH.get(ziffer)
    genau = [m for m in passend if roemisch and m["name"].endswith(" " + roemisch)]
    if genau:
        return genau[0]
    passend.sort(key=lambda m: m["name"])
    return passend[min(ziffer, len(passend)) - 1]


def team_datei(team_name):
    kurz = "".join(c if c.isalnum() else "-" for c in team_name.lower())
    return ZIEL / (re.sub(r"-+", "-", kurz).strip("-") + ".json")


def holen_und_schreiben(team, mannschaft):
    # Ohne Filter: Freundschafts- UND Ligaspiele. Aufteilen laesst sich das
    # hier nicht - der Mannschafts-Endpunkt wertet modi nicht aus, er liefert
    # mit und ohne Filter dieselben Zahlen. Nur die Gesamtuebersicht kann das.
    daten = hole(f"/mannschaft/{mannschaft['team_id']}/")
    # Der Mannschafts-Endpunkt kappt die Championliste bei sechs je Spieler -
    # Partien gehen dabei verloren. Der Spielerendpunkt liefert sie vollstaendig
    # und obendrein die KDA.
    spieler, rollen, nummern_je_spieler, unvollstaendig = {}, {}, {}, []
    for mitglied in daten.get("kader") or []:
        champions = [[c["name"], c["partien"], c["siege"]]
                     for c in (mitglied.get("champions") or [])]
        try:
            voll = hole(f"/spieler/{mitglied['user_id']}/")
            champions = [[c["name"], c["partien"], c["siege"], c.get("kda")]
                         for c in (voll.get("champions") or [])] or champions
            if sum(c[1] for c in champions) < (voll.get("partien") or 0):
                unvollstaendig.append(mitglied["name"])
        except (urllib.error.URLError, OSError, ValueError):
            unvollstaendig.append(mitglied["name"])
        if champions:
            spieler[mitglied["name"]] = champions
        # Position und Nummer mitnehmen: damit lassen sich Spieler, die nur
        # die Liga kennt, mit Rolle und Profillink ins Board holen.
        rollen[mitglied["name"]] = mitglied.get("rolle") or "UNKNOWN"
        nummern_je_spieler[mitglied["name"]] = mitglied.get("user_id")

    inhalt = {
        "team": team["team"],
        "ligaTeamId": mannschaft["team_id"],
        "ligaName": mannschaft["name"],
        "verein": mannschaft.get("verein"),
        "geholtAm": datetime.date.today().isoformat(),
        "partien": daten.get("partien"),
        "siege": daten.get("siege"),
        "spieler": spieler,
        "rollen": rollen,
        "nummern": nummern_je_spieler,
        "unvollstaendig": unvollstaendig,
        "bans": [{"name": b["name"], "partien": b["partien"], "siege": b["siege"]}
                 for b in (daten.get("banns") or [])],
        "gegner": [{"name": g["name"], "partien": g["partien"], "siege": g["siege"]}
                   for g in (daten.get("gegner") or [])],
        "videos": [{"datum": v.get("datum"), "gegner": (v.get("gegner") or {}).get("name"),
                    "url": v.get("url")} for v in (daten.get("videos") or [])],
    }
    ZIEL.mkdir(parents=True, exist_ok=True)
    ziel = team_datei(team["team"])
    ziel.write_text(json.dumps(inhalt, ensure_ascii=False), encoding="utf-8")
    return ziel, inhalt


def merken(team_name, liga_id):
    """Die gefundene Zuordnung in teams.json festhalten, damit sie stabil ist."""
    pfad = ROOT / "teams.json"
    roster = json.loads(pfad.read_text(encoding="utf-8"))
    geaendert = False
    for eintrag in roster:
        if eintrag["team"] == team_name and eintrag.get("ligaTeamId") != liga_id:
            eintrag["ligaTeamId"] = liga_id
            geaendert = True
    if geaendert:
        pfad.write_text(json.dumps(roster, ensure_ascii=False, indent=2).replace(chr(13), "") + chr(10),
                        encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Turnierzahlen der Liga holen")
    parser.add_argument("teams", nargs="*", help="Teamnamen (leer = alle)")
    parser.add_argument("--liste", action="store_true",
                        help="nur zeigen, welche Mannschaften die Liga kennt")
    parser.add_argument("--spiele", action="store_true",
                        help="die einzelnen Partien holen und nach games.json "
                             "uebernehmen (braucht liga-token.txt)")
    parser.add_argument("--uebernehmen", action="store_true",
                        help="nur den gesicherten Stand nach games.json uebernehmen")
    args = parser.parse_args()

    if args.spiele or args.uebernehmen:
        return hole_spiele(nur_uebernehmen=args.uebernehmen)

    try:
        gesamt = hole("/")
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print("Liga nicht erreichbar:", exc)
        return 1
    mannschaften = gesamt.get("mannschaften", {}).get("liste") or []
    try:
        liga_partien = hole("/" + NUR_LIGA)["uebersicht"]["partien"]
    except (urllib.error.URLError, OSError, ValueError, KeyError):
        liga_partien = 0
    gesamt_partien = gesamt["uebersicht"]["partien"]
    print(f"Liga: {gesamt_partien} Partien gesamt "
          f"({liga_partien} Liga, {gesamt_partien - liga_partien} Freundschaft), "
          f"{len(mannschaften)} Mannschaften")
    print("Je Mannschaft werden immer alle Partien geholt - Freundschaftsspiele "
          "und Ligaspiele zusammen.")

    if args.liste:
        for m in sorted(mannschaften, key=lambda m: m["name"]):
            print(f"  id {m['team_id']:3}  {m['name']:30} {m['partien']:2} Partien")
        return 0

    # Die ligaweiten Zahlen mitsichern: Meta, Seitenvergleich, Rekorde.
    ZIEL.mkdir(parents=True, exist_ok=True)
    gesamt["geholtAm"] = datetime.date.today().isoformat()
    gesamt["partienLiga"] = liga_partien
    try:
        gesamt["rekorde"] = hole("/rekorde/").get("rekorde")
    except (urllib.error.URLError, OSError, ValueError):
        pass
    (ZIEL / "gesamt.json").write_text(json.dumps(gesamt, ensure_ascii=False),
                                      encoding="utf-8")
    print(f"  Gesamtstatistik gesichert -> data/liga/gesamt.json")

    roster = json.loads((ROOT / "teams.json").read_text(encoding="utf-8"))
    wunsch = {a.lower() for a in args.teams}
    offen = []
    for team in roster:
        if wunsch and team["team"].lower() not in wunsch:
            continue
        mannschaft = zuordnen(team, mannschaften)
        if not mannschaft:
            offen.append(team["team"])
            continue
        try:
            ziel, inhalt = holen_und_schreiben(team, mannschaft)
        except (urllib.error.URLError, OSError, ValueError) as exc:
            print(f"  ! {team['team']}: {exc}")
            continue
        merken(team["team"], mannschaft["team_id"])
        zeilen = sum(len(c) for c in inhalt["spieler"].values())
        luecke = inhalt.get("unvollstaendig")
        print(f"  {team['team']:28} <- {inhalt['ligaName']:30} "
              f"{inhalt['partien']} Partien, {len(inhalt['spieler'])} Spieler, "
              f"{zeilen} Championzeilen -> {ziel.relative_to(ROOT)}"
              + (f"  ! unvollstaendig: {', '.join(luecke)}" if luecke else ""))

    for name in offen:
        print(f"  ! {name}: keine Mannschaft in der Liga gefunden "
              f"(ligaTeamId in teams.json setzen, siehe python liga.py --liste)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
