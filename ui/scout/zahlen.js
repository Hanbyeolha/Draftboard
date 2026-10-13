  /* ================================================ Zahlenzeile (ui/scout)
     Draftboard 2.0, Phase 5. Kennzahlen als Zeile statt als Kaestchen:
     grosse Zahl, darunter klein die Beschriftung, darunter - wenn es sie
     gibt - die Einordnung. Kein Rahmen, keine Flaeche: die Zahl traegt.
     (Spezifikation Punkt 24: "63 % / 4.8 / 27 - WINRATE / KDA / GAMES".)

     Im DOM steht die Beschriftung vor der Zahl, damit ein Screenreader
     "Winrate 63 %" liest; sichtbar steht die Zahl oben (CSS order).

     felder: [{label, wert, einheit?, fuss?, titel?, klick?}]
       klick: Funktion -> das Feld wird ein Knopf (z. B. Turnierpartien). */
  function zahlenZeile(felder, {klasse = "", titel = null} = {}) {
    const zeile = el("div", {class: "zahlen" + (klasse ? " " + klasse : ""),
                             role: "group", "aria-label": titel || null},
      titel ? el("span", {class: "zahlen-titel"}, titel) : null);
    for (const f of felder) {
      if (!f) continue;
      const inhalt = [
        el("span", {class: "zahl-label"}, f.label),
        el("span", {class: "zahl-wert"}, String(f.wert),
           f.einheit ? el("small", {}, " " + f.einheit) : null),
        f.fuss ? el("span", {class: "zahl-fuss"}, f.fuss) : null,
      ];
      const attr = {class: "zahl" + (f.klick ? " zahl-klick" : ""), title: f.titel || null};
      const feld = f.klick ? el("button", {...attr, type: "button"}, inhalt) : el("div", attr, inhalt);
      if (f.klick) feld.addEventListener("click", f.klick);
      zeile.append(feld);
    }
    return zeile;
  }
