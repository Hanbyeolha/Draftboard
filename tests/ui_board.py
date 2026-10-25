"""Die Oberflaeche im echten Browser pruefen - die gebaute index.html, ohne Server.

    python build.py --pages
    python tests/ui_board.py

Braucht Playwright (pip install playwright, dann playwright install
chromium). Die Node-Tests pruefen engine/, nicht das Skript in
template.html - am 11.10.2026 war der Live Draft wegen einer Klammer zu
viel leer, bei gruenen Tests. Dieser Lauf oeffnet die Seite, klickt die
wichtigsten Wege durch und meldet jede Abweichung.

Arbeitet in einem frischen Browserprofil: nichts im eigenen Browser,
nichts in den Datendateien wird veraendert. "Speichern" wird nur ohne
Server geprueft (Download).
"""
import json
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

WURZEL = pathlib.Path(__file__).resolve().parent.parent
# BOARD_URL: eine andere Seite pruefen (etwa eine Kopie zum Gegentest).
URL = os.environ.get("BOARD_URL") or (WURZEL / "index.html").as_uri()

SETZE = """([seite, art, i, c]) => {
  const sel = art === 'picks' ? '.ld-pickzeile' : '.ld-feld.bans';
  const inp = document.querySelector('#live-draft .ld-seite.' + seite)
    .querySelectorAll(sel)[i].querySelector('input');
  inp.value = c; inp.dispatchEvent(new Event('input', {bubbles: true}));
  inp.dispatchEvent(new Event('change', {bubbles: true})); }"""
WERT = """([seite, i]) => document.querySelector('#live-draft .ld-seite.' + seite)
  .querySelectorAll('.ld-pickzeile')[i].querySelector('input').value"""
FOKUS = """([seite, i]) => document.querySelector('#live-draft .ld-seite.' + seite)
  .querySelectorAll('.ld-pickzeile')[i].querySelector('input').focus()"""
WAHLEN = """(seite) => [...document.querySelectorAll('#live-draft .ld-seite.' + seite
  + ' .ld-wer-wahl')].map((s) => s.value)"""
SETZE_WAHL = """([seite, i, v]) => { const s = document.querySelectorAll('#live-draft .ld-seite.'
  + seite + ' .ld-wer-wahl')[i]; s.value = v; s.dispatchEvent(new Event('change', {bubbles: true})); }"""
UEBERLAUF = "() => document.documentElement.scrollWidth > window.innerWidth"

fehler = []


def pruefe(bedingung, text):
    print(("  ok    " if bedingung else "  FEHLER ") + text)
    if not bedingung:
        fehler.append(text)


def neu(browser, breite=1440):
    ctx = browser.new_context(viewport={"width": breite, "height": 1000}, accept_downloads=True)
    p = ctx.new_page()
    p.seitenfehler = []
    p.on("pageerror", lambda e: p.seitenfehler.append(str(e)))
    p.goto(URL)
    p.wait_for_timeout(2500)
    return ctx, p


