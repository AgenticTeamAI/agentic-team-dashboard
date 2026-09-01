/* Wiring: daglink -> werkruimte laden -> berekenen -> tonen, de
 * periodeschakelaar en de hash-router tussen de vier tabs (Vandaag · Team ·
 * Data · Prestaties) en de detailpagina's. Schrijft nooit iets terug behalve,
 * optioneel en lokaal, wanneer je de laatste keer laadde en welke
 * minuten-per-actie-instelling je koos (geen bundelinhoud) — zie
 * rememberChoice()/rememberMinuten(). */

const LS_KEY = "agentic-team-dashboard:laatst-gebruikt";
const LS_MINUTEN_KEY = "agentic-team-dashboard:minuten-per-actie";

let currentBundle = null;
let currentPeriodWeeks = 12;
let currentMinutenPerActie = 25;

function rememberChoice(route, label) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ route, label, when: new Date().toISOString() }));
  } catch (e) { /* privémodus of quota — dan onthouden we het gewoon niet */ }
}

function rememberMinuten(v) {
  try { localStorage.setItem(LS_MINUTEN_KEY, String(v)); } catch (e) { /* zie hierboven */ }
}

function restoreMinuten() {
  try {
    const raw = localStorage.getItem(LS_MINUTEN_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) currentMinutenPerActie = n;
    }
  } catch (e) { /* zie hierboven */ }
}

/* Alleen nog leesbaar in de herkomst-uitklap op de Prestaties-tab — dit is
 * systeeminfo, geen antwoord op "wat moet ik nu doen?". */
function leesLaatstGebruikt() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { route, label, when } = JSON.parse(raw);
    // p10: dezelfde route, twee ingangen (daglink of inloggen) — het label
    // noemt de bron, niet de ingang.
    const routeLabel = { werkruimte: "Werkruimte (live)" }[route] || route;
    return `${routeLabel} — ${label} (${new Date(when).toLocaleString("nl-NL")})`;
  } catch (e) { return null; }
}

async function handleBundle(bundle, route, label) {
  currentBundle = bundle;
  rememberChoice(route, label);
  window.location.hash = ""; // terug naar de Vandaag-tab bij een nieuw geladen bundel
  renderAll();
}

// Bouwt eenmalig de interne metricsvorm (zie metrics.js) voor de huidige
// bundel/periode, en pakt hem uit tot het platte ctx-object dat de
// renderlaag verwacht. Dit is de ENIGE plek die weet welke route de data
// heeft geleverd — render.js/homepage.js zien daarna alleen nog z1..z5,
// activiteit, adopt, tijdwinst, agentUsage, ongeacht herkomst.
function buildContext() {
  const bundle = currentBundle;
  const schema = getSchema();
  const agentLookup = buildAgentLookup();
  const today = new Date();

  if (bundle.kind === "metrics") {
    const result = parseNotionMetricsFile(bundle.metricsRaw, schema, today, currentMinutenPerActie);
    if (!result.ok) {
      // Nooit tekenen op een versie/vorm die dit dashboard niet herkent —
      // zie ONTWERP-wekelijkse-dashboardbijwerking.md, "Openstaand".
      return { versionError: result, bundle };
    }
    const m = result.metrics;
    return {
      bundle, schema, agentLookup, today,
      periodWeeks: m.periodWeeks, periodDays: m.periodDays,
      z1: m.z1, z2: m.z2, z3: m.z3, z4: m.z4, z5: m.z5,
      activiteit: m.activiteit, adopt: m.adopt, tijdwinst: m.tijdwinst, agentUsage: m.agentUsage,
      sporenTotaal: m.sporenTotaal, metricsMeta: m.meta, correctievrij: m.correctievrij,
      relaties: m.relaties || null,
      minutenPerActie: currentMinutenPerActie,
      intern: bundle.intern === true,
      // loader-waarschuwingen (bv. verouderde werkruimte-metrics) horen net
      // zo zichtbaar te zijn als parse-waarschuwingen
      waarschuwingen: (bundle.waarschuwingen || []).concat(m.waarschuwingen || []),
    };
  }

  const periodWeeks = currentPeriodWeeks;
  const m = buildMetricsFromRowsBundle(bundle, schema, agentLookup, today, periodWeeks, currentMinutenPerActie);
  return {
    bundle, schema, agentLookup, today, periodWeeks: m.periodWeeks, periodDays: m.periodDays,
    z1: m.z1, z2: m.z2, z3: m.z3, z4: m.z4, z5: m.z5,
    activiteit: m.activiteit, adopt: m.adopt, tijdwinst: m.tijdwinst, agentUsage: m.agentUsage,
    sporenTotaal: m.sporenTotaal, metricsMeta: m.meta, waarschuwingen: m.waarschuwingen, correctievrij: m.correctievrij,
    minutenPerActie: currentMinutenPerActie,
    intern: bundle.intern === true,
  };
}

