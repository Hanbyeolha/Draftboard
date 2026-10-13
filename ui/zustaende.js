  /* ========================================== Zustaende (Draftboard 2.0)
     Phase 7, Spezifikation Punkt 29: jeder groessere Teil sagt, was los
     ist - nicht "Keine Daten.", sondern ein Titel und ein Satz, was fehlt
     und was hilft.
       art: leer | laden | fehlt | fehler | fertig
     Fehler werden vorgelesen (role=alert), alles andere ist ein Status. */
  function zustandsHinweis(art, titel, text, ...aktionen) {
    return el("div", {class: "zh zh-" + art, role: art === "fehler" ? "alert" : "status"},
      el("strong", {class: "zh-titel"}, titel),
      text ? el("p", {class: "zh-text"}, text) : null,
      aktionen.filter(Boolean).length ? el("div", {class: "zh-aktionen"}, aktionen.filter(Boolean)) : null);
  }
