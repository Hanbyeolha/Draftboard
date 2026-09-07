/* op.gg-Extraktor für das Draftboard.
   ---------------------------------------------------------------------------
   Wird in der Browser-Konsole auf op.gg ausgeführt (F12 -> Console). Die Daten
   dort kommen per Server-Rendering bzw. Server-Actions an, ein reiner
   HTTP-Abruf aus Python liefert sie NICHT - deshalb der Umweg über den Browser.

   NICHT von Hand abtippen: `python scrape.py "<Team>"` schreibt den Installer
   out/install-scout.js (eine Zeile für die Konsole) und druckt für jeden
   Spieler die fertigen Befehle. Siehe README.md, "Daten aktualisieren".

   Der Ablauf dahinter, je Spieler:

     1. Einmal je Browser-Sitzung: Installer einfügen. Er legt diese Datei in
        localStorage ab; nach jedem Seitenwechsel genügt dann
            eval(localStorage.__scout)

     2. https://op.gg/lol/summoners/euw/<Name>-<TAG>
            clickUpdate()                        // op.gg frisch laden lassen
            saveP('Key', Object.assign({riotId:'Name#TAG', label:'Name',
                          team:'AFC1', role:'TOP', region:'euw',
                          opggUrl:location.href.split('?')[0]}, scoutSummary()))
     3. .../style
            saveP('Key', {style: scoutStyle()})
     4. .../champions   - eine Season je Aufruf (Zeitlimits)
            await grabSeason('Key', 33)          // Ranked gesamt
            await grabSeason('Key', 31)
            await grabSeason('Key', 29)
            await grabQOne('Key', 'SOLORANKED', 33)
            await grabQOne('Key', 'FLEXRANKED', 33)
            await grabQOne('Key', 'NORMAL', 33)  // Normal kennt keine Season
     5. Wenn alle Spieler durch sind:
            copy(dumpAll())   -> JSON für data/raw/<team>-<datum>.json

   Season-IDs stehen im Season-Dropdown der /champions-Seite
   (33 = Season 2026, 31 = 2025, 29 = 2024 S3).                              */

// --------------------------------------------------------------- Helfer

function leaf(el) {
  if (!el) return [];
  return [...el.querySelectorAll("*")]
    .filter((n) => !n.children.length)
    .map((n) => n.textContent.trim())
    .filter(Boolean);
}

function num(s) {
  if (s === null || s === undefined) return null;
  const m = String(s).replace(/,/g, "").match(/-?[\d.]+/);
  return m ? Number(m[0]) : null;
}

// ---------------------------------------------------------- Übersicht (/)

// Der Text enthaelt "Ranked Solo/Duo" zweimal: einmal als Queue-Filter, einmal
// als Rangblock. Nur letzterer hat darunter LP und Bilanz - danach wird gesucht.
function parseRank(text, label) {
  const lines = text.split("\n").map((l) => l.trim());
  const TIERS = /^(Iron|Bronze|Silver|Gold|Platinum|Emerald|Diamond|Master|Grandmaster|Challenger)$/i;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== label) continue;
    const tier = (lines[i + 1] || "").match(/^([A-Za-z]+)(?: (\d))?$/);
    const lp = (lines[i + 2] || "").match(/^([\d,]+) LP$/);
    const record = (lines[i + 3] || "").match(/^(\d+)W (\d+)L$/);
    if (!tier || !TIERS.test(tier[1]) || !lp || !record) continue;
    return {
      tier: tier[1],
      division: tier[2] ? ["", "I", "II", "III", "IV"][Number(tier[2])] : "",
      lp: num(lp[1]),
      wins: Number(record[1]),
      losses: Number(record[2]),
    };
  }
  return null;
}

function scoutSummary() {
  const text = document.body.innerText;
  const mastery = [];
  const mi = text.lastIndexOf("\nMastery\n");
  if (mi >= 0) {
    const block = text.slice(mi, mi + 600);
    const re = /\n(\d+)\n([^\n]+)\n([\d,]+)\npts/g;
    let m;
    while ((m = re.exec(block)) && mastery.length < 8) {
      mastery.push({level: Number(m[1]), champ: m[2].trim(), points: num(m[3])});
    }
  }
  const ladder = text.match(/Ladder Rank ([\d,]+)/);
  const updated = text.match(/Last updated: ([^\n]+)/);
  return {
    ok: !/No search results/.test(text),
    solo: parseRank(text, "Ranked Solo/Duo"),
    flex: parseRank(text, "Ranked Flex"),
    mastery,
    ladderRank: ladder ? num(ladder[1]) : null,
    lastUpdated: updated ? updated[1].trim() : null,
    title: document.title,
  };
}

