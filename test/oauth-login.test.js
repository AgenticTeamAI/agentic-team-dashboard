/* p10 fase 3 — de loginroute end-to-end op het ÉCHTE, gebouwde dashboard.html.
 *
 * Zelfde harnas als test/integratie.test.js: elke test opent zijn eigen JSDOM
 * met runScripts, zodat DOMContentLoaded, de redirect-afhandeling en de
 * loginknop echt lopen. Vereist een actuele build (python3 scripts/build.py).
 *
 * De build-vlag: `python3 scripts/build.py --oauth` (Vercel: OAUTH_DASHBOARD)
 * zet één meta-tag in het artefact. De release-build hier heeft de vlag UIT,
 * dus de tests die de loginknop nodig hebben plakken exact diezelfde meta in
 * de HTML-string — en pinnen apart dat build.py precies dat doet.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(ROOT, "dashboard.html"), "utf8");
const BUILD_PY = readFileSync(join(ROOT, "scripts", "build.py"), "utf8");
const VERCEL = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "test/fixtures/oauth-fixture.json"), "utf8"));

const OAUTH_META = '<meta name="at-oauth" content="1">';
const DASHBOARD_JWT = FIXTURE.tokens.dashboard.jwt;
const TOKEN_URL = "https://www.agentic-team.ai/api/oauth/token";
const CONNECTOR = "https://connector.agentic-team.ai";

/** De HTML zoals `build.py --oauth` hem zou opleveren. */
const HTML_MET_LOGIN = HTML.replace("<title>", OAUTH_META + "\n<title>");

const OVERZICHT = { klant: "Testbedrijf BV", intern: false, domeinen: [{ domein: "acties", aantal: 1 }] };
const ENTRIES = {
  acties: [{
    domein: "acties", entryId: "a-1",
    data: { Actie: "Offerte nabellen", Status: "Open", Agent: "dealmaker" },
    aangemaakt: "2026-08-20T09:00:00Z", bijgewerkt: "2026-08-20T09:00:00Z",
  }],
};

/* ── harnas ───────────────────────────────────────────────────────────── */

async function open({
  html = HTML,
  url = "http://localhost/dashboard.html",
  sessie = null,
  pkce = null,
  tokenAntwoord = null,
  geldigToken = DASHBOARD_JWT,
} = {}) {
  const fouten = [];
  const gevraagd = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url,
    pretendToBeVisual: true,
    beforeParse(w) {
      w.console.error = (...a) => fouten.push(a.map(String).join(" "));
      w.scrollTo = () => {};
      w.addEventListener("error", (e) => fouten.push("error:" + e.message));
      w.Response = Response;
      try {
        if (sessie) w.sessionStorage.setItem("agentic-team-dashboard:oauth", JSON.stringify(sessie));
        if (pkce) w.localStorage.setItem("agentic-team-dashboard:oauth-pkce", JSON.stringify(Object.assign({ t: Date.now() }, pkce)));
      } catch (e) { /* file:// heeft geen sessionStorage — dan hoort dit ook niet nodig te zijn */ }
      w.fetch = async (u, opties = {}) => {
        const full = String(u);
        gevraagd.push({ url: full, opties });
        const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });

        if (full === TOKEN_URL) {
          const velden = new URLSearchParams(opties.body);
          const antwoord = typeof tokenAntwoord === "function" ? tokenAntwoord(velden) : tokenAntwoord;
          if (!antwoord) return json(400, { error: "invalid_grant" });
          return json(antwoord.status || 200, antwoord.body);
        }

        const parsed = new URL(full);
        if ((opties.headers || {}).Authorization !== "Bearer " + geldigToken) {
          return json(401, { fout: "Deze dashboardlink is verlopen. Vraag je Coördinator om een nieuwe." });
        }
        if (parsed.pathname === "/dashboard/overzicht") return json(200, OVERZICHT);
        if (parsed.pathname === "/dashboard/entries") {
          const d = parsed.searchParams.get("domein");
          if (!ENTRIES[d]) return json(400, { fout: "Onbekend domein " + d });
          return json(200, { domein: d, entries: ENTRIES[d] });
        }
        return json(404, { fout: "Onbekende route" });
      };
    },
  });
  const w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  const $ = (id) => w.document.getElementById(id);
  const zichtbaar = (id) => $(id) && $(id).style.display !== "none";
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function tot(conditie, wat) {
    for (let i = 0; i < 400; i++) {
      await tick();
      if (conditie()) return;
    }
    throw new Error("timeout: " + wat);
  }
  return { w, $, zichtbaar, gevraagd, fouten, tot, tick };
}