const TAB_CONTAINERS = { vandaag: "tab-vandaag", team: "tab-team", data: "tab-data", prestaties: "tab-prestaties" };

/* De Team- en Data-tab hangen hun eigen click/input-listener aan hun
 * container (feedfilter, zoekveld). Die containers blijven bij navigatie
 * bestaan, dus vervangen we ze door een lege kopie: zo begint elke render
 * met precies nul listeners in plaats van er eentje bij. */
function versContainer(id) {
  const oud = document.getElementById(id);
  const nieuw = oud.cloneNode(false);
  oud.parentNode.replaceChild(nieuw, oud);
  return nieuw;
}

function verbergAlles() {
  for (const id of Object.values(TAB_CONTAINERS)) document.getElementById(id).style.display = "none";
  document.getElementById("detail-view").style.display = "none";
}

function renderAll() {
  const bundle = currentBundle;
  const emptyStateEl = document.getElementById("empty-state");
  const versionErrorEl = document.getElementById("version-error");
  const tabbarEl = document.getElementById("tabbar");
  const periodSelect = document.getElementById("period-select");

  if (!bundle) {
    emptyStateEl.style.display = "";
    tabbarEl.style.display = "none";
    verbergAlles();
    versionErrorEl.style.display = "none";
    return;
  }
  emptyStateEl.style.display = "none";

  const ctx = buildContext();

  if (ctx.versionError) {
    // Geen dashboard tekenen op een bestand dat dit dashboard niet herkent
    // — wel duidelijk zeggen wat er aan de hand is en wat je eraan kunt
    // doen. Stil een verkeerde grafiek tekenen is erger dan niets tekenen.
    verbergAlles();
    tabbarEl.style.display = "none";
    versionErrorEl.style.display = "";
    renderVersionError(versionErrorEl, ctx.versionError, bundle);
    document.getElementById("warnings-box").style.display = "none";
    return;
  }
  versionErrorEl.style.display = "none";
  window.__dashboardCtx = ctx; // alleen al-berekende resultaten, geen nieuwe databron
  tabbarEl.style.display = "";

  // Periode is bij een kant-en-klaar metricsbestand vastgelegd door wie het
  // genereerde (de Coördinator) — die keuze kan dit dashboard niet
  // herberekenen zonder de rijen te zien. De schakelaar gaat daarom uit en
  // toont waarom.
  if (bundle.kind === "metrics") {
    periodSelect.disabled = true;
    periodSelect.title = `Periode vastgelegd in het metricsbestand (${ctx.periodWeeks} weken) — bij deze route niet aanpasbaar zonder een nieuwe export.`;
  } else {
    periodSelect.disabled = false;
    periodSelect.title = "";
    periodSelect.value = String(currentPeriodWeeks);
  }

  // ── Tab 1 · Vandaag ──
  renderStatusregel(document.getElementById("statusregel"), ctx);
  renderPrivacyBlok(document.getElementById("privacy-blok"));
  renderAandachtTop5(document.getElementById("panel-aandacht-body"), ctx.z1);
  renderFeedPanel(document.getElementById("panel-feed-body"), ctx);
  renderOpbrengstKpis(document.getElementById("opbrengst-grid"), ctx);

  // ── Tab 4 · Prestaties ──
  renderPrestatieKpis(document.getElementById("kpi-grid"), ctx);
  renderAdoptieSubscores(document.getElementById("panel-adoptie-body"), ctx.adopt);
  renderActiviteitPanel(document.getElementById("panel-activiteit-body"), ctx.activiteit, ctx.periodWeeks);
  renderGebruikPanel(document.getElementById("panel-gebruik-body"), ctx.agentUsage);
  renderHerkomst(document.getElementById("herkomst-body"), ctx);

  const warnEl = document.getElementById("warnings-box");
  const waarschuwingen = ctx.waarschuwingen || [];
  if (waarschuwingen.length) {
    warnEl.style.display = "";
    warnEl.innerHTML = `<div class="kop">Niet alles kon gelezen worden</div><ul style="margin:0;padding-left:1.1rem;">${waarschuwingen.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
  } else {
    warnEl.style.display = "none";
  }

  route();
}

function renderDetail(key) {
  const ctx = window.__dashboardCtx;
  if (!ctx) return;

  // f4: doorklik per agent — key "agent/<slug>", geen vast DETAIL_VOLGORDE-item
  if (key.indexOf("agent/") === 0) {
    const slug = key.slice("agent/".length);
    const agent = ctx.schema.agents.find(a => a.slug === slug);
    document.title = `${agent ? agent.displayName : "Agent"} — Agentic Team Dashboard`;
    renderDetailNav(document.getElementById("detail-nav"), "gebruik", ctx.intern);
    const body = document.getElementById("detail-body");
    body.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.innerHTML = detailSectionHtml(agent ? agent.displayName : "Onbekende agent", agent ? agent.emoji : "👤", "Wat deed deze agent, en waar komt dat uit de data vandaan?", "detail-inner");
    body.appendChild(wrap.firstElementChild);
    renderDetailAgent(document.getElementById("detail-inner"), slug, ctx);
    return;
  }

  const meta = DETAIL_VOLGORDE.find(d => d.key === key);
  document.title = `${meta ? meta.titel : "Detail"} — Agentic Team Dashboard`;
  renderDetailNav(document.getElementById("detail-nav"), key, ctx.intern);
  const body = document.getElementById("detail-body");
  body.innerHTML = "";

  const secties = {
    feed: () => [detailSectionHtml("Teamfeed", "📣", "Wat doet mijn team, zonder dat ik erom hoef te vragen?", "detail-inner"), () => renderDetailFeed(document.getElementById("detail-inner"), ctx)],
    aandacht: () => [detailSectionHtml("Aandacht", "🎯", "Waar besteed ik vandaag mijn halfuur aan?", "detail-inner"), () => renderZone1(document.getElementById("detail-inner"), ctx.z1)],
    context: () => [detailSectionHtml("Contextgezondheid", "🧭", "Moet ik mijn bedrijfscontext bijwerken voordat ik het team weer aan het werk zet?", "detail-inner"), () => renderZone2(document.getElementById("detail-inner"), ctx.z2, ctx.today)],
    gebruik: () => [detailSectionHtml("Gebruik per agent", "👥", "Welke agent laat ik links liggen, en waarom?", "detail-inner"), () => renderDetailGebruik(document.getElementById("detail-inner"), ctx.z3, ctx.schema, ctx.today, ctx.periodDays, ctx.agentUsage)],
    opbrengst: () => [detailSectionHtml("Opbrengst", "💰", "Levert dit team genoeg op om het te blijven betalen?", "detail-inner"), () => renderZone4(document.getElementById("detail-inner"), ctx.z4, ctx.periodDays)],
    leren: () => [detailSectionHtml("Leren", "💡", "Wat weet dit team nu dat het vorige maand niet wist?", "detail-inner"), () => renderZone5(document.getElementById("detail-inner"), ctx.z5, ctx.periodDays)],
    adoptiescore: () => [detailSectionHtml("Ritme van je team — herkomst", "📊", "Klopt het ritme, en kan ik het zelf narekenen?", "detail-inner"), () => renderDetailAdoptiescore(document.getElementById("detail-inner"), ctx.adopt, ctx.periodWeeks)],
    tijdwinst: () => [detailSectionHtml("Geschatte tijdwinst — aanname", "⏱️", "Hoe komt dit dashboard aan het tijdwinst-getal, en wat is de aanname?", "detail-inner"), () => renderDetailTijdwinst(document.getElementById("detail-inner"), ctx.tijdwinst)],
    // Interne tegel: alleen met ctx.intern (werkruimte met DASHBOARD_INTERN=1).
    ...(ctx.intern ? { correctievrij: () => [detailSectionHtml("Correctievrij — de f19-gate", "🛡️", "Kan het team autonoom afronden zonder dat ik moet ingrijpen?", "detail-inner"), () => renderDetailCorrectievrij(document.getElementById("detail-inner"), ctx.correctievrij)] } : {}),
    activiteit: () => [detailSectionHtml("Activiteit per week", "📈", "Is er ritme, of zijn er gaten?", "detail-inner"), () => renderDetailActiviteit(document.getElementById("detail-inner"), ctx.activiteit, ctx.periodWeeks)],
  };

  const maker = secties[key];
  if (!maker) { body.innerHTML = `<p>Onbekende detailpagina.</p>`; return; }
  const [html, fill] = maker();
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  body.appendChild(wrap.firstElementChild);
  fill();
}

const TAB_TITELS = {
  vandaag: "Agentic Team Dashboard",
  team: "Je team — Agentic Team Dashboard",
  data: "Je gegevens — Agentic Team Dashboard",
  prestaties: "Prestaties — Agentic Team Dashboard",
};

function route() {
  const bundle = currentBundle;
  if (!bundle) return;
  // s31: niets tekenen op een bestand dat dit dashboard niet herkent. Zonder
  // deze guard toont een hashchange (bv. het leegmaken van het fragment na het
  // laden van een daglink) alsnog de lege pagina náást de versiefout.
  if (document.getElementById("version-error").style.display !== "none") {
    verbergAlles();
    return;
  }
  const ctx = window.__dashboardCtx;
  const view = bepaalActieveView();
  verbergAlles();
  renderTabbar(document.getElementById("tabbar"), view.tab);

  if (view.soort === "detail") {
    document.getElementById("detail-view").style.display = "";
    renderDetail(view.key);
    window.scrollTo(0, 0);
    return;
  }

  document.getElementById(TAB_CONTAINERS[view.tab]).style.display = "";
  document.title = TAB_TITELS[view.tab] || TAB_TITELS.vandaag;

  if (view.soort === "data") {
    renderDataDomein(versContainer("tab-data-body"), view.domein, ctx);
    window.scrollTo(0, 0);
    return;
  }
  if (view.tab === "team") renderDetailFeed(versContainer("tab-team-body"), ctx);
  if (view.tab === "data") { resetDataZoek(); renderDataOverzicht(versContainer("tab-data-body"), ctx); }
}

/* f30 — de download. De knop staat op de Data-tab en wordt bij elke render
 * opnieuw getekend, dus geen directe listener maar delegatie, net als de rest.
 * De statusregel is er niet voor de sier: een volle werkruimte kan tientallen
 * megabytes zijn en dan gebeurt er even niets zichtbaars. */
async function startExport(formaat, knop) {
  const status = document.getElementById("export-status");
  const knoppen = Array.from(document.querySelectorAll("[data-export]"));
  const zeg = (tekst) => { if (status) status.textContent = tekst; };
  // Zonder bron valt er niets op te halen. Dat kan alleen in de seconden
  // tussen tabwissel en geladen bundel, maar een knop die dan níets doet is
  // erger dan een knop die zegt waarom — dat leest als kapot.
  if (!huidigeBron) { zeg("Je werkruimte is nog niet geladen. Probeer het zo nog eens."); return; }
  knoppen.forEach((k) => { k.disabled = true; });
  zeg("Je export wordt klaargemaakt…");
  try {
    await downloadExport(huidigeBron, formaat);
    zeg("Klaar — je download staat in je downloadmap.");
  } catch (err) {
    console.error(err);
    zeg(err.message || "Het downloaden is niet gelukt.");
  } finally {
    knoppen.forEach((k) => { k.disabled = false; });
    if (knop) knop.focus();
  }
}

function wireNavigatie() {
  document.body.addEventListener("click", (e) => {
    if (e.target.closest("[data-stop-nav]")) return; // bv. het minuten-invoerveld
    const exportEl = e.target.closest("[data-export]");
    if (exportEl) {
      startExport(exportEl.getAttribute("data-export"), exportEl);
      return;
    }
    const domeinEl = e.target.closest("[data-data-domein]");
    if (domeinEl) { window.location.hash = `#/data/${domeinEl.getAttribute("data-data-domein")}`; return; }
    const gotoEl = e.target.closest("[data-goto]");
    if (gotoEl) window.location.hash = `#/detail/${gotoEl.getAttribute("data-goto")}`;
  });
  document.body.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = e.target;
    if (!t.classList) return;
    if (t.hasAttribute && t.hasAttribute("data-data-domein")) {
      e.preventDefault();
      window.location.hash = `#/data/${t.getAttribute("data-data-domein")}`;
      return;
    }
    if (t.classList.contains("kpi-tile")) {
      e.preventDefault();
      const gotoEl = t.closest("[data-goto]");
      if (gotoEl) window.location.hash = `#/detail/${gotoEl.getAttribute("data-goto")}`;
    }
  });
  window.addEventListener("hashchange", () => {
    // Een daglink aanklikken terwijl deze pagina al openstaat wijzigt alleen
    // het #fragment — de browser herlaadt dan niet. Zonder dit pad zou een
    // verse daglink op een open tabblad stilletjes niets doen.
    const daglink = parseDaglinkFragment(window.location.hash);
    if (daglink) {
      try { sessionStorage.setItem(DAGLINK_SS_KEY, JSON.stringify(daglink)); } catch (e) { /* privémodus */ }
      history.replaceState(null, "", window.location.pathname + window.location.search);
      laadWerkruimte(daglink);
      return;
    }
    route();
  });
}

