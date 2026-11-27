/* Route 4: live uit de eigen werkruimte-instantie, via een daglink (f15/f18).
 *
 * De Coördinator geeft de klant bij de dagstart een prefilled URL:
 *   https://dashboard.agentic-team.ai#t=<token>&i=<instantie-url>
 * Het token is kortlevend (standaard 24 uur, in een afgeschermd team korter;
 * zie daglinkGeldigheid) en kan alleen lezen; het staat in het
 * #fragment, dat browsers nooit naar een server meesturen, en leeft daarna
 * uitsluitend in sessionStorage. De browser praat rechtstreeks met de eigen
 * werkruimte-instantie van de klant — er komt geen agentic-team.ai-backend
 * aan te pas. (Sinds p10 staat de CSP één extra bestemming toe: het
 * token-endpoint op www.agentic-team.ai. Daar gaat nooit klantdata langs;
 * zie het README-hoofdstuk "Eén bron".)
 *
 * Sinds 25-08-2026 is de werkruimte de enige databron: er is altijd een
 * werkruimte, dus de vroegere bestandsroutes (Excel-werkboek, data-map,
 * Notion-export-map) en het losse offline dashboard.html zijn verwijderd.
 * Deze module levert de uniforme bundelvorm (kind "rows" of "metrics") waar
 * alles stroomafwaarts (zones, metrics, render) op rekent.
 *
 * p10 fase 3 geeft die ene bron een tweede ingang: naast de daglink kun je
 * inloggen met je licentie (OAuth, zie src/oauth-client.js). Beide leveren
 * hetzelfde `bron`-object — {token, instantieUrl}, bij OAuth met
 * `oauth: true` — en praten met exact dezelfde endpoints op dezelfde router.
 * Het enige verschil zit in de 401-afhandeling: een JWT is één keer te
 * vernieuwen, een daglink niet.
 *
 * Bundelvorm:
 *   { source: "werkruimte", sourceLabel, kind, domains: { [domein]:
 *     { aanwezig, rows, staleAt, herkomstLabel } }, bedrijfscontext,
 *     waarschuwingen: [], teamfeed, intern, metricsRaw? }
 */

function emptyBundle(source, sourceLabel) {
  return { source, sourceLabel, kind: "rows", domains: {}, bedrijfscontext: null, waarschuwingen: [], activaties: null };
}

// Beslist, puur op vorm, of een payload het kant-en-klare metricsbestand is
// (een "versie"- of "type"-veld) — de versiecontrole zelf zit in metrics.js.
function looksLikeMetricsPayload(raw) {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) && (("versie" in raw) || ("type" in raw));
}

/* i68 — de activatieteller uit /dashboard/overzicht, gesaneerd bij binnenkomst:
 * alleen agent-slugs uit het schema, alleen hele niet-negatieve aantallen,
 * alleen geldige weekdata. Ontbreekt het veld, dan draait de instantie een
 * image zonder teller: null. */
const ACTIVATIE_MAX_WEKEN = 60;
function saneerActivaties(raw, schema) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const slugs = new Set(((schema && schema.agents) || []).map(a => a.slug));
  // Rondreis in plaats van Date.parse: die maakt van 31 februari stil 3 maart.
  const datumOk = v => {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  };
  const weken = (Array.isArray(raw.weken) ? raw.weken : [])
    .filter(w => w && typeof w === "object" && datumOk(w.week_start))
    .slice(-ACTIVATIE_MAX_WEKEN)
    .map(w => {
      const perAgent = {};
      const bron = w.per_agent && typeof w.per_agent === "object" && !Array.isArray(w.per_agent) ? w.per_agent : {};
      for (const [slug, n] of Object.entries(bron)) {
        if (!slugs.has(slug)) continue;
        if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 1e6) continue;
        perAgent[slug] = n;
      }
      return { week_start: w.week_start, per_agent: perAgent };
    });
  return { sinds: datumOk(raw.sinds) ? raw.sinds : null, weken };
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
/* Draagt het fragment iets dat op een daglink lijkt, maar er geen is? Dan is
 * "Geen daglink gevonden" het verkeerde antwoord: er wás een link, hij is
 * alleen onbruikbaar. Detailroutes ("#/…") en een lege hash tellen niet mee. */
function hashLijktOpDaglink(hash) {
  if (!hash || hash.startsWith("#/")) return false;
  return hash.replace(/^#/, "").trim().length > 0;
}

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

/* Zonder tijdslimiet blijft een uitblijvend antwoord voor altijd op de
 * laadtekst staan: de browser wacht dan tot hij het zelf opgeeft, en dat kan
 * minuten duren of helemaal niet gebeuren. Precies dat gebeurde bij een
 * daglink die geen antwoord kreeg — de pagina bleef hangen op "Live gegevens
 * uit je werkruimte worden opgehaald…" zonder ooit een fout te tonen.
 *
 * 20 seconden is ruim voor een koude instantie (die kan een cold start van
 * enkele seconden hebben) en kort genoeg om niet als kapot te voelen.
 *
 * Bewust GEEN wrapper om de netwerkaanroep heen: de twee aanroepen naar de
 * eigen instantie blijven letterlijk staan zoals ze stonden, zodat de
 * telemetriecontrole op het gebouwde artefact (test/geen-telemetrie.test.js)
 * elke aanroep met naam en bestemming blijft herkennen — die controle telt op
 * de tekst van dashboard.html. Deze helper levert alleen het afbreeksignaal. */
const VERZOEK_TIMEOUT_MS = 20000;
const VERZOEK_TIMEOUT_TEKST = "Je werkruimte reageert niet — na 20 seconden was er nog geen antwoord. Probeer het zo nog eens, of vraag je Coördinator om een nieuwe daglink.";

function tijdslimiet(ms = VERZOEK_TIMEOUT_MS) {
  if (typeof AbortController === "undefined") return { signal: undefined, klaar: () => {} };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, klaar: () => clearTimeout(timer) };
}

