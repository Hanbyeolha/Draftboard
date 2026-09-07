"""Das Draftboard als kleines lokales Programm.

Startet einen Server auf 127.0.0.1, zeigt das Board im Browser und nimmt
Aenderungen direkt entgegen: Speichern schreibt in draftplan.json bzw.
games.json und baut sofort neu. Kein Herunterladen, kein Verschieben, kein
Terminalbefehl.

    python serve.py                # startet und oeffnet den Browser
    python serve.py --port 8765
    python serve.py --no-open      # ohne Browser

Bequemer: "Draftboard starten.cmd" doppelklicken.

Erreichbar ist der Server nur von diesem Rechner. Die Datei zum Weitergeben
entsteht weiterhin unter out/ - die laeuft bei den Mitspielern ohne alles.
"""

import argparse
import collections
import contextlib
import io
import json
import pathlib
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import build

ROOT = pathlib.Path(__file__).parent
# Nur diese beiden Dateien darf die Seite beschreiben.
WRITABLE = {"draftplan": ROOT / "draftplan.json", "games": ROOT / "games.json"}
ROLES = {"TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY", "UNKNOWN"}
MAX_BODY = 4 * 1024 * 1024

# Ausgabe des laufenden Scrapes, damit die Seite den Fortschritt zeigen kann.
scrape_lock = threading.Lock()
scrape_state = {"running": False, "lines": collections.deque(maxlen=400), "done": None}


def rebuild():
    """build.py aufrufen und seine Ausgabe einsammeln.

    pages=True schreibt zusaetzlich index.html im Hauptordner - die Datei, die
    GitHub Pages ausliefert. So kann der veroeffentlichte Stand nicht hinter dem
    lokalen zurueckbleiben; zum Hochladen fehlt dann nur noch der Push."""
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        build.build(embed=True, pages=True)
    return out.getvalue().splitlines()


def built_file():
    """Die zuletzt gebaute Weitergabe-Datei finden."""
    files = sorted((ROOT / "out").glob("*-Draftboard.html"),
                   key=lambda p: p.stat().st_mtime, reverse=True)
    return files[0] if files else None


