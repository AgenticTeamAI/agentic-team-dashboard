// @vitest-environment jsdom
/* b62 — daglink en Notion-weergave blokkeren afhandelen.
 *
 * Drie dingen:
 * - een inlogsessie wint van een verse daglink, maar alleen voor dezelfde
 *   licentie (wie meer licenties heeft, mag niet stil in een andere
 *   werkruimte uitkomen);
 * - naast een metricsbestand komen de rijen gewoon uit je werkruimte, en wie
 *   ingelogd is mag die bijwerken — per domein, via de bronkoppeling;
 * - één eerlijke regel bovenaan: meekijken met een daglink (met een
 *   inlogknop), of acties die in Notion wonen. */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [
  "schema/schema.generated.js",
  "src/teksten.js",
  "src/schema-helpers.js",
  "src/werkruimte-loader.js",
  "src/oauth-client.js",
  "src/zones.js",
  "src/voor-jou.js",
  "src/metrics-sanitize.js",
  "src/metrics.js",
  "src/render.js",
  "src/charts.js",
  "src/feed.js",
  "src/homepage.js",
  "src/databrowser.js",
  "src/data-bewerken.js",
  "src/item-blad.js",
  "src/voor-jou-scherm.js",
  "src/acties-tab.js",
  "src/modules-beheer.js",
  "src/team-beheer.js",
  "src/app.js",
];

let g;
beforeAll(() => {
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
});
afterEach(() => {
  sessionStorage.clear();
  window.location.hash = "";
  document.head.querySelectorAll('meta[name="at-oauth"]').forEach(m => m.remove());
});

const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const daglink = (licentie) => `${b64({ scope: "lees", licentie, exp: 9999999999, jti: "x" })}.handtekening`;
const jwt = (lic, scope = "dashboard:lees dashboard:schrijf") => `kop.${b64({ lic, scope, sub: `${lic}#seat` })}.handtekening`;
const OAUTH_KEY = "agentic-team-dashboard:oauth";

describe("b62 — de sessie wint van de daglink, alleen bij dezelfde licentie", () => {
  it("leest de licentie uit beide tokens", () => {
    expect(g.daglinkLicentie(daglink("at_een"))).toBe("at_een");
    expect(g.sessieLicentie(jwt("at_een"))).toBe("at_een");
    expect(g.daglinkLicentie("rommel")).toBeNull();
  });

  it("dezelfde licentie: de sessie, zodat je kunt afhandelen — de daglink blijft als terugval", () => {
    sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ access_token: jwt("at_een") }));
    window.location.hash = "#t=" + daglink("at_een");
    const bron = g.restoreBron();
    expect(bron.oauth).toBe(true);
    expect(window.location.hash).toBe(""); // het token staat niet meer in de adresbalk
    expect(sessionStorage.getItem("agentic-team-dashboard:daglink")).toContain("handtekening");
  });

  it("een andere licentie: de daglink, want stil een andere werkruimte tonen is erger", () => {
    sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ access_token: jwt("at_een") }));
    window.location.hash = "#t=" + daglink("at_twee");
    const bron = g.restoreBron();
    expect(bron.oauth).toBeFalsy();
    expect(g.daglinkLicentie(bron.token)).toBe("at_twee");
  });

  it("zonder daglink: gewoon de sessie", () => {
    sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ access_token: jwt("at_een") }));
    expect(g.restoreBron().oauth).toBe(true);
  });
});

describe("b62 — schrijven naast een metricsbestand", () => {
  const metricsBundel = (systeemPerDomein = {}) => ({
    kind: "metrics", source: "werkruimte", systeemPerDomein,
    domains: { acties: { rows: [{ __entryId: "a1", Actie: "x", Status: "Open" }] } },
  });

  it("ingelogd mag je je werkruimte-rijen bijwerken, ook op de metricsroute", () => {
    const ctx = { schema: g.AGENTIC_TEAM_SCHEMA, bundle: metricsBundel(), kanSchrijven: true };
    expect(g.magDomeinBewerken(ctx, "acties").ok).toBe(true);
  });

  it("wat in Notion woont blijft lezen, met de reden erbij", () => {
    const ctx = { schema: g.AGENTIC_TEAM_SCHEMA, bundle: metricsBundel({ acties: "notion" }), kanSchrijven: true };
    const m = g.magDomeinBewerken(ctx, "acties");
    expect(m.ok).toBe(false);
    expect(m.reden).toContain("Notion");
  });

  it("de daglink blijft alleen-lezen", () => {
    const ctx = { schema: g.AGENTIC_TEAM_SCHEMA, bundle: metricsBundel(), kanSchrijven: false };
    expect(g.magDomeinBewerken(ctx, "acties").ok).toBe(false);
  });
});

describe("b62 — de balk bovenaan", () => {
  const ctxMet = (bron, systeemPerDomein = {}) => ({
    schema: g.AGENTIC_TEAM_SCHEMA, bron,
    bundle: { kind: "rows", source: "werkruimte", systeemPerDomein, domains: {} },
  });

  it("daglink: meekijken, met een inlogknop die hier terugkomt", () => {
    const meta = document.createElement("meta");
    meta.name = "at-oauth"; meta.content = "1";
    document.head.appendChild(meta);
    const html = g.toegangsBalkHtml(ctxMet({ token: daglink("at_een") }));
    expect(html).toContain("Je kijkt mee met je daglink");
    expect(html).toContain("data-login");
  });

  it("acties in Notion: eerlijk zeggen waar je afhandelt", () => {
    const html = g.toegangsBalkHtml(ctxMet({ oauth: true, token: jwt("at_een") }, { acties: "notion" }));
    expect(html).toContain("Je acties staan in Notion");
  });

  it("ingelogd met je werkruimte: geen balk", () => {
    expect(g.toegangsBalkHtml(ctxMet({ oauth: true, token: jwt("at_een") }, { acties: "werkruimte" }))).toBe("");
  });
});
