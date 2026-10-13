  /* ===================================== Plan gegen Ist (REVIEW, Phase 7)
     Spezifikation Punkt 31: nach dem Spiel PLAN gegen IST. Je Turnierspiel
     der gewaehlten Mannschaft und Rolle: der gespielte Champion und ob er
     im Draftplan stand (engine/review.js). Verglichen wird mit dem
     HEUTIGEN Plan - ein Plan von damals ist nicht gespeichert; die Seite
     sagt das dazu. Status nie nur als Farbe: Wort und Zeichen. */

  const PLAN_IST_WORT = {blind: "★ blind", gerne: "gerne", ausserhalb: "außerhalb", ohnePlan: "kein Plan"};

  const planIstSichtbar = () => {
    const p = document.getElementById("panel-planist");
    return !!p && !p.hidden;
  };

  function renderPlanIst() {
    if (!planIstSichtbar()) return;
    const ziel = document.getElementById("plan-ist");
    if (!ziel) return;
    ziel.textContent = "";
    const spiele = games.filter((s) => s.team === team.team)
      .sort((a, b) => (b.time || b.date || "").localeCompare(a.time || a.date || "")
                      || (b.game || 0) - (a.game || 0));
    ziel.append(el("p", {class: "hint"}, "Picks aus den Turnierspielen von " + team.team
      + " gegen den heutigen Draftplan. Ein Plan von damals ist nicht gespeichert – "
      + "wer den Plan seither geändert hat, sieht die alten Spiele mit dem neuen Plan."));
    if (!spiele.length) {
      ziel.append(zustandsHinweis("leer", "Noch keine Turnierspiele",
        "Für " + team.team + " ist keine Partie erfasst. Unter REVIEW · Turnierspiele eintragen – "
        + "dann steht hier, wer nach Plan gespielt hat."));
      return;
    }
    const planVon = (label) => {
      const sp = team.players.find((p) => p.label === label);
      return sp ? planOf(sp) : null;
    };
    const r = ENGINE.planGegenIst(spiele, planVon, ROLES.map(([w]) => w));
    const g = r.gesamt;
    const anteil = ENGINE.imPlanAnteil(g);
    ziel.append(zahlenZeile([
      {label: "Partien", wert: spiele.length},
      {label: "Im Plan", wert: anteil === null ? "–" : Math.round(anteil * 100) + " %",
       fuss: "von " + (g.blind + g.gerne + g.ausserhalb) + " beurteilbaren Picks"},
      {label: "Blind", wert: g.blind},
      {label: "Gerne", wert: g.gerne},
      {label: "Außerhalb", wert: g.ausserhalb},
      {label: "Ohne Plan", wert: g.ohnePlan, fuss: "Spieler ohne Planeintrag"},
    ], {titel: "Gesamt"}));

    // Je Spieler
    ziel.append(el("h3", {class: "pi-titel"}, "Je Spieler"),
      el("div", {class: "pi-tabelle-huelle"}, el("table", {class: "pi-tabelle"},
        el("thead", {}, el("tr", {}, ["Rolle", "Spieler", "Picks", "Im Plan", "Blind", "Gerne", "Außerhalb", "Ohne Plan"]
          .map((t, i) => el("th", {class: i > 1 ? "num" : null, scope: "col"}, t)))),
        el("tbody", {}, r.spieler.map((s) => {
          const a = ENGINE.imPlanAnteil(s);
          return el("tr", {},
            el("td", {}, ENGINE.ROLLEN_WORT[s.rolle] || s.rolle),
            el("td", {}, s.spieler || "unbekannt"),
            el("td", {class: "num"}, s.picks),
            el("td", {class: "num"}, a === null ? "–" : Math.round(a * 100) + " %"),
            el("td", {class: "num"}, s.blind || "–"),
            el("td", {class: "num"}, s.gerne || "–"),
            el("td", {class: "num"}, s.ausserhalb || "–"),
            el("td", {class: "num dim"}, s.ohnePlan || "–"));
        })))));

    // Je Partie
    ziel.append(el("h3", {class: "pi-titel"}, "Je Partie"),
      el("div", {class: "pi-spiele"}, r.zeilen.map(({spiel, picks}) => el("article", {class: "pi-spiel"},
        el("div", {class: "pi-spiel-kopf"},
          el("b", {}, "vs " + (spiel.opponent || "?")),
          // Der Serienname wiederholt Gegner und Datum - Datum und Spielnummer reichen.
          el("span", {class: "bf-neben"}, [deDate(spiel.date || ""),
            spiel.game ? "Spiel " + spiel.game : null].filter(Boolean).join(" · ")),
          el("span", {class: "pi-ergebnis " + (spiel.result === "win" ? "sieg" : "niederlage")},
            spiel.result === "win" ? "Sieg" : "Niederlage")),
        el("div", {class: "pi-picks"}, picks.map((p) => el("div", {class: "pi-pick " + (p.status || "leer")},
          el("span", {class: "cp-klein"}, ENGINE.ROLLEN_WORT[p.rolle] || p.rolle),
          p.champ ? briefingChamp(p.champ) : el("span", {class: "bf-neben"}, "–"),
          el("span", {class: "pi-status"}, p.status ? PLAN_IST_WORT[p.status] : ""),
          p.spieler ? el("span", {class: "bf-neben"}, p.spieler) : null)))))));
  }
