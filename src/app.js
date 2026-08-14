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
    const routeLabel = { excel: "Excel-werkboek", json: "data-map (JSON)", notion: "Notion-export-map" }[route] || route;
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

// Bouwt eenmalig alle berekeningen voor de huidige bundel/periode. Puur
// hergebruik van zones.js — deze functie zelf tekent niets.
function buildContext() {
  const bundle = currentBundle;
  const schema = getSchema();
  const agentLookup = buildAgentLookup();
  const today = new Date();
  const periodWeeks = currentPeriodWeeks;
  const periodDays = periodWeeks * 7;

  const z1ruw = computeZone1(bundle, agentLookup, today);
  const z2 = computeZone2(bundle, today);
  const z1 = voegContextToeAanAandacht(z1ruw, z2);
  const z3 = computeZone3(bundle, agentLookup, schema, today, periodDays);
  const z4 = computeZone4(bundle, today, periodDays);
  const z5 = computeZone5(bundle, today, periodDays);

  const activiteit = computeActiviteitPerWeek(bundle, today, periodWeeks);
  const adopt = computeAdoptiescore(bundle, schema, today, periodWeeks);
  const tijdwinst = computeTijdwinst(bundle, currentMinutenPerActie);
  const agentUsage = computeAgentGebruikRanking(bundle, agentLookup, schema, today, periodDays);
  const sporenTotaal = activiteit.buckets.reduce((s, b) => s + b.totaal, 0);

  return { bundle, schema, agentLookup, today, periodWeeks, periodDays, z1, z2, z3, z4, z5, activiteit, adopt, tijdwinst, agentUsage, sporenTotaal };
}

function renderAll() {
  const bundle = currentBundle;
  const emptyStateEl = document.getElementById("empty-state");
  const homeEl = document.getElementById("home-view");
  const detailEl = document.getElementById("detail-view");
  if (!bundle) {
    emptyStateEl.style.display = "";
    homeEl.style.display = "none";
    detailEl.style.display = "none";
    return;
  }
  emptyStateEl.style.display = "none";

  const ctx = buildContext();
  window.__dashboardCtx = ctx; // alleen al-berekende resultaten, geen nieuwe databron

  renderKpiTegels(document.getElementById("kpi-grid"), ctx);
  renderActiviteitPanel(document.getElementById("panel-activiteit-body"), ctx.activiteit, ctx.periodWeeks);
  renderAdoptieSubscores(document.getElementById("panel-adoptie-body"), ctx.adopt);
  renderAandachtTop5(document.getElementById("panel-aandacht-body"), ctx.z1);
  renderGebruikPanel(document.getElementById("panel-gebruik-body"), ctx.agentUsage);

  const warnEl = document.getElementById("warnings-box");
  if (bundle.waarschuwingen.length) {
    warnEl.style.display = "";
    warnEl.innerHTML = `<div class="kop">Niet alles kon gelezen worden</div><ul style="margin:0;padding-left:1.1rem;">${bundle.waarschuwingen.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
  } else {
    warnEl.style.display = "none";
  }

  document.getElementById("bundle-info").textContent =
    `Bundel: ${bundle.sourceLabel} (${{ excel: "Excel-werkboek", json: "data/*.json", notion: "Notion-export" }[bundle.source]}) — ${Object.keys(bundle.domains).length} domein(en) gevonden.`;

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
  window.addEventListener("hashchange", route);
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
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setStatus(`${files.length} bestand(en) worden gelezen…`);
    try {
      const bundle = await loadNotionExportBundle(files);
      const label = files[0].webkitRelativePath ? files[0].webkitRelativePath.split("/")[0] : `${files.length} bestanden`;
      await handleBundle(bundle, "notion", label);
      setStatus(`${label} geladen.`);
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

document.addEventListener("DOMContentLoaded", () => {
  restoreMinuten();
  wireInputs();
  wireNavigatie();
  renderLastUsed();
  renderAll();
});
