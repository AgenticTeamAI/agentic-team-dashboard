/* Route 4: live uit de eigen werkruimte-instantie, via een daglink (f15/f18).
 *
 * De Coördinator geeft de klant bij de dagstart een prefilled URL:
 *   https://dashboard.agentic-team.ai#t=<token>&i=<instantie-url>
 * Het token is kortlevend (24 uur) en kan alleen lezen; het staat in het
 * #fragment, dat browsers nooit naar een server meesturen, en leeft daarna
 * uitsluitend in sessionStorage. De browser praat rechtstreeks met de eigen
 * werkruimte-instantie van de klant — er komt geen agentic-team.ai-backend
 * aan te pas, en de CSP van de pagina staat ook geen ander verkeer toe.
 *
 * Deze module levert dezelfde uniforme bundelvorm als bundle-loaders.js
 * (kind "rows"), zodat alles stroomafwaarts (zones, metrics, render) niet
 * hoeft te weten dat de rijen live zijn opgehaald in plaats van gekozen.
 */

const DAGLINK_SS_KEY = "agentic-team-dashboard:daglink";

/* Herkent de daglink-parameters in het fragment. Detailroutes ("#/detail/…")
 * beginnen met "#/" en blijven buiten schot. Geeft null bij alles wat geen
 * geldige daglink is — de pagina gedraagt zich dan als de gewone f4-variant. */
function parseDaglinkFragment(hash) {
  if (!hash || hash.startsWith("#/")) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("t");
  const instantieRaw = params.get("i");
  if (!token || !instantieRaw) return null;
  let url;
  try { url = new URL(instantieRaw); } catch (e) { return null; }
  // https verplicht; alleen localhost mag http (lokaal testen tegen een
  // mock-instantie — browsers behandelen localhost ook als secure context).
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) return null;
  return { token, instantieUrl: url.origin };
}

/* Fragment -> sessionStorage, en het token meteen uit de adresbalk halen
 * zodat het niet in de history of in een per ongeluk gedeelde URL belandt. */
function restoreDaglink() {
  const uitFragment = parseDaglinkFragment(window.location.hash);
  if (uitFragment) {
    try { sessionStorage.setItem(DAGLINK_SS_KEY, JSON.stringify(uitFragment)); } catch (e) { /* privémodus */ }
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return uitFragment;
  }
  try {
    const raw = sessionStorage.getItem(DAGLINK_SS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* privémodus of kapotte waarde — dan geen daglink */ }
  return null;
}

function vergeetDaglink() {
  try { sessionStorage.removeItem(DAGLINK_SS_KEY); } catch (e) { /* zie boven */ }
}

async function fetchWerkruimte(daglink, pad) {
  let res;
  try {
    res = await fetch(daglink.instantieUrl + pad, {
      headers: { Authorization: "Bearer " + daglink.token },
    });
  } catch (e) {
    throw new Error("Je werkruimte-instantie is niet bereikbaar. Controleer je verbinding of vraag je Coördinator om een nieuwe daglink.");
  }
  let body = null;
  try { body = await res.json(); } catch (e) { /* geen JSON — valt hieronder in de foutpaden */ }
  if (res.status === 401) {
    const err = new Error((body && body.fout) || "Deze dashboardlink is verlopen. Vraag je Coördinator om een nieuwe.");
    err.daglinkVerlopen = true;
    throw err;
  }
  if (!res.ok || body === null) {
    throw new Error((body && body.fout) || ("Je werkruimte gaf een onverwacht antwoord (status " + res.status + ")."));
  }
  return body;
}

function maxBijgewerkt(entries) {
  let laatst = null;
  for (const e of entries) {
    const dt = e && e.bijgewerkt ? new Date(e.bijgewerkt) : null;
    if (dt && !isNaN(dt.getTime()) && (!laatst || dt > laatst)) laatst = dt;
  }
  return laatst;
}

/* De werkruimte bewaart bedrijfscontext als losse entries (Onderdeel/Inhoud,
 * registry 1.24.1); zone 2 verwacht één sleutel->waarde-object met een Bron.
 * De bron ís hier de instantie zelf — de klant heeft zijn context daar staan. */
function bedrijfscontextUitEntries(entries, fallbackStaleAt) {
  if (!entries.length) return null; // geen context in de werkruimte -> zone 2 zegt "onbekend"
  const obj = { Bron: "je werkruimte-instantie (hosted)" };
  let laatst = null;
  for (const e of entries) {
    const d = e.data || {};
    if (d.Onderdeel) obj[String(d.Onderdeel)] = d.Inhoud;
    const dt = d.Bijgewerkt ? new Date(d.Bijgewerkt) : null;
    if (dt && !isNaN(dt.getTime()) && (!laatst || dt > laatst)) laatst = dt;
  }
  obj.staleAt = laatst || fallbackStaleAt;
  return obj;
}

async function loadWerkruimteBundle(daglink) {
  const overzicht = await fetchWerkruimte(daglink, "/dashboard/overzicht");
  const label = overzicht.klant ? "werkruimte van " + overzicht.klant : "je werkruimte";
  const bundle = emptyBundle("werkruimte", label);
  const schema = getSchema();

  const metInhoud = (overzicht.domeinen || []).filter(d => d && d.aantal > 0);
  const opgehaald = await Promise.all(metInhoud.map(async (d) => ({
    domein: d.domein,
    body: await fetchWerkruimte(daglink, "/dashboard/entries?domein=" + encodeURIComponent(d.domein) + "&limiet=5000"),
  })));

  for (const { domein, body } of opgehaald) {
    const entries = body.entries || [];
    const staleAt = maxBijgewerkt(entries);
    if (domein === "bedrijfscontext") {
      bundle.bedrijfscontext = bedrijfscontextUitEntries(entries, staleAt);
      continue;
    }
    if (!schema.datadomeinen[domein]) {
      bundle.waarschuwingen.push(`Domein "${domein}" uit je werkruimte is onbekend in deze dashboardversie — genegeerd. Waarschijnlijk is het dashboard ouder dan je werkruimte.`);
      continue;
    }
    bundle.domains[domein] = {
      aanwezig: true,
      rows: entries.map(e => e.data),
      staleAt,
      herkomstLabel: `werkruimte — ${domein} (${entries.length} entries, live opgehaald)`,
    };
  }
  if (bundle.bedrijfscontext === null) bundle.bedrijfscontext = "niet-ondersteund-door-bundel";
  return bundle;
}

if (typeof module !== "undefined") {
  module.exports = {
    parseDaglinkFragment, loadWerkruimteBundle, restoreDaglink, vergeetDaglink,
    bedrijfscontextUitEntries, maxBijgewerkt, DAGLINK_SS_KEY,
  };
}
