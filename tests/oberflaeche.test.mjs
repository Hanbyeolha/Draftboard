/* Die Oberflaeche in Teilen (Draftboard 2.0, Phase 1): template.html setzt
   die Dateien aus ui/ ueber "//@ui <pfad>"-Zeilen ein (build.py). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

function dateien(ordner, basis = ordner) {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    return statSync(p).isDirectory() ? dateien(p, basis)
      : n.endsWith(".js") ? [p.slice(basis.length + 1).split("\\").join("/")] : [];
  });
}

test("jede //@ui-Zeile hat ihre Datei, und jede Datei wird genau einmal eingesetzt", () => {
  const vorlage = readFileSync("template.html", "utf8");
  const verweise = [...vorlage.matchAll(/^[ \t]*\/\/@ui ([\w./-]+)[ \t]*$/gm)].map((m) => m[1]);
  assert.ok(verweise.length >= 3, "Teile: " + verweise.length);
  for (const v of verweise) assert.ok(existsSync(join("ui", v)), "fehlt: ui/" + v);
  assert.deepEqual([...verweise].sort(), dateien("ui").sort(), "keine verwaiste und keine doppelte Datei");
});