// ------------------------------------------------------------ Stil (/style)

function scoutStyle() {
  const text = document.body.innerText;
  const grab = (re) => { const m = text.match(re); return m ? m.slice(1) : null; };

  const roleShare = [];
  const rs = text.match(/Role share\n([\s\S]{0,120}?)Preferred classes/);
  if (rs) {
    const names = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
    const re = /(\d+)%\n(\d+)G/g;
    let m;
    while ((m = re.exec(rs[1])) && roleShare.length < 5) {
      roleShare.push({role: names[roleShare.length], share: Number(m[1]), games: Number(m[2])});
    }
  }

  const classes = [];
  const pc = text.match(/Preferred classes\n([\s\S]{0,160}?)Champion Pool/);
  if (pc) {
    const re = /([A-Za-z ]+)\n(\d+)%/g;
    let m;
    while ((m = re.exec(pc[1])) && classes.length < 4) {
      classes.push({name: m[1].trim(), share: Number(m[2])});
    }
  }

  const side = grab(/Blue\nWin rate\nRed\n([\d.]+)%\n[^\n]*\n([\d.]+)%\nPlay share\nBlue\n([\d.]+)%\nRed\n([\d.]+)%/);
  // Ab 1000 Spielen schreibt op.gg "1,059 games" - Kommas zulassen.
  const totals = grab(/ranked · [\d,]+ games\nGames\n([\d,]+)\n([\d,]+)W ([\d,]+)L\nWin rate\n(\d+)%\nKDA\n([\d.]+):1/);
  const pool = grab(/Champion pool\n(\d+) \/ (\d+)\n(\d+)%/);
  const recent = grab(/Recent (\d+) games vs season (\d+) games\s*\nWin rate\n(\d+)%/);

  const metrics = {};
  const metricPatterns = [
    ["kda", /Performance Metrics[\s\S]*?KDA\n([\d.,]+)/],
    ["kp", /Performance Metrics[\s\S]*?Kill participation\n([\d.,]+)%/],
    ["damageShare", /Performance Metrics[\s\S]*?Team damage share\n([\d.,]+)%/],
    ["dpm", /Performance Metrics[\s\S]*?DPM\n([\d.,]+)/],
    ["csm", /Performance Metrics[\s\S]*?CSM\n([\d.,]+)/],
    ["gpm", /Performance Metrics[\s\S]*?GPM\n([\d.,]+)/],
    ["vspm", /Performance Metrics[\s\S]*?VSPM\n([\d.,]+)/],
  ];
  for (const [key, re] of metricPatterns) {
    const m = text.match(re);
    metrics[key] = m ? Number(String(m[1]).replace(/,/g, "")) : null;   // "1,026" -> 1026
  }

  return {
    roleShare, classes, metrics,
    games: totals ? num(totals[0]) : null,
    wins: totals ? num(totals[1]) : null,
    losses: totals ? num(totals[2]) : null,
    winRate: totals ? Number(totals[3]) : null,
    kda: totals ? Number(totals[4]) : null,
    poolPlayed: pool ? Number(pool[0]) : null,
    poolTotal: pool ? Number(pool[1]) : null,
    poolFocus: pool ? Number(pool[2]) : null,
    recentGames: recent ? Number(recent[0]) : null,
    recentWinRate: recent ? Number(recent[2]) : null,
    sideBlueWin: side ? Number(side[0]) : null,
    sideRedWin: side ? Number(side[1]) : null,
    sideBlueShare: side ? Number(side[2]) : null,
  };
}

// ------------------------------------------------- Championtabelle (/champions)

function seasonSelect() {
  return [...document.querySelectorAll("select")]
    .find((s) => [...s.options].some((o) => o.text.startsWith("Season")));
}

function queueSelect() {
  return [...document.querySelectorAll("select")]
    .find((s) => [...s.options].some((o) => o.value === "SOLORANKED"));
}

// Wie op.gg die Seasons nennt: {"33": "Season 2026", "29": "Season 2024 S3", ...}
// Ohne das steht in der Seite nur die interne Nummer, die niemand einordnen kann.
function seasonNames() {
  const sel = seasonSelect();
  const out = {};
  if (sel) for (const o of sel.options) out[o.value] = o.text.trim();
  return out;
}

