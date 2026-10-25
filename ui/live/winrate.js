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
     "Draft laut Patchdaten" beschriftet. Die Trefferquote an unseren
     Turnierspielen stand bis 24.10.2026 daneben; der Nutzer wollte sie
     dort nicht mehr (engine/chance.js treffer() misst sie weiter). Statt
     dessen klappt jede eingehende Winrate auf. Fliesst in keine
     Empfehlung ein. */
  function liveDraftChance(z) {
    return liveTeile && liveTeile.quelle ? ENGINE.draftChance(liveTeile.quelle, z) : null;
  }
  function liveChanceMit(z, champ, rolle) {
    return liveTeile && liveTeile.quelle ? ENGINE.chanceMitPick(liveTeile.quelle, z, champ, ROLES[rolle][0]) : null;
  }


  const punkteText = (x) => (x >= 0 ? "+" : "\u2212") + Math.abs(x).toLocaleString("de-DE",
    {minimumFractionDigits: 1, maximumFractionDigits: 1});
  const chanceProzent = (c) => Math.round(c.chance * 100) + " %";

  /** Die Leiste: "Draft laut Patchdaten 54 % fuer uns (+4 Punkte)", Balken,
   *  Teile, Trefferquote. */
  /* anzeige: die Mitte der Spielstand-Leiste (Cockpit, Entwurf B+C vom
     20.10.2026) - "55 % : 45 %" mit Balken, dieselben Zahlen. Die zweite
     Zahl ist nur der Rest zu 100, keine eigene Rechnung. */
  function chanceLeiste(c, {gegnerName = "Gegner", anzeige = false, duelle = !anzeige} = {}) {
    if (!c) return null;
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
      // Ohne die Trefferquote stand die Zahl wie eine Siegchance da (Nutzer, 25.10.2026).
      c.leer ? null : el("span", {class: "ch-einordnung"},
        "Draft auf dem Patch bei durchschnittlichen Spielern – keine Siegchance."),
      // In der Spielstand-Leiste des Cockpits ist dafuer kein Platz.
      duelle ? chanceDuelle(c) : null,
      chanceAufbau(c));
  }

  /* Lane-Duell (Variante A, Nutzer 25.10.2026): unser Champion gegen den
     Lanegegner. Der Balken teilt sich nach der gemessenen Matchup-Winrate,
     der Strich steht bei dem, was die beiden allein erwarten lassen. Die
     Punkte sind derselbe Posten wie in der Aufschluesselung. */
  function laneDuell(c, m) {
    // Nur der Name: "allgemein" steht schon im Kopf der Karte, ein zweites
    // "allgemein" mit anderer Zahl verwirrte (Nutzer, 25.10.2026).
    const seite = (p, s) => {
      const src = iconUrl(p.champ);
      return el("span", {class: "du-seite " + s},
        src ? el("img", {src, alt: "", loading: "lazy"}) : null,
        el("span", {class: "du-name"}, el("b", {}, p.champ)));
    };
    const d = m.wert - m.erwartet;
    const ton = d >= 0.015 ? " gut" : d <= -0.015 ? " schwach" : "";
    // Sichtbar machen, dass der Balken das direkte Duell ist (Nutzer, 25.10.2026).
    const urteil = !ton ? "normales Duell" : (d < 0 ? m.b.champ : m.a.champ) + " kontert";
    return el("div", {class: "du", role: "group",
                      "aria-label": m.a.champ + " gegen " + m.b.champ + ": " + wrProzent({value: m.wert})},
      el("span", {class: "ch-rolle"}, roleLabel(m.a.rolle)
         + (m.a.rolle !== m.b.rolle ? " · " + roleLabel(m.b.rolle) : "")),
      seite(m.a, "wir"),
      el("span", {class: "du-mitte"},
        el("span", {class: "du-zahlen"},
          el("span", {}, el("b", {}, wrProzent({value: m.wert})), " ", el("small", {}, "im Duell")),
          el("span", {class: "du-paar"}, m.a.champ + " gegen " + m.b.champ),
          el("span", {}, el("small", {}, "im Duell"), " ", el("b", {class: "du-sie"}, wrProzent({value: 1 - m.wert})))),
        el("span", {class: "du-balken", "aria-hidden": "true"},
          el("span", {class: "du-wir", style: "width:" + (m.wert * 100).toFixed(1) + "%"}),
          el("span", {class: "du-erwartet", style: "left:" + (m.erwartet * 100).toFixed(1) + "%"})),
        el("small", {class: "du-satz"}, "gewinnt ", el("b", {}, wrProzent({value: m.wert})),
           " statt erwarteter " + wrProzent({value: m.erwartet}) + " → " + urteil + " · ",
           el("span", {class: "du-punkte" + ton}, punkteText(m.punkte) + " Punkte"),
           " · " + tausend(m.n) + " Partien"),
        // Die Begruendung nennt nur die erste Sicht - weicht die zweite
        // spuerbar ab, stehen beide da, damit die Zahlen zusammenpassen.
        m.sichten && Math.abs(m.sichten[0] - m.sichten[1]) > 0.01
          ? el("small", {class: "du-sichten"}, "gemittelt aus " + m.a.champ + "-Sicht "
               + wrProzent({value: m.sichten[0]}) + " und " + m.b.champ + "-Sicht "
               + wrProzent({value: m.sichten[1]})) : null),
      seite(m.b, "sie"));
  }

  /* Alle fertigen Lanes, sofort sichtbar. Die Matchups ueber Kreuz zaehlen
     auch - darum ihre Summe darunter, sonst wirkten die Lanes wie die ganze
     Rechnung. */
  function chanceDuelle(c) {
    if (c.leer) return null;
    const nr = (r) => ROLES.findIndex((x) => x[0] === r);
    const lane = c.posten.filter((p) => p.art === "matchup" && p.a.rolle === p.b.rolle)
      .sort((x, y) => nr(x.a.rolle) - nr(y.a.rolle));
    if (!lane.length) return null;
    const kreuz = c.posten.filter((p) => p.art === "matchup" && p.a.rolle !== p.b.rolle);
    return el("div", {class: "du-liste"},
      el("span", {class: "ch-gruppe-kopf"}, "Lane-Duelle · wie oft gewinnt unser Champion genau gegen diesen Gegner"),
      lane.map((m) => laneDuell(c, m)),
      kreuz.length ? el("small", {class: "du-rest"}, "Übrige " + kreuz.length + " Matchups über Kreuz zusammen "
        + punkteText(kreuz.reduce((s, p) => s + p.punkte, 0)) + " Punkte") : null);
  }

  /* Wie die Zahl entsteht (Wunsch des Nutzers, 24.10.2026: "jegliche
     Winrates auf den Rollen sehen"). Jeder Posten aus engine/chance.js mit
     seinem Anteil an den Punkten - zusammen genau die Punkte der Leiste. */
  function chanceAufbau(c) {
    if (c.leer || !c.posten.length) return null;
    const wer = (p) => [el("span", {class: "ch-rolle"}, roleLabel(p.rolle)), " " + p.champ];
    const prozent = (x) => wrProzent({value: x});
    const seite = (p) => el("span", {class: "ch-seite"}, p.seite === "wir" ? "wir" : "Gegner");
    const ART = {champion: "Champion", matchup: "Matchup", synergie: "Synergie"};
    const wo = {
      champion: (p) => [seite(p), " ", ...wer(p.a)],
      matchup: (p) => [...wer(p.a), " gegen ", ...wer(p.b)],
      synergie: (p) => [seite(p), " ", ...wer(p.a), " + ", ...wer(p.b)],
    };
    // Groesster Anteil zuerst. Was gerundet +-0,0 ergibt, steht eingeklappt
    // am Ende - weg ist es nicht, jede Winrate bleibt abrufbar.
    const nichts = (p) => Math.abs(p.punkte) < 0.05;
    const posten = [...c.posten].sort((a, b) => Math.abs(b.punkte) - Math.abs(a.punkte));
    const zeilen = posten.map((p) => el("li", {hidden: nichts(p)},
      el("span", {class: "ch-wer"}, el("span", {class: "ch-art"}, ART[p.art]), " ", ...wo[p.art](p)),
      el("span", {class: "ch-wert"}, prozent(p.wert)),
      el("span", {class: "ch-erwartet"}, p.erwartet === undefined ? "" : "erwartet " + prozent(p.erwartet)),
      el("span", {class: "ch-n"}, tausend(p.n) + " Partien"),
      el("span", {class: "ch-punkte"}, punkteText(p.punkte))));
    const anzahlNichts = posten.filter(nichts).length;
    if (anzahlNichts) {
      const knopf = el("button", {class: "ch-mehr", type: "button"},
        anzahlNichts + " weitere mit ±0,0 zeigen");
      const zeile = el("li", {class: "ch-mehr-zeile"}, knopf);
      knopf.addEventListener("click", () => {
        for (const z of zeilen) z.hidden = false;
        zeile.remove();
      });
      zeilen.push(zeile);
    }
    const d = el("details", {class: "ch-aufbau"},
      el("summary", {}, "Wie die " + chanceProzent(c) + " entstehen"),
      el("div", {class: "ch-aufbau-inhalt"},
        el("span", {class: "ch-gruppe-kopf"}, "Was die Zahl bewegt · größter Anteil zuerst"),
        el("ul", {class: "ch-posten"}, zeilen),
        el("p", {class: "ch-hinweis"}, "Champion: Patch-Winrate auf der Rolle. Matchup und Synergie: "
          + "gemessen gegen das, was die beiden Winrates erwarten lassen. Rechts der Anteil an den "
          + punkteText(c.punkte) + " Punkten; Paare mit wenigen Partien zählen weniger (rauschbereinigt).")));
    // Jeder Pick zeichnet die Leiste neu - offen bleibt sie trotzdem.
    d.open = chanceAufbau.offen === true;
    d.addEventListener("toggle", () => { chanceAufbau.offen = d.open; });
    return d;
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
    // Blind (Lanegegner offen) oder Counter (steht) - je Modus eigener Stand,
    // damit beim Wechsel die passende Sortierung greift (Nutzer, 22.10.2026).
    const modus = a.gegner.length ? "counter" : "blind";
    // Mehrere Lanegegner (Bot: ADC und Support): Mittel der bereinigten
    // Abstaende zum Schnitt - der Counter gegen die ganze Lane.
    const laneMittel = (x) => {
      const ds = a.gegner.map((g, i) => x.gegenBereinigt[i] === null || g.schnitt === null ? null
        : x.gegenBereinigt[i] - g.schnitt).filter((d) => d !== null);
      return ds.length ? ds.reduce((p, q) => p + q, 0) / ds.length : null;
    };
    const spalten = [
      ...(noten ? [{id: "note", wort: "Note", titel: "Note der Empfehlung (Komfort, Matchup, Comp, Meta)",
                    ordnung: (x) => note(x) ? note(x).score : null, note: true}] : []),
      {id: "chance", wort: "Team →", titel: "Draft laut Patchdaten, wenn wir ihn picken",
       roh: (x) => ({value: x.chance}), ordnung: (x) => x.chance, prozent: true},
      ...a.gegner.map((g, i) => ({id: "gegen:" + g.champ, wort: "vs " + g.champ, schnitt: g.schnitt,
       titel: "Winrate gegen " + g.champ + " (" + (ENGINE.ROLLEN_WORT[g.rolle] || g.rolle) + ") – wie gut er gegen ihn steht",
       roh: (x) => x.gegen[i], ordnung: (x) => x.gegenBereinigt[i], art: "matchup"})),
      ...(a.gegner.length > 1 ? [{id: "lane", wort: "Lane Ø", laneGesamt: true, ordnung: laneMittel,
           titel: "Gegen die ganze Lane: Mittel der Abstände zum Schnitt gegen "
                  + a.gegner.map((g) => g.champ).join(" und ") + " (rauschbereinigt), in Punkten"}] : []),
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
    const st = {filter: "alle", sort: null, vergebene: false, offen: false, lane: false, braucht: [], proBlind: false, typ: null,
                ...(laneStand.get(rolleName + "|" + modus) || {})};
    // Standard: gegen den ersten Lanegegner, sonst Team -> (die Spalte, die
    // alles zusammennimmt). Eine gemerkte Spalte, die es nicht mehr gibt,
    // faellt zurueck.
    // Blind: die in Pro ueblichen Blind Picks zuerst; Counter: wer gegen die
    // ganze Lane am besten steht.
    if (!spalten.some((s) => s.id === st.sort)) {
      const erstesMatchup = spalten.find((s) => s.art === "matchup");
      st.sort = modus === "blind" ? (PRO ? "pro" : sortStandard && spalten.some((s) => s.id === sortStandard)
                                      ? sortStandard : "chance")
        : a.gegner.length > 1 ? "lane" : erstesMatchup.id;
    }
    const setze = (teil) => { laneStand.set(rolleName + "|" + modus, {...st, ...teil}); neuZeichnen(); };

    const imPlan = (c) => !!plan && (plan.blind.includes(c) || plan.likes.includes(c));
    const gegenSpalten = spalten.filter((s) => s.art === "matchup" && s.schnitt !== null && s.schnitt !== undefined);
    const laneStark = (x) => gegenSpalten.length > 0 && gegenSpalten.every((s) => {
      const w = s.roh(x);
      return w && w.value - s.schnitt >= ENGINE.BEGRUENDUNG.matchup;
    });
    const bedarfDa = (bedarf || []).filter((b) => b && b.achse && bringt);
    const braucht = (st.braucht || []).filter((a) => bedarfDa.some((b) => b.achse === a));
    const proBlind = (x) => { const v = proVon(x.champ, rolleName); return !!(v && v.blind); };
    // AD/AP (22.10.2026): Schadenstyp des Kandidaten auf der Rolle - dieselbe
    // Regel wie "bringt physischen/magischen Schaden" im Lagebild.
    const typVon = (x) => !bringt ? null : bringt(x.champ, "magisch") ? "AP" : bringt(x.champ, "physisch") ? "AD" : null;
    const unsere = (z.picks[z.wirSind] || []).filter(Boolean);
    const mischung = (picks) => { const p = liveTeile.comp.profil(picks); return p.schaden ? p.schaden.magisch.value : null; };
    const jetztMagisch = unsere.length ? mischung(unsere) : null;
    const danach = (xs) => {
      const ws = xs.map((x) => mischung([...unsere, {champ: x.champ, rolle: rolleName}])).filter((w) => w !== null);
      return ws.length ? ws.reduce((p, q) => p + q, 0) / ws.length : null;
    };
    const grundPasst = (x) => (st.vergebene || !gesperrt.has(x.champ));
    const passt = (x) => (st.filter !== "pool" || (pool && pool.has(x.champ)))
      && (st.filter !== "plan" || imPlan(x.champ))
      && grundPasst(x)
      && (!st.lane || laneStark(x))
      && braucht.every((a) => bringt(x.champ, a))
      && (!st.proBlind || proBlind(x))
      && (!st.typ || typVon(x) === st.typ);
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
    const box = el("section", {class: "ko-liste lt " + modus, "aria-label": "Kandidaten für " + ROLES[rolle][1]},
      el("div", {class: "ko-kopf"},
        el("span", {class: "cp-klein"}, (modus === "blind" ? "Blind Pick " : "Counterpick ")
          + ROLES[rolle][1] + " · " + gegnerText),
        el("span", {class: "lt-modus"}, modus === "blind"
          ? (PRO ? "sortiert: in Pro am häufigsten blind gepickt" : "")
          : "sortiert: " + (a.gegner.length > 1 ? "stärkster gegen die ganze Lane" : "stärkster gegen " + a.gegner[0].champ)
            + " · wenige Spiele zählen weniger („zählt“)"),
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
      ...(bringt ? ["AD", "AP"].map((typ) => {
        const xs = basis.filter((x) => typVon(x) === typ), d = danach(xs);
        return chip(typ + (d === null ? "" : " · danach Ø " + Math.round(d * 100) + " % magisch"), st.typ === typ, xs.length,
          () => setze({typ: st.typ === typ ? null : typ, offen: false}),
          typ === "AD" ? "Vor allem physischer Schaden auf dieser Rolle (gemessen)"
                       : "Vor allem magischer Schaden auf dieser Rolle (gemessen)");
      }) : []),
      PRO ? chip("Pro blind gepickt", st.proBlind, basis.filter(proBlind).length,
        () => setze({proBlind: !st.proBlind, offen: false}),
        "In den Pro-Ligen (Patches " + proFenster() + ") auf dieser Rolle blind gepickt") : null,
    ].filter(Boolean);
    if (eingrenzen.length) {
      box.append(el("div", {class: "lt-eingrenzen", role: "group", "aria-label": "Eingrenzen"},
        el("span", {class: "cp-klein"}, "Eingrenzen"), eingrenzen,
        jetztMagisch === null ? null : el("span", {class: "lt-modus"},
          "Team jetzt " + Math.round(jetztMagisch * 100) + " % magisch")));
    }
    // Pro: die uebliche Blind Picks dieser Rolle auf einen Blick.
    if (PRO) {
      const blind = modus === "blind";
      const zahl = (v) => blind ? v.blind : v.picks - v.blind;
      const ueblich = Object.entries(PRO.champions)
        .map(([c, je]) => [c, je[rolleName]]).filter(([, v]) => v && zahl(v) > 0)
        .sort((p, q) => zahl(q[1]) - zahl(p[1]) || q[1].picks - p[1].picks).slice(0, 8);
      if (ueblich.length) {
        box.append(el("div", {class: "lt-pro-leiste"},
          el("span", {class: "cp-klein"}, blind ? "Pro · übliche Blind Picks " + ROLES[rolle][1]
            : "Pro · häufig als Antwort gepickt (nach dem Lanegegner) · " + ROLES[rolle][1]),
          el("div", {class: "lt-pro-liste"}, ueblich.map(([c, v]) => el("span", {
              class: "lt-pro-chip" + (gesperrt.has(c) ? " weg" : ""), title: proTitel(c, rolleName)
                + (gesperrt.has(c) ? " · " + gesperrt.get(c) : "")},
            iconUrl(c) ? el("img", {src: iconUrl(c), alt: ""}) : null,
            el("b", {}, c),
            el("span", {}, blind ? v.blind + "× blind · " + Math.round(v.blindSiege / v.blind * 100) + " %"
              : zahl(v) + "× als Antwort · " + Math.round((v.siege - v.blindSiege) / zahl(v) * 100) + " %"))))));
      }
    }

    if (!a.gegner.length) {
      box.append(el("p", {class: "wr-quelle"}, "Sobald der Gegner für " + ROLES[rolle][1]
        + " gepickt hat, kommt je Lanegegner eine Spalte „vs …“ dazu."));
    }
    const zelle = (s, x) => {
      if (s.laneGesamt) {
        const d = laneMittel(x), g = ENGINE.BEGRUENDUNG.matchup;
        return el("span", {class: "lt-wert" + (d === null ? "" : d >= g ? " h2" : d >= 0 ? " h1" : d > -g ? " l1" : " l2")
                             + (s.id === st.sort ? " sortiert" : ""), "data-wort": s.wort, role: "cell", title: s.titel},
          el("b", {}, d === null ? "–" : (d >= 0 ? "+" : "−") + Math.abs(d * 100).toLocaleString("de-DE",
            {minimumFractionDigits: 1, maximumFractionDigits: 1})));
      }
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
        klein ? el("small", {class: "wr-neben"}, klein) : null,
        // In der sortierten Spalte der Wert, nach dem sortiert wird: wenige
        // Spiele zaehlen weniger (Nutzer, 22.10.2026: "nicht in Reihenfolge").
        s.id === st.sort && s.art && mitSchnitt && w && s.ordnung(x) !== null
          ? el("small", {class: "wr-neben lt-zaehlt"}, "zählt " + ltAbstand({value: s.ordnung(x)}, s.schnitt)) : null);
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
      box.append(el("p", {class: "cp-leer"}, st.lane || braucht.length || st.proBlind || st.typ
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