function isAfgebroken(e) {
  return !!e && (e.name === "AbortError" || e.name === "TimeoutError");
}

/* De bron is óf een daglink óf een OAuth-sessie — in beide gevallen
 * {token, instantieUrl}, en bij OAuth met `oauth: true` erbij. Alles
 * stroomafwaarts merkt het verschil niet; alleen de 401-afhandeling hieronder
 * kent het, want alleen een JWT is te vernieuwen. */
async function doeVerzoek(bron, pad) {
  const tl = tijdslimiet();
  try {
    return await fetch(bron.instantieUrl + pad, {
      headers: { Authorization: "Bearer " + bron.token },
      signal: tl.signal,
    });
  } catch (e) {
    if (isAfgebroken(e)) throw new Error(VERZOEK_TIMEOUT_TEKST);
    throw new Error("Je werkruimte-instantie is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.");
  } finally {
    tl.klaar();
  }
}

/* p10: hooguit ÉÉN refreshpoging per sessie, gedeeld over alle gelijktijdige
 * verzoeken. De loader vuurt vier verzoeken tegelijk af (metPlafond); zonder
 * deze gedeelde belofte zouden er bij een verlopen token vier refreshes
 * uitgaan, en zou refresh-rotatie (contract §4) drie daarvan als hergebruik
 * zien en de hele familie intrekken. Faalt de poging, dan is opnieuw inloggen
 * de enige uitweg — nooit een tweede ronde. */
let oauthVernieuwing = null;
let oauthVernieuwingKlaar = false;

function resetOauthVernieuwing() {
  oauthVernieuwing = null;
  oauthVernieuwingKlaar = false;
  sessieVernieuwing = null;
}

function eenmaligVernieuwen() {
  if (oauthVernieuwingKlaar) return Promise.resolve(null);
  if (!oauthVernieuwing) {
    oauthVernieuwing = Promise.resolve()
      .then(() => vernieuwOauthSessie())
      .then((s) => { oauthVernieuwingKlaar = true; return s; });
  }
  return oauthVernieuwing;
}

/* s66 — een verzoek met een token van de dashboardsessie (bron.sessie).
 *
 * Anders dan de oude tabbladflow is een sessietoken elk uur opnieuw te halen:
 * de site roteert het vervangingstoken in het cookie bij elk gebruik. De regel
 * blijft "per verzoek hooguit één vernieuwing, nooit een lus":
 *  - een 401 met {sessie: "beeindigd"} (de instantie zette een sessiegrens:
 *    rolwijziging, uitloggen overal) wordt nooit vernieuwd — vernieuwen geeft
 *    een token met hetzelfde inlogmoment, dat de instantie ook weigert. Dan
 *    uitloggen bij de site en de lege staat;
 *  - een andere 401: één POST naar de sessie-token-route, gedeeld door alle
 *    verzoeken die met hetzelfde token een 401 kregen, en daarna één nieuwe
 *    poging;
 *  - is het token volgens expires_in (bijna) verlopen, dan eerst vernieuwen.
 * `eenmalig` (uitloggen overal): geen vernieuwing en geen tweede poging. */
let sessieVernieuwing = null; // {voor: token, belofte}

function sessieLaadFout(fout) {
  const err = new Error((fout && fout.message) || "Je sessie is verlopen. Log opnieuw in met je licentie.");
  const soort = fout && fout.soort;
  // Een storing of een netwerkfout is geen verlopen sessie: dan blijft wat je
  // zag staan, met een melding.
  if (soort !== "storing" && soort !== "netwerk") err.oauthVerlopen = true;
  if (soort === "ander_account") { err.sessieEinde = true; err.sessieAnderAccount = true; }
  return err;
}

function vernieuwSessieVoor(bron, gebruikt) {
  // Een ander verzoek heeft al vernieuwd: dan het nieuwe token gebruiken.
  if (bron.token !== gebruikt) return Promise.resolve(bron.token);
  if (!sessieVernieuwing || sessieVernieuwing.voor !== gebruikt) {
    const belofte = haalSessieToken().then(
      (t) => { if (bron.token === gebruikt) bron.token = t.access_token; return bron.token; },
      (fout) => { throw sessieLaadFout(fout); },
    );
    sessieVernieuwing = { voor: gebruikt, belofte };
  }
  return sessieVernieuwing.belofte;
}

async function isSessieBeeindigd(res) {
  if (!res || res.status !== 401 || typeof res.clone !== "function") return false;
  try {
    const body = await res.clone().json();
    return !!body && body.sessie === "beeindigd";
  } catch (e) {
    return false;
  }
}

