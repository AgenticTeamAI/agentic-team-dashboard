/* Hulpfuncties rond schema/schema.generated.js (window.AGENTIC_TEAM_SCHEMA).
 * Puur, geen DOM-afhankelijkheid — apart getest. */

function normKey(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function kebabKey(key) {
  return key.replace(/_/g, "-");
}

// Bekende oudere/alternatieve bestandsnamen die niet (meer) letterlijk de
// registry-domeinsleutel volgen. Gevonden in clients/demo-fictief (een
// client-demo die dateert van vóór de registry-koppeling in Stream B) en in
// de voorbeeldnamen die het bron-intake-fase in core/base/orchestrator/
// prompt.md noemt ("lessen.json"). Puur voor herkenning bij het inlezen —
// het schema zelf blijft de registry-naam.
const LEGACY_FILENAME_ALIASES = {
  "prospects": "organisaties",
  "lessen": "lessen_inzichten",
  "content-pipeline": "content_kalender",
  "content-kalender": "content_kalender",
  "sales-funnel": "sales_funnel",
};

function domainKeyFromFilename(filename) {
  const base = filename.replace(/\.[a-z0-9]+$/i, "");
  const kebab = base.toLowerCase();
  if (LEGACY_FILENAME_ALIASES[kebab]) return LEGACY_FILENAME_ALIASES[kebab];
  const schema = getSchema();
  for (const key of Object.keys(schema.datadomeinen)) {
    // normKey strips alles behalve letters en cijfers, zodat zowel
    // "lessen-inzichten" als "lessen_inzichten" op de registrysleutel
    // matcht. De registry gebruikt underscores; een met de hand gemaakte
    // export volgt vaak die sleutelnamen letterlijk.
    if (normKey(key) === normKey(base)) return key;
  }
  return null;
}

function getSchema() {
  if (typeof window !== "undefined" && window.AGENTIC_TEAM_SCHEMA) return window.AGENTIC_TEAM_SCHEMA;
  if (typeof globalThis !== "undefined" && globalThis.AGENTIC_TEAM_SCHEMA) return globalThis.AGENTIC_TEAM_SCHEMA;
  throw new Error("Schema niet geladen (window.AGENTIC_TEAM_SCHEMA ontbreekt) — schema/schema.generated.js is niet ingeladen.");
}

/** Vindt een domeinsleutel op basis van een Excel-tabbladnaam (exacte match
 * op de registry "naam", of via headerherkenning als terugval). */
function domainKeyFromSheetName(sheetName) {
  const schema = getSchema();
  for (const [key, domein] of Object.entries(schema.datadomeinen)) {
    if (domein.naam === sheetName) return key;
  }
  return null;
}

/** Als de tabbladnaam niet 1-op-1 matcht: welk domein heeft de grootste
 * overlap met deze headerrij? Nodig omdat we de parser willen baseren op
 * wat we zien, niet alleen op de verwachte tabbladnaam. */
function domainKeyFromHeaders(headers) {
  const schema = getSchema();
  const normHeaders = new Set(headers.map(normKey));
  let best = null, bestScore = 0;
  for (const [key, domein] of Object.entries(schema.datadomeinen)) {
    const velden = domein.velden.map(v => normKey(v.naam));
    const overlap = velden.filter(v => normHeaders.has(v)).length;
    const score = overlap / velden.length;
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return bestScore >= 0.5 ? best : null;
}

/** Zoekt een veldwaarde op in een rij-object, eerst exact, dan genormaliseerd
 * (spaties/hoofdletters/underscores genegeerd) — zodat kleine afwijkingen in
 * kolomnamen (handmatig Excel-werk, oudere bestandsvorm) het lezen niet
 * meteen blokkeren. */
function getField(row, canonicalName) {
  if (row == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, canonicalName)) return row[canonicalName];
  if (!row.__normCache) {
    const cache = {};
    for (const k of Object.keys(row)) cache[normKey(k)] = row[k];
    Object.defineProperty(row, "__normCache", { value: cache, enumerable: false });
  }
  return row.__normCache[normKey(canonicalName)];
}

/** Bouwt een opzoektabel van allerlei schrijfwijzen van een agent (slug,
 * naam, "emoji naam") naar de canonieke slug — Notion/Excel-select-velden
 * kunnen de weergavenaam bevatten, niet per se de slug. */
function buildAgentLookup() {
  const schema = getSchema();
  const lookup = {};
  for (const agent of schema.agents) {
    const variants = [
      agent.slug,
      agent.displayName,
      `${agent.emoji} ${agent.displayName}`,
      agent.displayName.replace(/\s+/g, "-"),
    ];
    for (const v of variants) lookup[normKey(v)] = agent.slug;
  }
  return lookup;
}

function matchAgentValue(raw, lookup) {
  if (!raw) return null;
  return lookup[normKey(raw)] || null;
}

if (typeof module !== "undefined") {
  module.exports = {
    normKey, kebabKey, domainKeyFromFilename, domainKeyFromSheetName,
    domainKeyFromHeaders, getField, buildAgentLookup, matchAgentValue, getSchema,
    LEGACY_FILENAME_ALIASES,
  };
}
