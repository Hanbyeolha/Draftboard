"""Briefing, Plan gegen Ist und das Cockpit als Standard (Draftboard 2.0, Phase 7).

    python build.py --pages
    python tests/ui_briefing.py

Prueft: Briefing ohne Gegner (nur Patchdaten, Hinweis "Gegner offen"), mit
gescoutetem Gegner (Pools je Rolle), mit unbekanntem Gegner ("Nicht
gescoutet"); Ableitungen gekennzeichnet, Ban-Ableitung = die ersten
wahrscheinlichen Picks; Draftplan je Rolle mit Modell; der Gegner gilt auch
im Team-Draft; "Leeren und neu beginnen". Im Cockpit: Spielerwahl je Rolle
und "Wechsel zuruecksetzen", Animation nur fuer Neues. REVIEW Plan gegen
Ist: Summen passen zu den Zellen, Status als Wort, Leerzustand. 1440 und
390 px ohne seitlichen Ueberlauf. Frisches Profil, gebaute index.html.
"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

WURZEL = pathlib.Path(__file__).resolve().parent.parent
URL = os.environ.get("BOARD_URL") or (WURZEL / "index.html").as_uri()
UEBERLAUF = "() => document.documentElement.scrollWidth > window.innerWidth"
STATUS = {"★ blind", "gerne", "außerhalb", "kein Plan", ""}
fehler = []


def pruefe(bedingung, text):
    print(("  ok    " if bedingung else "  FEHLER ") + text)
    if not bedingung:
        fehler.append(text)


def gegner(p, name):
    p.fill(".bf-gegner", name)
    p.press(".bf-gegner", "Enter")
    p.locator("body").click(position={"x": 5, "y": 5})
    p.wait_for_timeout(900)


def briefing(p):
    return p.evaluate("""() => ({
      titel: (document.querySelector('.bf-titel') || {}).textContent || '',
      gefahren: [...document.querySelectorAll('.bf-liste li b')].map((b) => b.textContent),
      quelle: [...document.querySelectorAll('#briefing .bf-quelle')].map((q) => q.textContent).join(' | '),
      hinweise: [...document.querySelectorAll('#briefing .zh-titel')].map((t) => t.textContent),
      bans: [...document.querySelectorAll('.bf-prio')][0]
        ? [...[...document.querySelectorAll('.bf-prio')][0].querySelectorAll('b')].map((b) => b.textContent) : [],
      ableitung: document.querySelectorAll('#briefing .bf-ableitung').length,
      spielerZeilen: document.querySelectorAll('.bf-zeile').length,
      poolChips: document.querySelectorAll('.bf-zeile .bf-champ').length,
      planZeilen: document.querySelectorAll('.bf-plan-zeile:not(.bf-plan-kopf)').length,
      modell: [...document.querySelectorAll('.bf-plan-zeile:not(.bf-plan-kopf) > :nth-child(5) b')].length})""")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if not (WURZEL / "index.html").exists():
        print("index.html fehlt - erst python build.py --pages")
        return 1
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        print("Briefing bei 1440 px")
        p = b.new_page(viewport={"width": 1440, "height": 1000})
        seitenfehler = []
        p.on("pageerror", lambda e: seitenfehler.append(str(e)))
        p.goto(URL)
        p.wait_for_timeout(2500)
        p.click("#modus-live")
        p.wait_for_timeout(1500)
        pruefe(p.is_visible("#briefing .bf-kopf"), "LIVE oeffnet das Briefing")
        x = briefing(p)
        pruefe("vs" in x["titel"], "Kopf: " + x["titel"][:40])
        pruefe(len(x["gefahren"]) >= 3, "ohne Gegner: wahrscheinliche Picks aus Patchdaten " + str(x["gefahren"]))
        pruefe("nur aus Patchdaten" in x["quelle"] and "keine ligapartien" in x["quelle"].lower(),
               "Quelle genannt: nur Patchdaten, keine Ligapartien")
        pruefe("Gegner offen" in x["hinweise"], "Hinweis 'Gegner offen' " + str(x["hinweise"]))
        pruefe(x["ableitung"] >= 1, "Prioritaeten als Ableitung gekennzeichnet")
        pruefe(x["bans"] == x["gefahren"][:3], "Ban-Ableitung = die drei wahrscheinlichsten Picks " + str(x["bans"]))
        pruefe(x["planZeilen"] == 5 and x["modell"] == 5, f"Draftplan: 5 Rollen, Modell je Rolle ({x['modell']})")

        gegner(p, "AFC2")
        x = briefing(p)
        pruefe("op.gg-Pools" in x["quelle"] and "AFC2" in x["quelle"], "gescoutet: Pools von AFC2 in der Vorhersage")
        pruefe(x["spielerZeilen"] == 5 and x["poolChips"] >= 5, f"Gegner je Rolle mit Pools ({x['poolChips']} Champions)")
        gegner(p, "Gibtsnicht FC")
        pruefe("Nicht gescoutet" in briefing(p)["hinweise"], "unbekannter Gegner: 'Nicht gescoutet'")
        gegner(p, "AFC2")
        pruefe(not p.evaluate(UEBERLAUF), "Briefing ohne Ueberlauf (1440)")

        p.click(".bf-los")
        p.wait_for_timeout(1000)
        pruefe(p.get_attribute("#tab-draft", "aria-selected") == "true", "'Zum Team-Draft' oeffnet den Team-Draft")
        pruefe(p.input_value("#live-draft .ld-gegner") == "AFC2", "derselbe Gegner im Team-Draft")

        # Cockpit: Spielerwahl je Rolle und Wechsel zuruecksetzen
        print("Cockpit")
        wahl = p.locator(".cp-team.eigen .cp-wer select")
        pruefe(p.locator("#live-draft .cp-buehne").count() == 1, "das Cockpit steht genau einmal da")
        pruefe(wahl.count() == 5, f"unsere 5 Rollen mit Spielerwahl ({wahl.count()})")
        pruefe(p.locator(".cp-team.gegner .cp-wer select").count() == 5, "Gegner (gescoutet) ebenso")
        optionen = wahl.nth(2).evaluate("(s) => [...s.options].map((o) => o.value)")
        andere = [o for o in optionen if o and o != wahl.nth(2).input_value()]
        if andere:
            wahl.nth(2).select_option(andere[-1])
            p.wait_for_timeout(900)
            pruefe(p.locator(".cp-team.eigen .ld-besetzung-zurueck").count() == 1, "Wechsel: Zuruecksetzen erscheint")
            p.click(".cp-team.eigen .ld-besetzung-zurueck")
            p.wait_for_timeout(900)
            pruefe(p.locator(".cp-team.eigen .ld-besetzung-zurueck").count() == 0, "zurueckgesetzt")

        # Animation nur fuer Neues
        p.fill("#cp-eingabe-feld", "Zed")
        p.press("#cp-eingabe-feld", "Enter")
        p.wait_for_timeout(700)
        pruefe(p.locator(".cp-marke.neu").count() == 1, "neuer Ban: genau eine Marke bewegt sich")
        pruefe(p.locator(".cp-status.wechsel").count() == 1, "Schrittwechsel: der Titel bewegt sich")
        # Neu zeichnen ohne Aenderung am Draft: das Risikoprofil zeichnet das
        # Cockpit neu, der Draft bleibt gleich.
        p.wait_for_timeout(300)
        # Einstellungen sind seit 20.10.2026 auch am Bildschirm eingeklappt.
        p.evaluate("() => document.querySelectorAll('#live-draft details.cp-einstellungen').forEach((d) => { d.open = true; })")
        p.select_option("#live-draft .ld-risikowahl", "sicher")
        p.wait_for_timeout(900)
        pruefe(p.locator(".cp-marke.neu").count() == 0 and p.locator(".cp-status.wechsel").count() == 0,
               "ohne Aenderung am Draft bewegt sich nichts")
        p.select_option("#live-draft .ld-risikowahl", "ausgewogen")
        p.wait_for_timeout(600)

        # Briefing mit Eintraegen im Draft
        p.click("#tab-briefing")
        p.wait_for_timeout(1200)
        pruefe(p.locator("#briefing button:has-text('Leeren und neu beginnen')").count() == 1,
               "Briefing sieht den laufenden Draft")
        p.click("#briefing button:has-text('Leeren und neu beginnen')")
        p.wait_for_timeout(900)
        pruefe(p.get_attribute("#tab-draft", "aria-selected") == "true"
               and p.locator(".cp-marke.fertig").count() == 0, "geleert und im Team-Draft")

        # REVIEW: Plan gegen Ist
        print("Plan gegen Ist")
        p.click("#modus-review")
        p.click("#tab-planist")
        p.wait_for_timeout(900)
        r = p.evaluate("""() => {
          const zahl = (label) => { const z = [...document.querySelectorAll('#plan-ist .zahl')]
            .find((x) => x.querySelector('.zahl-label').textContent === label);
            return z ? z.querySelector('.zahl-wert').textContent : null; };
          return {partien: zahl('Partien'), blind: zahl('Blind'), gerne: zahl('Gerne'),
                  ausser: zahl('Außerhalb'), ohne: zahl('Ohne Plan'),
                  spiele: document.querySelectorAll('.pi-spiel').length,
                  zellen: [...document.querySelectorAll('.pi-pick')].map((c) => c.className.replace('pi-pick ', '')),
                  status: [...document.querySelectorAll('.pi-status')].map((s) => s.textContent),
                  zeilen: document.querySelectorAll('.pi-tabelle tbody tr').length}; }""")
        pruefe(r["partien"] is not None and int(r["partien"]) == r["spiele"] > 0, f"{r['spiele']} Partien")
        pruefe(len(r["zellen"]) == 5 * r["spiele"], "je Partie fuenf Rollen")
        for art, wert in (("blind", r["blind"]), ("gerne", r["gerne"]), ("ausserhalb", r["ausser"]), ("ohnePlan", r["ohne"])):
            pruefe(int(wert) == r["zellen"].count(art), f"Summe {art} = Zellen ({wert})")
        pruefe(set(r["status"]) <= STATUS, "Status als Wort " + str(sorted(set(r["status"]))))
        pruefe(r["zeilen"] >= 1, f"Tabelle je Spieler ({r['zeilen']} Zeilen)")

        leer = p.evaluate("""() => { const d = JSON.parse(document.getElementById('scout-data').textContent);
          const mit = new Set((d.games || []).map((g) => g.team));
          const t = d.teams.find((x) => !mit.has(x.team)); return t ? t.team : null; }""")
        if leer:
            p.select_option("#team-select", leer)
            p.wait_for_timeout(1200)
            # textContent, nicht inner_text: der Titel steht per CSS in Grossbuchstaben.
            pruefe("Noch keine Turnierspiele" in p.text_content("#plan-ist"), f"{leer}: Leerzustand statt leerer Tabelle")
            p.select_option("#team-select", "AFC1")
            p.wait_for_timeout(1200)
        pruefe(not p.evaluate(UEBERLAUF), "Plan gegen Ist ohne Ueberlauf (1440)")
        pruefe(not seitenfehler, "keine Seitenfehler " + str(seitenfehler[:2]))
        p.close()

        print("390 px")
        p = b.new_page(viewport={"width": 390, "height": 844})
        p.goto(URL)
        p.wait_for_timeout(2500)
        p.click("#modus-live")
        p.wait_for_timeout(1500)
        gegner(p, "AFC2")
        pruefe(not p.evaluate(UEBERLAUF), "Briefing ohne Ueberlauf (390)")
        p.click("#modus-review")
        p.click("#tab-planist")
        p.wait_for_timeout(900)
        pruefe(not p.evaluate(UEBERLAUF), "Plan gegen Ist ohne Ueberlauf (390)")
        p.close()
        b.close()
    print("ui_briefing:", "OK" if not fehler else f"{len(fehler)} Fehler")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