function sessieBeeindigdFout() {
  void sessieIsBeeindigd();
  const err = new Error(SESSIE_BEEINDIGD_TEKST);
  err.oauthVerlopen = true;
  err.sessieEinde = true;
  err.sessieBeeindigd = true;
  return err;
}

async function metSessie(bron, doe) {
  if (!bron.eenmalig && sessieTokenBijnaVerlopen(bron.token)) await vernieuwSessieVoor(bron, bron.token);
  const gebruikt = bron.token;
  let res = await doe();
  // `eenmalig` hoort bij uitloggen overal, dat zelf al uitlogt: geen tweede
  // afhandeling van een 401 hier.
  if (res.status !== 401 || bron.eenmalig) return res;
  if (await isSessieBeeindigd(res)) throw sessieBeeindigdFout();
  await vernieuwSessieVoor(bron, gebruikt);
  res = await doe();
  if (await isSessieBeeindigd(res)) throw sessieBeeindigdFout();
  return res;
}

async function fetchWerkruimte(bron, pad) {
  let res = bron.sessie ? await metSessie(bron, () => doeVerzoek(bron, pad)) : await doeVerzoek(bron, pad);

  if (res.status === 401 && bron.oauth && !bron.sessie) {
    const nieuw = await eenmaligVernieuwen();
    if (nieuw && nieuw.access_token) {
      // Het bron-object is gedeeld met alle lopende verzoeken: het nieuwe
      // token geldt meteen ook voor hen.
      bron.token = nieuw.access_token;
      res = await doeVerzoek(bron, pad);
    }
  }

  let body = null;
  try { body = await res.json(); } catch (e) { /* geen JSON — valt hieronder in de foutpaden */ }
  if (res.status === 401) {
    if (bron.oauth) {
      const err = new Error("Je sessie is verlopen. Log opnieuw in met je licentie.");
      err.oauthVerlopen = true;
      throw err;
    }
    const err = new Error((body && body.fout) || "Deze dashboardlink is verlopen. Vraag je Coördinator om een nieuwe.");
    err.daglinkVerlopen = true;
    throw err;
  }
  if (res.status === 403 && bron.oauth) {
    // insufficient_scope (contract §6): een token zonder dashboard:lees.
    // Vernieuwen helpt niet — de grant zelf klopt niet.
    const err = new Error("Deze licentie geeft geen toegang tot het dashboard.");
    err.oauthVerlopen = true;
    err.status = 403; // f61: een aanvullende ophaler kan een 403 dan zelf opvangen
    throw err;
  }
  if (!res.ok || body === null) {
    throw new Error((body && body.fout) || ("Je werkruimte gaf een onverwacht antwoord (status " + res.status + ")."));
  }
  return body;
}

/* f23: een schrijfverzoek (POST/PUT/DELETE) naar de instantie, met dezelfde
 * 401-vernieuwing als fetchWerkruimte. Een 403/409/422 komt als leesbare
 * Error terug (de instantie stuurt een `fout`-tekst mee), met `status` erop
 * zodat de UI extern-domein (409) anders kan tonen dan een validatiefout. */
