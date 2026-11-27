/* p10 fase 3 — inloggen met je licentie, náást de daglink.
 *
 * Dit is de OAuth 2.1-clientkant van het dashboard: een publieke browser-client
 * met PKCE (S256), zonder client secret. Hij volgt het contract
 * `agent-architecture/architectuur/oauth-p10-contract.md` (v1.4):
 *
 *   client_id     https://www.agentic-team.ai/oauth/clients/dashboard   (§5a)
 *   redirect_uri  https://dashboard.agentic-team.ai/                    (§5a)
 *   scope         dashboard:lees                                       (§2)
 *   resource      https://connector.agentic-team.ai/dashboard           (§1)
 *
 * Drie eigenschappen die bewust zo zijn, en die de tests vastpinnen:
 *
 * 1. **De `code` komt terug in het #fragment**, niet in de query. Een fragment
 *    wordt door de browser nooit naar een server gestuurd, dus de code belandt
 *    in geen enkel access log — niet bij ons en niet bij de hostingprovider.
 *    Dat is exact de eigenschap die de daglink al had, en hij is hier zo
 *    mogelijk nóg belangrijker: de code is inwisselbaar voor een token.
 *    Direct na het lezen wordt de adresbalk leeggemaakt (history.replaceState).
 * 2. **Tokens staan in sessionStorage, niet in localStorage.** Tabblad dicht =
 *    weg. Dezelfde privacy-eigenschap als de daglink; een dashboard dat op een
 *    gedeelde laptop maandenlang ingelogd blijft is geen dashboard maar een lek.
 * 3. **Er gaat precies één soort verzoek naar agentic-team.ai: de
 *    token-uitwisseling.** Geen klantdata, in geen enkele richting: alleen de
 *    code/refresh-token eruit, een access-token erin. Alle bedrijfsdata loopt
 *    onveranderd browser ↔ eigen werkruimte-instantie via de router.
 *
 * De loginknop en deze hele flow zitten achter de build-vlag `--oauth`
 * (`OAUTH_DASHBOARD` op het Vercel-project, contract §9): build.py zet dan een
 * meta-tag `at-oauth` in het artefact. Terugrollen is een redeploy, geen
 * env-flip. De CSP-verbreding valt bewust buiten die vlag.
 * (Deze regel noemt de tag met opzet niet letterlijk: test/oauth-login.test.js
 * pint erop dat de release-build de tag zelf niet draagt.)
 */

const OAUTH_AUTORISATIE_URL = "https://www.agentic-team.ai/oauth/authorize";
const OAUTH_TOKEN_URL = "https://www.agentic-team.ai/api/oauth/token";
/* s66: de routes van de dashboardsessie op de site (de BFF, contract 2.17.0
 * §7g). Alleen in gebruik met de build-vlag DASHBOARD_SESSIE; zie onderaan. */
const SESSIE_INLOG_URL = "https://www.agentic-team.ai/api/dashboard/sessie/inloggen";
const SESSIE_TOKEN_URL = "https://www.agentic-team.ai/api/dashboard/sessie/token";
const SESSIE_UITLOG_URL = "https://www.agentic-team.ai/api/dashboard/sessie/uitloggen";
const SESSIE_UITLOG_OVERAL_URL = "https://www.agentic-team.ai/api/dashboard/sessie/uitloggen-overal";
const OAUTH_CLIENT_ID = "https://www.agentic-team.ai/oauth/clients/dashboard";
/* Losse link (dashboard v2): onder een pad op dezelfde origin keert de login
 * terug naar dat pad. build.py zet het pad als meta; zonder meta is het "/".
 * De site kent elke terugkeer-URL bij naam (redirect_uris, exacte match). */
function dashboardBasis() {
  try {
    const m = document.querySelector('meta[name="at-basis"]');
    const b = m && m.getAttribute("content");
    return b && /^\/[a-z0-9-]+\/$/.test(b) ? b : "/";
  } catch (e) {
    return "/";
  }
}
const OAUTH_REDIRECT_URI = "https://dashboard.agentic-team.ai" + dashboardBasis();
// f23: de login vraagt lezen én schrijven; de site bepaalt wat hij echt
// uitgeeft (contract 1.6 — beide, voor elke p10-login van de licentie).
const OAUTH_SCOPE = "dashboard:lees dashboard:schrijf";
const OAUTH_RESOURCE = "https://connector.agentic-team.ai/dashboard";
const OAUTH_ISSUER = "https://www.agentic-team.ai";

// Sessie in sessionStorage (zie 2 hierboven); de PKCE-verifier in
// localStorage met een kwartier-TTL (zie de uitleg bij bewaarPkce). De
// naamgeving volgt de bestaande sleutels; test/geen-telemetrie.test.js pint
// de volledige lijst.
const OAUTH_SS_KEY = "agentic-team-dashboard:oauth";
const OAUTH_PKCE_SS_KEY = "agentic-team-dashboard:oauth-pkce";

/* De build-vlag als meta-tag, in de trant van DASHBOARD_NOINDEX (contract §9).
 * Een meta is build-time (build.py zet hem alleen met --oauth), zichtbaar in
 * het artefact, en hij valt buiten de scripthashes — dus geen tweede build en
 * geen tweede artefact. */
function oauthDashboardAan() {
  try {
    return document.querySelector('meta[name="at-oauth"][content="1"]') !== null;
  } catch (e) {
    return false;
  }
}

