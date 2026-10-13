"""Das LIVE-Cockpit (Draftboard 2.0, Beta) im Browser durchspielen.

    python build.py --pages
    python tests/ui_live.py

Szenarien aus der Spezifikation (Punkt 37, ohne Timer): leerer Draft,
Schrittfolge ueber das zentrale Feld (unser Zug / Gegnerzug, Ban / Pick),
gesperrter Champion, Eingabe ohne Treffer, drei Stufen der Empfehlung,
Merken / Verwerfen, gemerkter Champion vom Gegner genommen, Picken,
fertiger Draft, zurueck zur alten Ansicht, 390 und 1440 px.
Frisches Browserprofil, die gebaute index.html per file:// - nichts an
Dateien wird veraendert. BOARD_URL prueft eine andere Seite.
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


def eintragen(p, champ):
    # Wie am Tisch: ins Suchfeld tippen, Enter (Phase 4).
    p.fill("#cp-eingabe-feld", champ)
    p.press("#cp-eingabe-feld", "Enter")
    p.wait_for_timeout(500)


def fokus(p):
    return p.evaluate("""() => { const a = document.activeElement;
      return {id: a.id || null, taste: a.dataset ? a.dataset.taste || null : null,
              champ: a.closest && a.closest('[data-champ]') ? a.closest('[data-champ]').dataset.champ : null}; }""")


def reihe(p, auswahl):
    """Senkrechte Lage (px) je Selektor - die sichtbare Reihenfolge."""
    return p.evaluate("""(sel) => Object.fromEntries(sel.map((s) => {
      const e = document.querySelector(s);
      return [s, e ? Math.round(e.getBoundingClientRect().top + scrollY) : null]; }))""", auswahl)


def handy_reihenfolge(p, unser_pick):
    """Phase 6: Aktion, Empfehlungen, unser Team, Gegner, Suche (Spez. 26)."""
    if unser_pick:
        y = reihe(p, [".cp-status", ".cp-tier1", ".cp-shortlist", ".cp-team.eigen", ".cp-team.gegner", ".cp-eingabe"])
        werte = list(y.values())
        pruefe(None not in werte and werte == sorted(werte),
               "Handy, unser Pick: Aktion > Empfehlung > Shortlist > wir > Gegner > Suche " + str(werte))
    else:
        y = reihe(p, [".cp-status", ".cp-eingabe", ".cp-wahrscheinlich", ".cp-team.eigen", ".cp-team.gegner"])
        werte = list(y.values())
        pruefe(None not in werte and werte == sorted(werte),
               "Handy, Gegnerzug: Aktion > Eintragen > wahrscheinlich > wir > Gegner " + str(werte))
    zeilen = p.evaluate("""() => [...document.querySelectorAll('.cp-fortschritt-zeile')]
      .map((z) => Math.round(z.getBoundingClientRect().height))""")
    pruefe(zeilen and max(zeilen) <= 30, "Handy: Fortschritt eine Zeile je Seite " + str(zeilen))


def tastatur(p, l):
    """Suche und Tastenkuerzel (Phase 4) - danach ist der Stand wie vorher."""
    p.fill("#cp-eingabe-feld", "aur")
    p.wait_for_timeout(200)
    t = p.evaluate("""() => ({offen: !document.getElementById('cp-treffer').hidden,
      namen: [...document.querySelectorAll('#cp-treffer b')].map((b) => b.textContent),
      gewaehlt: (document.querySelector('#cp-treffer [aria-selected=true] b') || {}).textContent || null,
      noten: [...document.querySelectorAll('#cp-treffer .cp-klein')].map((s) => s.textContent)})""")
    pruefe(t["offen"] and t["namen"][:2] == ["Aurelion Sol", "Aurora"] and t["gewaehlt"] == "Aurelion Sol",
           "Suche 'aur': " + str(t["namen"]))
    pruefe(not any(n.startswith("Note ") for n in t["noten"]), "keine Note, wo die Rolle keine hat (Mages auf Support)")
    p.press("#cp-eingabe-feld", "ArrowDown")
    gewaehlt = p.evaluate("() => (document.querySelector('#cp-treffer [aria-selected=true] b') || {}).textContent")
    pruefe(gewaehlt == "Aurora", "Pfeil runter waehlt den naechsten Treffer")
    p.fill("#cp-eingabe-feld", "leo")
    p.wait_for_timeout(200)
    n = p.evaluate("() => (document.querySelector('#cp-treffer [aria-selected=true] .cp-klein') || {}).textContent || ''")
    pruefe(n.startswith("Note "), "Leona auf Support zeigt ihre Note: " + n)
    p.fill("#cp-eingabe-feld", "zed")
    p.wait_for_timeout(200)
    z = p.evaluate("() => (document.querySelector('#cp-treffer .gesperrt') || {}).textContent || ''")
    pruefe("Zed" in z and "gebannt" in z.lower(), "gesperrter Treffer mit Grund: " + z)
    p.fill("#cp-eingabe-feld", "qqq")
    p.wait_for_timeout(200)
    pruefe("Kein Champion gefunden" in p.inner_text("#cp-treffer"), "Suche ohne Treffer sagt es")
    p.press("#cp-eingabe-feld", "Escape")
    pruefe(p.input_value("#cp-eingabe-feld") == "" and p.evaluate("() => document.getElementById('cp-treffer').hidden"),
           "Esc leert und schliesst")
    p.press("#cp-eingabe-feld", "Escape")
    pruefe(fokus(p)["id"] != "cp-eingabe-feld", "zweites Esc verlaesst das Feld")
    p.keyboard.press("/")
    pruefe(fokus(p)["id"] == "cp-eingabe-feld", "/ springt in die Suche")
    p.keyboard.press("?")
    pruefe(p.is_visible("#cp-tasten"), "? zeigt die Tastenhilfe")
    p.keyboard.press("Escape")
    pruefe(not p.is_visible("#cp-tasten"), "Esc schliesst die Hilfe")

    p.keyboard.press("2")
    f = fokus(p)
    pruefe(f["taste"] == "2" and f["champ"] == l["t2"][0], "2 waehlt die zweite Option: " + str(f["champ"]))
    pruefe(p.get_attribute("#tab-draft", "aria-selected") == "true", "Ziffer wechselt im Cockpit nicht den Reiter")
    p.keyboard.press("s")
    p.wait_for_timeout(500)
    sl = lage(p)["shortlist"]
    pruefe(l["t2"][0] in sl and fokus(p)["taste"] == "2", "S merkt die gewaehlte, Fokus bleibt")
    p.keyboard.press("s")
    p.wait_for_timeout(500)
    pruefe(l["t2"][0] not in lage(p)["shortlist"], "S noch einmal nimmt es zurueck")
    p.keyboard.press("l")
    pruefe(p.evaluate("() => document.querySelector('.cp-log').open"), "L klappt das Log auf")
    p.keyboard.press("l")
    pruefe(not p.evaluate("() => document.querySelector('.cp-log').open"), "L klappt es wieder zu")
    p.keyboard.press("5")
    pruefe(fokus(p)["taste"] == "5" and p.evaluate("() => document.querySelector('.cp-tier3').open"),
           "5 waehlt die erste weitere Option und klappt sie auf")
    p.keyboard.press("Escape")
    pruefe(fokus(p)["id"] == "cp-eingabe-feld", "Esc fuehrt zurueck ins Suchfeld")
    p.evaluate("() => { document.querySelector('.cp-tier3').open = false; }")


def lage(p):
    return p.evaluate("""() => ({
      klasse: document.getElementById('live-draft').className,
      titel: (document.querySelector('.cp-titel') || {}).textContent || '',
      unter: (document.querySelector('.cp-unter') || {}).textContent || '',
      hinweis: (document.querySelector('.cp-hinweis') || {}).textContent || '',
      t1: (document.querySelector('.cp-tier1-name strong') || {}).textContent || null,
      t2: [...document.querySelectorAll('.cp-tier2 .cp-zeile b')].map((b) => b.textContent),
      t3: document.querySelectorAll('.cp-tier3 .cp-zeile').length,
      shortlist: [...document.querySelectorAll('.cp-sl b')].map((b) => b.textContent),
      meldung: (document.querySelector('.cp-meldung') || {}).textContent || null,
      marken: [...document.querySelectorAll('.cp-marke')].map((m) => m.className.replace('cp-marke ', ''))})""")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if not (WURZEL / "index.html").exists():
        print("index.html fehlt - erst python build.py --pages")
        return 1
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for breite in (1440, 768, 390):
            print(f"Cockpit bei {breite} px")
            p = b.new_page(viewport={"width": breite, "height": 1000})
            seitenfehler = []
            p.on("pageerror", lambda e: seitenfehler.append(str(e)))
            p.goto(URL)
            p.wait_for_timeout(2500)
            p.click("#modus-live")
            pruefe(p.get_attribute("#tab-briefing", "aria-selected") == "true", "LIVE beginnt mit dem Briefing")
            p.click("#tab-draft")
            p.wait_for_timeout(1200)
            l = lage(p)
            pruefe("cp" in l["klasse"] and "idle" in l["klasse"], "Cockpit ist Standard, Zustand IDLE")
            pruefe("Erster Schritt" in l["unter"] and "Ban 1" in l["unter"], "leerer Draft: " + l["unter"])

            eintragen(p, "Zed")
            l = lage(p)
            pruefe("opponent-turn" in l["klasse"] and "bannt" in l["titel"], "nach unserem Ban: Gegner bannt")
            eintragen(p, "Zed")
            pruefe("nicht bannbar" in lage(p)["hinweis"], "gesperrter Champion abgelehnt, mit Grund")
            eintragen(p, "Gibtsnicht")
            pruefe("opponent-turn" in lage(p)["klasse"], "Eingabe ohne Treffer aendert nichts")
            for c in ["Ahri", "LeBlanc", "Yasuo", "Akali", "Sylas"]:
                eintragen(p, c)
            l = lage(p)
            pruefe("our-turn" in l["klasse"] and "picken" in l["titel"].lower(), "nach 6 Bans: wir picken")
            pruefe(l["t1"] is not None and len(l["t2"]) == 3 and l["t3"] > 0,
                   f"drei Stufen: {l['t1']} | {l['t2']} | +{l['t3']}")
            pruefe(sum(1 for m in l["marken"] if "fertig" in m) == 6, "Fortschritt: 6 Bans fertig")
            if breite <= 640:
                handy_reihenfolge(p, True)
            tastatur(p, l)

            # Merken (Tier 2), Verwerfen (Tier 1), den neuen ersten auch merken
            gemerkt = l["t2"][1]
            p.locator(".cp-tier2 .cp-zeile").nth(1).locator(".cp-merk.shortlisted").click()
            p.wait_for_timeout(500)
            pruefe(lage(p)["shortlist"] == [gemerkt], "Shortlist: " + gemerkt)
            erster = l["t1"]
            p.locator(".cp-tier1 .cp-merk.rejected").click()
            p.wait_for_timeout(700)
            l = lage(p)
            pruefe(l["t1"] != erster and erster not in l["t2"], f"verworfen tritt zurueck ({erster})")
            pruefe(p.locator(".cp-tier3 .cp-zeile.rejected").count() >= 1, "verworfen bleibt sichtbar (Stufe 3)")
            t1 = l["t1"]
            p.locator(".cp-tier1 .cp-merk.shortlisted").click()
            p.wait_for_timeout(500)

            # Phase 3: "Wenn wir das picken" steht bei Tier 1 (aus dem Lookahead)
            danach = p.evaluate("() => (document.querySelector('.cp-tier1 .cp-danach') || {}).textContent || ''")
            pruefe("am wahrscheinlichsten" in danach and "%" in danach and "wahrscheinlichsten  (" not in danach,
                   "Tier 1 zeigt den Gegnerast: " + danach[:90])

            # Undo statt Rueckfrage: picken, zuruecknehmen, wieder picken
            p.locator(".cp-tier1 .cp-picken").click()
            p.wait_for_timeout(800)
            pruefe(p.locator(".cp-undo").count() == 1 and t1 in p.inner_text(".cp-undo"), "Undo-Leiste nach dem Pick")
            p.locator(".cp-undo-knopf").click()
            p.wait_for_timeout(800)
            l = lage(p)
            pruefe("our-turn" in l["klasse"] and l["t1"] == t1, "Rueckgaengig: wieder unser Pick, " + str(l["t1"]))
            pruefe(p.locator(".cp-undo").count() == 0, "Undo-Leiste weg nach Rueckgaengig")

            # Wir picken den gemerkten Tier-1: das ist kein "vergeben"
            p.locator(".cp-tier1 .cp-picken").click()
            p.wait_for_timeout(800)
            l = lage(p)
            w = p.evaluate("""() => { const s = document.querySelector('.cp-wahrscheinlich');
              return s ? {text: s.textContent, n: s.querySelectorAll('.cp-gegner-zeile').length} : null; }""")
            pruefe(w is not None and w["n"] > 0 and "keine Gewissheit" in w["text"],
                   "Gegnerzug: 'Gegner waehlt wahrscheinlich' mit Vorbehalt " + str(w and w["n"]))
            log = p.inner_text(".cp-log summary")
            pruefe(log.startswith("Draft-Log (") and not log.startswith("Draft-Log (0"), "Draft-Log zaehlt mit: " + log)
            pruefe("opponent-turn" in l["klasse"], f"nach unserem Pick ({t1}): Gegner pickt")
            pruefe(l["meldung"] is None, "eigener Pick meldet nicht 'vergeben'")
            pruefe(p.locator(".cp-sl.gepickt").count() == 1, "Shortlist zeigt ihn als unseren Pick")
            if breite <= 640:
                handy_reihenfolge(p, False)
            # Gegnerzug per Tastatur: 1 waehlt den wahrscheinlichsten, Enter traegt ihn ein
            vorher = p.inner_text(".cp-gegner-zeile b")
            if vorher != gemerkt:
                pruefe(fokus(p)["id"] == "cp-eingabe-feld", "nach dem Pick wieder im Suchfeld")
                p.keyboard.press("1")
                pruefe(fokus(p)["taste"] == "1", "1 waehlt im Gegnerzug den wahrscheinlichsten Pick")
                p.keyboard.press("Enter")
                p.wait_for_timeout(700)
                drin = p.evaluate("""() => [...document.querySelectorAll('.cp-team.gegner .cp-picks input')]
                  .map((i) => i.value)""")
                pruefe(vorher in drin, f"Enter traegt {vorher} beim Gegner ein")
            # Der Gegner nimmt den anderen gemerkten
            eintragen(p, gemerkt)
            l = lage(p)
            pruefe(l["meldung"] is not None and gemerkt in l["meldung"] and t1 not in l["meldung"]
                   and "noch 0" in l["meldung"], "Meldung: " + str(l["meldung"]))

            # Rest des Drafts: abwechselnd eintragen, bis er komplett ist
            frei = ["Ornn", "Jinx", "Thresh", "Lee Sin", "Viego", "Caitlyn", "Lulu", "Jax",
                    "Malphite", "Nautilus", "Ezreal", "Vi", "Kai'Sa", "Rell", "Gnar", "Sejuani"]
            for c in frei:
                if "complete" in p.evaluate("() => document.getElementById('live-draft').className"):
                    break
                if p.query_selector(".cp-tier1 .cp-picken") and "our-turn" in lage(p)["klasse"] \
                        and "picken" in lage(p)["titel"].lower():
                    p.locator(".cp-tier1 .cp-picken").click()
                    p.wait_for_timeout(700)
                else:
                    eintragen(p, c)
            l = lage(p)
            pruefe("complete" in l["klasse"] and "komplett" in l["titel"].lower(), "Draft komplett")
            pruefe(p.locator("#live-draft .zh-fertig").count() == 1, "Zustand 'Draft komplett' mit naechstem Schritt")
            pruefe(not p.evaluate(UEBERLAUF), "kein waagerechter Ueberlauf")

            # Am Handy steckt der Schalter in den eingeklappten Einstellungen.
            if breite <= 680:
                pruefe(not p.evaluate("() => document.querySelector('.cp-einstellungen').open"),
                       "Handy: Draft-Einstellungen eingeklappt")
                p.click(".cp-einstellungen > summary")
            p.click("#live-draft .cp-schalter")
            p.wait_for_timeout(800)
            pruefe(p.locator("#live-draft .ld-pickzeile").count() == 10, "klassische Ansicht mit 10 Pickzeilen")
            p.click("#live-draft .cp-schalter")
            p.wait_for_timeout(800)
            pruefe(p.locator("#live-draft.cp").count() == 1, "Zum Cockpit zurueck")
            pruefe(not seitenfehler, "keine Seitenfehler " + str(seitenfehler[:2]))
            p.close()
        b.close()
    print("ui_live:", "OK" if not fehler else f"{len(fehler)} Fehler")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
