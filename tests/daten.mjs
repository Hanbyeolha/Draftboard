/* Laedt die eingebetteten Daten aus index.html - dieselbe Quelle, die auch
   die Seite liest. Kein zweiter Pfad, keine Testkopie, die auseinanderlaeuft. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const wurzel = join(dirname(fileURLToPath(import.meta.url)), "..");

export function ladeDaten() {
  const html = readFileSync(join(wurzel, "index.html"), "utf8");
  const start = html.indexOf('<script id="scout-data" type="application/json">');
  if (start < 0) throw new Error("scout-data nicht gefunden - erst bauen");
  const von = html.indexOf(">", start) + 1;
  const bis = html.indexOf("</script>", von);
  // build.py maskiert "</" als "<\/", damit der Block kein Script beendet.
  const roh = html.slice(von, bis).split("<\\/").join("</");
  return JSON.parse(roh);
}

/** Die 68 Turnierpartien in ihrer Rohform - eine Partie, beide Seiten. */
export function ladePartien() {
  return JSON.parse(readFileSync(join(wurzel, "games.json"), "utf8"));
}
