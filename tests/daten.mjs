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

/** Der Quelltext der Oberflaeche, wie build.py ihn zusammensetzt:
 *  template.html mit den Teilen aus ui/ an ihren //@ui-Zeilen. Tests, die
 *  pruefen, ob die Oberflaeche eine Engine-Funktion aufruft, lesen hier -
 *  seit Draftboard 2.0, Phase 1 steht der Code nicht mehr nur in
 *  template.html. */
export function ladeOberflaeche() {
  const text = readFileSync(join(wurzel, "template.html"), "utf8");
  return text.replace(/^[ \t]*\/\/@ui ([\w./-]+)[ \t]*\n/gm, (_, pfad) => {
    const inhalt = readFileSync(join(wurzel, "ui", pfad), "utf8");
    return inhalt.endsWith("\n") ? inhalt : inhalt + "\n";
  });
}
