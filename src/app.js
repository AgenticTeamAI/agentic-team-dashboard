/* Wiring: bestandskeuze, periodeschakelaar, laden -> berekenen -> tonen.
 * Schrijft nooit iets terug behalve, optioneel, welke bundelroute en
 * bestandsnaam je de laatste keer koos (geen bundelinhoud) — zie
 * rememberChoice()/renderLastUsed() onderaan. */

const LS_KEY = "agentic-team-dashboard:laatst-gebruikt";

let currentBundle = null;
let currentPeriod = 30;

function rememberChoice(route, label) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ route, label, when: new Date().toISOString() }));
  } catch (e) { /* privémodus of quota — dan onthouden we het gewoon niet */ }
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
  renderAll();
}

function renderAll() {
  const bundle = currentBundle;
  const emptyStateEl = document.getElementById("empty-state");
  const zonesEl = document.getElementById("zones");
  if (!bundle) {
    emptyStateEl.style.display = "";
    zonesEl.style.display = "none";
    return;
  }
  emptyStateEl.style.display = "none";
  zonesEl.style.display = "";

  const schema = getSchema();
  const agentLookup = buildAgentLookup();
  const today = new Date();

  const z1 = computeZone1(bundle, agentLookup, today);
  const z2 = computeZone2(bundle, today);
  const z3 = computeZone3(bundle, agentLookup, schema, today, currentPeriod);
  const z4 = computeZone4(bundle, today, currentPeriod);
  const z5 = computeZone5(bundle, today, currentPeriod);

  renderZone1(document.getElementById("zone1-body"), z1);
  renderZone2(document.getElementById("zone2-body"), z2, today);
  renderZone3(document.getElementById("zone3-body"), z3, schema, today, currentPeriod);
  renderZone4(document.getElementById("zone4-body"), z4, currentPeriod);
  renderZone5(document.getElementById("zone5-body"), z5, currentPeriod);

  const warnEl = document.getElementById("warnings-box");
  if (bundle.waarschuwingen.length) {
    warnEl.style.display = "";
    warnEl.innerHTML = `<div class="kop">Niet alles kon gelezen worden</div><ul style="margin:0;padding-left:1.1rem;">${bundle.waarschuwingen.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
  } else {
    warnEl.style.display = "none";
  }

  document.getElementById("bundle-info").textContent =
    `Bundel: ${bundle.sourceLabel} (${{ excel: "Excel-werkboek", json: "data/*.json", notion: "Notion-export" }[bundle.source]}) — ${Object.keys(bundle.domains).length} domein(en) gevonden.`;
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
    currentPeriod = parseInt(e.target.value, 10);
    if (currentBundle) renderAll();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireInputs();
  renderLastUsed();
  renderAll();
});
