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

/* f24: teams met werkdata buiten de werkruimte (Notion, eigen systeem)
 * krijgen hun cijfers via het domein dashboard_metrics — één entry met het
 * metricsbestand (contract v1) als JSON-string, dagelijks overschreven door
 * de Coördinator. Dit domein is nooit een rows-domein: het staat bewust
 * niet in het dashboard-schema (opslag=werkruimte-filter in
 * extract-schema.py) en wordt hier bij naam overgeslagen als tweede
 * vangrail. Werkgeheugen-domeinen tellen niet als werkdata voor de
 * voorrangsbeslissing: die zijn bij élke werkruimte-klant gevuld. */
const METRICS_DOMEIN = "dashboard_metrics";
const GEHEUGEN_DOMEINEN = ["logboek", "bedrijfscontext"];

function isVanVandaag(isoTekst, vandaag) {
  const dt = isoTekst ? new Date(isoTekst) : null;
  if (!dt || isNaN(dt.getTime())) return false;
  return dt.getFullYear() === vandaag.getFullYear()
    && dt.getMonth() === vandaag.getMonth()
    && dt.getDate() === vandaag.getDate();
}

/* Haalt de metrics-entry op en geeft {payload, gegenereerdOp} of null.
 * Onleesbaar (geen JSON, of niet de vorm van een metricsbestand) telt als
 * "geen metrics", met een zichtbare waarschuwing — nooit stil negeren. */
async function haalMetricsEntry(daglink, bundle) {
  const body = await fetchWerkruimte(daglink, "/dashboard/entries?domein=" + METRICS_DOMEIN + "&limiet=10");
  const entries = body.entries || [];
  const entry = entries.find(e => e.entryId === "metrics")
    || entries.slice().sort((a, b) => String(b.bijgewerkt).localeCompare(String(a.bijgewerkt)))[0];
  if (!entry) return null;
  let payload;
  try {
    payload = JSON.parse(String(entry.data && entry.data.Inhoud));
  } catch (e) {
    bundle.waarschuwingen.push("De dashboard_metrics-entry in je werkruimte bevat geen geldige JSON — de rijenroute wordt gebruikt. Vraag je Coördinator de dagstart opnieuw te draaien.");
    return null;
  }
  if (!looksLikeMetricsPayload(payload)) {
    bundle.waarschuwingen.push("De dashboard_metrics-entry in je werkruimte heeft niet de vorm van een metricsbestand — de rijenroute wordt gebruikt.");
    return null;
  }
  return { payload, gegenereerdOp: payload.gegenereerd_op || entry.bijgewerkt };
}

async function loadWerkruimteBundle(daglink) {
  const overzicht = await fetchWerkruimte(daglink, "/dashboard/overzicht");
  const label = overzicht.klant ? "werkruimte van " + overzicht.klant : "je werkruimte";
  const bundle = emptyBundle("werkruimte", label);
  const schema = getSchema();

  const gevuld = (overzicht.domeinen || []).filter(d => d && d.aantal > 0);
  const werkdataDomeinen = gevuld.filter(d => d.domein !== METRICS_DOMEIN && GEHEUGEN_DOMEINEN.indexOf(d.domein) === -1);

  // Voorrangsregels (f24): verse metrics winnen; oude metrics naast echte
  // werkdata-rijen worden genegeerd; oude metrics zonder werkdata worden
  // getoond mét verouderd-waarschuwing (iets ouds met stempel is beter dan
  // een leeg dashboard).
  if (gevuld.some(d => d.domein === METRICS_DOMEIN)) {
    const metrics = await haalMetricsEntry(daglink, bundle);
    if (metrics) {
      const vers = isVanVandaag(metrics.gegenereerdOp, new Date());
      const datumLabel = String(metrics.gegenereerdOp).slice(0, 10);
      if (vers || werkdataDomeinen.length === 0) {
        if (vers && werkdataDomeinen.length > 0) {
          bundle.waarschuwingen.push("Je werkruimte bevat ook werkdata-rijen; het dashboard toont het vandaag aangeleverde metricsbestand.");
        }
        if (!vers) {
          bundle.waarschuwingen.push(`Deze cijfers zijn gegenereerd op ${datumLabel} en mogelijk verouderd — vraag je Coördinator om een dagstart voor verse cijfers.`);
        }
        bundle.kind = "metrics";
        bundle.metricsRaw = metrics.payload;
        return bundle;
      }
      bundle.waarschuwingen.push(`Verouderde metrics-entry (van ${datumLabel}) genegeerd — het dashboard rekent live uit de werkdata-rijen in je werkruimte.`);
    }
  }

  const metInhoud = gevuld.filter(d => d.domein !== METRICS_DOMEIN);
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