/* Inloggen kan alleen op een echte http(s)-pagina: een redirect terug naar
 * https://dashboard.agentic-team.ai/ heeft geen betekenis als je het bestand
 * via file:// hebt geopend, en de tokenflow zou dan bovendien de belofte
 * breken dat een lokaal geopende pagina nul netwerkcalls doet. */
function oauthMogelijk() {
  if (!oauthDashboardAan()) return false;
  try {
    const p = window.location.protocol;
    return p === "https:" || p === "http:";
  } catch (e) {
    return false;
  }
}

/* ── PKCE (RFC 7636, S256) ─────────────────────────────────────────────── */

function base64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function willekeurigeBytes(n) {
  const uit = new Uint8Array(n);
  crypto.getRandomValues(uit);
  return uit;
}

/** 32 random bytes base64url = 43 tekens, ruim binnen de 43–128 van RFC 7636. */
function maakVerifier() {
  return base64url(willekeurigeBytes(32));
}

/** S256: base64url(sha256(ascii(verifier))). WebCrypto, geen eigen hash. */
async function maakChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/* ── De autorisatie-URL (contract §5a) ─────────────────────────────────── */

function bouwAutorisatieUrl({ challenge, state }) {
  const p = new URLSearchParams();
  p.set("response_type", "code");
  p.set("client_id", OAUTH_CLIENT_ID);
  p.set("redirect_uri", OAUTH_REDIRECT_URI);
  p.set("scope", OAUTH_SCOPE);
  // RFC 8707: waar dit token voor bedoeld is. Buiten de allowlist van §1 geeft
  // de site invalid_target — dat is precies de bedoeling.
  p.set("resource", OAUTH_RESOURCE);
  p.set("code_challenge", challenge);
  p.set("code_challenge_method", "S256");
  p.set("state", state);
  // Expliciet vragen om het fragment (OAuth 2.0 Multiple Response Type Encoding
  // Practices). Dit stond eerst niet in de aanvraag: we lázen het fragment maar
  // vroegen er niet om, en de site stuurde dus keurig de standaard — de query.
  // Het inloggen slaagde, de code kwam terug, en dit bestand zag hem niet.
  // Gevonden bij het eerste echte gebruik; geen van beide kanten was fout, er
  // was alleen niets afgesproken.
  p.set("response_mode", "fragment");
  return OAUTH_AUTORISATIE_URL + "?" + p.toString();
}

/* ── Opslag ────────────────────────────────────────────────────────────── */

/* De PKCE-verifier is de éne, bewuste uitzondering op regel 2 hierboven
 * (tokens in sessionStorage): de magic-link uit de mail opent vrijwel altijd
 * een níeuw tabblad, en sessionStorage is per tabblad — daarmee kon een
 * maillogin nooit afronden ("hoort niet bij dit tabblad", f23-klikproef
 * 1 sep). localStorage is gedeeld binnen dezelfde browser, zodat het nieuwe
 * tabblad de poging wél herkent. Het risico is klein en kort: een verifier is
 * waardeloos zonder de bijbehorende eenmalige code, en hij leeft hooguit zo
 * lang als de inloglink zelf (een kwartier) — daarna leest leesPkce hem niet
 * meer en ruimt hij zichzelf op. De tokens blijven gewoon in sessionStorage. */
const OAUTH_PKCE_TTL_MS = 15 * 60 * 1000;

function bewaarPkce(waarde) {
  try { localStorage.setItem(OAUTH_PKCE_SS_KEY, JSON.stringify(Object.assign({}, waarde, { t: Date.now() }))); } catch (e) { /* privémodus */ }
}

function leesPkce() {
  try {
    const raw = localStorage.getItem(OAUTH_PKCE_SS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.verifier === "string" && typeof v.state === "string"
      && typeof v.t === "number" && Date.now() - v.t <= OAUTH_PKCE_TTL_MS) return v;
    localStorage.removeItem(OAUTH_PKCE_SS_KEY);
  } catch (e) { /* privémodus of kapotte waarde */ }
  return null;
}

function vergeetPkce() {
  try { localStorage.removeItem(OAUTH_PKCE_SS_KEY); } catch (e) { /* zie boven */ }
}

function bewaarOauthSessie(sessie) {
  try { sessionStorage.setItem(OAUTH_SS_KEY, JSON.stringify(sessie)); } catch (e) { /* privémodus */ }
}

function leesOauthSessie() {
  try {
    const raw = sessionStorage.getItem(OAUTH_SS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && typeof s.access_token === "string" && s.access_token) return s;
  } catch (e) { /* privémodus of kapotte waarde */ }
  return null;
}

function vergeetOauthSessie() {
  try { sessionStorage.removeItem(OAUTH_SS_KEY); } catch (e) { /* zie boven */ }
}

/* ── Stap 1: wegsturen naar het consentscherm ──────────────────────────── */

/* f44: een deeplink achter de login. Open je
 * dashboard.agentic-team.ai/#/data/acties zonder sessie, dan wil je ná het
 * inloggen dáár uitkomen — niet op Vandaag, waar je opnieuw moet gaan zoeken.
 *
 * De bedoelde route reist mee in de PKCE-record die er al is: geen nieuwe
 * opslagsleutel, dus de uitputtende sleutellijst in geen-telemetrie.test.js
 * blijft precies zoals hij is, en de record ruimt zichzelf al op na gebruik.
 *
 * Alleen echte routes ("#/…"), nooit een daglinkfragment of een redirect — een
 * token hoort hier niet in te belanden. */
