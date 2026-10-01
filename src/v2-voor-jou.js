/* Dashboard v2 — de kop, Voor jou, het item-blad en één voor één.
 * Opbouw en teksten volgen het klikbare ontwerp; de data is echt. */

function agChip(slug, opt) {
  const a = AGENTS[slug]; if (!a) return ""; opt = opt || {};
  const naam = opt.kort ? a.kort : a.naam;
  return `<span class="ag ${opt.bezig ? "bezig" : ""} ${opt.alleen ? "alleen" : ""}" title="${esc(a.naam)}"><span class="em" aria-hidden="true">${esc(a.em)}</span>${opt.alleen ? `<span class="sr">${esc(a.naam)}</span>` : esc(naam)}</span>`;
}
function mensChip(n) { return `<span class="mens"><span class="em" aria-hidden="true">${esc(mensKort(n))}</span>${esc(voornaam(n))}</span>`; }
function wieChip(naam) { const s = slugVanNaam(naam); return s ? agChip(s, { kort: true }) : (naam ? mensChip(naam) : ""); }
function hoe(sec, t) { return `<button class="hoe" data-act="go" data-r="/hulp/${sec}">${ic("vraag", "klein")}${esc(t || "Hoe werkt dit?")}</button>`; }
function knop(label, act, attrs, cls) { return `<button class="knop ${cls || ""}" data-act="${act}" ${attrs || ""}>${label}</button>`; }
function parts() { return S.route.split("/").filter(Boolean); }
function tabVan() { const p = parts(); if (!p.length || p[0] === "voor-jou") return "voorjou"; return p[0]; }
function isDesk() { try { return !!(window.matchMedia && window.matchMedia("(min-width: 900px)").matches); } catch (e) { return false; } }
function verstuurLabel(a) { return a.kanaal === "post" ? "Goedgekeurd, ik plaats hem zelf" : "Goedgekeurd, ik verstuur hem zelf"; }
function sindsTekst(a) {
  if (soortVan(a) === "weer") return "terug sinds " + (a.wachtenTot && !zelfdeDag(dt(a.wachtenTot), NU) ? datumKort(a.wachtenTot) : "vandaag");
  return wanneer(sindsVan(a));
}
function dagenTeLaat(a) { return Math.max(1, dagenTussen(a.deadline, NU)); }
function loginKnop(label, cls) { return kanInloggen() ? knop(esc(label || "Inloggen en afhandelen"), "login", "", cls || "prim") : ""; }

/* ---------- Kop, tabs, balken ---------- */
function aantalVoorJou() {
  if (toegang() === "notion") { const m = metricsVoorJou(CTX); return m ? m.length : 0; }
  return aanJouZet().length;
}
function tabs() {
  const n = CTX ? aantalVoorJou() : 0;
  return [["voorjou", "/", "Voor jou", "inbox", n], ["acties", "/acties", "Acties", "lijst", 0], ["team", "/team", "Team", "team", 0], ["gegevens", "/gegevens", "Gegevens", "map", 0]];
}
function renderKop() {
  const t = tabVan(); const geen = !CTX;
  const acc = ingelogd() ? `<button class="avatar" data-act="sheet" data-type="account" aria-label="Account${jij() ? " van " + esc(jij()) : ""}">${esc(jij() ? mensKort(jij()) : "?")}</button>`
    : (kanInloggen() ? `<button class="inlogknop" data-act="login">Inloggen</button>` : "");
  const stand = CTX && CTX.today ? hhmm(CTX.today) : "";
  const dtabs = !geen ? `<nav class="dtabs" aria-label="Hoofdmenu">${tabs().map(([k, r, l, , b]) => `<button class="dtab" data-act="go" data-r="${r}" ${t === k ? 'aria-current="page"' : ""}>${l}${b ? `<span class="badge" aria-label="${b} voor jou">${b}</span>` : ""}</button>`).join("")}</nav>` : "";
  return `<header class="akop">
    <div class="merk"><b>Je team</b>${geen ? "" : `<span>${esc(bedrijf() || "Je werkruimte")}${stand ? ` · <span class="mono" title="Stand van je werkruimte">${stand}</span>` : ""}</span>`}</div>${dtabs}
    <div class="kopknoppen"><button class="ikknop" data-act="go" data-r="/hulp" aria-label="Hulp" ${t === "hulp" ? 'aria-current="page"' : ""}>${ic("vraag")}</button>
    ${geen ? "" : `<button class="ikknop" data-act="ververs" aria-label="Ververs">${ic("ververs")}</button>`}${acc}</div></header>`;
}
function renderTabbalk() {
  if (!CTX) return ""; const t = tabVan();
  return `<nav class="tabbalk" aria-label="Hoofdmenu">${tabs().map(([k, r, l, i, b]) => `<button class="ttab" data-act="go" data-r="${r}" ${t === k ? 'aria-current="page"' : ""}><span class="tico">${ic(i)}</span>${l}${b ? `<span class="badge" aria-label="${b} voor jou">${b}</span>` : ""}</button>`).join("")}</nav>`;
}
function renderBalk() {
  const tg = toegang();
  if (tg === "daglink") return `<div class="balk daglink" role="status"><div><b>Je kijkt mee met je daglink:</b> alleen lezen.</div>
    ${kanInloggen() ? `<div class="rijtje"><button class="knop prim" data-act="login">Inloggen om af te handelen</button><span class="klein stil">Met je e-mailadres, Google of Microsoft. Je komt precies hier terug.</span></div>` : ""}</div>`;
  if (tg === "notion") {
    const w = (CTX && CTX.metricsWerk) || {}; const g = w.gegenereerdOp ? dt(w.gegenereerdOp) : null;
    const naam = (bronVan(CTX, "acties").naam) || "Notion";
    return `<div class="balk notion"><div><b>Je acties en vaste taken staan in ${esc(naam)}.</b> Hier zie je wat je team deed${g ? ` en wat je dagstart ${esc(wanneer(g))} samenvatte` : ""}. Afhandelen doe je in ${esc(naam)}, of vraag het je team.</div></div>`;
  }
  return "";
}