// React-kontrollierte <select> brauchen den nativen Setter plus change-Event.
async function setSelect(sel, value, waitMs) {
  if (!sel) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  setter.call(sel, String(value));
  sel.dispatchEvent(new Event("change", {bubbles: true}));
  await new Promise((r) => setTimeout(r, waitMs || 3500));
  return true;
}

async function setSeason(id) { return setSelect(seasonSelect(), id); }
async function setQueue(queue) { return setSelect(queueSelect(), queue); }

async function scoutChamps() {
  for (let i = 0; i < 12; i++) {                       // "Show more" ausklappen
    const more = [...document.querySelectorAll("button")]
      .filter((b) => b.innerText.trim() === "Show more");
    if (!more.length) break;
    more[more.length - 1].click();
    await new Promise((r) => setTimeout(r, 1000));
  }

  const table = document.querySelector("table");
  const rows = [];
  if (table) {
    // Spalten je Queue verschieden (Normal hat weder OP Score noch CS/min),
    // deshalb über die Kopfzeile suchen statt feste Indizes zu nehmen.
    const heads = [...table.querySelectorAll("thead th")].map((t) => t.innerText.trim());
    const iPlayed = heads.indexOf("Played");
    const iKda = heads.indexOf("KDA");
    const iCs = heads.indexOf("CS");
    for (const tr of table.querySelectorAll("tbody tr")) {
      const tds = tr.querySelectorAll("td");
      if (!tds.length) continue;
      if (!/^\d+$/.test((tds[0].textContent || "").trim())) continue;   // vs-Detailzeilen
      const img = tr.querySelector("img[alt]");
      if (!img) continue;
      const played = iPlayed >= 0 ? leaf(tds[iPlayed]) : [];
      const kda = iKda >= 0 ? leaf(tds[iKda]) : [];
      const cs = iCs >= 0 ? leaf(tds[iCs]) : [];
      const kp = (kda[1] || "").match(/\((\d+)%\)/);
      const perMin = cs.find((s) => s.includes("/m"));
      rows.push({
        champ: img.alt,
        icon: img.src.split("?")[0],
        win: num(played[0]),
        lose: num(played[1]),
        winRate: num(played[2]),
        kda: num(kda[0]),
        kp: kp ? Number(kp[1]) : null,
        csPerMin: perMin ? num(perMin.replace("/m", "")) : null,
      });
    }
  }
  const ss = seasonSelect();
  const qs = queueSelect();
  return {
    ok: !!table,
    seasonId: ss ? Number(ss.value) : null,
    queueType: qs ? qs.value : null,
    champions: rows,
  };
}

// ------------------------------------------------------ Sammeln & Ausgeben

// Zwischenspeicher im localStorage, damit Seitenwechsel nichts verlieren.
function saveP(key, patch) {
  const all = JSON.parse(localStorage.getItem("__players") || "{}");
  all[key] = Object.assign(all[key] || {}, patch);
  localStorage.setItem("__players", JSON.stringify(all));
  return Object.keys(all).length;
}

function keepIcons(rows) {
  const icons = JSON.parse(localStorage.getItem("__icons") || "{}");
  for (const c of rows) icons[c.champ] = c.icon;
  localStorage.setItem("__icons", JSON.stringify(icons));
  // Kompaktform, wie sie in data/raw/*.json steht:
  return rows.map((c) => [c.champ, c.win, c.lose, c.winRate, c.kda, c.kp, c.csPerMin]);
}

// Ranked gesamt (Solo + Flex) je Season -> landet unter "seasons".
async function grabSeasons(key, ids) {
  const out = [];
  for (const id of ids) {
    await setSeason(id);
    let r = await scoutChamps();
    for (let t = 0; t < 3 && r.seasonId !== id; t++) {     // Umschalten abwarten
      await new Promise((x) => setTimeout(x, 2500));
      r = await scoutChamps();
    }
    out.push({id: r.seasonId, c: keepIcons(r.champions)});
  }
  // Einmal reicht - die Namen sind fuer alle Spieler dieselben.
  localStorage.setItem("__seasonNames", JSON.stringify(seasonNames()));
  saveP(key, {seasons: out});
  return out.map((s) => [s.id, s.c.length]);
}