/* f25 · mobiel: de kop klapt in zodra je gaat scrollen, zodat het scherm van
 * de inhoud is en niet van de merknaam. Puur cosmetisch — geen state. */
function wireKopInklappen() {
  let ingeklapt = false;
  const zet = () => {
    const moet = (window.scrollY || window.pageYOffset || 0) > 40;
    if (moet === ingeklapt) return;
    ingeklapt = moet;
    document.body.classList.toggle("kop-klein", moet);
  };
  window.addEventListener("scroll", zet, { passive: true });
  zet();
}

function wireInputs() {
  document.getElementById("period-select").addEventListener("change", (e) => {
    currentPeriodWeeks = parseInt(e.target.value, 10);
    if (currentBundle) renderAll();
  });

  document.body.addEventListener("change", (e) => {
    if (e.target.id === "input-minuten") {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v > 0) {
        currentMinutenPerActie = v;
        rememberMinuten(v);
        if (currentBundle) renderAll();
      }
    }
  });
}

/* Opent iemand deze pagina via een daglink (of herlaadt hij binnen dezelfde
 * sessie), dan laden we de werkruimte-bundel vanzelf — er valt niets te
 * kiezen, de link wijst al naar zijn eigen instantie. Zonder (of met een
 * verlopen) daglink blijft de lege staat staan met de uitleg. */
