  /* ================================================ Einschätzung prüfen
     Die Ersteinschätzung (Vorschlag, ungeprüft) zählt nach Entscheidung A
     nicht in der Note. Hier wird sie geprüft: so lassen und übernehmen,
     oder Achsen umstellen - beides macht daraus einen geprüften Eintrag.
     Reihenfolge nach Spielhäufigkeit im Patch: die ersten Zeilen decken
     die meisten Drafts ab. */
  const HZ_ACHSEN = ENGINE.ACHSEN.filter((a) => !ENGINE.GEMESSEN_VORHANDEN.has(a));
  const HZ_KURZ = {engage: "Eng", disengage: "Dis", peel: "Peel", frontline: "Front",
                   dive: "Dive", catch: "Catch", poke: "Poke", siege: "Siege",
                   splitpush: "Split", teamfight: "TF", objective: "Obj"};
  const HZ_LANG = {objective: "Objective"};   // "Objective Control" passt nicht
  const HZ_FILTER = [["alle", "Alle"], ["offen", "Ungeprüft"], ["geprueft", "Geprüft"],
                     ["unsere", "Unsere Pools"]];
  let hzFilter = "alle";
  let hzSuche = "";

  function hzChampions() {
    const roh = heuristikRoh();
    const namen = new Set([...Object.keys(roh.vorschlag || {}),
                           ...Object.keys(roh.champions || {}),
                           ...Object.keys(geprueftWirksam())]);
    const haeufig = (c) => {
      const w = DRAFT && DRAFT.prioritaet ? DRAFT.prioritaet(c) : null;
      return w ? w.value : 0;
    };
    return [...namen].sort((a, b) => haeufig(b) - haeufig(a) || (a < b ? -1 : 1));
  }

  // Champions in den Pools und im Draftplan des gewählten Teams.
  function hzUnsere() {
    const raus = new Set();
    for (const p of team.players) {
      // Ranked und Liga, jede Season: ab 3 Partien gilt er als Pool.
      for (const q of ["RANKED", "LIGA"]) {
        for (const s of (p.queues || {})[q] || []) for (const c of s.champions || []) {
          if ((c.win || 0) + (c.lose || 0) >= 3) raus.add(c.champ);
        }
      }
      const pl = planOf(p);
      for (const c of [...pl.blind, ...pl.likes]) raus.add(c);
    }
    return raus;
  }

  function hzWerte(champ) {
    const g = geprueftWirksam()[champ];
    if (g) return {werte: g, art: "geprueft"};
    return {werte: (heuristikRoh().vorschlag || {})[champ] || {}, art: "vorschlag"};
  }

  function hzSetze(champ, werte) {
    const neu = {...geprueftWirksam()};
    if (werte) neu[champ] = werte; else delete neu[champ];
    // Gleich der Datei? Dann gibt es nichts Lokales mehr.
    const gleich = JSON.stringify(Object.keys(neu).sort().map((k) => [k, neu[k]]))
      === JSON.stringify(Object.keys(geprueftDatei()).sort().map((k) => [k, geprueftDatei()[k]]));
    lokaleHeuristik = gleich ? null : neu;
    heuristikSichern();
    liveHeuristikNeu();
    renderHeuristik();
    renderLiveDraft();
  }

  function hzZeile(champ) {
    const {werte, art} = hzWerte(champ);
    const src = iconUrl(champ);
    const rollen = ENGINE.moeglicheRollen(DRAFT, champ)
      .map((r) => ENGINE.ROLLEN_WORT[r.rolle] || r.rolle).join(" · ");
    const achsen = HZ_ACHSEN.map((a) => {
      const v = Math.max(0, Math.min(2, Number(werte[a]) || 0));
      const k = el("button", {class: "hz-achse s" + v, type: "button",
          "aria-label": champ + ", " + (ENGINE.ACHSEN_WORT[a] || a) + ": " + v,
          title: (ENGINE.ACHSEN_WORT[a] || a) + " — "
                 + (((heuristikRoh()._achsen || {})[a]) || "")
                 + "\nKlick: 0 → 1 → 2 → 0. Ändern macht den Eintrag zu eurem."},
        v ? String(v) : "\u00b7");
      k.addEventListener("click", () => {
        hzSetze(champ, {...werte, [a]: (v + 1) % 3});
      });
      return k;
    });
    const knopf = art === "geprueft"
      ? el("button", {class: "del hz-knopf", type: "button",
                      title: "Euren Eintrag entfernen - es gilt wieder die ungeprüfte Ersteinschätzung"},
           "Zurück zum Vorschlag")
      : el("button", {class: "more hz-knopf", type: "button",
                      title: "So übernehmen - zählt dann in der Note"}, "Übernehmen");
    knopf.addEventListener("click", () => hzSetze(champ, art === "geprueft" ? null : {...werte}));
    return el("div", {class: "hz-zeile " + art},
      el("span", {class: "hz-champ"},
        src ? el("img", {src, alt: "", loading: "lazy"}) : null,
        el("b", {}, champ),
        el("span", {class: "sub"}, rollen),
        el("span", {class: "hz-art " + art}, art === "geprueft" ? "geprüft" : "Vorschlag")),
      el("span", {class: "hz-achsen"}, achsen),
      knopf);
  }

  /* Wie weit der Kopf der Liste von oben klebt: so hoch, wie die Leiste
     oben gerade ist - gemessen, sie bricht je nach Breite um. Ist sie
     nicht klebend (Handy), dann 0. */
  function hzKopfVersatz() {
    const bar = document.querySelector(".bar");
    const h = bar && getComputedStyle(bar).position === "sticky"
      ? Math.round(bar.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--bar-hoehe", h + "px");
  }
  window.addEventListener("resize", hzKopfVersatz);

  function renderHeuristik() {
    const host = document.getElementById("hz-liste");
    if (!host) return;
    hzKopfVersatz();
    const geprueft = geprueftWirksam();
    const alle = hzChampions();
    const unsere = hzFilter === "unsere" ? hzUnsere() : null;
    const liste = alle.filter((c) =>
      (!hzSuche || c.toLowerCase().includes(hzSuche))
      && (hzFilter === "alle" ? true
          : hzFilter === "offen" ? !geprueft[c]
          : hzFilter === "geprueft" ? !!geprueft[c]
          : unsere.has(c)));
    const nGeprueft = alle.filter((c) => geprueft[c]).length;
    document.getElementById("hz-hint").textContent =
      nGeprueft + " von " + alle.length + " Champions geprüft. Nur geprüfte Einträge "
      + "zählen in der Note (Störung, Comp-Achsen); die übrigen sind Kontext im "
      + "Lagebild. Sortiert nach Spielhäufigkeit im Patch."
      + (lokaleHeuristik ? " Geändert in diesem Browser - zum Speichern unten." : "");
    document.getElementById("hz-zahl").textContent = liste.length + " angezeigt";
    const filter = document.getElementById("hz-filter");
    filter.textContent = "";
    for (const [wert, wort] of HZ_FILTER) {
      const k = el("button", {type: "button", "aria-pressed": String(hzFilter === wert)}, wort);
      k.addEventListener("click", () => { hzFilter = wert; renderHeuristik(); });
      filter.append(k);
    }
    host.textContent = "";
    host.append(el("div", {class: "hz-zeile hz-kopf", "aria-hidden": "true"},
      el("span", {class: "hz-champ"}, "Champion"),
      el("span", {class: "hz-achsen"}, HZ_ACHSEN.map((a) =>
        el("span", {class: "hz-achse-wort", title: ENGINE.ACHSEN_WORT[a] || a},
          el("span", {class: "lang"}, HZ_LANG[a] || ENGINE.ACHSEN_WORT[a] || a),
          el("span", {class: "kurz"}, HZ_KURZ[a] || a)))),
      el("span", {})));
    host.append(...liste.map(hzZeile));
    const ohne = document.getElementById("hz-verwerfen");
    ohne.disabled = !lokaleHeuristik;
  }

  function hzDateiText() {
    return ENGINE.heuristikDatei(heuristikRoh(), geprueftWirksam(),
                                 new Date().toISOString().slice(0, 10));
  }
  const hzNote = (t) => { document.getElementById("hz-note").textContent = t || ""; };

  document.getElementById("hz-suche").addEventListener("input", (e) => {
    hzSuche = e.target.value.trim().toLowerCase();
    renderHeuristik();
  });
  document.getElementById("hz-speichern").addEventListener("click", () => {
    if (!SERVER) {
      downloadFile("champion-heuristik.json", hzDateiText(), "application/json");
      hzNote("Ohne laufendes Programm nur als Datei: nach data/ legen (die alte "
           + "ersetzen) und python build.py --pages laufen lassen.");
      return;
    }
    hzNote("Speichere ...");
    saveToServer("heuristik", hzDateiText())
      .then(() => afterServerSave([HZ_KEY]))
      .catch((err) => hzNote("Nicht gespeichert: " + err.message));
  });
  document.getElementById("hz-download").addEventListener("click", () => {
    downloadFile("champion-heuristik.json", hzDateiText(), "application/json");
    hzNote("Heruntergeladen. Nach data/ legen (die alte ersetzen) und neu bauen.");
  });
  document.getElementById("hz-verwerfen").addEventListener("click", () => {
    lokaleHeuristik = null;
    heuristikSichern();
    liveHeuristikNeu();
    renderHeuristik();
    renderLiveDraft();
    hzNote("Verworfen - es gilt wieder der Stand aus der Datei.");
  });