function bedoeldeRoute(hash) {
  const h = String(hash || "");
  return h.startsWith("#/") ? h : null;
}

async function startOauthLogin() {
  const verifier = maakVerifier();
  const state = base64url(willekeurigeBytes(16));
  const challenge = await maakChallenge(verifier);
  // Eerst opslaan, dán navigeren: andersom is er een venster waarin de
  // redirect terugkomt zonder dat de verifier bestaat.
  bewaarPkce({ verifier, state, route: bedoeldeRoute(window.location.hash) });
  window.location.href = bouwAutorisatieUrl({ challenge, state });
}

/* ── Stap 2: de redirect terug ─────────────────────────────────────────── */

/**
 * Leest `code`, `state` en `iss` uit het #fragment. Detailroutes ("#/…") en de
 * daglink (`#t=…`) blijven buiten schot; alles zonder `code` geeft null.
 */
function parseOauthRedirect(hash) {
  if (!hash || hash.startsWith("#/")) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const code = p.get("code");
  const fout = p.get("error");
  if (!code && !fout) return null;
  return {
    code: code || null,
    state: p.get("state"),
    iss: p.get("iss"),
    fout: fout || null,
    foutTekst: p.get("error_description"),
  };
}

/** Haalt de OAuth-parameters uit de adresbalk zodat ze niet in de history of
 *  in een per ongeluk gedeelde URL blijven staan — zelfde greep als de daglink. */
function schoonAdresbalk() {
  try {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch (e) { /* geen history (bv. file://) */ }
}

class OauthFout extends Error {}

/**
 * Wisselt de code in en levert de sessie. Gooit OauthFout met een leesbare
 * Nederlandse tekst; de aanroeper toont die naast de loginknop.
 */
let laatsteBedoeldeRoute = null;

/* De route die vóór het inloggen bedoeld was, precies één keer op te halen. */
function neemBedoeldeRoute() {
  const r = laatsteBedoeldeRoute;
  laatsteBedoeldeRoute = null;
  return r;
}

async function voltooiOauthLogin(redirect) {
  const bewaard = leesPkce();
  vergeetPkce();
  schoonAdresbalk();
  // Vóór elke foutafslag hieronder: is de state straks niet geldig, dan
  // gebruiken we hem toch niet — maar dan is er ook geen sessie.
  laatsteBedoeldeRoute = bewaard ? bedoeldeRoute(bewaard.route) : null;

  if (redirect.fout) {
    throw new OauthFout(
      redirect.fout === "access_denied"
        ? "Je hebt de koppeling afgebroken. Probeer opnieuw in te loggen."
        : "Inloggen is niet gelukt (" + redirect.fout + "). Probeer het opnieuw."
    );
  }
  if (!bewaard) {
    throw new OauthFout("Deze inlogpoging hoort niet bij dit tabblad. Klik opnieuw op inloggen.");
  }
  // CSRF: een `code` die bij een andere (of geen) state hoort komt niet van
  // onze eigen inlogpoging. Nooit inwisselen — dan is de aanvaller ingelogd
  // in jouw tabblad, of andersom.
  if (!redirect.state || redirect.state !== bewaard.state) {
    throw new OauthFout("Inloggen is afgebroken: het antwoord hoorde niet bij deze inlogpoging.");
  }
  // RFC 9207, geadverteerd in onze metadata: is `iss` er, dan moet hij kloppen.
  if (redirect.iss && redirect.iss !== OAUTH_ISSUER) {
    throw new OauthFout("Inloggen is afgebroken: het antwoord kwam niet van agentic-team.ai.");
  }

  const antwoord = await tokenAanvraag({
    grant_type: "authorization_code",
    code: redirect.code,
    code_verifier: bewaard.verifier,
    redirect_uri: OAUTH_REDIRECT_URI,
    client_id: OAUTH_CLIENT_ID,
    resource: OAUTH_RESOURCE,
  });
  bewaarOauthSessie(antwoord);
  return antwoord;
}

/* ── De POST naar agentic-team.ai: één fetch-plek voor vier bestemmingen ── */

/* s66: de vier POST-bestemmingen op ons eigen domein, op naam. De oude
 * token-uitwisseling (`token`) en de drie routes van de dashboardsessie
 * (`sessie`, `uitloggen`, `overal`, zie hieronder). Eén fetch-plek houdt de
 * inventaris in test/geen-telemetrie.test.js op precies vier, en deze tabel
 * is de exacte allowlist: een vijfde bestemming hoort hier een regel te
 * kosten. */
const SITE_POST_URLS = Object.freeze({
  token: OAUTH_TOKEN_URL,
  sessie: SESSIE_TOKEN_URL,
  uitloggen: SESSIE_UITLOG_URL,
  overal: SESSIE_UITLOG_OVERAL_URL,
});

/* Een 503 van de sessie-token-route (een rotatie die nog onderweg is, of een
 * storing) is één herhaling waard, na min(Retry-After, 2) seconden. Nooit een
 * lus. (Uitloggen kent dezelfde ene herhaling, in sessieUitloggen.)
 *
 * Let op: Retry-After is cross-origin alleen leesbaar als de site hem in
 * Access-Control-Expose-Headers zet, en dat doet ze (nog) niet. In een echte
 * browser geeft get() dan null, en is het in de praktijk dus altijd 2 s. Komt
 * de expose-header er, dan geldt vanzelf min(Retry-After, 2). */
const SESSIE_HERHAAL_MAX_MS = 2000;

function herhaalNaMs(res) {
  let kop = null;
  try { kop = res && res.headers && typeof res.headers.get === "function" ? res.headers.get("Retry-After") : null; } catch (e) { kop = null; }
  const s = kop === null || kop === "" ? NaN : Number(kop);
  return Number.isFinite(s) && s >= 0 ? Math.min(s * 1000, SESSIE_HERHAAL_MAX_MS) : SESSIE_HERHAAL_MAX_MS;
}

function wachtMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * De enige fetch naar agentic-team.ai buiten modulesFetch. Levert de Response
 * en gooit alleen bij een netwerkfout.
 *
 * - `token`: de oude token-uitwisseling, `application/x-www-form-urlencoded`
 *   (RFC 6749 §4.1.3, nooit JSON), zonder cookies. Er gaat geen enkel
 *   bedrijfsgegeven mee: alleen de code of het refresh-token, de verifier en
 *   de client-identificatie.
 * - de drie sessiebestemmingen (s66): een simple request zonder body en
 *   zonder eigen headers, mét cookies (credentials "include") zodat het
 *   httpOnly-cookie op www meegaat. Alleen met de vlag; dit is de enige plek
 *   in het hele artefact die cookies meestuurt (test/geen-telemetrie.test.js
 *   telt hem).
 */
async function sitePost(doel, velden) {
  if (!Object.prototype.hasOwnProperty.call(SITE_POST_URLS, doel)) throw new OauthFout("Onbekende bestemming.");
  const metCookie = doel !== "token";
  // Zonder de vlag gaat er nooit een verzoek mét cookies weg, ook niet als
  // iemand deze functie verkeerd aanroept.
  if (metCookie && !sessieAan()) throw new OauthFout("De dashboardsessie staat niet aan.");
  let opties;
  if (metCookie) {
    opties = { method: "POST", credentials: "include" };
  } else {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(velden || {})) if (v != null) body.set(k, String(v));
    opties = {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    };
  }
  for (let poging = 1; ; poging++) {
    const res = await fetch(SITE_POST_URLS[doel], opties);
    if (doel === "sessie" && res.status === 503 && poging === 1) {
      await wachtMs(herhaalNaMs(res));
      continue;
    }
    return res;
  }
}

