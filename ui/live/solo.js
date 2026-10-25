  /* ================================================== Solo Queue
     Getrennt vom Team-Live-Draft: eigener Zustand, eigene Oberflaeche.
     Gebaut fuer den Champ Select neben dem Client - die Antwort auf
     "was picke ich jetzt" muss in Sekunden ablesbar sein. Ich habe einen
     Pool - und seit 20.10.2026 auch Mitspieler aus dem Kader, mit denen ich
     in der Queue bin (Duo, Flex-Gruppe): deren Pool zaehlt fuer ihre Rolle,
     und die Empfehlung laesst sich fuer sie umschalten. Alle anderen sind
     fremd. Rolle und Pickposition sind fest: kein "Rolle aufheben", keine
     Seitenwahl. */
  const soloStand = {bans: {eigen: leer5(), gegner: leer5()},
                     picks: {eigen: leer5(), gegner: leer5()}};
  let soloRisiko = (() => {
    try {
      const r = window.localStorage.getItem("solo-risiko");
      return ["sicher", "ausgewogen", "aggressiv"].includes(r) ? r : "ausgewogen";
    } catch (e) { return "ausgewogen"; }
  })();
  const soloCache = new Map();
  const SOLO_KURZ = 5;                         // so viele je Spalte auf einen Blick
  let soloLetzte = null;         // {z, liste} - die Empfehlung, die gerade steht
  let soloFuer = 0;              // wessen Empfehlung: 0 = ich, sonst Mitspieler i-1

  function soloZustand() {
    return ENGINE.ausFeldern({picks: soloStand.picks, bans: soloStand.bans,
                              wirSind: "blue", patch: DRAFT.patch});
  }

  // Mitspieler aus dem Kader, mit denen ich in der Queue bin - je mit Rolle.
  // Gespeichert neben "ich" (liveSolo[team] = {label, rolle, mit: [...]}).
  function soloMit() {
    const e = liveSolo[team.team];
    const ich = liveSoloIch();
    return ((e && e.mit) || [])
      .map((m) => ({p: team.players.find((x) => x.label === m.label) || null, rolle: m.rolle}))
      .filter((m) => m.p && Number.isInteger(m.rolle) && (!ich || m.p.label !== ich.label));
  }
  // Alle bekannten Leute in der Queue: ich zuerst, dann die Mitspieler.
  function soloLeute() {
    const ich = liveSoloIch();
    return [{p: ich, rolle: liveSoloRolle(), ich: true}, ...soloMit().map((m) => ({...m, ich: false}))];
  }
  // Fuer wen die Empfehlung gerade steht.
  function soloPerson() {
    const leute = soloLeute();
    return leute[soloFuer] || leute[0];
  }
  function soloMitSetzen(mit) {
    const e = liveSolo[team.team] || {label: null, rolle: liveSoloRolle()};
    liveSolo[team.team] = {...e, mit: mit.map((m) => ({label: m.p ? m.p.label : m.label, rolle: m.rolle}))};
    soloSichern();
    soloCache.clear();
    if (soloFuer > mit.length) soloFuer = 0;
    renderSolo();
  }

  // Wer spielt eine Rolle: ich oder ein Mitspieler aus dem Kader. Alle
  // anderen sind fremd.
  const soloSpielerFuer = (rolleName) => {
    const x = soloLeute().find((m) => m.p && ROLES[m.rolle][0] === rolleName);
    return x ? {team: x.p.team, label: x.p.label} : null;
  };

  function soloRangliste() {
    const z = soloZustand();
    const person = soloPerson();
    const rolle = person.rolle;
    const sp = liveObjektiv ? null : person.p;
    const k = ENGINE.schluessel(z, "solo|" + rolle + "|" + soloRisiko + "|" + (liveObjektiv ? "objektiv|" : "")
                                + soloLeute().map((m) => (m.p ? m.p.label : "") + "@" + m.rolle).join(","));
    if (!soloCache.has(k)) {
      if (soloCache.size > 40) soloCache.clear();
      soloCache.set(k, liveTeile.suche.rangliste(z, ROLES[rolle][0], {
        spielerTeam: sp ? sp.team : null, spielerLabel: sp ? sp.label : null,
        spielerFuer: liveObjektiv ? () => null : soloSpielerFuer, risikoprofil: soloRisiko, gegnerFuer: () => null,
      }));
    }
    return {z, liste: soloCache.get(k)};
  }

  // Pool: gespielt (ab 3 Partien) oder im Draftplan - von dem, fuer den die
  // Empfehlung gerade steht.
  function soloImPool(champ, wer = soloPerson().p) {
    if (!wer) return false;
    const k = liveTeile.mannschaft.komfort(wer.team, wer.label, champ);
    const plan = planOf(wer);
    return (k && k.sampleSize >= 3) || plan.blind.includes(champ) || plan.likes.includes(champ);
  }

  const soloStufe = (score) => score >= ENGINE.ANZEIGE.gruenAb ? "sehrgut"
    : score >= ENGINE.ANZEIGE.orangeAb ? "gut" : "";

  // Ein Grund, eine Gefahr - mehr steht beim Aufklappen.
  function soloGrund(r) {
    return r.reasons[0] || (r.components.lane ? r.components.lane.text : "")
      || (r.components.komfort ? "Komfort: " + r.components.komfort.text : "");
  }
  // Der Risikotext der Engine nennt Stufe, Wahrscheinlichkeit und Quote
  // ("sehr gefaehrlicher Counter noch verfuegbar: ...") - eine nackte
  // Prozentzahl sagte nicht, wie schlimm es waere.
  function soloGefahr(r) {
    return r.risks[0] || "";
  }

  function soloPicken(champ) {
    const rolle = soloPerson().rolle;
    const grund = ENGINE.feldSperre(soloStand, champ, {art: "picks", seite: "eigen", i: rolle});
    if (grund) { soloHinweis("eigen", champ + " kann nicht gepickt werden: " + grund); return; }
    soloStand.picks.eigen[rolle] = champ;
    soloProtokoll(champ);
    renderSolo();
  }

  // Ins Solo-Protokoll erst, wenn ich wirklich picke - mit der Empfehlung,
  // die in dem Moment stand. So ist jeder Eintrag eine Entscheidung.
  function soloProtokoll(champ) {
    if (!soloLetzte || !soloLetzte.liste.length) return;
    liveTeile.protokollSolo.notiere(soloLetzte.z, ROLES[soloPerson().rolle][0], soloLetzte.liste,
                                    {gewaehlt: champ, risikoprofil: soloRisiko});
  }

  let soloHinweisUhr = null;
  function soloHinweis(seite, text) {
    const ziel = document.querySelector("#solo-draft .so-team." + seite + " .so-hinweis");
    if (!ziel) return;
    ziel.textContent = text;
    clearTimeout(soloHinweisUhr);
    soloHinweisUhr = setTimeout(() => { ziel.textContent = ""; }, 4500);
  }

  function soloFreiListe() {
    const liste = document.getElementById("so-frei");
    if (!liste) return;
    const weg = new Set([...soloStand.picks.eigen, ...soloStand.picks.gegner,
                         ...soloStand.bans.eigen, ...soloStand.bans.gegner].filter(Boolean));
    liste.textContent = "";
    liste.append(...CHAMPIONS.filter((c) => !weg.has(c)).map((c) => el("option", {value: c})));
  }

  function soloFeld(seite, art, i, beschriftung) {
    const feld = champField("so-" + seite + "-" + art + "-" + i, beschriftung, () => {});
    const eingabe = feld.querySelector("input");
    eingabe.setAttribute("list", "so-frei");
    eingabe.value = soloStand[art][seite][i] || "";
    eingabe.dispatchEvent(new Event("input"));
    eingabe.addEventListener("change", () => {
      const champ = normaliseChamp(eingabe.value) || null;
      const grund = champ ? ENGINE.feldSperre(soloStand, champ, {art, seite, i}) : null;
      if (grund) {
        eingabe.value = soloStand[art][seite][i] || "";
        eingabe.dispatchEvent(new Event("input"));
        soloHinweis(seite, champ + (art === "bans" ? " ist nicht bannbar: "
                                    : " kann nicht gepickt werden: ") + grund);
        return;
      }
      const meinPick = art === "picks" && seite === "eigen" && i === soloPerson().rolle;
      soloStand[art][seite][i] = champ;
      if (meinPick && champ) soloProtokoll(champ);
      soloAktualisieren();
    });
    return feld;
  }

  function soloTeam(seite) {
    const meine = soloPerson().rolle;
    const ichRolle = liveSoloRolle();
    const mit = soloMit();
    const lane = new Set(ENGINE.LANE_GEGNER[ROLES[meine][0]] || []);
    return el("section", {class: "so-team " + seite, "aria-label": seite === "eigen" ? "Mein Team" : "Gegner"},
      el("h3", {class: "so-team-name"}, seite === "eigen" ? "Mein Team" : "Gegner"),
      el("div", {class: "so-bans"},
        el("span", {class: "so-klein"}, "Bans"),
        el("div", {class: "so-bans-felder"},
          [0, 1, 2, 3, 4].map((i) => soloFeld(seite, "bans", i, "Ban " + (i + 1))))),
      el("div", {class: "so-picks"}, ROLES.map(([wert, wort], i) => {
        const ich = seite === "eigen" && i === ichRolle;
        const kumpel = seite === "eigen" ? mit.find((m) => m.rolle === i) : null;
        const fuer = seite === "eigen" && i === meine;
        const gegenueber = seite === "gegner" && lane.has(wert);
        return el("div", {class: "so-zeile" + (ich ? " ich" : "") + (kumpel ? " kumpel" : "")
                                 + (fuer ? " fuer" : "") + (gegenueber ? " lane" : ""),
                          style: "--so-rolle: var(" + CP_ROLLE_VAR[wert] + ")"},
          el("span", {class: "so-rolle"}, wort),
          soloFeld(seite, "picks", i, wort),
          ich ? el("span", {class: "so-marke ich"}, "du")
            : kumpel ? el("span", {class: "so-marke kumpel", title: kumpel.p.label}, mit.length > 1 ? "Gruppe" : "Duo")
            : gegenueber ? el("span", {class: "so-marke lane"}, "Lane") : el("span"),
          kumpel ? el("span", {class: "so-wer"}, kumpel.p.label) : null);
      })),
      el("span", {class: "so-hinweis", role: "status", "aria-live": "polite"}));
  }

  function soloEmpfehlung(r, {gross = false} = {}) {
    const src = iconUrl(r.champion);
    const rolle = soloPerson().rolle;
    const z = soloZustand();
    const w = liveWinraten(z, r.champion, rolle);
    const pool = soloImPool(r.champion);
    const grund = soloGrund(r), gefahr = soloGefahr(r);
    const knopf = el("button", {class: "so-picken", type: "button"}, "Picken");
    knopf.addEventListener("click", (e) => { e.preventDefault(); soloPicken(r.champion); });
    // Wie stuende er gegen den Lanegegner - vor dem Picken (Nutzer, 25.10.2026).
    const nach = liveChanceMit(z, r.champion, rolle);
    const lane = new Set(ENGINE.LANE_GEGNER[ROLES[rolle][0]] || []);
    const duelle = nach ? nach.posten.filter((p) => p.art === "matchup"
      && p.a.champ === r.champion && lane.has(p.b.rolle)) : [];
    const kopf = el("summary", {class: "so-rec-kopf"},
      src ? el("img", {class: "so-bild", src, alt: "", loading: "lazy"}) : null,
      el("span", {class: "so-rec-name"},
        el("b", {}, r.champion),
        pool ? el("span", {class: "so-pool"}, "Pool") : null),
      el("span", {class: "so-note " + soloStufe(r.score), title: "Note \u00b7 Entscheidungswert "
                  + Math.round(r.entscheidung)}, String(r.score)),
      grund ? el("span", {class: "so-grund"}, grund) : null,
      gefahr ? el("span", {class: "so-gefahr"}, gefahr) : null,
      // Winrate allgemein und gegen den Lanegegner - immer sichtbar.
      el("span", {class: "so-wr"}, wrKurz(w), " ",
         chanceNach(nach, liveDraftChance(z))));
    const mehr = el("div", {class: "so-rec-mehr"},
      duelle.length ? el("div", {class: "du-liste"}, duelle.map((m) => laneDuell(nach, m))) : null,
      wrBegruendung(r.reasons, r.risks),
      wrBlock(w, ROLES[rolle][1]),
      knopf);
    // Die grosse Empfehlung steht offen: Begruendung und Winraten sofort.
    return el("details", {class: "so-rec" + (gross ? " gross" : ""), open: gross}, kopf, mehr);
  }

  // "Empfehlung fuer": ich oder ein Mitspieler - nur wenn jemand mitspielt.
  function soloFuerWahl() {
    const leute = soloLeute();
    if (leute.length < 2) return null;
    return el("div", {class: "so-fuer", role: "group", "aria-label": "Empfehlung für"},
      el("span", {class: "so-klein"}, "Empfehlung für"),
      leute.map((m, i) => {
        const gepickt = soloStand.picks.eigen[m.rolle];
        const k = el("button", {type: "button", class: "so-fuer-knopf", "aria-pressed": String(i === soloFuer)},
          (m.ich ? "Du" : m.p.label) + " · " + ROLES[m.rolle][1],
          gepickt ? el("span", {class: "so-fuer-hat"}, " – hat " + gepickt) : null);
        // Ganz neu zeichnen: die Markierungen "fuer" und "Lane" wandern mit.
        k.addEventListener("click", () => { soloFuer = i; renderSolo(); });
        return k;
      }));
  }

  function soloMitte() {
    const box = el("section", {class: "so-mitte", "aria-label": "Empfehlung"});
    const {z, liste} = soloRangliste();
    const person = soloPerson();
    const rolle = person.rolle;
    const gepickt = soloStand.picks.eigen[rolle];
    soloLetzte = gepickt ? null : {z, liste};
    const wahl = soloFuerWahl();
    if (wahl) box.append(wahl);
    if (gepickt) {
      box.append(el("div", {class: "so-fertig"},
        el("span", {class: "so-klein"}, person.ich ? "Dein Pick" : "Pick von " + person.p.label),
        el("b", {}, gepickt),
        el("span", {class: "sub"}, "Feld leeren, um wieder Empfehlungen zu sehen.")));
      return box;
    }
    const erster = liste[0];
    const lage = erster && erster.lage;
    box.append(el("div", {class: "so-modus " + (lage ? lage.modus : "")},
      el("span", {class: "so-klein"}, "Jetzt picken \u00b7 " + ROLES[rolle][1]
         + (person.ich ? "" : " \u00b7 für " + person.p.label)),
      lage ? el("span", {class: "so-modus-text"}, lage.modus === "counter" ? "Counterpick"
        : lage.modus === "teilweise" ? "Lane teilweise bekannt" : "Blindpick") : null));
    if (erster) box.append(soloEmpfehlung(erster, {gross: true}));
    // Eine Tabelle statt zweier Listen (Entwurf B+C, 20.10.2026): alle
    // Kandidaten der Rolle mit Note, Team ->, gegen die Lanegegner, mit dem
    // Lanepartner, allgemein und dem Grund - nach Note sortiert, filterbar
    // (Pool, Plan). Die Rangliste liefert Note, Grund und Risiko.
    const sp = person.p;
    box.append(laneTabelle({z, rolle,
      gesperrt: new Map([...ENGINE.gesperrt(z)].map(([c, v]) => [c, v.text || "vergeben"])),
      pool: {has: (c) => soloImPool(c, sp)}, plan: sp ? planOf(sp) : null, wer: sp ? sp.label : null,
      picken: soloPicken, neuZeichnen: soloAktualisieren,
      noten: new Map(liste.map((x) => [x.champion, {score: x.score, grund: soloGrund(x), risiko: soloGefahr(x)}])),
      mitGrund: true, sortStandard: "note",
      bedarf: liveTeile.strategie.lagebild(z, {spielerFuer: soloSpielerFuer}).bedarf || [],
      bringt: (c, achse) => liveTeile.strategie.bringt(c, ROLES[rolle][0], achse) !== null}));
    return box;
  }

  function soloLage(z) {
    const L = liveTeile.strategie.lagebild(z, {spielerFuer: soloSpielerFuer});
    const g = L.groessteGefahr, b = L.groessterBedarf, s = L.siegbedingung;
    const traeger = (x) => (x && x.traeger || []).map((t) => t.champ || t).filter(Boolean);
    const feld = (wort, wert, unter) => el("div", {class: "so-lage-feld"},
      el("span", {class: "so-klein"}, wort),
      wert ? el("b", {}, wert) : el("span", {class: "so-leer"}, "ab den ersten Picks"),
      unter ? el("span", {class: "so-lage-unter"}, unter) : null);
    return el("section", {class: "so-lage", "aria-label": "Lagebild"},
      feld("Bedarf", b ? b.wort : null, b ? b.grund : null),
      feld("Größte Gefahr", g ? g.wort : null, g && traeger(g).length ? traeger(g).join(", ") : null),
      feld("Siegbedingung", s ? s.wort : null, s && s.phase ? s.phase : null));
  }

  function soloKopf() {
    const ich = liveSoloIch();
    const wer = el("select", {class: "so-wahl", "aria-label": "Wer bist du"},
      el("option", {value: ""}, "Wer bist du?"),
      team.players.map((p) => el("option", {value: p.label}, p.label + (p.bench ? " \u00b7 Bank" : ""))));
    wer.value = ich ? ich.label : "";
    const rolle = el("select", {class: "so-wahl", "aria-label": "Deine Rolle"},
      ROLES.map(([, wort], i) => el("option", {value: String(i)}, wort)));
    rolle.value = String(liveSoloRolle());
    const setze = (eintrag) => {
      const alt = liveSolo[team.team] || {};
      // Mitspieler bleiben; wer jetzt "ich" ist oder meine Rolle hat, faellt raus.
      const mit = (alt.mit || []).filter((m) => m.label !== eintrag.label && m.rolle !== eintrag.rolle);
      liveSolo[team.team] = {...eintrag, mit};
      soloFuer = 0;
      soloSichern();
      soloCache.clear();
      renderSolo();
    };
    wer.addEventListener("change", () => {
      const p = team.players.find((x) => x.label === wer.value) || null;
      const r = p ? ROLES.findIndex(([w]) => w === p.role) : -1;
      setze({label: wer.value || null, rolle: r >= 0 ? r : liveSoloRolle()});
    });
    rolle.addEventListener("change", () => setze({label: ich ? ich.label : null, rolle: Number(rolle.value)}));

    const risiko = el("select", {class: "so-wahl", "aria-label": "Risikoprofil"},
      [["sicher", "sicher"], ["ausgewogen", "ausgewogen"], ["aggressiv", "aggressiv"]]
        .map(([w, t]) => el("option", {value: w}, t)));
    risiko.value = soloRisiko;
    risiko.addEventListener("change", () => {
      soloRisiko = risiko.value;
      try { window.localStorage.setItem("solo-risiko", soloRisiko); } catch (e) { /* egal */ }
      renderSolo();
    });
    const leeren = el("button", {class: "so-leeren", type: "button"}, "Draft leeren");
    leeren.addEventListener("click", () => {
      soloStand.bans.eigen = leer5(); soloStand.bans.gegner = leer5();
      soloStand.picks.eigen = leer5(); soloStand.picks.gegner = leer5();
      renderSolo();
    });
    const einst = el("details", {class: "so-einst"},
      el("summary", {}, "Einstellungen"),
      el("div", {class: "so-einst-inhalt"},
        el("label", {}, el("span", {class: "so-klein"}, "Risiko"), risiko),
        el("p", {class: "sub"}, "Sicher: der schlechteste Ausgang zählt mehr. Aggressiv: der beste."),
        el("p", {class: "sub"}, liveTeile.protokollSolo.anzahl() + " Picks im Solo-Protokoll.")));
    return el("header", {class: "so-kopf"},
      el("h2", {class: "so-titel"}, "Solo Queue"),
      el("div", {class: "so-ich"}, el("span", {class: "so-klein"}, "Du"), wer,
         el("span", {class: "so-klein"}, "auf"), rolle),
      el("div", {class: "so-kopf-rechts"}, objektivSchalter(() => { soloCache.clear(); renderSolo(); }),
         liveDatenstand(), leeren, einst));
  }

  /* In der Queue: Solo, Duo oder Gruppe (bis 5) - Mitspieler aus dem
     Kader mit ihrer Rolle. Die Art ergibt sich aus der Zahl, kein eigener
     Schalter. */
  function soloGruppe() {
    const ich = liveSoloIch();
    const mit = soloMit();
    const belegt = new Set([liveSoloRolle(), ...mit.map((m) => m.rolle)]);
    const art = mit.length === 0 ? "Solo" : mit.length === 1 ? "Duo" : "Gruppe · " + (mit.length + 1);
    const chip = (m, i) => {
      const rolle = el("select", {class: "so-chip-rolle", "aria-label": "Rolle von " + m.p.label},
        ROLES.map(([, wort], j) => el("option", {value: String(j),
          disabled: j !== m.rolle && belegt.has(j)}, wort)));
      rolle.value = String(m.rolle);
      rolle.addEventListener("change", () => {
        const neu = mit.slice();
        neu[i] = {...m, rolle: Number(rolle.value)};
        soloMitSetzen(neu);
      });
      const weg = el("button", {type: "button", class: "so-chip-weg", "aria-label": m.p.label + " entfernen"}, "\u00d7");
      weg.addEventListener("click", () => soloMitSetzen(mit.filter((_, j) => j !== i)));
      return el("span", {class: "so-chip", style: "--so-rolle: var(" + CP_ROLLE_VAR[ROLES[m.rolle][0]] + ")"},
        el("b", {}, m.p.label), rolle, weg);
    };
    const frei = team.players.filter((p) => (!ich || p.label !== ich.label) && !mit.some((m) => m.p.label === p.label));
    const dazu = mit.length < 4 && belegt.size < 5 && frei.length
      ? el("select", {class: "so-wahl so-dazu", "aria-label": "Mitspieler hinzufügen"},
          el("option", {value: ""}, "+ Mitspieler aus dem Kader"),
          frei.map((p) => el("option", {value: p.label}, p.label + (p.bench ? " \u00b7 Bank" : ""))))
      : null;
    if (dazu) dazu.addEventListener("change", () => {
      const p = team.players.find((x) => x.label === dazu.value);
      if (!p) return;
      // Seine Hauptrolle, wenn frei - sonst die erste freie.
      const haupt = ROLES.findIndex(([w]) => w === p.role);
      const rolle = haupt >= 0 && !belegt.has(haupt) ? haupt : ROLES.findIndex((_, j) => !belegt.has(j));
      soloMitSetzen([...mit, {p, rolle}]);
    });
    return el("section", {class: "so-gruppe", "aria-label": "In der Queue"},
      el("span", {class: "so-klein"}, "In der Queue"),
      el("b", {class: "so-gruppe-art"}, art),
      ich ? el("span", {class: "so-chip ich", style: "--so-rolle: var(" + CP_ROLLE_VAR[ROLES[liveSoloRolle()][0]] + ")"},
        el("b", {}, ich.label), el("span", {class: "so-chip-wort"}, ROLES[liveSoloRolle()][1] + " · du")) : null,
      mit.map(chip),
      ich ? dazu : el("span", {class: "sub"}, "Erst oben wählen, wer du bist."),
      el("span", {class: "so-gruppe-info"}, "Mitspieler aus dem Kader bringen ihren Pool mit – alle anderen bleiben fremd."));
  }

  // Nur Mitte und Lagebild neu - die Felder behalten Fokus und Eingabe.
  function soloAktualisieren() {
    const host = document.getElementById("solo-draft");
    if (!host || !host.querySelector(".so-mitte")) { renderSolo(); return; }
    const z = soloZustand();
    host.querySelector(".so-mitte").replaceWith(soloMitte());
    host.querySelector(".so-lage").replaceWith(soloLage(z));
    const leiste = host.querySelector(".ch-leiste");
    if (leiste) leiste.replaceWith(chanceLeiste(liveDraftChance(z), {gegnerName: "Gegner", anzeige: true, duelle: true}));
    soloFreiListe();
  }

  function renderSolo() {
    const host = document.getElementById("solo-draft");
    if (!host) return;
    host.textContent = "";
    if (!liveTeile || !DRAFT) {
      host.append(el("p", {class: "hint"}, "Keine Draftdaten eingebettet."));
      return;
    }
    const z = soloZustand();
    host.append(
      el("datalist", {id: "so-frei"}),
      soloKopf(),
      soloGruppe(),
      chanceLeiste(liveDraftChance(z), {gegnerName: "Gegner", anzeige: true, duelle: true}),
      el("div", {class: "so-buehne"}, soloTeam("eigen"), soloMitte(), soloTeam("gegner")),
      soloLage(z),
      el("p", {class: "so-fuss"}, "Entscheidungshilfe, keine Prognose \u00b7 es zählen nur die Pools von dir "
        + "und deinen Mitspielern aus dem Kader, alle anderen sind fremd \u00b7 Daten aus der Solo Queue (DraftGap)."));
    soloFreiListe();
  }