function toonLegeStaat(titel, tekst, { login = null } = {}) {
  document.getElementById("empty-state-titel").textContent = titel;
  document.getElementById("empty-state-tekst").textContent = tekst;
  // `login: null` = laat staan wat er stond; true/false zet hem expliciet.
  if (login !== null) toonLoginknop(login);
}

/* p10: de loginknop is er alleen op een build met OAUTH_DASHBOARD aan én op
 * een echte http(s)-pagina. Via file:// blijft hij weg — die pagina hoort nul
 * netwerkverkeer te doen, en een redirect naar dashboard.agentic-team.ai zou
 * daar sowieso niet terugkomen. */
function toonLoginknop(aan) {
  document.getElementById("empty-state-acties").style.display = aan && oauthMogelijk() ? "" : "none";
}

/* f30: de exportknop heeft dezelfde bron nodig als de bundel. Bewaren in
 * plaats van opnieuw afleiden — bij OAuth is dit object gedeeld en draagt het
 * een eventueel vernieuwd token. */
let huidigeBron = null;

async function laadWerkruimte(bron) {
  huidigeBron = bron;
  toonLegeStaat("Live gegevens uit je werkruimte worden opgehaald…", "", { login: false });
  try {
    const bundle = await loadWerkruimteBundle(bron);
    await handleBundle(bundle, "werkruimte", bundle.sourceLabel);
  } catch (err) {
    console.error(err);
    if (err.oauthVerlopen) {
      // De sessie is op; opnieuw inloggen is de enige uitweg, dus staat de
      // knop er meteen bij in plaats van een doodlopende melding.
      vergeetOauthSessie();
      resetOauthVernieuwing();
      toonLegeStaat("Kon je werkruimte niet laden", err.message, { login: true });
      return;
    }
    if (err.daglinkVerlopen) vergeetDaglink();
    toonLegeStaat("Kon je werkruimte niet laden",
      err.message + " Vraag je Coördinator om een nieuwe daglink.", { login: true });
  }
}