/* ---------- Voor jou ---------- */
function renderBovenkaart() {
  const kc = klaarCheck();
  if ((kc.stil || kc.stilNotion) && !S.ui.dismissed.stil) {
    const r = kc.regels.find(x => (x.id === "aan" || x.id === "werkt") && (x.k === "nee" || x.k === "let")) || { tekst: "" };
    const geenTaken = !S.data.taken.length && toegang() !== "notion";
    return `<section class="bovenkaart stil-rood" aria-label="Je team staat stil"><div class="tussen"><h3>${geenTaken ? "Je team werkt nog niet vanzelf" : "Je team staat stil"}</h3></div>
      <p>${esc(r.tekst)}</p><div class="rijtje"><button class="knop prim" data-act="go" data-r="/team/klaar">Zo regel je het in 2 minuten</button>${hoe("vanzelf-werken")}</div></section>`;
  }
  if (!S.data.acties.length && !S.data.taken.length && toegang() !== "notion" && !S.ui.dismissed.welkom) return `<section class="bovenkaart welkom"><div class="tussen"><h3>Welkom bij je team</h3><button class="ikknop" data-act="dismiss" data-k="welkom" aria-label="Sluiten">${ic("sluit")}</button></div>
    <p>Dit zijn specialisten die werk voorbereiden terwijl jij iets anders doet. Wat naar buiten gaat, komt altijd eerst bij jou.</p>
    <div class="drie"><div><b>1 · Jij vraagt</b><span>in Claude, of hier</span></div><div><b>2 · Je team werkt</b><span>op vaste momenten</span></div><div><b>3 · Jij beslist</b><span>hier, bij Voor jou</span></div></div>
    <div class="rijtje"><button class="knop" data-act="go" data-r="/hulp/in-een-minuut">Laat zien hoe het werkt</button><button class="knop" data-act="go" data-r="/team/klaar">Is je team klaar?</button></div></section>`;
  return "";
}
function renderVerhaal() {
  const v = verhaalData(); const zin = verhaalZin(v); const kc = klaarCheck();
  let body;
  if (zin) body = `<p class="zin">${zin}</p>${verhaalDetail(v) ? `<p class="detail">${verhaalDetail(v)}</p>` : ""}`;
  else if (!S.data.taken.length) body = `<p class="zin">Je team heeft nog niets vanzelf gedaan.</p><p class="detail stil">Dat begint zodra je vaste taken en een werkmoment aanstaan. Tot die tijd werkt je team alleen als je het in Claude vraagt.</p>`;
  else body = `<p class="zin">${esc(v.titel)} deed je team niets vanzelf.</p><p class="detail stil">${kc.recent ? "Het laatste wat we zagen was " + esc(wanneer(kc.recent)) + ". " : ""}Kijk bij ‘Is je team klaar?’ wat er nodig is.</p>`;
  return `<section class="vak verhaal" aria-label="${esc(v.titel)}"><div class="tussen"><h2 class="vakkop">${esc(v.titel)}</h2>${hoe("in-een-minuut")}</div>${body}
    ${v.agents.length ? `<div class="tussen"><div class="chiprij">${v.agents.slice(0, 6).map(s => agChip(s, { alleen: true })).join("")}</div><button class="link" data-act="go" data-r="/team">Wat deden ze precies? ${ic("chev", "klein")}</button></div>` : ""}</section>`;
}
function kaartKnoppen(a) {
  const s = soortVan(a);
  if (!kanSchrijven()) return (a.werk ? knop(ic("kopieer", "klein") + "Kopieer tekst", "kopieer", `data-id="${esc(a.id)}"`) : "") + loginKnop();
  const id = esc(a.id);
  switch (s) {
    case "check-extern": return knop(ic("kopieer", "klein") + "Kopieer", "kopieer", `data-id="${id}"`) + knop(esc(verstuurLabel(a)), "doe", `data-f="goedkeuren" data-id="${id}"`, "prim") + (werkAgent(a) ? knop(ic("terug", "klein") + "Terug", "sheet", `data-type="terug" data-id="${id}"`, "team") : "");
    case "check": return knop("Goedkeuren", "doe", `data-f="goedkeuren" data-id="${id}"`, "prim") + (werkAgent(a) ? knop(ic("terug", "klein") + "Terug", "sheet", `data-type="terug" data-id="${id}"`, "team") : "");
    case "voorstel": return knop("Ja, doe maar", "ja", `data-id="${id}"`, "prim") + knop("Nee, niet doen", "sheet", `data-type="nee" data-id="${id}"`);
    case "signaal": return knop("Laat je team opvolgen", "sheet", `data-type="opvolgen" data-id="${id}"`, "teamvol") + knop("Ik pak het zelf op", "sheet", `data-type="zelfop" data-id="${id}"`) + knop("Gezien, niets doen", "doe", `data-f="gezien" data-id="${id}"`, "stil");
    case "taak": case "weer": return knop(ic("vink", "klein") + "Klaar", "doe", `data-f="klaar" data-id="${id}"`, "prim") + knop("Nieuwe datum", "sheet", `data-type="${s === "weer" ? "later" : "datum"}" data-id="${id}"`) + knop("Geef aan je team", "sheet", `data-type="wie" data-doel="geef" data-id="${id}"`, "team");
    default: return "";
  }
}
function isNieuw(a) { const v = verhaalData(); const d = dt(a.aangemaakt); return isAgentSlug(a.door) && !!d && d > v.van; }
function voorproefTekst(a) { return (a.werk || "").replace(/\n\s*\n/g, "\n"); }
function itemKaart(a, gekozen) {
  const s = soortVan(a); const ag = werkAgent(a);
  const laat = isTeLaat(a) ? `<span class="pil laat">${dagenTeLaat(a)} ${dagenTeLaat(a) === 1 ? "dag" : "dgn"} te laat</span>` : "";
  const hoort = a.hoort[0] ? `<span>· ${esc(a.hoort[0].titel)}</span>` : "";
  const werk = a.werk ? `<span class="voorproef">${esc(voorproefTekst(a))}</span>` : "";
  const opm = a.opmerkingen;
  return `<article class="item ${gekozen ? "gekozen" : ""}" data-kaart="${esc(a.id)}">
    <div class="nr" aria-hidden="true">${nummer(a)}</div>
    <button class="item-open" data-act="open" data-id="${esc(a.id)}" aria-label="Nummer ${nummer(a)}: ${esc(a.titel)}, ${esc(SOORT_LABEL[s].toLowerCase())}">
      <span class="ititel">${esc(a.titel)} ${isNieuw(a) ? '<span class="pil nieuw">NIEUW</span>' : ""}${laat}</span>
      <span class="imeta"><span class="soort">${SOORT_LABEL[s]}</span>${ag ? agChip(ag, { kort: true }) : ""}<span class="mono">${esc(sindsTekst(a))}</span>${hoort}</span>
      ${werk}${opm.length ? `<span class="opmregel">${ic("plus", "klein")}${telwoord(opm.length, "opmerking", "opmerkingen")} van ${esc(voornaam(opm[opm.length - 1].van))}</span>` : ""}</button>
    <div class="iknoppen">${kaartKnoppen(a)}</div></article>`;
}
function compactItem(a, gekozen) {
  const s = soortVan(a);
  return `<button class="compact ${gekozen ? "gekozen" : ""}" data-act="open" data-id="${esc(a.id)}" data-kaart="${esc(a.id)}" ${gekozen ? 'aria-current="true"' : ""}><span class="nr">${nummer(a)}</span><span class="ct"><b>${esc(a.titel)}</b><span>${SOORT_LABEL[s]}${isTeLaat(a) ? " · te laat" : ""} · ${esc(sindsTekst(a))}</span></span>${ic("chev")}</button>`;
}
function renderWerkbak(gekozenId) {
  const l = voorJouLijst(); const n = l.length; const kc = klaarCheck();
  const opdrachtKnop = isDesk() && kanSchrijven() ? `<button class="knop teamvol" data-act="sheet" data-type="opdracht">${ic("plus", "klein")}Opdracht geven</button>` : "";
  if (!n) {
    const tekst = kc.stil ? "Je team werkt nu niet vanzelf, dus er komt ook niets nieuws bij tot dat geregeld is." : "Je team werkt verder bij het volgende werkmoment. Daarna staat hier wat het deed.";
    return `<section class="leeg" aria-label="Voor jou"><h3>Niets meer voor jou.</h3><p class="stil">${tekst}</p>
    <div class="rijtje">${kc.stil ? `<button class="knop prim" data-act="go" data-r="/team/klaar">Is je team klaar?</button>` : ""}${kanSchrijven() ? `<button class="knop teamvol" data-act="sheet" data-type="opdracht">${ic("plus", "klein")}Geef je team een opdracht</button>` : ""}${hoe("voor-jou")}</div></section>`;
  }
  const oudste = l.reduce((a, b) => sindsVan(a) < sindsVan(b) ? a : b); const dagen = dagenTussen(sindsVan(oudste), NU);
  const min = Math.max(1, Math.round(n * 0.75));
  const berg = n > 10 || P.werkdagenNa(sindsVan(oudste), NU) > 5;
  const oud = dagen <= 0 ? "van vandaag" : "oudste " + dagen + " " + (dagen === 1 ? "dag" : "dagen");
  const vol = l.slice(0, 5).map(a => itemKaart(a, a.id === gekozenId)).join("");
  const comp = l.slice(5, 10).map(a => compactItem(a, a.id === gekozenId)).join("");
  const rest = n > 10 ? `<button class="regel" data-act="acties-baan" data-baan="jij"><span class="rl"><b>Nog ${n - 10} op jouw lijst</b><span>Alles staat bij Acties, in de baan Jij</span></span>${ic("chev")}</button>` : "";
  return `<section class="werkbak-kop" aria-label="Voor jou"><div class="tussen"><h2 class="vakkop"><b>Voor jou ${n}</b> · ${oud} · ±${min} ${min === 1 ? "minuut" : "minuten"}</h2><div class="rijtje">${hoe("voor-jou")}${opdrachtKnop}</div></div>
    ${berg ? `<p class="klein" style="color:var(--rood)"><b>Het oudste werk ligt er al ${dagen} dagen.</b> Het staat nu bovenaan. Alles doorlopen kost je ongeveer ${min} minuten.</p>` : ""}
    <button class="knop breed" data-act="ronde-start">Loop ze één voor één door ${ic("pijl", "klein")}</button></section>
    <div class="stapel">${vol}${comp}${rest}</div>`;
}
function renderAfgehandeld() {
  const a = S.sessie.afgehandeld; if (!a.length) return "";
  return `<details class="afgehandeld" ${det("afgehandeld")}><summary>${ic("vink")} Vandaag afgehandeld: ${a.length}</summary><ul>${a.map((x, i) => `<li><span>${esc(x.titel)} <span class="stil klein">· ${esc(x.wat)}</span></span>${x.undo && kanSchrijven() ? `<button class="knop stil" data-act="undo-lijst" data-i="${i}">Ongedaan maken</button>` : ""}</li>`).join("")}</ul></details>`;
}
function checkRegelHtml() {
  const kc = klaarCheck(); const cs = checkSamenvatting(kc);
  return `<button class="regel" data-act="go" data-r="/team/klaar"><span class="rl"><b>${esc(cs.kop)}</b><span>${esc(cs.sub)}</span></span>${ic("chev")}</button>`;
}
function renderOnderregels() {
  const kc = klaarCheck();
  if (toegang() === "notion") return checkRegelHtml();
  const bt = bijTeam(); const bezig = bt.filter(a => a.status === "Bezig").length; const volg = bt.length - bezig;
  const col = bijCollegas();
  const perCol = {}; col.forEach(a => { const k = voornaam(a.eigenaar); perCol[k] = (perCol[k] || 0) + 1; });
  const teamRegel = kc.stil ? `<b>Bij je team: ${bt.length} ${bt.length === 1 ? "ligt" : "liggen"} stil</b><span>Tot je team weer vanzelf werkt</span>`
    : `<b>Bij je team: ${bezig} bezig · ${volg} voor het volgende werkmoment</b><span>Werk dat je team oppakt zonder dat jij iets hoeft te doen</span>`;
  return `<div class="kol" style="gap:8px">
    ${bt.length ? `<button class="regel" data-act="acties-baan" data-baan="team"><span class="rl">${teamRegel}</span>${ic("chev")}</button>` : ""}
    ${col.length ? `<button class="regel" data-act="acties-baan" data-baan="collega"><span class="rl"><b>${Object.entries(perCol).map(([k, v]) => v + " bij " + esc(k)).join(" · ")}</b><span>Op naam van een collega</span></span>${ic("chev")}</button>` : ""}
    ${checkRegelHtml()}</div>`;
}
/* De privacybelofte, woordelijk uit teksten.js (juridisch getoetst), met de
 * volledige tekst direct uitklapbaar op dezelfde plek — niet op een andere pagina. */
