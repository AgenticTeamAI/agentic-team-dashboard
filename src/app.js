/* Wiring: bestandskeuze, periodeschakelaar, laden -> berekenen -> tonen,
 * en de hash-router tussen de homepage en de detailpagina's. Schrijft nooit
 * iets terug behalve, optioneel en lokaal, welke bundelroute/bestandsnaam
 * en welke minuten-per-actie-instelling je de laatste keer koos (geen
 * bundelinhoud) — zie rememberChoice()/rememberMinuten() onderaan. */

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

function renderLastUsed() {
  const el = document.getElementById("last-used");
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) { el.textContent = ""; return; }
    const { route, label, when } = JSON.parse(raw);
    const routeLabel = { excel: "Excel-werkboek", json: "data-map (JSON)", notion: "Notion-export-map", werkruimte: "Werkruimte (daglink)" }[route] || route;
    el.textContent = `Laatst gebruikt: ${routeLabel} — ${label} (${new Date(when).toLocaleString("nl-NL")})`;
  } catch (e) { el.textContent = ""; }
}

function setStatus(msg, isError) {
  const el = document.getElementById("status-line");
  el.textContent = msg || "";
  el.style.color = isError ? "var(--rood)" : "var(--grey)";
}

async function handleBundle(bundle, route, label) {
  currentBundle = bundle;
  rememberChoice(route, label);
  renderLastUsed();
  window.location.hash = ""; // terug naar de homepage bij een nieuw geladen bundel
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
      sporenTotaal: m.sporenTotaal, metricsMeta: m.meta, waarschuwingen: m.waarschuwingen,
    };
  }

  const periodWeeks = currentPeriodWeeks;
  const m = buildMetricsFromRowsBundle(bundle, schema, agentLookup, today, periodWeeks, currentMinutenPerActie);
  return {
    bundle, schema, agentLookup, today, periodWeeks: m.periodWeeks, periodDays: m.periodDays,
    z1: m.z1, z2: m.z2, z3: m.z3, z4: m.z4, z5: m.z5,
    activiteit: m.activiteit, adopt: m.adopt, tijdwinst: m.tijdwinst, agentUsage: m.agentUsage,
    sporenTotaal: m.sporenTotaal, metricsMeta: m.meta, waarschuwingen: m.waarschuwingen,
  };
}

