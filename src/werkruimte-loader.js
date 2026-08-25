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
 * Dit is sinds 25-08-2026 de enige route: er is altijd een werkruimte, dus
 * de vroegere bestandsroutes (Excel-werkboek, data-map, Notion-export-map)
 * en het losse offline dashboard.html zijn verwijderd. Deze module levert
 * de uniforme bundelvorm (kind "rows" of "metrics") waar alles
 * stroomafwaarts (zones, metrics, render) op rekent.
 *
 * Bundelvorm:
 *   { source: "werkruimte", sourceLabel, kind, domains: { [domein]:
 *     { aanwezig, rows, staleAt, herkomstLabel } }, bedrijfscontext,
 *     waarschuwingen: [], teamfeed, intern, metricsRaw? }
 */

function emptyBundle(source, sourceLabel) {
  return { source, sourceLabel, kind: "rows", domains: {}, bedrijfscontext: null, waarschuwingen: [] };
}

// Beslist, puur op vorm, of een payload het kant-en-klare metricsbestand is
// (een "versie"- of "type"-veld) — de versiecontrole zelf zit in metrics.js.
function looksLikeMetricsPayload(raw) {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) && (("versie" in raw) || ("type" in raw));
}

const DAGLINK_SS_KEY = "agentic-team-dashboard:daglink";

/* Herkent de daglink-parameters in het fragment. Detailroutes ("#/detail/…")
 * beginnen met "#/" en blijven buiten schot. Geeft null bij alles wat geen
 * geldige daglink is — de pagina toont dan de lege staat met de uitleg. */
/* b32 fase 2: het dashboard praat altijd via de router op het vaste domein.
 * De router zoekt de instantie op via de sleutel-hash in het token; een link
 * kan dus nooit naar een vreemde host wijzen en de CSP staat maar één origin
 * toe. De `i`-parameter uit oudere links wordt genegeerd — behalve http://
 * localhost, voor lokaal testen tegen een mock-instantie. */
const CONNECTOR_ORIGIN = "https://connector.agentic-team.ai";

function parseDaglinkFragment(hash) {
  if (!hash || hash.startsWith("#/")) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("t");
  if (!token) return null;
  const instantieRaw = params.get("i");
  if (instantieRaw) {
    let url = null;
    try { url = new URL(instantieRaw); } catch (e) { url = null; }
    const isLocalhost = url && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url && isLocalhost && (url.protocol === "http:" || url.protocol === "https:")) {
      return { token, instantieUrl: url.origin };
    }
  }
  return { token, instantieUrl: CONNECTOR_ORIGIN };
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
    if (raw) {
      const opgeslagen = JSON.parse(raw);
      // b32 fase 2: ook de opgeslagen bestemming moet aan de invariant voldoen
      // (alleen de router, of localhost). Een sessie van vóór fase 2 draagt nog
      // een azurecontainerapps-origin — die gooien we weg i.p.v. erop vast te lopen.
      if (opgeslagen && typeof opgeslagen.token === "string" && isToegestaneBestemming(opgeslagen.instantieUrl)) return opgeslagen;
      sessionStorage.removeItem(DAGLINK_SS_KEY);
    }
  } catch (e) { /* privémodus of kapotte waarde — dan geen daglink */ }
  return null;
}

