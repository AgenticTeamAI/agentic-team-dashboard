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
const OAUTH_CLIENT_ID = "https://www.agentic-team.ai/oauth/clients/dashboard";
const OAUTH_REDIRECT_URI = "https://dashboard.agentic-team.ai/";
const OAUTH_SCOPE = "dashboard:lees";
const OAUTH_RESOURCE = "https://connector.agentic-team.ai/dashboard";
const OAUTH_ISSUER = "https://www.agentic-team.ai";

// Beide sleutels zijn sessionStorage (zie 2 hierboven). De naamgeving volgt de
// bestaande sleutels; test/geen-telemetrie.test.js pint de volledige lijst.
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

function bewaarPkce(waarde) {
  try { sessionStorage.setItem(OAUTH_PKCE_SS_KEY, JSON.stringify(waarde)); } catch (e) { /* privémodus */ }
}

function leesPkce() {
  try {
    const raw = sessionStorage.getItem(OAUTH_PKCE_SS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.verifier === "string" && typeof v.state === "string") return v;
  } catch (e) { /* privémodus of kapotte waarde */ }
  return null;
}

function vergeetPkce() {
  try { sessionStorage.removeItem(OAUTH_PKCE_SS_KEY); } catch (e) { /* zie boven */ }
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

async function startOauthLogin() {
  const verifier = maakVerifier();
  const state = base64url(willekeurigeBytes(16));
  const challenge = await maakChallenge(verifier);
  // Eerst opslaan, dán navigeren: andersom is er een venster waarin de
  // redirect terugkomt zonder dat de verifier bestaat.
  bewaarPkce({ verifier, state });
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
async function voltooiOauthLogin(redirect) {
  const bewaard = leesPkce();
  vergeetPkce();
  schoonAdresbalk();

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

/* ── De token-aanvraag: de enige call naar agentic-team.ai ─────────────── */

/**
 * POST naar /api/oauth/token, `application/x-www-form-urlencoded` (RFC 6749
 * §4.1.3 — nooit JSON). Er gaat geen enkel bedrijfsgegeven mee: alleen de
 * code of het refresh-token, de verifier en de client-identificatie.
 */
async function tokenAanvraag(velden) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(velden)) if (v != null) body.set(k, String(v));

  let res;
  try {
    res = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
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

if (typeof module !== "undefined") {
  module.exports = {
    OAUTH_AUTORISATIE_URL, OAUTH_TOKEN_URL, OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI,
    OAUTH_SCOPE, OAUTH_RESOURCE, OAUTH_SS_KEY, OAUTH_PKCE_SS_KEY,
    oauthDashboardAan, oauthMogelijk, base64url, maakVerifier, maakChallenge,
    bouwAutorisatieUrl, parseOauthRedirect, startOauthLogin, voltooiOauthLogin,
    tokenAanvraag, vernieuwOauthSessie, oauthBron, OauthFout,
    bewaarOauthSessie, leesOauthSessie, vergeetOauthSessie, bewaarPkce, leesPkce, vergeetPkce,
  };
}
