/* Championsuche fuer das LIVE-Cockpit (Draftboard 2.0, Phase 4).
   ---------------------------------------------------------------------------
   Im Draft tippt jemand drei Buchstaben und will den Champion - nicht
   raten, ob "sol" Aurelion Sol meint. Die Reihenfolge ist fest und ohne
   Gewichte:
     0  genau (Name oder Kuerzel aus der Aliasliste, z. B. "mf")
     1  der Name beginnt so ("aur" -> Aurelion Sol, Aurora)
     2  ein Wort im Namen beginnt so ("sol" -> Aurelion Sol, "sa" -> Kai'Sa)
     3  irgendwo im Namen ("ell" -> Rell)
   Innerhalb einer Stufe alphabetisch. Gesperrte Champions bleiben in der
   Liste - mit Grund -, stehen aber hinter allen freien: wer "zed" tippt,
   soll sehen, dass Zed gebannt ist, statt nichts zu finden. Nur ein
   genauer Treffer steht immer vorn, auch gesperrt: wer "vi" tippt, meint
   Vi - Enter darf dann nicht still Viego eintragen. */

const flach = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const woerter = (name) => String(name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export const SUCH_STUFE = ["genau", "anfang", "wortanfang", "enthaelt"];

/**
 * @param {string} eingabe   was getippt wurde
 * @param {string[]} champions alle Championnamen
 * @param {{aliase?: Object<string,string>, gesperrt?: Map<string,string>, max?: number}} optionen
 *   aliase: flaches Kuerzel -> Name; gesperrt: Name -> Grund
 * @returns {{champ: string, stufe: string, gesperrt: string|null}[]}
 */
export function championSuche(eingabe, champions, {aliase = {}, gesperrt = new Map(), max = 8} = {}) {
  const k = flach(eingabe);
  if (!k) return [];
  const alias = aliase[k] || null;
  const treffer = [];
  for (const champ of champions) {
    const f = flach(champ);
    let stufe = -1;
    if (f === k || champ === alias) stufe = 0;
    else if (f.startsWith(k)) stufe = 1;
    else if (woerter(champ).slice(1).some((w) => w.startsWith(k))) stufe = 2;
    else if (k.length >= 2 && f.includes(k)) stufe = 3;
    if (stufe < 0) continue;
    const grund = gesperrt.get(champ);
    treffer.push({champ, stufe, gesperrt: grund === undefined ? null : grund});
  }
  treffer.sort((a, b) => (a.stufe !== 0) - (b.stufe !== 0)
    || (a.gesperrt !== null) - (b.gesperrt !== null)
    || a.stufe - b.stufe || a.champ.localeCompare(b.champ));
  return treffer.slice(0, max).map((t) => ({...t, stufe: SUCH_STUFE[t.stufe]}));
}
