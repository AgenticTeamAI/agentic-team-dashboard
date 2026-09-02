/* Geen telemetrie op het dashboard — harde voorwaarde bij de privacybelofte
 * (juridische toets 26-08-2026, backlogitem f25).
 *
 * De pagina belooft de bezoeker, in de UI zelf, dat zijn bedrijfsdata niet
 * langs onze servers komt en dat dit dashboard zelf niets bewaart of
 * verwerkt. Zodra er analytics, foutrapportage of welke meting dan ook naar
 * ons bij komt, is die tekst onjuist en moet hij mee veranderen. Deze test
 * bewaakt dat: hij faalt op het artefact, niet op de intentie.
 *
 * Let op: Vercel Web Analytics en Speed Insights zijn in het Vercel-dashboard
 * aan te zetten ZONDER codewijziging. De hash-only script-src blokkeert het
 * geïnjecteerde script wel, maar dat is een vangrail — niet de afspraak. De
 * afspraak is: uit laten staan, op zowel agentic-team-dashboard als
 * at-dashboard-staging. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(ROOT, "dashboard.html"), "utf8");
const VERCEL = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));

// Precies de hosts die dit dashboard mag noemen. Alles daarbuiten is een
// nieuwe bestemming en hoort een bewuste beslissing te zijn.
const TOEGESTANE_URLS = [
  "http://www.w3.org/2000/svg",        // XML-namespace van de inline SVG's
  "https://connector.agentic-team.ai", // de router naar de eigen werkruimte-instantie
  "https://dashboard.agentic-team.ai", // de eigen herkomst, genoemd in de privacytekst; ook de OAuth-redirect_uri
  "https://www.agentic-team.ai",       // p10: uitsluitend het token-endpoint (en de issuer/client_id-identifiers)
];

const CSP = VERCEL.headers
  .flatMap((r) => r.headers)
  .find((h) => h.key === "Content-Security-Policy").value;

/* Verbod 10/11 uit het OAuth-contract (p10, §11): de dashboard-CSP wordt
 * exact-match getest op `connect-src` én `script-src`, niet met `toContain`
 * of een niet-geankerde regex. Reden: een verbreding van connect-src (een
 * extra bestemming) of een verslapping van script-src ('unsafe-inline',
 * 'strict-dynamic', een host) moet híer zichtbaar rood worden vóórdat hij in
 * vercel.json staat — een `toContain` op het eerste stuk laat een toegevoegde
 * bron ongemerkt door. */
function cspDirectief(csp, naam) {
  const deel = csp
    .split(";")
    .map((s) => s.trim())
    .find((d) => d === naam || d.startsWith(naam + " "));
  return deel === undefined ? null : deel.slice(naam.length).trim();
}

// De volledige, letterlijke waarde. Wijzigen is een bewuste beslissing en
// hoort samen te gaan met de privacytekst en het README-hoofdstuk.
// p10 fase 3: `https://www.agentic-team.ai` is er bewust bij gekomen, en
// uitsluitend voor de token-uitwisseling van de OAuth-login (POST
// /api/oauth/token). Daar gaat geen klantdata langs — alleen een code of een
// refresh-token eruit en een access-token erin. Alle bedrijfsdata loopt
// onveranderd naar connector.agentic-team.ai.
const CONNECT_SRC = "https://connector.agentic-team.ai https://*.azurecontainerapps.io https://www.agentic-team.ai";

