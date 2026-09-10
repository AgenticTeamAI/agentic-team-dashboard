/* Homepage: de vier tabs (Vandaag · Team · Data · Prestaties), hun tegels en
 * panelen, plus de doorklik naar het detail (de volledige, uitgeschreven
 * zone-inhoud). Rendering only; de berekeningen zelf staan in zones.js
 * (puur, geen DOM) zodat ze zonder browser te testen zijn.
 *
 * f25 — de indeling volgt één vraag per zone: Vandaag = "wat moet ik nu
 * doen?", Team = "wat deden ze?", Data = "wat staat er in mijn werkruimte?",
 * Prestaties = "hoe staat mijn team ervoor?". De adoptiescore heet naar de
 * gebruiker toe "Ritme van je team" en staat bewust NIET bovenaan: hij zegt
 * iets over de gebruiker, niet over ons. Zakt hij onder de drempel, dan
 * komt hij vanzelf omhoog als aandachtspunt (zones.js). */

/* i71: de `uitleg` beantwoordt "wat vind ik waar?" vóór je klikt. Dat was een
 * letterlijke vraag van de eerste klant die er live mee werkte ("in een team
 * of in data?"). De panelen op de tabs zelf zeggen het al; wat ontbrak was
 * het antwoord op het moment dat je moet kiezen. */
const TABS = [
  { key: "vandaag", titel: "Vandaag", emoji: "📌", route: "#/", uitleg: "Wat vraagt nu je aandacht" },
  { key: "team", titel: "Team", emoji: "📣", route: "#/team", uitleg: "Wat je agents deden en aan elkaar doorgaven" },
  { key: "data", titel: "Data", emoji: "🗂️", route: "#/data", uitleg: "Je acties, deals en lessen zelf" },
  { key: "prestaties", titel: "Prestaties", emoji: "📊", route: "#/prestaties", uitleg: "Ritme, activiteit en gebruik per agent" },
];

const DETAIL_VOLGORDE = [
  { key: "feed", titel: "Teamfeed", emoji: "📣" },
  { key: "aandacht", titel: "Vraagt je aandacht", emoji: "🎯" },
  { key: "context", titel: "Contextgezondheid", emoji: "🧭" },
  { key: "adoptiescore", titel: "Ritme — herkomst", emoji: "📊" },
  { key: "activiteit", titel: "Activiteit per week", emoji: "📈" },
  { key: "gebruik", titel: "Gebruik per agent", emoji: "👥" },
  { key: "opbrengst", titel: "Opbrengst", emoji: "💰" },
  { key: "tijdwinst", titel: "Geschatte tijdwinst — aanname", emoji: "⏱️" },
  { key: "correctievrij", titel: "Correctievrij — de f19-gate", emoji: "🛡️", intern: true },
  { key: "leren", titel: "Leren", emoji: "💡" },
  // f34 fase 0: alleen in de nav zodra de site het overzicht heeft geleverd
  // (ingelogde sessie + licentie in de allowlist) — zie modules-beheer.js.
  { key: "modules", titel: "Jouw modules", emoji: "🧩", modulesTegel: true },
];

// Onder welke tab hoort een detailpagina? Zo blijft de tabbar staan (en de
// juiste tab gemarkeerd) terwijl je een verdieping open hebt.
const DETAIL_TAB = {
  feed: "team",
  aandacht: "vandaag",
  opbrengst: "vandaag",
  tijdwinst: "vandaag",
  context: "prestaties",
  adoptiescore: "prestaties",
  activiteit: "prestaties",
  gebruik: "prestaties",
  correctievrij: "prestaties",
  leren: "prestaties",
  modules: "vandaag",
};

