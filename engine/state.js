/* Der Draftzustand - eine einzige Wahrheit.
   ---------------------------------------------------------------------------
   Vorher gab es drei: `liveStand` im Live-Draft, das Spielformular und die
   Partienliste. Jede kannte einen Teil, keine das Ganze. Hier steht der
   Zustand EINMAL; Oberflaeche, Engine und Datenschicht lesen daraus.

   Die Reduzierer geben immer einen NEUEN Zustand zurueck. Das macht den
   Cache-Schluessel ehrlich (gleicher Zustand -> gleiches Ergebnis) und
   erlaubt es, einen Draft Zug um Zug nachzuspielen - der Backtest braucht
   genau das.
*/

export const ROLLEN_FOLGE = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

/* Die Woerter, die angezeigt werden. Eine Stelle fuer alle Module. */
export const ROLLEN_WORT = {
  TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "ADC", UTILITY: "Support",
};

/* Die Zugfolge im Turnierdraft. Blau beginnt. Jede Zeile: wer ist dran,
   was tut er, der wievielte Zug seiner Art.
   Bewusst als Tabelle und nicht als Formel: wer die Regel nachschlaegt,
   soll sie lesen koennen. */
export const ZUGFOLGE = [
  {nr: 0,  seite: "blue", art: "ban",  phase: "ban1"},
  {nr: 1,  seite: "red",  art: "ban",  phase: "ban1"},
  {nr: 2,  seite: "blue", art: "ban",  phase: "ban1"},
  {nr: 3,  seite: "red",  art: "ban",  phase: "ban1"},
  {nr: 4,  seite: "blue", art: "ban",  phase: "ban1"},
  {nr: 5,  seite: "red",  art: "ban",  phase: "ban1"},
  {nr: 6,  seite: "blue", art: "pick", phase: "pick1"},
  {nr: 7,  seite: "red",  art: "pick", phase: "pick1"},
  {nr: 8,  seite: "red",  art: "pick", phase: "pick1"},
  {nr: 9,  seite: "blue", art: "pick", phase: "pick1"},
  {nr: 10, seite: "blue", art: "pick", phase: "pick1"},
  {nr: 11, seite: "red",  art: "pick", phase: "pick1"},
  {nr: 12, seite: "red",  art: "ban",  phase: "ban2"},
  {nr: 13, seite: "blue", art: "ban",  phase: "ban2"},
  {nr: 14, seite: "red",  art: "ban",  phase: "ban2"},
  {nr: 15, seite: "blue", art: "ban",  phase: "ban2"},
  {nr: 16, seite: "red",  art: "pick", phase: "pick2"},
  {nr: 17, seite: "blue", art: "pick", phase: "pick2"},
  {nr: 18, seite: "blue", art: "pick", phase: "pick2"},
  {nr: 19, seite: "red",  art: "pick", phase: "pick2"},
];

/** Ein leerer Draft. `wirSind` sagt, welche Seite uns gehoert. */
export function leererDraft({patch = null, wirSind = "blue",
                             fearless = null} = {}) {
  return {
    patch,
    wirSind,                     // "blue" | "red"
    zug: 0,                      // Index in ZUGFOLGE
    bans: {blue: [], red: []},
    picks: {blue: [], red: []},  // [{champ, rolle|null, spieler|null, zug}]
    // Champions, die in dieser Fearless-Serie schon gespielt wurden.
    // null = kein Fearless. Leeres Array = Fearless, Spiel 1.
    fearless,
  };
}

/* ------------------------------------------------------------ Abfragen */

export const amZug = (s) => ZUGFOLGE[s.zug] || null;
export const phase = (s) => (amZug(s) ? amZug(s).phase : "complete");
export const fertig = (s) => s.zug >= ZUGFOLGE.length;
export const gegenseite = (seite) => (seite === "blue" ? "red" : "blue");
export const unsereSeite = (s) => s.wirSind;
export const ihreSeite = (s) => gegenseite(s.wirSind);