/* p10: de terugkomst van het consentscherm. Staat er een `code` in het
 * fragment, dan wisselen we die in vóórdat we een bron kiezen — de adresbalk
 * is daarna leeg en de sessie staat in sessionStorage. */
async function verwerkOauthRedirect() {
  const redirect = parseOauthRedirect(window.location.hash);
  if (!redirect) return null;
  toonLegeStaat("Je wordt ingelogd…", "", { login: false });
  try {
    const sessie = await voltooiOauthLogin(redirect);
    resetOauthVernieuwing();
    return oauthBron(sessie);
  } catch (err) {
    console.error(err);
    toonLegeStaat("Inloggen is niet gelukt", err.message, { login: true });
    return null;
  }
}

function wireLoginknop() {
  document.getElementById("btn-oauth-login").addEventListener("click", () => {
    toonLegeStaat("Je wordt doorgestuurd naar agentic-team.ai…", "", { login: false });
    startOauthLogin().catch((err) => {
      console.error(err);
      toonLegeStaat("Inloggen kon niet starten", err.message || String(err), { login: true });
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  restoreMinuten();
  wireInputs();
  wireNavigatie();
  wireKopInklappen();
  wireLoginknop();
  document.getElementById("empty-state-privacy").textContent = PRIVACY_LEGE_STAAT;
  renderAll();
  toonLoginknop(true);
  const uitRedirect = await verwerkOauthRedirect();
  const bron = uitRedirect || restoreBron();
  if (bron) laadWerkruimte(bron);
});