def live(p):
    p.click("#modus-live"); p.click("#tab-draft")
    p.wait_for_timeout(700)
    # Seit Draftboard 2.0, Phase 7 ist das Cockpit Standard - diese Tests
    # pruefen die klassische Ansicht, also umschalten (am Handy steckt der
    # Schalter in den eingeklappten Einstellungen).
    if p.locator("#live-draft.cp").count():
        if not p.evaluate("() => document.querySelector('.cp-einstellungen').open"):
            p.click(".cp-einstellungen > summary")
        p.click("#live-draft .cp-schalter")
        p.wait_for_timeout(800)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if not (WURZEL / "index.html").exists():
        print("index.html fehlt - erst python build.py --pages")
        return 1
    daten = None
    with sync_playwright() as pw:
        b = pw.chromium.launch()

        print("Board")
        ctx, p = neu(b)
        live(p)
        pruefe(p.locator("#live-draft .ld-pickzeile").count() == 10, "10 Pickzeilen")
        if not p.locator("#live-draft .ld-pickzeile").count():
            # Leeres Board: fast immer ein Skriptfehler - den nennen, statt
            # an den naechsten Schritten zu haengen.
            for f in p.seitenfehler:
                print("  Seitenfehler:", f)
            print("ui_board: abgebrochen - der Live Draft wird nicht gezeichnet")
            return 1
        pruefe(p.locator("#live-draft .ld-seite.eigen .ld-wer-wahl").count() == 5,
               "Besetzung waehlbar bei uns")
        kopf = p.text_content("#live-draft .ld-quelle") or ""
        pruefe("Patch" in kopf and "Paarungen" in kopf, "Patchkopf: " + kopf.strip())
        p.evaluate(FOKUS, ["eigen", 2])
        p.wait_for_timeout(1500)
        pruefe(p.locator("#live-draft .ld-karte:not(.gesperrt)").count() > 20, "Karten gerendert")
        hint = " ".join(p.locator("#live-draft .hint").all_text_contents())
        pruefe("sortiert nach Entscheidungswert" in hint, "Sortierung genannt")

        print("Sperren")
        p.evaluate(SETZE, ["eigen", "bans", 0, "Zed"])
        p.evaluate(SETZE, ["gegner", "picks", 0, "Ornn"])
        p.wait_for_timeout(300)
        p.evaluate(SETZE, ["eigen", "picks", 2, "Zed"])
        p.wait_for_timeout(300)
        pruefe(p.evaluate(WERT, ["eigen", 2]) == "", "gebannter Zed nicht pickbar")
        p.evaluate(SETZE, ["eigen", "picks", 0, "Ornn"])
        p.wait_for_timeout(300)
        pruefe(p.evaluate(WERT, ["eigen", 0]) == "", "schon gepickter Ornn nicht pickbar")
        p.evaluate(SETZE, ["eigen", "picks", 2, "Syndra"])
        p.wait_for_timeout(300)
        pruefe(p.evaluate(WERT, ["eigen", 2]) == "Syndra", "freier Champion pickbar")

        print("Besetzung")
        vorher = p.evaluate(WAHLEN, "eigen")
        optionen = p.evaluate("""() => [...document.querySelectorAll('#live-draft .ld-seite.eigen'
          + ' .ld-wer-wahl')[2].options].map((o) => o.value).filter(Boolean)""")
        andere = [o for o in optionen if o not in vorher]
        if andere:
            p.evaluate(SETZE_WAHL, ["eigen", 2, andere[0]])
            p.wait_for_timeout(400)
            pruefe(p.evaluate(WAHLEN, "eigen")[2] == andere[0], "Substitute auf Mid: " + andere[0])
            p.evaluate(SETZE_WAHL, ["eigen", 2, vorher[0]])
            p.wait_for_timeout(400)
            w = p.evaluate(WAHLEN, "eigen")
            pruefe(w[2] == vorher[0] and w[0] == andere[0], "Rollentausch: " + str(w))
            p.click("#live-draft .ld-seite.eigen .ld-besetzung-zurueck")
            p.wait_for_timeout(400)
            pruefe(p.evaluate(WAHLEN, "eigen") == vorher, "zurueckgesetzt")
        else:
            pruefe(False, "keine Bankspieler fuer den Besetzungstest")

        print("Seite und Risiko")
        p.select_option("#live-draft .ld-seitenwahl", "red")
        p.wait_for_timeout(500)
        pruefe(p.input_value("#live-draft .ld-seitenwahl") == "red", "Seite Rot")
        noten = """() => [...document.querySelectorAll('#live-draft .ld-karte:not(.gesperrt)')]
          .map((k) => k.querySelector('.ld-karte-name').textContent + ':'
                      + k.querySelector('.ld-punkte').textContent).sort().join(',')"""
        p.evaluate(FOKUS, ["eigen", 3])
        p.wait_for_timeout(1500)
        p.select_option("#live-draft .ld-risikowahl", "aggressiv")
        p.wait_for_timeout(1500)
        aggressiv = p.evaluate(noten)
        p.select_option("#live-draft .ld-risikowahl", "sicher")
        p.wait_for_timeout(1500)
        pruefe(p.input_value("#live-draft .ld-risikowahl") == "sicher", "Risiko sicher")
        pruefe(p.evaluate(noten) != aggressiv, "das Risikoprofil veraendert die Noten")
        p.reload()
        p.wait_for_timeout(2500)
        live(p)
        pruefe(p.input_value("#live-draft .ld-risikowahl") == "sicher"
               and p.input_value("#live-draft .ld-seitenwahl") == "red", "nach Neuladen gemerkt")
        p.select_option("#live-draft .ld-risikowahl", "ausgewogen")
        p.select_option("#live-draft .ld-seitenwahl", "blue")
        pruefe(not p.seitenfehler, "keine Seitenfehler im Live Draft " + str(p.seitenfehler[:2]))
        ctx.close()

        print("Schutz: Fearless, Gegnerbesetzung, Browserplan")
        ctx, p = neu(b)
        live(p)
        # Fearless: ein gemerktes Spiel sperrt seine Picks.
        p.evaluate(SETZE, ["eigen", "picks", 2, "Ahri"])
        p.wait_for_timeout(300)
        p.click("#live-draft .ld-merken")
        p.wait_for_timeout(400)
        haken = p.query_selector("#live-draft .ld-schalter input")
        if haken and not haken.is_checked():
            haken.click()
            p.wait_for_timeout(300)
        p.evaluate(SETZE, ["eigen", "picks", 2, "Ahri"])
        p.wait_for_timeout(300)
        pruefe(p.evaluate(WERT, ["eigen", 2]) == "", "Fearless: gespielter Ahri nicht pickbar")
        # Gegnerbesetzung: gescoutete Mannschaft, Wechsel auf der Jungle.
        gegner = p.evaluate("""() => [...document.querySelectorAll('#opponent-list option')]
          .map((o) => o.value).find((v) => v && v !== 'AFC1') || null""")
        if gegner:
            p.evaluate("""(n) => { const i = document.querySelector('#live-draft .ld-gegner');
              i.value = n; i.dispatchEvent(new Event('change', {bubbles: true})); }""", gegner)
            p.wait_for_timeout(600)
            w = p.evaluate(WAHLEN, "gegner")
            optionen = p.evaluate("""() => [...document.querySelectorAll('#live-draft .ld-seite.gegner'
              + ' .ld-wer-wahl')[1].options].map((o) => o.value).filter(Boolean)""")
            anderer = next((o for o in optionen if o != w[1]), None)
            if anderer:
                p.evaluate(SETZE_WAHL, ["gegner", 1, anderer])
                p.wait_for_timeout(400)
                pruefe(p.evaluate(WAHLEN, "gegner")[1] == anderer, "Gegnerbesetzung umstellbar (" + gegner + ")")
                p.click("#live-draft .ld-seite.gegner .ld-besetzung-zurueck")
                p.wait_for_timeout(400)
                pruefe(p.evaluate(WAHLEN, "gegner") == w, "Gegnerbesetzung zurueckgesetzt")
        else:
            pruefe(False, "keine gescoutete Gegnermannschaft fuer den Test")
        ctx.close()
        # Browserplan (P2.7): ein lokal eingetragener Blindpick zaehlt im Komfort.
        ctx, p = neu(b)
        p.evaluate("""() => { const d = JSON.parse(document.getElementById('scout-data').textContent);
          const t = d.teams.find((x) => x.team === 'AFC1');
          const team = {};
          for (const q of t.players) { const pl = q.plan || {};
            team[q.label] = {blind: [...(pl.first || []), ...(pl.blind || [])], likes: pl.likes || [], note: ''}; }
          const mid = t.players.find((x) => x.role === 'MIDDLE' && !x.bench);
          team[mid.label].blind.push('Lux');
          localStorage.setItem('league-picks-plan-v1', JSON.stringify({AFC1: team})); }""")
        p.reload()
        p.wait_for_timeout(2500)
        live(p)
        p.evaluate(FOKUS, ["eigen", 2])
        p.wait_for_timeout(1500)
        lux = p.evaluate("""() => { const k = [...document.querySelectorAll('#live-draft .ld-karte')]
          .find((x) => (x.querySelector('.ld-karte-name') || {}).textContent === 'Lux');
          const t = k && [...k.querySelectorAll('.ld-spur-teil')].find((s) => s.title.startsWith('komfort'));
          return t ? t.title : null; }""")
        # Seit 22.10.2026 zaehlt der Draftplan nicht mehr in den Komfort.
        pruefe(bool(lux) and "blind pickbar" not in lux, "Browserplan zaehlt nicht im Komfort (Lux)")
        ctx.close()

        print("Solo Queue (eigener Reiter)")
        ctx, p = neu(b)
        live(p)
        pruefe(not p.query_selector("#live-draft .ld-art"), "Team-Live-Draft ohne Solo-Schalter")
        p.click("#modus-live"); p.click("#tab-solo")
        p.wait_for_timeout(700)
        ich = p.evaluate("""() => [...document.querySelectorAll('#solo-draft .so-ich select')[0].options]
          .map((o) => o.value).filter(Boolean)[2]""")
        p.locator("#solo-draft .so-ich select").first.select_option(ich)
        p.wait_for_timeout(1500)
        pruefe(p.locator("#solo-draft .so-zeile.ich").count() == 1, "genau eine Zeile 'du'")
        pruefe(p.locator("#solo-draft .so-rec.gross").count() == 1, "Jetzt-picken-Empfehlung")
        namen = p.evaluate("""() => [...document.querySelectorAll('#solo-draft .so-rec .so-rec-name b')]
          .map((b) => b.textContent)""")
        pruefe(len(namen) == len(set(namen)), "keine Empfehlung doppelt (" + str(len(namen)) + ")")
        lage = p.evaluate("() => document.querySelector('#solo-draft .so-lage').innerText")
        pruefe("null" not in lage, "Lagebild ohne 'null'")
        rolle = int(p.input_value("#solo-draft .so-ich select >> nth=1"))
        erste = namen[0]
        # Seit 18.10.2026 steht die grosse Empfehlung offen (Begruendung und
        # Winrate sofort sichtbar) - nur aufklappen, wenn sie es nicht ist.
        pruefe(p.evaluate("() => document.querySelector('#solo-draft .so-rec.gross').open"),
               "grosse Solo-Empfehlung steht offen")
        if not p.evaluate("() => document.querySelector('#solo-draft .so-rec.gross').open"):
            p.locator("#solo-draft .so-rec.gross summary").click()
        p.locator("#solo-draft .so-rec.gross .so-picken").click()
        p.wait_for_timeout(600)
        feld = p.input_value(f"#solo-draft [name='so-eigen-picks-{rolle}']")
        pruefe(feld == erste, f"Picken traegt {erste} ein")
        prot = p.evaluate("() => JSON.parse(localStorage.getItem('draft-protokoll-solo') || '{\"eintraege\": []}').eintraege")
        pruefe(len(prot) == 1 and prot[0].get("gewaehlt") == erste,
               "Solo-Protokoll: genau ein Eintrag, mit Wahl")
        # Duo/Gruppe (20.10.2026): ein Mitspieler aus dem Kader kommt dazu,
        # bekommt eine freie Rolle, und die Empfehlung laesst sich umschalten.
        dazu = p.evaluate("""() => [...document.querySelector('#solo-draft .so-dazu').options]
          .map((o) => o.value).filter(Boolean)[0]""")
        p.select_option("#solo-draft .so-dazu", dazu)
        p.wait_for_timeout(1200)
        duo = p.evaluate("""() => ({art: document.querySelector('.so-gruppe-art').textContent,
          knoepfe: document.querySelectorAll('#solo-draft .so-fuer-knopf').length,
          kumpel: [...document.querySelectorAll('#solo-draft .so-zeile.kumpel .so-wer')].map((s) => s.textContent),
          ich: document.querySelectorAll('#solo-draft .so-zeile.ich').length})""")
        pruefe(duo["art"] == "Duo" and duo["knoepfe"] == 2 and duo["kumpel"] == [dazu] and duo["ich"] == 1,
               "Duo: Mitspieler mit Rolle, Umschalter fuer zwei " + str(duo))
        p.locator("#solo-draft .so-fuer-knopf").nth(1).click()
        p.wait_for_timeout(1200)
        fuer = p.evaluate("""() => ({fuer: [...document.querySelectorAll('#solo-draft .so-team.eigen .so-zeile')]
            .findIndex((z) => z.classList.contains('fuer')),
          kumpel: [...document.querySelectorAll('#solo-draft .so-team.eigen .so-zeile')]
            .findIndex((z) => z.classList.contains('kumpel')),
          gemerkt: JSON.parse(localStorage.getItem('live-solo') || '{}')})""")
        pruefe(fuer["fuer"] == fuer["kumpel"] and fuer["fuer"] >= 0,
               "Empfehlung fuer den Mitspieler: seine Rolle ist markiert")
        pruefe(any((e or {}).get("mit") for e in fuer["gemerkt"].values()), "Mitspieler gemerkt (live-solo)")
        p.locator("#solo-draft .so-chip-weg").first.click()
        p.wait_for_timeout(1000)
        pruefe(p.evaluate("() => document.querySelector('.so-gruppe-art').textContent") == "Solo"
               and p.locator("#solo-draft .so-fuer").count() == 0, "Mitspieler entfernt: wieder Solo")
        pruefe(not p.evaluate(UEBERLAUF), "ohne waagerechten Ueberlauf")
        pruefe(not p.seitenfehler, "keine Seitenfehler " + str(p.seitenfehler[:2]))
        ctx.close()

        print("Einschaetzung")
        ctx, p = neu(b)
        p.click("#modus-scout"); p.click("#tab-heuristik")
        p.wait_for_timeout(500)
        zeilen = p.locator(".hz-zeile:not(.hz-kopf)")
        n = zeilen.count()
        pruefe(n >= 150, f"{n} Champions gelistet")
        # Kopf genau ueber den Spalten (12.10.2026: vorher ~90 px daneben).
        versatz = p.evaluate("""() => {
          const w = [...document.querySelectorAll('.hz-kopf .hz-achse-wort')].map((e) => e.getBoundingClientRect());
          let max = 0;
          for (const z of [...document.querySelectorAll('.hz-zeile:not(.hz-kopf)')].slice(0, 20))
            [...z.querySelectorAll('.hz-achse')].forEach((k, i) => { const r = k.getBoundingClientRect();
              max = Math.max(max, Math.abs(r.left + r.width / 2 - w[i].left - w[i].width / 2)); });
          return Math.round(max); }""")
        pruefe(versatz <= 2, f"Kopf ueber den Spalten (Versatz {versatz} px)")
        erster = zeilen.nth(0).locator(".hz-champ b").text_content()
        zeilen.nth(0).locator(".hz-knopf").click()
        p.wait_for_timeout(400)
        pruefe(p.locator(".hz-zeile.geprueft").count() == 1, "uebernommen: " + erster)
        with p.expect_download() as d:
            p.click("#hz-download")
        daten = json.loads(pathlib.Path(d.value.path()).read_text(encoding="utf-8"))
        pruefe(erster in daten.get("champions", {}), "Datei enthaelt den Eintrag")
        p.click("#hz-verwerfen")
        p.wait_for_timeout(400)
        pruefe(p.locator(".hz-zeile.geprueft").count() == 0, "verworfen")
        pruefe(not p.seitenfehler, "keine Seitenfehler im Reiter")
        ctx.close()

        print("Schmal (390 px)")
        ctx, p = neu(b, 390)
        live(p)
        pruefe(not p.evaluate(UEBERLAUF), "Live Draft ohne waagerechten Ueberlauf")
        p.click("#modus-scout"); p.click("#tab-heuristik")
        p.wait_for_timeout(400)
        pruefe(not p.evaluate(UEBERLAUF), "Einschaetzung ohne waagerechten Ueberlauf")
        pruefe(p.evaluate("() => getComputedStyle(document.querySelector('.hz-kopf')).display !== 'none'"),
               "Achsenbeschriftung auch schmal sichtbar")
        ctx.close()
        b.close()

    print("ui_board:", "OK" if not fehler else f"{len(fehler)} Fehler")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
