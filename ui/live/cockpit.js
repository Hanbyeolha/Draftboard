  /* ============================================ LIVE-Cockpit (Draftboard 2.0)
     Seit Phase 7 die Standardansicht des Team-Drafts; die klassische
     Ansicht (alle Rollen, Lagebild, Filter) bleibt einen Klick entfernt.
     Eine zweite Ansicht auf denselben Draft (liveStand): fuer
     fuenf Leute, die unter Zeitdruck gemeinsam entscheiden. Oben steht, wer
     dran ist und wie weit der Draft ist; links und rechts die Teams; in der
     Mitte die aktuelle Entscheidung in drei Stufen und die Shortlist.
     Eingabe als Schrittfolge: das zentrale Feld traegt in den Platz ein,
     den der aktuelle Schritt verlangt; die Teamfelder bleiben zum
     Korrigieren. Kein Timer (Entscheidung des Nutzers, 13.10.2026).
     Sperren, Fearless, Besetzung, Protokoll und Draftplan kommen aus dem
     Live Draft - dieselben Regeln, keine zweite Fassung. */

  const CP_ROLLE_VAR = {TOP: "--role-top", JUNGLE: "--role-jgl", MIDDLE: "--role-mid",
                        BOTTOM: "--role-bot", UTILITY: "--role-sup"};
  const CP_ICON = {
    stern: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 1.6l1.9 4 4.4.5-3.3 3 .9 4.3L8 11.2l-3.9 2.2.9-4.3-3.3-3 4.4-.5z"/></svg>',
    haken: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    kreuz: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  function cpIcon(name) {
    const s = el("span", {class: "cp-ico cp-ico-" + name, "aria-hidden": "true"});
    s.innerHTML = CP_ICON[name];
    return s;
  }

  const cockpit = storeAnlegen({
    // Standard ist das Cockpit; "klassisch" merkt sich, wer zurueckschaltet.
    an: (() => {
      try { return window.localStorage.getItem("live-ansicht") !== "klassisch"; } catch (e) { return true; }
    })(),
    rolle: null,                 // gewaehlte Rolle fuer unseren Pick; null = Vorschlag
    merk: (() => {
      try {
        const d = JSON.parse(window.localStorage.getItem("cockpit-merkliste") || "null");
        return d && typeof d === "object" && d.liste ? d : {nr: null, liste: {}};
      } catch (e) { return {nr: null, liste: {}}; }
    })(),
    vorher: null,                // Gesperrte beim letzten Zeichnen - fuer "vergeben"
    meldung: null,
    fokus: false,                // Eingabefeld nach dem Zeichnen wieder fokussieren
    // Draft-Log je Draft (Phase 3): {nr, eintraege: [{zeit, typ, art, seite, ...}]}
    log: (() => {
      try {
        const d = JSON.parse(window.localStorage.getItem("cockpit-log") || "null");
        return d && Array.isArray(d.eintraege) ? d : {nr: null, eintraege: []};
      } catch (e) { return {nr: null, eintraege: []}; }
    })(),
    stand: null,                 // Felder beim letzten Zeichnen - fuer das Log
    undo: null,                  // {text, stand, zurueck, bis}
    vorhersage: new Map(),       // Schluessel -> Gegner wahrscheinlich
    // Phase 4: Tastatur
    hilfe: false,                // Tastenhilfe offen
    logOffen: false,             // Draft-Log aufgeklappt (Taste L)
    auswahl: null,               // Option 1-5, die nach dem Zeichnen den Fokus bekommt
    // Phase 6: am Handy sind die Draft-Einstellungen eingeklappt
    einstellungenOffen: false,
    // Phase 7: was beim letzten Zeichnen schon da war - nur Neues bewegt sich.
    gesehen: null,               // {schritt, marken: Set, shortlist: Set}
  });
  // Schmal: dieselbe Grenze wie die Handy-Regeln im CSS (680 px).
  const cpEng = () => !!window.matchMedia && window.matchMedia("(max-width: 680px)").matches;
  // Touch ohne Maus: dort oeffnet ein Fokus im Feld die Bildschirmtastatur.
  const cpTouch = () => !!window.matchMedia
    && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const CP_UNDO_MS = 6000;
  const cockpitAn = () => cockpit.lies().an;

  function cockpitUmschalten() {
    const an = !cockpitAn();
    cockpit.setze({an});
    try { window.localStorage.setItem("live-ansicht", an ? "cockpit" : "klassisch"); } catch (e) { /* egal */ }
    renderLiveDraft();
  }

  function cockpitSchalter() {
    // Der Knopf nennt das Ziel, nicht den Zustand.
    const k = el("button", {class: "ld-reset cp-schalter", type: "button",
                            title: cockpitAn()
                              ? "Klassische Ansicht: alle Rollen, Lagebild, Filter und Matchkarten"
                              : "Zurück ins Cockpit: Zug, Empfehlungen in drei Stufen, Shortlist"},
                 cockpitAn() ? "Klassische Ansicht" : "Zum Cockpit");
    k.addEventListener("click", cockpitUmschalten);
    return k;
  }

  // Die Shortlist gilt fuer einen Draft: neuer Draft, leere Liste.
  function cpMerkliste() {
    const m = cockpit.lies().merk;
    return m.nr === liveDraftNr ? m.liste : {};
  }
  function cpMerkSetzen(liste) {
    const merk = {nr: liveDraftNr, liste};
    cockpit.setze({merk});
    try { window.localStorage.setItem("cockpit-merkliste", JSON.stringify(merk)); }
    catch (e) { /* dann nur fuer diese Sitzung */ }
  }

  const cpSeiteUI = (farbe) => farbe === liveSeite ? "eigen" : "gegner";
  const cpOffen = (seite) => ROLES.map((_, i) => i).filter((i) => !liveStand.picks[seite][i]);

  /* Unsere Rolle fuer den naechsten Pick: gewaehlt, sonst die naechste
     Rolle aus dem Lagebild (Counter jetzt, sonst die, bei der Warten am
     wenigsten bringt), sonst die erste offene. */
  function cpRolle() {
    const offen = cpOffen("eigen");
    const w = cockpit.lies().rolle;
    if (w !== null && offen.includes(w)) return w;
    const L = liveLage();
    const n = L && L.naechsteRolle ? ROLES.findIndex(([r]) => r === L.naechsteRolle.rolle) : -1;
    if (n >= 0 && offen.includes(n)) return n;
    return offen.length ? offen[0] : null;
  }

  // Ein Gegnerpick landet auf der Rolle, die der Champion am meisten spielt
  // und die bei ihnen noch offen ist - korrigierbar im Teamfeld.
  function cpGegnerRolle(champ) {
    const offen = cpOffen("gegner");
    const moeglich = ENGINE.moeglicheRollen(DRAFT, champ)
      .map((x) => ROLES.findIndex(([r]) => r === x.rolle));
    const i = moeglich.find((j) => offen.includes(j));
    return i !== undefined ? i : offen.length ? offen[0] : null;
  }

  function cpHinweis(text) {
    const z = document.querySelector("#live-draft .cp-hinweis");
    if (z) z.textContent = text;
  }

  const cpKopie = () => JSON.parse(JSON.stringify({bans: liveStand.bans, picks: liveStand.picks}));

  /* Statt einer Rueckfrage: die Aktion passiert sofort, und fuer ein paar
     Sekunden steht "Rueckgaengig" daneben (Spezifikation Punkt 18). */
  function cpMerkeUndo(text, zurueck = null) {
    cockpit.setze({undo: {text, stand: cockpit.lies().vorAktion, zurueck, bis: Date.now() + CP_UNDO_MS}});
  }
  function cpVorAktion() { cockpit.setze({vorAktion: cpKopie()}); }
  function cpRueckgaengig() {
    const u = cockpit.lies().undo;
    if (!u || !u.stand) return;
    liveStand.bans = u.stand.bans;
    liveStand.picks = u.stand.picks;
    if (u.zurueck && liveTeile) liveTeile.protokoll.zuruecknehmen(u.zurueck.schluessel, u.zurueck.champ);
    cockpit.setze({undo: null, fokus: true});
    renderLiveDraft();
  }

  /* Das zentrale Feld: traegt dort ein, wo der aktuelle Schritt es
     verlangt. Gesperrtes nimmt es nicht an - mit Grund. */
  function cpEintragen(champ, a, gegnerRolle = null) {
    const s = a.schritt;
    if (!s || !champ) return;
    const seite = cpSeiteUI(s.seite);
    cockpit.setze({fokus: true, auswahl: null});
    if (s.art === "ban") {
      const i = liveStand.bans[seite].findIndex((c) => !c);
      if (i < 0) { cpHinweis("Alle Bans dieser Seite stehen schon."); return; }
      const grund = liveSperre(champ, "bans", seite, i);
      if (grund) { cpHinweis(champ + " ist nicht bannbar: " + grund); return; }
      cpVorAktion();
      liveStand.bans[seite][i] = champ;
      cpMerkeUndo(champ + " gebannt (" + (seite === "eigen" ? team.team : (liveGegnerName() || "Gegner")) + ")");
      renderLiveDraft();
      return;
    }
    const i = seite === "eigen" ? cpRolle()
      : gegnerRolle !== null && !liveStand.picks.gegner[gegnerRolle] ? gegnerRolle : cpGegnerRolle(champ);
    if (i === null) { cpHinweis("Keine offene Rolle mehr."); return; }
    const grund = liveSperre(champ, "picks", seite, i);
    if (grund) { cpHinweis(champ + " kann nicht gepickt werden: " + grund); return; }
    if (seite === "eigen") { cpPicken(champ, i); return; }
    cpVorAktion();
    liveStand.picks[seite][i] = champ;
    cpMerkeUndo(champ + " gepickt (" + (liveGegnerName() || "Gegner") + ", " + ROLES[i][1] + ")");
    renderLiveDraft();
  }

  // Ueber den Picken-Weg des Live Drafts: traegt im Protokoll nach - und
  // Rueckgaengig nimmt genau diesen Eintrag wieder zurueck.
  function cpPicken(champ, rolle) {
    cockpit.setze({fokus: true, auswahl: null});
    if (liveSperre(champ, "picks", "eigen", rolle)) { liveAktiv = {seite: "eigen", rolle}; livePicken(champ); return; }
    const schluessel = ENGINE.schluessel(liveZustand(), ROLES[rolle][0]);
    cpVorAktion();
    cpMerkeUndo(champ + " gepickt (" + ROLES[rolle][1] + ")", {schluessel, champ});
    liveAktiv = {seite: "eigen", rolle};
    livePicken(champ);
  }

  /* ------------------------------------------------------ Zustandskopf */
  const CP_RUNDE = {ban1: "1. Banrunde", pick1: "1. Pickrunde", ban2: "2. Banrunde", pick2: "2. Pickrunde"};

  function cpStatus(a) {
    const s = a.schritt;
    const gegner = liveGegnerName() || "Gegner";
    let titel, unter = "";
    if (a.zustand === "COMPLETE") {
      titel = "Draft komplett";
      unter = "Alle Picks stehen.";
    } else {
      const wir = s.wir;
      const getan = a.fortschritt[s.seite][s.art === "ban" ? "bans" : "picks"].getan;
      titel = (wir ? "Wir " : gegner + " ")
        + (s.art === "ban" ? (wir ? "bannen" : "bannt") : (wir ? "picken" : "pickt"));
      unter = (s.art === "ban" ? "Ban " : "Pick ") + (getan + 1) + " von 5 · "
        + CP_RUNDE[s.runde] + " · " + (s.seite === "blue" ? "Blau" : "Rot");
      if (a.zustand === "IDLE") unter = "Erster Schritt: " + unter;
    }
    return el("div", {class: "cp-status"},
      el("div", {class: "cp-zustand"},
        el("span", {class: "cp-klein"}, a.zustand === "IDLE" ? "Warten auf den Draft"
          : a.zustand === "OUR_TURN" ? "Wir sind dran" : a.zustand === "OPPONENT_TURN" ? "Gegner ist dran" : "Fertig"),
        el("strong", {class: "cp-titel"}, titel),
        el("span", {class: "cp-unter"}, unter)),
      cpFortschritt(a));
  }

  /* Je Seite fuenf Bans und fuenf Picks. Fertig zeigt den Champion, der
     aktuelle Schritt ist umrandet und benannt, uebersprungene Bans sind
     gestrichelt - nie nur ueber Farbe. */
  function cpFortschritt(a) {
    const reihe = (farbe, art) => {
      const seite = cpSeiteUI(farbe);
      const felder = (art === "ban" ? liveStand.bans[seite] : liveStand.picks[seite]).filter(Boolean);
      const schritte = a.schritte.filter((x) => x.seite === farbe && x.art === art);
      return el("span", {class: "cp-marken", role: "group", "aria-label": art === "ban" ? "Bans" : "Picks"},
                schritte.map((x, j) => {
        const champ = felder[j];
        const src = champ ? iconUrl(champ) : null;
        const status = champ ? "fertig" : x.status;
        // "cp-ban", nicht "ban": die globale Ban-Markierung (Schraffur, Strich)
        // gehoert an gebannte Champions, nicht an leere Marken.
        const neu = champ && cpNeu("marken", farbe + art + j + champ);
        return el("span", {class: "cp-marke " + status + (art === "ban" ? " cp-ban" : "") + (neu ? " neu" : ""),
                           title: champ || (status === "aktuell" ? "jetzt" : status === "uebersprungen"
                             ? "nicht eingetragen" : "offen")},
          src ? el("img", {src, alt: champ}) : status === "aktuell" ? el("span", {class: "cp-jetzt"}, "jetzt") : null);
      }));
    };
    const zeile = (farbe) => {
      const seite = cpSeiteUI(farbe);
      return el("div", {class: "cp-fortschritt-zeile " + seite},
        el("span", {class: "cp-klein"}, seite === "eigen" ? team.team : (liveGegnerName() || "Gegner")),
        el("span", {class: "cp-klein cp-art"}, "Bans"), reihe(farbe, "ban"),
        el("span", {class: "cp-klein cp-art"}, "Picks"), reihe(farbe, "pick"));
    };
    return el("div", {class: "cp-fortschritt", "aria-label": "Fortschritt des Drafts"},
      zeile(liveSeite), zeile(liveSeite === "blue" ? "red" : "blue"));
  }

  /* ------------------------------------------------------------ Teams */
  function cpFeld(seite, art, i, beschriftung) {
    const feld = champField("cp-" + seite + "-" + art + "-" + i, beschriftung, () => {});
    const eingabe = feld.querySelector("input");
    eingabe.setAttribute("list", "ld-ban-liste");
    eingabe.value = liveStand[art][seite][i] || "";
    eingabe.dispatchEvent(new Event("input"));
    eingabe.addEventListener("change", () => {
      const champ = normaliseChamp(eingabe.value) || null;
      const grund = champ ? liveSperre(champ, art, seite, i) : null;
      if (grund) {
        eingabe.value = liveStand[art][seite][i] || "";
        eingabe.dispatchEvent(new Event("input"));
        cpHinweis(champ + (art === "bans" ? " ist nicht bannbar: " : " kann nicht gepickt werden: ") + grund);
        return;
      }
      cpVorAktion();
      liveStand[art][seite][i] = champ;
      cpMerkeUndo(champ ? champ + " eingetragen" : "Feld geleert");
      renderLiveDraft();
    });
    return feld;
  }

  function cpTeam(seite, a, aktiveRolle) {
    const eigen = seite === "eigen";
    const name = eigen ? team.team : (liveGegnerName() || "Gegner");
    const s = a.schritt;
    const amZug = s && cpSeiteUI(s.seite) === seite;
    return el("section", {class: "cp-team " + seite + (amZug ? " am-zug" : ""), "aria-label": name},
      el("div", {class: "cp-team-kopf"}, el("h3", {class: "cp-team-name"}, name), liveBesetzungZurueck(seite)),
      el("div", {class: "cp-picks"}, ROLES.map(([wert, wort], i) => {
        const champ = liveStand.picks[seite][i];
        const aktiv = eigen && i === aktiveRolle && s && s.wir && s.art === "pick";
        const sp = liveSpielerVon(seite, i);
        return el("div", {class: "cp-slot" + (aktiv ? " aktiv" : "") + (champ ? " belegt" : ""),
                          style: aktiv ? "--cp-rolle: var(" + CP_ROLLE_VAR[wert] + ")" : null},
          el("span", {class: "cp-rolle"}, wort),
          cpFeld(seite, "picks", i, wort),
          // Wer spielt die Rolle - waehlbar wie in der klassischen Ansicht
          // (Wechsel, Rollentausch); ohne bekannte Mannschaft leer.
          (() => {
            const wahl = liveWahl(seite, i);
            return wahl.tagName === "SELECT" ? el("span", {class: "cp-wer"}, wahl)
              : el("span", {class: "cp-wer"}, sp ? sp.label : "");
          })());
      })),
      el("div", {class: "cp-bans"},
        el("span", {class: "cp-klein"}, "Bans"),
        el("div", {class: "cp-bans-felder"},
          [0, 1, 2, 3, 4].map((i) => cpFeld(seite, "bans", i, "Ban " + (i + 1))))));
  }

  /* ------------------------------------------------------ Empfehlungen */
  function cpMerkKnoepfe(champ) {
    const merk = cpMerkliste();
    const status = ENGINE.merkStatus(merk, champ);
    const knopf = (wert, icon, wort) => {
      const an = status === wert;
      const k = el("button", {class: "cp-merk " + wert.toLowerCase() + (an ? " an" : ""), type: "button",
                              "aria-pressed": String(an), title: wort + ": " + champ},
                   cpIcon(icon), el("span", {class: "cp-merk-wort"}, wort));
      k.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        cpMerkSetzen(ENGINE.merkUmschalten(cpMerkliste(), champ, wert));
        renderLiveDraft();
      });
      return k;
    };
    return el("span", {class: "cp-merk-knoepfe"},
      knopf("SHORTLISTED", "stern", "Merken"), knopf("REJECTED", "kreuz", "Verwerfen"));
  }

  function cpWerte(v) {
    const balken = (wort, wert) => el("span", {class: "cp-wert"},
      el("span", {class: "cp-klein"}, wort),
      el("b", {}, wert === null ? "–" : String(wert)),
      el("span", {class: "cp-balken", "aria-hidden": "true"},
         el("span", {style: "width:" + (wert === null ? 0 : wert) + "%"})));
    return el("div", {class: "cp-werte"},
      balken("Komfort", v.werte.spieler), balken("Matchup", v.werte.matchup),
      balken("Comp", v.werte.comp), balken("Meta", v.werte.meta));
  }

  /* Ein Knopf, den eine Ziffer erreicht: die Ziffer steht darauf (am
     Bildschirm mit Maus, nicht am Handy) und im aria-keyshortcuts. */
  function cpTasteAn(knopf, n) {
    if (!n) return knopf;
    knopf.dataset.taste = String(n);
    knopf.setAttribute("aria-keyshortcuts", String(n));
    knopf.append(el("kbd", {class: "cp-kbd", "aria-hidden": "true"}, String(n)));
    return knopf;
  }

  function cpTier1(r, v, rolle) {
    const src = iconUrl(r.champion);
    const picken = cpTasteAn(el("button", {class: "cp-picken", type: "button"}, "Picken"), 1);
    picken.addEventListener("click", () => cpPicken(r.champion, rolle));
    return el("article", {class: "cp-tier1" + (ENGINE.merkStatus(cpMerkliste(), r.champion) === "SHORTLISTED" ? " gemerkt" : ""),
                          "data-champ": r.champion},
      el("div", {class: "cp-tier1-kopf"},
        src ? el("img", {class: "cp-bild-gross", src, alt: ""}) : null,
        el("div", {class: "cp-tier1-name"},
          el("strong", {}, r.champion),
          el("span", {class: "cp-marken-zeile"},
            v.plan ? el("span", {class: "cp-plan"}, v.plan === "blind" ? "Plan: blind" : "Plan: gerne") : null,
            v.pool ? el("span", {class: "cp-plan"}, "Pool") : null)),
        el("span", {class: "cp-score", title: "Note · Entscheidungswert "
                    + (v.entscheidung === null ? "–" : Math.round(v.entscheidung))}, String(r.score))),
      v.gruende.length ? el("ul", {class: "cp-gruende"},
        v.gruende.slice(0, 4).map((g) => el("li", {}, cpIcon("haken"), el("span", {}, g)))) : null,
      v.risiken.length ? el("p", {class: "cp-risiko"}, v.risiken[0]) : null,
      cpDanach(r),
      cpWerte(v),
      el("div", {class: "cp-aktionen"}, picken, cpMerkKnoepfe(r.champion)));
  }

  /* Was der Gegner danach wahrscheinlich tut - aus dem Lookahead dieses
     Kandidaten (Verteilung, keine Gewissheit). Der erste Ast heisst "am
     wahrscheinlichsten", die weiteren "moeglich": Rang, keine Schwelle. */
  function cpDanach(r) {
    const aeste = r.lookahead && r.lookahead.aeste
      ? r.lookahead.aeste.slice().sort((x, y) => y.p - x.p).slice(0, 2) : [];
    if (!aeste.length) return null;
    return el("div", {class: "cp-danach"},
      el("span", {class: "cp-klein"}, "Wenn wir das picken"),
      aeste.map((x, i) => el("span", {class: "cp-ast"},
        (i === 0 ? "am wahrscheinlichsten " : "m\u00f6glich ") ,
        el("b", {}, x.antwort),
        " (" + (ENGINE.ROLLEN_WORT[x.rolle] || x.rolle) + ", " + Math.round(x.p * 100) + " %)",
        x.erwiderung ? " \u2192 dann " : "", x.erwiderung ? el("b", {}, x.erwiderung) : null)));
  }

  function cpZeile(r, v, rolle, {kompakt = false, taste = null} = {}) {
    const src = iconUrl(r.champion);
    const status = ENGINE.merkStatus(cpMerkliste(), r.champion);
    const picken = cpTasteAn(el("button", {class: "cp-picken klein", type: "button",
                                           "aria-label": r.champion + " picken"}, "Picken"), taste);
    picken.addEventListener("click", () => cpPicken(r.champion, rolle));
    return el("div", {class: "cp-zeile " + status.toLowerCase() + (kompakt ? " kompakt" : ""),
                      "data-champ": r.champion},
      src ? el("img", {class: "cp-bild", src, alt: ""}) : el("span"),
      el("span", {class: "cp-zeile-text"},
        el("b", {}, r.champion),
        !kompakt && v.gruende[0] ? el("span", {class: "cp-zeile-grund"}, v.gruende[0]) : null),
      el("span", {class: "cp-score klein"}, String(r.score)),
      cpMerkKnoepfe(r.champion), picken);
  }

  function cpEmpfehlungen(rolle) {
    const {liste} = liveRangliste(rolle, "eigen");
    const spieler = liveSpielerVon("eigen", rolle);
    const plan = spieler ? planOf(spieler) : null;
    const ansicht = (r) => ENGINE.empfehlungAnsicht(r, {
      plan: plan ? (plan.blind.includes(r.champion) ? "blind"
                    : plan.likes.includes(r.champion) ? "likes" : null) : null,
      pool: spieler ? liveKategorie(r, spieler) === "pool" : null,
    });
    const merk = cpMerkliste();
    const verworfen = (r) => ENGINE.merkStatus(merk, r.champion) === "REJECTED";
    const aktiv = liste.filter((r) => !verworfen(r));
    return {liste, ansicht, t1: aktiv[0] || null, t2: aktiv.slice(1, 4),
            t3: aktiv.slice(4).concat(liste.filter(verworfen))};
  }

  /* Der Draftplan des Spielers auf dieser Rolle - direkt bei der
     Entscheidung, damit niemand den Reiter wechseln muss. Vergebenes ist
     durchgestrichen, Freies laesst sich picken. */
  function cpPlan(rolle) {
    const sp = liveSpielerVon("eigen", rolle);
    if (!sp) return null;
    const plan = planOf(sp);
    if (!plan.blind.length && !plan.likes.length) return null;
    const weg = new Set(liveGesperrt().keys());
    const chip = (champ, art) => {
      const frei = !weg.has(champ);
      const k = el(frei ? "button" : "span", {class: "cp-plan-chip " + art + (frei ? "" : " vergeben"),
          type: frei ? "button" : null, title: frei ? champ + " picken" : champ + " ist vergeben"},
        iconUrl(champ) ? el("img", {src: iconUrl(champ), alt: ""}) : null, champ);
      if (frei) k.addEventListener("click", () => cpPicken(champ, rolle));
      return k;
    };
    return el("div", {class: "cp-planzeile"},
      el("span", {class: "cp-klein"}, "Plan \u00b7 " + sp.label),
      plan.blind.length ? el("span", {class: "cp-plan-gruppe"},
        el("span", {class: "cp-klein"}, "blind"), plan.blind.map((c) => chip(c, "blind"))) : null,
      plan.likes.length ? el("span", {class: "cp-plan-gruppe"},
        el("span", {class: "cp-klein"}, "gerne"), plan.likes.map((c) => chip(c, "likes"))) : null);
  }

  /* --------------------------------------------- Gegner wahrscheinlich
     Im Gegnerzug: was nimmt er wahrscheinlich? Aus dem Gegnermodell der
     Engine (Softmax ueber seine Noten), mit den Pools seiner Spieler, wenn
     die Mannschaft gescoutet ist. Keine Ligapartien (Vorgabe des Nutzers).
     Dazu fuer den wahrscheinlichsten Pick: unsere beste Antwort auf der
     Lane, die er trifft. */
  function cpVorhersage() {
    const z = liveZustand();
    const k = ENGINE.schluessel(z, "cockpit-vorhersage|" + (liveGegner || "") + "|" + liveRisiko
                                    + "|" + JSON.stringify(liveBesetzungVon("gegner")));
    const cache = cockpit.lies().vorhersage;
    if (cache.has(k)) return cache.get(k);
    const spielerFuer = (rolleName) => {
      const i = ROLES.findIndex(([w]) => w === rolleName);
      const sp = i >= 0 ? liveSpielerVon("gegner", i) : null;
      return sp ? {team: sp.team, label: sp.label} : null;
    };
    const vorrat = liveTeile.suche.gegnerVorrat(z);
    const liste = liveTeile.suche.gegnerAntworten(z, vorrat, {spielerFuer}).slice(0, 4);
    let antwort = null;
    const erster = liste[0];
    if (erster) {
      // Unsere offene Rolle, deren Lane er trifft.
      const unsere = ROLES.map(([w], i) => ({w, i}))
        .filter(({w, i}) => !liveStand.picks.eigen[i]
                && (ENGINE.LANE_GEGNER[w] || []).includes(erster.rolle));
      if (unsere.length) {
        const {w, i} = unsere[0];
        const felder = JSON.parse(JSON.stringify({bans: liveStand.bans, picks: liveStand.picks}));
        const gi = ROLES.findIndex(([x]) => x === erster.rolle);
        if (gi >= 0 && !felder.picks.gegner[gi]) felder.picks.gegner[gi] = erster.champ;
        const z2 = ENGINE.ausFeldern({...felder, wirSind: liveSeite, patch: DRAFT.patch,
                                      fearless: liveFearless ? fearlessVerbraucht() : null});
        const sp = liveSpielerVon("eigen", i);
        const r = liveTeile.suche.rangliste(z2, w, {
          spielerTeam: sp ? sp.team : null, spielerLabel: sp ? sp.label : null,
          risikoprofil: liveRisiko, mitLookahead: false,
          gegnerFuer: (x) => liveGegnerFuer(x, "eigen"),
        });
        antwort = {rolle: i, gegen: erster.champ, liste: r.slice(0, 3)};
      }
    }
    const raus = {liste, antwort, gescoutet: !!liveGegnerTeam()};
    if (cache.size > 20) cache.clear();
    cache.set(k, raus);
    return raus;
  }

  function cpGegnerWahrscheinlich(a) {
    const v = cpVorhersage();
    // Hat der Gegner einen der Vorhergesagten genommen: eine Ziffer, Enter.
    const eintragen = (x, i) => {
      const k = cpTasteAn(el("button", {class: "cp-picken klein cp-gegner-knopf", type: "button",
                                        "aria-label": x.champ + " f\u00fcr den Gegner eintragen"}, "Eintragen"), i + 1);
      const r = ROLES.findIndex(([w]) => w === x.rolle);
      k.addEventListener("click", () => cpEintragen(x.champ, a, r >= 0 ? r : null));
      return k;
    };
    if (!v.liste.length) return null;
    return el("section", {class: "cp-wahrscheinlich", "aria-label": "Gegner w\u00e4hlt wahrscheinlich"},
      el("div", {class: "cp-shortlist-kopf"},
        el("span", {class: "cp-klein"}, "Gegner w\u00e4hlt wahrscheinlich"),
        el("span", {class: "cp-klein cp-anzahl"}, "Modell, keine Gewissheit")),
      v.liste.map((x, i) => el("div", {class: "cp-zeile kompakt cp-gegner-zeile"},
        iconUrl(x.champ) ? el("img", {class: "cp-bild", src: iconUrl(x.champ), alt: ""}) : el("span"),
        el("span", {class: "cp-zeile-text"},
          el("b", {}, x.champ),
          el("span", {class: "cp-zeile-grund"}, (i === 0 ? "am wahrscheinlichsten" : "m\u00f6glich")
            + " \u00b7 " + (ENGINE.ROLLEN_WORT[x.rolle] || x.rolle))),
        el("span", {class: "cp-score klein"}, Math.round(x.p * 100) + " %"),
        eintragen(x, i))),
      el("p", {class: "cp-leer"}, "Aus Patchdaten (DraftGap)"
        + (v.gescoutet ? " und den Pools der gescouteten Spieler." : " \u2013 Gegner nicht gescoutet, ohne Pools.")),
      v.antwort && v.antwort.liste.length ? el("div", {class: "cp-antwort"},
        el("span", {class: "cp-klein"}, "Antwort vorbereiten \u00b7 " + ROLES[v.antwort.rolle][1]
          + " gegen " + v.antwort.gegen),
        v.antwort.liste.map((r, i) => el("span", {class: "cp-antwort-zeile"},
          el("b", {}, (i + 1) + ". " + r.champion), el("span", {class: "cp-score klein"}, String(r.score)))))
        : null);
  }

  function cpRollenWahl(rolle) {
    const offen = cpOffen("eigen");
    return el("div", {class: "cp-rollen", role: "group", "aria-label": "Rolle fuer unseren Pick"},
      offen.map((i) => {
        const [wert, wort] = ROLES[i];
        const k = el("button", {class: "cp-rollen-knopf" + (i === rolle ? " an" : ""), type: "button",
                                "aria-pressed": String(i === rolle),
                                style: "--cp-rolle: var(" + CP_ROLLE_VAR[wert] + ")"}, wort);
        k.addEventListener("click", () => { cockpit.setze({rolle: i}); renderLiveDraft(); });
        return k;
      }));
  }

  /* ------------------------------------------------- Suche (Phase 4)
     Das zentrale Feld ist zugleich die Championsuche: tippen zeigt bis zu
     acht Treffer (engine/championsuche.js), Pfeile waehlen, Enter traegt
     ein, Esc leert. Gesperrte stehen mit Grund dabei; Enter nennt dann den
     Grund, statt still einen anderen einzutragen. Bei unserem Pick steht
     die Note fuer die Rolle daneben - dieselbe Zahl wie in der Empfehlung. */
  function cpEingabe(a) {
    const s = a.schritt;
    // "/" hilft nur mit Tastatur - am Touch-Handy steht es nicht dabei.
    const feld = champField("cp-eingabe", "Champion suchen \u2026" + (cpTouch() ? "" : "  ( / )"), () => {});
    const input = feld.querySelector("input");
    input.id = "cp-eingabe-feld";
    input.removeAttribute("list");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", "cp-treffer");
    const liste = el("ul", {class: "cp-treffer", id: "cp-treffer", role: "listbox",
                            "aria-label": "Treffer", hidden: true});
    let treffer = [], aktiv = -1, noten = null;
    const rolle = s && s.wir && s.art === "pick" ? cpRolle() : null;
    const note = (champ) => {
      if (rolle === null) return null;
      if (!noten) noten = new Map(liveRangliste(rolle, "eigen").liste.map((r) => [r.champion, r.score]));
      return noten.has(champ) ? noten.get(champ) : null;
    };
    const markieren = () => {
      [...liste.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === aktiv)));
      if (aktiv >= 0) {
        input.setAttribute("aria-activedescendant", "cp-treffer-" + aktiv);
        const li = liste.children[aktiv];
        if (li && li.scrollIntoView) li.scrollIntoView({block: "nearest"});
      } else input.removeAttribute("aria-activedescendant");
    };
    const schliessen = () => {
      liste.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    };
    const eintragen = (champ) => { schliessen(); cpEintragen(champ, a); };
    const zeichnen = () => {
      const gesperrt = new Map([...liveGesperrt()].map(([c, v]) => [c, v.text]));
      treffer = ENGINE.championSuche(input.value, CHAMPIONS, {aliase: ALIASES, gesperrt});
      // Genau getroffen zaehlt, auch gesperrt; sonst der erste freie.
      aktiv = treffer.length && treffer[0].stufe === "genau" ? 0 : treffer.findIndex((t) => !t.gesperrt);
      liste.textContent = "";
      treffer.forEach((t, i) => {
        const n = t.gesperrt ? null : note(t.champ);
        const li = el("li", {id: "cp-treffer-" + i, role: "option",
                             class: "cp-treffer-zeile" + (t.gesperrt ? " gesperrt" : ""),
                             "aria-disabled": t.gesperrt ? "true" : null},
          iconUrl(t.champ) ? el("img", {src: iconUrl(t.champ), alt: ""}) : el("span"),
          el("b", {}, t.champ),
          el("span", {class: "cp-klein"}, t.gesperrt ? t.gesperrt : n !== null ? "Note " + n : ""));
        // mousedown statt click: sonst verliert das Feld vorher den Fokus.
        li.addEventListener("mousedown", (e) => { e.preventDefault(); eintragen(t.champ); });
        liste.append(li);
      });
      if (input.value.trim() && !treffer.length) {
        liste.append(el("li", {class: "cp-treffer-leer", role: "option", "aria-disabled": "true"},
                        "Kein Champion gefunden"));
      }
      const offen = !!input.value.trim();
      liste.hidden = !offen;
      input.setAttribute("aria-expanded", String(offen));
      markieren();
    };
    input.addEventListener("input", zeichnen);
    input.addEventListener("blur", schliessen);
    input.addEventListener("focus", () => { if (input.value.trim()) zeichnen(); });
    input.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (liste.hidden || !treffer.length) return;
        e.preventDefault();
        const r = e.key === "ArrowDown" ? 1 : -1;
        aktiv = Math.max(0, Math.min(treffer.length - 1, (aktiv < 0 ? (r > 0 ? -1 : treffer.length) : aktiv) + r));
        markieren();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (aktiv >= 0 && treffer[aktiv]) { eintragen(treffer[aktiv].champ); return; }
        const champ = normaliseChamp(input.value);
        if (champ) eintragen(champ);
        else if (input.value.trim()) cpHinweis("Kein Champion zu \u201e" + input.value.trim() + "\u201c.");
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (input.value) { input.value = ""; input.dispatchEvent(new Event("input")); }
        else if (cockpit.lies().hilfe) cpHilfeUmschalten(false);
        else input.blur();
      } else if (!input.value && cpKuerzel(e.key)) {
        // Leeres Feld: 1-5 und ? sind keine Champions - dann sind es Kuerzel.
        e.preventDefault();
      }
    });
    const wort = !s ? "" : (s.wir ? "Unser " : (liveGegnerName() || "Gegner") + ": ")
      + (s.art === "ban" ? "Ban" : "Pick") + " eintragen";
    const hilfeKnopf = el("button", {class: "cp-hilfe-knopf", type: "button", "aria-controls": "cp-tasten",
                                     "aria-expanded": String(!!cockpit.lies().hilfe), title: "Tastenk\u00fcrzel"},
                          "Tasten ", el("kbd", {}, "?"));
    hilfeKnopf.addEventListener("click", () => cpHilfeUmschalten());
    return el("div", {class: "cp-eingabe"},
      el("div", {class: "cp-eingabe-kopf"},
        el("label", {class: "cp-klein", for: "cp-eingabe-feld"}, wort), hilfeKnopf),
      el("div", {class: "cp-suche"}, feld, liste),
      el("span", {class: "cp-hinweis", role: "status", "aria-live": "polite"}),
      cpHilfe());
  }

  /* ------------------------------------------------- Tastatur (Phase 4)
     Nur wenn das Cockpit sichtbar ist und kein Eingabefeld den Fokus hat -
     das Suchfeld regelt seine Tasten selbst. Die Ziffern 1-5 waehlen im
     Cockpit eine Option statt einen Reiter: im Draft ist das die
     schnellere Hand. Die Reiter bleiben per Klick und Pfeiltasten da. Kein
     Kuerzel loest allein etwas aus: 1-5 waehlt, erst Enter pickt. */
  const CP_TASTEN = [
    ["/", "Championsuche"],
    ["\u2191 \u2193", "Treffer w\u00e4hlen"],
    ["Enter", "eintragen \u00b7 gew\u00e4hlte Option picken"],
    ["1\u20135", "Empfehlung w\u00e4hlen \u2013 im Gegnerzug: wahrscheinlichen Pick"],
    ["S", "gew\u00e4hlte Empfehlung merken"],
    ["L", "Draft-Log auf/zu"],
    ["Esc", "leeren \u00b7 schlie\u00dfen \u00b7 zur\u00fcck ins Suchfeld"],
    ["?", "diese Hilfe"],
  ];
  function cpHilfe() {
    return el("div", {class: "cp-tasten", id: "cp-tasten", hidden: !cockpit.lies().hilfe},
      el("dl", {}, CP_TASTEN.flatMap(([k, w]) => [el("dt", {}, el("kbd", {}, k)), el("dd", {}, w)])),
      el("p", {class: "cp-leer"}, "Im Suchfeld gelten \u2191 \u2193 Enter Esc, dazu 1\u20135 und ?, solange es leer ist. "
        + "Im Cockpit wechseln die Ziffern nicht den Reiter."));
  }
  function cpHilfeUmschalten(zeigen) {
    const an = typeof zeigen === "boolean" ? zeigen : !cockpit.lies().hilfe;
    cockpit.setze({hilfe: an});
    const p = document.getElementById("cp-tasten");
    if (p) p.hidden = !an;
    const k = document.querySelector("#live-draft .cp-hilfe-knopf");
    if (k) k.setAttribute("aria-expanded", String(an));
  }

  const cpSichtbar = () => {
    const z = document.getElementById("live-draft");
    return !!z && z.classList.contains("cp") && !z.closest("[hidden]");
  };

  function cpWaehle(n) {
    const k = document.querySelector('#live-draft [data-taste="' + n + '"]');
    if (!k) { cpHinweis("Taste " + n + ": hier gibt es keine " + n + ". Option."); return; }
    const d = k.closest("details");
    if (d && !d.open) d.open = true;
    k.focus();
    if (k.scrollIntoView) k.scrollIntoView({block: "nearest"});
  }

  function cpMerkTaste() {
    const a = document.activeElement;
    const zeile = a && a.closest ? a.closest("#live-draft [data-champ]") : null;
    if (!zeile) {
      cpHinweis("S merkt die gew\u00e4hlte Empfehlung \u2013 erst mit 1\u20135 eine w\u00e4hlen.");
      return;
    }
    const knopf = zeile.querySelector("[data-taste]");
    cpMerkSetzen(ENGINE.merkUmschalten(cpMerkliste(), zeile.dataset.champ, "SHORTLISTED"));
    cockpit.setze({auswahl: knopf ? knopf.dataset.taste : null});
    renderLiveDraft();
  }

  function cpLogUmschalten() {
    const d = document.querySelector("#live-draft .cp-log");
    if (!d) return;
    d.open = !d.open;
    cockpit.setze({logOffen: d.open});
    if (d.open && d.scrollIntoView) d.scrollIntoView({block: "nearest"});
  }

  // Kuerzel, die auch im leeren Suchfeld gelten.
  function cpKuerzel(taste) {
    if (taste >= "1" && taste <= "5" && taste.length === 1) { cpWaehle(Number(taste)); return true; }
    if (taste === "?") { cpHilfeUmschalten(); return true; }
    return false;
  }

  /** Vom globalen Tastenhandler (template.html) gerufen; true = erledigt. */
  function cpTaste(e) {
    if (!cpSichtbar()) return false;
    const k = e.key;
    if (k === "/") {
      const f = document.getElementById("cp-eingabe-feld");
      if (!f) return false;
      f.focus();
      f.select();
      return true;
    }
    if (k === "s" || k === "S") { cpMerkTaste(); return true; }
    if (k === "l" || k === "L") { cpLogUmschalten(); return true; }
    if (k === "Escape") {
      if (cockpit.lies().hilfe) { cpHilfeUmschalten(false); return true; }
      const f = document.getElementById("cp-eingabe-feld");
      if (f) { f.focus(); return true; }
      return false;
    }
    return cpKuerzel(k);
  }

  // Weggenommen ist, was andere genommen haben - nicht unser eigener Pick.
  const cpUnsere = () => new Set(liveStand.picks.eigen.filter(Boolean));
  const cpWeg = () => {
    const unsere = cpUnsere();
    return new Set([...liveGesperrt().keys()].filter((c) => !unsere.has(c)));
  };

  function cpShortlist(rolle, unsererPick) {
    const unsere = cpUnsere();
    const aus = ENGINE.merkAuswertung(cpMerkliste(), new Set([...cpWeg(), ...unsere]));
    const meldung = cockpit.lies().meldung;
    return el("section", {class: "cp-shortlist", "aria-label": "Shortlist"},
      el("div", {class: "cp-shortlist-kopf"},
        el("span", {class: "cp-klein"}, "Shortlist"),
        aus.shortlist.length ? el("span", {class: "cp-klein cp-anzahl"}, aus.frei + " frei") : null),
      meldung ? el("p", {class: "cp-meldung" + (cpNeu("meldung", meldung) ? " neu" : ""), role: "status"}, meldung) : null,
      aus.shortlist.length
        ? el("div", {class: "cp-shortlist-liste"}, aus.shortlist.map((x) => {
            const src = iconUrl(x.champ);
            const gepickt = unsere.has(x.champ);
            const k = el("span", {class: "cp-sl" + (gepickt ? " gepickt" : x.vergeben ? " vergeben" : "")
                                         + (cpNeu("shortlist", x.champ + "|" + gepickt + "|" + x.vergeben) ? " neu" : "")},
              cpIcon("stern"),
              src ? el("img", {src, alt: ""}) : null,
              el("b", {}, x.champ),
              gepickt ? el("span", {class: "cp-klein"}, "unser Pick")
                : x.vergeben ? el("span", {class: "cp-klein"}, "vergeben") : null);
            if (!x.vergeben && unsererPick && rolle !== null) {
              const p = el("button", {class: "cp-picken klein", type: "button",
                                      "aria-label": x.champ + " picken"}, "Picken");
              p.addEventListener("click", () => cpPicken(x.champ, rolle));
              k.append(p);
            }
            const weg = el("button", {class: "cp-merk", type: "button", "aria-label": x.champ + " von der Shortlist"},
                           cpIcon("kreuz"));
            weg.addEventListener("click", () => {
              cpMerkSetzen(ENGINE.merkSetzen(cpMerkliste(), x.champ, "UNREVIEWED"));
              renderLiveDraft();
            });
            k.append(weg);
            return k;
          }))
        : el("p", {class: "cp-leer"}, "Noch nichts gemerkt – bei einer Empfehlung auf Merken."),
      aus.verworfen.length ? el("p", {class: "cp-verworfen"}, "Verworfen: " + aus.verworfen.join(", ")) : null);
  }

  function cpMitte(a) {
    const s = a.schritt;
    const box = el("section", {class: "cp-mitte", "aria-label": "Aktuelle Entscheidung"});
    if (a.zustand === "COMPLETE") {
      box.append(zustandsHinweis("fertig", "Draft komplett",
        "Alle zehn Picks stehen. Ergebnis unten im Protokoll eintragen, bei Fearless „Spiel merken“ – "
        + "nach dem Turnierspiel zeigt REVIEW · Plan gegen Ist, wer nach Plan gespielt hat."));
      box.append(cpLog());
      return box;
    }
    box.append(cpEingabe(a));
    const unsererPick = s.wir && s.art === "pick";
    const rolle = cpRolle();
    if (unsererPick && rolle !== null) {
      const e = cpEmpfehlungen(rolle);
      box.append(el("div", {class: "cp-entscheidung-kopf"},
        el("span", {class: "cp-klein"}, "Empfehlung f\u00fcr"), cpRollenWahl(rolle)));
      const plan = cpPlan(rolle);
      if (plan) box.append(plan);
      if (e.t1) box.append(cpTier1(e.t1, e.ansicht(e.t1), rolle));
      else box.append(zustandsHinweis("leer", "Keine Empfehlung",
        "Für " + ROLES[rolle][1] + " ist jeder bewertete Champion gesperrt, vergeben oder verworfen. "
        + "Über die Suche lässt sich trotzdem jeder freie Champion eintragen."));
      if (e.t2.length) box.append(el("div", {class: "cp-tier2"},
        el("span", {class: "cp-klein"}, "Starke Alternativen"),
        e.t2.map((r, i) => cpZeile(r, e.ansicht(r), rolle, {taste: i + 2}))));
      // Taste 5 erreicht die erste weitere Option und klappt sie dafuer auf.
      if (e.t3.length) box.append(el("details", {class: "cp-tier3"},
        el("summary", {}, "Weitere Optionen (" + e.t3.length + ")"),
        e.t3.map((r, i) => cpZeile(r, e.ansicht(r), rolle,
                                   {kompakt: true, taste: i === 0 && e.t2.length === 3 ? 5 : null}))));
    } else if (rolle !== null) {
      // Gegner pickt: was nimmt er wahrscheinlich, was antworten wir.
      if (!s.wir && s.art === "pick") {
        const w = cpGegnerWahrscheinlich(a);
        box.append(w || zustandsHinweis("fehlt", "Keine Vorhersage",
          "Für die offenen Rollen des Gegners liegen keine bewertbaren Kandidaten vor."));
      }
      // Nicht unser Pick: leiser - eine Vorschau, was danach fuer uns zaehlt.
      const e = cpEmpfehlungen(rolle);
      box.append(el("div", {class: "cp-vorschau"},
        el("span", {class: "cp-klein"}, s.art === "ban"
          ? "Unser nächster Pick (" + ROLES[rolle][1] + ") – Stand jetzt"
          : "Danach für uns · " + ROLES[rolle][1]),
        [e.t1, ...e.t2].filter(Boolean).slice(0, 3).map((r) => cpZeile(r, e.ansicht(r), rolle, {kompakt: true}))));
    }
    box.append(cpShortlist(rolle, unsererPick));
    box.append(cpLog());
    return box;
  }

  /* --------------------------------------------------------- Draft-Log
     Jede Aenderung an den Feldern mit Uhrzeit - egal, ob ueber das
     Cockpit, ein Teamfeld oder die alte Ansicht. Eingeklappt; je Draft. */
  function cpLogFuehren() {
    const jetzt = cpKopie();
    const vorher = cockpit.lies().stand;
    let log = cockpit.lies().log;
    if (log.nr !== liveDraftNr) log = {nr: liveDraftNr, eintraege: []};
    const neu = vorher ? ENGINE.draftAenderungen(vorher, jetzt) : [];
    if (neu.length || log !== cockpit.lies().log) {
      const zeit = new Date().toTimeString().slice(0, 8);
      log = {nr: log.nr, eintraege: log.eintraege.concat(neu.map((x) => ({zeit, ...x})))};
      try { window.localStorage.setItem("cockpit-log", JSON.stringify(log)); } catch (e) { /* egal */ }
    }
    cockpit.setze({log, stand: jetzt});
  }

  function cpLog() {
    const e = cockpit.lies().log.eintraege;
    const wer = (seite) => seite === "eigen" ? team.team : (liveGegnerName() || "Gegner");
    const d = el("details", {class: "cp-log", open: cockpit.lies().logOffen},
      el("summary", {}, "Draft-Log (" + e.length + ")"),
      e.length ? el("ol", {class: "cp-log-liste"}, e.map((x) => el("li", {class: "cp-log-" + x.typ},
        el("span", {class: "cp-log-zeit"}, x.zeit),
        el("span", {class: "cp-klein"}, x.art === "bans" ? "Ban" : "Pick"),
        el("span", {}, wer(x.seite)
          + (x.art === "picks" ? " \u00b7 " + ROLES[x.index][1] : "")),
        el("b", {}, x.typ === "entfernt" ? x.alt + " entfernt"
          : x.typ === "geaendert" ? x.alt + " \u2192 " + x.champ : x.champ))))
        : el("p", {class: "cp-leer"}, "Noch nichts eingetragen."));
    d.addEventListener("toggle", () => cockpit.setze({logOffen: d.open}));
    return d;
  }

  function cpUndoLeiste() {
    const u = cockpit.lies().undo;
    if (!u || Date.now() > u.bis) return null;
    const knopf = el("button", {class: "cp-undo-knopf", type: "button"}, "R\u00fcckg\u00e4ngig");
    knopf.addEventListener("click", cpRueckgaengig);
    const leiste = el("div", {class: "cp-undo", role: "status", "aria-live": "polite"},
      el("span", {}, u.text), knopf);
    // Verschwindet von selbst - ohne neu zu zeichnen.
    setTimeout(() => { if (leiste.isConnected) leiste.remove(); }, Math.max(0, u.bis - Date.now()));
    return leiste;
  }

  /* Der Kopf des Live Drafts (Gegner, Seite, Risiko, Fearless, Serie ...)
     ist Vorbereitung, nicht Entscheidung. Am Handy klappt er darum in eine
     Zeile, die den Stand zusammenfasst; am Bildschirm steht er offen wie
     bisher (die Zusammenfassung ist dort ausgeblendet). */
  function cpEinstellungen(kopf) {
    const eng = cpEng();
    const zusammen = (liveSerienSpiele.length ? "Spiel " + (liveSerienSpiele.length + 1) + " · " : "")
      + team.team + " vs " + (liveGegnerName() || "Gegner offen")
      + " \u00b7 " + (liveSeite === "blue" ? "Blau" : "Rot")
      + " \u00b7 Risiko " + liveRisiko + (liveFearless ? " \u00b7 Fearless" : "");
    const d = el("details", {class: "cp-einstellungen", open: !eng || cockpit.lies().einstellungenOffen},
      el("summary", {}, el("span", {class: "cp-klein"}, "Draft"), el("span", {}, zusammen)), kopf,
      // Gemerkte Spiele der Serie (Fearless) - wie in der klassischen Ansicht.
      serienLeiste());
    d.addEventListener("toggle", () => { if (cpEng()) cockpit.setze({einstellungenOffen: d.open}); });
    return d;
  }

  /* Animation nur bei Zustandswechseln (Spezifikation Punkt 28): neuer
     Pick oder Ban, neuer Schritt, Shortlist-Aenderung, frisch vergeben.
     Beim ersten Zeichnen bewegt sich nichts. */
  let cpJetztGesehen = null;
  function cpNeu(art, schluessel) {
    if (!cpJetztGesehen) return false;
    cpJetztGesehen.neu[art].add(schluessel);
    const vorher = cockpit.lies().gesehen;
    return !!vorher && !vorher[art].has(schluessel);
  }

  /* ------------------------------------------------------------ Aufbau */
  function renderCockpit(ziel) {
    const a = ENGINE.ablauf(liveZustand());
    cpJetztGesehen = {neu: {marken: new Set(), shortlist: new Set(), meldung: new Set()}};
    const schrittVorher = cockpit.lies().gesehen ? cockpit.lies().gesehen.schritt : null;
    const schrittJetzt = a.zustand + "|" + (a.schritt ? a.schritt.nr : "");
    // Wurde seit dem letzten Zeichnen etwas von der Shortlist vergeben -
    // vom Gegner oder durch einen Ban? Unser eigener Pick zaehlt nicht.
    const jetzt = cpWeg();
    const vorher = cockpit.lies().vorher;
    const neu = vorher ? ENGINE.merkNeuVergeben(cpMerkliste(), vorher, jetzt) : [];
    if (neu.length) {
      // Frei ist, was weder weg noch schon unser Pick ist.
      const frei = ENGINE.merkAuswertung(cpMerkliste(), new Set([...jetzt, ...cpUnsere()])).frei;
      cockpit.setze({meldung: neu.join(", ") + " vergeben · noch " + frei
                                + (frei === 1 ? " Option" : " Optionen") + " auf der Shortlist"});
    } else if (vorher && jetzt.size !== vorher.size) {
      cockpit.setze({meldung: null});
    }
    cockpit.setze({vorher: jetzt});
    cpLogFuehren();
    const rolle = a.schritt && a.schritt.wir && a.schritt.art === "pick" ? cpRolle() : null;
    // schritt-ban / schritt-pick: am Handy steht das Suchfeld bei unserem
    // Pick hinter den Teams, sonst oben (dort ist es die Aktion).
    ziel.className = "cp " + a.zustand.toLowerCase().replace("_", "-")
      + (a.schritt ? " schritt-" + a.schritt.art : "");
    ziel.append(...[el("datalist", {id: "ld-ban-liste"}),
      cpEinstellungen(liveKopf(liveSerien())),
      (() => {
        const st = cpStatus(a);
        if (schrittVorher !== null && schrittVorher !== schrittJetzt) st.classList.add("wechsel");
        return st;
      })(),
      cpUndoLeiste(),
      el("div", {class: "cp-buehne"}, cpTeam("eigen", a, rolle), cpMitte(a), cpTeam("gegner", a, null)),
      el("div", {class: "ld-protokoll"})].filter(Boolean));
    liveBanListeZeichnen();
    liveProtokollZeichnen();
    cockpit.setze({gesehen: {schritt: schrittJetzt, ...cpJetztGesehen.neu}});
    cpJetztGesehen = null;
    const st = cockpit.lies();
    if (st.fokus) {
      const f = ziel.querySelector(".cp-eingabe input");
      if (f && !cpTouch()) f.focus();
      cockpit.setze({fokus: false, auswahl: null});
    } else if (st.auswahl) {
      // Nach "S": dieselbe Option behaelt den Fokus.
      const k = ziel.querySelector('[data-taste="' + st.auswahl + '"]');
      if (k) {
        const d = k.closest("details");
        if (d) d.open = true;
        k.focus();
      }
      cockpit.setze({auswahl: null});
    }
  }

