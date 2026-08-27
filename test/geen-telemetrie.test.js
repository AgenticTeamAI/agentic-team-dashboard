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
  "https://dashboard.agentic-team.ai", // de eigen herkomst, genoemd in de privacytekst
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
const CONNECT_SRC = "https://connector.agentic-team.ai https://*.azurecontainerapps.io";

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

  it("doet precies één netwerkaanroep, en die gaat naar de eigen werkruimte", () => {
    const fetches = HTML.match(/\bfetch\s*\(/g) || [];
    expect(fetches.length).toBe(1);
    expect(HTML).toMatch(/fetch\(daglink\.instantieUrl \+ pad/);
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
  });

  it("bewaart lokaal alleen wat de privacytekst noemt", () => {
    const sleutels = [...new Set(HTML.match(/"agentic-team-dashboard:[a-z-]+"/g) || [])];
    expect(sleutels.sort()).toEqual([
      '"agentic-team-dashboard:daglink"',        // sessionStorage, het token zelf
      '"agentic-team-dashboard:feed-filter"',    // sessionStorage, welke agent je filtert
      '"agentic-team-dashboard:laatst-gebruikt"',
      '"agentic-team-dashboard:minuten-per-actie"',
    ]);
  });
});