const VERBODEN = [
  ["sendBeacon", /sendBeacon/i],
  ["navigator.send", /navigator\s*\.\s*send/i],
  ["XMLHttpRequest", /XMLHttpRequest/],
  ["WebSocket", /new\s+WebSocket/],
  ["EventSource", /new\s+EventSource/],
  ["new Image() als tracking-pixel", /new\s+Image\s*\(/],
  ["dynamische import()", /[^.\w]import\s*\(/],
  ["Vercel Analytics / Speed Insights", /_vercel\/(insights|speed-insights)|@vercel\/(analytics|speed-insights)/i],
  ["Google Analytics / Tag Manager", /gtag\(|googletagmanager|google-analytics/i],
  ["PostHog", /posthog/i],
  ["Plausible", /plausible\.io/i],
  ["Matomo", /matomo/i],
  ["Hotjar", /hotjar/i],
  ["Mixpanel", /mixpanel/i],
  ["Segment", /segment\.(io|com)|analytics\.js/i],
  ["Datadog", /datadoghq|dd-trace/i],
  ["Umami", /umami/i],
  ["Sentry", /@sentry|sentry\.io|Sentry\.init/i],
];

describe("geen telemetrie — het gebouwde artefact", () => {
  it.each(VERBODEN)("bevat geen %s", (naam, patroon) => {
    expect(HTML, `dashboard.html bevat "${naam}" — dat breekt de privacybelofte in de UI`).not.toMatch(patroon);
  });

  it("noemt geen enkele host buiten de toegestane lijst", () => {
    const gevonden = [...new Set(HTML.match(/https?:\/\/[a-zA-Z0-9._/-]+/g) || [])];
    const onbekend = gevonden.filter((u) => !TOEGESTANE_URLS.some((ok) => u.startsWith(ok)));
    expect(onbekend, "nieuwe bestemming in dashboard.html — bewuste keuze, of een lek?").toEqual([]);
  });

  /* p10 fase 3: elke aanroep staat hier met naam en bestemming. Lezen en
   * schrijven (f23 fase D) dragen klantdata en gaan allebei uitsluitend naar
   * de eigen werkruimte via de router; de token-uitwisseling draagt
   * nadrukkelijk géén klantdata. f34 fase 0 voegt twee aanroepen op het eigen
   * domein toe: het moduleoverzicht (GET, alleen het Bearer-token) en het
   * wijzigingsverzoek (POST, alleen de door de gebruiker getypte wens) —
   * geen van beide raakt de bundel of de rijen. Komt er een nieuwe bij, dan
   * is dat hier een bewuste beslissing. */
  it("doet precies vijf netwerkaanroepen: lezen, schrijven, token-uitwisseling, moduleoverzicht, wijzigingsverzoek", () => {
    const fetches = HTML.match(/\bfetch\s*\(/g) || [];
    expect(fetches.length).toBe(5);
    // lezen én schrijven: allebei alleen naar bron.instantieUrl
    expect((HTML.match(/fetch\(bron\.instantieUrl \+ pad/g) || []).length).toBe(2);
    expect(HTML).toMatch(/fetch\(OAUTH_TOKEN_URL/);
    // f34: de twee eigen-domein-calls, elk tegen de vaste origin-constante.
    expect(HTML).toMatch(/fetch\(`\$\{MODULES_SITE_ORIGIN\}\/api\/dashboard\/modules`/);
    expect(HTML).toMatch(/fetch\(`\$\{MODULES_SITE_ORIGIN\}\/api\/dashboard\/modules\/verzoek`/);
  });

  it("stuurt naar agentic-team.ai alleen het token-endpoint en de modules-endpoints aan, en nooit iets uit de bundel", () => {
    // De enige twee URL-constantes op ons eigen domein die gefetcht worden.
    expect(HTML).toContain('const OAUTH_TOKEN_URL = "https://www.agentic-team.ai/api/oauth/token"');
    expect(HTML).toContain('const MODULES_SITE_ORIGIN = "https://www.agentic-team.ai"');
    // f34: ook de modules-aanroepen dragen nooit bundel- of rij-inhoud.
    expect(HTML).not.toMatch(/MODULES_SITE_ORIGIN[^;]*bundle/);
    // De body van die POST is opgebouwd uit een vaste verzameling velden; geen
    // ervan raakt de bundel, de rijen of de werkruimte-inhoud.
    const velden = [...HTML.matchAll(/grant_type: "(authorization_code|refresh_token)"/g)];
    expect(velden).toHaveLength(2);
    expect(HTML).not.toMatch(/OAUTH_TOKEN_URL[^;]*bundle/);
  });

  it("de CSP laat alleen de eigen werkruimte-bestemmingen toe — connect-src exact", () => {
    expect(cspDirectief(CSP, "default-src")).toBe("'none'");
    expect(cspDirectief(CSP, "connect-src")).toBe(CONNECT_SRC);
    expect(cspDirectief(CSP, "frame-ancestors")).toBe("'none'");
    expect(cspDirectief(CSP, "base-uri")).toBe("'none'");
    expect(cspDirectief(CSP, "form-action")).toBe("'none'");
    expect(CSP).not.toMatch(/unsafe-eval/);
  });

  it("script-src is exact de twee scripthashes, en gelijk aan de meta in het artefact", () => {
    const scriptSrc = cspDirectief(CSP, "script-src");
    const meta = HTML.match(/<meta http-equiv="Content-Security-Policy" content="script-src ([^"]+)">/);
    expect(meta, "dashboard.html draagt zijn eigen script-src-meta").not.toBeNull();
    // Header en artefact dragen letterlijk dezelfde lijst — geen van beide is
    // de enige drager, dus drift tussen build en vercel.json wordt hier rood.
    expect(scriptSrc).toBe(meta[1]);
    const bronnen = scriptSrc.split(" ");
    expect(bronnen).toHaveLength(2);
    // Verbod 11: uitsluitend sha256-hashes. Geen 'unsafe-inline', geen
    // 'unsafe-eval', geen 'strict-dynamic', geen host, geen nonce.
    for (const bron of bronnen) expect(bron).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
  });

  it("de goedgekeurde privacytekst staat letterlijk in het artefact", () => {
    expect(HTML).toContain("Je gegevens komen rechtstreeks uit je eigen werkruimte en blijven in je browser");
    expect(HTML).toContain("Het daglink-token staat achter het #-teken en wordt daarom nooit naar een server verstuurd");
    expect(HTML).toContain("De pagina zelf wordt wel van dashboard.agentic-team.ai geladen");
    // p10/B3: de inlogroute is een tweede manier om binnen te komen, en de
    // tekst moet allebei beschrijven. Verdwijnt deze zin, dan beschrijft de
    // verklaring nog maar de helft van wat het dashboard doet.
    expect(HTML).toContain("wisselt je browser eenmalig een inlogcode om bij agentic-team.ai");
    expect(HTML).toContain("In je browser bewaren we je inlogtoken en de daglink voor de duur van dit tabblad");
    // B3-toets: zonder deze zin kan een lezer opmaken dat inloggen spoorloos
    // is. Dat is het niet — de inlogwissel legt vast wélke licentie inlogt en
    // wanneer, en het privacyblok op de site vertelt dat ook. Valt deze zin
    // weg, dan spreken twee eigen teksten elkaar tegen.
    expect(HTML).toContain("wel zien wij daarbij dat er met jouw licentie is ingelogd, en wanneer");
  });

  /* Twee zinnen uit de versie van vóór de dashboard-login. Ze waren toen waar
   * en worden onwaar zodra er ingelogd kan worden: er staan dan inlogtokens in
   * de browser. Een herschrijving of een teruggedraaide merge kan ze zomaar
   * terugbrengen, en dan klopt de verklaring niet meer met wat de code doet —
   * zonder dat iemand het merkt. Juristronde 3, 28-08-2026, punt B3.
   *
   * ┌─ WAT DEZE TEST NIET KAN, EN JIJ WEL ────────────────────────────────┐
   * │ Deze lijst herkent alleen claims die we al kennen. Een NIEUWE       │
   * │ onjuiste zin — een die hier nog niet staat omdat niemand hem had    │
   * │ bedacht — komt er ongehinderd langs. Automatisering vervangt de     │
   * │ toets niet, ze bewaakt de uitkomst ervan.                           │
   * │                                                                     │
   * │ Leg de privacytekst opnieuw voor aan een jurist zodra:              │
   * │  · er iets bij komt dat de browser opslaat of naar ons stuurt;      │
   * │  · er een route bij komt om binnen te komen (nu: daglink, login);   │
   * │  · er iets aan onze kant wordt vastgelegd dat er nog niet stond;    │
   * │  · een zin met "alleen", "geen" of "nooit" wordt aangeraakt — dat   │
   * │    zijn uitputtende claims, en juist daar zat het in ronde 3 fout.  │
   * │                                                                     │
   * │ Voeg na zo'n toets de nieuwe zinnen hierboven toe én de vervangen   │
   * │ zinnen hieronder. Dan bewaakt deze test ook die ronde.              │
   * │ (Advies jurist bij de B3-toets, 28-08-2026.)                        │
   * └─────────────────────────────────────────────────────────────────────┘ */
  it("draagt geen claim meer die door de inlogroute onwaar is geworden", () => {
    const verboden = [
      [/bewaart en verwerkt zelf geen gegevens/i, "het dashboard bewaart nu inlogtokens in de browser"],
      [/Lokaal in je browser worden alleen het moment van laatst laden/i, "er staat nu ook een inlogtoken in de browser; 'alleen' is uitputtend"],
    ];
    for (const [patroon, waarom] of verboden) {
      expect(HTML, `oude claim staat weer in het artefact — ${waarom}`).not.toMatch(patroon);
    }
  });

  it("bewaart lokaal alleen wat de privacytekst noemt", () => {
    const sleutels = [...new Set(HTML.match(/"agentic-team-dashboard:[a-z-]+"/g) || [])];
    expect(sleutels.sort()).toEqual([
      '"agentic-team-dashboard:daglink"',        // sessionStorage, het token zelf
      '"agentic-team-dashboard:feed-filter"',    // sessionStorage, welke agent je filtert
      '"agentic-team-dashboard:laatst-gebruikt"',
      '"agentic-team-dashboard:minuten-per-actie"',
      '"agentic-team-dashboard:naam"',           // f33: localStorage, de naam waaronder je werkt (per seat)
      '"agentic-team-dashboard:oauth"',          // sessionStorage, de OAuth-tokens (p10)
      '"agentic-team-dashboard:oauth-pkce"',     // sessionStorage, verifier + state tijdens de redirect
    ]);
    // De twee p10-sleutels horen in sessionStorage, niet in localStorage:
    // tabblad dicht = weg, dezelfde eigenschap als de daglink. De
    // uitklaptekst noemt daarom nog steeds alleen de twee localStorage-items.
    for (const sleutel of ['agentic-team-dashboard:oauth', 'agentic-team-dashboard:oauth-pkce']) {
      expect(HTML).not.toMatch(new RegExp('localStorage\\.[a-zA-Z]+Item\\(\\s*"' + sleutel));
    }
    expect(HTML).toContain('const LS_KEY = "agentic-team-dashboard:laatst-gebruikt"');
    expect(HTML).toContain('const LS_MINUTEN_KEY = "agentic-team-dashboard:minuten-per-actie"');
  });
});
