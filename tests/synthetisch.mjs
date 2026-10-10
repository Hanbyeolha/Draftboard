/* Kleine, erfundene Welten im ECHTEN Datenformat.
   ---------------------------------------------------------------------------
   Wofuer: Tests, die eine Eigenschaft des Modells pruefen ("der robustere
   Blindpick gewinnt"), duerfen nicht davon abhaengen, was der naechste
   Patch mit Malphite macht. Darum hier Welten, in denen die Zahlen
   feststehen - im selben Format, das build.py aus DraftGap einbettet.
   Sie laufen durch dieselbe Datenschicht, dieselbe Bewertung und dieselbe
   Suche wie das Board. Nichts davon gelangt je ins Board.

   Format (siehe engine/data.js):
     basis[i][rolle]              = [Partien, Quote * 1000]
     paare[i][rolle][m|s][r2][j]  = [Partien, Quote * 1000]
     schaden[i][rolle]            = magischer Anteil in Prozent
*/

import { ROLLEN_FOLGE } from "../engine/state.js";

const nr = (rolle) => String(ROLLEN_FOLGE.indexOf(rolle));

/** Eine Welt bauen.
 *
 *  champions  {Name: {TOP: [Partien, Quote], ...}}
 *  matchups   [[a, rolleA, b, rolleB, Partien, Quote von a]] - gespiegelt
 *  synergien  [[a, rolleA, b, rolleB, Partien, Quote]]        - symmetrisch
 *  schaden    {Name: {TOP: magischerAnteilProzent}}
 *
 *  Jeder Champion bekommt zusaetzlich eine sehr grosse neutrale Paarung
 *  gegen einen Platzhalter. Dadurch liegt sein eigener Matchupschnitt
 *  (paarMittel) bei 50 %, und eine Quote von 53,5 % heisst in dieser Welt
 *  genau +3,5 Punkte gegenueber einem durchschnittlichen Gegner. */
export function welt({champions, matchups = [], synergien = [], schaden = {},
                      version = "99.1"}) {
  const PLATZ = "_Platzhalter";
  const namen = [...Object.keys(champions), PLATZ];
  const idx = new Map(namen.map((n, i) => [n, String(i)]));
  const basis = {}, paare = {}, dmg = {};

  for (const [c, rollen] of Object.entries(champions)) {
    const i = idx.get(c);
    basis[i] = {};
    for (const [r, [n, q]] of Object.entries(rollen)) {
      basis[i][nr(r)] = [n, Math.round(q * 1000)];
    }
  }

  const setze = (a, ra, art, b, rb, n, q) => {
    const i = idx.get(a), j = idx.get(b);
    if (i === undefined || j === undefined) throw new Error("unbekannt: " + a + "/" + b);
    paare[i] ??= {};
    paare[i][nr(ra)] ??= {};
    paare[i][nr(ra)][art] ??= {};
    paare[i][nr(ra)][art][nr(rb)] ??= {};
    paare[i][nr(ra)][art][nr(rb)][j] = [n, Math.round(q * 1000)];
  };

  for (const [a, ra, b, rb, n, q] of matchups) {
    setze(a, ra, "m", b, rb, n, q);
    setze(b, rb, "m", a, ra, n, 1 - q);
  }
  for (const [a, ra, b, rb, n, q] of synergien) {
    setze(a, ra, "s", b, rb, n, q);
    setze(b, rb, "s", a, ra, n, q);
  }
  // Der Platzhalter zentriert jeden eigenen Schnitt auf 50 %.
  for (const [c, rollen] of Object.entries(champions)) {
    for (const r of Object.keys(rollen)) {
      setze(c, r, "m", PLATZ, r, 10000000, 0.5);
      setze(c, r, "s", PLATZ, r, 10000000, 0.5);
    }
  }
  for (const [c, rollen] of Object.entries(schaden)) {
    const i = idx.get(c);
    dmg[i] = {};
    for (const [r, p] of Object.entries(rollen)) dmg[i][nr(r)] = p;
  }

  return {version, namen, basis, paare, schaden: dmg};
}

/** Eine Mannschaft mit einem Spieler je Eintrag, Rankedpool wie op.gg. */
export function mannschaft(team, spieler) {
  return [{
    team,
    players: spieler.map(({label, rolle, pool = {}, plan = null}) => ({
      label, role: rolle, bench: false, plan,
      queues: {RANKED: [{id: 1, champions: Object.entries(pool)
        .map(([champ, [win, lose]]) => ({champ, win, lose}))}]},
    })),
  }];
}
