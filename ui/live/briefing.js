  /* ============================================ Briefing (LIVE, Phase 7)
     Vor dem Draft, Spezifikation Punkt 30: gegen wen, was der Gegner
     wahrscheinlich nimmt, was wir daraus ableiten, unser Plan je Rolle -
     und dann in den Team-Draft.

     Woraus es rechnet (und was es NICHT tut):
     - "Wahrscheinliche Picks" ist das Gegnermodell der Engine
       (gegnerAntworten) auf einem leeren Draft: Patchdaten (DraftGap) und,
       wenn die Mannschaft gescoutet ist, der Komfort ihrer Spieler. Damit
       die Komfortchampions ueberhaupt Kandidaten sind, kommen ihre
       meistgespielten Champions zum Vorrat dazu. Keine Ligapartien - die
       sind keine Entscheidungswerte (Vorgabe des Nutzers).
     - "Bannen erwaegen" und "Umkaempft" sind Ableitungen und so
       beschriftet: die Engine bewertet Bans nicht.
     - "Modell: blind" je Rolle ist die Rangliste der Engine fuer einen
       leeren Draft (ohne Lookahead) - dieselbe Note wie im Cockpit. */

  const BRIEFING_POOL = 3;          // je Gegnerspieler gezeigte Poolchampions
  const BRIEFING_GEFAHREN = 5;      // gezeigte wahrscheinliche Picks
  const BRIEFING_BANS = 3;          // davon als Ban-Ableitung
  const briefingCache = {suche: null, werte: new Map()};

  const briefingSichtbar = () => {
    const p = document.getElementById("panel-briefing");
    return !!p && !p.hidden;
  };

  // Ein leerer Draft mit unserer Seite und - bei Fearless - den Sperren der Serie.
  function briefingZustand() {
    return ENGINE.ausFeldern({
      picks: {eigen: leer5(), gegner: leer5()}, bans: {eigen: leer5(), gegner: leer5()},
      wirSind: liveSeite, patch: DRAFT.patch,
      fearless: liveFearless ? fearlessVerbraucht() : null,
    });
  }

  // Meistgespielte Champions eines Spielers aus seinem op.gg-Pool.
  function briefingPool(sp) {
    if (!sp) return [];
    return championRows(sp, new Map(), false)
      .sort((a, b) => b.play - a.play || a.champ.localeCompare(b.champ))
      .slice(0, BRIEFING_POOL);
  }

  function briefingRechnen() {
    if (briefingCache.suche !== liveTeile.suche) {
      briefingCache.suche = liveTeile.suche;
      briefingCache.werte.clear();
    }
    const z = briefingZustand();
    const schluessel = ENGINE.schluessel(z, "briefing|" + team.team + "|" + (liveGegner || "")
      + "|" + liveRisiko + "|" + JSON.stringify(liveBesetzungVon("gegner"))
      + "|" + JSON.stringify(liveBesetzungVon("eigen")));
    if (briefingCache.werte.has(schluessel)) return briefingCache.werte.get(schluessel);

    const gegnerTeam = liveGegnerTeam();
    const spielerFuer = (rolleName) => {
      const i = ROLES.findIndex(([w]) => w === rolleName);
      const sp = i >= 0 ? liveSpielerVon("gegner", i) : null;
      return sp ? {team: sp.team, label: sp.label} : null;
    };
    // Vorrat: die starken Champions laut Patch plus die Pools der Gegner.
    const vorrat = liveTeile.suche.gegnerVorrat(z).slice();
    const gegnerSpieler = ROLES.map(([w, wort], i) => {
      const sp = gegnerTeam ? liveSpielerVon("gegner", i) : null;
      const pool = briefingPool(sp);
      for (const r of pool) {
        if (!vorrat.some((k) => k.champ === r.champ && k.rolle === w)) vorrat.push({champ: r.champ, rolle: w});
      }
      return {rolle: w, wort, spieler: sp, pool};
    });
    const gefahren = liveTeile.suche.gegnerAntworten(z, vorrat, {spielerFuer})
      .slice(0, BRIEFING_GEFAHREN);

    const plan = ROLES.map(([w, wort], i) => {
      const sp = liveSpielerVon("eigen", i);
      const p = sp ? planOf(sp) : {blind: [], likes: []};
      const r = liveTeile.suche.rangliste(z, w, {
        spielerTeam: sp ? sp.team : null, spielerLabel: sp ? sp.label : null,
        risikoprofil: liveRisiko, mitLookahead: false,
        gegnerFuer: (x) => liveGegnerFuer(x, "eigen"),
      });
      return {rolle: w, wort, spieler: sp, blind: p.blind, likes: p.likes, modell: r[0] || null};
    });
    // Umkaempft: steht bei uns im Plan UND beim Gegner unter den wahrscheinlichen Picks.
    const unserPlan = new Set(plan.flatMap((x) => [...x.blind, ...x.likes]));
    const umkaempft = gefahren.filter((g) => unserPlan.has(g.champ));
    const raus = {gegnerTeam, gegnerSpieler, gefahren, plan, umkaempft};
    if (briefingCache.werte.size > 12) briefingCache.werte.clear();
    briefingCache.werte.set(schluessel, raus);
    return raus;
  }

  const briefingChamp = (champ, ...danach) => el("span", {class: "bf-champ"},
    iconUrl(champ) ? el("img", {src: iconUrl(champ), alt: ""}) : null, el("b", {}, champ), ...danach);

  function briefingKopf() {
    const nr = liveFearless && liveSerienSpiele.length ? liveSerienSpiele.length + 1 : null;
    const gegnerFeld = el("input", {type: "text", class: "bf-gegner", list: "opponent-list",
      placeholder: "Gegner eintragen", autocomplete: "off", "aria-label": "Gegnerische Mannschaft"});
    gegnerFeld.value = liveGegner;
    // Derselbe Gegner wie im Team-Draft - eine Wahrheit.
    // Nur bei echter Aenderung: beim Neuzeichnen verschwindet das Feld mit
    // dem Fokus, und der Browser meldet "change" dann ein zweites Mal - das
    // zeichnete den Team-Draft doppelt in denselben Kasten.
    gegnerFeld.addEventListener("change", () => {
      if (gegnerFeld.value === liveGegner) return;
      liveGegner = gegnerFeld.value;
      renderLiveDraft();
    });
    return el("div", {class: "bf-kopf"},
      el("div", {class: "bf-titel"},
        el("span", {class: "cp-klein"}, nr ? "Spiel " + nr + " · Fearless" : "Vor dem Draft"),
        el("strong", {}, team.team + " vs"), gegnerFeld),
      liveSeitenWahl());
  }

  function briefingGefahren(b) {
    const quelle = b.gegnerTeam
      ? "Modell aus Patchdaten (DraftGap) und den op.gg-Pools der Spieler von " + b.gegnerTeam.team + "."
      : "Modell nur aus Patchdaten (DraftGap) – " + (liveGegner.trim()
          ? liveGegner.trim() + " ist nicht gescoutet, ohne Pools." : "kein Gegner eingetragen.");
    const box = el("section", {class: "bf-teil", "aria-labelledby": "bf-gefahren-titel"},
      el("h3", {id: "bf-gefahren-titel"}, "Wahrscheinliche Picks des Gegners"),
      el("p", {class: "bf-quelle"}, quelle + " Keine Gewissheit, keine Ligapartien."));
    if (!b.gefahren.length) {
      box.append(zustandsHinweis("fehlt", "Keine Vorhersage",
        "Für diesen Patch liegen keine bewertbaren Gegnerkandidaten vor."));
      return box;
    }
    box.append(el("ol", {class: "bf-liste"}, b.gefahren.map((g) => {
      const i = ROLES.findIndex(([w]) => w === g.rolle);
      const sp = b.gegnerTeam && i >= 0 ? liveSpielerVon("gegner", i) : null;
      return el("li", {},
        briefingChamp(g.champ),
        el("span", {class: "bf-neben"}, (ENGINE.ROLLEN_WORT[g.rolle] || g.rolle) + (sp ? " · " + sp.label : "")),
        el("span", {class: "bf-zahl"}, Math.round(g.p * 100) + " %"));
    })));
    return box;
  }

  function briefingPrioritaeten(b) {
    const box = el("section", {class: "bf-teil", "aria-labelledby": "bf-prio-titel"},
      el("h3", {id: "bf-prio-titel"}, "Unsere Prioritäten ",
        el("span", {class: "bf-ableitung"}, "Ableitung")));
    const bans = b.gefahren.slice(0, BRIEFING_BANS);
    box.append(el("div", {class: "bf-prio"},
      el("span", {class: "cp-klein"}, "Bannen erwägen"),
      bans.length ? el("div", {class: "bf-chips"}, bans.map((g) => briefingChamp(g.champ))) : el("span", {}, "–"),
      el("p", {class: "bf-quelle"}, "Die " + bans.length + " wahrscheinlichsten Gegnerpicks von oben. "
        + "Kein geprüfter Ban-Wert – die Engine bewertet Bans nicht.")));
    box.append(el("div", {class: "bf-prio"},
      el("span", {class: "cp-klein"}, "Umkämpft"),
      b.umkaempft.length
        ? el("div", {class: "bf-chips"}, b.umkaempft.map((g) => briefingChamp(g.champ)))
        : el("span", {class: "bf-neben"}, "nichts – kein wahrscheinlicher Gegnerpick steht in unserem Plan"),
      el("p", {class: "bf-quelle"}, "Steht in unserem Draftplan und beim Gegner unter den wahrscheinlichen Picks: "
        + "früh sichern oder mit dem Verlust rechnen.")));
    return box;
  }

  function briefingGegnerSpieler(b) {
    const box = el("section", {class: "bf-teil", "aria-labelledby": "bf-spieler-titel"},
      el("h3", {id: "bf-spieler-titel"}, "Gegner je Rolle"),
      el("p", {class: "bf-quelle"}, "Meistgespielte Champions laut op.gg (" + queueLabel()
        + "), Spiele · Winrate. Beschreibend."));
    if (!b.gegnerTeam) {
      box.append(liveGegner.trim()
        ? zustandsHinweis("fehlt", "Nicht gescoutet",
            "Für " + liveGegner.trim() + " liegen keine Spielerdaten vor – die Vorhersage oben kennt nur Patchdaten.")
        : zustandsHinweis("leer", "Gegner offen",
            "Oben den Gegner eintragen – dann stehen hier seine Spieler und ihre Pools."));
      return box;
    }
    box.append(el("div", {class: "bf-raster"}, b.gegnerSpieler.map((x) => el("div", {class: "bf-zeile"},
      el("span", {class: "cp-klein"}, x.wort),
      el("span", {class: "bf-wer"}, x.spieler ? x.spieler.label : "unbekannt"),
      el("span", {class: "bf-chips"}, x.pool.length
        ? x.pool.map((r) => briefingChamp(r.champ, el("small", {}, " " + r.play + " · " + pct(r.win, r.decided))))
        : el("span", {class: "bf-neben"}, "keine Daten"))))));
    return box;
  }

  function briefingPlan(b) {
    const box = el("section", {class: "bf-teil bf-breit", "aria-labelledby": "bf-plan-titel"},
      el("h3", {id: "bf-plan-titel"}, "Draftplan"),
      el("p", {class: "bf-quelle"}, "Blind und gerne aus dem Draftplan; „Modell“ ist der beste Blindpick "
        + "der Engine für einen leeren Draft (ohne Lookahead)."));
    const gesperrt = new Set(liveFearless ? fearlessVerbraucht() : []);
    const chips = (liste, art) => liste.length
      ? liste.map((c) => el("span", {class: "bf-plan " + art + (gesperrt.has(c) ? " weg" : ""),
          title: gesperrt.has(c) ? c + ": in dieser Serie schon gespielt" : c}, briefingChamp(c)))
      : [el("span", {class: "bf-neben"}, "–")];
    box.append(el("div", {class: "bf-plan-raster", role: "table", "aria-label": "Draftplan je Rolle"},
      el("div", {class: "bf-plan-zeile bf-plan-kopf", role: "row"},
        ["Rolle", "Spieler", "Blind", "Gerne", "Modell"].map((t) => el("span", {role: "columnheader", class: "cp-klein"}, t))),
      b.plan.map((x) => el("div", {class: "bf-plan-zeile", role: "row"},
        el("span", {role: "cell", class: "cp-klein"}, x.wort),
        el("span", {role: "cell", class: "bf-wer"}, x.spieler ? x.spieler.label : "–"),
        el("span", {role: "cell", class: "bf-chips"}, chips(x.blind, "blind")),
        el("span", {role: "cell", class: "bf-chips"}, chips(x.likes, "likes")),
        el("span", {role: "cell"}, x.modell
          ? briefingChamp(x.modell.champion, el("small", {}, " " + x.modell.score)) : "–")))));
    return box;
  }

  function renderBriefing() {
    if (!briefingSichtbar()) return;
    const ziel = document.getElementById("briefing");
    if (!ziel) return;
    ziel.textContent = "";
    if (!DRAFT || !liveTeile) {
      ziel.append(zustandsHinweis("fehler", "Keine Draftdaten",
        "Die Patchdaten (DraftGap) fehlen in dieser Seite – build.py konnte sie nicht laden. "
        + "SCOUT funktioniert weiter."));
      return;
    }
    const b = briefingRechnen();
    const belegt = [...liveStand.picks.eigen, ...liveStand.picks.gegner,
                    ...liveStand.bans.eigen, ...liveStand.bans.gegner].filter(Boolean).length;
    const los = el("button", {class: "cp-picken bf-los", type: "button"}, "Zum Team-Draft");
    los.addEventListener("click", () => zeigeReiter(document.getElementById("tab-draft")));
    let neu = null;
    if (belegt) {
      neu = el("button", {class: "ld-reset", type: "button"}, "Leeren und neu beginnen");
      neu.addEventListener("click", () => {
        liveStand.bans.eigen = leer5(); liveStand.bans.gegner = leer5();
        liveStand.picks.eigen = leer5(); liveStand.picks.gegner = leer5();
        neuerDraft();
        zeigeReiter(document.getElementById("tab-draft"));
        renderLiveDraft();
      });
    }
    ziel.append(
      briefingKopf(),
      el("div", {class: "bf-raster-aussen"},
        briefingGefahren(b), briefingPrioritaeten(b), briefingGegnerSpieler(b), briefingPlan(b)),
      el("div", {class: "bf-start"}, los, neu,
        belegt ? el("span", {class: "bf-neben"}, "Im Team-Draft stehen schon " + belegt
                                              + (belegt === 1 ? " Eintrag." : " Einträge.")) : null));
  }