function renderAll() {
  const bundle = currentBundle;
  const emptyStateEl = document.getElementById("empty-state");
  const homeEl = document.getElementById("home-view");
  const detailEl = document.getElementById("detail-view");
  const versionErrorEl = document.getElementById("version-error");
  const periodSelect = document.getElementById("period-select");
  if (!bundle) {
    emptyStateEl.style.display = "";
    homeEl.style.display = "none";
    detailEl.style.display = "none";
    versionErrorEl.style.display = "none";
    return;
  }
  emptyStateEl.style.display = "none";

  const ctx = buildContext();

  if (ctx.versionError) {
    // Geen dashboard tekenen op een bestand dat dit dashboard niet herkent
    // — wel duidelijk zeggen wat er aan de hand is en wat je eraan kunt
    // doen. Stil een verkeerde grafiek tekenen is erger dan niets tekenen.
    homeEl.style.display = "none";
    detailEl.style.display = "none";
    versionErrorEl.style.display = "";
    renderVersionError(versionErrorEl, ctx.versionError, bundle);
    document.getElementById("warnings-box").style.display = "none";
    document.getElementById("bundle-info").textContent = `Bundel: ${bundle.sourceLabel} (Notion-metricsbestand) — niet gelezen, zie melding hierboven.`;
    return;
  }
  versionErrorEl.style.display = "none";
  window.__dashboardCtx = ctx; // alleen al-berekende resultaten, geen nieuwe databron

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

  renderKpiTegels(document.getElementById("kpi-grid"), ctx);
  renderActiviteitPanel(document.getElementById("panel-activiteit-body"), ctx.activiteit, ctx.periodWeeks);
  renderAdoptieSubscores(document.getElementById("panel-adoptie-body"), ctx.adopt);
  renderAandachtTop5(document.getElementById("panel-aandacht-body"), ctx.z1);
  renderGebruikPanel(document.getElementById("panel-gebruik-body"), ctx.agentUsage);

  const warnEl = document.getElementById("warnings-box");
  const waarschuwingen = ctx.waarschuwingen || [];
  if (waarschuwingen.length) {
    warnEl.style.display = "";
    warnEl.innerHTML = `<div class="kop">Niet alles kon gelezen worden</div><ul style="margin:0;padding-left:1.1rem;">${waarschuwingen.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
  } else {
    warnEl.style.display = "none";
  }

  if (bundle.kind === "metrics") {
    const meta = ctx.metricsMeta;
    const gen = meta.gegenereerdOp && !isNaN(meta.gegenereerdOp.getTime()) ? meta.gegenereerdOp.toLocaleString("nl-NL") : "onbekend moment";
    const door = meta.door ? ` door ${meta.door}` : "";
    document.getElementById("bundle-info").textContent =
      `Bundel: ${meta.bronLabel} (Notion — metricsbestand v${METRICS_VERSION}) — gegenereerd op ${gen}${door}, ${meta.domeinenGevonden} domein(en) met tellingen.`;
  } else {
    document.getElementById("bundle-info").textContent =
      `Bundel: ${bundle.sourceLabel} (${{ excel: "Excel-werkboek", json: "data/*.json", notion: "Notion-export (rijen, oud formaat)", werkruimte: "live uit je werkruimte-instantie" }[bundle.source]}) — ${Object.keys(bundle.domains).length} domein(en) gevonden.`;
  }

  route();
}

function renderDetail(key) {
  const ctx = window.__dashboardCtx;
  if (!ctx) return;
  const meta = DETAIL_VOLGORDE.find(d => d.key === key);
  document.title = `${meta ? meta.titel : "Detail"} — Agentic Team Dashboard`;
  renderDetailNav(document.getElementById("detail-nav"), key);
  const body = document.getElementById("detail-body");
  body.innerHTML = "";

  const secties = {
    aandacht: () => [detailSectionHtml("Aandacht", "🎯", "Waar besteed ik vandaag mijn halfuur aan?", "detail-inner"), () => renderZone1(document.getElementById("detail-inner"), ctx.z1)],
    context: () => [detailSectionHtml("Contextgezondheid", "🧭", "Moet ik mijn bedrijfscontext bijwerken voordat ik het team weer aan het werk zet?", "detail-inner"), () => renderZone2(document.getElementById("detail-inner"), ctx.z2, ctx.today)],
    gebruik: () => [detailSectionHtml("Gebruik per agent", "👥", "Welke agent laat ik links liggen, en waarom?", "detail-inner"), () => renderDetailGebruik(document.getElementById("detail-inner"), ctx.z3, ctx.schema, ctx.today, ctx.periodDays, ctx.agentUsage)],
    opbrengst: () => [detailSectionHtml("Opbrengst", "💰", "Levert dit team genoeg op om het te blijven betalen?", "detail-inner"), () => renderZone4(document.getElementById("detail-inner"), ctx.z4, ctx.periodDays)],
    leren: () => [detailSectionHtml("Leren", "💡", "Wat weet dit team nu dat het vorige maand niet wist?", "detail-inner"), () => renderZone5(document.getElementById("detail-inner"), ctx.z5, ctx.periodDays)],
    adoptiescore: () => [detailSectionHtml("Adoptiescore — herkomst", "📊", "Klopt de adoptiescore, en kan ik hem zelf narekenen?", "detail-inner"), () => renderDetailAdoptiescore(document.getElementById("detail-inner"), ctx.adopt, ctx.periodWeeks)],
    tijdwinst: () => [detailSectionHtml("Geschatte tijdwinst — aanname", "⏱️", "Hoe komt dit dashboard aan het tijdwinst-getal, en wat is de aanname?", "detail-inner"), () => renderDetailTijdwinst(document.getElementById("detail-inner"), ctx.tijdwinst)],
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

function route() {
  const bundle = currentBundle;
  const homeEl = document.getElementById("home-view");
  const detailEl = document.getElementById("detail-view");
  if (!bundle) return;
  const key = bepaalActieveView();
  if (key) {
    homeEl.style.display = "none";
    detailEl.style.display = "";
    renderDetail(key);
    window.scrollTo(0, 0);
  } else {
    homeEl.style.display = "";
    detailEl.style.display = "none";
    document.title = "Agentic Team Dashboard";
  }
}

function wireNavigatie() {
  document.body.addEventListener("click", (e) => {
    if (e.target.closest("[data-stop-nav]")) return; // bv. het minuten-invoerveld
    const gotoEl = e.target.closest("[data-goto]");
    if (gotoEl) window.location.hash = `#/detail/${gotoEl.getAttribute("data-goto")}`;
  });
  document.body.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("kpi-tile")) {
      e.preventDefault();
      const gotoEl = e.target.closest("[data-goto]");
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

function wireInputs() {
  const excelInput = document.getElementById("input-excel");
  const jsonInput = document.getElementById("input-json");
  const notionInput = document.getElementById("input-notion");

  document.getElementById("btn-excel").addEventListener("click", () => excelInput.click());
  document.getElementById("btn-json").addEventListener("click", () => jsonInput.click());
  document.getElementById("btn-notion").addEventListener("click", () => notionInput.click());

  excelInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus(`${file.name} wordt gelezen…`);
    try {
      const bundle = await loadExcelBundle(file);
      await handleBundle(bundle, "excel", file.name);
      setStatus(`${file.name} geladen.`);
    } catch (err) {
      console.error(err);
      setStatus(`Kon ${file.name} niet lezen: ${err.message}`, true);
    }
  });

  jsonInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setStatus(`${files.length} bestand(en) worden gelezen…`);
    try {
      const bundle = await loadJsonBundle(files);
      const label = files[0].webkitRelativePath ? files[0].webkitRelativePath.split("/")[0] : `${files.length} bestanden`;
      await handleBundle(bundle, "json", label);
      setStatus(`${label} geladen.`);
    } catch (err) {
      console.error(err);
      setStatus(`Kon de data-map niet lezen: ${err.message}`, true);
    }
  });

  notionInput.addEventListener("change", async (e) => {
    const allFiles = Array.from(e.target.files || []);
    const jsonFiles = allFiles.filter(f => f.name.toLowerCase().endsWith(".json"));
    if (!jsonFiles.length) {
      setStatus("Geen .json-bestanden gevonden in de gekozen map.", true);
      return;
    }
    setStatus(`${jsonFiles.length} bestand(en) worden gelezen…`);
    try {
      // Eén los bestand kan onmogelijk het oude vijftien-bestanden-formaat
      // zijn — probeer het daarom eerst als het nieuwe metricsbestand
      // (route 3). Alleen als de vorm niet klopt (geen "versie"/"type"),
      // val terug op de oude rijenlezer — dat vangt ook het geval dat
      // iemand per ongeluk maar één bestand uit de oude exportmap koos.
      let handled = false;
      if (jsonFiles.length === 1) {
        let raw;
        try {
          raw = await readJsonFile(jsonFiles[0]);
        } catch (parseErr) {
          throw new Error(`${jsonFiles[0].name} is geen geldige JSON (${parseErr.message}).`);
        }
        if (looksLikeMetricsPayload(raw)) {
          const bundle = emptyBundle("notion", jsonFiles[0].name);
          bundle.kind = "metrics";
          bundle.metricsRaw = raw;
          await handleBundle(bundle, "notion", jsonFiles[0].name);
          setStatus(`${jsonFiles[0].name} gelezen als metricsbestand (Notion-route, kant-en-klare uitkomsten — geen rijen ingelezen).`);
          handled = true;
        }
      }
      if (!handled) {
        const bundle = await loadNotionExportBundle(jsonFiles);
        bundle.kind = "rows";
        const label = jsonFiles[0].webkitRelativePath ? jsonFiles[0].webkitRelativePath.split("/")[0] : `${jsonFiles.length} bestanden`;
        await handleBundle(bundle, "notion", label);
        setStatus(`${label} gelezen als losse-domeinen-export (oud formaat, ${jsonFiles.length} bestand(en)) — dit dashboard rekent de metrics lokaal uit de rijen, net als bij de Excel- en data-map-route.`);
      }
    } catch (err) {
      console.error(err);
      setStatus(`Kon de Notion-export niet lezen: ${err.message}`, true);
    }
  });

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

/* Route 4: opent iemand deze pagina via een daglink (of herlaadt hij binnen
 * dezelfde sessie), dan laden we de werkruimte-bundel vanzelf — er valt niets
 * te kiezen, de link wijst al naar zijn eigen instantie. De bestandsknoppen
 * blijven gewoon werken als alternatief. */
async function laadWerkruimte(daglink) {
  setStatus("Live gegevens uit je werkruimte worden opgehaald…");
  try {
    const bundle = await loadWerkruimteBundle(daglink);
    await handleBundle(bundle, "werkruimte", bundle.sourceLabel);
    setStatus(`${bundle.sourceLabel} geladen — live opgehaald met je daglink. Herladen = verversen.`);
  } catch (err) {
    console.error(err);
    if (err.daglinkVerlopen) vergeetDaglink();
    setStatus(err.message, true);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  restoreMinuten();
  wireInputs();
  wireNavigatie();
  renderLastUsed();
  renderAll();
  const daglink = restoreDaglink();
  if (daglink) laadWerkruimte(daglink);
});