/**
 * POST naar /api/oauth/token (via sitePost). Gooit OauthFout met een leesbare
 * Nederlandse tekst; de aanroeper toont die naast de loginknop.
 */
async function tokenAanvraag(velden) {
  let res;
  try {
    res = await sitePost("token", velden);
  } catch (e) {
    throw new OauthFout("agentic-team.ai is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.");
  }
  let payload = null;
  try { payload = await res.json(); } catch (e) { /* geen JSON — hieronder afgevangen */ }
  if (!res.ok || !payload || typeof payload.access_token !== "string") {
    // 503 = storing bij ons (contract §6), nooit "je grant is ongeldig".
    if (res.status === 503) {
      throw new OauthFout("Inloggen kan nu even niet — er is een storing aan onze kant. Probeer het zo opnieuw.");
    }
    throw new OauthFout("Inloggen is niet gelukt. Klik opnieuw op inloggen, of gebruik de daglink van je Coördinator.");
  }
  return payload;
}

/**
 * Eén refreshpoging. Levert de nieuwe sessie, of null als er niets meer te
 * vernieuwen valt — dan is de enige uitweg opnieuw inloggen. Bewust géén
 * herhaalde pogingen: een refresh die faalt faalt bij de tweede poging ook,
 * en een lus zou van een verlopen sessie een verzoekenregen maken.
 */
async function vernieuwOauthSessie() {
  const sessie = leesOauthSessie();
  if (!sessie || typeof sessie.refresh_token !== "string" || !sessie.refresh_token) return null;
  let nieuw;
  try {
    nieuw = await tokenAanvraag({
      grant_type: "refresh_token",
      refresh_token: sessie.refresh_token,
      client_id: OAUTH_CLIENT_ID,
      resource: OAUTH_RESOURCE,
    });
  } catch (e) {
    vergeetOauthSessie();
    return null;
  }
  bewaarOauthSessie(nieuw);
  return nieuw;
}

/**
 * De bronvorm die werkruimte-loader.js verwacht — hetzelfde
 * {token, instantieUrl}-paar als een daglink, met `oauth: true` erbij zodat de
 * loader weet dat een 401 hier één refreshpoging waard is. De bestemming is
 * altijd de router: het access-token draagt `aud`
 * https://connector.agentic-team.ai/dashboard, dus een andere host zou het
 * token toch weigeren.
 */
function oauthBron(sessie) {
  return { token: sessie.access_token, instantieUrl: CONNECTOR_ORIGIN, oauth: true };
}

