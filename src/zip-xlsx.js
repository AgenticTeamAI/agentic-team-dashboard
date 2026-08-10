/* Minimale, dependency-vrije ZIP + XLSX-lezer voor de browser (en Node voor
 * tests). Geen externe library nodig: XLSX is een ZIP van XML-bestanden, en
 * moderne browsers kunnen 'deflate-raw' decomprimeren via de ingebouwde
 * DecompressionStream — daarmee is een eigen inflate-implementatie
 * overbodig. Werkt zonder netwerk, dus ook prima onder file://.
 */

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function readUInt32LE(dv, off) { return dv.getUint32(off, true); }
function readUInt16LE(dv, off) { return dv.getUint16(off, true); }

/** Leest de centrale directory van een ZIP-bestand en geeft per entry de
 * ruwe (nog gecomprimeerde) data terug. */
async function parseZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  // Zoek EOCD-record (0x06054b50) vanaf het einde.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65557; i--) {
    if (readUInt32LE(dv, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("Geen geldig ZIP-bestand (EOCD niet gevonden) — is dit echt een .xlsx?");

  const totalEntries = readUInt16LE(dv, eocd + 10);
  const cdOffset = readUInt32LE(dv, eocd + 16);

  const entries = {};
  let ptr = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (readUInt32LE(dv, ptr) !== 0x02014b50) throw new Error("Centrale ZIP-directory is beschadigd of onverwacht formaat.");
    const compMethod = readUInt16LE(dv, ptr + 10);
    const compSize = readUInt32LE(dv, ptr + 20);
    const uncompSize = readUInt32LE(dv, ptr + 24);
    const nameLen = readUInt16LE(dv, ptr + 28);
    const extraLen = readUInt16LE(dv, ptr + 30);
    const commentLen = readUInt16LE(dv, ptr + 32);
    const localHeaderOffset = readUInt32LE(dv, ptr + 42);
    const nameBytes = bytes.slice(ptr + 46, ptr + 46 + nameLen);
    const filename = new TextDecoder("utf-8").decode(nameBytes);

    entries[filename] = { compMethod, compSize, uncompSize, localHeaderOffset };
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  const result = {};
  for (const [filename, meta] of Object.entries(entries)) {
    const lh = meta.localHeaderOffset;
    if (readUInt32LE(dv, lh) !== 0x04034b50) throw new Error(`Lokale ZIP-header ontbreekt voor ${filename}.`);
    const lNameLen = readUInt16LE(dv, lh + 26);
    const lExtraLen = readUInt16LE(dv, lh + 28);
    const dataStart = lh + 30 + lNameLen + lExtraLen;
    const compData = bytes.slice(dataStart, dataStart + meta.compSize);
    let raw;
    if (meta.compMethod === 0) {
      raw = compData;
    } else if (meta.compMethod === 8) {
      raw = await inflateRaw(compData);
    } else {
      throw new Error(`Onbekende ZIP-compressiemethode (${meta.compMethod}) voor ${filename} — kan dit bestand niet lezen.`);
    }
    result[filename] = raw;
  }
  return result;
}

function xmlText(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

/** Zeer beperkte XML-attribuutlezer — geen volwaardige XML-parser nodig
 * voor de paar tags die xlsx-sheets gebruiken. */
function parseXmlLite(xml) {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function colLetterToIndex(ref) {
  const m = ref.match(/^([A-Z]+)/);
  const letters = m[1];
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

/** Excel-datumserienummer (dagen sinds 1899-12-30) naar ISO-datumstring. */
function excelSerialToISO(serial) {
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + serial * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Parseert een xlsx ArrayBuffer naar { sheetNaam: [[cel,...], ...] }.
 * Eerste rij van elke sheet is de header-rij. dateFieldNames is een Set met
 * kolomnamen (headers) die als 'datum' bekendstaan uit het schema — alleen
 * daarvoor wordt een numerieke cel als Excel-datumserienummer geïnterpreteerd. */
async function parseXlsx(arrayBuffer) {
  const files = await parseZipEntries(arrayBuffer);
  if (!files["xl/workbook.xml"]) throw new Error("Geen xl/workbook.xml gevonden — dit lijkt geen geldig .xlsx-bestand.");

  const workbookXml = parseXmlLite(xmlText(files["xl/workbook.xml"]));
  const relsXml = files["xl/_rels/workbook.xml.rels"]
    ? parseXmlLite(xmlText(files["xl/_rels/workbook.xml.rels"]))
    : null;

  const relMap = {};
  if (relsXml) {
    for (const rel of relsXml.getElementsByTagName("Relationship")) {
      relMap[rel.getAttribute("Id")] = rel.getAttribute("Target");
    }
  }

  const sheets = [];
  for (const sheetEl of workbookXml.getElementsByTagName("sheet")) {
    const name = sheetEl.getAttribute("name");
    const rId = sheetEl.getAttribute("r:id") || sheetEl.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    let target = relMap[rId];
    if (!target) continue;
    if (!target.startsWith("worksheets/")) target = "worksheets/" + target.split("/").pop();
    sheets.push({ name, path: "xl/" + target });
  }

  let sharedStrings = [];
  if (files["xl/sharedStrings.xml"]) {
    const ssXml = parseXmlLite(xmlText(files["xl/sharedStrings.xml"]));
    for (const si of ssXml.getElementsByTagName("si")) {
      // <si> kan meerdere <t> hebben bij rich text (per run) — concateneren.
      const parts = [];
      for (const t of si.getElementsByTagName("t")) parts.push(t.textContent);
      sharedStrings.push(parts.join(""));
    }
  }

  const out = {};
  for (const { name, path } of sheets) {
    if (!files[path]) continue;
    const sheetXml = parseXmlLite(xmlText(files[path]));
    const rows = [];
    for (const rowEl of sheetXml.getElementsByTagName("row")) {
      const row = [];
      for (const c of rowEl.getElementsByTagName("c")) {
        const ref = c.getAttribute("r");
        const idx = ref ? colLetterToIndex(ref) : row.length;
        const type = c.getAttribute("t");
        let value = "";
        const vEl = c.getElementsByTagName("v")[0];
        const isEl = c.getElementsByTagName("is")[0];
        if (type === "s" && vEl) {
          value = sharedStrings[parseInt(vEl.textContent, 10)] ?? "";
        } else if (type === "str" && vEl) {
          value = vEl.textContent;
        } else if (type === "inlineStr" && isEl) {
          const t = isEl.getElementsByTagName("t")[0];
          value = t ? t.textContent : "";
        } else if (type === "b" && vEl) {
          value = vEl.textContent === "1";
        } else if (vEl) {
          value = vEl.textContent === "" ? "" : Number(vEl.textContent);
        }
        while (row.length < idx) row.push("");
        row[idx] = value;
      }
      rows.push(row);
    }
    out[name] = rows;
  }
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { parseZipEntries, parseXlsx, colLetterToIndex, excelSerialToISO };
}