function nlGetal(n, decimals = 0) {
  return Number(n).toLocaleString("nl-NL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Tabbar ────────────────────────────────────────────────────────────
// Gewone links: toetsenbordnavigatie en "open in nieuw tabblad" gratis, en
// de hash-router doet de rest. Op mobiel plakt deze balk onderaan (styles.css).
/* Kan de Data-tab iets tonen? Een kant-en-klaar metricsbestand draagt geen
 * rijen: dan bleef er een tab over die alleen uitlegde waarom hij leeg was.
 * Uitzondering: de relatiekaarten (f29) worden wél uit zo'n bestand
 * afgeleid — draagt het die, dan is er inhoud en blijft de tab staan. */
function dataTabBeschikbaar(ctx) {
  if (!ctx || !ctx.bundle) return false;
  // Zijn er domeinen opgehaald, dan valt er iets te tonen — ook op de
  // metricsroute, want sinds f33 haalt de loader daar óók de rijen op.
  if (Object.keys(ctx.bundle.domains || {}).length > 0) return true;
  return Array.isArray(ctx.relaties) && ctx.relaties.length > 0;
}

function zichtbareTabs(ctx) {
  return TABS.filter(t => t.key !== "data" || dataTabBeschikbaar(ctx));
}

function renderTabbar(el, activeTab, ctx) {
  // De korte kop (zichtbaar op mobiel en bij scroll) noemt waar je bent —
  // "Agentic Team · vandaag" leest raar boven de Prestaties-tab.
  const kort = document.querySelector(".kop-kort");
  const actief = TABS.find(t => t.key === activeTab);
  if (kort) kort.textContent = `Agentic Team · ${actief ? actief.titel.toLowerCase() : "vandaag"}`;
  el.innerHTML = zichtbareTabs(ctx).map(t =>
    `<a href="${t.route}" class="tab${t.key === activeTab ? " actief" : ""}"${t.key === activeTab ? ' aria-current="page"' : ""} title="${esc(t.uitleg)}">
      <span class="tab-emoji" aria-hidden="true">${t.emoji}</span><span class="tab-titel">${esc(t.titel)}</span>
    </a>`).join("");
}

// ── Vandaag · statusregel ─────────────────────────────────────────────
// Antwoordt op "draaide mijn team eigenlijk?" vóór welk cijfer dan ook.
// Leest alleen wat er al is: de nieuwste teamfeed-post, anders de nieuwste
// tijdstempel van de opgehaalde domeinen, anders het moment waarop het
// metricsbestand is gemaakt. Nooit een tijd verzinnen.
function laatsteActiviteit(ctx) {
  let nieuwste = null;
  const bump = (d) => { if (d && !isNaN(d.getTime()) && (!nieuwste || d > nieuwste)) nieuwste = d; };
  const feed = ctx.bundle && ctx.bundle.teamfeed;
  if (feed && Array.isArray(feed.entries)) {
    for (const e of feed.entries) bump(new Date(e && (e.aangemaakt || e.bijgewerkt)));
  }
  const domains = (ctx.bundle && ctx.bundle.domains) || {};
  for (const d of Object.values(domains)) bump(d && d.staleAt);
  if (ctx.metricsMeta) bump(ctx.metricsMeta.gegenereerdOp);
  return nieuwste;
}

function renderStatusregel(el, ctx) {
  const dt = laatsteActiviteit(ctx);
  if (!dt) { el.textContent = "Nog geen activiteit gevonden in deze bundel."; return; }
  const dagen = daysBetween(ctx.today, dt);
  const tijd = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  el.textContent = dagen === 0
    ? `Je team draaide vandaag — laatst bijgewerkt ${tijd}.`
    : `Laatste activiteit: ${fmtDate(dt)} (${relAge(dt, ctx.today)}).`;
}

// ── Kanttekeningen bij de cijfers ─────────────────────────────────────
// Stond hier eerder als geel kader met de kop "Niet alles kon gelezen
// worden", altijd open, op alle vier de tabs — het eerste wat een klant zag
// was dus dat er iets stuk leek. De informatie blijft volledig staan, maar
// dichtgeklapt achter één regel, en dit blok deelt niet meer de alarmkleur
// met echte fouten.
//
// De volgorde is niet willekeurig: waarschuwingen over de bundel zelf
// (verouderd, onleesbaar, onbekend domein) vragen om actie en staan boven de
// veldwaarschuwingen, die vooral beheerdersinformatie zijn.
function renderWaarschuwingen(el, ctx) {
  const bundel = (ctx && ctx.bundelWaarschuwingen) || [];
  const veld = (ctx && ctx.veldWaarschuwingen) || [];
  const alles = bundel.concat(veld);
  if (!alles.length) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  el.style.display = "";
  const aantal = alles.length === 1 ? "1 kanttekening" : `${alles.length} kanttekeningen`;
  // Alleen als er iets over de bundel zelf mis is, verdient de samenvatting
  // een "let op" — anders leest elke ontbrekende veldnaam als een storing.
  const kop = bundel.length ? `Let op: ${aantal} bij deze cijfers` : `${aantal} bij deze cijfers`;
  el.innerHTML = `<details class="kanttekeningen"${bundel.length ? ' data-let-op="1"' : ""}>
    <summary>${esc(kop)}</summary>
    <ul>${alles.map(w => `<li>${esc(w)}</li>`).join("")}</ul>
  </details>`;
}

// ── Vandaag · privacybelofte ──────────────────────────────────────────
// De één-regelversie is de samenvatting, de uitklap is de juridische tekst
// (toets 26-08-2026). De uitklap moet hier staan — in de UI, op het moment
// dat de belofte wordt gedaan — en mag niet naar een andere pagina
// verhuizen. Zie src/teksten.js.
function renderPrivacyBlok(el) {
  // Eén <p> per alinea (art. 12 lid 1 AVG: beknopt en begrijpelijk). De tekst
  // zelf is onveranderd; alleen de opmaak is anders dan het blok van tien
  // zinnen dat het was.
  const alineas = PRIVACY_UITKLAP_ALINEAS.map((a) => `<p class="privacy-volledig">${esc(a)}</p>`).join("");
  el.innerHTML = `<details class="privacy-uitklap">
    <summary><span class="privacy-regel-tekst">${esc(PRIVACY_REGEL)}</span><span class="privacy-info" aria-hidden="true">ⓘ</span></summary>
    ${alineas}
  </details>`;
}

// ── Vandaag · Opbrengst — twee metingen en één rekenhulp ──────────────
// De tijdwinst stond hier als grootste getal op de pagina, terwijl het het
// enige getal is dat niets aantoont: een aanname die je zelf invoert, maal
// een telling. Een sceptische lezer prikt daar in één zin doorheen en neemt
// dan de rest ook niet meer serieus. Dus staat nu vooraan wat wél gemeten
// is — afgeronde acties en hoeveel daarvan op tijd waren — en volgt de
// schatting als expliciet gemarkeerde rekenhulp.
//
// "Correctievrij" hoort hier bewust NIET bij, hoe goed het cijfer ook staat:
// die meting is intern (DASHBOARD_INTERN=1) en niet elke klant heeft hem.
function renderOpbrengstKpis(el, ctx) {
  const { tijdwinst } = ctx;
  const uren = nlGetal(tijdwinst.uren, 1);
  const actiesGetal = tijdwinst.berekenbaar ? tijdwinst.afgerond : "n.v.t.";
  const actiesLabel = tijdwinst.berekenbaar
    ? `van ${tijdwinst.totaal} acties in de bundel`
    : "Geen Acties-domein aanwezig in deze bundel.";

  // Dezelfde Opvolging-subscore die de Prestaties-tab toont — hier omdat dit
  // een gemeten opbrengst is. Eén berekening, twee plaatsen: nooit een tweede
  // formule voor hetzelfde getal.
  const opvolging = ((ctx.adopt && ctx.adopt.componenten) || []).find(c => c.key === "opvolging")
    || { berekenbaar: false, reden: "Opvolging is in deze bundel niet te berekenen." };
  const opvolgingGetal = opvolging.berekenbaar ? `${Math.round(opvolging.waarde)}%` : "n.v.t.";
  const opvolgingLabel = opvolging.berekenbaar
    ? `${opvolging.klaar} van ${opvolging.verstreken} acties met een verstreken deadline zijn alsnog afgerond`
    : opvolging.reden;

  const tijdwinstGetal = tijdwinst.berekenbaar ? `${uren} uur` : "n.v.t.";
  const som = tijdwinst.berekenbaar
    ? `${tijdwinst.afgerond} × ${tijdwinst.minutenPerActie} min = ${nlGetal(tijdwinst.minuten)} min ≈ ${uren} uur`
    : "Geen Acties-domein aanwezig in deze bundel — er is niets om op te tellen.";

  el.innerHTML = `
    <div class="kpi-tile" data-goto="opbrengst" tabindex="0" role="button"${tijdwinst.berekenbaar ? "" : ' data-nvt="1"'}>
      <div class="kpi-getal">${esc(actiesGetal)}</div>
      <div class="kpi-kop">Acties afgerond</div>
      <div class="kpi-label">${esc(actiesLabel)}</div>
    </div>
    <div class="kpi-tile" data-goto="adoptiescore" tabindex="0" role="button"${opvolging.berekenbaar ? "" : ' data-nvt="1"'}>
      <div class="kpi-getal">${esc(opvolgingGetal)}</div>
      <div class="kpi-kop">Op tijd afgerond</div>
      <div class="kpi-label">${esc(opvolgingLabel)}</div>
    </div>
    <div class="kpi-tile kpi-zacht" data-goto="tijdwinst" tabindex="0" role="button">
      <div class="kpi-getal">${esc(tijdwinstGetal)}</div>
      <div class="kpi-kop">Rekenhulp · geschatte tijdwinst</div>
      <div class="kpi-aanname">schatting op basis van jouw aanname, geen meting</div>
      <div class="kpi-instelling" data-stop-nav="1">
        <label class="minuten-input-label">min/actie
          <input type="number" id="input-minuten" min="1" max="480" step="1" value="${esc(ctx.minutenPerActie)}">
        </label>
      </div>
      <div class="kpi-som">${esc(som)}</div>
    </div>`;
}

// ── Prestaties · tegels ───────────────────────────────────────────────
// De adoptiescore heet hier "Ritme van je team". De berekening verandert
// niet: het is exact dezelfde score, met dezelfde narekenbare herkomst.
function renderPrestatieKpis(el, ctx) {
  const { adopt, sporenTotaal, periodWeeks } = ctx;
  const cv = ctx.correctievrij || { aanwezig: false, reden: "Correctievrij-percentage niet beschikbaar in deze bundel." };
  const cvKpi = correctievrijKpi(cv);

  const ritmeWaarde = adopt.adoptiescore === null ? "n.v.t." : `${adopt.adoptiescore}%`;
  const ritmeLabel = adopt.adoptiescore === null
    ? "Geen enkele subscore is te berekenen in deze bundel"
    : `Gemiddelde van ${adopt.aantalBerekenbaar}/${adopt.aantalComponenten} subscores (ritme · breedte · opvolging)`;

  el.innerHTML = `
    <div class="kpi-tile" data-goto="adoptiescore" tabindex="0" role="button"${adopt.adoptiescore === null ? ' data-nvt="1"' : ""}>
      <div class="kpi-getal">${esc(ritmeWaarde)}</div>
      <div class="kpi-kop">Ritme van je team</div>
      <div class="kpi-label">${esc(ritmeLabel)}</div>
    </div>
    <div class="kpi-tile" data-goto="activiteit" tabindex="0" role="button">
      <div class="kpi-getal">${esc(sporenTotaal)}</div>
      <div class="kpi-kop">Sporen in de periode</div>
      <div class="kpi-label">dagverslagen, lessen, interacties en content — laatste ${periodWeeks} weken</div>
    </div>
    ${ctx.intern ? `<div class="kpi-tile kpi-intern" data-goto="correctievrij" tabindex="0" role="button"${cvKpi.getal === "n.v.t." ? ' data-nvt="1"' : ""}>
      <div class="kpi-getal">${esc(cvKpi.getal)}</div>
      <div class="kpi-kop">Correctievrij (4 wk)</div>
      <div class="kpi-som">${esc(cvKpi.gate)}</div>
      <div class="kpi-label">${esc(cvKpi.label)}</div>
    </div>` : ""}`;
}

// ── Prestaties · "Waar komen deze cijfers vandaan?" ───────────────────
// Alle dataherkomst, bundelinfo en "niet in deze bundel"-waarschuwingen op
// één plek. Uit de tegels weg: daar stond de voetnoot in bijna dezelfde
// weging als het cijfer zelf.
function renderHerkomst(el, ctx) {
  const regels = [];

  if (ctx.bundle.kind === "metrics") {
    const meta = ctx.metricsMeta;
    const gen = meta.gegenereerdOp && !isNaN(meta.gegenereerdOp.getTime()) ? meta.gegenereerdOp.toLocaleString("nl-NL") : "onbekend moment";
    regels.push(`<strong>Bundel:</strong> ${esc(meta.bronLabel)} — kant-en-klaar metricsbestand v${METRICS_VERSION}, gegenereerd op ${esc(gen)}${meta.door ? ` door ${esc(meta.door)}` : ""}, ${esc(meta.domeinenGevonden)} domein(en) met tellingen. De periode ligt vast in dat bestand en is hier niet aanpasbaar.`);
  } else {
    regels.push(`<strong>Bundel:</strong> ${esc(ctx.bundle.sourceLabel)} — live opgehaald uit je werkruimte-instantie, ${esc(Object.keys(ctx.bundle.domains).length)} domein(en) gevonden.`);
  }

  const ontbrekend = RITME_BRONNEN.filter(b => !ctx.activiteit.aanwezigeBronnen.includes(b));
  if (ontbrekend.length) {
    regels.push(`<strong>Niet in deze bundel:</strong> ${ontbrekend.map(esc).join(", ")} — die series tonen daardoor altijd 0, niet omdat er geen activiteit was maar omdat de bron ontbreekt.`);
  }

  const nvt = ctx.adopt.componenten.filter(c => !c.berekenbaar).map(c => `${esc(c.label)}: ${esc(c.reden)}`);
  if (!ctx.tijdwinst.berekenbaar) nvt.push("Acties afgerond en geschatte tijdwinst: geen Acties-domein aanwezig in deze bundel.");
  if (ctx.intern && ctx.correctievrij && !ctx.correctievrij.aanwezig) nvt.push(`Correctievrij: ${esc(ctx.correctievrij.reden || "niet beschikbaar in deze bundel")}`);
  if (nvt.length) regels.push(`<strong>Waarom staat er n.v.t.:</strong><br>${nvt.join("<br>")}`);

  regels.push(`<strong>Ritme van je team</strong> is het ongewogen gemiddelde van drie subscores (ritme · breedte · opvolging), elk 0–100, over de gekozen periode. Ontbreekt de bron voor een subscore, dan telt hij niet mee — nooit als 0.`);
  regels.push(`<strong>Activiteit per week</strong> komt per serie uit het eigen datumveld (Interacties·Datum, Dagverslagen·Dag, Lessen &amp; Inzichten·Datum, Content Kalender·Publicatiedatum). Een week zonder spoor blijft zichtbaar met het label "geen" — het gat is het signaal, geen weggelaten balk.`);
  if (ctx.agentUsage && ctx.agentUsage.bron === "teamfeed") {
    regels.push(`<strong>Gebruik per agent</strong> is hier geteld uit de <em>teamfeed</em>: één telling per bericht dat een agent zelf plaatste. Dat is dezelfde bron als de Team-tab, dus beide tabs noemen hetzelfde aantal. De gebruikelijke bron — het veld Agent op je acties en lessen — is in deze bundel nergens gevuld; zonder deze terugval zou hier een ranglijst van nullen staan naast een volle feed.`);
  } else {
    regels.push(`<strong>Gebruik per agent</strong> komt uit Acties (veld Agent, tijdstip via Deadline) en Lessen &amp; Inzichten (veld Agent, veld Datum). "0" betekent geen spoor in deze bundel — niet noodzakelijk "nooit ingezet": een agent die wél draaide maar niets wegschreef, is hiermee niet te onderscheiden van een agent die stilstond.`);
  }
  regels.push(`<strong>Geschatte tijdwinst</strong> is een schatting op basis van jouw eigen aanname, geen meting: afgeronde acties × de minuten-per-actie die je op de Vandaag-tab instelt.`);
  if (!dataTabBeschikbaar(ctx)) {
    regels.push(`<strong>Waarom is er geen Data-tab?</strong> Je werkgegevens zelf staan niet in je werkruimte maar in een ander systeem; dit dashboard krijgt daarvan alleen de dagtellingen door. Je Coördinator weet welk systeem dat is.`);
  }
  regels.push(`Dit dashboard kan niet zien welke modules je hebt aangeschaft. Toont een module nergens een spoor, dan kan dat betekenen dat hij niet gebruikt wordt — of dat je hem niet hebt.`);

  // De kanttekeningen staan bovenaan de pagina dichtgeklapt, maar dit is de
  // plek waar iemand ze zoekt die wíl weten waar een getal vandaan komt.
  const veld = (ctx.veldWaarschuwingen || []);
  if (veld.length) {
    regels.push(`<strong>Niet elk veld kon gelezen worden:</strong><br>${veld.map(esc).join("<br>")}`);
  }

  const laatst = leesLaatstGebruikt();
  if (laatst) regels.push(`<strong>Laatst geladen:</strong> ${esc(laatst)}`);

  el.innerHTML = regels.map(r => `<p class="footnote">${r}</p>`).join("");
}

// ── Activiteit per week (gestapelde staafgrafiek) ───────────────────────
function renderActiviteitPanel(el, activiteit, periodWeeks) {
  if (activiteit.geenEnkeleBron) {
    el.innerHTML = `<div class="grijs-blok">
      <div class="grijs-kop">❔ Geen van de brondomeinen aanwezig</div>
      <div class="grijs-tekst">Geen van Dagverslagen, Lessen &amp; Inzichten, Interacties of Content Kalender is aanwezig in deze bundel — er is niets om per week te tonen.</div>
    </div>`;
    return;
  }
  const seriesKeys = ["interacties", "dagverslagen", "lessen_inzichten", "content_kalender"];
  const seriesLabels = seriesKeys.map(k => RITME_SERIE_LABEL[k]);
  const chart = buildStackedBarChart({ buckets: activiteit.buckets, seriesKeys, seriesLabels });
  const ontbrekend = RITME_BRONNEN.filter(b => !activiteit.aanwezigeBronnen.includes(b));
  el.innerHTML = `<div class="chart-scroll">${chart}</div>
    ${ontbrekend.length ? `<p class="footnote warn">Niet in deze bundel: ${ontbrekend.map(esc).join(", ")}.</p>` : ""}
    <a class="detail-link" data-goto="activiteit">Bekijk per week in detail →</a>`;
}

// ── Ritme — drie balken naast elkaar ────────────────────────────────────
function renderAdoptieSubscores(el, adopt) {
  const kolommen = adopt.componenten.map(c => {
    if (!c.berekenbaar) {
      return `<div class="subscore-col">
        <div class="subscore-naam">${esc(c.label)}</div>
        <div class="subscore-bar-track subscore-onbekend"><div class="subscore-bar-stub"></div></div>
        <div class="subscore-waarde subscore-waarde-onbekend">niet te berekenen</div>
        <div class="subscore-reden">${esc(c.reden)}</div>
      </div>`;
    }
    const pct = Math.round(c.waarde);
    return `<div class="subscore-col">
      <div class="subscore-naam">${esc(c.label)}</div>
      <div class="subscore-bar-track"><div class="subscore-bar-fill" style="width:${Math.min(100, pct)}%"></div></div>
      <div class="subscore-waarde">${pct}%</div>
      <div class="subscore-reden">${subscoreDetail(c)}</div>
    </div>`;
  }).join("");

  const berekenbaar = adopt.componenten.filter(c => c.berekenbaar);
  const som = berekenbaar.map(c => Math.round(c.waarde)).join(" + ");
  // De narekenbaarheid blijft bij het cijfer staan — dat is geen herkomst-
  // voetnoot maar de belofte zelf: je moet het met de hand kunnen volgen.
  const rekenregel = berekenbaar.length
    ? `Met de hand na te rekenen: (${som}) / ${berekenbaar.length} = ${adopt.adoptiescore}%.`
    : "Geen van de drie subscores is in deze bundel te berekenen — het ritme blijft daarom leeg (n.v.t.), nooit 0%.";

  el.innerHTML = `<div class="subscore-grid">${kolommen}</div>
    <p class="footnote">${esc(rekenregel)}</p>
    <a class="detail-link" data-goto="adoptiescore">Volledige herkomst per subscore →</a>`;
}

function subscoreDetail(c) {
  if (c.key === "ritme") return esc(`${c.wekenMetSpoor} van ${c.weken} weken met minstens één spoor`);
  if (c.key === "breedte") return esc(`${c.metInhoud} van ${c.totaalDomeinen} domeinen met inhoud`);
  if (c.key === "opvolging") return esc(`${c.klaar} van ${c.verstreken} verlopen acties op tijd afgerond`);
  return "";
}

// ── Vraagt je aandacht — top 5 ───────────────────────────────────────────
function renderAandachtTop5(el, items) {
  if (!items.length) {
    el.innerHTML = `<p class="aandacht-leeg">✅ Niets vraagt vandaag om aandacht in de aangesloten domeinen.</p>
      <p class="footnote">Samenvatting van rood/grijs/oranje uit de andere zones — geen eigen databron.</p>`;
    return;
  }
  const top5 = items.slice(0, 5);
  const lis = top5.map(it => `<li class="${signaalKlasse(it.ernst)}"><span class="signaal-icoon">${SIGNAAL_ICOON[signaalKlasse(it.ernst)]}</span>${aandachtWrap(it, `<div>${esc(it.label)}</div>`)}</li>`).join("");
  const meer = items.length > 5 ? `<a class="detail-link" data-goto="aandacht">+${items.length - 5} meer — bekijk alles →</a>` : `<a class="detail-link" data-goto="aandacht">Bekijk in detail →</a>`;
  el.innerHTML = `<ul class="attention-list">${lis}</ul>${meer}`;
}

// ── Gebruik per agent ─────────────────────────────────────────────────
function renderGebruikPanel(el, agentUsage, ctx) {
  if (agentUsage.status !== "ok") {
    el.innerHTML = `<div class="grijs-blok">
      <div class="grijs-kop">❔ Niet af te leiden</div>
      <div class="grijs-tekst">${esc(agentUsage.reden)}</div>
    </div>
    ${ctx ? agentSuggestiesHtml(ctx) : ""}
    <a class="detail-link" data-goto="gebruik">Meer over gebruik per agent →</a>`;
    return;
  }
  const MAX_TONEN = 10;
  const gebruikt = agentUsage.ranking.filter(a => a.totaal > 0);
  const top = agentUsage.ranking.slice(0, MAX_TONEN);
  const chart = buildHorizontalBarChart({ items: top });
  // Komt de telling uit de teamfeed, dan hóórt dat erbij te staan: anders
  // staat hier een ander getal dan op de Team-tab zonder dat iemand kan zien
  // waarom (zie kiesAgentGebruik in zones.js).
  const bron = agentUsage.bron === "teamfeed"
    ? ` Geteld uit de teamfeed — berichten van je agents — omdat je acties en lessen in deze bundel geen agentnaam dragen.`
    : ` Geteld uit Acties en Lessen &amp; Inzichten.`;
  el.innerHTML = `<div class="chart-scroll chart-scroll-smal">${chart}</div>
    <p class="footnote">${gebruikt.length} van ${agentUsage.ranking.length} agents heeft minstens één spoor in de bundel.${bron}</p>
    ${ctx ? agentSuggestiesHtml(ctx) : ""}
    <a class="detail-link" data-goto="gebruik">Alle ${agentUsage.ranking.length} agents, per module →</a>`;
}

/* i71 — een uitnodiging in plaats van een tekortkoming.
 *
 * De breedte-subscore rekent "domeinen met inhoud ÷ 25": wie vijf agents
 * gebruikt en daar prima mee draait, krijgt daar een laag cijfer voor. De
 * formule blijft zoals hij is — hij is narekenbaar en vergelijkbaar met
 * eerdere weken, en dat is meer waard dan een prettiger getal. Wat erbij komt
 * is het antwoord op de vraag die de tegel al stelde: welke agent laat ik
 * links liggen? Drie namen zeggen daar meer over dan een percentage.
 *
 * Alleen agents uit modules die de klant écht heeft — een suggestie voor iets
 * dat je niet hebt is een verkooppraatje op de verkeerde plek. Weten we het
 * niet (een daglink, of een licentie buiten de f34-allowlist), dan leiden we
 * het af uit de data zelf: core heeft iedereen, en een module waarin al
 * gewerkt is, heb je aantoonbaar. */
function agentSuggesties(ctx, max = 3) {
  const gezien = new Set();
  const modulesMetSpoor = new Set(["core"]);
  const usage = ctx && ctx.agentUsage;
  const perSlug = {};
  for (const a of ((ctx && ctx.schema && ctx.schema.agents) || [])) perSlug[a.slug] = a;
  if (usage && usage.status === "ok" && Array.isArray(usage.ranking)) {
    for (const r of usage.ranking) {
      if (!((r.totaal || 0) > 0 || (r.value || 0) > 0)) continue;
      gezien.add(r.slug);
      const agent = perSlug[r.slug];
      if (agent && agent.module) modulesMetSpoor.add(agent.module);
    }
  }
  const bekend = typeof actieveModuleKeys === "function" ? actieveModuleKeys() : null;
  const modules = bekend || [...modulesMetSpoor];
  return ((ctx && ctx.schema && ctx.schema.agents) || [])
    // Cross-cutting rollen (Coördinator, Quality Control, Gids) doen altijd
    // mee zonder dat ze zelf een rij wegschrijven. Ze hier voorstellen als
    // "nog niet ingezet" is bijna altijd onwaar — en het is precies de
    // blinde vlek die i68 structureel oplost.
    .filter(a => a.rol !== "cross-cutting")
    .filter(a => !gezien.has(a.slug))
    .filter(a => modules.indexOf(a.module) !== -1)
    .filter(a => a.description)
    .slice(0, max);
}

// Eerste zin van de menukaart-tekst: genoeg om te kiezen, kort genoeg om te
// lezen. De volledige tekst staat op de agentpagina achter de doorklik.
function eersteZin(tekst) {
  const t = String(tekst || "").trim();
  const punt = t.indexOf(". ");
  return punt === -1 ? t : t.slice(0, punt + 1);
}

function agentSuggestiesHtml(ctx) {
  const suggesties = agentSuggesties(ctx);
  if (!suggesties.length) return "";
  return `<div class="suggesties">
    <p class="suggesties-kop">Nog niet ingezet</p>
    <ul class="suggesties-lijst">${suggesties.map(a =>
      `<li><a href="#/detail/agent/${esc(a.slug)}"><span class="suggestie-naam">${esc(a.emoji)} ${esc(a.displayName)}</span>
        <span class="suggestie-waarvoor">${esc(eersteZin(a.description))}</span></a></li>`
    ).join("")}</ul>
  </div>`;
}

// ── Detail-view: dispatcher + secties (verhuisde zone-inhoud) ──────────
function detailSectionHtml(titel, emoji, decision, innerId) {
  return `<section class="zone">
    <div class="zone-header"><h2>${emoji} ${esc(titel)}</h2><span class="decision">${esc(decision)}</span></div>
    <div id="${innerId}"></div>
  </section>`;
}

function renderDetailNav(el, activeKey, intern) {
  el.innerHTML = DETAIL_VOLGORDE
    .filter(d => (!d.intern || intern) && (!d.modulesTegel || (typeof moduleOverzichtBeschikbaar === "function" && moduleOverzichtBeschikbaar())))
    .map(d =>
    `<a href="#detail/${d.key}" class="${d.key === activeKey ? "actief" : ""}">${d.emoji} ${esc(d.titel)}</a>`
  ).join("");
}

function renderDetailAdoptiescore(el, adopt, periodWeeks) {
  const rows = adopt.componenten.map(c => {
    if (!c.berekenbaar) {
      return `<div class="card signaal-grijs"><div class="kop">${esc(c.label)}</div><div class="getal">n.v.t.</div><div class="detail">Niet te berekenen: ${esc(c.reden)}</div></div>`;
    }
    return `<div class="card"><div class="kop">${esc(c.label)}</div><div class="getal">${Math.round(c.waarde)}%</div><div class="detail">${subscoreDetail(c)}</div></div>`;
  }).join("");
  const berekenbaar = adopt.componenten.filter(c => c.berekenbaar);
  const som = berekenbaar.map(c => Math.round(c.waarde)).join(" + ");
  el.innerHTML = `
    <p>Het <strong>ritme van je team</strong> (voorheen: de adoptiescore) is het <strong>ongewogen gemiddelde</strong> van drie subscores, elk 0–100, over de gekozen periode (${periodWeeks} weken). Ontbreekt de bron voor een subscore, dan telt hij niet mee in het gemiddelde — nooit als 0.</p>
    <div class="grid-9">${rows}</div>
    <p class="footnote"><strong>Formules:</strong><br>
    Ritme = weken met minstens één spoor (rij met een datum in Dagverslagen, Lessen &amp; Inzichten, Interacties of Content Kalender) ÷ aantal weken in de periode.<br>
    Breedte = domeinen met minstens één rij ÷ 15 canonieke domeinen uit de registry.<br>
    Opvolging = acties met verstreken deadline én status "Klaar" ÷ acties met verstreken deadline.</p>
    <p class="footnote">${berekenbaar.length ? `Met de hand na te rekenen: (${som}) / ${berekenbaar.length} = ${adopt.adoptiescore}%.` : "Geen van de subscores is berekenbaar in deze bundel."}</p>`;
}

function renderDetailTijdwinst(el, tijdwinst) {
  if (!tijdwinst.berekenbaar) {
    el.innerHTML = `<div class="card signaal-grijs"><div class="kop">Geschatte tijdwinst</div><div class="getal">n.v.t.</div><div class="detail">Geen Acties-domein aanwezig in deze bundel — er zijn geen afgeronde acties om op te tellen.</div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="card" style="max-width:420px;">
      <div class="kop">Geschatte tijdwinst</div>
      <div class="getal">${nlGetal(tijdwinst.uren, 1)} uur</div>
      <div class="detail">${tijdwinst.afgerond} afgeronde acties × ${tijdwinst.minutenPerActie} min/actie = ${nlGetal(tijdwinst.minuten)} min</div>
    </div>
    <p class="footnote"><strong>Dit is een schatting op basis van je eigen aanname, geen meting.</strong> Dit dashboard kan niet zien hoeveel tijd een actie werkelijk kost of zou hebben gekost zonder het team. Het getal is uitsluitend: het aantal afgeronde acties in de bundel, vermenigvuldigd met de minuten-per-actie die jij hierboven instelt (standaard 25). Verzet de instelling gerust — de som past zich meteen aan, zodat je altijd kunt narekenen waar het getal vandaan komt.</p>
    <p class="footnote">Herkomst: domein Acties, veld Status = "Klaar", totaal in de bundel (geen aanmaakdatum in dit domein om op periode te filteren).</p>`;
}

// ── Correctievrij (i25) — tekstjes voor de KPI-tegel ─────────────────
function correctievrijKpi(cv) {
  if (!cv || !cv.aanwezig) {
    return { getal: "n.v.t.", label: cv && cv.reden ? cv.reden : "Niet beschikbaar in deze bundel.", gate: "Gate f19: niet te bepalen" };
  }
  const berekenbaar = cv.pct !== null;
  const getal = berekenbaar ? `${Math.round(cv.pct)}%` : "n.v.t.";
  const label = berekenbaar
    ? `${cv.autonoom - cv.gecorrigeerd} van ${cv.autonoom} autonoom afgeronde acties zonder correctie · laatste ${cv.vensterDagen} dagen`
    : (cv.reden || "niet te berekenen");
  const g = cv.gate;
  const gate = g.gehaald
    ? `Gate f19: gehaald ✓ (${g.wekenGehaald}/${g.wekenVereist} weken ≥ ${cv.drempel}%)`
    : `Gate f19: nog niet — ${g.wekenGehaald}/${g.wekenVereist} weken ≥ ${cv.drempel}%`;
  return { getal, label, gate };
}

function renderDetailCorrectievrij(el, cv) {
  if (!cv || !cv.aanwezig) {
    el.innerHTML = `<div class="card signaal-grijs"><div class="kop">Correctievrij</div><div class="getal">n.v.t.</div><div class="detail">${esc(cv && cv.reden ? cv.reden : "Niet beschikbaar in deze bundel.")}</div></div>
      <p class="footnote">Vanaf registry 1.34.0 krijgt het domein Acties de velden <em>Afgerond door</em>, <em>Afgerond op</em>, <em>Gecorrigeerd</em> en <em>Correctie</em>. Zodra die gevuld zijn (rijenroute) of de Coördinator het correctievrij-blok meelevert (metricsroute), verschijnt dit percentage vanzelf.</p>`;
    return;
  }
  const kpi = correctievrijKpi(cv);
  const g = cv.gate;
  const gateKlasse = g.gehaald ? "signaal-groen" : "signaal-oranje";
  const gateTekst = g.gehaald
    ? `De laatste ${g.wekenVereist} afgesloten weken zaten elk op of boven ${cv.drempel}% met minstens één autonoom afgeronde actie.`
    : `Nog niet gehaald: ${g.reden || "onbekende reden"}. Nodig: ${g.wekenVereist} aaneengesloten afgesloten weken, elk met autonoom werk én ≥ ${cv.drempel}%.`;

  const rijen = cv.weken.map(w => `<tr>
      <td>${esc(w.label)}</td>
      <td>${esc(w.autonoom)}</td>
      <td>${esc(w.gecorrigeerd)}</td>
      <td>${w.pct === null ? "—" : esc(Math.round(w.pct)) + "%"}</td>
      <td>${w.afgesloten ? "afgesloten" : "lopend"}</td>
    </tr>`).join("");

  el.innerHTML = `
    <p>Het <strong>correctievrij-percentage</strong> is de succesmaat van f9 en de gate voor f19: het aandeel acties dat een agent <strong>autonoom</strong> heeft afgerond (werkronde + kwaliteitscontrole, daarna zelf op "Klaar" gezet) en dat daarna <strong>niet door een mens is gecorrigeerd</strong>.</p>
    <div class="grid-9">
      <div class="card"><div class="kop">Correctievrij</div><div class="getal">${esc(kpi.getal)}</div><div class="detail">${esc(kpi.label)}</div></div>
      <div class="card"><div class="kop">Autonoom afgerond</div><div class="getal">${esc(cv.autonoom)}</div><div class="detail">acties met "Afgerond door" gevuld en "Afgerond op" in de laatste ${esc(cv.vensterDagen)} dagen</div></div>
      <div class="card"><div class="kop">Gecorrigeerd</div><div class="getal">${esc(cv.gecorrigeerd)}</div><div class="detail">waarvan ${esc(cv.heropend)} heropend (status niet meer "Klaar")</div></div>
      <div class="card ${gateKlasse}"><div class="kop">Gate f19</div><div class="getal">${g.gehaald ? "gehaald ✓" : "nog niet"}</div><div class="detail">${esc(g.wekenGehaald)}/${esc(g.wekenVereist)} weken ≥ ${esc(cv.drempel)}% · ${esc(gateTekst)}</div></div>
    </div>
    <h3>Per kalenderweek (maandag = weekstart)</h3>
    <div class="tabel-scroll"><table class="detail-table">
      <thead><tr><th>Week van</th><th>Autonoom afgerond</th><th>Gecorrigeerd</th><th>Correctievrij</th><th>Status</th></tr></thead>
      <tbody>${rijen || `<tr><td colspan="5">Geen weekgegevens in deze bundel.</td></tr>`}</tbody>
    </table></div>
    <p class="footnote"><strong>Definities.</strong> <em>Autonoom afgerond</em> = een agent zette de actie zelf op "Klaar" nadat de kwaliteitscontrole akkoord gaf; het veld <em>Afgerond door</em> draagt dan de agentnaam en <em>Afgerond op</em> de datum. <em>Gecorrigeerd</em> = een mens vinkte daarna <em>Gecorrigeerd</em> aan (met de reden in <em>Correctie</em>) óf heropende de actie (status niet meer "Klaar"). Een afkeuring door de kwaliteitscontrole vóór de afronding telt <strong>niet</strong> als correctie — dat is het normale werkproces. Het venster is de laatste ${esc(cv.vensterDagen)} dagen tot en met vandaag; de weektabel telt alle autonoom afgeronde acties per kalenderweek.</p>
    <p class="footnote"><strong>Gate f19</strong> (fase 1 en verder): ${esc(g.wekenVereist)} aaneengesloten <em>afgesloten</em> kalenderweken (weekstart + 7 dagen ≤ vandaag), elk met minstens één autonoom afgeronde actie en een weekpercentage ≥ ${esc(cv.drempel)}%. De lopende week telt nog niet mee.</p>
    ${cv.opmerking ? `<p class="footnote">Opmerking van de Coördinator: ${esc(cv.opmerking)}</p>` : ""}
    <p class="footnote">Met de hand na te rekenen: (a − g) / a — hier (${esc(cv.autonoom)} − ${esc(cv.gecorrigeerd)}) / ${esc(cv.autonoom)}${cv.pct === null ? " (geen noemer)" : ` = ${esc(Math.round(cv.pct))}%`}.</p>`;
}

function renderDetailActiviteit(el, activiteit, periodWeeks) {
  if (activiteit.geenEnkeleBron) {
    el.innerHTML = `<div class="card signaal-grijs"><div class="kop">Geen brondomeinen</div><div class="detail">Geen van Dagverslagen, Lessen &amp; Inzichten, Interacties of Content Kalender aanwezig in deze bundel.</div></div>`;
    return;
  }
  const seriesKeys = ["interacties", "dagverslagen", "lessen_inzichten", "content_kalender"];
  const seriesLabels = seriesKeys.map(k => RITME_SERIE_LABEL[k]);
  const chart = buildStackedBarChart({ buckets: activiteit.buckets, seriesKeys, seriesLabels, height: 280 });
  const tabelRijen = activiteit.buckets.map(b =>
    `<tr><td>${esc(b.label)}</td><td>${b.values.interacties}</td><td>${b.values.dagverslagen}</td><td>${b.values.lessen_inzichten}</td><td>${b.values.content_kalender}</td><td><strong>${b.totaal}</strong>${b.leeg ? " — geen" : ""}</td></tr>`
  ).join("");
  el.innerHTML = `<div class="chart-scroll">${chart}</div>
    <div class="tabel-scroll"><table class="detail-table">
      <thead><tr><th>Week van</th><th>Interacties</th><th>Dagverslagen</th><th>Lessen</th><th>Content</th><th>Totaal</th></tr></thead>
      <tbody>${tabelRijen}</tbody>
    </table></div>
    <p class="footnote">Periode: laatste ${periodWeeks} weken tot en met vandaag. Bronnen in deze bundel: ${activiteit.aanwezigeBronnen.map(esc).join(", ") || "geen"}.</p>`;
}

function renderDetailGebruik(el, z3, schema, today, periodDays, agentUsage, ctx) {
  if (agentUsage.status !== "ok") {
    el.innerHTML = `<div class="grijs-blok">
      <div class="grijs-kop">❔ Gebruik per agent niet af te leiden</div>
      <div class="grijs-tekst">${esc(agentUsage.reden)}</div>
    </div>
    ${ctx ? agentSuggestiesHtml(ctx) : ""}`;
    return;
  }
  renderZone3(el, z3, schema, today, periodDays);
  // De sectiekop vraagt "welke agent laat ik links liggen, en waarom?" — dit
  // is het antwoord, niet de ranglijst erboven.
  if (ctx) el.insertAdjacentHTML("beforeend", agentSuggestiesHtml(ctx));
}

// ── Detail per agent (f4: doorklik per agent) ─────────────────────────
function renderDetailAgent(el, slug, ctx) {
  const agent = ctx.schema.agents.find(a => a.slug === slug);
  if (!agent) { el.innerHTML = `<p>Onbekende agent.</p>`; return; }
  const perMod = (ctx.z3.perModule && ctx.z3.perModule[agent.module]) || [];
  const t = perMod.find(a => a.slug === slug) || { geenSpoor: true, aantalPeriode: 0, aantalTotaal: 0, laatst: null };
  const modNaam = (ctx.schema.modules[agent.module] && ctx.schema.modules[agent.module].naam) || agent.module;

  const cards = `<div class="grid-9">
    <div class="card"><div class="kop">Sporen in de periode</div><div class="getal">${t.aantalPeriode}</div><div class="detail">laatste ${ctx.periodDays} dagen</div></div>
    <div class="card"><div class="kop">Sporen totaal</div><div class="getal">${t.aantalTotaal}</div><div class="detail">in de hele bundel</div></div>
    <div class="card${t.laatst ? "" : " signaal-grijs"}"><div class="kop">Laatste spoor</div><div class="getal">${t.laatst ? fmtDate(t.laatst) : "—"}</div><div class="detail">${t.laatst ? relAge(t.laatst, ctx.today) : "geen spoor met datum gevonden"}</div></div>
  </div>`;

  // Bij een rijenroute kunnen we de onderliggende rijen van deze agent laten
  // zien; het metricsbestand draagt alleen totalen — dat zeggen we er dan bij.
  let lijsten = "";
  const bundle = ctx.bundle;
  if (bundle && bundle.kind !== "metrics") {
    const MAX = 15;
    function rijenVan(domeinKey, veldDatum, veldTitel) {
      const dom = bundle.domains && bundle.domains[domeinKey];
      if (!dom) return null;
      return dom.rows
        .filter(r => matchAgentValue(getField(r, "Agent"), ctx.agentLookup) === slug)
        .map(r => ({ titel: String(getField(r, veldTitel) || "(zonder titel)"), datum: parseDateField(getField(r, veldDatum)), status: getField(r, "Status") }))
        .sort((a, b) => (b.datum ? b.datum.getTime() : 0) - (a.datum ? a.datum.getTime() : 0));
    }
    const acties = rijenVan("acties", "Deadline", "Actie");
    const lessen = rijenVan("lessen_inzichten", "Datum", "Les");
    function lijstHtml(kop, items, datumLabel) {
      if (items === null) return "";
      if (!items.length) return `<h3>${kop}</h3><p class="footnote">Geen rijen van deze agent in dit domein.</p>`;
      const rows = items.slice(0, MAX).map(i =>
        `<tr><td>${esc(i.titel)}</td><td>${i.status ? esc(String(i.status)) : ""}</td><td>${i.datum ? fmtDate(i.datum) : "—"}</td></tr>`).join("");
      const rest = items.length > MAX ? `<p class="footnote">… en nog ${items.length - MAX} — zie de bron zelf.</p>` : "";
      return `<h3>${kop} (${items.length})</h3>
        <div class="tabel-scroll"><table class="detail-table"><thead><tr><th>Titel</th><th>Status</th><th>${datumLabel}</th></tr></thead><tbody>${rows}</tbody></table></div>${rest}`;
    }
    lijsten = lijstHtml("Acties van deze agent", acties, "Deadline") + lijstHtml("Lessen van deze agent", lessen, "Datum");
  } else {
    lijsten = `<p class="footnote">Deze bundel is een kant-en-klaar metricsbestand: het draagt per agent alleen de totalen hierboven, geen losse rijen. Wil je de onderliggende acties en lessen van deze agent zien, dan moeten de werkdata-rijen in je werkruimte staan (in plaats van alleen een dagelijks metricsbestand).</p>`;
  }

  el.innerHTML = `
    <p><strong>${agent.emoji} ${esc(agent.displayName)}</strong> · module ${esc(modNaam)}</p>
    ${cards}
    ${lijsten}
    <p class="footnote">Sporen komen uit Acties (veld Agent, tijdstip via Deadline) en Lessen &amp; Inzichten (veld Agent, veld Datum). "Geen spoor" ≠ "nooit ingezet": een agent die wél draaide maar niets wegschreef, is hiermee niet te onderscheiden van een agent die stilstond.</p>
    <a class="detail-link" data-goto="gebruik">← Alle agents, per module</a>`;
}

// ── Router ────────────────────────────────────────────────────────────
// Vier top-level tabs plus de bestaande detailroutes, die ongewijzigd
// blijven: elke bestaande #/detail/…-link (en de f4-agentdoorklik) werkt
// precies zoals hij werkte. Geeft altijd {soort, …} terug.
//   {soort:"tab", tab}                 #/ · #/team · #/data · #/prestaties
//   {soort:"data", domein}             #/data/<domein>
//   {soort:"detail", key, tab}         #/detail/<key> · #/detail/agent/<slug>
function bepaalActieveView() {
  const hash = window.location.hash || "";

  const ag = hash.match(/^#\/?detail\/agent\/([a-z0-9-]+)/);
  if (ag) return { soort: "detail", key: "agent/" + ag[1], tab: "prestaties" };

  const m = hash.match(/^#\/?detail\/([a-z]+)/);
  if (m && DETAIL_VOLGORDE.some(d => d.key === m[1])) {
    return { soort: "detail", key: m[1], tab: DETAIL_TAB[m[1]] || "vandaag" };
  }

  const dom = hash.match(/^#\/data\/([a-z0-9_]+)/);
  if (dom) return { soort: "data", domein: dom[1], tab: "data" };

  const tab = hash.match(/^#\/([a-z]+)/);
  if (tab && TABS.some(t => t.key === tab[1])) return { soort: "tab", tab: tab[1] };

  return { soort: "tab", tab: "vandaag" };
}