/* ── s66 stap 1: de dashboardsessie (BFF op www, contract 2.17.0 §7g) ─────
 *
 * Besluit Tijmen 26-11-2026: met de build-vlag DASHBOARD_SESSIE blijft de
 * gebruiker ingelogd, ook als het tabblad dicht gaat. Het vervangingstoken
 * (refresh token) staat NIET in deze pagina maar in een httpOnly-cookie op
 * www.agentic-team.ai, gezet door de site (de BFF). Deze pagina ziet het nooit
 * en kan het dus ook niet lekken. Wat ze wél krijgt is een access-token van
 * een uur, en dat leeft alleen in een modulevariabele: nooit in sessionStorage
 * of localStorage.
 *
 * - Inloggen is een top-level navigatie naar SESSIE_INLOG_URL. Geen PKCE en
 *   geen browseropslag hier: de site maakt de verifier, wisselt de code in op
 *   haar eigen server en zet het cookie. Heeft de browser al een levende
 *   sessie, dan stuurt de site meteen terug, zonder mail.
 * - De site stuurt terug met #sessie=nieuw&r=<route> of #sessie=fout&reden=…
 *   (nooit een token in de URL); daarna haalt deze pagina met één POST naar
 *   SITE_POST_URLS.sessie een access-token.
 * - Lokaal staat alleen de markering SESSIE_LS_KEY = {"tot": <ISO>}, zonder
 *   token, seat of licentie. Ze is een optimalisatie: met markering vraagt de
 *   pagina bij het openen zelf een token, zonder markering doet de lege staat
 *   niets (en hervat de loginknop een levende sessie zonder mail).
 * - Identiteitspin: het eerste sessietoken van dit tabblad legt licentie en
 *   seat vast. Eén cookie per browser betekent dat een ander tabblad met een
 *   ander account kan inloggen; een token voor een andere identiteit wordt
 *   hier nooit gebruikt.
 *
 * De oude flow hierboven blijft bestaan als terugrolpad. Zonder de vlag
 * verandert er niets. */
const SESSIE_LS_KEY = "agentic-team-dashboard:sessie";

const SESSIE_ANDER_ACCOUNT_TEKST = "Je bent in een ander tabblad met een ander account ingelogd. Laad de pagina opnieuw.";
const SESSIE_BEEINDIGD_TEKST = "Je sessie is beëindigd (je rol is gewijzigd of je bent overal uitgelogd). Log opnieuw in.";
const SESSIE_VERLOPEN_TEKST = "Je sessie is verlopen. Log opnieuw in met je licentie.";
const SESSIE_STORING_TEKST = "Inloggen kan nu even niet — er is een storing aan onze kant. Probeer het zo opnieuw.";

/* De redenen die de site in #sessie=fout&reden=… meegeeft (contract §7g b).
 * De tekst komt uit deze tabel, nooit uit de URL. */
const SESSIE_FOUT_TEKST = Object.freeze({
  andere_poging: "Deze inlogpoging hoort niet bij deze browser, of hij is verlopen. Klik opnieuw op inloggen.",
  afgebroken: "Je hebt het inloggen afgebroken. Probeer het opnieuw.",
  geweigerd: "Inloggen is niet gelukt: de inlogcode werd niet geaccepteerd. Klik opnieuw op inloggen.",
  storing: SESSIE_STORING_TEKST,
});
const SESSIE_FOUT_ONBEKEND = "Inloggen is niet gelukt. Klik opnieuw op inloggen, of gebruik de daglink van je Coördinator.";

/* De build-vlag als meta-tag, zoals at-oauth (build.py --sessie). */
function sessieAan() {
  try {
    return document.querySelector('meta[name="at-sessie"][content="1"]') !== null;
  } catch (e) {
    return false;
  }
}

/* De nieuwe flow loopt alleen met de vlag én waar inloggen kan (de at-oauth-
 * vlag en een http(s)-pagina). Via file:// blijft het nul netwerkaanroepen. */
function sessieFlowAan() {
  return sessieAan() && oauthMogelijk();
}

/* ── geheugen en markering ─────────────────────────────────────────────── */

let sessieToegang = null; // het access-token: alleen hier, nooit in opslag
let sessieVerlooptOp = 0; // ms; uit expires_in
let sessiePin = null; // {lic, seat} van het eerste sessietoken in dit tabblad

/** {lic, seat} uit de payload van een access-token, of null. Alleen lezen om
 *  te vergelijken: de router en de instantie toetsen de handtekening. */
function sessieIdentiteit(token) {
  const p = tokenPayloadDeel(token, 1);
  if (!p || typeof p.lic !== "string" || !p.lic || typeof p.seat !== "string" || !p.seat) return null;
  return { lic: p.lic, seat: p.seat };
}

function sessiePinVan() {
  return sessiePin ? { lic: sessiePin.lic, seat: sessiePin.seat } : null;
}

function vergeetSessieGeheugen() {
  sessieToegang = null;
  sessieVerlooptOp = 0;
}

function sessieTokenBijnaVerlopen(token) {
  return !!token && token === sessieToegang && Date.now() >= sessieVerlooptOp - 60 * 1000;
}

/** De markering, alleen als ze geldig is en nog niet verstreken; anders weg. */
function leesSessieMarkering() {
  try {
    const raw = localStorage.getItem(SESSIE_LS_KEY);
    if (!raw) return null;
    let m = null;
    try { m = JSON.parse(raw); } catch (e) { m = null; }
    const tot = m && typeof m.tot === "string" ? Date.parse(m.tot) : NaN;
    if (Number.isFinite(tot) && tot > Date.now()) return { tot: m.tot };
    localStorage.removeItem(SESSIE_LS_KEY);
  } catch (e) { /* privémodus */ }
  return null;
}

