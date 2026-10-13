"""Modi, SCOUT-Filter und Zahlenzeilen (Draftboard 2.0, Phase 5) im Browser.

    python build.py --pages
    python tests/ui_scout.py

Prueft: drei Modi mit ihren Reitern (nur die des Modus sichtbar), Modus
merkt sich seinen Reiter, auch ueber Neuladen; Ziffern und Pfeile bleiben im
Modus; Championfilter nur ausserhalb von LIVE; Rollen- und Spielerfilter in
Spieler und Draftplan zugleich, mit Leerzustand; Kennzahlen als Zahlenzeile;
Kopf hoechstens 150 px bei 1440; am Handy die Modi unten, kein Ueberlauf.
Frisches Browserprofil, die gebaute index.html per file://.
"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

WURZEL = pathlib.Path(__file__).resolve().parent.parent
URL = os.environ.get("BOARD_URL") or (WURZEL / "index.html").as_uri()
UEBERLAUF = "() => document.documentElement.scrollWidth > window.innerWidth"
fehler = []


def pruefe(bedingung, text):
    print(("  ok    " if bedingung else "  FEHLER ") + text)
    if not bedingung:
        fehler.append(text)


def sichtbare_reiter(p):
    return p.evaluate("""() => [...document.querySelectorAll('.tabs .tab')]
      .filter((t) => t.offsetParent).map((t) => t.id)""")


def aktiv(p):
    return p.evaluate("""() => ({
      modus: document.querySelector('.modus[aria-pressed=true]').id,
      reiter: document.querySelector('.tab[aria-selected=true]').id})""")


def karten(p, host):
    return p.evaluate("""(h) => {
      const k = [...document.querySelectorAll('#' + h + ' > .panel[data-spieler]')];
      return {alle: k.length, sichtbar: k.filter((x) => !x.hidden).map((x) => x.dataset.role)}; }""", host)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if not (WURZEL / "index.html").exists():
        print("index.html fehlt - erst python build.py --pages")
        return 1
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        print("Modi bei 1440 px")
        kontext = b.new_context(viewport={"width": 1440, "height": 1000})
        p = kontext.new_page()
        seitenfehler = []
        p.on("pageerror", lambda e: seitenfehler.append(str(e)))
        p.goto(URL)
        p.wait_for_timeout(2500)
        a = aktiv(p)
        pruefe(a == {"modus": "modus-scout", "reiter": "tab-players"}, "Start: SCOUT · Spieler " + str(a))
        pruefe(sichtbare_reiter(p) == ["tab-players", "tab-liga", "tab-plan", "tab-heuristik"],
               "SCOUT zeigt nur seine Reiter: " + str(sichtbare_reiter(p)))
        hoehe = p.evaluate("() => document.querySelector('header.bar').getBoundingClientRect().height")
        pruefe(hoehe <= 150, f"Kopf {hoehe:.0f} px (hoechstens 150)")

        p.click("#tab-liga")
        p.click("#modus-live")
        p.wait_for_timeout(600)
        pruefe(sichtbare_reiter(p) == ["tab-briefing", "tab-draft", "tab-solo"], "LIVE: Briefing, Team-Draft, Solo Queue")
        pruefe(aktiv(p)["reiter"] == "tab-briefing", "LIVE oeffnet zuerst das Briefing")
        pruefe(not p.is_visible("#filter"), "kein Championfilter im LIVE-Modus")
        p.click("#modus-review")
        pruefe(sichtbare_reiter(p) == ["tab-games", "tab-planist"] and aktiv(p)["reiter"] == "tab-games",
               "REVIEW: Turnierspiele, Plan gegen Ist")
        pruefe(p.is_visible("#filter"), "Championfilter ausserhalb von LIVE da")
        p.click("#modus-scout")
        pruefe(aktiv(p)["reiter"] == "tab-liga", "SCOUT merkt sich Liga")

        # Ziffern und Pfeile bleiben im Modus
        p.locator("body").click(position={"x": 5, "y": 400})
        p.keyboard.press("3")
        pruefe(aktiv(p)["reiter"] == "tab-plan", "3 im SCOUT: Draftplan")
        p.keyboard.press("9")
        pruefe(aktiv(p)["reiter"] == "tab-plan", "9 gibt es im SCOUT nicht - nichts passiert")
        p.focus("#tab-plan")
        p.keyboard.press("ArrowRight")
        p.keyboard.press("ArrowRight")
        pruefe(aktiv(p)["reiter"] == "tab-players", "Pfeile laufen im Modus herum")

        # Neuladen: Modus und Reiter bleiben
        p.click("#modus-live")
        p.click("#tab-solo")
        p.reload()
        p.wait_for_timeout(2500)
        pruefe(aktiv(p) == {"modus": "modus-live", "reiter": "tab-solo"}, "nach Neuladen: LIVE · Solo " + str(aktiv(p)))
        p.click("#modus-scout")
        pruefe(aktiv(p)["reiter"] == "tab-players", "SCOUT kommt mit seinem letzten Reiter zurueck")

        # Queue und Season: immer sichtbar, ein Klick
        print("Queue-Auswahl")
        p.click("#modus-scout")
        p.click("#tab-players")
        p.wait_for_timeout(500)
        pruefe(p.is_visible("#queue-switch") and p.is_visible("#season-switch"), "Queue und Season ohne Aufklappen sichtbar")
        oben = p.evaluate("() => Math.round(document.getElementById('team-stats').getBoundingClientRect().top)")
        pruefe(oben <= 150, f"erste Daten bei {oben} px (hoechstens 150 bei 1440)")
        p.click("#queue-switch button:has-text('Turnier')")
        p.wait_for_timeout(800)
        pruefe(p.get_attribute("#queue-switch button:has-text('Turnier')", "aria-pressed") == "true"
               and not p.is_visible("#season-gruppe"), "Turnier: gewaehlt, Season ausgeblendet (gibt es dort nicht)")
        p.click("#queue-switch button:has-text('Flex')")
        p.wait_for_timeout(800)
        pruefe(p.is_visible("#season-gruppe"), "Flex: Season wieder da")
        p.click("#queue-switch button:has-text('Ranked')")
        p.wait_for_timeout(800)

        # Filter
        print("SCOUT-Filter")
        vorher = karten(p, "player-cards")
        pruefe(vorher["alle"] > 0 and len(vorher["sichtbar"]) == vorher["alle"], f"alle {vorher['alle']} Karten sichtbar")
        p.click("#panel-players .scout-rollen [data-rolle=MIDDLE]")
        k = karten(p, "player-cards")
        pruefe(k["sichtbar"] and set(k["sichtbar"]) == {"MIDDLE"}, "Mid: nur Mid-Karten " + str(k["sichtbar"]))
        pruefe("von" in p.inner_text("#panel-players .scout-filter-zahl"), "Zaehler: " + p.inner_text("#panel-players .scout-filter-zahl"))
        p.click("#tab-plan")
        pk = karten(p, "plan-cards")
        pruefe(pk["sichtbar"] and set(pk["sichtbar"]) == {"MIDDLE"}, "Draftplan filtert mit: " + str(pk["sichtbar"]))
        pruefe(p.get_attribute("#panel-plan .scout-rollen [data-rolle=MIDDLE]", "aria-pressed") == "true",
               "Draftplan zeigt denselben Knopf gedrueckt")
        p.fill("#panel-plan .scout-filter input", "zzzz")
        p.wait_for_timeout(200)
        pruefe(p.is_visible("#panel-plan .scout-leer"), "kein Treffer: Leerzustand mit Zuruecksetzen")
        p.click("#panel-plan .scout-leer button")
        pk = karten(p, "plan-cards")
        pruefe(len(pk["sichtbar"]) == pk["alle"], "Zuruecksetzen zeigt wieder alle")
        p.click("#tab-players")
        name = p.evaluate("() => document.querySelector('#player-cards > .panel').dataset.spieler.split(' ')[0]")
        p.fill("#panel-players .scout-filter input", name.lower())
        p.wait_for_timeout(200)
        pruefe(len(karten(p, "player-cards")["sichtbar"]) >= 1, "Spielersuche findet " + name)
        p.fill("#panel-players .scout-filter input", "")

        # Zahlenzeilen
        print("Zahlenzeilen")
        z = p.evaluate("""() => ({kz: document.querySelectorAll('.kz').length,
          karten: document.querySelectorAll('#player-cards > .panel').length,
          zeilen: document.querySelectorAll('#player-cards .zahlen.kennzahlen').length,
          team: document.querySelectorAll('#team-stats .zahl').length,
          klick: document.querySelectorAll('#player-cards button.zahl').length})""")
        pruefe(z["kz"] == 0, "keine alten Kaestchen (.kz)")
        pruefe(z["zeilen"] == z["karten"], f"jede Karte hat ihre Zahlenzeile ({z['zeilen']}/{z['karten']})")
        pruefe(z["team"] >= 5, f"Mannschaftswerte als Zahlen ({z['team']})")
        p.click("#tab-liga")
        p.wait_for_timeout(400)
        pruefe(p.locator("#liga-zahlen .zahl").count() >= 3, "Liga-Kennzahlen als Zahlenzeile")
        pruefe(not p.evaluate(UEBERLAUF), "kein waagerechter Ueberlauf (1440)")

        # / im LIVE-Modus sucht im Live Draft - im Cockpit (Standard) und in
        # der klassischen Ansicht
        p.click("#modus-live")
        p.click("#tab-draft")
        p.wait_for_timeout(800)
        p.locator("body").click(position={"x": 5, "y": 300})
        p.keyboard.press("/")
        pruefe(p.evaluate("() => document.activeElement.id") == "cp-eingabe-feld", "/ im Cockpit: Championsuche")
        p.click("#live-draft .cp-schalter")
        p.wait_for_timeout(800)
        p.locator("body").click(position={"x": 5, "y": 300})
        p.keyboard.press("/")
        pruefe(p.evaluate("() => document.activeElement.classList.contains('ld-suche')"),
               "/ in der klassischen Ansicht: ihre Suche")
        p.click("#live-draft .cp-schalter")
        pruefe(not seitenfehler, "keine Seitenfehler " + str(seitenfehler[:2]))
        kontext.close()

        for breite in (390, 768, 1024):
            print(f"Handy/Tablet bei {breite} px")
            p = b.new_page(viewport={"width": breite, "height": 900})
            p.goto(URL)
            p.wait_for_timeout(2500)
            m = p.evaluate("""() => { const r = document.querySelector('.modi').getBoundingClientRect();
              return {unten: Math.round(innerHeight - r.bottom), breit: Math.round(r.width),
                      fest: getComputedStyle(document.querySelector('.modi')).position}; }""")
            if breite <= 680:
                pruefe(m["fest"] == "fixed" and m["unten"] == 0 and m["breit"] == breite, "Modi unten fest " + str(m))
                eng = p.evaluate("""() => { const t = document.querySelector('.tabs');
                  return t.scrollWidth <= t.clientWidth + 1; }""")
                pruefe(eng, "Reiter des Modus passen in die Zeile")
            for modus in ("live", "scout", "review"):
                p.click("#modus-" + modus)
                p.wait_for_timeout(500)
                pruefe(not p.evaluate(UEBERLAUF), f"{modus}: kein waagerechter Ueberlauf")
            p.close()
        b.close()
    print("ui_scout:", "OK" if not fehler else f"{len(fehler)} Fehler")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