function privacyHtml() {
  return `<details class="privacy uitklap kaal" ${det("privacy")}><summary>${ic("slot", "klein")}<span style="flex:1">${esc(PRIVACY_REGEL)}</span>${ic("chev", "klein")}</summary><div class="binnen">${PRIVACY_UITKLAP_ALINEAS.map(a => `<p>${esc(a)}</p>`).join("")}</div></details>`;
}
function renderVoorJou() {
  if (toegang() === "notion") return renderVoorJouNotion();
  const p = parts(); let gekozen = p[0] === "voor-jou" && p[1] && p[1] !== "een-voor-een" ? p[1] : null;
  const l = voorJouLijst();
  if (isDesk() && !gekozen && l[0]) gekozen = l[0].id;
  const links = `${renderBovenkaart()}${renderVerhaal()}${renderWerkbak(gekozen)}${renderAfgehandeld()}${renderOnderregels()}${privacyHtml()}`;
  if (!isDesk()) return `<div class="inhoud">${renderBalk()}${links}</div>`;
  const a = gekozen && actie(gekozen);
  const rechts = a ? `<div class="vak paneel">${renderBlad(a, "paneel")}</div>`
    : `<div class="leeg"><h3>Alles afgehandeld</h3><p class="stil">Na het volgende werkmoment staat hier weer wat je team voor je klaarzette.</p>${S.sessie.afgehandeld.length ? `<p class="klein">Vandaag handelde je ${telwoord(S.sessie.afgehandeld.length, "ding", "dingen")} af.</p>` : ""}</div>`;
  return `<div class="inhoud">${renderBalk()}<div class="twee"><div class="kol">${links}</div><div class="kol paneel-kolom" id="paneel-kolom">${rechts}</div></div></div>`;
}
function vraagVoorTeam(it) {
  const t = it.titel || "dit item";
  if (it.soort === "check") return `Laat me ‘${t}’ zien, dan kijk ik het na.`;
  if (it.soort === "voorstel") return `Laat me het voorstel ‘${t}’ zien.`;
  if (it.soort === "signaal") return `Laat mijn team ‘${t}’ opvolgen.`;
  return `Wat moet ik doen met ‘${t}’?`;
}
function renderVoorJouNotion() {
  const v = verhaalData(); const feed = v.feed;
  const ags = [...new Set(feed.map(f => f.ag).filter(Boolean))];
  const posts = feed.filter(f => f.ag !== "quality-control" && f.ag !== "management-assistent").slice(0, 2);
  const perAgent = posts.map(f => esc(String(f.tekst).replace(/\.$/, "").slice(0, 160)) + (f.ag ? ' <span class="stil">(' + esc(AGENTS[f.ag].naam) + ")</span>" : ""));
  const items = metricsVoorJou(CTX) || [];
  const w = (CTX && CTX.metricsWerk) || {}; const g = w.gegenereerdOp ? dt(w.gegenereerdOp) : null;
  const verhaal = feed.length
    ? `<p class="zin">${esc(v.titel)} ${ags.length ? `waren <b>${telwoord(ags.length, "specialist", "specialisten")}</b> voor je aan het werk.` : "werkte je team voor je."}</p>${perAgent.length ? `<p class="detail">${perAgent.join(". ")}.</p>` : ""}
       <div class="tussen"><div class="chiprij">${ags.map(s => agChip(s, { alleen: true })).join("")}</div><button class="link" data-act="go" data-r="/team">Wat deden ze precies? ${ic("chev", "klein")}</button></div>`
    : `<p class="zin">${esc(v.titel)} deed je team niets vanzelf.</p><p class="detail stil">Kijk bij ‘Is je team klaar?’ wat er nodig is.</p>`;
  const kaart = (it) => {
    const slug = slugVanNaam(it.specialist);
    const sinds = it.sinds ? dagenTussen(it.sinds, NU) : null;
    return `<article class="item"><div class="nr" aria-hidden="true">${esc(it.nr)}</div><div class="item-open" style="cursor:default"><span class="ititel"><span class="sr">Nummer ${esc(it.nr)}: </span>${esc(it.titel)}${it.te_laat ? ' <span class="pil laat">te laat</span>' : ""}</span>
      <span class="imeta"><span class="soort">${esc(SOORT_LABEL[it.soort] || "")}</span>${slug ? agChip(slug, { kort: true }) : ""}${sinds ? `<span class="mono">${telwoord(sinds, "dag", "dagen")}</span>` : ""}${it.deadline ? `<span>voor ${esc(datumKort(it.deadline))}</span>` : ""}</span></div>
      <div class="iknoppen">${it.url ? `<a class="knop" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">Open in Notion ${ic("pijl-op", "klein")}</a>` : ""}<button class="knop" data-act="kopieer-tekst" data-t="${esc(vraagVoorTeam(it))}">${ic("kopieer", "klein")}Kopieer voor je team</button></div></article>`;
  };
  return `<div class="inhoud">${renderBalk()}${renderBovenkaart()}
    <section class="vak verhaal"><div class="tussen"><h2 class="vakkop">${esc(v.titel)}</h2>${hoe("in-een-minuut")}</div>${verhaal}</section>
    <section class="werkbak-kop"><div class="tussen"><h2 class="vakkop"><b>Volgens je dagstart ${items.length}</b>${g ? " · " + esc(wanneer(g)) : ""}</h2>${hoe("notion", "Waarom staat dit in Notion?")}</div>
    <p class="klein stil">De nummers zijn dezelfde als in je dagstart. Afhandelen doe je in Notion, of vraag het je team in Claude.</p></section>
    ${items.length ? `<div class="stapel">${items.map(kaart).join("")}</div>` : `<section class="leeg"><h3>Niets voor jou in je dagstart.</h3><p class="stil">Zodra je dagstart iets voor je klaarzet, staat het hier.</p></section>`}
    ${renderOnderregels()}${privacyHtml()}</div>`;
}

