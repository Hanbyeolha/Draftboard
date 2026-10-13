  /* ============================================= Zustandsspeicher (ui/)
     Draftboard 2.0, Phase 2. Ein kleiner Speicher fuer den Zustand einer
     Ansicht: lesen, teilweise setzen, Abonnenten benachrichtigen. Das
     Cockpit haelt darin, was nur es selbst kennt (Ansicht, gewaehlte
     Rolle, Shortlist, Meldungen). Der Draft selbst bleibt in liveStand -
     eine Wahrheit fuer beide Ansichten. */
  function storeAnlegen(anfang) {
    let stand = {...anfang};
    const abos = new Set();
    return {
      lies: () => stand,
      setze(teil) {
        stand = {...stand, ...teil};
        for (const f of abos) f(stand);
      },
      abonniere(f) {
        abos.add(f);
        return () => abos.delete(f);
      },
    };
  }