/** Alleen {"tot": <ISO>}: geen token, geen seat, geen licentie. */
function zetSessieMarkering(tot) {
  if (typeof tot !== "string" || !Number.isFinite(Date.parse(tot))) return;
  try { localStorage.setItem(SESSIE_LS_KEY, JSON.stringify({ tot: new Date(Date.parse(tot)).toISOString() })); } catch (e) { /* privémodus */ }
}

function vergeetSessieMarkering() {
  try { localStorage.removeItem(SESSIE_LS_KEY); } catch (e) { /* zie boven */ }
}

/* Met de vlag horen de sleutels van de oude tabbladflow er niet meer: een
 * achtergebleven refresh-token in sessionStorage is precies wat s66 weghaalt.
 * Geen omwisselroute: die zou een gestolen tabbladtoken tot een sessie van 30
 * dagen maken. De gebruiker logt één keer opnieuw in. */
function vergeetOudeOauthOpslag() {
  vergeetOauthSessie();
  vergeetPkce();
}

/* ── wie het einde van een sessie afhandelt (app.js) ──────────────────── */

let sessieEindeHandler = null;
function bijSessieEinde(fn) {
  sessieEindeHandler = typeof fn === "function" ? fn : null;
}
function meldSessieEinde(titel, tekst) {
  if (sessieEindeHandler) {
    try { sessieEindeHandler(titel, tekst); } catch (e) { /* de melding mag het verzoek niet breken */ }
  }
}

/* Uitloggen bij de site loopt soms nog terwijl de lege staat al staat (na een
 * 401 'beeindigd'). Inloggen wacht daarop: anders hervat /inloggen het cookie
 * dat we net wilden weggooien. */
let sessieAfsluiten = null;
function wachtOpSessieAfsluiten() {
  return sessieAfsluiten ? sessieAfsluiten.catch(() => {}) : Promise.resolve();
}
function houdInloggenTegen(belofte) {
  const p = Promise.resolve(belofte).catch(() => {});
  sessieAfsluiten = p;
  p.then(() => { if (sessieAfsluiten === p) sessieAfsluiten = null; });
  return p;
}

/* ── de fragmenten waarmee de site terugstuurt ─────────────────────────── */

/**
 * #sessie=nieuw&r=<route>  → {nieuw: true, route}
 * #sessie=fout&reden=<r>   → {fout: true, reden, tekst}
 * Alles anders: null. De route geldt alleen als hij op "#/" begint, met de
 * tekens die de site ook toelaat.
 */
