/* Leest de drie bundelformaten in tot één uniforme structuur:
 *
 * bundle = {
 *   source: "excel" | "json" | "notion",
 *   sourceLabel: string,          // voor UI, bv. bestandsnaam
 *   domains: {
 *     [domainKey]: {
 *       aanwezig: true,
 *       rows: [ {...veld: waarde} ],
 *       staleAt: Date | null,     // wanneer dit specifieke domein "van" is
 *       herkomstLabel: string,    // bv. sheetnaam of bestandsnaam
 *     }
 *   },
 *   bedrijfscontext: null | "niet-ondersteund-door-bundel" | {...},
 *   waarschuwingen: [string],     // dingen die niet zeker herkend zijn
 * }
 *
 * "Niet aanwezig" (domein ontbreekt uit domains) betekent: dit dashboard
 * toont er niets over, in plaats van een leeg paneel te tonen — conform het
 * ontwerp ("toon wat je in de data vindt").
 */

function emptyBundle(source, sourceLabel) {
  return { source, sourceLabel, domains: {}, bedrijfscontext: null, waarschuwingen: [] };
}

// ── Route 1: Excel-werkboek ────────────────────────────────────────────
async function loadExcelBundle(file) {
  const buf = await file.arrayBuffer();
  const sheets = await parseXlsx(buf);
  const bundle = emptyBundle("excel", file.name);
  const staleAt = new Date(file.lastModified);

  for (const [sheetName, rows] of Object.entries(sheets)) {
    if (sheetName === "_schema") continue;
    if (sheetName.toLowerCase() === "bedrijfscontext") {
      bundle.bedrijfscontext = rowsToBedrijfscontext(rows, staleAt);
      continue;
    }
    if (!rows.length) continue;
    const headers = rows[0].map(String);
    let domainKey = domainKeyFromSheetName(sheetName);
    if (!domainKey) domainKey = domainKeyFromHeaders(headers);
    if (!domainKey) {
      bundle.waarschuwingen.push(`Tabblad "${sheetName}" kon niet aan een bekend datadomein gekoppeld worden — genegeerd.`);
      continue;
    }
    const dataRows = rows.slice(1).filter(r => r.some(c => c !== "" && c !== undefined));
    const objRows = dataRows.map(r => headerRowToObject(headers, r));
    bundle.domains[domainKey] = {
      aanwezig: true,
      rows: objRows,
      staleAt,
      herkomstLabel: `${file.name} — tabblad "${sheetName}"`,
    };
  }
  if (bundle.bedrijfscontext === null) bundle.bedrijfscontext = "niet-ondersteund-door-bundel";
  return bundle;
}

function headerRowToObject(headers, dataRow) {
  const obj = {};
  headers.forEach((h, i) => {
    if (!h) return;
    obj[h] = dataRow[i] ?? "";
  });
  return obj;
}

function rowsToBedrijfscontext(rows, fallbackStaleAt) {
  // Verwacht formaat: twee kolommen (sleutel, waarde) — vrij formaat, want
  // dit domein staat niet in de registry (zie S17). Beste-poging-lezer.
  const obj = {};
  for (const row of rows.slice(1)) {
    if (row[0]) obj[String(row[0])] = row[1];
  }
  obj.staleAt = obj.Laatst_bijgewerkt ? new Date(obj.Laatst_bijgewerkt) : fallbackStaleAt;
  return obj;
}

// ── Route 2 & 3: data/*.json en notion-export/*.json ───────────────────
// Zelfde bestandsvorm ({_schema, items:[...]} of een kale array), alleen de
// herkomst en het staleness-veld verschillen.
async function loadJsonLikeBundle(fileList, source) {
  const bundle = emptyBundle(source, source === "notion" ? "Notion-export" : "data/-map");
  for (const file of fileList) {
    if (!file.name.toLowerCase().endsWith(".json")) continue;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (e) {
      bundle.waarschuwingen.push(`${file.name} is geen geldige JSON — genegeerd (${e.message}).`);
      continue;
    }

    const isBedrijfscontext = file.name.replace(/\.json$/i, "").toLowerCase() === "bedrijfscontext";
    if (isBedrijfscontext) {
      // Voorkeursvolgorde voor "hoe oud is dit": het inhoudelijke veld
      // Laatst_bijgewerkt (het echte moment waarop iemand de context bijwerkte)
      // gaat boven het exportmoment, dat op zijn beurt boven de kale
      // bestandsdatum gaat.
      const staleAt = parsed.Laatst_bijgewerkt
        ? new Date(parsed.Laatst_bijgewerkt)
        : parsed._geexporteerd_op
          ? new Date(parsed._geexporteerd_op)
          : new Date(file.lastModified);
      bundle.bedrijfscontext = { ...parsed, staleAt };
      continue;
    }

    const domainKey = domainKeyFromFilename(file.name);
    if (!domainKey) {
      // Terugval: kijk of de inhoud zelf op basis van velden herkenbaar is.
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      if (items && items.length) {
        const guessed = domainKeyFromHeaders(Object.keys(items[0]));
        if (guessed) {
          registerJsonDomain(bundle, guessed, parsed, file, source);
          continue;
        }
      }
      bundle.waarschuwingen.push(`${file.name} kon niet aan een bekend datadomein gekoppeld worden — genegeerd.`);
      continue;
    }
    registerJsonDomain(bundle, domainKey, parsed, file, source);
  }
  if (bundle.bedrijfscontext === null) bundle.bedrijfscontext = "niet-ondersteund-door-bundel";
  return bundle;
}

function registerJsonDomain(bundle, domainKey, parsed, file, source) {
  const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
  let staleAt = new Date(file.lastModified);
  if (source === "notion" && parsed._geexporteerd_op) {
    staleAt = new Date(parsed._geexporteerd_op);
  }
  bundle.domains[domainKey] = {
    aanwezig: true,
    rows: items,
    staleAt,
    herkomstLabel: file.name,
  };
}

function loadJsonBundle(fileList) { return loadJsonLikeBundle(fileList, "json"); }
function loadNotionExportBundle(fileList) { return loadJsonLikeBundle(fileList, "notion"); }

if (typeof module !== "undefined") {
  module.exports = { loadExcelBundle, loadJsonBundle, loadNotionExportBundle, emptyBundle };
}