/* ---------- Item-blad ---------- */
function meerKnop(a) { return `<button class="knop stil" data-act="sheet" data-type="meer" data-id="${esc(a.id)}">${ic("meer", "klein")}Meer</button>`; }
function bladKnoppen(a) {
  const s = soortVan(a); const ag = werkAgent(a); const id = esc(a.id); const kc = klaarCheck();
  if (!kanSchrijven()) return `<div class="balk daglink"><div>${toegang() === "daglink" ? "Je kijkt mee met je daglink. Om dit af te handelen log je in; je komt direct terug bij dit item." : "Afhandelen kan hier niet."}</div>${kanInloggen() ? `<button class="knop prim breed" data-act="login">Inloggen en afhandelen</button>` : ""}</div>`;
  const rij = (...k) => `<div class="knoprij">${k.join("")}</div>`;
  const terug = ag ? knop(ic("terug", "klein") + "Terug met opmerking", "sheet", `data-type="terug" data-id="${id}"`, "team") : "";
  switch (s) {
    case "check-extern": return knop(esc(verstuurLabel(a)), "doe", `data-f="goedkeuren" data-id="${id}"`, "prim breed") + rij(terug, meerKnop(a));
    case "check": return knop("Goedkeuren", "doe", `data-f="goedkeuren" data-id="${id}"`, "prim breed") + rij(terug, meerKnop(a));
    case "voorstel": return knop("Ja, doe maar", "ja", `data-id="${id}"`, "prim breed") + rij(knop("Nee, niet doen", "sheet", `data-type="nee" data-id="${id}"`), meerKnop(a));
    case "signaal": return knop("Laat je team opvolgen", "sheet", `data-type="opvolgen" data-id="${id}"`, "teamvol breed") + rij(knop("Ik pak het zelf op", "sheet", `data-type="zelfop" data-id="${id}"`), knop("Gezien, niets doen", "doe", `data-f="gezien" data-id="${id}"`), meerKnop(a));
    case "taak": case "weer": return knop(ic("vink", "klein") + "Klaar", "doe", `data-f="klaar" data-id="${id}"`, "prim breed") + rij(knop("Nieuwe datum", "sheet", `data-type="${s === "weer" ? "later" : "datum"}" data-id="${id}"`), knop("Geef aan je team", "sheet", `data-type="wie" data-doel="geef" data-id="${id}"`, "team"), meerKnop(a));
    case "team": return `<p class="balkregel">${kc.stil ? "Dit ligt stil tot je team weer vanzelf werkt." : a.status === "Bezig" ? `${esc(deNaam(ag, true))} werkt hier nu aan${a.bezigSinds ? " (sinds " + esc(wanneer(a.bezigSinds)) + ")" : ""}. Terugsturen of aanpassen kan weer na het werkmoment.` : `${esc(deNaam(ag, true))} pakt dit op ${esc(bijHetVolgende())}. Het resultaat zie je terug bij Voor jou.`}</p>`
      + rij(knop("Toch zelf doen", "doe", `data-f="tochZelf" data-id="${id}"`), magSchrijven("notities") ? knop(ic("plus", "klein") + "Opmerking", "sheet", `data-type="opmerking" data-id="${id}"`) : "");
    case "wacht": return knop("Nu oppakken", "doe", `data-f="nuOppakken" data-id="${id}"`, "prim breed") + rij(knop("Datum verzetten", "sheet", `data-type="later" data-id="${id}"`));
    case "klaar": return `<p class="balkregel">Afgerond${a.afgerondOp ? " op " + esc(datumKort(a.afgerondOp)) : ""}${isAgentSlug(a.afgerondDoor) ? " door " + esc(deNaam(a.afgerondDoor)) : ""}${uitkomstVan(a) ? " · " + esc(uitkomstVan(a)) : ""}.</p>` + rij(knop("Toch weer openen", "doe", `data-f="heropen" data-id="${id}"`));
    case "klopt-niet": return `<p class="balkregel">Dit heeft geen duidelijke eigenaar of status: er is geen mens aan zet. Wie moet ernaar kijken?</p>` + knop("Zet bij mij", "doe", `data-f="zetBijMij" data-id="${id}"`, "prim breed");
  }
  return "";
}
function terugLabelVan(terug) {
  if (terug === "/") return "Voor jou";
  if (terug.startsWith("/acties")) return "Acties";
  if (terug.startsWith("/team/agent/")) { const a = AGENTS[terug.split("/")[3]]; return a ? a.naam : "Team"; }
  if (terug.startsWith("/team/vaste")) return "Vaste taken";
  if (terug.startsWith("/team")) return "Team";
  if (terug.startsWith("/gegevens/")) { const p = terug.split("/"); if (p[3]) return rijTitel(p[2], p[3]) || "Gegevens"; return domeinLabel(p[2]); }
  if (terug.startsWith("/gegevens")) return "Gegevens";
  return "Terug";
}
function relatieKnop(h) {
  const kan = h.domein && h.id && toegang() !== "notion" && CTX.schema.datadomeinen[h.domein] && !(h.domein in DATA_NIET_IN_BUNDEL);
  return kan ? `<button class="relatie" data-act="go" data-r="/gegevens/${esc(h.domein)}/${esc(h.id)}">${esc(h.titel)}</button>` : `<span class="relatie">${esc(h.titel)}</span>`;
}
function renderBlad(a, plek) {
  const s = soortVan(a); const ag = werkAgent(a); const b = beurt(a); const l = voorJouLijst(); const inLijst = l.some(x => x.id === a.id);
  const tab = tabVan(); const terug = S.terugNaar || (tab === "acties" ? "/acties" : "/");
  const pos = inLijst ? `Nr ${S.nummers[a.id]} · nog ${l.length} voor jou` : "";
  const vanTeam = isAgentSlug(a.door);
  const herk = vanTeam ? `${agChip(a.door)}<span>zette dit klaar${a.aangemaakt ? ", " + esc(wanneer(a.aangemaakt)) : ""}.</span>`
    : ag && s === "team" ? `${agChip(ag, { bezig: a.status === "Bezig" })}<span>${a.status === "Bezig" ? "werkt hier nu aan" : "pakt dit op"}.${a.door ? " Opdracht van " + esc(voornaam(a.door)) + "." : ""}</span>`
      : a.door ? `${mensChip(a.door)}<span>zette dit op de lijst${a.aangemaakt ? ", " + esc(wanneer(a.aangemaakt)) : ""}.</span>`
        : a.aangemaakt ? `<span>Op de lijst sinds ${esc(wanneer(a.aangemaakt))}.</span>` : "";
  const opm1 = a.teruggestuurd && !hoortBijMens(a) ? `<p class="citaat">Jouw opmerking voor ${esc(deNaam(ag))}: ‘${esc(a.teruggestuurd)}’</p>` : "";
  const werkTekst = a.werk ? a.werk : (s === "team" ? "Nog geen resultaat. Zodra " + deNaam(ag) + " klaar is, staat het werk hier." : "");
  const werkKop = !a.werk ? "Nog in de maak" : (vanTeam || (ag && a.status !== "Open")) ? "Wat je team maakte" : "Toelichting";
  const lang = werkTekst.split("\n").length > 12 || werkTekst.length > 900; const open = S.ui.meerOpen[a.id];
  const subs = S.data.acties.filter(x => x.onder === a.id);
  const opm = a.opmerkingen;
  const deskPaneel = plek === "paneel"; const pijlen = inLijst && isDesk() && tab === "voorjou";
  const opmLabel = (s === "check" || s === "check-extern") ? "Opmerkingen zijn voor jou en je collega's; je team leest ze niet. Wil je dat je team iets anders doet? Gebruik <b>Terug</b>." : "Opmerkingen zijn voor jou en je collega's; je team leest ze niet.";
  return `<div class="blad">
    <div class="blad-kop">${deskPaneel ? `<span class="pos">${pos}</span>` : `<button class="link" data-act="sluit-blad">${ic("links", "klein")} ${esc(terugLabelVan(terug))}</button><span class="pos">${pos}</span>`}
      <span class="rijtje">${pijlen ? `<button class="ikknop" data-act="stap" data-d="-1" aria-label="Vorige">${ic("links")}</button><button class="ikknop" data-act="stap" data-d="1" aria-label="Volgende">${ic("chev")}</button>` : ""}${deskPaneel ? "" : `<button class="ikknop" data-act="sluit-blad" aria-label="Sluiten">${ic("sluit")}</button>`}</span></div>
    <h2 class="titel" id="blad-titel" tabindex="-1">${esc(a.titel)}</h2>
    <div class="rijtje"><span class="soort ${s === "team" ? "teamk" : ""}">${SOORT_LABEL[s].toUpperCase()}</span><span class="beurt ${b.k}">${b.t}</span>${isTeLaat(a) ? `<span class="pil laat">${dagenTeLaat(a)} ${dagenTeLaat(a) === 1 ? "dag" : "dgn"} te laat</span>` : ""}</div>
    ${herk ? `<p class="herkomst">${herk}</p>` : ""}${opm1}
    ${a.hoort.length ? `<div class="hoortbij">Hoort bij: ${a.hoort.map(relatieKnop).join("")}</div>` : ""}
    ${werkTekst ? `<section class="papier" aria-label="${esc(werkKop)}"><div class="tussen"><h3 class="vakkop">${esc(werkKop)}</h3>${a.werk ? `<button class="knop klein-knop" data-act="kopieer" data-id="${esc(a.id)}">${ic("kopieer", "klein")}Kopieer alles</button>` : ""}</div>
      <div class="werk ${lang && !open ? "ingekort" : ""}">${esc(werkTekst)}</div>${lang ? `<button class="link" data-act="meer-werk" data-id="${esc(a.id)}">${open ? "Toon minder" : "Toon alles"}</button>` : ""}</section>` : ""}
    ${a.bronLink && /^https:\/\//.test(a.bronLink) ? `<a class="link" href="${esc(a.bronLink)}" target="_blank" rel="noopener noreferrer">Bron bekijken ${ic("pijl-op", "klein")}</a>` : ""}
    ${s === "check-extern" ? `<p class="balkregel">${ic("slot", "klein")} Je team verstuurt niets zelf. Kopieer de tekst, ${a.kanaal === "post" ? "plaats" : "verstuur"} hem en druk dan op de knop.</p>` : ""}
    <div>
      ${a.opdracht ? `<details class="uitklap" ${det("u-" + a.id + "-opd")}><summary>De opdracht <span class="stil klein">(${a.opdracht.van ? "van " + esc(voornaam(a.opdracht.van)) + ", " : ""}${esc(datumKort(a.opdracht.op))})</span>${ic("chev")}</summary><div class="binnen"><p style="white-space:pre-line">${esc(a.opdracht.tekst)}</p></div></details>` : ""}
      ${magSchrijven("notities") || opm.length ? `<details class="uitklap" ${det("u-" + a.id + "-opm")}><summary>Opmerkingen (${opm.length})${ic("chev")}</summary><div class="binnen">
        <p class="leeglabel">${opmLabel}</p>
        ${opm.map(o => `<div class="opm"><small>${esc(o.van)} · ${esc(wanneer(o.op))}</small><p>${esc(o.tekst)}</p></div>`).join("")}
        ${magSchrijven("notities") ? `<button class="knop" data-act="sheet" data-type="opmerking" data-id="${esc(a.id)}">${ic("plus", "klein")}Opmerking</button>` : ""}</div></details>` : ""}
      <details class="uitklap" ${det("u-" + a.id + "-sub")}><summary>Wat hieraan hangt (${subs.length})${ic("chev")}</summary><div class="binnen">
        ${subs.map(x => `<button class="rij" data-act="open" data-id="${esc(x.id)}"><span class="vorm" aria-hidden="true">${vormVan(soortVan(x))}</span><span class="ct"><b>${esc(x.titel)}</b><span class="rmeta">${esc(SOORT_LABEL[soortVan(x)])}</span></span>${ic("chev")}</button>`).join("") || '<p class="stil">Nog niets.</p>'}
        ${kanSchrijven() ? `<button class="knop" data-act="sheet" data-type="opdracht" data-onder="${esc(a.id)}">${ic("plus", "klein")}Kleinere opdracht</button>` : ""}</div></details>
      <details class="uitklap" ${det("u-" + a.id + "-veld")}><summary>Alle gegevens${ic("chev")}</summary><div class="binnen">${renderVelden(a)}</div></details>
    </div>
    <div class="beslisbalk">${bladKnoppen(a)}</div></div>`;
}
function renderVelden(a) {
  const bew = kanSchrijven();
  const wie = a.eigenaar ? (isAgentNaam(a.eigenaar) ? deNaam(slugVanNaam(a.eigenaar)) : a.eigenaar) : "nog niemand";
  const rij = (k, v, act) => `<dt>${k}</dt><dd>${v}${bew && act ? ` <button class="hoe wijzig" data-act="${act[0]}" ${act[1]} aria-label="${esc(k)} wijzigen">wijzig</button>` : ""}</dd>`;
  return `<dl class="velden">
    ${rij("Staat op naam van", esc(wie) + (a.status === "Voorstel" && isAgentNaam(a.eigenaar) ? ' <span class="stil klein">(beslissen doe jij)</span>' : ""), ["sheet", `data-type="wie" data-doel="toewijzen" data-id="${esc(a.id)}"`])}
    ${rij("Status", `<span class="pil status">${esc(a.status || "—")}</span> <span class="stil klein">(${esc(SOORT_LABEL[soortVan(a)])})</span>`)}
    ${rij("Deadline", a.deadline ? esc(datumKort(a.deadline)) : "geen", ["sheet", `data-type="datum" data-id="${esc(a.id)}"`])}
    ${rij("Belang", esc(a.prio || "—"), ["sheet", `data-type="prio" data-id="${esc(a.id)}"`])}
    ${rij("Soort", esc({ Taak: "Taak", Alert: "Signaal", Opvolging: "Opvolging", Beslissing: "Beslissing" }[a.type] || a.type || "—"))}
    ${rij("Aangemaakt door", isAgentSlug(a.door) ? esc(deNaam(a.door)) : esc(a.door || "—"))}
    ${a.wachtenTot ? rij("Wacht tot", esc(datumKort(a.wachtenTot))) : ""}
    ${a.afgerondOp ? rij("Afgerond op", esc(datumKort(a.afgerondOp))) : ""}
    ${a.correctie ? rij("Jouw aanpassing", esc(a.correctie)) : ""}
  </dl><p class="klein stil">Je wijzigt één veld tegelijk; de rest blijft staan. De statusnamen zijn dezelfde als in Claude en Notion.</p>`;
}
function uitkomstVan(a) {
  if (a.status !== "Klaar") {
    if (a.teruggestuurd && soortVan(a) === "team") return "teruggestuurd";
    if (hoortBijMens(a)) return "wacht op jou";
    return SOORT_LABEL[soortVan(a)].toLowerCase();
  }
  if (isAgentSlug(a.afgerondDoor)) return "je team rondde het zelf af";
  if (/^niet doen/i.test(a.correctie)) return "niet gedaan";
  if (a.gecorrigeerd) return "zelf aangepast";
  if (isAgentSlug(a.door)) return a.kanaal || /^\s*onderwerp\s*:/im.test(a.werk) ? "goedgekeurd, zelf verstuurd" : "goedgekeurd";
  return "afgerond";
}