/* ── de vlag ──────────────────────────────────────────────────────────── */

describe("de build-vlag OAUTH_DASHBOARD", () => {
  it("is build-time: build.py zet de meta alleen met --oauth", () => {
    expect(BUILD_PY).toContain(`'${OAUTH_META}' if oauth else ""`);
    expect(BUILD_PY).toContain('oauth = "--oauth" in sys.argv');
    expect(VERCEL.buildCommand).toContain("${OAUTH_DASHBOARD:+--oauth}");
  });

  it("staat in de gecommitte release-build uit", () => {
    expect(HTML).not.toContain(OAUTH_META);
  });

  it("de CSP-verbreding staat bewust BUITEN de vlag — die is onvoorwaardelijk", () => {
    const csp = VERCEL.headers.flatMap((r) => r.headers).find((h) => h.key === "Content-Security-Policy").value;
    expect(csp).toContain("https://www.agentic-team.ai");
  });
});

/* ── de loginknop ─────────────────────────────────────────────────────── */

describe("de loginknop in de lege staat", () => {
  it("staat er náást de daglink-uitleg zodra de vlag aan is", async () => {
    const { $, zichtbaar, gevraagd } = await open({ html: HTML_MET_LOGIN });
    expect(zichtbaar("empty-state")).toBe(true);
    expect($("empty-state-tekst").textContent).toContain("daglink");
    expect(zichtbaar("empty-state-acties")).toBe(true);
    expect($("btn-oauth-login").textContent).toContain("Inloggen");
    // De lege staat doet nog steeds geen enkele netwerkaanroep.
    expect(gevraagd).toEqual([]);
  });

  it("blijft weg zonder de vlag", async () => {
    const { zichtbaar, gevraagd } = await open();
    expect(zichtbaar("empty-state")).toBe(true);
    expect(zichtbaar("empty-state-acties")).toBe(false);
    expect(gevraagd).toEqual([]);
  });

  it("blijft weg via file://, ook mét de vlag — en die pagina doet nul netwerkcalls", async () => {
    const { zichtbaar, gevraagd, fouten } = await open({
      html: HTML_MET_LOGIN,
      url: "file:///Users/iemand/Downloads/dashboard.html",
    });
    expect(zichtbaar("empty-state")).toBe(true);
    expect(zichtbaar("empty-state-acties")).toBe(false);
    expect(gevraagd).toEqual([]);
    expect(fouten).toEqual([]);
  });
});

/* ── de terugkomst van het consentscherm ──────────────────────────────── */

