  /* ================================================ SCOUT-Filter (ui/scout)
     Draftboard 2.0, Phase 5 (Spezifikation Punkt 25): Rolle und Spieler
     filtern, ohne ein Menue zu oeffnen. Eine Zeile Knoepfe
     [Alle] [Top] [Jungle] [Mid] [Bot] [Support] und ein Suchfeld. Gilt fuer
     die Spielerkarten und den Draftplan zugleich - wer auf Mid steht, will
     in beiden Reitern Mid sehen. Es blendet nur aus; gerechnet wird nichts
     neu, und keine Karte veraendert sich.

     Der Stand haengt an der Funktion statt an einer let-Variable: die
     Reiter zeichnen beim Start, bevor diese Zeilen gelaufen sind. */
  function scoutFilterStand() {
    if (!scoutFilterStand.s) {
      let s = null;
      try { s = JSON.parse(window.sessionStorage.getItem("scout-filter") || "null"); } catch (e) { /* egal */ }
      scoutFilterStand.s = s && typeof s === "object" ? {rolle: s.rolle || null, text: s.text || ""}
                                                      : {rolle: null, text: ""};
    }
    return scoutFilterStand.s;
  }

  function scoutFilterSetzen(teil) {
    scoutFilterStand.s = {...scoutFilterStand(), ...teil};
    try { window.sessionStorage.setItem("scout-filter", JSON.stringify(scoutFilterStand.s)); }
    catch (e) { /* dann nur fuer diesen Blick */ }
    scoutFilterZeichnen();
    scoutFilterAnwenden();
  }

  // Die Karten tragen data-role und data-spieler (Name und Riot-ID).
  function scoutFilterAnwenden() {
    const {rolle, text} = scoutFilterStand();
    const nadel = text.trim().toLowerCase();
    for (const id of ["player-cards", "plan-cards"]) {
      const host = document.getElementById(id);
      if (!host) continue;
      let sichtbar = 0, gesamt = 0;
      for (const karte of host.querySelectorAll(":scope > .panel[data-spieler]")) {
        gesamt += 1;
        const passt = (!rolle || karte.dataset.role === rolle)
          && (!nadel || karte.dataset.spieler.toLowerCase().includes(nadel));
        karte.hidden = !passt;
        if (passt) sichtbar += 1;
      }
      const leer = host.parentElement.querySelector(".scout-leer");
      if (leer) leer.hidden = sichtbar > 0 || !gesamt;
      const zahl = host.parentElement.querySelector(".scout-filter-zahl");
      if (zahl) zahl.textContent = (rolle || nadel) && gesamt ? sichtbar + " von " + gesamt : "";
    }
  }

  // Knoepfe und Feld in beiden Reitern auf denselben Stand bringen.
  function scoutFilterZeichnen() {
    const {rolle, text} = scoutFilterStand();
    for (const zeile of document.querySelectorAll(".scout-filter")) {
      for (const k of zeile.querySelectorAll("[data-rolle]")) {
        k.setAttribute("aria-pressed", String((k.dataset.rolle || null) === rolle));
      }
      const feld = zeile.querySelector("input");
      if (feld && feld.value !== text && document.activeElement !== feld) feld.value = text;
    }
  }

  function scoutFilterAufbauen() {
    for (const zeile of document.querySelectorAll(".scout-filter")) {
      if (zeile.childElementCount) continue;
      const knoepfe = el("div", {class: "switch scout-rollen", role: "group", "aria-label": "Rolle"},
        [["", "Alle"], ...ROLES].map(([wert, wort]) => {
          const k = el("button", {type: "button", "data-rolle": wert, "aria-pressed": "false"}, wort);
          k.addEventListener("click", () => scoutFilterSetzen({rolle: wert || null}));
          return k;
        }));
      const feld = el("input", {type: "search", placeholder: "Spieler suchen …",
                                "aria-label": "Spieler suchen", autocomplete: "off"});
      feld.addEventListener("input", () => scoutFilterSetzen({text: feld.value}));
      feld.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && feld.value) { e.preventDefault(); feld.value = ""; scoutFilterSetzen({text: ""}); }
      });
      zeile.append(knoepfe, feld, el("span", {class: "scout-filter-zahl", "aria-live": "polite"}));
      const leer = el("p", {class: "hint scout-leer", hidden: true}, "Kein Spieler passt zum Filter. ");
      const zurueck = el("button", {class: "more", type: "button"}, "Filter zurücksetzen");
      zurueck.addEventListener("click", () => scoutFilterSetzen({rolle: null, text: ""}));
      leer.append(zurueck);
      zeile.after(leer);
    }
    scoutFilterZeichnen();
  }
  scoutFilterAufbauen();