function parseSessieFragment(hash) {
  const h = String(hash || "");
  if (!h || h.startsWith("#/")) return null;
  let p;
  try { p = new URLSearchParams(h.replace(/^#/, "")); } catch (e) { return null; }
  const soort = p.get("sessie");
  if (soort === "nieuw") {
    const r = p.get("r") || "";
    return { nieuw: true, route: /^#\/[A-Za-z0-9/_.~%-]{0,200}$/.test(r) ? r : null };
  }
  if (soort === "fout") {
    const reden = p.get("reden");
    const bekend = typeof reden === "string" && Object.prototype.hasOwnProperty.call(SESSIE_FOUT_TEKST, reden);
    return { fout: true, reden: bekend ? reden : null, tekst: bekend ? SESSIE_FOUT_TEKST[reden] : SESSIE_FOUT_ONBEKEND };
  }
  return null;
}

/* ── inloggen: een navigatie, geen fetch ───────────────────────────────── */

function sessieInlogUrl(hash) {
  return SESSIE_INLOG_URL + "?terug=" + dashboardBasis() + "&route=" + encodeURIComponent(bedoeldeRoute(hash) || "");
}

async function startSessieLogin() {
  await wachtOpSessieAfsluiten();
  window.location.href = sessieInlogUrl(window.location.hash);
}

/* ── het token ophalen ─────────────────────────────────────────────────── */

class SessieFout extends OauthFout {
  constructor(soort, tekst) {
    super(tekst);
    this.soort = soort;
  }
}

/**
 * Eén POST naar de sessie-token-route (bij een 503 binnen sitePost één keer
 * herhaald). Levert {access_token, sessie_tot}; het token staat daarna in het
 * geheugen. Alleen access_token, expires_in en sessie_tot worden gelezen;
 * al het andere in het antwoord wordt genegeerd en nergens bewaard (de site
 * stuurt nooit een vervangingstoken mee).
 *
 * - 401: geen of geen geldige sessie meer. De markering gaat weg.
 * - 503 (ook na de herhaling): storing. De markering blijft.
 * - Een token voor een andere licentie of seat dan de pin van dit tabblad:
 *   niet gebruikt, geheugen leeg, en het einde gemeld (lege staat).
 */
async function haalSessieToken() {
  let res;
  try {
    res = await sitePost("sessie");
  } catch (e) {
    throw new SessieFout("netwerk", "agentic-team.ai is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.");
  }
  let payload = null;
  try { payload = await res.json(); } catch (e) { /* geen JSON — hieronder afgevangen */ }
  if (res.status === 401) {
    vergeetSessieMarkering();
    vergeetSessieGeheugen();
    throw new SessieFout("verlopen", SESSIE_VERLOPEN_TEKST);
  }
  if (res.status === 503) throw new SessieFout("storing", SESSIE_STORING_TEKST);
  const token = res.ok && payload && typeof payload.access_token === "string" ? payload.access_token : "";
  const id = token ? sessieIdentiteit(token) : null;
  if (!id) throw new SessieFout("onverwacht", SESSIE_FOUT_ONBEKEND);
  if (sessiePin && (id.lic !== sessiePin.lic || id.seat !== sessiePin.seat)) {
    vergeetSessieGeheugen();
    meldSessieEinde("Ander account", SESSIE_ANDER_ACCOUNT_TEKST);
    throw new SessieFout("ander_account", SESSIE_ANDER_ACCOUNT_TEKST);
  }
  if (!sessiePin) sessiePin = id;
  sessieToegang = token;
  const exp = Number(payload.expires_in);
  sessieVerlooptOp = Date.now() + (Number.isFinite(exp) && exp > 0 ? Math.min(exp, 3600) : 3600) * 1000;
  zetSessieMarkering(payload.sessie_tot);
  return { access_token: token, sessie_tot: typeof payload.sessie_tot === "string" ? payload.sessie_tot : null };
}

/** De bronvorm voor de loader: als een OAuth-sessie, met `sessie: true`. */
function sessieBron(token) {
  return { token, instantieUrl: CONNECTOR_ORIGIN, oauth: true, sessie: true };
}

/* ── uitloggen ─────────────────────────────────────────────────────────── */

/** De voetnoot bij uitloggen overal als stap 2 (de instantie) mislukte. */
const SESSIE_OVERAL_ZONDER_INSTANTIE_TEKST = "Open tabbladen elders stoppen uiterlijk binnen een uur. Heeft je licentie afscherming (Business), dan verlopen de daglinks die voor jou zijn gemaakt pas vanzelf.";

/** De tekst als de site het cookie niet wiste (zie sessieUitloggen). */
const SESSIE_UITLOG_MISLUKT_TEKST = "Uitloggen bij agentic-team.ai is niet gelukt; je kunt in deze browser nog ingelogd raken. Probeer het opnieuw.";

/* Eén POST uitloggen: true alleen bij een 2xx. Een netwerkfout is false. */
function siteUitloggenEens() {
  return sitePost("uitloggen").then((res) => ({ ok: !!(res && res.ok), res }), () => ({ ok: false, res: null }));
}

/**
 * POST uitloggen bij de site (idempotent). Het geheugen gaat altijd meteen
 * leeg. Lukt het niet (geen 2xx, of een netwerkfout), dan één herhaling na
 * min(Retry-After, 2) s, zoals bij de token-route; nooit een lus.
 *
 * De site wist het cookie alleen als ze de familie ook echt introk (een 503
 * laat het cookie bewust staan). Daarom gaat de markering pas weg als het
 * uitloggen lukte: mislukt het ook na de herhaling, dan is er in deze browser
 * nog een levende sessie, en dan klopt "ingelogd" voor de andere tabbladen en
 * voor de loginknop (die hervat het cookie zonder mail). De aanroeper zegt dan
 * niet "Je bent uitgelogd".
 *
 * `markeringMeteenWeg` (na een 401 'beeindigd'): de markering gaat vóór het
 * verzoek weg; de sessie is dan al voorbij bij de instantie.
 *
 * Levert true of false; gooit nooit. Inloggen wacht tot dit klaar is.
 */
function sessieUitloggen({ markeringMeteenWeg = false } = {}) {
  if (markeringMeteenWeg) vergeetSessieMarkering();
  vergeetSessieGeheugen();
  const p = (async () => {
    let poging = await siteUitloggenEens();
    if (!poging.ok) {
      await wachtMs(herhaalNaMs(poging.res));
      poging = await siteUitloggenEens();
    }
    if (poging.ok) vergeetSessieMarkering();
    return poging.ok;
  })();
  houdInloggenTegen(p);
  return p;
}

/* Na een 401 met {sessie: "beeindigd"} van de instantie: één keer uitloggen
 * bij de site (ook als er meer verzoeken tegelijk die 401 kregen), en het
 * einde melden.
 *
 * Bekende rand (bewust zo, zie README §Ingelogd blijven): dit uitloggen toetst
 * de identiteitspin niet, want na 'beeindigd' wordt nooit meer een token
 * gehaald. Logde een ander tabblad in het afgelopen uur in met een ander
 * account (dat nam het cookie over), dan logt dit ook dát account uit. Dat is
 * ongemak (opnieuw inloggen met mail), geen datalek. */
let sessieBeeindigdBezig = null;
function sessieIsBeeindigd() {
  if (!sessieBeeindigdBezig) {
    sessieBeeindigdBezig = sessieUitloggen({ markeringMeteenWeg: true }).finally(() => { sessieBeeindigdBezig = null; });
    meldSessieEinde("Je sessie is beëindigd", SESSIE_BEEINDIGD_TEKST);
  }
  return sessieBeeindigdBezig;
}

/**
 * Uitloggen op alle apparaten, in deze volgorde (contract §7g):
 *  1. een vers token (c); wijkt de identiteit af van de pin, dan afbreken;
 *  2. POST /dashboard/sessies/intrekken {} naar de eigen instantie met dát
 *     token, via schrijfWerkruimte (geen nieuwe fetch-plek). Een fout is niet
 *     fataal: dan stoppen open tabbladen elders uiterlijk binnen een uur;
 *  3. POST uitloggen-overal bij de site (e);
 *  4. markering en geheugen weg.
 * Inloggen wacht tot dit klaar is. Levert {gelukt, instantie, tekst}, en
 * `mislukt: true` als zowel de instantie als de site faalde (dan blijft de
 * markering staan, zie hieronder).
 */
async function sessieUitloggenOveral() {
  const werk = (async () => {
    const pin = sessiePinVan();
    let vers;
    try {
      vers = await haalSessieToken();
    } catch (e) {
      if (e && e.soort === "ander_account") return { gelukt: false, afgebroken: true, tekst: SESSIE_ANDER_ACCOUNT_TEKST };
      if (e && e.soort === "verlopen") {
        return { gelukt: false, tekst: "Je sessie in deze browser was al verlopen. Log opnieuw in en probeer het nog eens om ook op je andere apparaten uit te loggen." };
      }
      return { gelukt: false, afgebroken: true, behoud: true, tekst: (e && e.message) || SESSIE_STORING_TEKST };
    }
    // haalSessieToken toetst de pin al; dit is de tweede, expliciete grendel
    // vóór het enige verzoek dat met dit token wegging.
    const id = sessieIdentiteit(vers.access_token);
    if (!id || (pin && (id.lic !== pin.lic || id.seat !== pin.seat))) {
      vergeetSessieGeheugen();
      return { gelukt: false, afgebroken: true, tekst: SESSIE_ANDER_ACCOUNT_TEKST };
    }
    let instantie = false;
    try {
      // `eenmalig`: geen vernieuwing en geen tweede poging bij een 401.
      await schrijfWerkruimte({ token: vers.access_token, instantieUrl: CONNECTOR_ORIGIN, oauth: true, sessie: true, eenmalig: true },
        "POST", "/dashboard/sessies/intrekken", {});
      instantie = true;
    } catch (e) {
      instantie = false;
    }
    let site = false;
    try {
      const res = await sitePost("overal");
      site = res.ok;
    } catch (e) {
      site = false;
    }
    if (!site && !instantie) {
      // Besluit 27-11-2026: de site trok het cookie niet in en de instantie
      // beëindigde de sessies niet. Dan is er in deze browser mogelijk nog een
      // levende sessie, en zou "In dit tabblad ben je uitgelogd" liegen. Net
      // als bij een mislukt gewoon uitloggen (sessieUitloggen): het geheugen
      // weg, de markering blijft, en de aanroeper toont de fout met "Opnieuw
      // uitloggen" in plaats van de loginknop.
      vergeetSessieGeheugen();
      return { gelukt: false, instantie, mislukt: true, tekst: SESSIE_UITLOG_MISLUKT_TEKST };
    }
    vergeetSessieMarkering();
    vergeetSessieGeheugen();
    if (!site) {
      return { gelukt: false, instantie, tekst: "Uitloggen op je andere apparaten is niet gelukt door een storing. In dit tabblad ben je uitgelogd. Probeer het zo opnieuw." };
    }
    return {
      gelukt: true,
      instantie,
      // Zonder stap 2 zijn ook de daglinks van deze seat (Business) niet
      // ingetrokken; de bevestiging beloofde dat voorwaardelijk, dus hier
      // dezelfde voorwaarde.
      tekst: "Je bent op alle apparaten uitgelogd." + (instantie ? "" : " " + SESSIE_OVERAL_ZONDER_INSTANTIE_TEKST),
    };
  })();
  houdInloggenTegen(werk);
  return werk;
}

if (typeof module !== "undefined") {
  module.exports = {
    OAUTH_AUTORISATIE_URL, OAUTH_TOKEN_URL, OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI,
    OAUTH_SCOPE, OAUTH_RESOURCE, OAUTH_SS_KEY, OAUTH_PKCE_SS_KEY,
    oauthDashboardAan, oauthMogelijk, base64url, maakVerifier, maakChallenge,
    bouwAutorisatieUrl, parseOauthRedirect, bedoeldeRoute, neemBedoeldeRoute, startOauthLogin, voltooiOauthLogin,
    tokenAanvraag, vernieuwOauthSessie, oauthBron, OauthFout,
    bewaarOauthSessie, leesOauthSessie, vergeetOauthSessie, bewaarPkce, leesPkce, vergeetPkce,
    SITE_POST_URLS, sitePost, herhaalNaMs, SESSIE_HERHAAL_MAX_MS,
    SESSIE_INLOG_URL, SESSIE_TOKEN_URL, SESSIE_UITLOG_URL, SESSIE_UITLOG_OVERAL_URL, SESSIE_LS_KEY,
    SESSIE_ANDER_ACCOUNT_TEKST, SESSIE_BEEINDIGD_TEKST, SESSIE_FOUT_TEKST,
    SESSIE_UITLOG_MISLUKT_TEKST, SESSIE_OVERAL_ZONDER_INSTANTIE_TEKST,
    sessieAan, sessieFlowAan, sessieIdentiteit, sessiePinVan, vergeetSessieGeheugen, sessieTokenBijnaVerlopen,
    leesSessieMarkering, zetSessieMarkering, vergeetSessieMarkering, vergeetOudeOauthOpslag,
    bijSessieEinde, wachtOpSessieAfsluiten, parseSessieFragment, sessieInlogUrl, startSessieLogin,
    SessieFout, haalSessieToken, sessieBron, sessieUitloggen, sessieIsBeeindigd, sessieUitloggenOveral,
  };
}