// Eine einzelne Queue je Season -> landet unter "queues".
async function grabQ(key, queue, ids) {
  const all = JSON.parse(localStorage.getItem("__queues") || "{}");
  all[key] = all[key] || {};
  await setQueue(queue);
  const out = [];
  for (const id of ids) {
    await setSeason(id);
    let r = await scoutChamps();
    for (let t = 0; t < 3 && r.seasonId !== id; t++) {
      await new Promise((x) => setTimeout(x, 2500));
      r = await scoutChamps();
    }
    out.push({id: r.seasonId, q: r.queueType, c: keepIcons(r.champions)});
  }
  all[key][queue] = out;
  localStorage.setItem("__queues", JSON.stringify(all));
  return out.map((s) => [s.q, s.id, s.c.length]);
}

// Eine einzelne Season nachziehen und in das Gespeicherte einsortieren.
// Schonender als grabSeasons(), weil ein Aufruf = eine Season (Zeitlimits).
async function grabSeason(key, id) {
  const all = JSON.parse(localStorage.getItem("__players") || "{}");
  const list = (all[key] && all[key].seasons) || [];
  await setSeason(id);
  let r = await scoutChamps();
  for (let t = 0; t < 3 && r.seasonId !== id; t++) {
    await new Promise((x) => setTimeout(x, 2500));
    r = await scoutChamps();
  }
  const entry = {id: r.seasonId, c: keepIcons(r.champions)};
  saveP(key, {seasons: list.filter((s) => s.id !== entry.id).concat([entry])
                           .sort((a, b) => (b.id || 0) - (a.id || 0))});
  return [entry.id, entry.c.length];
}

// Dasselbe für eine Queue.
async function grabQOne(key, queue, id) {
  const all = JSON.parse(localStorage.getItem("__queues") || "{}");
  all[key] = all[key] || {};
  const list = all[key][queue] || [];
  if (queueSelect() && queueSelect().value !== queue) await setQueue(queue);
  await setSeason(id);
  let r = await scoutChamps();
  for (let t = 0; t < 3 && r.seasonId !== id; t++) {
    await new Promise((x) => setTimeout(x, 2500));
    r = await scoutChamps();
  }
  const entry = {id: r.seasonId, q: r.queueType, c: keepIcons(r.champions)};
  all[key][queue] = list.filter((s) => s.id !== entry.id).concat([entry])
                        .sort((a, b) => (b.id || 0) - (a.id || 0));
  localStorage.setItem("__queues", JSON.stringify(all));
  return [entry.q, entry.id, entry.c.length];
}

// Klickt den Update-Knopf auf dem Profil, damit op.gg frisch von Riot lädt.
function clickUpdate() {
  const btn = [...document.querySelectorAll("button")]
    .find((b) => b.innerText.trim() === "Update");
  if (btn) btn.click();
  return !!btn;
}

// Alles Gesammelte im Format von data/raw/*.json. Ergebnis in eine Datei
// kopieren; ist es zu lang für die Konsole, hilft copy(dumpAll()).
function dumpAll() {
  const players = JSON.parse(localStorage.getItem("__players") || "{}");
  const queues = JSON.parse(localStorage.getItem("__queues") || "{}");
  const rawIcons = JSON.parse(localStorage.getItem("__icons") || "{}");

  const icons = {};
  let version = null;
  for (const [champ, url] of Object.entries(rawIcons)) {
    const m = url.match(/lol\/([\d.]+)\/champion\/(.+)\.png$/);
    if (m) { version = m[1]; icons[champ] = m[2]; }
  }

  const out = {
    version,
    scrapedAt: new Date().toISOString().slice(0, 10),
    icons,
    seasonNames: JSON.parse(localStorage.getItem("__seasonNames") || "{}"),
    players: {},
    queues,
  };
  for (const [key, p] of Object.entries(players)) {
    out.players[key] = {
      meta: {
        riotId: p.riotId, label: p.label, team: p.team, role: p.role,
        bench: p.bench || false, region: p.region, opggUrl: p.opggUrl,
        note: p.note || null, lastUpdated: p.lastUpdated, ladderRank: p.ladderRank,
      },
      solo: p.solo,
      flex: p.flex,
      mastery: (p.mastery || []).map((m) => [m.champ, m.level, m.points]),
      style: p.style,
      seasons: p.seasons,
    };
  }
  return JSON.stringify(out);
}

// Zwischenspeicher leeren, bevor ein neues Team gescrapt wird.
function resetScrape() {
  for (const key of ["__players", "__queues", "__icons", "__seasonNames"]) {
    localStorage.removeItem(key);
  }
  return "leer";
}