function isToegestaneBestemming(instantieUrl) {
  if (instantieUrl === CONNECTOR_ORIGIN) return true;
  try {
    const u = new URL(String(instantieUrl));
    return (u.hostname === "localhost" || u.hostname === "127.0.0.1") && (u.protocol === "http:" || u.protocol === "https:");
  } catch (e) { return false; }
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

/**
 * Voert `werk` uit over `items` met hooguit `plafond` tegelijk, en levert de
 * uitkomsten in dezelfde volgorde als de invoer (s26/016). Faalt er één, dan
 * faalt het geheel — net als Promise.all, zodat de foutafhandeling erboven
 * niet verandert.
 */
async function metPlafond(items, plafond, werk) {
  const uit = new Array(items.length);
  let volgende = 0;
  const werkers = new Array(Math.min(plafond, items.length)).fill(null).map(async () => {
    for (;;) {
      const i = volgende++;
      if (i >= items.length) return;
      uit[i] = await werk(items[i], i);
    }
  });
  await Promise.all(werkers);
  return uit;
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
const TEAMFEED_DOMEIN = "teamfeed";
const TEAMFEED_DAGEN = 30;
const TEAMFEED_LIMIET = 500;

/* f22: de teamfeed (domein `teamfeed`, opslag=werkruimte) is nooit een
 * rows-domein en telt niet mee in de voorrangsbeslissing; hij hoort bij
 * élke route (rows én metrics) op de bundle. Fail-open: een werkruimte die
 * het domein nog niet kent geeft 400 "Onbekend domein" — dan is de feed er
 * gewoon niet, met een uitleg in de feed zelf (geen waarschuwingsbalk). */
async function haalTeamfeed(daglink, vandaag) {
  // b37: op lokale kalenderdag (toISOString gaf de UTC-dag: 's avonds een dag te weinig)
  const sinds = feedDagKey(dagVanIndex(kalenderDag(vandaag) - TEAMFEED_DAGEN));
  try {
    const body = await fetchWerkruimte(daglink,
      "/dashboard/entries?domein=" + TEAMFEED_DOMEIN + "&limiet=" + TEAMFEED_LIMIET + "&sinds=" + sinds);
    return { entries: Array.isArray(body.entries) ? body.entries : [], opgehaaldOp: vandaag.toISOString() };
  } catch (e) {
    if (e && e.daglinkVerlopen) throw e;
    return null;
  }
}

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

/* Domeinen met opslag=werkruimte (dashboard_metrics, bronkoppeling, …)
 * zijn afgeleide/config-data en nooit rows-domeinen. Het schema levert de
 * lijst (extract-schema.py); de vaste namen hieronder blijven als vangnet
 * voor een artefact dat tegen een nieuwere registry praat. */
function werkruimteDomeinen(schema) {
  const uitSchema = schema.werkruimteDomeinen || [];
  return uitSchema.indexOf(METRICS_DOMEIN) === -1 ? uitSchema.concat([METRICS_DOMEIN]) : uitSchema;
}

async function loadWerkruimteBundle(daglink) {
  const overzicht = await fetchWerkruimte(daglink, "/dashboard/overzicht");
  const label = overzicht.klant ? "werkruimte van " + overzicht.klant : "je werkruimte";
  const bundle = emptyBundle("werkruimte", label);
  // Interne omgeving (DASHBOARD_INTERN=1 op de instantie): alleen dan toont
  // het dashboard de interne tegels (correctievrij / f19-gate).
  bundle.intern = overzicht.intern === true;
  const schema = getSchema();
  const opslagDomeinen = werkruimteDomeinen(schema);

  const gevuld = (overzicht.domeinen || []).filter(d => d && d.aantal > 0);

  // f22: alleen ophalen als de instantie het domein kent (staat dan in het
  // overzicht, ook met aantal 0); anders blijft teamfeed null = "nog niet
  // actief op deze werkruimte".
  bundle.teamfeed = (overzicht.domeinen || []).some(d => d && d.domein === TEAMFEED_DOMEIN)
    ? await haalTeamfeed(daglink, new Date())
    : null;

  // De bronkoppeling arbitreert wat "werkdata in de werkruimte" is: een
  // domein dat volgens de bronkoppeling ergens ánders woont (notion,
  // werkboek, lokaal) telt hier niet mee — één verdwaalde entry in de
  // werkruimte mag het metricsbestand niet verdringen (gezien bij FFG:
  // een welkomstpakket-actie in de werkruimte terwijl acties in Notion
  // wonen). Zonder bronkoppeling-entry geldt het oude gedrag.
  const systeemPerDomein = {};
  if (gevuld.some(d => d.domein === "bronkoppeling")) {
    try {
      const body = await fetchWerkruimte(daglink, "/dashboard/entries?domein=bronkoppeling&limiet=50");
      for (const e of (body.entries || [])) {
        if (e && e.data && e.data.Systeem) systeemPerDomein[e.entryId] = e.data.Systeem;
      }
    } catch (e) { /* geen bronkoppeling leesbaar -> oude gedrag */ }
  }
  const werkdataDomeinen = gevuld.filter(d =>
    opslagDomeinen.indexOf(d.domein) === -1
    && GEHEUGEN_DOMEINEN.indexOf(d.domein) === -1
    && (!(d.domein in systeemPerDomein) || systeemPerDomein[d.domein] === "werkruimte"));

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

  const metInhoud = gevuld.filter(d => opslagDomeinen.indexOf(d.domein) === -1);
  // s26/016: dit was één Promise.all over álle gevulde domeinen — bij een vol
  // team zijn dat er zeventien, elk met een verzoek om 5.000 records, allemaal
  // tegelijk naar één instantie. Die instantie is een kleine container; de
  // browser knijpt zelf al af rond zes verbindingen, maar de rest staat dan in
  // de rij bij de instantie in plaats van bij de browser. Vier tegelijk houdt
  // de eerste schermvulling snel zonder de instantie plat te leggen.
  const opgehaald = await metPlafond(metInhoud, 4, async (d) => ({
    domein: d.domein,
    body: await fetchWerkruimte(daglink, "/dashboard/entries?domein=" + encodeURIComponent(d.domein) + "&limiet=5000"),
  }));

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
    parseDaglinkFragment, loadWerkruimteBundle, restoreDaglink, vergeetDaglink, haalTeamfeed,
    bedrijfscontextUitEntries, maxBijgewerkt, DAGLINK_SS_KEY,
    emptyBundle, looksLikeMetricsPayload, metPlafond,
  };
}