def add_player(data):
    """Einen Spieler in teams.json eintragen. Gibt (Team, Label) zurueck."""
    team_name = str(data.get("team") or "").strip()
    label = str(data.get("label") or "").strip()
    riot_id = str(data.get("riotId") or "").strip()
    role = str(data.get("role") or "UNKNOWN").strip().upper()

    if not riot_id or "#" not in riot_id:
        raise ValueError("Die Riot-ID muss die Form Name#TAG haben.")
    name_part, _, tag = riot_id.partition("#")
    if not name_part.strip() or not tag.strip():
        raise ValueError("Die Riot-ID muss die Form Name#TAG haben.")
    label = label or name_part.strip()
    if role not in ROLES:
        raise ValueError("Unbekannte Rolle: " + role)

    path = ROOT / "teams.json"
    roster = json.loads(path.read_text(encoding="utf-8"))
    team = next((t for t in roster if t["team"] == team_name), None)
    if team is None:
        raise ValueError("Unbekanntes Team: " + team_name)
    for player in team["players"]:
        if player["label"].lower() == label.lower():
            raise ValueError(f"{label} steht schon in {team_name}.")
        if player["riotId"].lower() == riot_id.lower():
            raise ValueError(f"{riot_id} steht schon als {player['label']} drin.")

    entry = {"label": label, "riotId": riot_id, "role": role}
    if data.get("bench"):
        entry["bench"] = True
    team["players"].append(entry)
    path.with_suffix(".json.bak").write_text(
        path.read_text(encoding="utf-8"), encoding="utf-8")
    path.write_text(json.dumps(roster, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    return team_name, label


def run_scrape(teams, extra=()):
    """auto_scrape.py als eigenen Prozess starten und mitlesen."""
    cmd = ([sys.executable, "-u", str(ROOT / "auto_scrape.py")]
           + list(teams) + list(extra))
    with scrape_lock:
        scrape_state["running"] = True
        scrape_state["done"] = None
        scrape_state["lines"].clear()
        scrape_state["lines"].append("Start: " + " ".join(cmd[2:]))

    def worker():
        code = -1
        try:
            proc = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True,
                                    encoding="utf-8", errors="replace")
            for line in proc.stdout:
                line = line.rstrip()
                if line:
                    with scrape_lock:
                        scrape_state["lines"].append(line)
            code = proc.wait()
        except OSError as exc:
            with scrape_lock:
                scrape_state["lines"].append("Fehler: " + str(exc))
        finally:
            with scrape_lock:
                scrape_state["running"] = False
                scrape_state["done"] = code
                scrape_state["lines"].append(
                    "Fertig." if code == 0 else f"Abgebrochen (Code {code}).")

    threading.Thread(target=worker, daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    server_version = "Draftboard"

    def log_message(self, fmt, *args):
        pass                                   # kein Zugriffsprotokoll noetig

    # ------------------------------------------------------------- Antworten

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_page(self):
        target = built_file()
        if target is None:
            rebuild()
            target = built_file()
        if target is None:
            self.send_json({"error": "Es liegt keine gebaute Datei in out/."}, 500)
            return
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return None
        return self.rfile.read(length).decode("utf-8")

    # ----------------------------------------------------------------- Routen

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            self.send_page()
        elif path == "/api/status":
            target = built_file()
            # Die Seite prueft daran, ob der laufende Server ihre Wege kennt.
            self.send_json({"server": True, "project": str(ROOT),
                            "file": target.name if target else None,
                            "features": ["save", "share", "reveal", "scrape", "player"]})
        elif path == "/api/scrape":
            with scrape_lock:
                self.send_json({"running": scrape_state["running"],
                                "done": scrape_state["done"],
                                "lines": list(scrape_state["lines"])[-40:]})
        else:
            self.send_json({"error": "unbekannt"}, 404)

    def do_POST(self):
        path = self.path.split("?")[0]
        if path.startswith("/api/save/"):
            self.save(path.rsplit("/", 1)[-1])
        elif path == "/api/share":
            log = rebuild()
            target = built_file()
            page = ROOT / "index.html"
            self.send_json({"ok": True, "log": log,
                            "path": str(target) if target else None,
                            "size": target.stat().st_size if target else 0,
                            "page": str(page) if page.exists() else None,
                            "pageSize": page.stat().st_size if page.exists() else 0})
        elif path == "/api/reveal":
            target = built_file()
            if target:
                # Explorer oeffnen und die Datei markieren - nur Windows.
                subprocess.Popen(["explorer", "/select,", str(target)])
            self.send_json({"ok": bool(target)})
        elif path == "/api/player":
            with scrape_lock:
                busy = scrape_state["running"]
            if busy:
                self.send_json({"ok": False, "error": "Es läuft schon ein Scrape."}, 409)
                return
            try:
                data = json.loads(self.read_body() or "{}")
                team_name, label = add_player(data)
            except (ValueError, KeyError) as exc:
                self.send_json({"ok": False, "error": str(exc)}, 400)
                return
            # Nur den Neuen holen - die uebrigen bleiben aus der vorhandenen Datei.
            run_scrape([team_name], ["--only", label])
            self.send_json({"ok": True, "team": team_name, "label": label})
        elif path == "/api/scrape":
            with scrape_lock:
                busy = scrape_state["running"]
            if busy:
                self.send_json({"ok": False, "error": "Es läuft schon ein Scrape."}, 409)
                return
            body = self.read_body() or ""
            teams = []
            if body.strip():
                try:
                    teams = [str(t) for t in (json.loads(body).get("teams") or [])]
                except ValueError:
                    teams = []
            run_scrape(teams)
            self.send_json({"ok": True})
        else:
            self.send_json({"error": "unbekannt"}, 404)

    def save(self, name):
        target = WRITABLE.get(name)
        if target is None:
            self.send_json({"error": "Diese Datei darf nicht geschrieben werden."}, 403)
            return
        body = self.read_body()
        if body is None:
            self.send_json({"error": "Leerer oder zu großer Inhalt."}, 400)
            return
        try:
            json.loads(body)                   # nur gueltiges JSON in die Datei
        except ValueError as exc:
            self.send_json({"error": "Kein gültiges JSON: " + str(exc)}, 400)
            return
        # Sicherheitsnetz: der vorherige Stand bleibt als .bak liegen.
        if target.exists():
            target.with_suffix(".json.bak").write_text(
                target.read_text(encoding="utf-8"), encoding="utf-8")
        target.write_text(body, encoding="utf-8")
        try:
            log = rebuild()
        except Exception as exc:               # noqa: BLE001 - Bau darf melden
            self.send_json({"error": "Gespeichert, aber der Bau schlug fehl: "
                                     + str(exc)}, 500)
            return
        self.send_json({"ok": True, "file": target.name, "log": log})


def main():
    parser = argparse.ArgumentParser(description="Draftboard als lokales Programm")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-open", action="store_true",
                        help="Browser nicht automatisch öffnen")
    args = parser.parse_args()

    print("Baue das Board ...", flush=True)
    for line in rebuild():
        print(line, flush=True)

    url = f"http://127.0.0.1:{args.port}/"
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"\nDraftboard laeuft: {url}")
    print("Dieses Fenster offen lassen. Beenden mit Strg+C.\n", flush=True)
    if not args.no_open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBeendet.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
