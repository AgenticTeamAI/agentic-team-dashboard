/* Dashboard v2 — Acties (wie is aan zet?), Team (wat ze deden, één
 * specialist, vaste taken, is je team klaar?, resultaat) en Beheer. */

/* ---------- Acties: wie is aan zet ---------- */
function zoekTekstVan(a) { return [a.titel, a.werk, a.eigenaar, a.correctie, a.opdracht && a.opdracht.tekst].filter(Boolean).join(" ").toLowerCase(); }
function banen() {
  const u = S.ui.acties; const z = u.zoek.trim().toLowerCase();
  const match = a => !z || zoekTekstVan(a).includes(z);
  const persoon = u.van !== "mij" && u.van !== "iedereen" ? u.van : null;
  const wie = u.van === "iedereen" ? undefined : (persoon || ik());
  const B = banenVan(CTX.bundle, CTX.schema, { ik: wie, nu: NU }) || {};
  const m = (k) => viaIds(B[k]).filter(match);
  const genummerd = voorJouLijst().map(a => a.id);
  const jijL = m("jij").sort((a, b) => {
    const ia = genummerd.indexOf(a.id), ib = genummerd.indexOf(b.id);
    if (ia >= 0 && ib >= 0) return ia - ib; if (ia >= 0) return -1; if (ib >= 0) return 1; return sindsVan(a) - sindsVan(b);
  });
  const anderMens = (a) => a.eigenaar && !isAgentNaam(a.eigenaar) && wie && !naamGelijk(a.eigenaar, wie);
  return {
    jij: jijL, later: m("jij-later"),
    team: m("team").filter(a => !persoon || naamGelijk(a.door, persoon)),
    wacht: m("wacht"),
    af: afgerondDezeWeek(m("afgerond")).filter(a => u.van === "iedereen" || !anderMens(a)),
    collega: u.van === "mij" ? m("collega") : [],
    zonder: m("zonder"), klopt: m("klopt-niet"),
  };
}
function rijAchter(a) {
  const s = soortVan(a);
  if (s === "team") return a.status === "Bezig" ? (a.bezigSinds ? "bezig sinds " + wanneer(a.bezigSinds) : "bezig") : "volgende werkmoment";
  if (s === "wacht" || (a.wachtenTot && dt(a.wachtenTot) > NU)) return a.wachtenTot ? "tot " + datumKort(a.wachtenTot) : "op iemand";
  if (s === "klaar") return "af" + (a.afgerondOp ? " · " + datumKort(a.afgerondOp) : "");
  if (s === "weer") return sindsTekst(a);
  if (isTeLaat(a)) return "te laat";
  if (a.deadline) return "voor " + datumKort(a.deadline);
  return wanneer(sindsVan(a));
}
function soortRij(a) { const s = soortVan(a); if (s === "taak" && a.eigenaar && !naamGelijk(a.eigenaar, jij())) return "Taak"; return SOORT_LABEL[s]; }
function rij(a) {
  const s = soortVan(a); const ag = werkAgent(a); const n = S.nummers[a.id] && hoortBijMens(a) && vanMij(a);
  const vorm = n ? `<span class="nr">${S.nummers[a.id]}</span>` : `<span class="vorm" aria-hidden="true">${vormVan(s)}</span>`;
  const wc = ag ? agChip(ag, { kort: true, bezig: a.status === "Bezig" }) : (a.eigenaar && !isAgentNaam(a.eigenaar) && !naamGelijk(a.eigenaar, jij()) ? mensChip(a.eigenaar) : "");
  return `<button class="rij" data-act="open" data-id="${esc(a.id)}">${vorm}<span class="ct"><b>${esc(a.titel)}</b><span class="rmeta">${s !== "team" && s !== "klaar" && s !== "wacht" ? `<span class="soort">${esc(soortRij(a))}</span>` : ""}${wc}<span class="${isTeLaat(a) ? "pil laat" : "mono"}">${esc(rijAchter(a))}</span></span></span><span class="pil status">${esc(a.status || "—")}</span></button>`;
}
function bordKaart(a, baan) {
  const ag = werkAgent(a); const kan = kanSchrijven() && isDesk();
  return `<div class="bordkaart" ${kan ? `draggable="true" data-drag="${esc(a.id)}"` : ""}><div class="bk-top"><b>${S.nummers[a.id] && hoortBijMens(a) && vanMij(a) ? `<span class="mono" style="color:var(--jij-tekst)">${S.nummers[a.id]} · </span>` : ""}${esc(a.titel)}</b>${kan ? `<span class="grip" title="Sleep naar een andere baan">${ic("grip", "klein")}</span>` : ""}</div>
    <div class="bk-meta">${ag ? agChip(ag, { alleen: true, bezig: a.status === "Bezig" }) : ""}<span class="${isTeLaat(a) ? "pil laat" : ""}">${esc(rijAchter(a))}</span></div>
    <div class="rijtje"><button class="hoe breedhoe" data-act="open" data-id="${esc(a.id)}">Open</button>${kanSchrijven() ? `<button class="hoe" data-act="sheet" data-type="verplaats" data-id="${esc(a.id)}" data-baan="${baan}">Verplaats</button>` : ""}</div></div>`;
}
const BAAN_INFO = { jij: ["●", "Jij", "jijb"], team: ["◐", "Je team", "teamb"], wacht: ["○", "Wacht", ""], af: ["✓", "Afgerond", ""] };
function baanNaam(k) { const u = S.ui.acties; if (k !== "jij") return BAAN_INFO[k][1]; return u.van === "iedereen" ? "Mensen" : u.van === "mij" ? "Jij" : voornaam(u.van); }
function baanAchterstand(k, l) {
  if (k === "jij") {
    const laat = l.filter(isTeLaat).length; const o = l.length ? l.reduce((a, b) => sindsVan(a) < sindsVan(b) ? a : b) : null; const d = o ? dagenTussen(sindsVan(o), NU) : 0;
    return [laat ? laat + " te laat" : "", o ? (d <= 0 ? "van vandaag" : "oudste " + d + " " + (d === 1 ? "dag" : "dagen")) : ""].filter(Boolean).join(" · ");
  }
  if (k === "team") { const b = l.filter(a => a.status === "Bezig").length; return b ? b + " bezig" : ""; }
  if (k === "wacht") return l.length ? "komt vanzelf terug" : "";
  return "deze week";
}
function baanLeeg(k) {
  const z = S.ui.acties.zoek.trim(); if (z) return "Niets gevonden voor ‘" + esc(z) + "’.";
  return { jij: "Niets aan jou. Mooi.", team: "Je team heeft nu niets onder handen. Geef het een opdracht.", wacht: "Er wacht niets.", af: "Deze week nog niets afgerond." }[k];
}
function laterGroep(B) { return B.later.length ? `<details class="uitklap" ${det("acties-later")}><summary>Later op je lijst (${B.later.length})${ic("chev")}</summary><div class="binnen">${B.later.map(rij).join("")}</div></details>` : ""; }
function renderActies() {
  if (toegang() === "notion") {
    const n = (metricsVoorJou(CTX) || []).length;
    return `<div class="inhoud">${renderBalk()}<section class="vak" style="display:flex;flex-direction:column;gap:10px"><h2 class="titel">Je acties staan in ${esc(bronVan(CTX, "acties").naam || "Notion")}</h2><p class="stil">${n ? `Volgens je dagstart wachten er ${telwoord(n, "ding", "dingen")} op je. Die zie je bij Voor jou; afhandelen` : "Afhandelen"} doe je in ${esc(bronVan(CTX, "acties").naam || "Notion")}, of vraag het je team in Claude.</p>
    <div class="rijtje"><button class="knop prim" data-act="go" data-r="/">Naar Voor jou</button>${hoe("notion", "Waarom staat dit in Notion?")}</div></section></div>`;
  }
  if (!rows(CTX.bundle, "acties")) {
    return `<div class="inhoud">${renderBalk()}<h2 class="titel">Wie is aan zet?</h2><section class="leeg"><h3>Nog geen acties</h3><p class="stil">Zodra jij of je team iets op de lijst zet, staat het hier, met wie er aan zet is.</p>${kanSchrijven() ? `<button class="knop teamvol" data-act="sheet" data-type="opdracht">${ic("plus", "klein")}Geef je team een opdracht</button>` : ""}</section></div>`;
  }
  const u = S.ui.acties; const B = banen(); const telefoon = !isDesk(); const archief = u.toon === "klaargezet";
  const ander = mensen().filter(n => !jij() || !naamGelijk(n, jij()));
  const vanOpties = [["mij", jij() ? "mij + voor iedereen" : "iedereen"], ["iedereen", "iedereen"]].concat(ander.map(n => [n, voornaam(n)]));
  const werkbalk = `<div class="werkbalk">
    <div class="tussen"><h2 class="titel">Wie is aan zet?</h2><div class="rijtje">${hoe("wie-aan-zet")}${!telefoon && !archief ? `<div class="seg" role="group" aria-label="Weergave"><button data-act="av" data-k="weergave" data-v="lijst" aria-pressed="${u.weergave === "lijst"}">Lijst</button><button data-act="av" data-k="weergave" data-v="bord" aria-pressed="${u.weergave === "bord"}">Bord</button></div>` : ""}${kanSchrijven() ? `<button class="knop teamvol" data-act="sheet" data-type="opdracht">${ic("plus", "klein")}Opdracht geven</button>` : ""}</div></div>
    <div class="zoek">${ic("zoek")}<input type="search" id="acties-zoek" data-input="zoek" placeholder="Zoek, ook in wat je team schreef" value="${esc(u.zoek)}" aria-label="Zoek in acties"></div>
    <div class="rijtje">${archief || !jij() && !ander.length ? "" : `<label class="klein stil" for="acties-van">Van</label><select class="veld" id="acties-van" data-change="van" style="width:auto">${vanOpties.map(([v, l]) => `<option value="${esc(v)}" ${u.van === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`}
      <div class="seg" role="group" aria-label="Toon"><button data-act="av" data-k="toon" data-v="open" aria-pressed="${!archief}">Alles open</button><button data-act="av" data-k="toon" data-v="klaargezet" aria-pressed="${archief}">Klaargezet door je team</button></div></div></div>`;
  if (archief) return `<div class="inhoud">${renderBalk()}${werkbalk}${renderArchief()}</div>`;
  const keys = ["jij", "team", "wacht", "af"];
  const baanKop = (k, l) => `<div class="baankop"><h3><span class="vorm" aria-hidden="true">${BAAN_INFO[k][0]}</span>${esc(baanNaam(k))} <span class="mono">${l.length}</span></h3><span class="ach">${esc(baanAchterstand(k, l))}</span></div>`;
  let banenHtml;
  if (telefoon) {
    const k = keys.includes(u.baan) ? u.baan : "jij"; const l = B[k];
    banenHtml = `<div class="seg vol" role="group" aria-label="Baan">${keys.map(x => `<button data-act="av" data-k="baan" data-v="${x}" aria-pressed="${k === x}">${esc(baanNaam(x))} ${B[x].length}</button>`).join("")}</div>
      <div class="baan ${BAAN_INFO[k][2]}">${baanKop(k, l)}${l.length ? l.map(rij).join("") : `<p class="bordleeg">${baanLeeg(k)}</p>`}${k === "jij" ? laterGroep(B) : ""}</div>`;
  } else if (u.weergave === "bord") {
    banenHtml = `<div class="banen bord">${keys.map(k => `<div class="baan bordk ${BAAN_INFO[k][2]}" data-drop="${k}">${baanKop(k, B[k])}
      ${B[k].length ? B[k].map(a => bordKaart(a, k)).join("") : `<p class="bordleeg">${baanLeeg(k)}</p>`}</div>`).join("")}</div>
      ${kanSchrijven() ? '<p class="klein stil">Sleep een kaart naar een andere baan. Naar <b>Je team</b> vraagt: aan wie? Naar <b>Wacht</b>: tot wanneer?</p>' : ""}`;
  } else {
    banenHtml = `<div class="banen">${keys.map(k => k === "af"
      ? `<details class="baan uitklap" ${det("baan-af")}><summary><span class="baankop" style="flex:1"><h3><span class="vorm" aria-hidden="true">✓</span>Afgerond <span class="mono">${B.af.length}</span></h3><span class="ach">deze week</span></span>${ic("chev")}</summary><div class="binnen">${B.af.length ? B.af.map(rij).join("") : `<p class="bordleeg">${baanLeeg("af")}</p>`}</div></details>`
      : `<div class="baan ${BAAN_INFO[k][2]}">${baanKop(k, B[k])}${B[k].length ? B[k].map(rij).join("") : `<p class="bordleeg">${baanLeeg(k)}</p>`}${k === "jij" ? laterGroep(B) : ""}</div>`).join("")}</div>`;
  }
  const vakken = `<div class="vakken">
    ${B.collega.length ? `<details ${S.ui.openCollega ? "open" : ""}><summary>Bij collega's (${B.collega.length})${ic("chev")}</summary><div class="binnen">${B.collega.map(rij).join("")}</div></details>` : ""}
    ${B.zonder.length ? `<details><summary>Zonder eigenaar (${B.zonder.length}): wie pakt het op?${ic("chev")}</summary><div class="binnen">${B.zonder.map(rij).join("")}</div></details>` : ""}
    ${B.klopt.length ? `<details open><summary>Klopt niet helemaal (${B.klopt.length})${ic("chev")}</summary><div class="binnen">${B.klopt.map(a => `<div class="fixregel"><span><button class="link" data-act="open" data-id="${esc(a.id)}">${esc(a.titel)}</button><br><span class="stil klein">${a.status === "Wacht op review" ? "Dit wacht op een check, maar er is geen mens aan zet." : "Dit heeft geen duidelijke eigenaar of status."}</span></span>${kanSchrijven() ? knop("Zet bij mij", "doe", `data-f="zetBijMij" data-id="${esc(a.id)}"`) : ""}</div>`).join("")}</div></details>` : ""}</div>`;
  return `<div class="inhoud">${renderBalk()}${werkbalk}${banenHtml}${vakken}</div>`;
}
function renderArchief() {
  const z = S.ui.acties.zoek.trim().toLowerCase();
  const l = S.data.acties.filter(a => isAgentSlug(a.door)).filter(a => !z || zoekTekstVan(a).includes(z)).sort((a, b) => (dt(b.aangemaakt) || 0) - (dt(a.aangemaakt) || 0));
  return `<section class="kol" style="gap:8px"><p class="stil klein">Alles wat je team voor je klaarzette, ook wat al af is, met wat jij ermee deed.</p>
    ${l.length ? l.map(a => `<button class="rij" data-act="open" data-id="${esc(a.id)}"><span class="vorm">${agChip(a.door, { alleen: true })}</span><span class="ct"><b>${esc(a.titel)}</b><span class="rmeta"><span class="mono">${esc(datumKort(a.aangemaakt))}</span><span>${esc(AGENTS[a.door].naam)}</span></span></span><span class="uitkomst">${esc(uitkomstVan(a))}</span></button>`).join("") : `<p class="bordleeg">${S.ui.acties.zoek ? "Niets gevonden." : "Je team zette nog niets voor je klaar."}</p>`}</section>`;
}

/* ---------- Team ---------- */
function teamSeg() {
  const p = parts(); const k = p[1] === "vaste-taken" || p[1] === "klaar" ? "vast" : p[1] === "resultaat" ? "res" : "wat";
  return `<div class="seg" role="group" aria-label="Team"><button data-act="go" data-r="/team" aria-pressed="${k === "wat"}">Wat ze deden</button><button data-act="go" data-r="/team/vaste-taken" aria-pressed="${k === "vast"}">Vaste taken</button><button data-act="go" data-r="/team/resultaat" aria-pressed="${k === "res"}">Resultaat</button></div>`;
}
function dagLabel(d) { if (zelfdeDag(d, NU)) return d.getHours() < 6 ? "Vannacht" : "Vandaag"; if (zelfdeDag(d, plusDagen(NU, -1))) return "Gisteren"; return DAGEN_LANG[d.getDay()] + " " + d.getDate() + " " + MAANDEN[d.getMonth()]; }
function agKnop(s) { return `<button class="ag agknop" data-act="go" data-r="/team/agent/${esc(s)}"><span class="em" aria-hidden="true">${esc(AGENTS[s].em)}</span>${esc(AGENTS[s].naam)}</button>`; }
const VRAAG_VOOR = {
  "de-stem": "Help me een scherpe openingszin voor mijn volgende LinkedIn-post.", "content-strateeg": "Maak een LinkedIn-post over ons laatste project.",
  researcher: "Zoek vijf organisaties die bij ons passen.", dealmaker: "Bereid mijn volgende klantgesprek voor.", "pipeline-manager": "Welke deals staan stil?",
  "outreach-specialist": "Schrijf een follow-up na mijn laatste gesprek.", administratie: "Welke facturen staan open?", informatiemanager: "Werk mijn klantdossiers bij.",
  orchestrator: "Start mijn dag.", "management-assistent": "Wat moet ik vandaag doen?", "quality-control": "Kijk deze tekst na op feiten en toon.",
  controller: "Hoe staat mijn cashflow ervoor?", jurist: "Kijk dit contract na op risico's.", marktmaker: "Waar moet ik zichtbaar zijn om leads te winnen?",
  "customer-success-manager": "Welke klant heeft aandacht nodig?", "seo-geo-specialist": "Waarop word ik nu gevonden?",
};
/* Wie zit er in je team? Wat we in je werk zien, plus wat bij je modules hoort
 * (als het dashboard je modules kent). Nooit specialisten buiten je licentie. */
function teamLeden() {
  const gezien = new Set(beschikbareSpecialisten(CTX).map(x => x.slug));
  for (const f of S.data.feed) if (f.ag) gezien.add(f.ag);
  const mods = typeof actieveModuleKeys === "function" ? actieveModuleKeys() : null;
  if (mods) for (const a of CTX.schema.agents || []) if (mods.includes(a.module) || a.module === "core") gezien.add(a.slug);
  gezien.delete("gids");
  return [...gezien].filter(isAgentSlug);
}
function renderTeam() {
  const p = parts();
  const kop = `<div class="tussen"><h2 class="titel">Je team</h2>${teamSeg()}</div>`;
  if (p[1] === "agent") return AGENTS[p[2]] ? renderAgent(p[2]) : `<div class="inhoud">${kop}<p class="stil">Deze specialist zit niet in je team.</p></div>`;
  if (p[1] === "vaste-taken") return `<div class="inhoud">${renderBalk()}${kop}${renderVasteTaken()}</div>`;
  if (p[1] === "klaar") return `<div class="inhoud">${renderBalk()}${kop}${renderKlaar()}</div>`;
  if (p[1] === "resultaat") return `<div class="inhoud">${renderBalk()}${kop}${renderResultaat()}</div>`;
  const f = S.ui.team.filter; const feed = S.data.feed.filter(x => !f || x.ag === f);
  const agentsInFeed = [...new Set(S.data.feed.map(x => x.ag).filter(Boolean))];
  let dag = null; let lijst = "";
  feed.forEach(x => {
    const l = dagLabel(x.t); if (l !== dag) { dag = l; lijst += `<div class="dagkop">${esc(l)}</div>`; }
    lijst += `<div class="post"><span class="t">${hhmm(x.t)}</span><div class="pb"><div class="rijtje">${x.ag ? agKnop(x.ag) : `<span class="ag"><span class="em" aria-hidden="true">${esc(x.em || "")}</span>${esc(x.naam || "")}</span>`}</div><p>${esc(x.tekst)}</p>${x.link ? `<a class="link" href="${esc(x.link)}" target="_blank" rel="noopener noreferrer">Bekijk ${ic("pijl-op", "klein")}</a>` : ""}</div></div>`;
  });
  const leden = teamLeden();
  const gebruikt = new Set([...S.data.feed.map(x => x.ag), ...S.data.acties.map(werkAgent), ...S.data.taken.filter(t => t.actief).map(t => t.agent)].filter(Boolean));
  const ongebruikt = (typeof actieveModuleKeys === "function" && actieveModuleKeys()) ? leden.filter(k => !gebruikt.has(k) && k !== "quality-control") : [];
  const geenFeed = !(CTX.bundle && CTX.bundle.teamfeed);
  const leeg = f ? `<p class="stil">Geen berichten van ${esc(deNaam(f))} in de afgelopen 30 dagen.</p>`
    : geenFeed ? `<p class="stil">Je werkruimte houdt nog geen teamfeed bij. Wat je team doet, zie je bij Voor jou en Acties.</p>`
      : `<p class="stil">Je team heeft nog niets gedaan. Vraag in Claude iets aan een specialist, of zet je vaste taken aan.</p><div class="rijtje" style="margin-top:8px"><button class="knop" data-act="go" data-r="/team/klaar">Zet je team aan het werk</button></div>`;
  return `<div class="inhoud">${renderBalk()}${kop}
    ${agentsInFeed.length > 1 ? `<div class="chiprij" role="group" aria-label="Filter"><button class="keuze" data-act="tf" data-v="" aria-pressed="${!f}">Iedereen</button>${agentsInFeed.map(s => `<button class="keuze" data-act="tf" data-v="${esc(s)}" aria-pressed="${f === s}"><span aria-hidden="true">${esc(AGENTS[s].em)}</span> ${esc(AGENTS[s].kort)}</button>`).join("")}</div>` : ""}
    <section class="vak">${lijst || leeg}</section>
    ${leden.length ? `<section class="vak" style="display:flex;flex-direction:column;gap:10px"><h2 class="vakkop">Je hele team</h2>
      <div class="chiprij">${leden.map(agKnop).join("")}</div>
      ${ongebruikt.length ? `<h3 class="vakkop" style="margin-top:6px">Nog niet ingezet</h3>${ongebruikt.slice(0, 4).map(s => `<div class="kol" style="gap:6px"><p><b>${esc(AGENTS[s].naam)}</b> · <span class="stil">${esc(AGENTS[s].rol)}</span></p><div class="kopieerblok"><code>${esc(VRAAG_VOOR[s] || "Wat kun jij voor mij doen?")}</code><button class="knop" data-act="kopieer-tekst" data-t="${esc(VRAAG_VOOR[s] || "Wat kun jij voor mij doen?")}">${ic("kopieer", "klein")}Kopieer</button></div><p class="klein stil">Plak dit in Claude; ${esc(deNaam(s))} pakt het op.</p></div>`).join("")}` : ""}</section>` : ""}</div>`;
}
function inzetDezeWeek(slug) {
  const a = CTX.bundle && CTX.bundle.activaties;
  if (!a || !Array.isArray(a.weken)) return null;
  const week = a.weken.find(w => w.week_start === isoDag(maandag()));
  return week ? Number((week.per_agent || {})[slug] || 0) : 0;
}
function renderAgent(slug) {
  const g = AGENTS[slug]; const notion = toegang() === "notion";
  const ma = maandag();
  const wacht = notion ? [] : aanJouZet().filter(a => werkAgent(a) === slug); const onder = notion ? [] : bijTeam().filter(a => werkAgent(a) === slug);
  const gedaan = S.data.acties.filter(a => werkAgent(a) === slug && (dt(a.afgerondOp) || dt(a.aangemaakt) || 0) >= ma && (a.status === "Klaar" || hoortBijMens(a))).length;
  const taken = S.data.taken.filter(t => t.agent === slug); const feed = S.data.feed.filter(x => x.ag === slug);
  const inzet = inzetDezeWeek(slug);
  return `<div class="inhoud">${renderBalk()}<button class="link" data-act="go" data-r="/team">${ic("links", "klein")} Team</button>
    <section class="vak" style="display:flex;flex-direction:column;gap:12px"><div class="agentkop"><span class="groot-em" aria-hidden="true">${esc(g.em)}</span><div><h2 class="titel">${esc(g.naam)}</h2><p class="stil klein">AI-specialist${g.module ? " · module " + esc(g.module) : ""}</p></div></div>
      <p>${esc(g.rol)}</p>
      <div class="rijtje">${kanSchrijven() ? `<button class="knop teamvol" data-act="sheet" data-type="opdracht" data-ag="${esc(slug)}">${ic("plus", "klein")}Geef een opdracht</button>` : ""}<button class="knop" data-act="kopieer-tekst" data-t="Laat ${esc(deNaam(slug))} mij helpen met ...">${ic("kopieer", "klein")}Kopieer een vraag voor Claude</button></div>
      <div class="tellers">${notion ? "" : `<div class="teller"><b>${gedaan}</b><span>deze week gedaan</span></div><div class="teller"><b>${wacht.length}</b><span>wacht op jou</span></div>`}${inzet !== null ? `<div class="teller"><b>${inzet}×</b><span>deze week ingezet vanuit Claude</span></div>` : ""}</div></section>
    ${wacht.length ? `<section class="kol" style="gap:8px"><h2 class="vakkop">Wacht op jou (${wacht.length})</h2>${wacht.map(rij).join("")}</section>` : ""}
    ${onder.length ? `<section class="kol" style="gap:8px"><h2 class="vakkop">Onder handen (${onder.length})</h2>${onder.map(rij).join("")}</section>` : ""}
    ${taken.length ? `<section class="vak"><h2 class="vakkop">Vaste taken</h2>${taken.map(taakRij).join("")}</section>` : ""}
    ${feed.length ? `<section class="vak"><h2 class="vakkop">Wat ${esc(deNaam(slug))} deed</h2>${feed.map(x => `<div class="post"><span class="t">${hhmm(x.t)}</span><div class="pb"><p>${esc(x.tekst)}</p><span class="klein stil">${esc(dagLabel(x.t))}</span></div></div>`).join("")}</section>` : ""}</div>`;
}

/* ---------- Vaste taken ---------- */
function ritmeSelect(t, dis) {
  const keuzes = ritmes();
  const opties = keuzes.map(k => `<option value="${esc(k.waarde)}" ${t.ritme === k.waarde ? "selected" : ""} ${k.kan ? "" : "disabled"}>${esc(k.label)}${k.kan ? "" : " (kan nog niet)"}</option>`).join("")
    + (t.ritme && !keuzes.some(k => k.waarde === t.ritme) ? `<option value="${esc(t.ritme)}" selected>${esc(t.ritme)}</option>` : "");
  return `<select id="ritme-${esc(t.id)}" data-change="ritme" data-id="${esc(t.id)}" aria-label="Ritme van ${esc(t.naam)}" ${dis ? "disabled" : ""}>${opties}</select>`;
}
function watDoetTaak(t) {
  const cat = (vtCatalogus.data || []).find(x => x && (x.sleutel === t.template || x.klantnaam === t.naam));
  if (cat && cat.beschrijving) return cat.beschrijving;
  const i = t.instructie.replace(/\s+/g, " ").trim();
  return i.length > 320 ? i.slice(0, 317) + "…" : i;
}
function taakRij(t) {
  const st = taakStatus(t); const mag = magSchrijven("ritmetaken") && !t.url;
  const stTekst = st.k === "achter" ? `<span class="achter">~ ${esc(st.tekst)}</span>` : st.k === "ok" ? `<span class="okt">✓ ${esc(st.tekst)}</span>` : `<span>${esc(st.tekst)}</span>`;
  const wat = watDoetTaak(t);
  return `<div class="taak ${t.actief ? "" : "uit"}"><button class="schakel" role="switch" aria-checked="${t.actief}" aria-label="${esc(t.naam)}" data-act="taak-aan" data-id="${esc(t.id)}" ${mag ? "" : "disabled"}></button>
    <div class="kol" style="gap:5px"><span class="tnaam">${esc(t.naam)}</span><div class="tregel">${t.agent ? agChip(t.agent, { kort: true }) : ""}${ritmeSelect(t, !mag || !t.actief)}${["elk-uur", "elke-2-uur", "elke-4-uur"].includes(t.ritme) ? '<span class="klein">zo vaak als je team werkt</span>' : ""}</div>
      <div class="tregel">${stTekst}${t.url ? `<a class="link" style="font-size:13px" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Open in Notion ${ic("pijl-op", "klein")}</a>` : ""}</div>
      ${wat ? `<details class="uitklap kaal" ${det("taak-" + t.id)}><summary>Wat doet deze taak?${ic("chev", "klein")}</summary><div class="binnen"><p>${esc(wat)}</p><p class="klein stil">Wil je dat deze taak iets anders doet? Vraag het de Coördinator in Claude.</p></div></details>` : ""}</div></div>`;
}
function kopieerBlok(t) { return `<div class="kopieerblok"><code>${esc(t)}</code><button class="knop" data-act="kopieer-tekst" data-t="${esc(t)}">${ic("kopieer", "klein")}Kopieer</button></div>`; }
function dagenLijst(l) { return lijstZin(l.map(x => x.lang)); }
function renderVasteTaken() {
  const kc = klaarCheck(); const cs = checkSamenvatting(kc);
  const checkRegel = `<button class="regel" data-act="go" data-r="/team/klaar"><span class="rl"><b>${esc(cs.kop)}</b><span>${esc(cs.sub)}</span></span>${ic("chev")}</button>`;
  const T = S.data.taken;
  const bron = bronVan(CTX, "ritmetaken");
  const elders = bron.toestand === "elders" || (toegang() === "notion" && !dataRijenVan(CTX, "ritmetaken"));
  if (elders && !T.length) return `${checkRegel}<section class="vak" style="display:flex;flex-direction:column;gap:10px"><h3>Je vaste taken staan in ${esc(bron.naam || "Notion")}</h3><p class="stil">Aanpassen doe je daar, of vraag het je team in Claude. Het weekoverzicht verschijnt hier zodra je dagstart het meestuurt.</p>${kopieerBlok("Laat mijn ritmetaken zien en zet de facturentaak op woensdag.")}</section>`;
  const slot = toegang() === "daglink" ? `<div class="slotregel">${ic("slot", "klein")}<span>Aanpassen kan na inloggen.</span>${kanInloggen() ? `<button class="knop klein-knop" data-act="login">Inloggen</button>` : ""}</div>` : "";
  if (!T.length) return `${checkRegel}<section class="leeg"><h3>Je team heeft nog geen vaste taken</h3>${slot}<p class="stil">Een vaste taak is werk dat je team steeds opnieuw voor je doet, zonder dat je het hoeft te vragen.</p>
    <p class="stil">Je zet ze in Claude aan:</p><div style="width:100%">${kopieerBlok("Zet mijn ritmetaken aan.")}</div><button class="knop" data-act="go" data-r="/team/klaar">Bekijk het stappenblad</button></section>${renderCatalogus()}`;
  const w = weekTelling();
  const donderdagKan = ritmes().some(k => k.waarde === "wekelijks-do" && k.kan);
  const week = `<div class="week">${w.dagen.map(x => `<div class="wdag ${w.drukste.includes(x) ? "druk" : ""}"><span class="dn">${x.d}</span><span class="aantal">${x.taken.length}</span>
    <div class="wnamen">${x.taken.map(t => `<span>${t.agent ? esc(AGENTS[t.agent].em) + " " : ""}${esc(t.naam)}</span>`).join("")}</div><span class="ems" aria-hidden="true">${x.taken.map(t => t.agent ? esc(AGENTS[t.agent].em) : "•").join("")}</span>
    ${x.d === "do" && !donderdagKan ? '<span class="donote">geen wekelijkse</span>' : ""}</div>`).join("")}</div>`;
  const opVolgorde = (a, b) => (Number(getField(a.rij, "Volgorde")) || 0) - (Number(getField(b.rij, "Volgorde")) || 0);
  const aan = T.filter(t => t.actief).sort(opVolgorde), uit = T.filter(t => !t.actief).sort(opVolgorde);
  const n = w.max;
  return `${checkRegel}
    <section class="vak" style="display:flex;flex-direction:column;gap:10px"><div class="tussen"><h2 class="vakkop">Wanneer werkt je team · werkdagen</h2>${hoe("vaste-taken")}</div>${week}
      <p class="klein">Per maand komen er ongeveer <b class="mono">${w.perMaand}</b> vaste taken aan de beurt${w.vaak.length ? `, plus ${telwoord(w.vaak.length, "taak", "taken")} die zo vaak ${w.vaak.length === 1 ? "draait" : "draaien"} als je team werkt` : ""}. <span class="stil">Met één werkmoment per nacht doet je team er hooguit ${w.werkdagen} per maand.${donderdagKan ? "" : " Een wekelijkse taak kan nog niet op donderdag."}</span></p>
      ${w.drukste.length ? `<div class="contextregel"><b>Op ${dagenLijst(w.drukste)} staan ${n} vaste taken.</b> Je team doet er één per werkmoment. Werkt je team één keer per nacht, dan schuiven er ${n - 1} door.
        <details class="uitklap kaal" style="margin-top:4px" ${det("druk-uitleg")}><summary>Wat kan ik doen?${ic("chev", "klein")}</summary><div class="binnen"><ul style="margin:0;padding-left:18px"><li>Laat je team vaker werken, bijvoorbeeld elke 4 uur. <button class="hoe" data-act="naar-stappen" data-doel="vaker">Zo doe je dat</button></li><li>Zet een taak op een rustiger dag.</li><li>Zet een taak tijdelijk uit.</li></ul></div></details></div>` : ""}</section>
    <section class="vak"><div class="tussen"><h2 class="vakkop">Je vaste taken · ${aan.length} aan</h2></div>${slot}${elders ? `<p class="klein stil">Stand van je dagstart. Aanpassen doe je in ${esc(bron.naam || "Notion")}, of zeg het je team in Claude.</p>` : `<p class="klein stil">Je team doet per werkmoment één vaste taak; staan er meer klaar, dan eerst de bovenste.</p>`}${aan.length ? aan.map(taakRij).join("") : "<p>Er staat nu geen enkele vaste taak aan.</p>"}
      ${uit.length ? `<details class="uitklap" ${det("taken-uit")}><summary>Uitgezet (${uit.length})${ic("chev")}</summary><div class="binnen">${uit.map(taakRij).join("")}</div></details>` : ""}</section>
    <section class="vak" style="display:flex;flex-direction:column;gap:8px"><h2 class="vakkop">Meer vast werk?</h2><p class="klein">Zeg het tegen je team in Claude. Bijvoorbeeld:</p>
      ${kopieerBlok("Zet elke vrijdag een weekreflectie op.")}</section>${renderCatalogus()}`;
}
/* f55: de vaste taken die bij je modules horen en nog niet aanstaan, met "Zet aan". */
function renderCatalogus() {
  if (toegang() === "notion" || !CTX.bron || !CTX.bron.instantieUrl) return "";
  if (!vtCatalogus.data && vtCatalogus.sleutel !== CTX.bron.instantieUrl) {
    laadCatalogus(CTX).then(t => { if (t && t.length) render(); });
    return "";
  }
  const templates = vtCatalogus.data || [];
  const open = templates.filter(t => t && t.sleutel && !t.actief);
  if (!templates.length) return "";
  const kan = magSchrijven("ritmetaken");
  return `<section class="vak" style="display:flex;flex-direction:column;gap:8px"><h2 class="vakkop">Beschikbaar voor jouw team</h2>
    ${open.length ? `<p class="klein stil">Vaste taken die bij jouw modules horen en nog niet aanstaan.${kan ? " Aanzetten kan hier; je team pakt ze op bij het volgende werkmoment." : " Aanzetten kan na inloggen."}</p>
    <div class="lijstje">${open.map(t => { const s = t.specialist && slugVanNaam(t.specialist.naam || t.specialist.slug);
      return `<div><span class="kol" style="gap:2px;flex:1 1 220px"><b>${s ? `<span aria-hidden="true">${esc(AGENTS[s].em)}</span> ` : ""}${esc(t.klantnaam || t.sleutel)}</b>${t.beschrijving ? `<span class="klein stil">${esc(t.beschrijving)}</span>` : ""}${t.ritme_advies ? `<span class="klein stil">${esc(ritmeLabel(t.ritme_advies, CTX.schema))}</span>` : ""}</span>${kan ? `<button class="knop klein-knop" data-act="zet-aan" data-k="${esc(t.sleutel)}">${t.bestaat ? "Zet weer aan" : "Zet aan"}</button>` : ""}</div>`; }).join("")}</div>`
      : `<p class="klein stil">Alle vaste taken die bij jouw modules horen, staan aan.</p>`}</section>`;
}
function renderKlaarRegels(kc) {
  return `<div class="check">${kc.regels.map(r => {
    const act = r.actie ? (r.actie[1] === "login" ? 'data-act="login"' : r.actie[1] === "ronde" ? 'data-act="ronde-start"' : `data-act="naar-stappen" data-doel="${r.actie[1] === "vaker" ? "vaker" : "start"}"`) : "";
    const toon = r.actie && !(r.actie[1] === "login" && !kanInloggen());
    return `<div class="cregel"><span class="cvorm ${r.k}" aria-label="${{ ok: "in orde", let: "let op", nee: "niet in orde", onbekend: "onbekend" }[r.k]}">${{ ok: "✓", let: "~", nee: "✗", onbekend: "?" }[r.k]}</span><div class="kol" style="gap:3px"><b>${esc(r.titel)}</b><p>${esc(r.tekst)}</p>${toon ? `<button class="link" ${act}>${esc(r.actie[0])} ${ic("chev", "klein")}</button>` : ""}</div></div>`;
  }).join("")}</div>`;
}
function werkmomentNaam() { return "Werkmoment " + (bedrijf() || "je bedrijf"); }
function opdrachtBlok() {
  return `<div class="kopieerblok"><button class="knop" data-act="kopieer-tekst" data-t="${esc(WERKMOMENT_OPDRACHT)}">${ic("kopieer", "klein")}Kopieer de opdracht</button></div>
  <details class="uitklap kaal" ${det("opdracht-tekst")}><summary>Toon de tekst (hoef je niet te lezen)${ic("chev", "klein")}</summary><div class="binnen"><code class="mono klein" style="overflow-wrap:anywhere">${esc(WERKMOMENT_OPDRACHT)}</code></div></details>`;
}
function stappenblad() {
  const w = weekTelling(); const T = S.data.taken; const notion = toegang() === "notion";
  const kc = klaarCheck();
  const vaker = (S.ui.stappenDoel === "vaker" || kc.regels.some(r => r.actie && r.actie[1] === "vaker")) && T.length && !kc.stil;
  const velden = `<dl class="velden2"><dt>Naam</dt><dd><div class="kopieerblok"><code>${esc(werkmomentNaam())}</code><button class="knop icoonknop" data-act="kopieer-tekst" data-t="${esc(werkmomentNaam())}" aria-label="Kopieer de naam">${ic("kopieer", "klein")}</button></div></dd>
      <dt>Wanneer</dt><dd>elke dag, buiten werktijd (bijvoorbeeld 02:00)</dd><dt>Opdracht</dt><dd>${opdrachtBlok()}</dd></dl>
      <span class="klein stil">Zet de Agentic Team-connector aan, en die van je werkdata als die ergens anders staat.</span>`;
  const klaarStap = `<li><div><b>Klaar.</b><span>Na de eerste nacht staat bij Voor jou wat je team deed.${notion ? "" : " Deze check wordt dan vanzelf groen."}</span></div></li>`;
  const takenAan = T.some(t => t.actief);
  const installatie = takenAan && !notion
    ? `<ol class="stappen"><li><div><b>Open in Claude: Scheduled</b><span class="klein">Staat daar al een taak met get_werkronde in de opdracht? Kijk of hij aanstaat. Zo niet, kies <b>New task</b> en vul in:</span>${velden}</div></li>${klaarStap}</ol>`
    : `<ol class="stappen"><li><div><b>Zeg in Claude tegen je team:</b>${kopieerBlok("Zet mijn ritmetaken aan.")}<span class="klein stil">Je team zet dan de vaste taken klaar die bij jouw modules horen.</span></div></li>
    <li><div><b>Je team stelt een geplande taak voor. Druk op Schedule.</b><span class="klein">Zie je die knop niet? Ga in Claude naar <b>Scheduled › New task</b> en vul in:</span>${velden}</div></li>${klaarStap}</ol>`;
  const advies = `<p class="contextregel"><b>Hoe vaak?</b> Elke nacht is genoeg om mee te beginnen. Je team doet per werkmoment één vaste taak. Staan er op één dag meer vaste taken dan je team werkmomenten heeft, kies dan elke 4 uur${w.max >= 2 && !notion ? ` (bij jou staan er op ${dagenLijst(w.drukste)} ${w.max})` : ""}.</p>`;
  if (vaker) return `<section class="vak" id="stappenblad" style="display:flex;flex-direction:column;gap:12px"><h2 class="vakkop">Laat je team vaker werken</h2>
    <p>Je werkmoment bestaat al. Zet het vaker aan, dan komen al je vaste taken aan de beurt.</p>
    <ol class="stappen"><li><div><b>Open in Claude: Scheduled</b><span class="klein stil">Zoek je werkmoment: de taak met get_werkronde in de opdracht${bedrijf() ? `, bijvoorbeeld ‘${esc(werkmomentNaam())}’` : ""}.</span></div></li>
    <li><div><b>Zet ‘Wanneer’ op elke 4 uur</b><span class="klein stil">Je team doet dan tot zes vaste taken per dag in plaats van één. Een werkmoment zonder werk stopt meteen en kost vrijwel niets.</span></div></li>
    <li><div><b>Klaar.</b><span>Morgen zie je hier dat alle taken aan de beurt kwamen.</span></div></li></ol>
    <details class="uitklap" ${det("nog-geen-werkmoment")}><summary>Nog geen werkmoment?${ic("chev")}</summary><div class="binnen">${installatie}</div></details></section>`;
  return `<section class="vak" id="stappenblad" style="display:flex;flex-direction:column;gap:12px"><h2 class="vakkop">${takenAan && !notion ? "Zet je werkmoment (weer) aan" : "Laat je team vanzelf werken"}</h2><p>${takenAan && !notion ? "Je vaste taken staan klaar. Wat ontbreekt, is het moment waarop je team ze oppakt." : "Je team werkt op de momenten die jij in Claude plant: je werkmoment. Dat regel je één keer."}</p>
    ${installatie}${advies}
    <p class="klein stil">Let op: de geplande taak staat in jouw Claude-account. Koppel je opnieuw of stop je, controleer dan of hij nog aanstaat. Eén werkmoment voor het hele bedrijf is genoeg: heeft een collega er al een, dan hoeft het niet nog een keer.</p></section>`;
}
function renderKlaar() {
  const kc = klaarCheck(); const cs = checkSamenvatting(kc);
  return `<button class="link" data-act="go" data-r="__terug">${ic("links", "klein")} Terug</button>
    <section class="vak"><div class="tussen"><h2 class="titel" tabindex="-1">${esc(cs.kop.replace(/ · .*/, ""))}</h2>${hoe("vanzelf-werken")}</div>${renderKlaarRegels(kc)}</section>${stappenblad()}`;
}

/* ---------- Resultaat ----------
 * Afgerond per week, naar wie het deed: helemaal door je team (Afgerond door
 * een specialist), door jou met voorwerk van je team (een specialist zette het
 * klaar of werkte eraan), door jou alleen. "Niet doen" telt niet mee (i25). */
function resultaatWeken(n) {
  const ma = maandag(); const weken = [];
  for (let i = n - 1; i >= 0; i--) {
    const van = plusDagen(ma, -7 * i); const tot = plusDagen(van, 7);
    const af = S.data.acties.filter(a => a.status === "Klaar" && !/^niet doen/i.test(a.correctie) && dt(a.afgerondOp) && dt(a.afgerondOp) >= van && dt(a.afgerondOp) < tot);
    const team = af.filter(a => isAgentSlug(a.afgerondDoor)).length;
    const voor = af.filter(a => !isAgentSlug(a.afgerondDoor) && (isAgentSlug(a.door) || isAgentSlug(a.agent))).length;
    weken.push({ label: "wk " + isoWeek(van), van, team, voor, zelf: af.length - team - voor });
  }
  return weken;
}
function isoWeek(d) { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dag = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - dag); const j = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - j) / 86400000 + 1) / 7); }
function renderResultaat() {
  if (toegang() === "notion") return `<section class="leeg"><h3>Je resultaat staat in Notion</h3><p class="stil">Wat je team afrondde, telt je dagstart in Notion. Hier zie je het zodra je acties in je werkruimte staan.</p></section>`;
  const W = resultaatWeken(4); const tot = W.reduce((s, w) => s + w.team + w.voor + w.zelf, 0);
  if (!tot) return `<section class="leeg"><h3>Nog geen resultaat</h3><p class="stil">Zodra je team vanzelf werkt, zie je hier wat het voor je deed: helemaal zelf, met voorwerk voor jou, en wat je zelf deed.</p><button class="knop" data-act="go" data-r="/team/klaar">Is je team klaar?</button></section>`;
  const som = (k) => W.reduce((s, w) => s + w[k], 0);
  const piek = Math.max(...W.map(w => w.team + w.voor + w.zelf));
  const stap = Math.max(1, Math.ceil(piek / 4)); const max = stap * 4;
  const h = 150, x0 = 34, bw = 46, gap = 34, top = 14;
  const y = v => top + h - v / max * h;
  let svg = `<svg class="grafiek" viewBox="0 0 ${x0 + W.length * (bw + gap)} ${top + h + 26}" role="img" aria-label="Afgerond per week, opgesplitst naar wie het deed">`;
  [0, 1, 2, 3, 4].map(i => i * stap).forEach(v => { svg += `<line class="rast" x1="${x0}" x2="${x0 + W.length * (bw + gap) - gap + 6}" y1="${y(v)}" y2="${y(v)}"/><text x="${x0 - 8}" y="${y(v) + 3}" text-anchor="end">${v}</text>`; });
  W.forEach((w, i) => {
    const x = x0 + 10 + i * (bw + gap); let acc = 0;
    [["s-team", w.team], ["s-voor", w.voor], ["s-zelf", w.zelf]].forEach(([c, v]) => { if (v) svg += `<rect class="${c}" x="${x}" y="${y(acc + v)}" width="${bw}" height="${v / max * h}" rx="2"/>`; acc += v; });
    svg += `<text class="tot" x="${x + bw / 2}" y="${y(acc) - 5}" text-anchor="middle">${acc}</text><text x="${x + bw / 2}" y="${top + h + 16}" text-anchor="middle">${w.label}</text>`;
  });
  svg += "</svg>";
  const min = CTX.minutenPerActie || 25; const uren = Math.round((som("team") + som("voor")) * min / 60);
  const gebruik = (CTX.agentUsage && CTX.agentUsage.status === "ok" && Array.isArray(CTX.agentUsage.ranking) ? CTX.agentUsage.ranking : []).filter(x => x && x.slug && AGENTS[x.slug] && x.value > 0).slice(0, 5);
  const cv = CTX.intern && CTX.correctievrij;
  return `<section class="vak" style="display:flex;flex-direction:column;gap:12px"><h2 class="vakkop">De afgelopen 4 weken · ${telwoord(tot, "ding", "dingen")} afgerond</h2>
    <div class="cijfers"><div class="teller"><b>${som("team")}</b><span>helemaal door je team</span></div><div class="teller"><b>${som("voor")}</b><span>door jou, met voorwerk van je team</span></div><div class="teller"><b>${som("zelf")}</b><span>door jou alleen</span></div></div>
    <div class="grafiekrij">${svg}<div class="legenda2"><span><i class="l-team"></i>helemaal door je team (zelf afgerond)</span><span><i class="l-voor"></i>jij, met voorwerk van je team</span><span><i class="l-zelf"></i>jij alleen</span></div></div>
    <p class="klein stil">Rekenhulp: met ± <label class="sr" for="minuten">Minuten per stuk</label><select id="minuten" data-change="minuten" class="mono" style="min-height:32px;border:1px solid var(--veldrand);border-radius:6px;background:var(--surface)">${[10, 15, 25, 45, 60].concat([10, 15, 25, 45, 60].includes(min) ? [] : [min]).map(m => `<option value="${m}" ${m === min ? "selected" : ""}>${m}</option>`).join("")}</select> minuten per stuk scheelde je team je ongeveer <b>${telwoord(uren, "uur", "uur")}</b>.</p></section>
    ${cv && cv.aanwezig && typeof cv.pct === "number" ? `<section class="vak" style="display:flex;flex-direction:column;gap:8px"><h2 class="vakkop">Klopte het werk? · alleen intern</h2><p>Van de ${telwoord(cv.autonoom, "actie", "acties")} die je team de afgelopen ${cv.vensterDagen} dagen zelf afrondde, bleef ${Math.round(cv.pct)}% zonder correctie staan.</p></section>` : ""}
    ${gebruik.length ? `<section class="vak" style="display:flex;flex-direction:column;gap:6px"><h2 class="vakkop">Het meest ingezet · afgelopen ${telwoord(CTX.periodWeeks || 12, "week", "weken")}</h2>
      ${gebruik.map(x => `<div class="tussen">${agKnop(x.slug)}<span class="mono">${x.value}×</span></div>`).join("")}</section>` : ""}`;
}

/* ---------- Beheer: modules en wie er meewerkt (bestaande panelen) ---------- */
function renderBeheer() {
  return `<div class="inhoud"><button class="link" data-act="go" data-r="__terug">${ic("links", "klein")} Terug</button><h2 class="titel">Beheer</h2>
    <section class="vak beheer" id="beheer-modules"><h3>Je modules</h3><div id="beheer-modules-body"></div></section>
    <section class="vak beheer" id="panel-team-namen"><h3>Wie werkt er mee</h3><div id="panel-team-namen-body"></div></section></div>`;
}
function vulBeheer() {
  const m = document.getElementById("beheer-modules-body");
  if (m) { if (moduleOverzichtBeschikbaar()) renderDetailModules(m); else m.innerHTML = `<p class="stil">Je moduleoverzicht ziet alleen de beheerder van je licentie.</p>`; }
  const t = document.getElementById("panel-team-namen");
  if (t) { renderTeamPanel(t); t.style.display = ""; if (!t.querySelector("#panel-team-namen-body").innerHTML.trim()) t.querySelector("#panel-team-namen-body").innerHTML = `<p class="stil">Wie er meewerkt, ziet alleen de beheerder van je licentie.</p>`; }
}