/** Sind wir dran? */
export function wirSindDran(s) {
  const z = amZug(s);
  return !!z && z.seite === s.wirSind;
}

/** Alles, was nicht mehr waehlbar ist - mit Grund. Eine Map, damit die
 *  Oberflaeche den Grund anzeigen kann, statt nur zu verschweigen. */
export function gesperrt(s) {
  const raus = new Map();
  const setz = (champ, art, text) => {
    if (champ && !raus.has(champ)) raus.set(champ, {art, text});
  };
  for (const seite of ["blue", "red"]) {
    const wer = seite === s.wirSind ? "uns" : "dem Gegner";
    for (const c of s.bans[seite]) setz(c, "ban", "gebannt von " + wer);
    for (const p of s.picks[seite]) setz(p.champ, "pick", "gepickt von " + wer);
  }
  for (const c of s.fearless || []) {
    setz(c, "fearless", "in dieser Serie schon gespielt");
  }
  return raus;
}

/** Wo stehen wir in der Pickfolge? Aus der Zahl der PICKS je Seite und
 *  ZUGFOLGE - nicht aus der Summe aller Felder, denn Bans werden oft
 *  nicht eingetragen (Audit P2.10). Angenommen ist, dass die Picks in der
 *  Turnierfolge gefallen sind (B R R B B R | R B B R).
 *    naechster                {nr, seite, wir} oder null, wenn fertig
 *    gegnerVorUnseremNaechsten  gegnerische Picks, bevor wir wieder dran sind
 *    gegnerVorUnseremLetzten    gegnerische Picks vor unserem letzten Pick -
 *                               nur sie kann Warten noch zeigen */
export function pickfolge(s) {
  const uns = s.wirSind, sie = gegenseite(uns);
  const getan = {blue: s.picks.blue.length, red: s.picks.red.length};
  const zaehl = {blue: 0, red: 0};
  const offen = ZUGFOLGE.filter((z) => z.art === "pick")
    .filter((z) => zaehl[z.seite]++ >= getan[z.seite]);
  const unsere = offen.filter((z) => z.seite === uns);
  const vor = (grenze) => grenze === null ? 0
    : offen.filter((z) => z.seite === sie && z.nr < grenze).length;
  return {
    naechster: offen.length ? {nr: offen[0].nr, seite: offen[0].seite,
                               wir: offen[0].seite === uns} : null,
    gegnerVorUnseremNaechsten: vor(unsere.length ? unsere[0].nr : null),
    gegnerVorUnseremLetzten: vor(unsere.length ? unsere[unsere.length - 1].nr : null),
    unsereOffen: unsere.length,
  };
}

/** Warum ein Champion in DIESES Eingabefeld nicht passt - oder null.
 *  Fuer Pick- und Ban-Felder gleich (Audit P2.6: vorher pruefte nur das
 *  Ban-Feld). Das eigene Feld zaehlt nicht mit, sonst liesse sich ein
 *  Eintrag nicht bestaetigen.
 *  felder: {picks: {eigen, gegner}, bans: {eigen, gegner}} wie in der
 *  Oberflaeche; fearless: die in der Serie verbrauchten Champions. */
export function feldSperre(felder, champ, {art, seite, i, fearless = []} = {}) {
  if (!champ) return null;
  for (const a of ["picks", "bans"]) {
    for (const s of ["eigen", "gegner"]) {
      const liste = ((felder || {})[a] || {})[s] || [];
      if (liste.some((c, j) => c === champ && !(a === art && s === seite && j === i))) {
        return a === "picks" ? "schon gepickt" : "schon gebannt";
      }
    }
  }
  if ((fearless || []).includes(champ)) {
    return "durch Fearless gesperrt (in dieser Serie schon gespielt)";
  }
  return null;
}

/** Noch offene Rollen einer Seite. Picks ohne zugeordnete Rolle zaehlen
 *  nicht als besetzt - Rollenunsicherheit wird nicht wegdefiniert. */
export function offeneRollen(s, seite) {
  const belegt = new Set(s.picks[seite].map((p) => p.rolle).filter(Boolean));
  return ROLLEN_FOLGE.filter((r) => !belegt.has(r));
}