/* ---------- Eén voor één ---------- */
function renderRonde() {
  const r = S.ronde; if (!r) return renderVoorJou();
  while (r.i < r.ids.length) { const a = actie(r.ids[r.i]); if (a && hoortBijMens(a) && vanMij(a)) break; r.i++; }
  const gedaan = S.sessie.afgehandeld.filter(x => x.t >= r.start).length;
  if (r.i >= r.ids.length) {
    r.eind = r.eind || Date.now(); const sec = Math.round((r.eind - r.start) / 1000); const mn = Math.round(sec / 60); const tijd = sec < 60 ? "in minder dan een minuut" : "in " + mn + " " + (mn === 1 ? "minuut" : "minuten");
    const door = S.data.acties.filter(a => r.naarTeam.includes(a.id) && soortVan(a) === "team").length;
    const rest = aanJouZet().length; const kc = klaarCheck();
    const kop = gedaan ? `Klaar. ${telwoord(gedaan, "ding", "dingen")} afgehandeld ${tijd}.` : "Je hebt alles bekeken.";
    const vervolg = !kanSchrijven() ? "Log in om ze af te handelen; je komt terug waar je was." : kc.stil ? (door ? "Let op: je team werkt nu niet vanzelf. Regel dat eerst, anders blijft wat je doorgaf liggen." : "Let op: je team werkt nu niet vanzelf. Regel dat, dan komt er weer nieuw werk.") : door ? `Bij het volgende werkmoment gaat je team verder met ${telwoord(door, "ding", "dingen")} die je terugstuurde of doorgaf.` : "Je team werkt bij het volgende werkmoment weer verder.";
    return `<div class="inhoud" style="max-width:680px"><section class="vak" style="display:flex;flex-direction:column;gap:12px"><h2 class="titel" id="blad-titel" tabindex="-1">${kop}</h2>
      <p>${vervolg}</p>${rest ? `<p class="klein">${telwoord(rest, "ding staat", "dingen staan")} nog bij Voor jou (overgeslagen of later).</p>` : ""}
      <div class="rijtje">${!kanSchrijven() ? loginKnop("Inloggen") : rest ? knop("Loop de rest door", "ronde-start", "", "prim") : ""}${kc.stil && kanSchrijven() ? knop("Is je team klaar?", "go", 'data-r="/team/klaar"', "prim") : ""}<button class="knop ${kanSchrijven() && !kc.stil ? "prim" : ""}" data-act="ronde-stop">Terug naar Voor jou</button></div></section></div>`;
  }
  const a = actie(r.ids[r.i]); const s = soortVan(a); const ag = werkAgent(a); const id = esc(a.id);
  const pct = Math.round(r.i / r.ids.length * 100);
  let knoppen = "";
  const later = knop("Later …", "sheet", `data-type="later" data-id="${id}"`, "groot breed");
  if (!kanSchrijven()) knoppen = (a.werk ? knop(ic("kopieer", "klein") + "Kopieer de tekst", "kopieer", `data-id="${id}"`, "groot breed") : "") + loginKnop("Inloggen en afhandelen", "prim groot breed");
  else if (s === "signaal") {
    const opv = opvolgAgentVan(a);
    knoppen = `<div class="vak" style="display:flex;flex-direction:column;gap:8px;padding:12px"><button class="knop teamvol groot breed" data-act="ronde-opvolgen" data-id="${id}">Laat je team opvolgen</button><p class="klein">‘${esc(opvolgZinVan(a))}’ · door ${esc(deNaam(opv))}</p></div>`
      + knop("Ik pak het zelf op", "sheet", `data-type="zelfop" data-id="${id}"`, "groot breed") + knop("Gezien, niets doen", "doe", `data-f="gezien" data-id="${id}"`, "groot breed") + later;
  } else if (s === "voorstel") knoppen = knop("Ja, doe maar", "ja", `data-id="${id}"`, "prim groot breed") + knop("Nee, niet doen", "sheet", `data-type="nee" data-id="${id}"`, "groot breed") + later;
  else if (s === "check-extern") knoppen = knop(ic("kopieer", "klein") + "Kopieer de tekst", "kopieer", `data-id="${id}"`, "groot breed") + knop(esc(verstuurLabel(a)), "doe", `data-f="goedkeuren" data-id="${id}"`, "prim groot breed") + (ag ? knop("Terug naar " + esc(deNaam(ag)), "sheet", `data-type="terug" data-id="${id}"`, "team groot breed") : "") + later;
  else if (s === "check") knoppen = knop("Goedkeuren", "doe", `data-f="goedkeuren" data-id="${id}"`, "prim groot breed") + (ag ? knop("Terug naar " + esc(deNaam(ag)), "sheet", `data-type="terug" data-id="${id}"`, "team groot breed") : "") + later;
  else knoppen = knop("Klaar", "doe", `data-f="klaar" data-id="${id}"`, "prim groot breed") + knop("Nieuwe datum", "sheet", `data-type="${s === "weer" ? "later" : "datum"}" data-id="${id}"`, "groot breed") + knop("Geef aan je team", "sheet", `data-type="wie" data-doel="geef" data-id="${id}"`, "team groot breed");
  const w = a.werk; const langW = w.split("\n").length > 8 || w.length > 600; const openW = S.ui.meerOpen[a.id];
  return `<div class="inhoud ronde" style="max-width:680px">
    <div class="tussen"><h2 class="vakkop"><b>Eén voor één</b> · <span class="mono">nog ${new Set(r.ids.slice(r.i)).size}</span>${gedaan ? ` · ${gedaan} afgehandeld` : ""}</h2><button class="ikknop" data-act="ronde-stop" aria-label="Stoppen">${ic("sluit")}</button></div>
    <div class="voortgang" role="progressbar" aria-label="Voortgang" aria-valuemin="0" aria-valuemax="${r.ids.length}" aria-valuenow="${r.i}"><div style="width:${pct}%"></div></div>
    <section class="vak" style="display:flex;flex-direction:column;gap:10px"><h2 class="titel" id="blad-titel" tabindex="-1">${esc(a.titel)}</h2>
      <div class="rijtje"><span class="soort">${SOORT_LABEL[s].toUpperCase()}</span>${ag ? agChip(ag) : ""}<span class="mono klein stil">${esc(sindsTekst(a))}</span>${isTeLaat(a) ? `<span class="pil laat">${dagenTeLaat(a)} ${dagenTeLaat(a) === 1 ? "dag" : "dgn"} te laat</span>` : ""}</div>
      ${a.opmerkingen.map(o => `<p class="citaat">${esc(voornaam(o.van))}, ${esc(wanneer(o.op))}: ‘${esc(o.tekst)}’</p>`).join("")}
      ${w ? `<div class="papier"><div class="werk ${langW && !openW ? "kort8" : ""}">${esc(w)}</div>${langW ? `<button class="link" data-act="meer-werk" data-id="${id}">${openW ? "Toon minder" : "Toon alles"}</button>` : ""}</div>` : ""}
      ${a.hoort.length ? `<p class="hoortbij">Hoort bij: ${a.hoort.map(h => esc(h.titel)).join(" › ")}</p>` : ""}</section>
    <div class="kol" style="gap:8px">${knoppen}<button class="knop stil" data-act="ronde-over" style="align-self:flex-end">Sla over ${ic("chev", "klein")}</button></div></div>`;
}
function opvolgAgentVan(a) {
  const ag = werkAgent(a);
  const sp = beschikbareSpecialisten(CTX).map(x => x.slug);
  if (ag && ag !== "pipeline-manager" && sp.includes(ag)) return ag;
  return sp.includes("outreach-specialist") ? "outreach-specialist" : (sp[0] || "management-assistent");
}
function opvolgZinVan(a) { return "Pak de volgende stap op: " + a.titel; }
