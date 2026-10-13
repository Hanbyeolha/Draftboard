  /* ================================================== Solo Queue
     Getrennt vom Team-Live-Draft: eigener Zustand, eigene Oberflaeche.
     Gebaut fuer den Champ Select neben dem Client - die Antwort auf
     "was picke ich jetzt" muss in Sekunden ablesbar sein. Nur ich habe
     einen Pool; Mitspieler und Gegner sind fremd. Rolle und Pickposition
     sind fest: kein "Rolle aufheben", keine Seitenwahl. */
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
  const soloMehr = {pool: false, ausser: false};
  let soloLetzte = null;         // {z, liste} - die Empfehlung, die gerade steht

  function soloZustand() {
    return ENGINE.ausFeldern({picks: soloStand.picks, bans: soloStand.bans,
                              wirSind: "blue", patch: DRAFT.patch});
  }

  // Wer spielt meine Rolle: ich. Alle anderen sind fremd.
  const soloSpielerFuer = (rolleName) => {
    const ich = liveSoloIch();
    return ich && ROLES[liveSoloRolle()][0] === rolleName ? {team: ich.team, label: ich.label} : null;
  };

  function soloRangliste() {
    const z = soloZustand();
    const rolle = liveSoloRolle();
    const ich = liveSoloIch();
    const k = ENGINE.schluessel(z, "solo|" + rolle + "|" + soloRisiko + "|"
                                + (ich ? ich.team + "/" + ich.label : ""));
    if (!soloCache.has(k)) {
      if (soloCache.size > 40) soloCache.clear();
      soloCache.set(k, liveTeile.suche.rangliste(z, ROLES[rolle][0], {
        spielerTeam: ich ? ich.team : null, spielerLabel: ich ? ich.label : null,
        spielerFuer: soloSpielerFuer, risikoprofil: soloRisiko, gegnerFuer: () => null,
      }));
    }
    return {z, liste: soloCache.get(k)};
  }

  // Mein Pool: gespielt (ab 3 Partien) oder im Draftplan.
  function soloImPool(champ) {
    const ich = liveSoloIch();
    if (!ich) return false;
    const k = liveTeile.mannschaft.komfort(ich.team, ich.label, champ);
    const plan = planOf(ich);
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
    const rolle = liveSoloRolle();
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
    liveTeile.protokollSolo.notiere(soloLetzte.z, ROLES[liveSoloRolle()][0], soloLetzte.liste,
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
      const meinPick = art === "picks" && seite === "eigen" && i === liveSoloRolle();
      soloStand[art][seite][i] = champ;
      if (meinPick && champ) soloProtokoll(champ);
      soloAktualisieren();
    });
    return feld;
  }

  function soloTeam(seite) {
    const meine = liveSoloRolle();
    const lane = new Set(ENGINE.LANE_GEGNER[ROLES[meine][0]] || []);
    return el("section", {class: "so-team " + seite, "aria-label": seite === "eigen" ? "Mein Team" : "Gegner"},
      el("h3", {class: "so-team-name"}, seite === "eigen" ? "Mein Team" : "Gegner"),
      el("div", {class: "so-bans"},
        el("span", {class: "so-klein"}, "Bans"),
        el("div", {class: "so-bans-felder"},
          [0, 1, 2, 3, 4].map((i) => soloFeld(seite, "bans", i, "Ban " + (i + 1))))),
      el("div", {class: "so-picks"}, ROLES.map(([wert, wort], i) => {
        const ich = seite === "eigen" && i === meine;
        const gegenueber = seite === "gegner" && lane.has(wert);
        return el("div", {class: "so-zeile" + (ich ? " ich" : "") + (gegenueber ? " lane" : "")},
          el("span", {class: "so-rolle"}, wort),
          soloFeld(seite, "picks", i, wort),
          ich ? el("span", {class: "so-marke ich"}, "du")
            : gegenueber ? el("span", {class: "so-marke lane"}, "Lane") : el("span"));
      })),
      el("span", {class: "so-hinweis", role: "status", "aria-live": "polite"}));
  }

  function soloEmpfehlung(r, {gross = false} = {}) {
    const src = iconUrl(r.champion);
    const pool = soloImPool(r.champion);
    const grund = soloGrund(r), gefahr = soloGefahr(r);
    const knopf = el("button", {class: "so-picken", type: "button"}, "Picken");
    knopf.addEventListener("click", (e) => { e.preventDefault(); soloPicken(r.champion); });
    const kopf = el("summary", {class: "so-rec-kopf"},
      src ? el("img", {class: "so-bild", src, alt: "", loading: "lazy"}) : null,
      el("span", {class: "so-rec-name"},
        el("b", {}, r.champion),
        pool ? el("span", {class: "so-pool"}, "Pool") : null),
      el("span", {class: "so-note " + soloStufe(r.score), title: "Note \u00b7 Entscheidungswert "
                  + Math.round(r.entscheidung)}, String(r.score)),
      grund ? el("span", {class: "so-grund"}, grund) : null,
      gefahr ? el("span", {class: "so-gefahr"}, gefahr) : null);
    const mehr = el("div", {class: "so-rec-mehr"},
      r.reasons.length ? el("ul", {class: "so-liste-gruende"},
        r.reasons.map((g) => el("li", {}, g))) : null,
      r.risks.length ? el("ul", {class: "so-liste-risiken"},
        r.risks.map((g) => el("li", {}, g))) : null,
      knopf);
    return el("details", {class: "so-rec" + (gross ? " gross" : "")}, kopf, mehr);
  }

  function soloMitte() {
    const box = el("section", {class: "so-mitte", "aria-label": "Empfehlung"});
    const {z, liste} = soloRangliste();
    const rolle = liveSoloRolle();
    const gepickt = soloStand.picks.eigen[rolle];
    soloLetzte = gepickt ? null : {z, liste};
    if (gepickt) {
      box.append(el("div", {class: "so-fertig"},
        el("span", {class: "so-klein"}, "Dein Pick"),
        el("b", {}, gepickt),
        el("span", {class: "sub"}, "Feld leeren, um wieder Empfehlungen zu sehen.")));
      return box;
    }
    const erster = liste[0];
    const lage = erster && erster.lage;
    box.append(el("div", {class: "so-modus " + (lage ? lage.modus : "")},
      el("span", {class: "so-klein"}, "Jetzt picken \u00b7 " + ROLES[rolle][1]),
      lage ? el("span", {class: "so-modus-text"}, lage.modus === "counter" ? "Counterpick"
        : lage.modus === "teilweise" ? "Lane teilweise bekannt" : "Blindpick") : null));
    if (erster) box.append(soloEmpfehlung(erster, {gross: true}));
    // Die Listen ergaenzen die grosse Empfehlung, statt sie zu wiederholen:
    // links mein Pool, rechts das Beste ausserhalb - keine Zeile doppelt.
    const ich = liveSoloIch();
    const rest = liste.filter((r) => r !== erster);
    const pool = ich ? rest.filter((r) => soloImPool(r.champion)) : [];
    const ausser = ich ? rest.filter((r) => !soloImPool(r.champion)) : rest;
    // Fuenf sind auf einen Blick lesbar; der Rest auf Wunsch, ganze Liste
    // in derselben Reihenfolge. Aufgeklappt bleibt aufgeklappt.
    const spalte = (titel, eintraege, leer, art) => {
      const offen = soloMehr[art];
      const sichtbar = offen ? eintraege : eintraege.slice(0, SOLO_KURZ);
      const mehr = eintraege.length > SOLO_KURZ
        ? el("button", {class: "so-mehr", type: "button", "aria-expanded": String(offen)},
             offen ? "weniger zeigen" : "alle " + eintraege.length + " zeigen")
        : null;
      if (mehr) mehr.addEventListener("click", () => { soloMehr[art] = !offen; soloAktualisieren(); });
      return el("div", {class: "so-spalte " + art},
        el("h4", {class: "so-klein"}, titel,
           eintraege.length ? el("span", {class: "so-anzahl"}, " · " + eintraege.length) : null),
        sichtbar.length ? sichtbar.map((r) => soloEmpfehlung(r))
          : el("p", {class: "so-leer"}, leer),
        mehr);
    };
    box.append(el("div", {class: "so-spalten"},
      spalte("Dein Pool", pool, ich ? "Kein Champion aus deinem Pool frei."
                                    : "Oben wählen, wer du bist – dann steht hier dein Pool.", "pool"),
      spalte(ich ? "Außerhalb deines Pools" : "Insgesamt", ausser, "Keine Kandidaten.", "ausser")));
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
      liveSolo[team.team] = eintrag;
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
      el("div", {class: "so-kopf-rechts"}, liveDatenstand(), leeren, einst));
  }

  // Nur Mitte und Lagebild neu - die Felder behalten Fokus und Eingabe.
  function soloAktualisieren() {
    const host = document.getElementById("solo-draft");
    if (!host || !host.querySelector(".so-mitte")) { renderSolo(); return; }
    const z = soloZustand();
    host.querySelector(".so-mitte").replaceWith(soloMitte());
    host.querySelector(".so-lage").replaceWith(soloLage(z));
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
      el("div", {class: "so-buehne"}, soloTeam("eigen"), soloMitte(), soloTeam("gegner")),
      soloLage(z),
      el("p", {class: "so-fuss"}, "Entscheidungshilfe, keine Prognose \u00b7 nur dein Pool zählt, "
        + "Mitspieler und Gegner sind fremd \u00b7 Daten aus der Solo Queue (DraftGap)."));
    soloFreiListe();
  }

