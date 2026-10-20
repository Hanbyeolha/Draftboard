  /* ======================================== Winraten (LIVE: Team und Solo)
     Wunsch des Nutzers (18.10.2026): neben der Note die rohen Zahlen - die
     allgemeine Winrate des Champions auf der Rolle und seine Winrate gegen
     jeden schon gepickten Gegner, je mit Spielen und Quelle
     (engine/ansicht.js winraten, gemessen von DraftGap). Die Note bleibt
     die Empfehlung - sie rechnet Komfort, Comp und Lookahead mit ein; die
     Winrate ist ein Beleg daneben, kein Ersatz.

     Farbe: allgemein wie die Rangzeile der Spielerkarte (gruen ab 52 %, rot
     unter 48 %); Matchups und Duos am Schnitt gemessen, mit den Grenzen der
     Begruendung (score.js BEGRUENDUNG). Keine neue Schwelle. Die Zahl steht
     immer dabei, die Farbe ist nur Zugabe. */

  const wrProzent = (w) => w
    ? (w.value * 100).toLocaleString("de-DE", {minimumFractionDigits: 1, maximumFractionDigits: 1}) + " %"
    : "–";
  const wrTon = (w) => !w ? "" : w.value >= 0.52 ? " gut" : w.value < 0.48 ? " schwach" : "";
  // Matchups und Duos: gemessen am Schnitt aller gegen/mit diesem Champion,
  // mit denselben Grenzen wie die Begruendung ("stark gegen", "passt zu" -
  // score.js BEGRUENDUNG). Gegen Jinx schaffen alle nur 47,4 % - 50 % ist
  // dort gut, nicht neutral.
  const wrTonGegen = (w, schnitt, art) => {
    if (!w || schnitt === null || schnitt === undefined) return wrTon(w);
    const d = w.value - schnitt, g = ENGINE.BEGRUENDUNG[art];
    return d >= g ? " gut" : d <= -g ? " schwach" : "";
  };
  const wrSpiele = (w) => w && w.sampleSize ? w.sampleSize.toLocaleString("de-DE") + " Spiele" : "";

  /** Winraten fuer einen Kandidaten in einer Lage (rolle = Index in ROLES). */
  function liveWinraten(z, champ, rolle) {
    if (!liveTeile || !liveTeile.quelle) return {allgemein: null, matchups: []};
    return ENGINE.winraten(liveTeile.quelle, z, champ, ROLES[rolle][0]);
  }

  /** Eine Zeile fuer Listen: "51,2 % allgemein · 49,7 % vs Syndra +1". */
  function wrKurz(w) {
    const teile = [el("span", {class: "wr-zahl" + wrTon(w.allgemein)}, wrProzent(w.allgemein)), " allgemein"];
    const lane = w.matchups.find((m) => m.lane) || w.matchups[0];
    if (lane) {
      teile.push(" · ", el("span", {class: "wr-zahl" + wrTonGegen(lane.wert, lane.schnitt, "matchup")},
                 wrProzent(lane.wert)), " vs " + lane.gegner);
    }
    if (w.matchups.length > 1) teile.push(el("span", {class: "wr-neben"}, " +" + (w.matchups.length - 1)));
    // Bot/Support: wie gut mit unserem Lanepartner (Duo-Winrate).
    const partner = (w.mit || []).find((m) => m.lane);
    if (partner) {
      teile.push(" · ", el("span", {class: "wr-zahl" + wrTonGegen(partner.wert, partner.schnitt, "synergie")},
                 wrProzent(partner.wert)), " mit " + partner.partner);
    }
    return el("span", {class: "wr-kurz",
                       title: "Winrate aller Spieler laut DraftGap - allgemein auf der Rolle"
                              + (lane ? " und gegen die gepickten Gegner" : "")}, teile);
  }

  /** Der ganze Block: allgemein, dann jedes Matchup - mit Spielen und Quelle. */
  function wrBlock(w, rolleWort) {
    const zeile = (wert, wort, schnitt = null, art = null) => el("li", {class: "wr-zeile"},
      el("b", {class: "wr-zahl" + (art ? wrTonGegen(wert, schnitt, art) : wrTon(wert))}, wrProzent(wert)),
      el("span", {class: "wr-wort"}, wort,
        schnitt !== null ? el("span", {class: "wr-neben wr-schnitt"},
          " · Ø aller " + wrProzent({value: schnitt})) : null),
      el("span", {class: "wr-neben"}, wert ? wrSpiele(wert) : "keine Daten"));
    const patch = w.allgemein && w.allgemein.patch;
    const mitFenster = w.matchups.find((m) => m.wert && m.wert.note);
    return el("div", {class: "wr-block"},
      el("span", {class: "cp-klein"}, "Winrate · alle Spieler"),
      el("ul", {class: "wr-liste"},
        zeile(w.allgemein, "allgemein auf " + rolleWort + (w.allgemein ? "" : " – Nebenrolle, zu wenig Daten")),
        w.matchups.map((m) => zeile(m.wert, "gegen " + m.gegner + " · "
          + (ENGINE.ROLLEN_WORT[m.rolle] || m.rolle) + (m.lane ? " (Lane)" : ""), m.schnitt, "matchup")),
        // Mit unseren Picks: Duo-Winrate je Mitspieler, Lanepartner zuerst.
        (w.mit || []).map((m) => zeile(m.wert, "mit " + m.partner + " · "
          + (ENGINE.ROLLEN_WORT[m.rolle] || m.rolle) + (m.lane ? " (Lanepartner)" : ""), m.schnitt, "synergie"))),
      w.matchups.length ? null : el("p", {class: "wr-quelle"}, "Matchups: noch kein Gegnerpick."),
      w.matchups.length || (w.mit || []).length ? el("p", {class: "wr-quelle"}, "„Ø aller“: was alle Champions "
        + "im Schnitt gegen diesen Gegner bzw. mit diesem Mitspieler schaffen – in der Begründung steht "
        + "derselbe Wert als „sonst“.") : null,
      el("p", {class: "wr-quelle"}, "DraftGap"
        + (patch ? " · allgemein Patch " + patch : "")
        + (mitFenster ? " · Matchups " + mitFenster.wert.note : "") + "."));
  }

  /** Die Begruendung der Engine als Liste: Gruende mit Haken, Risiken als Warnung. */
  function wrBegruendung(gruende, risiken) {
    if (!gruende.length && !risiken.length) return null;
    return el("div", {class: "wr-begruendung"},
      el("span", {class: "cp-klein"}, "Begründung"),
      gruende.length ? el("ul", {class: "wr-gruende"}, gruende.map((g) => el("li", {}, g))) : null,
      risiken.length ? el("ul", {class: "wr-risiken"}, risiken.map((g) => el("li", {}, g))) : null);
  }

  /* ------------------------------------- Draft-Vorteil (engine/chance.js)
     Wunsch des Nutzers (18.10.2026): die Gesamtchance, live. Bewusst als
     "Draft laut Patchdaten" beschriftet und mit der Trefferquote an unseren
     Turnierspielen daneben - gemessen am 18.10.: 39 von 75, seit der
     Korrektur der Erwartung (20.10.) 51 von 87 - nicht besser
     als ein Muenzwurf. Entschieden vom Nutzer: Variante "Draft-Vorteil mit
     Trefferquote". Fliesst in keine Empfehlung ein. */
  function liveDraftChance(z) {
    return liveTeile && liveTeile.quelle ? ENGINE.draftChance(liveTeile.quelle, z) : null;
  }
  function liveChanceMit(z, champ, rolle) {
    return liveTeile && liveTeile.quelle ? ENGINE.chanceMitPick(liveTeile.quelle, z, champ, ROLES[rolle][0]) : null;
  }

  // Trefferquote an den eingebetteten Turnierspielen - einmal je Seitenaufruf.
  // DATA.games fuehrt jede Partie zweimal (je Mannschaft); gepaart ueber
  // matchId, sonst Serie + Spielnummer.
  function chanceTreffer() {
    if (chanceTreffer.wert !== undefined) return chanceTreffer.wert;
    const je = new Map();
    for (const g of DATA.games || []) {
      const k = g.matchId || ((g.series || "") + "|" + (g.game || ""));
      if (!je.has(k)) je.set(k, []);
      je.get(k).push(g);
    }
    const partien = [];
    for (const zwei of je.values()) {
      if (zwei.length !== 2 || !zwei[0].result) continue;
      const auf = (g) => (g.picks || []).map((p) => ({champ: p.champ, rolle: p.role}));
      partien.push({a: auf(zwei[0]), b: auf(zwei[1]), aGewinnt: zwei[0].result === "win"});
    }
    chanceTreffer.wert = liveTeile && liveTeile.quelle ? ENGINE.treffer(liveTeile.quelle, partien) : null;
    return chanceTreffer.wert;
  }

  const punkteText = (x) => (x >= 0 ? "+" : "\u2212") + Math.abs(x).toLocaleString("de-DE",
    {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const chanceProzent = (c) => Math.round(c.chance * 100) + " %";

  /** Die Leiste: "Draft laut Patchdaten 54 % fuer uns (+4 Punkte)", Balken,
   *  Teile, Trefferquote. */
  /* anzeige: die Mitte der Spielstand-Leiste (Cockpit, Entwurf B+C vom
     20.10.2026) - "55 % : 45 %" mit Balken, dieselben Zahlen. Die zweite
     Zahl ist nur der Rest zu 100, keine eigene Rechnung. */
  function chanceLeiste(c, {gegnerName = "Gegner", anzeige = false} = {}) {
    if (!c) return null;
    const t = chanceTreffer();
    const fuerUns = c.chance >= 0.5;
    const balken = el("span", {class: "ch-balken", "aria-hidden": "true"},
      el("span", {class: "ch-wir", style: "width:" + (c.chance * 100).toFixed(1) + "%"}),
      el("span", {class: "ch-mitte"}));
    return el("section", {class: "ch-leiste" + (c.leer ? " leer" : "") + (anzeige ? " anzeige" : ""),
                          "aria-label": "Draft laut Patchdaten"},
      el("span", {class: "cp-klein"}, "Draft laut Patchdaten"),
      el("div", {class: "ch-zahl-zeile"},
        el("strong", {class: "ch-zahl"}, c.leer ? "50 %" : chanceProzent(c)),
        anzeige ? el("span", {class: "ch-gegenzahl", title: gegnerName + ": der Rest zu 100 %"},
          el("span", {class: "ch-doppelpunkt", "aria-hidden": "true"}, ":"),
          c.leer ? "50 %" : Math.round(100 - c.chance * 100) + " %") : null,
        el("span", {class: "ch-fuer"}, c.leer ? "noch kein Pick"
          : (fuerUns ? "für uns" : "für uns · " + gegnerName + " vorn")
            + " (" + punkteText(c.punkte) + " Punkte)"),
        balken),
      c.leer ? null : el("span", {class: "ch-teile"},
        "Champions " + punkteText(c.teile.champions) + " · Matchups " + punkteText(c.teile.matchups)
        + " · Synergien " + punkteText(c.teile.synergien)
        + (c.ohneDaten.length ? " · ohne Patchdaten: " + c.ohneDaten.join(", ") : "")),
      t && t.n ? el("span", {class: "ch-treffer"}, "traf in unseren " + t.n + " Turnierspielen "
        + t.richtig + "-mal – Spieler entscheiden mehr als der Draft") : null);
  }

  /** Klein je Vorschlag: "Team → 56 % (+2,0)" - was dieser Pick am Draft aendert. */
  function chanceNach(nach, jetzt) {
    if (!nach || !jetzt) return null;
    const d = (nach.chance - jetzt.chance) * 100;
    return el("span", {class: "ch-nach", title: "Draft laut Patchdaten, wenn wir ihn picken – "
                       + "jetzt " + chanceProzent(jetzt)},
      "Team \u2192 ", el("b", {}, chanceProzent(nach)), " (" + punkteText(d) + ")");
  }

  /* --------------------------------------- Lane-Tabelle (engine/chance.js)
     Wunsch des Nutzers (18.10.2026): "als Botlaner wissen, wie viel mir der
     Support hilft, wie sehr er dem Gegner schadet - und filtern koennen".
     Alle Champions der Rolle (laneAnalyse) mit:
       Team ->    Draft laut Patchdaten, wenn wir ihn picken
       vs X       gemessene Winrate gegen jeden gepickten Lanegegner
       mit Y      gemessene Duo-Winrate mit unserem Lanepartner (Bot <-> Support)
       allgemein  Patch-Winrate auf der Rolle
     Filter: Alle / Pool / Plan, vergebene ein/aus. Sortiert nach der
     gewaehlten Spalte, bei Winraten rauschbereinigt (wenige Spiele zaehlen
     weniger) - angezeigt wird immer der gemessene Wert. Je Rolle merkt sich
     die Tabelle Filter, Sortierung und Aufklappen. */
  const LANE_KURZ = 10;
  const laneStand = new Map();         // Rolle -> {filter, sort, vergebene, offen}

  const wrSpieleKurz = (w) => {
    const n = w.sampleSize;
    return n >= 1000 ? (n / 1000).toLocaleString("de-DE", {maximumFractionDigits: 1}) + "k" : String(n);
  };

  /* Heatmap (Entwurf B+C, 20.10.2026): die Zelle traegt die Farbe, die Zahl
     darunter den Abstand zum Schnitt - Status nie nur ueber Farbe. Grenzen
     wie oben: Matchups/Duos am Schnitt mit BEGRUENDUNG (kraeftig = mindestens
     die Grenze darueber bzw. darunter, hell = nur ueber/unter dem Schnitt),
     allgemein gruen ab 52 %, rot unter 48 %. */
  const ltHitze = (w, schnitt, art) => {
    if (!w) return "";
    if (!art || schnitt === null || schnitt === undefined) {
      return w.value >= 0.52 ? " h2" : w.value < 0.48 ? " l2" : "";
    }
    const d = w.value - schnitt, g = ENGINE.BEGRUENDUNG[art];
    return d >= g ? " h2" : d >= 0 ? " h1" : d > -g ? " l1" : " l2";
  };
  const ltAbstand = (w, schnitt) => {
    const d = (w.value - schnitt) * 100;
    return (d >= 0 ? "+" : "\u2212") + Math.abs(d).toLocaleString("de-DE",
      {minimumFractionDigits: 1, maximumFractionDigits: 1});
  };

  /* Pro-Picks (pro.py, Oracle's Elixir, seit 20.10.2026): je Champion und
     Rolle Picks, Siege, davon blind (vor dem Gegner derselben Rolle). Nur
     Anzeige - die Note rechnet sie nicht mit. */
  const PRO = (typeof DATA !== "undefined" && DATA.pro && DATA.pro.champions) ? DATA.pro : null;
  const proVon = (champ, rolleName) => PRO && PRO.champions[champ] ? PRO.champions[champ][rolleName] || null : null;
  const proFenster = () => !PRO ? "" : PRO.patches.length > 1
    ? PRO.patches[0] + "–" + PRO.patches[PRO.patches.length - 1] : PRO.patches[0] || "";
  function proQuelle() {
    if (!PRO) return "";
    return "Pro: " + PRO.spiele + " Spiele " + Object.entries(PRO.jeLiga).map(([l, n]) => l + " " + n).join(", ")
      + " · Patches " + PRO.patches.join(", ") + " · blind = vor dem Gegner derselben Rolle gepickt"
      + " · Oracle's Elixir, Stand " + PRO.stand + ".";
  }
  function proTitel(champ, rolleName) {
    const x = proVon(champ, rolleName);
    const bans = PRO && PRO.bans[champ] ? PRO.bans[champ] : 0;
    const wort = ENGINE.ROLLEN_WORT[rolleName] || rolleName;
    if (!x) return champ + ": in " + (PRO ? PRO.spiele : 0) + " Pro-Spielen nicht auf " + wort + " gepickt"
      + (bans ? ", " + bans + "× gebannt" : "") + " (Patches " + proFenster() + ")";
    return champ + " auf " + wort + " in " + PRO.spiele + " Pro-Spielen (Patches " + proFenster() + "): "
      + x.picks + "× gepickt, davon " + x.blind + "× blind (" + x.blindSiege + " Siege), "
      + (x.picks - x.blind) + "× als Antwort; " + x.siege + " Siege gesamt"
      + (bans ? "; " + bans + "× gebannt" : "");
  }

  /* noten (optional): Map Champion -> {score, grund, risiko} aus der
     Rangliste der Engine. Dann gibt es eine Spalte "Note" und - mit
     mitGrund - den Grund je Zeile (Solo Queue, eine Tabelle statt zweier
     Listen). */
  /* Filter (Wunsch des Nutzers, 20.10.2026: "besser filtern, was das Team
     braucht oder fuer die Lane"), zusaetzlich zu Alle/Pool/Plan und alle
     zusammen (und):
       stark in der Lane   gegen JEDEN bekannten Lanegegner mindestens die
                           Begruendungsgrenze ueber dem Schnitt (dieselbe
                           Grenze wie "stark gegen" und die kraeftige Farbe)
       braucht: X          bringt den Bedarf aus dem Lagebild mit - dieselbe
                           Regel wie dort "bringen das mit" (strategie.bringt)
       Pro blind           in den Pro-Ligen auf dieser Rolle blind gepickt
     bedarf: [{achse, wort}] aus dem Lagebild, bringt(champ, achse) -> bool. */
  function laneTabelle({z, rolle, gesperrt, pool, plan, picken, wer, neuZeichnen, noten = null,
                        mitGrund = false, sortStandard = null, bedarf = [], bringt = null}) {
    const rolleName = ROLES[rolle][0];
    const a = ENGINE.laneAnalyse(liveTeile.quelle, z, rolleName);
    const note = (x) => noten && noten.has(x.champ) ? noten.get(x.champ) : null;
    const spalten = [
      ...(noten ? [{id: "note", wort: "Note", titel: "Note der Empfehlung (Komfort, Matchup, Comp, Meta)",
                    ordnung: (x) => note(x) ? note(x).score : null, note: true}] : []),
      {id: "chance", wort: "Team →", titel: "Draft laut Patchdaten, wenn wir ihn picken",
       roh: (x) => ({value: x.chance}), ordnung: (x) => x.chance, prozent: true},
      ...a.gegner.map((g, i) => ({id: "gegen:" + g.champ, wort: "vs " + g.champ, schnitt: g.schnitt,
       titel: "Winrate gegen " + g.champ + " (" + (ENGINE.ROLLEN_WORT[g.rolle] || g.rolle) + ") – wie gut er gegen ihn steht",
       roh: (x) => x.gegen[i], ordnung: (x) => x.gegenBereinigt[i], art: "matchup"})),
      ...a.partner.map((p, i) => ({id: "mit:" + p.champ, wort: "mit " + p.champ, schnitt: p.schnitt,
       titel: "Duo-Winrate mit unserem " + (ENGINE.ROLLEN_WORT[p.rolle] || p.rolle) + " " + p.champ
              + " – wie gut sie zusammen sind",
       roh: (x) => x.mit[i], ordnung: (x) => x.mitBereinigt[i], art: "synergie"})),
      ...(PRO ? [{id: "pro", wort: "Pro blind", pro: true,
                  titel: "Pro-Spiele (" + Object.keys(PRO.jeLiga).join(", ") + ", Patches " + proFenster()
                         + "): wie oft blind gepickt (vor dem Gegner derselben Rolle), darunter von wie vielen "
                         + "Picks und die Winrate der Blind-Picks",
                  ordnung: (x) => { const v = proVon(x.champ, rolleName); return v ? v.blind + v.picks / 1000 : null; }}] : []),
      {id: "allgemein", wort: "allgemein", titel: "Patch-Winrate auf der Rolle",
       roh: (x) => x.allgemein, ordnung: (x) => x.allgemein.value},
    ];
    const st = {filter: "alle", sort: null, vergebene: false, offen: false, lane: false, braucht: [], proBlind: false,
                ...(laneStand.get(rolleName) || {})};
    // Standard: gegen den ersten Lanegegner, sonst Team -> (die Spalte, die
    // alles zusammennimmt). Eine gemerkte Spalte, die es nicht mehr gibt,
    // faellt zurueck.
    if (!spalten.some((s) => s.id === st.sort)) {
      const erstesMatchup = spalten.find((s) => s.art === "matchup");
      st.sort = sortStandard && spalten.some((s) => s.id === sortStandard) ? sortStandard
        : erstesMatchup ? erstesMatchup.id : "chance";
    }
    const setze = (teil) => { laneStand.set(rolleName, {...st, ...teil}); neuZeichnen(); };

    const imPlan = (c) => !!plan && (plan.blind.includes(c) || plan.likes.includes(c));
    const gegenSpalten = spalten.filter((s) => s.art === "matchup" && s.schnitt !== null && s.schnitt !== undefined);
    const laneStark = (x) => gegenSpalten.length > 0 && gegenSpalten.every((s) => {
      const w = s.roh(x);
      return w && w.value - s.schnitt >= ENGINE.BEGRUENDUNG.matchup;
    });
    const bedarfDa = (bedarf || []).filter((b) => b && b.achse && bringt);
    const braucht = (st.braucht || []).filter((a) => bedarfDa.some((b) => b.achse === a));
    const proBlind = (x) => { const v = proVon(x.champ, rolleName); return !!(v && v.blind); };
    const grundPasst = (x) => (st.vergebene || !gesperrt.has(x.champ));
    const passt = (x) => (st.filter !== "pool" || (pool && pool.has(x.champ)))
      && (st.filter !== "plan" || imPlan(x.champ))
      && grundPasst(x)
      && (!st.lane || laneStark(x))
      && braucht.every((a) => bringt(x.champ, a))
      && (!st.proBlind || proBlind(x));
    const spalte = spalten.find((s) => s.id === st.sort);
    const zeilen = a.zeilen.filter(passt).sort((x, y) => {
      const vx = spalte.ordnung(x), vy = spalte.ordnung(y);
      if (vx === null && vy === null) return x.champ.localeCompare(y.champ);
      if (vx === null) return 1;
      if (vy === null) return -1;
      return vy - vx || x.champ.localeCompare(y.champ);
    });
    const sichtbar = st.offen ? zeilen : zeilen.slice(0, LANE_KURZ);

    const knopf = (wort, an, klick, titel = null) => {
      const k = el("button", {type: "button", "aria-pressed": String(an), title: titel}, wort);
      k.addEventListener("click", klick);
      return k;
    };
    const vergebeneHaken = el("input", {type: "checkbox"});
    vergebeneHaken.checked = st.vergebene;
    vergebeneHaken.addEventListener("change", () => setze({vergebene: vergebeneHaken.checked}));

    const gegnerText = a.gegner.length ? "gegen " + a.gegner.map((g) => g.champ).join(" + ") : "Lanegegner noch offen";
    const box = el("section", {class: "ko-liste lt", "aria-label": "Kandidaten für " + ROLES[rolle][1]},
      el("div", {class: "ko-kopf"},
        el("span", {class: "cp-klein"}, "Kandidaten für " + ROLES[rolle][1] + " · " + gegnerText),
        wer ? el("span", {class: "cp-klein ko-fuer"}, "für " + wer) : null,
        el("span", {class: "wr-neben"}, zeilen.length + (zeilen.length === 1 ? " Champion" : " Champions"))),
      el("div", {class: "lt-steuer"},
        el("div", {class: "switch lt-filter", role: "group", "aria-label": "Filter"},
          knopf("Alle", st.filter === "alle", () => setze({filter: "alle", offen: false})),
          knopf("Pool", st.filter === "pool", () => setze({filter: "pool", offen: false}),
                "Mindestens 3 Partien laut op.gg"),
          knopf("Plan", st.filter === "plan", () => setze({filter: "plan", offen: false}),
                "Blind oder gerne laut Draftplan")),
        el("div", {class: "switch lt-sort", role: "group", "aria-label": "Sortieren nach"},
          el("span", {class: "cp-klein"}, "Sortieren"),
          spalten.map((s) => knopf(s.wort, s.id === st.sort, () => setze({sort: s.id}), s.titel))),
        el("label", {class: "lt-haken"}, vergebeneHaken, " vergebene zeigen")));

    // Eingrenzen: Lane, Team-Bedarf, Pro blind - jeweils mit der Zahl, die
    // uebrig bliebe (ohne die anderen Eingrenzungen, mit Alle/Pool/Plan).
    const basis = a.zeilen.filter((x) => grundPasst(x)
      && (st.filter !== "pool" || (pool && pool.has(x.champ))) && (st.filter !== "plan" || imPlan(x.champ)));
    const chip = (wort, an, anzahl, klick, titel) => {
      const k = el("button", {type: "button", class: "lt-chip", "aria-pressed": String(an), title: titel},
        wort, el("span", {class: "lt-chip-zahl"}, String(anzahl)));
      k.addEventListener("click", klick);
      return k;
    };
    const eingrenzen = [
      gegenSpalten.length ? chip("stark in der Lane", st.lane, basis.filter(laneStark).length,
        () => setze({lane: !st.lane, offen: false}),
        "Gegen jeden Lanegegner mindestens 2 Punkte über dem Schnitt aller (wie „stark gegen“)") : null,
      ...bedarfDa.map((b) => chip("bringt " + b.wort, braucht.includes(b.achse),
        basis.filter((x) => bringt(x.champ, b.achse)).length,
        () => setze({braucht: braucht.includes(b.achse) ? braucht.filter((q) => q !== b.achse) : [...braucht, b.achse],
                     offen: false}),
        "Team braucht " + b.wort + (b.grund ? " (" + b.grund + ")" : "") + " – dieselbe Regel wie im Lagebild")),
      PRO ? chip("Pro blind gepickt", st.proBlind, basis.filter(proBlind).length,
        () => setze({proBlind: !st.proBlind, offen: false}),
        "In den Pro-Ligen (Patches " + proFenster() + ") auf dieser Rolle blind gepickt") : null,
    ].filter(Boolean);
    if (eingrenzen.length) {
      box.append(el("div", {class: "lt-eingrenzen", role: "group", "aria-label": "Eingrenzen"},
        el("span", {class: "cp-klein"}, "Eingrenzen"), eingrenzen));
    }
    // Pro: die uebliche Blind Picks dieser Rolle auf einen Blick.
    if (PRO) {
      const ueblich = Object.entries(PRO.champions)
        .map(([c, je]) => [c, je[rolleName]]).filter(([, v]) => v && v.blind > 0)
        .sort((p, q) => q[1].blind - p[1].blind || q[1].picks - p[1].picks).slice(0, 8);
      if (ueblich.length) {
        box.append(el("div", {class: "lt-pro-leiste"},
          el("span", {class: "cp-klein"}, "Pro · übliche Blind Picks " + ROLES[rolle][1]),
          el("div", {class: "lt-pro-liste"}, ueblich.map(([c, v]) => el("span", {
              class: "lt-pro-chip" + (gesperrt.has(c) ? " weg" : ""), title: proTitel(c, rolleName)
                + (gesperrt.has(c) ? " · " + gesperrt.get(c) : "")},
            iconUrl(c) ? el("img", {src: iconUrl(c), alt: ""}) : null,
            el("b", {}, c),
            el("span", {}, v.blind + "× blind · " + Math.round(v.blindSiege / v.blind * 100) + " %"))))));
      }
    }

    if (!a.gegner.length) {
      box.append(el("p", {class: "wr-quelle"}, "Sobald der Gegner für " + ROLES[rolle][1]
        + " gepickt hat, kommt je Lanegegner eine Spalte „vs …“ dazu."));
    }
    const zelle = (s, x) => {
      if (s.pro) {
        const v = proVon(x.champ, rolleName);
        return el("span", {class: "lt-wert lt-pro" + (s.id === st.sort ? " sortiert" : ""), "data-wort": s.wort,
                           role: "cell", title: proTitel(x.champ, rolleName)},
          el("b", {}, v ? String(v.blind) : "–"),
          v ? el("small", {class: "wr-neben"}, "von " + v.picks
            + (v.blind ? " · " + Math.round(v.blindSiege / v.blind * 100) + " %" : "")) : null);
      }
      if (s.note) {
        const n = note(x);
        return el("span", {class: "lt-wert lt-note" + (s.id === st.sort ? " sortiert" : ""), "data-wort": s.wort,
                           role: "cell", title: s.titel}, el("b", {}, n ? String(n.score) : "–"));
      }
      const w = s.roh(x);
      const text = !w ? "–" : s.prozent ? Math.round(w.value * 100) + " %" : wrProzent(w);
      const mitSchnitt = s.schnitt !== undefined && s.schnitt !== null;
      // Klein darunter: Abstand zum Schnitt (Matchup/Duo) und Spiele.
      const klein = !w || s.prozent ? null
        : s.art && mitSchnitt ? ltAbstand(w, s.schnitt) + (w.sampleSize ? " · " + wrSpieleKurz(w) : "")
        : w.sampleSize ? wrSpieleKurz(w) : null;
      return el("span", {class: "lt-wert" + (s.prozent ? "" : ltHitze(w, s.schnitt, s.art))
                                 + (s.id === st.sort ? " sortiert" : ""), "data-wort": s.wort, role: "cell",
                         title: w && w.sampleSize ? s.wort + ": " + wrProzent(w) + " aus " + wrSpiele(w)
                           + (mitSchnitt ? " · Ø aller " + wrProzent({value: s.schnitt}) : "")
                           : s.titel},
        el("b", {class: "wr-zahl"}, text),
        klein ? el("small", {class: "wr-neben"}, klein) : null);
    };
    // Feste Breiten statt "auto": jede Zeile ist ihr eigenes Raster - eine
    // auto-Spalte waere im Kopf (leer) schmaler als in den Zeilen (Knopf),
    // und die Spaltenkoepfe stuenden versetzt.
    const wertSpalten = spalten.filter((s) => !s.note).length;
    const raster = "32px minmax(7.5rem, " + (mitGrund ? "11rem" : "1fr") + ")"
      + (noten ? " 3rem" : "") + " repeat(" + wertSpalten + ", 5.6rem)"
      + (mitGrund ? " minmax(8rem, 1fr)" : "") + " 4.8rem";
    box.append(el("div", {class: "lt-tabelle", role: "table", style: "--lt-raster:" + raster},
      el("div", {class: "lt-zeile lt-kopfzeile", role: "row"},
        el("span"), el("span", {class: "cp-klein", role: "columnheader"}, "Champion"),
        spalten.map((s) => el("span", {class: "cp-klein lt-wert" + (s.note ? " lt-note" : "")
                                         + (s.id === st.sort ? " sortiert" : ""),
                                       role: "columnheader", title: s.titel}, s.wort)),
        mitGrund ? el("span", {class: "cp-klein lt-grund", role: "columnheader"}, "Grund") : null,
        el("span")),
      sichtbar.map((x) => {
        const grund = gesperrt.get(x.champ);
        const marken = [plan && plan.blind.includes(x.champ) ? "Plan: blind"
                          : plan && plan.likes.includes(x.champ) ? "Plan: gerne" : null,
                        pool && pool.has(x.champ) ? "Pool" : null].filter(Boolean);
        const pick = !grund && picken
          ? el("button", {class: "cp-picken klein ko-picken", type: "button", "aria-label": x.champ + " picken"}, "Picken")
          : el("span");
        if (!grund && picken) pick.addEventListener("click", () => picken(x.champ));
        const n = note(x);
        const warum = mitGrund ? el("span", {class: "lt-grund" + (n && n.risiko ? " risiko" : ""), role: "cell"},
          n ? n.risiko || n.grund || "" : "") : null;
        return el("div", {class: "lt-zeile ko-zeile" + (grund ? " gesperrt" : "")
                                  + (pool && pool.has(x.champ) ? " im-pool" : ""), role: "row",
                          title: grund ? x.champ + ": " + grund : null},
          iconUrl(x.champ) ? el("img", {src: iconUrl(x.champ), alt: ""}) : el("span"),
          el("span", {class: "ko-name", role: "cell"}, el("b", {}, x.champ),
            marken.map((m) => el("span", {class: "cp-plan"}, m))),
          spalten.map((s) => zelle(s, x)),
          warum,
          pick);
      })));
    if (!zeilen.length) {
      box.append(el("p", {class: "cp-leer"}, st.lane || braucht.length || st.proBlind
        ? "Kein Champion erfüllt alle gewählten Eingrenzungen – eine davon lösen."
        : st.filter === "pool" ? "Kein Champion aus dem Pool spielt diese Rolle."
        : st.filter === "plan" ? "Im Draftplan steht für diese Rolle nichts." : "Kein freier Champion."));
    }
    if (zeilen.length > LANE_KURZ) {
      const mehr = el("button", {class: "so-mehr", type: "button", "aria-expanded": String(st.offen)},
        st.offen ? "weniger zeigen" : "alle " + zeilen.length + " zeigen");
      mehr.addEventListener("click", () => setze({offen: !st.offen}));
      box.append(mehr);
    }
    const schnitte = spalten.filter((s) => s.schnitt !== undefined && s.schnitt !== null)
      .map((s) => s.wort + " " + wrProzent({value: s.schnitt}));
    box.append(el("p", {class: "wr-quelle"},
      (schnitte.length ? "Ø aller: " + schnitte.join(" · ") + ". " : "")
      + "Farbe: Matchup mindestens 2, Duo 1,5 Punkte über bzw. unter dem Schnitt (kräftig), sonst darüber "
      + "oder darunter (hell); allgemein ab 52 % bzw. unter 48 %. Kleine Zahl: Abstand zum Schnitt · Spiele. "
      + "Winraten laut DraftGap, Matchups und Duos der letzten 30 Tage. Sortiert wird bei wenigen Spielen "
      + "zum Schnitt hin bereinigt – darum steht nicht immer die höchste Zahl oben."
      + (PRO ? " " + proQuelle() : "")));
    return box;
  }

  /** Pool eines Spielers: dieselbe Grenze wie die Solo Queue (soloImPool) -
   *  mindestens 3 Partien laut op.gg (Komfort der Engine). Ein einzelnes
   *  Spiel ist noch kein Pool. */
  function poolVon(sp) {
    if (!sp || !liveTeile) return null;
    return {has: (champ) => {
      const k = liveTeile.mannschaft.komfort(sp.team, sp.label, champ);
      return !!(k && k.sampleSize >= 3);
    }};
  }

  /** Die Lanegegner unserer Rolle in einer Lage: [{champ, rolle}] (Bot: ADC und Support). */
  function laneGegnerIn(z, rolle) {
    const lane = new Set(ENGINE.LANE_GEGNER[ROLES[rolle][0]] || []);
    const sie = z.wirSind === "blue" ? "red" : "blue";
    return (z.picks[sie] || []).filter((p) => p && p.champ && lane.has(p.rolle));
  }