/* ----------------------------------------------------------- Reduzierer */

/** Einen Zug ausfuehren. Gibt einen neuen Zustand zurueck. */
export function zieh(s, champ, {rolle = null, spieler = null} = {}) {
  const z = amZug(s);
  if (!z) throw new Error("Draft ist fertig");
  if (gesperrt(s).has(champ)) {
    throw new Error(champ + " ist nicht mehr verfuegbar");
  }
  const neu = klon(s);
  if (z.art === "ban") neu.bans[z.seite].push(champ);
  else neu.picks[z.seite].push({champ, rolle, spieler, zug: z.nr});
  neu.zug = s.zug + 1;
  return neu;
}

/** Einen Zug zuruecknehmen. */
export function zurueck(s) {
  if (s.zug === 0) return s;
  const z = ZUGFOLGE[s.zug - 1];
  const neu = klon(s);
  if (z.art === "ban") neu.bans[z.seite].pop();
  else neu.picks[z.seite].pop();
  neu.zug = s.zug - 1;
  return neu;
}

/** Einem schon gesetzten Pick nachtraeglich eine Rolle geben. */
export function setzeRolle(s, seite, champ, rolle) {
  const neu = klon(s);
  const p = neu.picks[seite].find((x) => x.champ === champ);
  if (p) p.rolle = rolle;
  return neu;
}

/** Aus einem beliebigen Zustand einen Schluessel bilden. Gleicher Zustand,
 *  gleicher Schluessel - darauf baut der Cache. Die Reihenfolge der Picks
 *  gehoert dazu: wann etwas gepickt wurde, aendert den Wert. */
export function schluessel(s, zusatz = "") {
  const p = (seite) => s.picks[seite]
    .map((x) => x.champ + ":" + (x.rolle || "?")).join(",");
  return [s.patch, s.wirSind, s.zug,
          s.bans.blue.join(","), s.bans.red.join(","),
          p("blue"), p("red"),
          (s.fearless || []).slice().sort().join(","),
          zusatz].join("|");
}

function klon(s) {
  return {
    patch: s.patch,
    wirSind: s.wirSind,
    zug: s.zug,
    bans: {blue: s.bans.blue.slice(), red: s.bans.red.slice()},
    picks: {blue: s.picks.blue.map((p) => ({...p})),
            red: s.picks.red.map((p) => ({...p}))},
    fearless: s.fearless ? s.fearless.slice() : s.fearless,
  };
}

/* ------------------------------------------------- Bruecke zur Oberflaeche */
/* Der Live-Draft haelt seine Felder je Rolle, nicht als Zugfolge. Solange
   beides nebeneinander lebt, uebersetzt das hier - in EINE Richtung, damit
   es keine zweite Wahrheit gibt. */
export function ausFeldern({picks, bans, wirSind = "blue", patch = null,
                            fearless = null} = {}) {
  const s = leererDraft({patch, wirSind, fearless});
  for (const seite of ["blue", "red"]) {
    const quelle = seite === wirSind ? "eigen" : "gegner";
    for (const c of (bans || {})[quelle] || []) if (c) s.bans[seite].push(c);
    ((picks || {})[quelle] || []).forEach((c, i) => {
      if (c) s.picks[seite].push({champ: c, rolle: ROLLEN_FOLGE[i],
                                  spieler: null, zug: null});
    });
  }
  // Der Zugzeiger ist aus Feldern nicht ableitbar: wir wissen nicht, in
  // welcher Reihenfolge gepickt wurde. Er bleibt auf der Zahl der
  // gesetzten Zuege - das reicht fuer Phase und "wer ist dran" naeherungsweise
  // und wird als Schaetzung gekennzeichnet.
  s.zug = Math.min(ZUGFOLGE.length,
                   s.bans.blue.length + s.bans.red.length
                   + s.picks.blue.length + s.picks.red.length);
  s.zugGeschaetzt = true;
  return s;
}