describe("terug van /oauth/authorize", () => {
  const PKCE = { verifier: "V".repeat(43), state: "ST-123" };

  it("wisselt de code in, laadt de werkruimte en haalt de code uit de adresbalk", async () => {
    const { $, w, zichtbaar, gevraagd, tot } = await open({
      html: HTML_MET_LOGIN,
      url: "http://localhost/dashboard.html#code=atc_test&state=ST-123&iss=https%3A%2F%2Fwww.agentic-team.ai",
      pkce: PKCE,
      tokenAntwoord: { body: { access_token: DASHBOARD_JWT, token_type: "Bearer", expires_in: 3600, refresh_token: "atr_1", scope: "dashboard:lees" } },
    });
    await tot(() => zichtbaar("tabbar"), "dashboard geladen na inloggen");

    // 1. de code is ingewisseld, form-urlencoded, met verifier en redirect_uri
    const token = gevraagd.find((g) => g.url === TOKEN_URL);
    expect(token).toBeTruthy();
    const velden = new URLSearchParams(token.opties.body);
    expect(velden.get("grant_type")).toBe("authorization_code");
    expect(velden.get("code")).toBe("atc_test");
    expect(velden.get("code_verifier")).toBe(PKCE.verifier);

    // 2. de code staat niet meer in de adresbalk (en dus niet in de history)
    expect(w.location.hash).toBe("");
    expect(w.location.href).not.toContain("atc_test");

    // 3. alle werkdata gaat naar de router, met het JWT als Bearer
    const naarWerkruimte = gevraagd.filter((g) => g.url.startsWith(CONNECTOR));
    expect(naarWerkruimte.length).toBeGreaterThan(0);
    for (const g of naarWerkruimte) expect(g.opties.headers.Authorization).toBe("Bearer " + DASHBOARD_JWT);

    // 4. en naar agentic-team.ai ging precies één token-call; de enige andere
    //    toegestane site-call is het f34-moduleoverzicht (leesactie met het
    //    JWT, draagt geen bundeldata en mag falen zonder dat iets breekt)
    const naarSite = gevraagd.filter((g) => g.url.startsWith("https://www.agentic-team.ai"));
    expect(naarSite.filter((g) => g.url.includes("/api/oauth/token"))).toHaveLength(1);
    for (const g of naarSite) expect(g.url).toMatch(/\/api\/(oauth\/token|dashboard\/modules)$/);
    expect(w.__dashboardCtx.bundle.sourceLabel).toBe("werkruimte van Testbedrijf BV");
  });

  it("weigert een state die niet klopt, en zet de loginknop terug", async () => {
    const { $, zichtbaar, gevraagd, tot } = await open({
      html: HTML_MET_LOGIN,
      url: "http://localhost/dashboard.html#code=atc_test&state=VERVALST&iss=https%3A%2F%2Fwww.agentic-team.ai",
      pkce: PKCE,
      tokenAntwoord: { body: { access_token: DASHBOARD_JWT } },
    });
    await tot(() => $("empty-state-titel").textContent === "Inloggen is niet gelukt", "foutmelding");
    expect($("empty-state-tekst").textContent).toContain("hoorde niet bij deze inlogpoging");
    expect(zichtbaar("empty-state-acties")).toBe(true);
    expect(gevraagd).toEqual([]);
  });
});

/* ── 401 → één refresh → loginknop ────────────────────────────────────── */

describe("een verlopen sessie", () => {
  const OUDE_SESSIE = { access_token: "oud.jwt.verlopen", token_type: "Bearer", refresh_token: "atr_oud", scope: "dashboard:lees" };

  it("vernieuwt één keer en laadt daarna gewoon door", async () => {
    const { w, zichtbaar, gevraagd, tot } = await open({
      html: HTML_MET_LOGIN,
      sessie: OUDE_SESSIE,
      geldigToken: DASHBOARD_JWT, // alleen het vernieuwde token wordt geaccepteerd
      tokenAntwoord: { body: { access_token: DASHBOARD_JWT, token_type: "Bearer", refresh_token: "atr_nieuw", scope: "dashboard:lees" } },
    });
    await tot(() => zichtbaar("tabbar"), "dashboard geladen na refresh");
    expect(gevraagd.filter((g) => g.url === TOKEN_URL)).toHaveLength(1);
    expect(w.__dashboardCtx.bundle.sourceLabel).toBe("werkruimte van Testbedrijf BV");
  });

  it("valt na een mislukte refresh terug op de loginknop, met een leesbare melding", async () => {
    const { $, zichtbaar, gevraagd, w, tot } = await open({
      html: HTML_MET_LOGIN,
      sessie: OUDE_SESSIE,
      tokenAntwoord: { status: 400, body: { error: "invalid_grant" } },
    });
    await tot(() => $("empty-state-titel").textContent === "Kon je werkruimte niet laden", "terug naar de lege staat");
    expect($("empty-state-tekst").textContent).toBe("Je sessie is verlopen. Log opnieuw in met je licentie.");
    expect(zichtbaar("empty-state-acties")).toBe(true);
    expect(zichtbaar("tabbar")).toBe(false);
    // Precies één refreshpoging, en de dode sessie is opgeruimd.
    expect(gevraagd.filter((g) => g.url === TOKEN_URL)).toHaveLength(1);
    expect(w.sessionStorage.getItem("agentic-team-dashboard:oauth")).toBeNull();
  });
});
