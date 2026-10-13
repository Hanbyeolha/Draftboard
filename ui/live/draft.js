  // =================================================== Live Draft
  // Gerechnet wird in engine/ - siehe engine/README.md. Diese Datei
  // zeigt nur noch an. Vorher stand dieselbe Logik hier drin und war
  // ausserhalb eines Browsers nicht pruefbar; jetzt laeuft sie unter
  // Node mit ueber hundert Tests und wird beim Bauen eingefuegt.
  const ENGINE = typeof DraftEngine === "undefined" ? null : DraftEngine;

  const liveTeile = (() => {
    if (!ENGINE || !DATA.draft) return null;
    const quelle = ENGINE.quelleAnlegen(DATA.draft);
    // Mit den im Browser geprüften Einträgen (Reiter "Einschätzung").
    const heuristik = ENGINE.heuristikAnlegen(heuristikWirksam());
    const merkmale = ENGINE.merkmaleAnlegen(quelle, heuristik);
    const comp = ENGINE.compAnlegen(merkmale, heuristik);
    // Mit dem Draftplan aus dem Browser - derselbe, den die BLIND-Marke
    // zeigt (Audit P2.7). Nach einer Planaenderung legt livePlanNeu()
    // Mannschaft, Bewerter, Suche und Lagebild neu an.
    const mannschaft = ENGINE.teamAnlegen(ENGINE.planEinsetzen(DATA.teams, localPlan));
    const bewerter = ENGINE.bewerterAnlegen(
      {quelle, merkmale, comp, team: mannschaft, heuristik});
    const suche = ENGINE.sucheAnlegen({quelle, merkmale, bewerter});
    const protokoll = ENGINE.protokollAnlegen({
      speicher: (() => { try { return window.localStorage; }
                         catch (e) { return null; } })(),
    });
    // Solo-Queue-Drafts getrennt - sonst verfaelschten sie die Auswertung
    // der Mannschaft.
    const protokollSolo = ENGINE.protokollAnlegen({
      speicher: (() => { try { return window.localStorage; }
                         catch (e) { return null; } })(),
      speicherName: "draft-protokoll-solo",
    });
    // Das Lagebild nutzt dasselbe Blindmodell wie die Bewertung - ein
    // Feldcache, eine Wahrheit.
    const strategie = ENGINE.strategieAnlegen({quelle, merkmale, comp,
      heuristik, blind: bewerter.blindModell});
    return {quelle, heuristik, merkmale, comp, mannschaft, bewerter,
            suche, protokoll, protokollSolo, strategie};
  })();

  const DRAFT = liveTeile ? liveTeile.quelle : null;

  /* Zustand der Oberflaeche. Der Draftzustand selbst wird daraus gebaut -
     eine Wahrheit, siehe engine/state.js. */
  const SEITEN = [["eigen", "wir"], ["gegner", "gegner"]];
  const leer5 = () => [null, null, null, null, null];
  const liveStand = {
    bans: {eigen: leer5(), gegner: leer5()},
    picks: {eigen: leer5(), gegner: leer5()},
  };
  let liveAktiv = {seite: "eigen", rolle: 0};
  let liveFearless = false;
  /* Solo Queue (eigener Reiter): wer "ich" bin, je Mannschaft gemerkt -
     {Mannschaft: {label, rolle}}. Ich ist ein Spieler aus dem Kader. */
  let liveSolo = (() => {
    try {
      const d = JSON.parse(window.localStorage.getItem("live-solo") || "null");
      return d && typeof d === "object" ? d : {};
    } catch (e) { return {}; }
  })();
  const soloSichern = () => {
    try { window.localStorage.setItem("live-solo", JSON.stringify(liveSolo)); }
    catch (e) { /* dann nur fuer diese Sitzung */ }
  };
  const liveSoloIch = () => {
    const e = liveSolo[team.team];
    return e && e.label ? team.players.find((p) => p.label === e.label) || null : null;
  };
  const liveSoloRolle = () => {
    const e = liveSolo[team.team];
    if (e && Number.isInteger(e.rolle)) return e.rolle;
    const ich = liveSoloIch();
    const i = ich ? ROLES.findIndex(([w]) => w === ich.role) : -1;
    return i >= 0 ? i : 0;
  };

  // Welche Seite wir im Draft haben. Bestimmt die Pickfolge (wer wann
  // pickt), nicht die Rechnung je Champion. Pro Browser gemerkt.
  let liveSeite = (() => {
    try { return window.localStorage.getItem("live-seite") === "red" ? "red" : "blue"; }
    catch (e) { return "blue"; }
  })();
  // Keine Vorauswahl: eine eingetragene Serie ist eine bewusste Wahl.
  // Vorher stand hier die zuletzt gespielte, und wer ein Spiel merkte,
  // sperrte sich ungewollt auch deren zehn Champions.
  let liveSerie = null;
  let liveFilter = "alle";
  let liveSuche = "";
  let liveGegner = "";
  // Risikoprofil (config.js RISIKOPROFILE): sicher gewichtet den
  // schlechtesten Ausgang mit, aggressiv den besten. Vorher fest
  // "ausgewogen" - die Engine konnte es, die Oberflaeche nicht.
  let liveRisiko = (() => {
    try {
      const r = window.localStorage.getItem("live-risiko");
      return ["sicher", "ausgewogen", "aggressiv"].includes(r) ? r : "ausgewogen";
    } catch (e) { return "ausgewogen"; }
  })();

  /* Jeder Draft bekommt eine Nummer. An ihr haengt im Protokoll das
     Ergebnis - erst damit laesst sich spaeter fragen, welche
     Empfehlungen gut waren. Neu gezaehlt wird bei "Draft leeren" und
     "Spiel merken". */
  let liveDraftNr = (() => {
    try { return Number(window.localStorage.getItem("live-draft-nr")) || 1; }
    catch (e) { return 1; }
  })();
  const liveErgebnisse = new Map();       // Draftnummer -> "sieg" | "niederlage"
  function neuerDraft() {
    liveDraftNr += 1;
    try { window.localStorage.setItem("live-draft-nr", String(liveDraftNr)); }
    catch (e) { /* dann zaehlt es eben nur in dieser Sitzung */ }
  }

  /* Spiele der laufenden Serie, die noch nicht in games.json stehen.
     Je Eintrag die zehn gepickten Champions. Bleibt im Browser - das ist
     ein Zwischenstand fuer den Abend, kein Ergebnis. */
  let liveSerienSpiele = (() => {
    try {
      const roh = window.localStorage.getItem("live-serie");
      const d = roh ? JSON.parse(roh) : null;
      return Array.isArray(d) ? d : [];
    } catch (e) { return []; }
  })();

  // Wer Spiele gemerkt hat, meinte Fearless - sonst waeren sie nach dem
  // Neuladen zwar noch da, aber wirkungslos.
  if (liveSerienSpiele.length) liveFearless = true;

  function serieSichern() {
    try {
      window.localStorage.setItem("live-serie", JSON.stringify(liveSerienSpiele));
    } catch (e) { /* voll oder gesperrt - dann eben nur fuer diese Sitzung */ }
  }

  /** Den aktuellen Draft als gespieltes Spiel merken und das Brett
   *  leeren. Bans zaehlen nicht: Fearless sperrt Picks. */
  function serieMerken() {
    const champs = [...liveStand.picks.eigen, ...liveStand.picks.gegner]
      .filter(Boolean);
    if (!champs.length) return;
    liveSerienSpiele.push(champs);
    serieSichern();
    neuerDraft();
    liveStand.picks.eigen = leer5();
    liveStand.picks.gegner = leer5();
    liveStand.bans.eigen = leer5();
    liveStand.bans.gegner = leer5();
    liveFearless = true;        // wer ein Spiel merkt, meint Fearless
    liveCache.clear();
    renderLiveDraft();
  }

  function serieVergessen(i) {
    liveSerienSpiele.splice(i, 1);
    serieSichern();
    liveCache.clear();
    renderLiveDraft();
  }

  /** Aus den Feldern der Oberflaeche den Draftzustand bauen. */
  function liveZustand() {
    const z = ENGINE.ausFeldern({
      picks: liveStand.picks, bans: liveStand.bans,
      // Unsere Seite aus dem Kopf - vorher fest Blau (Audit P2.10).
      wirSind: liveSeite, patch: DRAFT.patch,
      fearless: liveFearless ? fearlessVerbraucht() : null,
    });
    return z;
  }

  /** Welche Champions diese Fearless-Serie schon verbraucht hat. Die
     einzige Stelle, die auf vergangene Partien schaut - und das ist die
     Spielregel, kein Staerkeurteil. */
  function fearlessVerbraucht() {
    const raus = [];
    // Eingetragene Partien der gewaehlten Serie ...
    if (liveSerie) {
      for (const g of games) {
        if (g.series !== liveSerie) continue;
        for (const p of g.picks || []) if (p.champ) raus.push(p.champ);
      }
    }
    // ... und die heute Abend gemerkten.
    for (const spiel of liveSerienSpiele) raus.push(...spiel);
    return [...new Set(raus)];
  }

  /** Gesperrte Champions mit Grund - fuer die Sperrleiste. */
  function liveGesperrt() {
    const z = liveZustand();
    const roh = ENGINE.gesperrt(z);
    const raus = new Map();
    for (const [champ, v] of roh) {
      raus.set(champ, {
        art: v.art,
        text: v.art === "fearless" ? "in dieser Serie schon gespielt"
            : v.text.replace("uns", team.team)
                    .replace("dem Gegner", liveGegnerName() || "dem Gegner"),
      });
    }
    return raus;
  }

  const liveGegnerName = () => liveGegner.trim() || null;

  function liveSerienGegner() {
    for (const block of gameBlocks()) {
      if (block.series === liveSerie) return block.games[0].opponent;
    }
    return null;
  }

  function liveSerien() {
    return gameBlocks().map((b) => b.series).filter(Boolean);
  }

  /* Die im Gegnerfeld genannte Mannschaft, sofern wir sie gescoutet
     haben. Frei getippte Namen ergeben null - dann wissen wir ueber den
     Gegner nichts und der Komfort faellt aus. */
  const liveGegnerTeam = () => {
    const n = (liveGegner || "").trim();
    return n ? TEAMS.find((t) => t.team === n) || null : null;
  };

  /* Zu welchem Slot gehoert welcher Spieler. Vorher nahm die Liste
     immer den Starter der EIGENEN Mannschaft, auch auf einem
     Gegnerslot - die Gegnerempfehlung war damit nach unserem Pool
     gefaerbt. Kennen wir die gegnerische Mannschaft, gehoeren ihre
     Spieler dorthin; kennen wir sie nicht, faellt der Komfort aus. */
  /* Wer beim Gegner auf welcher Rolle spielt, wenn es vom Scouting
     abweicht: {Mannschaft: {TOP: "Label" | "" (unbekannt)}}. Fehlt ein
     Eintrag, gilt der Starter. Im Browser gemerkt - ein Wechsel haelt
     meist die ganze Serie. */
  let liveGegnerBesetzung = (() => {
    try {
      const d = JSON.parse(window.localStorage.getItem("live-gegner-besetzung") || "null");
      return d && typeof d === "object" ? d : {};
    } catch (e) { return {}; }
  })();
  function gegnerBesetzungSichern() {
    try {
      window.localStorage.setItem("live-gegner-besetzung",
                                  JSON.stringify(liveGegnerBesetzung));
    } catch (e) { /* dann eben nur fuer diese Sitzung */ }
  }
  /* Dasselbe fuer UNS: wer heute auf welcher Rolle spielt, wenn ein
     Substitute einspringt. {Mannschaft: {TOP: "Label" | "" (jemand
     ausserhalb des Kaders)}}. Vorher war unsere Seite fest der Starter -
     Komfort, Pool und BLIND-Marke blieben bei ihm, auch wenn er nicht
     spielte. */
  let liveEigenBesetzung = (() => {
    try {
      const d = JSON.parse(window.localStorage.getItem("live-eigen-besetzung") || "null");
      return d && typeof d === "object" ? d : {};
    } catch (e) { return {}; }
  })();
  function eigenBesetzungSichern() {
    try {
      window.localStorage.setItem("live-eigen-besetzung",
                                  JSON.stringify(liveEigenBesetzung));
    } catch (e) { /* dann eben nur fuer diese Sitzung */ }
  }
  // Eine Mechanik fuer beide Seiten: welche Mannschaft, welcher Speicher.
  const liveMannschaftVon = (seite) => seite === "eigen" ? team : liveGegnerTeam();
  const liveBesetzungVon = (seite) =>
    seite === "eigen" ? liveEigenBesetzung : liveGegnerBesetzung;
  const liveBesetzungSichern = (seite) =>
    seite === "eigen" ? eigenBesetzungSichern() : gegnerBesetzungSichern();

  const gegnerStarter = (g, rolleName) =>
    (g.players || []).find((p) => !p.bench && p.role === rolleName) || null;

  function liveSpielerVon(seite, rolle) {
    const g = liveMannschaftVon(seite);
    if (!g) return null;
    const rolleName = ROLES[rolle][0];
    const wahl = (liveBesetzungVon(seite)[g.team] || {})[rolleName];
    if (wahl !== undefined) {
      // "" heisst: von Hand auf unbekannt gesetzt - kein Pool, kein Raten.
      if (wahl === "") return null;
      const p = (g.players || []).find((x) => x.label === wahl);
      if (p) return p;
    }
    return gegnerStarter(g, rolleName);
  }

  /* Die Auswahl je Rolle: wer spielt diese Rolle? Fuer beide Seiten. */
  function liveWahl(seite, i) {
    const g = liveMannschaftVon(seite);
    if (!g) return el("span", {class: "ld-wer"}, "");
    const besetzung = liveBesetzungVon(seite);
    const eigen = seite === "eigen";
    const rolleName = ROLES[i][0];
    const starter = gegnerStarter(g, rolleName);
    const aktuell = liveSpielerVon(seite, i);
    const geaendert = (besetzung[g.team] || {})[rolleName] !== undefined;
    // Erst wer laut Scouting auf dieser Rolle steht, dann die uebrigen
    // Starter, dann die Bank.
    const rang = (p) => (!p.bench && p.role === rolleName) ? 0 : !p.bench ? 1 : 2;
    const spieler = (g.players || []).slice()
      .sort((a, b) => rang(a) - rang(b) || (a.label < b.label ? -1 : 1));
    const quelle = eigen ? "Kader" : "Scouting";
    const wahl = el("select", {
        class: "ld-wer ld-wer-wahl" + (geaendert ? " geaendert" : ""),
        "aria-label": (eigen ? "Unser Spieler auf " : "Gegnerischer Spieler auf ") + ROLES[i][1],
        title: geaendert
          ? "Von Hand gesetzt" + (starter ? " - laut " + quelle + ": " + starter.label : "")
          : "Laut " + quelle + " - bei einem Wechsel hier umstellen"},
      el("option", {value: ""}, eigen ? "\u2014 nicht im Kader \u2014" : "\u2014 unbekannt \u2014"),
      spieler.map((p) => el("option", {value: p.label},
        p.label + (p.bench ? " \u00b7 Bank"
          : p.role !== rolleName ? " \u00b7 " + (ENGINE.ROLLEN_WORT[p.role] || p.role) : ""))));
    wahl.value = aktuell ? aktuell.label : "";
    wahl.addEventListener("change", () => {
      const eintrag = besetzung[g.team] || (besetzung[g.team] = {});
      const setze = (rn, label) => {
        const st = gegnerStarter(g, rn);
        // Wer wieder den Starter waehlt, ist zurueck beim Standard.
        if (st && label === st.label) delete eintrag[rn];
        else eintrag[rn] = label;
      };
      // Steht der Gewaehlte schon auf einer anderen Rolle, ist es ein
      // Rollentausch: der bisherige Spieler dieser Rolle wandert dorthin.
      // Sonst stuende derselbe Spieler auf zwei Rollen.
      if (wahl.value) {
        ROLES.forEach(([rn], j) => {
          if (j === i) return;
          const dort = liveSpielerVon(seite, j);
          if (dort && dort.label === wahl.value) setze(rn, aktuell ? aktuell.label : "");
        });
      }
      setze(rolleName, wahl.value);
      if (!Object.keys(eintrag).length) delete besetzung[g.team];
      liveBesetzungSichern(seite);
      // Komfort und Blindszenarien haengen am Spieler - alles neu.
      liveCache.clear();
      liveLageCache.clear();
      renderLiveDraft();
    });
    return wahl;
  }
  const liveSpielerAktiv = (rolle) => liveSpielerVon(liveAktiv.seite, rolle);

  /* Die Spieler der ANDEREN Seite - fuer die Blindszenarien. Auf unserem
     Slot sind das die gegnerischen (sofern gescoutet): ihre Pools machen
     ihre Picks wahrscheinlicher. Auf einem Gegnerslot sind es unsere. */
  function liveGegnerFuer(rolleName, seite = liveAktiv.seite) {
    const andere = seite === "eigen" ? "gegner" : "eigen";
    const i = ROLES.findIndex(([w]) => w === rolleName);
    const sp = i >= 0 ? liveSpielerVon(andere, i) : null;
    return sp ? {team: sp.team, label: sp.label} : null;
  }

  /* Die Suche gilt fuer die Liste, die man gerade ansieht - nicht ueber
     einen Rollenwechsel hinweg. Sonst filtert "naut" (fuer Support
     gesucht) danach die Mid-Liste auf null Treffer. */
  function liveSucheLeeren() {
    liveSuche = "";
    const feld = document.querySelector("#live-draft .ld-suche");
    if (feld) feld.value = "";
  }

  /** Einen Champion auf den aktiven Slot setzen - und, wenn es unser
   *  Slot ist, im Protokoll nachtragen, was wirklich gepickt wurde. */
  function livePicken(champ) {
    // Derselbe Riegel wie beim Eintippen (Audit P2.6).
    const grund = liveSperre(champ, "picks", liveAktiv.seite, liveAktiv.rolle);
    if (grund) {
      liveBanHinweis(liveAktiv.seite, champ + " kann nicht gepickt werden: " + grund);
      return;
    }
    liveSucheLeeren();
    if (liveTeile && liveAktiv.seite === "eigen") {
      liveTeile.protokoll.nachtragen(
        ENGINE.schluessel(liveZustand(), ROLES[liveAktiv.rolle][0]), champ);
    }
    liveStand.picks[liveAktiv.seite][liveAktiv.rolle] = champ;
    renderLiveDraft();
  }

  /* --------------------------------------------------- Die Rangliste */
  /* Gleiche Lage, gleiches Ergebnis - und beim zweiten Mal ohne Rechnen.
     Der Schluessel kommt aus der Engine und enthaelt alles, was zaehlt. */
  const liveCache = new Map();

  /* Aus wessen Sicht wird bewertet? Auf einem Gegnerslot aus der des
     GEGNERS. Vorher lief die Rangliste dort aus unserer Sicht: "mit"
     hiess dann "mit unseren Picks" und "gegen" hiess "gegen ihre" - ein
     gegnerischer Kandidat galt als gut, wenn er zu UNSEREM Team passte.
     Derselbe Zustand, nur die Seite gewechselt; der Cacheschluessel
     enthaelt wirSind und trennt beide Sichten. */
  function liveSicht(seite = liveAktiv.seite) {
    const z = liveZustand();
    return seite === "eigen" ? z
      : {...z, wirSind: z.wirSind === "blue" ? "red" : "blue"};
  }

  /* seite: fuer welche Seite gerechnet wird - der aktive Slot, wenn
     nichts anderes gesagt ist. Das Lagebild fragt so den besten Pick fuer
     UNSERE naechste Rolle ab, auch wenn gerade ein anderer Slot aktiv ist. */
  function liveRangliste(rolle, seite = liveAktiv.seite) {
    if (!liveTeile) return {liste: [], ms: 0, ausCache: false};
    const z = liveSicht(seite);
    const spieler = liveSpielerVon(seite, rolle);
    // Der Gegner gehoert in den Schluessel: sein Pool aendert die
    // Blindszenarien.
    const k = ENGINE.schluessel(z, rolle + "|" + liveRisiko
      + "|" + seite + "|" + (liveGegner || "")
      + "|" + (spieler ? spieler.team + "/" + spieler.label : ""));
    if (liveCache.has(k)) return {...liveCache.get(k), ausCache: true};

    const t0 = performance.now();
    const liste = liveTeile.suche.rangliste(z, ROLES[rolle][0], {
      // spieler.team statt team.team: auf einem Gegnerslot ist das die
      // gegnerische Mannschaft.
      spielerTeam: spieler ? spieler.team : null,
      spielerLabel: spieler ? spieler.label : null,
      spielerFuer: (r) => {
        const sp = liveSpielerVon(seite, ROLES.findIndex(([w]) => w === r));
        return sp ? {team: sp.team, label: sp.label} : null;
      },
      risikoprofil: liveRisiko,
      gegnerFuer: (r) => liveGegnerFuer(r, seite),
    });
    const kategorien = liveTeile.suche.kategorien(liste);
    const ergebnis = {liste, kategorien, ms: performance.now() - t0};
    // Der Cache darf nicht unbegrenzt wachsen; ein Draft hat zwanzig Zuege.
    if (liveCache.size > 60) liveCache.clear();
    liveCache.set(k, ergebnis);
    if (liste.length && seite === "eigen") {
      liveTeile.protokoll.notiere(z, ROLES[rolle][0], liste,
        {risikoprofil: liveRisiko, dauerMs: Math.round(ergebnis.ms),
         kategorien, draft: liveDraftNr});
    }
    return {...ergebnis, ausCache: false};
  }

  /** In welche Schublade gehoert ein Kandidat? Die Kategorien richten
     sich nach der Erfahrung des Spielers, nicht nach der Note. */
  function liveKategorie(r, spieler) {
    // Aus den Daten, nicht aus dem Komforttext: Partien als Stichprobe des
    // Komforts, Plan aus planOf (derselbe Plan wie die BLIND-Marke).
    const k = spieler && liveTeile
      ? liveTeile.mannschaft.komfort(spieler.team, spieler.label, r.champion) : null;
    const partien = k && Number.isFinite(k.sampleSize) ? k.sampleSize : 0;
    const plan = spieler ? planOf(spieler) : null;
    const imPlan = !!plan && (plan.blind.includes(r.champion) || plan.likes.includes(r.champion));
    return partien >= 20 ? "pool"
         : (partien >= 3 || imPlan) ? "alternativen" : "selten";
  }

  /** Beide Aufstellungen im Ueberblick. */
  function liveComp() {
    if (!liveTeile) return null;
    const z = liveZustand();
    const unser = liveTeile.comp.profil(z.picks.blue);
    const ihr = liveTeile.comp.profil(z.picks.red);
    return {
      wir: z.picks.blue, sie: z.picks.red,
      unser, ihr,
      quote: liveTeile.suche.compQuote(z),
      phasen: liveTeile.comp.phasenVorteil(unser, ihr),
    };
  }

  // ------------------------------------------------ Darstellung
  // Das Geruest steht einmal; bei jeder Aenderung werden nur Sperrleiste
  // und Championliste neu gezeichnet - sonst entstehen die Eingabefelder
  // unter dem Tippenden neu und der Fokus ist weg.
  function renderLiveDraft() {
    const ziel = document.getElementById("live-draft");
    if (!ziel) return;
    ziel.textContent = "";
    ziel.className = "";
    // Das Briefing haengt an Gegner, Seite und Plan - es zeichnet sich nur,
    // wenn es offen ist (ui/live/briefing.js).
    renderBriefing();
    // Draftboard 2.0: das Cockpit ist die Standardansicht (ui/live/cockpit.js);
    // die klassische bleibt per Schalter.
    if (DRAFT && liveTeile && cockpitAn()) { renderCockpit(ziel); return; }
    if (!DRAFT || !liveTeile) {
      ziel.append(zustandsHinweis("fehler", "Keine Draftdaten",
        "Die Patchdaten (DraftGap) fehlen in dieser Seite – build.py konnte die Datensätze "
        + "nicht laden. SCOUT und REVIEW funktionieren weiter."));
      return;
    }
    const serien = liveSerien();

    /* .filter(Boolean) ist Pflicht: serienLeiste() liefert null, wenn
       nichts gemerkt ist, und Element.append(null) haengt den TEXT "null"
       an. el() filtert Nullwerte selbst, append tut das nicht. */
    ziel.append(...[el("datalist", {id: "ld-ban-liste"}),
                    liveKopf(serien), serienLeiste(), liveBoard(),
                    el("div", {class: "ld-lage"}),
                    el("div", {class: "ld-comp"}),
                    el("div", {class: "ld-sperren"}),
                    liveFilterLeiste(),
                    el("div", {class: "ld-liste"}),
                    el("div", {class: "ld-protokoll"})].filter(Boolean));
    liveAktualisieren();
  }

  /* Die heute Abend gemerkten Spiele. Sie stehen hier und nicht nur in
     der Sperrleiste, damit man sie auch wieder loswird - ein Fehlgriff
     beim Merken soll kein Neuanfang sein. */
  function serienLeiste() {
    if (!liveSerienSpiele.length) return null;
    const alles = el("button", {class: "ld-reset", type: "button"},
                     "Serie zurücksetzen");
    alles.addEventListener("click", () => {
      liveSerienSpiele = [];
      serieSichern();
      liveCache.clear();
      renderLiveDraft();
    });
    return el("div", {class: "ld-serie-leiste"},
      el("span", {class: "ld-serie-wort"}, "Gemerkte Spiele"),
      el("div", {class: "ld-serie-liste"}, liveSerienSpiele.map((spiel, i) => {
        const weg = el("button", {class: "ld-serie-weg", type: "button",
            "aria-label": "Spiel " + (i + 1) + " vergessen",
            title: spiel.join(", ")}, "×");
        weg.addEventListener("click", () => serieVergessen(i));
        return el("span", {class: "ld-serie-spiel"},
          el("b", {}, "Spiel " + (i + 1)),
          el("span", {class: "sub"}, spiel.length + " Champions"),
          weg);
      })),
      alles);
  }

  function liveKopf(serien) {
    const haken = el("input", {type: "checkbox"});
    haken.checked = liveFearless;
    const wahl = el("select", {class: "ld-serie",
        "aria-label": "Eingetragene Serie, deren Picks zusaetzlich gesperrt sind"},
      el("option", {value: ""}, serien.length
         ? "— nur gemerkte Spiele —" : "keine Serie erfasst"),
      serien.map((n) => el("option", {value: n}, n)));
    wahl.value = liveSerie || "";
    wahl.disabled = !liveFearless;
    // Der Gegner ist frei waehlbar - er haengt nicht an der Serie. Vorher
    // stand dort dauerhaft der Gegner der zuletzt gespielten Serie.
    const gegnerFeld = el("input", {type: "text", class: "ld-gegner",
      list: "opponent-list", placeholder: "Gegner", autocomplete: "off",
      "aria-label": "Gegnerische Mannschaft"});
    gegnerFeld.value = liveGegner;
    gegnerFeld.addEventListener("change", () => {
      liveGegner = gegnerFeld.value;
      renderLiveDraft();
    });
    const vorschlagen = () => {
      if (liveGegner.trim()) return;
      const g = liveSerienGegner();
      if (g) { liveGegner = g; gegnerFeld.value = g; }
    };
    haken.addEventListener("change", () => {
      liveFearless = haken.checked;
      wahl.disabled = !liveFearless;
      if (liveFearless) vorschlagen();
      renderLiveDraft();
    });
    wahl.addEventListener("change", () => {
      liveSerie = wahl.value || null;
      vorschlagen();
      renderLiveDraft();
    });
    const zurueck = el("button", {class: "ld-reset", type: "button"}, "Draft leeren");
    zurueck.addEventListener("click", () => {
      liveStand.bans.eigen = leer5(); liveStand.bans.gegner = leer5();
      liveStand.picks.eigen = leer5(); liveStand.picks.gegner = leer5();
      neuerDraft();
      renderLiveDraft();
    });
    // Ein abgeschlossenes Spiel merken: die zehn Picks wandern in die
    // Serie, das Brett wird frei fuers naechste. Nur sinnvoll, wenn auch
    // etwas steht.
    const merken = el("button", {class: "ld-merken", type: "button",
        title: "Die zehn Picks dieses Spiels sperren und das Brett leeren"},
      "Spiel merken");
    merken.disabled = ![...liveStand.picks.eigen, ...liveStand.picks.gegner]
      .some(Boolean);
    merken.addEventListener("click", serieMerken);

    return el("div", {class: "ld-kopf"},
      el("span", {class: "ld-titel"}, "Live Draft"),
      el("span", {class: "ld-paarung"},
        el("b", {class: "eigen"}, team.team), " vs "),
      gegnerFeld,
      liveSeitenWahl(),
      el("label", {class: "ld-schalter"}, haken, " Fearless"),
      wahl, merken, zurueck, cockpitSchalter(),
      liveDatenstand());
  }

  /* Seite und Zug im Kopf (Audit P2.10). Die Pickfolge kommt aus der
     Zahl der Picks je Seite; "am Zug" nimmt an, dass in Turnierfolge
     gepickt wurde. */
  function liveSeitenWahl() {
    const wahl = el("select", {class: "ld-serie ld-seitenwahl",
        "aria-label": "Unsere Seite im Draft"},
      el("option", {value: "blue"}, "wir: Blau"),
      el("option", {value: "red"}, "wir: Rot"));
    wahl.value = liveSeite;
    wahl.addEventListener("change", () => {
      liveSeite = wahl.value === "red" ? "red" : "blue";
      try { window.localStorage.setItem("live-seite", liveSeite); } catch (e) { /* egal */ }
      liveLageCache.clear();
      renderLiveDraft();
    });
    const pf = ENGINE.pickfolge(liveZustand());
    const zug = pf.naechster
      ? el("span", {class: "sub ld-zug",
                    title: "Aus der Zahl der Picks je Seite, Turnierfolge B R R B B R | R B B R"},
           "am Zug: " + (pf.naechster.wir ? team.team : (liveGegnerName() || "Gegner")))
      : null;
    const risiko = el("select", {class: "ld-serie ld-risikowahl",
        "aria-label": "Risikoprofil",
        title: "Sicher: der schlechteste Ausgang zählt mehr. Aggressiv: der beste. "
               + "Wirkt im Blindwert und im Lookahead."},
      el("option", {value: "sicher"}, "Risiko: sicher"),
      el("option", {value: "ausgewogen"}, "Risiko: ausgewogen"),
      el("option", {value: "aggressiv"}, "Risiko: aggressiv"));
    risiko.value = liveRisiko;
    risiko.addEventListener("change", () => {
      liveRisiko = risiko.value;
      try { window.localStorage.setItem("live-risiko", liveRisiko); } catch (e) { /* egal */ }
      renderLiveDraft();              // der Ranglisten-Cache hat das Profil im Schluessel
    });
    return el("span", {class: "ld-seite-zug"}, wahl, risiko, zug);
  }

  /* Datenstand im Kopf (Audit P2.5): Staerke aus dem Patch, Paarungen
     aus einem Zeitfenster - beide genannt. Dazu der laufende Patch laut
     Data Dragon, sobald er abweicht; ab der Schwelle der Engine
     (KONFIDENZ.veraltetAbPatches) als Warnung. */
  function liveDatenstand() {
    const d = ENGINE.datenstand(DRAFT, DATA.patchLive || null);
    const teile = ["St\u00e4rke Patch " + (d.patch || "?")];
    if (d.paareTage) teile.push("Paarungen " + d.paareTage + " Tage");
    if (d.stand) teile.push(deDate(d.stand));
    if (d.abstand) teile.push("aktuell " + d.aktuell);
    const titel = "St\u00e4rke, Schaden und Kurve aus Patch " + (d.patch || "?")
      + (d.paareTage ? "; Matchups und Synergien aus den letzten "
         + d.paareTage + " Tagen bis " + deDate(d.paareStand) : "")
      + (d.abstand ? ". Laufender Patch laut Data Dragon: " + d.aktuell
         + " (" + d.abstand + (d.abstand === 1 ? " Patch" : " Patches")
         + " Abstand)" : "")
      // Ein blosses Neubauen nimmt den alten Stand - neu geholt wird nur
      // ausdruecklich. Beide Wege nennen, immer.
      + (d.warnung ? ". Die Daten sind veraltet" : "")
      + ". Aktualisieren: im Programm unter \u201eProgramm \u2192 DraftGap: Patchdaten"
      + " neu holen\u201c, sonst python build.py --pages --draftgap.";
    return el("span", {class: "sub ld-quelle" + (d.warnung ? " veraltet" : ""),
                       title: titel},
      (d.warnung ? "Veraltet: " : "") + teile.join(" \u00b7 "));
  }

  // Ein Feld im Draftboard. Tippen traegt ein, Klick macht es zum Ziel des
  // Pick-Knopfs in der Championliste.
  function liveFeld(seite, art, i, beschriftung) {
    const speicher = liveStand[art][seite];
    const feld = champField("ld-" + seite + "-" + art + "-" + i, beschriftung, () => {});
    const eingabe = feld.querySelector("input");
    eingabe.value = speicher[i] || "";
    // champField zeichnet seine Vorschau nur auf input/change. Wer den Wert
    // setzt - etwa der Picken-Knopf - muss das selbst anstossen, sonst
    // bleibt das Feld ohne Icon.
    eingabe.dispatchEvent(new Event("input"));
    // Pick- und Ban-Felder schlagen dieselben freien Champions vor.
    eingabe.setAttribute("list", "ld-ban-liste");
    eingabe.addEventListener("change", () => {
      const champ = normaliseChamp(eingabe.value) || null;
      // Wer schon gepickt, gebannt oder durch Fearless gesperrt ist, kann
      // weder gepickt noch gebannt werden - das Feld nimmt ihn nicht an
      // und sagt warum. Vorher galt das nur fuer Bans (Audit P2.6).
      const grund = liveSperre(champ, art, seite, i);
      if (grund) {
        eingabe.value = speicher[i] || "";
        eingabe.dispatchEvent(new Event("input"));
        liveBanHinweis(seite, champ + (art === "bans" ? " ist nicht bannbar: "
                                       : " kann nicht gepickt werden: ") + grund);
        return;
      }
      liveBanHinweis(seite, "");
      speicher[i] = champ;
      liveAktualisieren();
    });
    const aktiv = art === "picks" && liveAktiv.seite === seite && liveAktiv.rolle === i;
    const huelle = el("div", {class: "ld-feld " + art + (aktiv ? " aktiv" : "")},
      beschriftung ? el("span", {class: "ld-feld-wort"}, beschriftung) : null, feld);
    if (art === "picks") {
      eingabe.addEventListener("focus", () => {
        if (liveAktiv.seite !== seite || liveAktiv.rolle !== i) liveSucheLeeren();
        liveAktiv = {seite, rolle: i};
        for (const k of document.querySelectorAll(".ld-feld.picks")) {
          k.classList.remove("aktiv");
        }
        huelle.classList.add("aktiv");
        liveAktualisieren();
      });
    }
    return huelle;
  }

  function liveBesetzungZurueck(seite) {
    const g = liveMannschaftVon(seite);
    const besetzung = liveBesetzungVon(seite);
    const n = g ? Object.keys(besetzung[g.team] || {}).length : 0;
    if (!n) return null;
    const k = el("button", {class: "ld-reset ld-besetzung-zurueck", type: "button",
                            title: "Alle Rollen wieder auf die Starter laut "
                                   + (seite === "eigen" ? "Kader" : "Scouting")},
                 n + (n === 1 ? " Wechsel" : " Wechsel") + " \u00b7 zur\u00fccksetzen");
    k.addEventListener("click", () => {
      delete besetzung[g.team];
      liveBesetzungSichern(seite);
      liveCache.clear();
      liveLageCache.clear();
      renderLiveDraft();
    });
    return k;
  }

  /** Warum ein Champion in dieses Feld nicht passt - oder null. Die
   *  Pruefung steht in der Engine (feldSperre) und gilt fuer Pick- und
   *  Ban-Felder gleich; das eigene Feld zaehlt nicht mit. */
  function liveSperre(champ, art, seite, i) {
    return ENGINE.feldSperre(liveStand, champ, {
      art, seite, i, fearless: liveFearless ? fearlessVerbraucht() : []});
  }

  /* Ein kurzer Hinweis unter den Bans der Seite, liest auch ein
     Screenreader vor. Verschwindet nach ein paar Sekunden. */
  let liveBanHinweisUhr = null;
  function liveBanHinweis(seite, text) {
    const ziel = document.querySelector("#live-draft .ld-seite." + seite + " .ld-ban-hinweis");
    if (!ziel) return;
    ziel.textContent = text;
    clearTimeout(liveBanHinweisUhr);
    liveBanHinweisUhr = setTimeout(() => { ziel.textContent = ""; }, 4500);
  }

  /* Die Vorschlagsliste der Pick- und Ban-Felder: alle Champions ohne die
     gesperrten.
     Nach jeder Aenderung neu, damit ein gerade gepickter Champion sofort
     verschwindet. */
  function liveBanListeZeichnen() {
    const liste = document.getElementById("ld-ban-liste");
    if (!liste) return;
    const weg = new Set([...liveStand.picks.eigen, ...liveStand.picks.gegner,
                         ...liveStand.bans.eigen, ...liveStand.bans.gegner,
                         ...(liveFearless ? fearlessVerbraucht() : [])].filter(Boolean));
    liste.textContent = "";
    liste.append(...CHAMPIONS.filter((c) => !weg.has(c))
      .map((c) => el("option", {value: c})));
  }

  function liveBoard() {
    const spalte = (seite) => {
      const name = seite === "eigen" ? team.team : (liveGegnerName() || "Gegner");
      return el("div", {class: "ld-seite " + seite},
        el("div", {class: "ld-seite-kopf"},
          el("span", {class: "ld-seite-name"}, name),
          liveBesetzungZurueck(seite),
          el("span", {class: "ld-seite-wort"}, seite === "eigen" ? "wir" : "Gegner")),
        el("div", {class: "ld-bans"},
          el("span", {class: "ld-bans-wort"}, "Bans"),
          el("div", {class: "ld-bans-felder"},
            [0, 1, 2, 3, 4].map((i) => liveFeld(seite, "bans", i, null))),
          el("span", {class: "ld-ban-hinweis", role: "status", "aria-live": "polite"})),
        el("div", {class: "ld-picks"}, ROLES.map(([wert, wort], i) =>
          el("div", {class: "ld-pickzeile"},
            el("span", {class: "ld-rolle"}, wort),
            liveFeld(seite, "picks", i, null),
            // Auch bei uns waehlbar: ein Substitute bringt seinen Pool mit.
            liveWahl(seite, i)))));
    };
    return el("div", {class: "ld-board"}, spalte("eigen"), spalte("gegner"));
  }

  function liveFilterLeiste() {
    const rollen = el("div", {class: "ld-rollen", role: "tablist"},
      ROLES.map(([, wort], i) => {
        const k = el("button", {class: "ld-rolle-knopf" + (liveAktiv.rolle === i ? " an" : ""),
                                type: "button"}, wort);
        k.addEventListener("click", () => {
          if (liveAktiv.rolle !== i) liveSucheLeeren();
          liveAktiv = {seite: "eigen", rolle: i};
          renderLiveDraft();
        });
        return k;
      }));
    const arten = [["alle", "Alle"], ["blind", "Blind pickbar"],
                   ["pool", "Dein Pool"],
                   ["alternativen", "Alternativen"], ["selten", "Selten gespielt"],
                   ["gesperrt", "Gesperrt"]];
    const kategorien = el("div", {class: "ld-kategorien"}, arten.map(([wert, wort]) => {
      const k = el("button", {class: "ld-kat" + (liveFilter === wert ? " an" : ""),
                              type: "button"}, wort);
      k.addEventListener("click", () => { liveFilter = wert; renderLiveDraft(); });
      return k;
    }));
    const suche = el("input", {type: "search", class: "ld-suche",
      placeholder: "Champion suchen \u2026", "aria-label": "Champion suchen"});
    suche.value = liveSuche;
    suche.addEventListener("input", () => {
      liveSuche = suche.value.trim().toLowerCase();
      liveListeZeichnen();
    });
    return el("div", {class: "ld-filter"}, rollen, kategorien, suche);
  }

  // Nur Sperrleiste und Liste - das Board bleibt stehen.
  function liveAktualisieren() {
    const knoepfe = document.querySelectorAll("#live-draft .ld-rolle-knopf");
    knoepfe.forEach((k, i) => k.classList.toggle("an", i === liveAktiv.rolle));
    // Der Kopf wird beim Tippen nicht neu gebaut - der Merken-Knopf muss
    // seinen Zustand trotzdem mitbekommen, sonst bleibt er ewig grau.
    const merken = document.querySelector("#live-draft .ld-merken");
    if (merken) {
      merken.disabled = ![...liveStand.picks.eigen, ...liveStand.picks.gegner]
        .some(Boolean);
    }
    liveBanListeZeichnen();
    liveLageZeichnen();
    liveCompZeichnen();
    liveSperrleiste();
    liveListeZeichnen();
    liveProtokollZeichnen();
  }

  /* ---------------------------------------------------- Lagebild */
  /* Ueber dem Draft, nicht ueber einem Kandidaten: was fehlt uns, was
     droht, wie gewinnen wir, welche Rolle jetzt. Jede Zeile sagt, woher
     sie kommt - gemessen oder eingeschaetzt. */
  const liveLageCache = new Map();
  function liveLage() {
    if (!liveTeile) return null;
    const z = liveZustand();
    const k = ENGINE.schluessel(z, "lagebild|" + (liveGegner || "") + "|" + team.team);
    if (!liveLageCache.has(k)) {
      if (liveLageCache.size > 40) liveLageCache.clear();
      liveLageCache.set(k, liveTeile.strategie.lagebild(z, {
        spielerFuer: (rolleName) => {
          const sp = liveSpielerVon("eigen", ROLES.findIndex(([w]) => w === rolleName));
          return sp ? {team: sp.team, label: sp.label} : null;
        },
      }));
    }
    return liveLageCache.get(k);
  }

  function liveLageZeichnen() {
    const host = document.querySelector("#live-draft .ld-lage");
    if (!host) return;
    host.textContent = "";
    const L = liveLage();
    if (!L) { host.hidden = true; return; }
    host.hidden = false;

    const herkunft = (q, vorschlag) => {
      const gem = /draftgap/.test(q || ""), heur = /heuristik/.test(q || "");
      const wort = gem && heur ? "gemessen + Einsch\u00e4tzung"
        : gem ? "gemessen" : "Einsch\u00e4tzung" + (vorschlag ? ", ungepr\u00fcft" : "");
      return el("span", {class: "ld-herkunft" + (heur ? " geschaetzt" : ""),
                         title: gem && !heur ? "aus DraftGap-Daten berechnet"
                           : "aus der Heuristiktabelle - keine Messung"
                             + (vorschlag ? "; enth\u00e4lt die ungepr\u00fcfte Ersteinsch\u00e4tzung" : "")},
        wort);
    };
    const vorschlagU = L.abdeckung.unser.vorschlag > 0;
    const vorschlagI = L.abdeckung.ihr.vorschlag > 0;
    const zeile = (wort, inhalt, nebensatz, quelle, vorschlag) =>
      el("div", {class: "ld-lage-zeile"},
        el("span", {class: "ld-lage-wort"}, wort),
        el("span", {class: "ld-lage-wert"},
          inhalt ? el("b", {}, inhalt) : el("span", {class: "ld-lage-leer"}, "\u2014"),
          nebensatz ? el("span", {class: "ld-lage-grund"}, nebensatz) : null),
        quelle ? herkunft(quelle, vorschlag) : el("span"));

    const b = L.groessterBedarf, g = L.groessteGefahr, s = L.siegbedingung;
    const n = L.naechsteRolle, sp = L.spaeterRolle;
    const keinePicks = (seite) => seite.gesamt === 0 ? "ab dem ersten Pick"
      : seite.belegt === 0 ? "f\u00fcr diese Picks keine Einsch\u00e4tzung" : null;

    /* Ein Klick auf einen Bringer springt auf seine Rolle und filtert die
       Liste auf ihn - dort steht seine Karte mit allen Gruenden. */
    const bringerChip = (x, br) => {
      const src = iconUrl(br.champ);
      const rolleWort = ENGINE.ROLLEN_WORT[br.rolle] || br.rolle;
      const wie = x.achse === "magisch" || x.achse === "physisch"
        ? Math.round(br.stufe * 100) + " % " + (x.achse === "magisch" ? "magisch" : "physisch")
          + " (gemessen)"
        : br.stufe >= 1 ? "ausgepr\u00e4gt" : "teilweise";
      const k = el("button", {class: "ld-bringer-chip" + (br.pool ? " pool" : ""),
          type: "button",
          title: br.champ + " \u00b7 " + rolleWort + " \u00b7 " + wie
                 + (br.pool ? " \u00b7 im Pool von " + br.spieler : "")
                 + " \u2014 Klick zeigt die Karte"},
        src ? el("img", {src, alt: "", loading: "lazy"}) : null,
        el("b", {}, br.champ),
        el("i", {}, rolleWort),
        br.pool ? el("em", {}, "Pool") : null);
      k.addEventListener("click", () => {
        liveAktiv = {seite: "eigen", rolle: ROLES.findIndex(([w]) => w === br.rolle)};
        liveFilter = "alle";
        liveSuche = br.champ.toLowerCase();
        renderLiveDraft();
      });
      return k;
    };
    const bedarfBlock = (x, i) => el("div", {class: "ld-bedarf" + (i === 0 ? " erster" : "")},
      el("div", {class: "ld-bedarf-kopf"},
        el(i === 0 ? "b" : "span", {class: "ld-bedarf-wort"}, x.wort),
        el("span", {class: "ld-lage-grund"}, x.grund
          + " \u00b7 bisher: " + (x.bisher && x.bisher.length ? x.bisher.join(", ") : "niemand"))),
      x.bringer && x.bringer.length
        ? el("div", {class: "ld-bringer"},
            el("span", {class: "ld-bringer-wort"}, "bringen das mit"),
            x.bringer.map((br) => bringerChip(x, br)))
        : el("span", {class: "ld-lage-leer"},
             "kein verf\u00fcgbarer Champion auf unseren offenen Rollen"));
    /* Naechste Rolle: die Lane, warum jetzt - und der beste Pick dafuer
       mit seinem staerksten Grund. Ein Klick wechselt auf die Rolle. */
    const naechsteZeile = () => {
      if (!n) return zeile("N\u00e4chste Rolle", null, null, null, false);
      const idx = ROLES.findIndex(([w]) => w === n.rolle);
      const {liste: nl} = liveRangliste(idx, "eigen");
      const best = nl[0] || null;
      const src = best ? iconUrl(best.champion) : null;
      // Steht der Lanegegner, ist der Grund gegen IHN der wichtigste -
      // nicht der erste beste gegen irgendwen.
      const laneGegner = (ENGINE.LANE_GEGNER[n.rolle] || [])
        .map((r) => liveStand.picks.gegner[ROLES.findIndex(([w]) => w === r)])
        .filter(Boolean);
      const grund = !best ? null
        : best.reasons.find((t) => laneGegner.some((c) => t.includes(c)))
          || best.reasons[0] || best.risks[0] || null;
      // Die gemessene Lane-Paarung steht immer da, auch wenn sie unauffaellig
      // ist - bei einem Counterpick ist sie die erste Frage.
      const lanePaare = best && best.components.lane
        ? (best.components.lane.paare || []).filter((x) => laneGegner.includes(x.wer)) : [];
      const laneZeile = lanePaare.length
        ? "Lane: " + lanePaare.map((x) => "gegen " + x.wer + " " + dbQuote(x.quote)
            + " (sonst " + dbQuote(x.erwartet) + ")").join(" · ")
        : null;
      const knopf = el("button", {class: "ld-naechste-pick", type: "button",
          title: "Zur Rolle " + ROLES[idx][1] + " wechseln"},
        el("span", {class: "ld-bringer-wort"}, "bester Pick"),
        src ? el("img", {src, alt: "", loading: "lazy"}) : null,
        best ? el("b", {}, best.champion) : null,
        best ? el("span", {class: "ld-punkte"}, String(best.score)) : null,
        el("span", {class: "ld-naechste-pfeil"}, "\u2192 " + ROLES[idx][1]));
      knopf.addEventListener("click", () => {
        liveSucheLeeren();
        liveAktiv = {seite: "eigen", rolle: idx};
        renderLiveDraft();
      });
      return el("div", {class: "ld-lage-zeile"},
        el("span", {class: "ld-lage-wort"}, "N\u00e4chste Rolle"),
        el("div", {class: "ld-lage-wert ld-naechste"},
          el("div", {class: "ld-bedarf-kopf"},
            el("b", {class: "ld-bedarf-wort"}, n.wort),
            el("span", {class: "ld-lage-grund"}, n.text)),
          best ? knopf : null,
          laneZeile ? el("span", {class: "ld-lage-grund"}, laneZeile) : null,
          grund ? el("span", {class: "ld-lage-grund"}, "Warum " + best.champion
                     + ": " + grund) : null),
        herkunft("draftgap", false));
    };

    /* Wer traegt etwas? "Amumu, Leona (\u00fcber Frontline)". */
    const traegerText = (namen) => namen && namen.length ? namen.join(", ") : "niemand";
    const pct = (v) => v === null || v === undefined ? "\u2014" : String(Math.round(v * 100));

    /* Groesste Gefahr: bis zu drei, jede mit Traegern, unserer Antwort und
       wer die duennste Antwort mitbringen wuerde. */
    const gefahrBlock = (x, i) => {
      const kopf = el("div", {class: "ld-bedarf-kopf"},
        el(i === 0 ? "b" : "span", {class: "ld-bedarf-wort"}, x.wort),
        x.stufe !== null && x.stufe !== undefined
          ? el("span", {class: "ld-lage-grund"}, "St\u00e4rke " + pct(x.stufe)
               + (x.traeger && x.traeger.length ? " \u00b7 durch " + x.traeger.join(", ") : ""))
          : el("span", {class: "ld-lage-grund"}, x.grund || ""));
      if (!x.antworten) return el("div", {class: "ld-bedarf" + (i === 0 ? " erster" : "")}, kopf);
      const antwort = x.antworten.length
        ? el("span", {class: "ld-lage-grund"}, "unsere Antwort: " + x.antworten.map((a) =>
            a.wort + " " + pct(a.stufe) + ": " + traegerText(a.bisher)).join(" \u00b7 "))
        : el("span", {class: "ld-lage-leer"},
             "f\u00fcr " + x.wort + " ist keine Gegenachse hinterlegt");
      const bringer = x.antwortBringer && x.antwortBringer.length
        ? el("div", {class: "ld-bringer"},
            el("span", {class: "ld-bringer-wort"},
               ENGINE.ACHSEN_WORT[x.antwortAchse] + " bringen mit"),
            x.antwortBringer.map((br) => bringerChip({achse: x.antwortAchse}, br)))
        : null;
      return el("div", {class: "ld-bedarf" + (i === 0 ? " erster" : "")}, kopf, antwort, bringer);
    };
    const gefahrZeile = () => L.gefahr.length
      ? el("div", {class: "ld-lage-zeile"},
          el("span", {class: "ld-lage-wort"}, "Gr\u00f6\u00dfte Gefahr"),
          el("div", {class: "ld-lage-wert ld-bedarfe"}, L.gefahr.map(gefahrBlock)),
          herkunft([...new Set(L.gefahr.map((x) => x.quelle))].join(" "), vorschlagI))
      : zeile("Gr\u00f6\u00dfte Gefahr", null, keinePicks(L.abdeckung.ihr), null, false);

    /* Siegbedingung: wer sie traegt, wie man sie spielt, Phasen, was sie
       gefaehrdet, und die zweitbeste. */
    const PHASE_WORT = {frueh: "fr\u00fch", mittel: "Mitte", spaet: "sp\u00e4t"};
    const siegZeile = () => {
      if (!s) return zeile("Siegbedingung", null, "ab zwei eigenen Picks", null, false);
      const zeilen = [
        el("div", {class: "ld-bedarf-kopf"},
          el("b", {class: "ld-bedarf-wort"}, s.wort),
          s.phase ? el("span", {class: "ld-lage-grund"}, s.phase) : null),
        s.idee ? el("span", {class: "ld-lage-grund"}, "Spielidee: " + s.idee) : null,
        el("span", {class: "ld-lage-grund"}, "Getragen von: " + s.achsen.map((a) =>
          a.wort + " " + pct(a.stufe) + ": " + traegerText(a.traeger)).join(" \u00b7 ")),
        s.phasen ? el("span", {class: "ld-lage-grund"}, "Phasen (gemessen, wir minus sie): "
          + Object.entries(s.phasen).map(([ph, d]) => PHASE_WORT[ph] + " "
              + (d >= 0 ? "+" : "\u2212") + Math.abs(d * 100).toFixed(1).replace(".", ",")).join(" \u00b7 ")
          + " Punkte") : null,
        s.gefaehrdet.length
          ? el("span", {class: "ld-lage-grund ld-gefaehrdet"}, "Gef\u00e4hrdet durch: "
              + s.gefaehrdet.map((x) => "ihr " + x.wort + " " + pct(x.stufe) + " von "
                + traegerText(x.traeger) + " \u2013 gegen unseren " + x.gegen).join(" \u00b7 "))
          : el("span", {class: "ld-lage-grund"}, "Gef\u00e4hrdet durch: nichts Ausgepr\u00e4gtes auf ihrer Seite"),
        s.alternative ? el("span", {class: "ld-lage-grund"}, "Alternative: "
          + s.alternative.wort + " (" + pct(s.alternative.traegt) + ")") : null,
      ];
      return el("div", {class: "ld-lage-zeile"},
        el("span", {class: "ld-lage-wort"}, "Siegbedingung"),
        el("div", {class: "ld-lage-wert ld-naechste"}, zeilen),
        herkunft(s.quelle, vorschlagU));
    };

    const bedarfQuelle = [...new Set(L.bedarf.map((x) => x.quelle))].join(" ");
    const bedarfZeile = L.bedarf.length
      ? el("div", {class: "ld-lage-zeile"},
          el("span", {class: "ld-lage-wort"}, "Unser Bedarf"),
          el("div", {class: "ld-lage-wert ld-bedarfe"}, L.bedarf.map(bedarfBlock)),
          herkunft(bedarfQuelle, vorschlagU))
      : zeile("Unser Bedarf", null, keinePicks(L.abdeckung.unser), null, false);

    // .filter(Boolean): in Solo faellt "Naechste Rolle" weg, und
    // append(null) haengt sonst den TEXT "null" an.
    host.append(...[
      el("div", {class: "ld-lage-kopf"},
        el("span", {class: "ld-comp-wort"}, "Lagebild"),
        el("span", {class: "sub"}, "nach jedem Pick und Ban neu")),
      bedarfZeile,
      gefahrZeile(),
      siegZeile(),
      naechsteZeile(),
      zeile("Vermeiden", L.vermeiden.length
              ? L.vermeiden.map((v) => v.wort).join(" \u00b7 ") : null,
            L.vermeiden.length ? L.vermeiden.map((v) => v.grund).join(" \u00b7 ") : null,
            L.vermeiden.length ? L.vermeiden.map((v) => v.quelle).join(" ") : null,
            vorschlagU)].filter(Boolean));
  }

  /* ---------------------------------------------------- Protokoll */
  /* Was empfohlen und gepickt wurde, bleibt im Browser. Hier kommt das
     Ergebnis dazu - und der Weg, die Eintraege herauszubekommen. */
  function liveProtokollZeichnen() {
    const host = document.querySelector("#live-draft .ld-protokoll");
    if (!host || !liveTeile) return;
    host.textContent = "";
    const p = liveTeile.protokoll;
    const gesetzt = liveErgebnisse.get(liveDraftNr) || null;
    const knopf = (wort, wert) => {
      const k = el("button", {class: "ld-ergebnis" + (gesetzt === wert ? " an" : ""),
                              type: "button", "aria-pressed": String(gesetzt === wert)},
                   wort);
      k.addEventListener("click", () => {
        p.ergebnis(liveDraftNr, wert === "sieg");
        liveErgebnisse.set(liveDraftNr, wert);
        liveProtokollZeichnen();
      });
      return k;
    };
    const laden = el("button", {class: "ld-reset", type: "button"},
                     "Protokoll herunterladen");
    laden.addEventListener("click", () => {
      const blob = new Blob([p.alsJson()], {type: "application/json"});
      const a = el("a", {href: URL.createObjectURL(blob),
                         download: "draft-protokoll.json"});
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    });
    const a = p.auswertung();
    host.append(
      el("span", {class: "ld-comp-wort"}, "Protokoll"),
      el("span", {class: "sub"}, p.anzahl() + " Empfehlungen \u00b7 Draft " + liveDraftNr),
      el("span", {class: "ld-ergebnis-wort"}, "Ergebnis dieses Drafts:"),
      knopf("Sieg", "sieg"), knopf("Niederlage", "niederlage"),
      laden,
      el("span", {class: "sub ld-protokoll-stand"}, a.hinweis));
  }

  function liveCompZeichnen() {
    const host = document.querySelector("#live-draft .ld-comp");
    if (!host) return;
    host.textContent = "";
    const c = liveComp();
    if (!c || (!c.wir.length && !c.sie.length)) { host.hidden = true; return; }
    host.hidden = false;

    const balken = (profil) => {
      if (!profil || !profil.schaden) {
        return el("span", {class: "ld-comp-leer"}, "kein Schadensprofil");
      }
      const m = Math.round(profil.schaden.magisch.value * 100);
      return el("span", {class: "ld-mix"},
        el("span", {class: "ld-mix-balken", title: profil.schaden.magisch.note},
          el("i", {class: "magisch", style: "width:" + m + "%"})),
        el("span", {class: "ld-mix-wort"},
           m + " % magisch \u00b7 " + (100 - m) + " % physisch"));
    };

    const zeile = (seite, wort, picks, profil) =>
      el("div", {class: "ld-comp-zeile " + seite},
        el("span", {class: "ld-comp-name"}, wort),
        el("span", {class: "ld-comp-zahl"}, picks.length + "/5"),
        balken(profil));

    /* Der Massstab kommt aus dem Patch, nicht aus unseren Ligapartien:
       2.000 Aufstellungen, gezogen nach der gemessenen Spielhaeufigkeit.
       Eingeordnet wird erst bei fuenf gegen fuenf - mit weniger Picks
       schwankt die Quote viel staerker, der Vergleich waere schief. */
    const ref = liveTeile.suche.compReferenzGlobal();
    const voll = c.wir.length === 5 && c.sie.length === 5;
    const perz = voll ? liveTeile.suche.compPerzentil(c.quote, ref) : null;

    const kopf = el("div", {class: "ld-comp-kopf"},
      el("span", {class: "ld-comp-wort"}, "Aufstellungen"));
    if (c.quote !== null && c.quote !== undefined) {
      kopf.append(
        el("span", {class: "ld-comp-quote " + (perz === null ? ""
             : perz >= 0.8 ? "gut" : perz <= 0.2 ? "schwach" : ""),
           title: "Nach Partien gewichteter Schnitt \u00fcber die gemessenen "
                  + "Paarungen beider Aufstellungen"},
          el("b", {}, dbQuote(c.quote)), " f\u00fcr " + team.team),
        el("span", {class: "sub"}, perz !== null
          ? "besser als " + Math.round(perz * 100) + " % von "
            + GANZZAHL.format(ref.n) + " Aufstellungen im Patch"
          : "Einordnung ab f\u00fcnf gegen f\u00fcnf"));
    } else {
      kopf.append(el("span", {class: "sub"},
        "Quote erst, wenn auf beiden Seiten etwas steht"));
    }
    if (c.phasen) {
      kopf.append(el("span", {class: "sub"}, "stark: "
        + {frueh: "fr\u00fch", mittel: "mittel", spaet: "sp\u00e4t"}[c.phasen.stark]));
    }

    host.append(kopf,
      zeile("eigen", team.team, c.wir, c.unser),
      zeile("gegner", liveGegnerName() || "Gegner", c.sie, c.ihr));
    const profil = liveProfil();
    if (profil) host.append(profil);
    if (c.quote !== null && c.quote !== undefined) host.append(liveQuoteErklaerung(ref));
  }

  /* Das Achsenprofil beider Aufstellungen: wie viel Engage, Peel, Catch,
     Poke ... und wer es traegt. Einschaetzung, keine Messung. */
  const liveProfilOffen = {wert: true};
  function liveProfil() {
    const L = liveLage();
    if (!L || !L.profil) return null;
    const {unser, ihr} = L.profil;
    if (!unser.belegt && !ihr.belegt) return null;
    const zelle = (seite, x, belegt) => {
      if (!belegt) return el("span", {class: "ld-pf-zelle leer"}, "\u2014");
      const v = Math.round((x.stufe || 0) * 100);
      const wer = x.traeger.map((t) => t.champ + (t.ueber
        ? " (\u00fcber " + (ENGINE.ACHSEN_WORT[t.ueber] || t.ueber) + ")" : "")).join(", ");
      return el("span", {class: "ld-pf-zelle " + seite, title: x.wort + " " + v
                          + (wer ? " \u2014 " + wer : " \u2014 niemand")},
        el("span", {class: "ld-pf-balken"}, el("i", {style: "width:" + v + "%"})),
        el("b", {}, String(v)),
        el("span", {class: "ld-pf-wer"}, wer || "\u2014"));
    };
    const zeilen = Object.values(unser.achsen).map((x) => [
      el("span", {class: "ld-pf-wort"}, x.wort),
      zelle("eigen", x, unser.belegt),
      zelle("gegner", ihr.achsen[x.achse], ihr.belegt)]).flat();
    const vorschlag = unser.vorschlag || ihr.vorschlag;
    const d = el("details", {class: "ld-profil"},
      el("summary", {}, "Achsenprofil",
        el("span", {class: "ld-herkunft geschaetzt"},
           "Einsch\u00e4tzung" + (vorschlag ? ", ungepr\u00fcft" : ""))),
      el("div", {class: "ld-pf-raster"},
        el("span", {}),
        el("span", {class: "ld-pf-kopf eigen"}, team.team),
        el("span", {class: "ld-pf-kopf gegner"}, liveGegnerName() || "Gegner"),
        zeilen),
      el("p", {class: "sub"}, "100 = die Achse ist gedeckt (ges\u00e4ttigt). "
        + "Frontline tr\u00e4gt Peel zur H\u00e4lfte mit. Schaden und Spieldauer "
        + "stehen oben und sind gemessen."));
    d.open = liveProfilOffen.wert;
    d.addEventListener("toggle", () => { liveProfilOffen.wert = d.open; });
    return d;
  }

  /* Wie die Quote entsteht: jede Paarung einzeln, Lane umrandet. Die Zahl
     liegt fast immer nahe 50 % - das soll man nicht glauben muessen,
     sondern sehen. */
  const liveQuoteOffen = {wert: false};
  function liveQuoteErklaerung(ref) {
    const z = liveZustand();
    const x = liveTeile.suche.compAufschluesselung(z);
    const wir = z.picks[z.wirSind];
    const sie = z.picks[z.wirSind === "blue" ? "red" : "blue"];
    const pz = (v) => dbQuote(v).replace(" %", "");
    const zelle = (p) => {
      if (!p) return el("span", {class: "ld-mx-zelle leer"}, "");
      if (p.quote === null) {
        return el("span", {class: "ld-mx-zelle ohne" + (p.lane ? " lane" : ""),
                           title: p.wir + " gegen " + p.sie + ": keine Daten"}, "\u2014");
      }
      const d = p.quote - 0.5;
      return el("span", {class: "ld-mx-zelle" + (p.lane ? " lane" : "")
                          + (d >= 0.015 ? " gut" : d <= -0.015 ? " schwach" : ""),
          title: p.wir + " (" + ENGINE.ROLLEN_WORT[p.wirRolle] + ") gegen " + p.sie
                 + " (" + ENGINE.ROLLEN_WORT[p.sieRolle] + "): " + dbQuote(p.quote)
                 + " aus " + tausend(p.spiele) + " Partien"
                 + (p.lane ? " \u00b7 Lane" : "")},
        pz(p.quote));
    };
    const kopfZelle = (p) => {
      const src = iconUrl(p.champ);
      return el("span", {class: "ld-mx-kopf", title: p.champ},
        src ? el("img", {src, alt: "", loading: "lazy"}) : null,
        el("span", {}, p.champ));
    };
    const matrix = el("div", {class: "ld-matrix",
        style: "grid-template-columns: minmax(5.5rem, 8rem) repeat(" + sie.length
               + ", minmax(2.8rem, 1fr))"},
      el("span", {class: "ld-mx-ecke"}, "wir \u2193 \u00b7 sie \u2192"),
      sie.map(kopfZelle),
      wir.map((a) => [kopfZelle(a), sie.map((b) =>
        zelle(x.paare.find((p) => p.wir === a.champ && p.sie === b.champ)))]).flat(2));

    const teil = (wort, t) => t ? wort + " " + dbQuote(t.quote) + " ("
      + Math.round(t.anteil * 100) + " % des Gewichts)" : null;
    const details = el("details", {class: "ld-quote-erklaerung"},
      el("summary", {}, "Wie entsteht diese Quote?"),
      el("p", {},
        "Sie ist der nach Partien gewichtete Schnitt aller " + x.mitDaten
        + " gemessenen Paarungen zwischen beiden Aufstellungen \u2014 auch quer "
        + "\u00fcber die Karte, etwa euer Top gegen ihren Support. Eine einzelne "
        + "Paarung liegt meist zwischen " + pz(ref.paarP5) + " und " + pz(ref.paarP95)
        + " %; im Schnitt \u00fcber alle gleichen sich St\u00e4rken und Schw\u00e4chen "
        + "weitgehend aus. Darum liegt die Quote fast immer nahe 50 %: bei "
        + GANZZAHL.format(ref.n) + " Aufstellungen, gezogen nach der Spielh\u00e4ufigkeit "
        + "im Patch, in 90 % der F\u00e4lle zwischen " + pz(ref.p5) + " und "
        + pz(ref.p95) + " %. Aussagekr\u00e4ftig ist deshalb die Einordnung, "
        + "nicht der Abstand zu 50."),
      el("p", {class: "sub"}, [teil("Lane-Paarungen (umrandet):", x.lane),
                                teil("\u00fcbrige Paarungen:", x.rest)]
        .filter(Boolean).join(" \u00b7 ")),
      el("div", {class: "ld-matrix-huelle"}, matrix));
    // Offen bleibt offen, wenn sich die Lage aendert.
    details.open = liveQuoteOffen.wert;
    details.addEventListener("toggle", () => { liveQuoteOffen.wert = details.open; });
    return details;
  }

  function liveSperrleiste() {
    const host = document.querySelector("#live-draft .ld-sperren");
    if (!host) return;
    host.textContent = "";
    const gesperrt = liveGesperrt();
    if (!gesperrt.size) { host.hidden = true; return; }
    host.hidden = false;
    // Keine Emoji: sie sehen auf jedem System anders aus und passen nicht
    // zu den uebrigen Marken des Boards, die gezeichnet sind.
    const gruppen = [["fearless", "Fearless gesperrt"],
                     ["ban", "Gebannt"], ["pick", "Schon gepickt"]];
    for (const [art, wort] of gruppen) {
      const liste = [...gesperrt.entries()].filter(([, v]) => v.art === art);
      if (!liste.length) continue;
      host.append(el("div", {class: "ld-sperr-gruppe ld-" + art},
        el("span", {class: "ld-sperr-wort"}, wort + " (" + liste.length + ")"),
        el("div", {class: "ld-sperr-liste"}, liste.map(([champ, v]) => {
          const src = iconUrl(champ);
          return el("span", {class: "ld-sperr ld-" + art,
                             title: champ + " \u2014 " + v.text},
            src ? el("img", {src, alt: "", loading: "lazy"}) : null,
            el("span", {}, champ));
        }))));
    }
  }

  function liveListeZeichnen() {
    const host = document.querySelector("#live-draft .ld-liste");
    if (!host) return;
    host.textContent = "";
    if (!liveTeile) {
      host.append(el("p", {class: "hint"},
        "Keine Draftdaten eingebettet \u2014 build.py konnte die Datens\u00e4tze "
        + "nicht laden."));
      return;
    }
    const rolle = liveAktiv.rolle;
    const spieler = liveSpielerAktiv(rolle);
    const gesperrt = liveGesperrt();

    if (liveFilter === "gesperrt") {
      host.append(el("p", {class: "hint"}, gesperrt.size
        ? "Alle " + gesperrt.size + " Champions, die in diesem Draft nicht "
          + "mehr gehen \u2014 mit Grund."
        : "Noch nichts gebannt, gepickt oder durch Fearless gesperrt."));
      host.append(el("div", {class: "ld-karten"},
        [...gesperrt.entries()].map(([champ, v]) => liveKarteGesperrt(champ, v))));
      return;
    }

    /* Aus dem Draftplan, nicht aus dem Komforttext: der Plan kann im
       Browser eingetragen sein und noch in keiner Datei stehen. */
    const blindbar = new Set(spieler ? planOf(spieler).blind : []);

    /* SICHER kommt aus den Blindszenarien dieser Lage (Bans und Picks
       eingerechnet), PRIO aus der gemessenen Spielhaeufigkeit auf der
       Rolle. Beides haengt nicht am Spieler und gilt auch auf dem
       Gegnerslot. */
    const B = ENGINE.BLIND;
    const sicher = (r) => r.blindDetail && r.blindDetail.wert >= B.sicherAb
      ? r.blindDetail : null;
    const prio = (r) => {
      const p = liveTeile.bewerter.blindModell.prio(r.champion, ROLES[rolle][0]);
      return p && p.prio ? p : null;
    };

    const {liste, kategorien, ms, ausCache} = liveRangliste(rolle);
    const gefiltert = (liveSuche
        ? liste.filter((r) => r.champion.toLowerCase().includes(liveSuche))
        : liste)
      .map((r) => ({r, kat: liveKategorie(r, spieler),
                    blind: blindbar.has(r.champion),
                    sicher: sicher(r), prio: prio(r)}))
      .filter((x) => liveFilter === "alle" ? true
                   // Der Filter meint die Frage "was kann ich frueh
                   // setzen" - beide Begruendungen zaehlen, die Marken
                   // auf der Karte sagen welche.
                   : liveFilter === "blind" ? (x.blind || x.sicher)
                   : x.kat === liveFilter);

    if (liveSuche) {
      const leeren = el("button", {class: "ld-reset", type: "button"}, "Suche leeren");
      leeren.addEventListener("click", () => { liveSucheLeeren(); liveListeZeichnen(); });
      host.append(el("p", {class: "ld-suchhinweis" + (gefiltert.length ? "" : " leer"),
                           role: "status"},
        gefiltert.length
          ? "Suche \u201e" + liveSuche + "\u201c filtert die Liste \u2014 die "
            + "Empfehlung oben erscheint wieder ohne Suche. "
          : "Keine Treffer f\u00fcr \u201e" + liveSuche + "\u201c auf "
            + ROLES[rolle][1] + ". ",
        leeren));
    }

    // Der Modus der Rolle: steht der Lanegegner schon?
    const erster = liste[0];
    if (erster && erster.lage) host.append(liveModus(erster.lage, erster));

    host.append(el("p", {class: "hint"},
      (liveAktiv.seite === "eigen" ? "" : "Gegnerslot \u00b7 ")
      + (spieler ? spieler.label + " \u00b7 " : "")
      + gefiltert.length + " w\u00e4hlbar auf " + ROLES[rolle][1]
      + (gesperrt.size ? " \u00b7 " + gesperrt.size + " gesperrt" : "")
      + " \u00b7 sortiert nach Entscheidungswert"
      + " \u00b7 " + Math.round(ms) + " ms" + (ausCache ? " (gemerkt)" : "")));

    /* Der Backtest ueber 68 Partien kann nicht zeigen, dass das Modell
       den Muenzwurf schlaegt. Das gehoert an die Empfehlung, nicht ins
       Kleingedruckte. */
    host.append(el("p", {class: "hint ld-warnung"},
      "Entscheidungshilfe, keine Prognose: im Backtest \u00fcber 68 Partien "
      + "l\u00e4sst sich nicht zeigen, dass das Modell besser trifft als ein "
      + "M\u00fcnzwurf. Die Begr\u00fcndungen unter jeder Karte sind gemessen \u2014 "
      + "die Rangfolge ist ein Vorschlag."));

    if (liveFilter === "alle" && !liveSuche && gefiltert.length) {
      host.append(liveJetzt(gefiltert[0]));
      if (kategorien && kategorien.length > 1) host.append(liveTop5(kategorien));
    }

    if (liveFilter === "alle" && gefiltert.length) {
      host.append(liveAbschnitt("Beste Treffer", gefiltert.slice(0, 6), true));
      /* Auf einem Gegnerslot ist es nicht "dein" Pool, sondern der des
         gegnerischen Spielers - und ohne gescoutete Mannschaft gibt es
         gar keinen. */
      const poolWort = liveAktiv.seite === "eigen" ? "Dein Pool"
        : spieler ? spieler.label + " spielt oft" : "Viel gespielt";
      for (const [art, wort, deckel] of [["pool", poolWort, 0],
                                         ["alternativen", "Alternativen", 0],
                                         ["selten", "Selten gespielt", 24]]) {
        const teil = gefiltert.filter((x) => x.kat === art);
        if (!teil.length) continue;
        host.append(liveAbschnitt(wort, deckel ? teil.slice(0, deckel) : teil,
                                  false, teil.length));
      }
    } else {
      host.append(liveAbschnitt(null, gefiltert, false));
    }
  }

  function liveAbschnitt(titel, eintraege, hervor, gesamt) {
    const zahl = gesamt && gesamt > eintraege.length
      ? eintraege.length + " von " + gesamt : String(eintraege.length);
    return el("div", {class: "ld-abschnitt"},
      titel ? el("h3", {class: "ld-abschnitt-wort"}, titel,
                 el("span", {class: "sub"}, " " + zahl)) : null,
      el("div", {class: "ld-karten"},
         eintraege.map((x) => liveKarte(x.r, x.kat, hervor, x.blind,
                                        x.sicher, x.prio))));
  }

  /* ------------------------------------------------- Modus der Rolle */
  function liveModus(lage, r) {
    const wort = {blind: "Blind Pick", teilweise: "Teilweise Info",
                  counter: "Counter Pick"}[lage.modus] || lage.modus;
    const d = r.blindDetail;
    const zusatz = lage.modus === "counter"
      ? "Die gemessene Lane-Paarung tr\u00e4gt das volle Lane-Gewicht, Blindszenarien entfallen."
      : lage.modus === "blind"
        ? "Bewertet \u00fcber die wahrscheinlichen Lanegegner"
          + (d ? " (" + d.szenarien + " Szenarien"
                 + (d.poolWort && d.poolWort.length ? ", gewichtet mit " + d.poolWort.join(", ") : "")
                 + ")" : "") + "."
        : "Der offene Teil der Lane z\u00e4hlt zu "
          + Math.round(lage.unbekannt * 100) + " % \u00fcber Szenarien.";
    const L = liveAktiv.seite === "eigen" ? liveLage() : null;
    const warten = L && L.spaeterRolle && L.spaeterRolle.rolle === ROLES[liveAktiv.rolle][0]
      ? L.spaeterRolle : null;
    // Pickt der Gegner vor unserem letzten Pick nicht mehr, zeigt Warten
    // nichts - das sagen, statt still keine Empfehlung zu geben (P2.10).
    const keinWarten = L && lage.modus !== "counter" && L.pickfolge
      && L.pickfolge.unsereOffen > 1 && L.pickfolge.gegnerVorUnseremLetzten === 0;
    return el("div", {class: "ld-modus " + lage.modus},
      el("span", {class: "ld-modus-marke"}, wort),
      el("span", {class: "ld-modus-text"}, lage.text),
      el("span", {class: "sub"}, zusatz),
      warten ? el("span", {class: "ld-modus-warten"},
        "Lagebild: " + warten.wort + " lieber sp\u00e4ter \u2013 " + warten.text) : null,
      keinWarten ? el("span", {class: "ld-modus-warten"},
        "Der Gegner pickt erst nach eurem letzten Pick \u2013 Warten bringt hier keinen Counterpick.")
        : null);
  }

  /* --------------------------------------------- Jetzt picken */
  /* Die eine Empfehlung, gross: Final, die vier Gruppen, warum, Risiko,
     und was danach wahrscheinlich kommt. Die Gruppen sind keine eigene
     Rechnung - sie fassen die Teile der Bewertung zusammen. */
  function liveJetzt(x) {
    const r = x.r;
    const src = iconUrl(r.champion);
    const g = ENGINE.teilGruppen(r);
    const A = ENGINE.ANZEIGE;
    const stufe = r.score >= A.gruenAb ? "sehrgut" : r.score >= A.orangeAb ? "gut" : "normal";
    const zahl = (wort, wert, titel) => el("div", {class: "ld-gruppe", title: titel},
      el("span", {class: "ld-gruppe-wort"}, wort),
      el("b", {class: wert === null ? "leer" : ""}, wert === null ? "\u2014" : String(wert)));
    const knopf = el("button", {class: "ld-picken ld-picken-gross", type: "button"},
                     r.champion + " picken");
    knopf.addEventListener("click", () => livePicken(r.champion));

    const aeste = r.lookahead && r.lookahead.aeste
      ? r.lookahead.aeste.slice().sort((a, b) => b.p - a.p).slice(0, 3) : [];
    // Bleibt unsere beste Erwiderung in jedem Ast dieselbe, steht sie
    // einmal darunter - dreimal "dann Jinx" liest sich wie ein Fehler.
    const erwiderungen = new Set(aeste.map((a) => a.erwiderung).filter(Boolean));
    const eineErwiderung = aeste.length > 1 && erwiderungen.size === 1
      ? [...erwiderungen][0] : null;
    const k = Number.isFinite(r.confidence) ? Math.round(r.confidence * 100) : null;
    const geschrumpft = Number.isFinite(r.entscheidung)
      && Math.abs(r.entscheidung - r.score) >= 1;

    return el("section", {class: "ld-jetzt " + stufe, "aria-label": "Empfehlung"},
      el("div", {class: "ld-jetzt-kopf"},
        el("span", {class: "ld-jetzt-wort"}, "Jetzt picken \u00b7 " + ROLES[liveAktiv.rolle][1]),
        x.blind ? el("span", {class: "ld-blind-chip", title: "Draftplan: blind pickbar"}, "blind") : null,
        x.sicher ? el("span", {class: "ld-sicher-chip",
          title: "Blindsicher \u00fcber die Szenarien: " + x.sicher.text}, "sicher") : null,
        x.prio ? el("span", {class: "ld-prio-chip",
          title: "Prio: Platz " + x.prio.rang + " der meistgespielten auf der Rolle"}, "prio") : null),
      el("div", {class: "ld-jetzt-haupt"},
        src ? el("img", {class: "ld-jetzt-bild", src, alt: "", loading: "lazy"}) : null,
        el("div", {class: "ld-jetzt-name"},
          el("b", {}, r.champion),
          el("span", {class: "sub"},
            (k !== null ? "Konfidenz " + k + " % (" + r.confidenceWort + ")" : "Konfidenz unbekannt")
            + (geschrumpft ? " \u00b7 Entscheidungswert " + Math.round(r.entscheidung) : ""))),
        el("div", {class: "ld-jetzt-final", title: "Final: die Note aus allen Teilen"},
          el("span", {class: "ld-gruppe-wort"}, "Final"),
          el("b", {class: "ld-punkte " + stufe}, String(r.score)))),
      el("div", {class: "ld-gruppen"},
        zahl("DraftGap", g.draftgap, "Patchst\u00e4rke, Matchups, Synergien - gemessen"),
        zahl("Team-Fit", g.team, "Comp-Marginalwert, St\u00f6rung, Flex, Vorschau"),
        zahl("Spieler-Fit", g.spieler, "Komfort des Spielers - Ranked und Draftplan"),
        zahl("Blind-Sicherheit", g.blind,
             g.blind === null ? "Lanegegner steht - keine Blindszenarien"
                              : "\u00fcber die wahrscheinlichen Lanegegner")),
      el("div", {class: "ld-jetzt-teile"},
        r.reasons.length ? el("div", {class: "ld-jetzt-block"},
          el("span", {class: "ld-jetzt-titel plus"}, "Warum"),
          el("ul", {}, r.reasons.slice(0, 3).map((t) => el("li", {}, t)))) : null,
        r.risks.length ? el("div", {class: "ld-jetzt-block"},
          el("span", {class: "ld-jetzt-titel minus"}, "Risiko"),
          el("ul", {}, r.risks.slice(0, 3).map((t) => el("li", {}, t)))) : null,
        aeste.length ? el("div", {class: "ld-jetzt-block"},
          el("span", {class: "ld-jetzt-titel"}, "Wenn wir das picken"),
          el("ul", {}, aeste.map((a) => el("li", {},
            el("b", {}, a.antwort), " (" + (ENGINE.ROLLEN_WORT[a.rolle] || a.rolle) + ") "
            + Math.round(a.p * 100) + " % wahrscheinlich",
            !eineErwiderung && a.erwiderung ? " \u2192 dann " : "",
            !eineErwiderung && a.erwiderung ? el("b", {}, a.erwiderung) : null))),
          eineErwiderung ? el("span", {class: "ld-jetzt-danach"},
            "Unser bester n\u00e4chster Pick in jedem Fall: ",
            el("b", {}, eineErwiderung)) : null) : null),
      knopf);
  }


  /* ---------------------------------------------------------- Top 5 */
  function liveTop5(kategorien) {
    return el("div", {class: "ld-top5"}, kategorien.map((k, i) => {
      const r = k.r;
      const src = iconUrl(r.champion);
      const knopf = el("button", {class: "ld-picken", type: "button",
                                  "aria-label": r.champion + " picken"}, "Picken");
      knopf.addEventListener("click", () => livePicken(r.champion));
      return el("div", {class: "ld-top5-kachel" + (i === 0 ? " erste" : "")},
        el("span", {class: "ld-top5-wort"}, "#" + (i + 1) + " " + k.wort),
        el("div", {class: "ld-top5-kopf"},
          src ? el("img", {class: "ld-bild", src, alt: "", loading: "lazy"}) : null,
          el("b", {class: "ld-karte-name"}, r.champion),
          el("span", {class: "ld-punkte"}, String(r.score))),
        el("span", {class: "ld-top5-grund"}, k.grund),
        knopf);
    }));
  }

  /* Die Karte zeigt die Spur, die die Engine mitliefert: jeder Teil mit
     seinem Beitrag, dazu Konfidenz und - wo gerechnet - Robustheit. */
  function liveKarte(r, kategorie, hervor, blind, sicher, prio) {
    const src = iconUrl(r.champion);
    const A = ENGINE.ANZEIGE;
    const stufe = r.score >= A.gruenAb ? "sehrgut"
                : r.score >= A.orangeAb ? "gut" : "normal";
    const sterne = A.sterne.filter((x) => r.score >= x).length + 1;
    const knopf = el("button", {class: "ld-picken", type: "button"}, "Picken");
    knopf.addEventListener("click", () => livePicken(r.champion));

    const k = r.components.komfort;
    return el("div", {class: "ld-karte " + stufe + (hervor ? " hervor" : "")
                             + (blind ? " ld-blind" : "")
                             + (sicher ? " ld-sicher" : ""),
                      "data-kat": kategorie},
      el("div", {class: "ld-karte-kopf"},
        src ? el("img", {class: "ld-bild", src, alt: "", loading: "lazy"}) : null,
        el("span", {class: "ld-karte-name"}, r.champion),
        // Sortiert wird nach dem Entscheidungswert: die Note, bei duennen
        // Daten zur Mitte gezogen. Weicht er ab, steht er daneben - sonst
        // wirkte eine 61 ueber einer 64 wie ein Fehler.
        Number.isFinite(r.entscheidung) && Math.abs(r.entscheidung - r.score) >= 1
          ? el("span", {class: "ld-entscheidung",
                        title: "Entscheidungswert " + Math.round(r.entscheidung)
                               + " - danach ist sortiert: die Note, bei unsicheren "
                               + "Daten zur Mitte gezogen"},
               "\u2192 " + Math.round(r.entscheidung))
          : null,
        el("span", {class: "ld-punkte " + stufe,
                    title: "Note" + (Number.isFinite(r.entscheidung)
                      ? " \u00b7 Entscheidungswert " + Math.round(r.entscheidung) : "")},
           r.score)),
      /* Die Marken in einer eigenen Zeile: mit drei davon (Plan, Szenarien,
         Prio) reichte der Kopf einer 216px-Karte nicht mehr, und der Name
         wurde abgeschnitten. */
      (blind || sicher || prio) ? el("div", {class: "ld-marken"},
        blind ? el("span", {class: "ld-blind-chip",
                            title: "Draftplan: blind pickbar"}, "blind") : null,
        sicher ? el("span", {class: "ld-sicher-chip",
                             title: "Blindsicher \u00fcber die Szenarien: "
                                    + sicher.text}, "sicher") : null,
        prio ? el("span", {class: "ld-prio-chip",
                           title: "Prio: Platz " + prio.rang + " der meistgespielten "
                                  + "auf der Rolle (" + Math.round(prio.anteil * 1000) / 10
                                  + " % der Partien)"}, "prio") : null) : null,
      el("div", {class: "ld-karte-zeile"},
        el("span", {class: "ld-sterne", "aria-label": sterne + " von 5"},
           "\u2605".repeat(sterne) + "\u2606".repeat(5 - sterne)),
        el("span", {class: "ld-karte-zahlen"},
           k ? k.text : "kein Komfortbeleg"),
        el("span", {class: "ld-konfidenz " + r.confidenceWort,
                    title: "Konfidenz " + (r.confidence ?? "?")},
           r.confidenceWort)),
      r.lookahead ? el("div", {class: "ld-vorschau"},
        el("span", {class: "ld-vorschau-wort"}, "Vorausschau"),
        el("span", {}, r.lookahead.text),
        el("span", {class: "ld-robust " + r.lookahead.robustheit},
           "robust: " + r.lookahead.robustheit)) : null,
      livePaarungen(r),
      liveSpur(r),
      r.reasons.length ? el("ul", {class: "ld-gruende"},
        r.reasons.slice(0, 3).map((g) => el("li", {class: "ld-grund plus"}, g)))
        : null,
      r.risks.length ? el("ul", {class: "ld-gruende"},
        r.risks.slice(0, 2).map((g) => el("li", {class: "ld-grund minus"}, g)))
        : null,
      knopf);
  }

  /* Jede eingetragene Paarung einzeln - nicht nur die auffaelligen.
     Vorher nannte die Karte nur, was mehr als zwei Punkte von der
     Erwartung abwich; Wukong gegen Jarvan lag bei +1,9 und fehlte
     darum, obwohl er mitgerechnet wurde. "Nicht gezaehlt" sah damit
     genauso aus wie "unauffaellig". Jetzt steht jede Paarung da, und
     eine ohne Daten sagt das auch. */
  function livePaarungen(r) {
    const reihe = (wort, teil, klasse) => {
      if (!teil || (!teil.paare && !teil.ohneDaten)) return null;
      const chips = (teil.paare || []).map((t) => {
        const d = t.quote - t.erwartet;
        const ton = d >= 0.015 ? "gut" : d <= -0.015 ? "schwach" : "neutral";
        const src = iconUrl(t.wer);
        return el("span", {class: "ld-paar " + ton,
            title: t.wer + ": " + dbQuote(t.quote) + ", sonst "
                   + dbQuote(t.erwartet) + " · "
                   + tausend(t.spiele) + " Partien"},
          src ? el("img", {src, alt: "", loading: "lazy"}) : null,
          el("b", {}, dbQuote(t.quote).replace(" %", "")),
          el("i", {}, (d >= 0 ? "+" : "") + (d * 100).toFixed(1)));
      });
      for (const wer of teil.ohneDaten || []) {
        const src = iconUrl(wer);
        chips.push(el("span", {class: "ld-paar ohne",
            title: wer + ": keine Paarung mit genug Partien"},
          src ? el("img", {src, alt: "", loading: "lazy"}) : null,
          el("b", {}, "—")));
      }
      if (!chips.length) return null;
      return el("div", {class: "ld-paare " + klasse},
        el("span", {class: "ld-paare-wort"}, wort),
        el("span", {class: "ld-paare-liste"}, chips));
    };
    // Seit Audit P1.1 steht der Lanegegner in "lane", die uebrigen in
    // "matchup" - beide Reihen, sonst fehlte die Lane auf der Karte.
    const lane = reihe("Lane", r.components.lane, "gegen");
    const gegen = reihe("gegen", r.components.matchup, "gegen");
    const mit = reihe("mit", r.components.synergie, "mit");
    if (!lane && !gegen && !mit) return null;
    return el("div", {class: "ld-paarungen"}, lane, gegen, mit);
  }

  /* Die Erklaerungsspur: jeder Teil mit seinem Beitrag. Ohne sie waere
     die Zahl ein Orakel. */
  function liveSpur(r) {
    const teile = Object.entries(r.components)
      .filter(([, t]) => Math.abs(t.beitrag) >= 0.5)
      .sort((a, b) => Math.abs(b[1].beitrag) - Math.abs(a[1].beitrag));
    if (!teile.length) return null;
    return el("div", {class: "ld-spur"}, teile.map(([name, t]) =>
      el("span", {class: "ld-spur-teil " + (t.beitrag >= 0 ? "plus" : "minus")
                         + (t.quelle === "heuristik" ? " geschaetzt" : ""),
          title: name + ": " + t.text + "  (" + t.quelle
                 + (t.konfidenz !== null && t.konfidenz !== undefined
                    ? ", Konfidenz " + t.konfidenz.toFixed(2) : "") + ")"},
        el("b", {}, SPUR_WORT[name] || name),
        el("i", {}, (t.beitrag >= 0 ? "+" : "") + t.beitrag.toFixed(0)))));
  }

  const SPUR_WORT = {
    meta: "Patch", matchup: "gegen", synergie: "mit", compFit: "Comp",
    gegnerStoerung: "st\u00f6rt", flex: "Flex", komfort: "Komfort",
    blindSicherheit: "blind", lane: "Lane", lookahead: "Vorschau",
  };

  const DB_QUOTE = new Intl.NumberFormat("de-DE", {minimumFractionDigits: 1});
  // "2.000", nicht "2k" - tausend() kuerzt fuer Partienzahlen ab.
  const GANZZAHL = new Intl.NumberFormat("de-DE");
  const dbQuote = (q) => DB_QUOTE.format(Math.round(q * 1000) / 10) + " %";

  function liveKarteGesperrt(champ, v) {
    const src = iconUrl(champ);
    return el("div", {class: "ld-karte gesperrt ld-" + v.art},
      el("div", {class: "ld-karte-kopf"},
        src ? el("img", {class: "ld-bild", src, alt: "", loading: "lazy"}) : null,
        el("span", {class: "ld-karte-name"}, champ),
        el("span", {class: "ld-marke ld-" + v.art},
           v.art === "fearless" ? "Fearless" : v.art === "ban" ? "Ban" : "Pick")),
      el("p", {class: "ld-sperr-grund"}, v.text));
  }