async function schrijfWerkruimte(bron, methode, pad, payload) {
  const doe = async () => {
    const tl = tijdslimiet();
    try {
      return await fetch(bron.instantieUrl + pad, {
        method: methode,
        headers: Object.assign(
          { Authorization: "Bearer " + bron.token },
          payload === undefined ? {} : { "Content-Type": "application/json" },
        ),
        signal: tl.signal,
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
    } catch (e) {
      if (isAfgebroken(e)) throw new Error(VERZOEK_TIMEOUT_TEKST);
      throw new Error("Je werkruimte-instantie is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.");
    } finally {
      tl.klaar();
    }
  };
  let res = bron.sessie ? await metSessie(bron, doe) : await doe();
  if (res.status === 401 && bron.oauth && !bron.sessie) {
    const nieuw = await eenmaligVernieuwen();
    if (nieuw && nieuw.access_token) {
      bron.token = nieuw.access_token;
      res = await doe();
    }
  }
  let body = null;
  try { body = await res.json(); } catch (e) { /* geen JSON — valt in de foutpaden */ }
  if (res.status === 401) {
    const err = new Error(bron.oauth
      ? "Je sessie is verlopen. Log opnieuw in met je licentie."
      : "Deze dashboardlink is verlopen. Vraag je Coördinator om een nieuwe.");
    if (bron.oauth) err.oauthVerlopen = true; else err.daglinkVerlopen = true;
    throw err;
  }
  if (!res.ok) {
    const err = new Error((body && body.fout) || ("Je werkruimte gaf een onverwacht antwoord (status " + res.status + ")."));
    err.status = res.status;
    // f61: een 409 van de opdrachtroute draagt meer dan een tekst (bv. het entryId
    // van de opdracht die er al ligt).
    err.body = body;
    throw err;
  }
  return body;
}

/**
 * f30 — de statische export ophalen en als bestand aan de gebruiker geven.
 *
 * Bewust níet via fetchWerkruimte: die verwacht JSON en zou een export van
 * tientallen megabytes eerst door JSON.parse duwen (en bij markdown meteen
 * struikelen). Wel dezelfde 401-afhandeling, want een verlopen daglink of
 * sessie moet hier dezelfde melding geven als overal elders.
 *
 * De naam komt uit de Content-Disposition van de instantie en wordt niet
 * geraden: die kant kent de klantnaam en heeft hem al door een strikte zeef
 * gehaald. Herkennen we hem niet, dan een neutrale terugval — nooit een naam
 * uit serverinvoer letterlijk in `a.download` zetten.
 */
async function downloadExport(bron, formaat) {
  const doe = () => doeVerzoek(bron, "/dashboard/export?formaat=" + encodeURIComponent(formaat));
  let res = bron.sessie ? await metSessie(bron, doe) : await doe();
  if (res.status === 401 && bron.oauth && !bron.sessie) {
    const nieuw = await eenmaligVernieuwen();
    if (nieuw && nieuw.access_token) {
      bron.token = nieuw.access_token;
      res = await doeVerzoek(bron, "/dashboard/export?formaat=" + encodeURIComponent(formaat));
    }
  }
  if (res.status === 401) {
    const err = new Error(bron.oauth
      ? "Je sessie is verlopen. Log opnieuw in met je licentie."
      : "Deze dashboardlink is verlopen. Vraag je Coördinator om een nieuwe.");
    if (bron.oauth) err.oauthVerlopen = true; else err.daglinkVerlopen = true;
    throw err;
  }
  if (!res.ok) {
    throw new Error("Je werkruimte gaf een onverwacht antwoord (status " + res.status + ").");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = bestandsnaamUitHeader(res.headers.get("content-disposition"), formaat);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Direct vrijgeven kan de download in Safari afbreken; een tik later is genoeg.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Alleen een naam die eruitziet als de onze; anders een neutrale terugval. */
function bestandsnaamUitHeader(kop, formaat) {
  const treffer = /filename="([A-Za-z0-9._-]{1,120})"/.exec(kop || "");
  if (treffer) return treffer[1];
  return "werkruimte-export." + (formaat === "json" ? "json" : "md");
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

/* Eén entry uit de instantie → één rij zoals de rest van het dashboard hem
 * leest. Staat apart omdat er twee ingangen zijn: het laden van de bundel en
 * (i81) het antwoord op een schrijfactie, dat de rij ter plekke vervangt. Twee
 * eigen vormen zouden na de eerste klik stil uit elkaar gaan lopen. */
function rijVanEntry(e) {
  // f46: de stempels van de instantie reizen mee onder één sleutel. Niet als
  // __aangemaakt/__bijgewerkt: getField() normaliseert sleutels, en dan zou
  // een schemaveld "Bijgewerkt" stil de stempel lezen.
  const stempels = { aangemaakt: (e && e.aangemaakt) || null, bijgewerkt: (e && e.bijgewerkt) || null };
  // s64: met AFSCHERMING=aan stempelt de instantie elke rij die iemand
  // schrijft, in elk datadomein, met de rol van de schrijver (besluit f van
  // 26-11; eerst alleen het werkgeheugen), als meta-veld naast het entryId
  // (geen datadomeinveld). Het reist mee bij de andere stempels; ontbreekt het,
  // dan is de rij precies zoals vóór s64. Besluit C2 (26-11, avond):
  // staat het veld er wel maar is het geen tekst (null, een getal, een
  // object), dan reist het mee als null. Het label toont dan niets, en
  // opvolgen behandelt het als een lagere rol (fail-closed).
  if (e && Object.prototype.hasOwnProperty.call(e, "geschreven_door")) {
    stempels.door = typeof e.geschreven_door === "string" ? e.geschreven_door : null;
  }
  return Object.assign({}, e && e.data, { __entryId: e && e.entryId, __stempels: stempels });
}

/* s64 — welke stempel krijgt een label "door …". Alleen de vier rollen van
 * een mens in het team; "sleutel" (de licentiesleutel, geen persoon) tonen we
 * niet, net als alles wat de instantie niet hoort te sturen. De tekst komt uit
 * deze tabel, nooit uit de waarde zelf. */
const SCHRIJVER_ROL_LABEL = Object.freeze({ eigenaar: "Eigenaar", beheerder: "Beheerder", medewerker: "Medewerker", viewer: "Viewer" });
function schrijverLabel(waarde) {
  return typeof waarde === "string" && Object.prototype.hasOwnProperty.call(SCHRIJVER_ROL_LABEL, waarde) ? SCHRIJVER_ROL_LABEL[waarde] : null;
}
/* s64 nafix (review #133) — de volledige labeltekst. "onbekend" (een rij van
 * vóór de stempel, of een rij die iemand daarna bijwerkte terwijl er oude
 * tekst bleef staan) krijgt "herkomst onbekend". Zonder label zag zo'n rij er
 * hetzelfde uit als werk van de sleutel, en bleef het witwaspad naar
 * "onbekend" (besluit d) open voor wie het dashboard leest. "onbekend" komt
 * alleen met AFSCHERMING=aan, dus met de modus uit verandert er niets. */
function herkomstTekst(waarde) {
  if (waarde === "onbekend") return "herkomst onbekend";
  const label = schrijverLabel(waarde);
  return label ? "door " + label : null;
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
// Domeinen die wél rijen hebben maar géén "werkdata" zijn in de arbitrage
// hieronder: werkgeheugen (logboek, bedrijfscontext) en sinds f33 notities.
// Zonder notities hier zou één losse notitie bij een klant met een extern
// CRM de metricsroute verdringen voor een bijna leeg rijendashboard.
const GEHEUGEN_DOMEINEN = ["logboek", "bedrijfscontext", "notities"];
const TEAMFEED_DOMEIN = "teamfeed";
const TEAMFEED_DAGEN = 30;
const TEAMFEED_LIMIET = 500;
// f61: opdrachten die je vanuit het dashboard doorgaf, voor acties in je eigen
// systeem (opslag=werkruimte, zie src/opdrachten.js). Nooit werkdata.
const OPDRACHTEN_DOMEIN = "dashboard_opdrachten";
const OPDRACHTEN_DAGEN = 30;

/* f22: de teamfeed (domein `teamfeed`, opslag=werkruimte) is nooit een
 * rows-domein en telt niet mee in de voorrangsbeslissing; hij hoort bij
 * élke route (rows én metrics) op de bundle. Fail-open: een werkruimte die
 * het domein nog niet kent geeft 400 "Onbekend domein" — dan is de feed er
 * gewoon niet, met een uitleg in de feed zelf (geen waarschuwingsbalk). */
async function haalTeamfeed(bron, vandaag) {
  // b37: op lokale kalenderdag (toISOString gaf de UTC-dag: 's avonds een dag te weinig)
  const sinds = feedDagKey(dagVanIndex(kalenderDag(vandaag) - TEAMFEED_DAGEN));
  try {
    const body = await fetchWerkruimte(bron,
      "/dashboard/entries?domein=" + TEAMFEED_DOMEIN + "&limiet=" + TEAMFEED_LIMIET + "&sinds=" + sinds);
    return { entries: Array.isArray(body.entries) ? body.entries : [], opgehaaldOp: vandaag.toISOString() };
  } catch (e) {
    if (e && (e.daglinkVerlopen || e.oauthVerlopen)) throw e;
    return null;
  }
}

/* f62: de dagplannen (domein `dagplannen`, opslag=werkruimte, registry
 * 1.94.0) — per mens één entry van zijn laatste dagstart. Net als de
 * teamfeed: nooit een rows-domein, alleen ophalen als de instantie het domein
 * kent, en fail-open (geen dagplan = geen kaart "Jouw dag"). De entries gaan
 * ongelezen op de bundel; saneerDagplan (src/dagplan.js) leest ze pas bij het
 * tekenen, en vertrouwt niets. */
const DAGPLAN_LIMIET = 50;
async function haalDagplannen(bron) {
  try {
    const body = await fetchWerkruimte(bron, "/dashboard/entries?domein=dagplannen&limiet=" + DAGPLAN_LIMIET);
    const entries = Array.isArray(body && body.entries) ? body.entries : [];
    return { entries, aantal: entries.length };
  } catch (e) {
    if (e && (e.daglinkVerlopen || e.oauthVerlopen)) throw e;
    return null;
  }
}
/* Een daglink is een url die wordt doorgestuurd, en met een daglink toont het
 * dashboard geen dagplan (het weet niet wie je bent). Dan halen we de plannen
 * ook niet op: alleen het aantal uit het overzicht, voor de regel "Log in om
 * je eigen dag te zien". */
function dagplannenVoor(bron, overzicht) {
  const d = (overzicht.domeinen || []).find(x => x && x.domein === "dagplannen");
  if (!d) return Promise.resolve(null);
  if (!bron || !bron.oauth) {
    const n = Number(d.aantal);
    return Promise.resolve({ entries: [], aantal: Number.isFinite(n) && n > 0 ? Math.round(n) : 0 });
  }
  return haalDagplannen(bron);
}
/* Inhoud die zich als dagplan aandient (type "dagplan"), ongeacht het domein. */
function isDagplanEntry(e) {
  const inhoud = e && e.data && e.data.Inhoud;
  if (inhoud && typeof inhoud === "object") return inhoud.type === "dagplan";
  if (typeof inhoud !== "string" || inhoud.indexOf("dagplan") === -1) return false;
  try { const o = JSON.parse(inhoud); return !!o && o.type === "dagplan"; } catch (err) { return false; }
}
/* f61: de opdrachten van de laatste dertig dagen, via de eigen route van de
 * instantie (GET /dashboard/opdrachten, nieuwste eerst, hooguit 100). Net als
 * de teamfeed: geen rows-domein en geen werkdata. Een instantie die de route
 * nog niet kent (404 domein_onbekend) of hem nu niet geeft: stil null, dan
 * zijn er gewoon geen doorgeefknoppen. Alleen een verlopen sessie of daglink
 * gaat door, want die geldt voor het hele dashboard. */
async function haalOpdrachten(bron, vandaag) {
  const sinds = feedDagKey(dagVanIndex(kalenderDag(vandaag) - OPDRACHTEN_DAGEN));
  try {
    const body = await fetchWerkruimte(bron, "/dashboard/opdrachten?sinds=" + sinds);
    return { entries: Array.isArray(body.entries) ? body.entries : [], opgehaaldOp: vandaag.toISOString() };
  } catch (e) {
    if (e && (e.daglinkVerlopen || (e.oauthVerlopen && e.status !== 403))) throw e;
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
async function haalMetricsEntry(bron, bundle) {
  const body = await fetchWerkruimte(bron, "/dashboard/entries?domein=" + METRICS_DOMEIN + "&limiet=10");
  const entries = body.entries || [];
  // De entry "metrics", anders de nieuwste (oudere producers gebruikten een
  // andere id). f62: een dagplan dat per ongeluk in dit domein belandde, is
  // geen metricsbestand en telt bij die terugval niet mee.
  const entry = entries.find(e => e && e.entryId === "metrics")
    || entries.filter(e => e && !isDagplanEntry(e))
      .sort((a, b) => String(b.bijgewerkt).localeCompare(String(a.bijgewerkt)))[0];
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
  // f61: dashboard_opdrachten ook als het gebakken schema hem nog niet kent
  // (de code landt vóór de registry-sync). Anders telt één opdrachtrij als
  // werkdata en verdringt hij een metricsbestand van gisteren.
  return uitSchema.concat([METRICS_DOMEIN, "dagplannen", OPDRACHTEN_DOMEIN].filter(d => uitSchema.indexOf(d) === -1));
}

/* s66 (besluit 27-11-2026): de instantie telt hoe vaak het dashboard opent via
 * een daglink en hoe vaak via een sessie (werkruimte, dashboard-opens.ts). Een
 * open is één overzicht met de markering `?open=1`. Die gaat alleen mee bij
 * het eerste laden van een pagina (app.js zet `eersteOpen` op precies de twee
 * opstartpaden), nooit bij Ververs, het herladen na een schrijfactie of de
 * daglink-terugval na uitloggen: die keren lopen altijd ingelogd en zouden het
 * aandeel daglink te laag maken. Het is geen nieuw verzoek en geen nieuwe
 * bestemming: één vaste queryparameter op het overzicht dat toch al wegging,
 * zonder id, tijdstip of inhoud. Een oudere instantie negeert hem. */
const OVERZICHT_PAD = "/dashboard/overzicht";
const OVERZICHT_EERSTE_OPEN_PAD = OVERZICHT_PAD + "?open=1";

async function loadWerkruimteBundle(bron, { eersteOpen = false } = {}) {
  const overzicht = await fetchWerkruimte(bron, eersteOpen === true ? OVERZICHT_EERSTE_OPEN_PAD : OVERZICHT_PAD);
  const label = overzicht.klant ? "werkruimte van " + overzicht.klant : "je werkruimte";
  const bundle = emptyBundle("werkruimte", label);
  // f52: de bedrijfsnaam, voor de naam van het werkmoment in het stappenblad.
  bundle.klant = typeof overzicht.klant === "string" ? overzicht.klant : null;
  // Interne omgeving (DASHBOARD_INTERN=1 op de instantie): alleen dan toont
  // het dashboard de interne tegels (correctievrij / f19-gate).
  bundle.intern = overzicht.intern === true;
  const schema = getSchema();
  // i68: de activatieteller van de instantie. null = een image zonder teller.
  bundle.activaties = saneerActivaties(overzicht.activaties, schema);
  const opslagDomeinen = werkruimteDomeinen(schema);

  const gevuld = (overzicht.domeinen || []).filter(d => d && d.aantal > 0);
  // f33: welke domeinen kent de instantie überhaupt? Het overzicht noemt ze
  // allemaal, ook met aantal 0 — en dat is het enige signaal of een instantie
  // al een image draait dat een nieuw domein kent. Zonder dit zou het
  // dashboard een notitieformulier tonen dat bij een oudere instantie een
  // "Onbekend domein" oplevert, precies in het gat tussen een dashboarddeploy
  // en de vlootuitrol.
  bundle.instantieDomeinen = (overzicht.domeinen || []).map(d => d && d.domein).filter(Boolean);

  // f22: alleen ophalen als de instantie het domein kent (staat dan in het
  // overzicht, ook met aantal 0); anders blijft teamfeed null = "nog niet
  // actief op deze werkruimte".
  bundle.teamfeed = (overzicht.domeinen || []).some(d => d && d.domein === TEAMFEED_DOMEIN)
    ? await haalTeamfeed(bron, new Date())
    : null;
  // f62: idem voor de dagplannen ("Jouw dag" op Voor jou).
  bundle.dagplannen = await dagplannenVoor(bron, overzicht);

  // f61: de opdrachten alleen als de instantie het domein kent; zonder rijen
  // (aantal 0) hoeft er niets opgehaald te worden. null = deze instantie kent
  // doorgeven nog niet, en dan verandert er in het dashboard niets.
  const opdr = (overzicht.domeinen || []).find(d => d && d.domein === OPDRACHTEN_DOMEIN);
  bundle.opdrachten = !opdr ? null
    : opdr.aantal === 0 ? { entries: [], opgehaaldOp: new Date().toISOString() }
      : await haalOpdrachten(bron, new Date());

  // De bronkoppeling arbitreert wat "werkdata in de werkruimte" is: een
  // domein dat volgens de bronkoppeling ergens ánders woont (notion,
  // werkboek, lokaal) telt hier niet mee — één verdwaalde entry in de
  // werkruimte mag het metricsbestand niet verdringen (gezien bij FFG:
  // een welkomstpakket-actie in de werkruimte terwijl acties in Notion
  // wonen). Zonder bronkoppeling-entry geldt het oude gedrag.
  const systeemPerDomein = {};
  if (gevuld.some(d => d.domein === "bronkoppeling")) {
    try {
      const body = await fetchWerkruimte(bron, "/dashboard/entries?domein=bronkoppeling&limiet=50");
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
    const metrics = await haalMetricsEntry(bron, bundle);
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
        // f33: de cijfers komen uit het metricsbestand, maar de Data-tab moet
        // nog steeds je rijen kunnen tonen. Tot nu toe returnde deze tak
        // meteen, waardoor detail, kanban en notities onzichtbaar waren op
        // precies de omgevingen waar 's ochtends een dagstart draait.
        await laadRijen(bron, bundle, gevuld, opslagDomeinen, schema);
        bundle.systeemPerDomein = systeemPerDomein;
        return bundle;
      }
      bundle.waarschuwingen.push(`Verouderde metrics-entry (van ${datumLabel}) genegeerd — het dashboard rekent live uit de werkdata-rijen in je werkruimte.`);
    }
  }

  await laadRijen(bron, bundle, gevuld, opslagDomeinen, schema);
  // f23: de UI moet weten welke domeinen volgens de bronkoppeling extern
  // wonen — die blijven lezen-met-uitleg, ook in een schrijfsessie.
  bundle.systeemPerDomein = systeemPerDomein;
  if (bundle.bedrijfscontext === null) bundle.bedrijfscontext = "niet-ondersteund-door-bundel";
  return bundle;
}

/* De rijen van elk gevuld domein in de bundel zetten. Sinds f33 gebeurt dit in
 * beide takken van loadWerkruimteBundle: ook naast een vers metricsbestand,
 * want de Data-tab leest hieruit. */
async function laadRijen(bron, bundle, gevuld, opslagDomeinen, schema) {
  const metInhoud = gevuld.filter(d => opslagDomeinen.indexOf(d.domein) === -1);
  // s26/016: dit was één Promise.all over álle gevulde domeinen — bij een vol
  // team zijn dat er zeventien, elk met een verzoek om 5.000 records, allemaal
  // tegelijk naar één instantie. Die instantie is een kleine container; de
  // browser knijpt zelf al af rond zes verbindingen, maar de rest staat dan in
  // de rij bij de instantie in plaats van bij de browser. Vier tegelijk houdt
  // de eerste schermvulling snel zonder de instantie plat te leggen.
  const opgehaald = await metPlafond(metInhoud, 4, async (d) => ({
    domein: d.domein,
    body: await fetchWerkruimte(bron, "/dashboard/entries?domein=" + encodeURIComponent(d.domein) + "&limiet=5000"),
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
      // f23: __entryId reist mee voor bewerken/verwijderen; het is geen
      // schemaveld en komt dus nooit als kolom in beeld.
      rows: entries.map(rijVanEntry),
      staleAt,
      herkomstLabel: `werkruimte — ${domein} (${entries.length} entries, live opgehaald)`,
    };
  }
}

/* p10: welke bron gebruikt deze pagina? Een verse daglink in het fragment is
 * een expliciete actie van de gebruiker en wint altijd; daarna telt een
 * lopende inlogsessie (het JWT), en pas daarna een eerder opgeslagen daglink.
 * Zonder alle drie blijft de lege staat staan. */
/* b62: voor welke licentie is een token? Een daglink is `body.handtekening`
 * met de payload in het eerste deel (daglink.ts in de werkruimte: `licentie`);
 * een access-token is een JWT met de payload in het tweede deel (`lic`). Alleen
 * lezen om te vergelijken — de instantie controleert de handtekeningen zelf. */
function tokenPayloadDeel(token, deel) {
  try {
    const stuk = String(token || "").split(".")[deel];
    return JSON.parse(atob(stuk.replace(/-/g, "+").replace(/_/g, "/")));
  } catch (e) { return null; }
}
function daglinkLicentie(token) {
  const p = tokenPayloadDeel(token, 0);
  return p && typeof p.licentie === "string" ? p.licentie : null;
}
function sessieLicentie(token) {
  const p = tokenPayloadDeel(token, 1);
  return p && typeof p.lic === "string" ? p.lic : null;
}

/* s64 — hoe lang een daglink geldig is, zoals de werkruimte hem uitgaf: het
 * token draagt `exp` en `iat` (Unix-seconden, daglink.ts). Standaard 24 uur;
 * bij Business (AFSCHERMING=aan) korter, standaard 4 uur. Alleen voor de
 * tekst bij een verlopen link: niet gecontroleerd en nergens een beslissing.
 * Geen bruikbare waarde (een link van vóór b32 zonder `iat`, of geen token):
 * null. */
function daglinkGeldigheid(token) {
  const p = tokenPayloadDeel(token, 0);
  if (!p || typeof p !== "object") return null;
  const { exp, iat } = p;
  return Number.isInteger(exp) && Number.isInteger(iat) && exp > iat ? exp - iat : null;
}
/* Dezelfde schrijfwijze als de werkruimte (duurTekst in mcp/server.ts):
 * "4 uur", "24 uur", "90 minuten"; naar beneden, nooit langer dan het is. */
function daglinkDuurTekst(seconden) {
  if (seconden >= 3600 && seconden % 3600 === 0) return seconden / 3600 + " uur";
  const minuten = Math.max(1, Math.floor(seconden / 60));
  return minuten + " " + (minuten === 1 ? "minuut" : "minuten");
}
/* De zin achter "Deze dashboardlink is verlopen." Zonder gegevens de vaste
 * zin van vóór s64; met een link van 24 uur levert de rekensom precies
 * dezelfde zin op (zonder afscherming dus byte-gelijk). Een waarde langer dan
 * een week is niet wat de werkruimte uitgeeft: dan een neutrale zin. */
const DAGLINK_GELDIG_STANDAARD = "Daglinks zijn 24 uur geldig.";
/* De duur zelf ("24 uur", "4 uur"), of null bij een waarde langer dan een
 * week. Eén rekensom voor de melding en de Hulp. */
function daglinkGeldigDuur(token) {
  const s = daglinkGeldigheid(token);
  if (s === null) return "24 uur";
  if (s > 7 * 24 * 3600) return null;
  return daglinkDuurTekst(s);
}
function daglinkGeldigTekst(token) {
  if (daglinkGeldigheid(token) === null) return DAGLINK_GELDIG_STANDAARD;
  const duur = daglinkGeldigDuur(token);
  return duur ? "Daglinks zijn " + duur + " geldig." : "Een daglink is maar een beperkte tijd geldig.";
}
/* s64 nafix (besluit 26-11) — de Hulp en de woordenlijst zeiden vast "24
 * uur". Kijk je met een daglink, dan staat er de duur van die link, met
 * dezelfde rekensom als de melding hierboven (een link van 24 uur, of een
 * zonder `iat`, geeft dus precies de tekst van vóór s64). Zonder daglink
 * (ingelogd, of de lege staat) weet het dashboard niet hoe lang een link van
 * dit team geldig is: dan een neutrale zin. `bron` mag null zijn. */
function daglinkVanBron(bron) {
  return bron && !bron.oauth && typeof bron.token === "string" && bron.token ? bron.token : null;
}
/* Voor de cel "Hoe lang" in de tabel Daglink of inloggen. */
function daglinkHulpDuur(bron) {
  const token = daglinkVanBron(bron);
  if (!token) return "Standaard 24 uur, in een afgeschermd team korter";
  return daglinkGeldigDuur(token) || "Een beperkte tijd";
}
/* Voor de woordenlijst: "de link …, <dit>". */
function daglinkHulpWoord(bron) {
  const token = daglinkVanBron(bron);
  if (!token) return "standaard 24 uur geldig, in een afgeschermd team korter";
  return (daglinkGeldigDuur(token) || "een beperkte tijd") + " geldig";
}

/* Welke bron gebruikt deze pagina?
 * - Een verse daglink in het fragment is een expliciete actie van de
 *   gebruiker en wint — behalve (b62) als er al een inlogsessie is voor
 *   dezelfde licentie: dan kun je met die sessie ook afhandelen, en er is
 *   geen reden om je terug te zetten op alleen-lezen. De daglink wordt dan
 *   wel uit de adresbalk gehaald en bewaard, als terugval.
 * - Is de licentie anders (iemand met meer licenties, of een gedeelde link),
 *   dan wint de daglink: stil een andere werkruimte tonen is erger.
 * - Daarna de sessie, en pas daarna een eerder opgeslagen daglink. */
function restoreBron() {
  const vers = parseDaglinkFragment(window.location.hash);
  const sessie = leesOauthSessie();
  if (vers) {
    const lic = daglinkLicentie(vers.token);
    if (sessie && lic && lic === sessieLicentie(sessie.access_token)) {
      restoreDaglink();
      return oauthBron(sessie);
    }
    return restoreDaglink();
  }
  if (sessie) return oauthBron(sessie);
  return restoreDaglink();
}

if (typeof module !== "undefined") {
  module.exports = {
    parseDaglinkFragment, hashLijktOpDaglink, loadWerkruimteBundle, restoreDaglink, vergeetDaglink, haalTeamfeed,
    tijdslimiet, isAfgebroken, VERZOEK_TIMEOUT_MS, VERZOEK_TIMEOUT_TEKST,
    bedrijfscontextUitEntries, maxBijgewerkt, rijVanEntry, schrijverLabel, herkomstTekst, DAGLINK_SS_KEY,
    emptyBundle, looksLikeMetricsPayload, metPlafond, saneerActivaties, haalOpdrachten, werkruimteDomeinen,
    fetchWerkruimte, schrijfWerkruimte, restoreBron, resetOauthVernieuwing, daglinkLicentie, sessieLicentie,
    tokenPayloadDeel, metSessie, isSessieBeeindigd,
    downloadExport, bestandsnaamUitHeader, daglinkGeldigheid, daglinkGeldigTekst, daglinkGeldigDuur, daglinkHulpDuur, daglinkHulpWoord,
  };
}
