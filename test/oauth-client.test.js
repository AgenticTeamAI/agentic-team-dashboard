/* p10 fase 3 — de OAuth-clientkant van het dashboard (src/oauth-client.js) en
 * de 401-afhandeling in src/werkruimte-loader.js.
 *
 * Zelfde harnas als test/xss.test.js: de echte src-modules draaien in de
 * globale scope, zodat hier precies de code getest wordt die ook in
 * dashboard.html belandt. Draait bewust in de node-omgeving (niet jsdom):
 * jsdom heeft geen WebCrypto, en PKCE S256 hoort tegen de echte
 * `crypto.subtle` getoetst te worden, niet tegen een polyfill.
 *
 * De end-to-end-kant (loginknop, redirect, 401 → refresh → loginknop in de
 * echte pagina) staat in test/oauth-login.test.js.
 */
import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "test/fixtures/oauth-fixture.json"), "utf8"));

/* Het dashboard-token uit de gedeelde contractfixture (contract §12). Het
 * dashboard is een OAuth-*client*: hij verifieert dit token nooit — dat doen
 * de router en de instantie. Wat hier telt is dat het token dat uit /token
 * komt onveranderd als Bearer naar de router gaat. */
const DASHBOARD_JWT = FIXTURE.tokens.dashboard.jwt;

const MODULES = ["src/werkruimte-loader.js", "src/oauth-client.js"];

let g;
beforeAll(() => {
  for (const rel of MODULES) {
    vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  }
  g = globalThis;
});

/* ── stubs voor de browser-API's die de module gebruikt ───────────────── */

function nieuweSessionStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

let vervangenUrl;
let genavigeerdNaar;
let fetches;

function zetOmgeving({ protocol = "https:", hash = "", oauthVlag = true } = {}) {
  vervangenUrl = [];
  genavigeerdNaar = [];
  fetches = [];
  globalThis.sessionStorage = nieuweSessionStorage();
  // f23-magic-linkfix: de PKCE-verifier leeft in localStorage (nieuw tabblad
  // uit de mail moet de poging herkennen); zelfde mock-vorm.
  globalThis.localStorage = nieuweSessionStorage();
  globalThis.document = {
    querySelector: (sel) => (oauthVlag && sel === 'meta[name="at-oauth"][content="1"]' ? {} : null),
  };
  globalThis.history = { replaceState: (_s, _t, url) => vervangenUrl.push(url) };
  globalThis.window = {
    location: {
      protocol,
      hash,
      pathname: "/",
      search: "",
      set href(v) { genavigeerdNaar.push(v); },
      get href() { return genavigeerdNaar[genavigeerdNaar.length - 1]; },
    },
  };
  g.resetOauthVernieuwing();
}

/** Antwoorden in volgorde; elke aanroep wordt vastgelegd in `fetches`. */
function zetFetch(antwoorden) {
  const rij = antwoorden.slice();
  globalThis.fetch = async (url, opties = {}) => {
    fetches.push({ url: String(url), opties });
    const volgende = rij.length > 1 ? rij.shift() : rij[0];
    if (typeof volgende === "function") return volgende();
    return volgende;
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const TOKENANTWOORD = {
  access_token: DASHBOARD_JWT,
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "atr_eerste",
  scope: "dashboard:lees dashboard:schrijf",
};

beforeEach(() => zetOmgeving());

/* ── PKCE (RFC 7636) ──────────────────────────────────────────────────── */

describe("PKCE (S256)", () => {
  /* De bekende vector uit RFC 7636 appendix B. Dit is de enige manier om te
   * bewijzen dat we S256 doen zoals de site het verwacht: base64url zonder
   * padding, over de ASCII-bytes van de verifier, niet over een hex- of
   * base64-tussenvorm. */
  const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("maakt de challenge van de RFC-vector exact zoals de RFC voorschrijft", async () => {
    expect(await g.maakChallenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
  });

  it("verifiers zijn base64url, 43 tekens, en nooit twee keer hetzelfde", () => {
    const a = g.maakVerifier();
    const b = g.maakVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("base64url gebruikt - en _ en laat de padding weg", () => {
    // 0xFB 0xFF 0xBE → "+/++" in gewoon base64.
    expect(g.base64url(new Uint8Array([0xfb, 0xff, 0xbe]))).toBe("-_--");
    expect(g.base64url(new Uint8Array([1]))).toBe("AQ");
  });
});

/* ── De autorisatie-URL (contract §5a) ───────────────────────────────── */

describe("autorisatie-URL", () => {
  it("draagt exact de parameters die het contract eist", () => {
    const url = new URL(g.bouwAutorisatieUrl({ challenge: "CH", state: "ST" }));
    expect(url.origin + url.pathname).toBe("https://www.agentic-team.ai/oauth/authorize");
    const p = url.searchParams;
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe("https://www.agentic-team.ai/oauth/clients/dashboard");
    expect(p.get("redirect_uri")).toBe("https://dashboard.agentic-team.ai/");
    expect(p.get("scope")).toBe("dashboard:lees dashboard:schrijf");
    expect(p.get("resource")).toBe("https://connector.agentic-team.ai/dashboard");
    expect(p.get("code_challenge")).toBe("CH");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("state")).toBe("ST");
    // Geen client_secret: dit is een publieke client (token_endpoint_auth_method "none").
    expect(p.get("client_secret")).toBeNull();
  });

  it("vraagt expliciet om het fragment", () => {
    /* Dit ontbrak, en het kostte een werkende inlog. Dit bestand LÁS het
     * fragment (zie de uitleg bovenin: een fragment komt in geen enkel access
     * log) maar VROEG er niet om. De site stuurde dus keurig de standaard — de
     * code in de query — en `parseOauthRedirect` keek naar het fragment en zag
     * niets. Het inloggen slaagde, de code kwam terug, en het dashboard bleef
     * leeg.
     *
     * De aanname stond alleen in een comment. Nu staat hij in de aanvraag én
     * hier, zodat hij niet opnieuw stilzwijgend kan verdwijnen. */
    const p = new URL(g.bouwAutorisatieUrl({ challenge: "CH", state: "ST" })).searchParams;
    expect(p.get("response_mode")).toBe("fragment");
  });

  it("startOauthLogin bewaart verifier + state en navigeert met de bijbehorende challenge", async () => {
    await g.startOauthLogin();
    const bewaard = JSON.parse(localStorage.getItem("agentic-team-dashboard:oauth-pkce"));
    expect(bewaard.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(genavigeerdNaar).toHaveLength(1);
    const p = new URL(genavigeerdNaar[0]).searchParams;
    expect(p.get("state")).toBe(bewaard.state);
    expect(p.get("code_challenge")).toBe(await g.maakChallenge(bewaard.verifier));
    // De verifier zelf verlaat de browser hier nooit.
    expect(genavigeerdNaar[0]).not.toContain(bewaard.verifier);
  });
});

/* ── De redirect terug: fragment, niet query ─────────────────────────── */

describe("parseOauthRedirect", () => {
  it("leest code, state en iss uit het #fragment", () => {
    expect(g.parseOauthRedirect("#code=atc_x&state=ST&iss=https%3A%2F%2Fwww.agentic-team.ai")).toEqual({
      code: "atc_x", state: "ST", iss: "https://www.agentic-team.ai", fout: null, foutTekst: null,
    });
  });

  it("laat detailroutes, de daglink en een leeg fragment met rust", () => {
    expect(g.parseOauthRedirect("#/detail/aandacht")).toBeNull();
    expect(g.parseOauthRedirect("#/data/acties")).toBeNull();
    expect(g.parseOauthRedirect("#t=daglinktoken")).toBeNull();
    expect(g.parseOauthRedirect("")).toBeNull();
    expect(g.parseOauthRedirect(null)).toBeNull();
  });

  it("herkent een foutantwoord van het consentscherm", () => {
    const uit = g.parseOauthRedirect("#error=access_denied&state=ST");
    expect(uit.fout).toBe("access_denied");
    expect(uit.code).toBeNull();
  });
});

/* ── De inwisseling ──────────────────────────────────────────────────── */

describe("voltooiOauthLogin", () => {
  function metPkce(state = "ST", verifier = "V".repeat(43)) {
    localStorage.setItem("agentic-team-dashboard:oauth-pkce", JSON.stringify({ verifier, state, t: Date.now() }));
  }

  it("wisselt de code in, bewaart de sessie en maakt de adresbalk leeg", async () => {
    metPkce();
    zetFetch([json(200, TOKENANTWOORD)]);
    const sessie = await g.voltooiOauthLogin({ code: "atc_x", state: "ST", iss: "https://www.agentic-team.ai", fout: null });

    expect(sessie.access_token).toBe(DASHBOARD_JWT);
    // sessionStorage, niet localStorage: tabblad dicht = weg.
    expect(JSON.parse(sessionStorage.getItem("agentic-team-dashboard:oauth")).access_token).toBe(DASHBOARD_JWT);
    // De code mag niet in de history of in een gedeelde URL achterblijven.
    expect(vervangenUrl).toEqual(["/"]);
    // De PKCE-verifier is eenmalig en meteen opgeruimd.
    expect(localStorage.getItem("agentic-team-dashboard:oauth-pkce")).toBeNull();

    const [aanroep] = fetches;
    expect(aanroep.url).toBe("https://www.agentic-team.ai/api/oauth/token");
    expect(aanroep.opties.method).toBe("POST");
    expect(aanroep.opties.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(aanroep.opties.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("atc_x");
    expect(body.get("code_verifier")).toBe("V".repeat(43));
    expect(body.get("redirect_uri")).toBe("https://dashboard.agentic-team.ai/");
    expect(body.get("client_id")).toBe("https://www.agentic-team.ai/oauth/clients/dashboard");
    expect(body.get("resource")).toBe("https://connector.agentic-team.ai/dashboard");
  });

  it("weigert een state die niet bij deze inlogpoging hoort — zonder ook maar te fetchen", async () => {
    metPkce("ST");
    zetFetch([json(200, TOKENANTWOORD)]);
    await expect(g.voltooiOauthLogin({ code: "atc_x", state: "ANDERS", iss: null, fout: null }))
      .rejects.toThrow(/hoorde niet bij deze inlogpoging/);
    expect(fetches).toHaveLength(0);
    expect(sessionStorage.getItem("agentic-team-dashboard:oauth")).toBeNull();
    // Ook de adresbalk is opgeruimd: een afgewezen code hoort er niet te blijven staan.
    expect(vervangenUrl).toEqual(["/"]);
  });

  it("weigert een antwoord zonder state", async () => {
    metPkce("ST");
    zetFetch([json(200, TOKENANTWOORD)]);
    await expect(g.voltooiOauthLogin({ code: "atc_x", state: null, iss: null, fout: null })).rejects.toThrow();
    expect(fetches).toHaveLength(0);
  });

  it("weigert een antwoord van een andere issuer (RFC 9207)", async () => {
    metPkce("ST");
    zetFetch([json(200, TOKENANTWOORD)]);
    await expect(g.voltooiOauthLogin({ code: "atc_x", state: "ST", iss: "https://kwaad.example", fout: null }))
      .rejects.toThrow(/niet van agentic-team\.ai/);
    expect(fetches).toHaveLength(0);
  });

  it("weigert een redirect zonder bewaarde verifier (ander tabblad, of geplakte URL)", async () => {
    zetFetch([json(200, TOKENANTWOORD)]);
    await expect(g.voltooiOauthLogin({ code: "atc_x", state: "ST", iss: null, fout: null }))
      .rejects.toThrow(/hoort niet bij dit tabblad/);
    expect(fetches).toHaveLength(0);
  });

  it("vertaalt een foutantwoord van het consentscherm naar leesbare tekst", async () => {
    metPkce();
    zetFetch([json(200, TOKENANTWOORD)]);
    await expect(g.voltooiOauthLogin({ code: null, state: "ST", iss: null, fout: "access_denied" }))
      .rejects.toThrow(/afgebroken/);
    expect(fetches).toHaveLength(0);
  });

  it("noemt een 503 een storing, geen ongeldige inlog", async () => {
    metPkce();
    zetFetch([json(503, { error: "temporarily_unavailable" })]);
    await expect(g.voltooiOauthLogin({ code: "atc_x", state: "ST", iss: null, fout: null }))
      .rejects.toThrow(/storing aan onze kant/);
  });

  it("weigert een 200 zonder access_token", async () => {
    metPkce();
    zetFetch([json(200, { token_type: "Bearer" })]);
    await expect(g.voltooiOauthLogin({ code: "atc_x", state: "ST", iss: null, fout: null })).rejects.toThrow();
    expect(sessionStorage.getItem("agentic-team-dashboard:oauth")).toBeNull();
  });
});

/* ── 401 → één refresh ───────────────────────────────────────────────── */

describe("fetchWerkruimte met een OAuth-sessie", () => {
  const BRON = () => ({ token: DASHBOARD_JWT, instantieUrl: "https://connector.agentic-team.ai", oauth: true });

  function metSessie(refresh = "atr_eerste") {
    sessionStorage.setItem("agentic-team-dashboard:oauth",
      JSON.stringify({ ...TOKENANTWOORD, refresh_token: refresh }));
  }

  it("vernieuwt bij een 401 één keer en doet het verzoek daarna opnieuw", async () => {
    metSessie();
    const bron = BRON();
    zetFetch([
      json(401, { fout: "verlopen" }),                                        // werkruimte
      json(200, { ...TOKENANTWOORD, access_token: "nieuw.jwt.hier", refresh_token: "atr_tweede" }), // /token
      json(200, { klant: "Testbedrijf", domeinen: [] }),                      // werkruimte, opnieuw
    ]);
    const body = await g.fetchWerkruimte(bron, "/dashboard/overzicht");
    expect(body.klant).toBe("Testbedrijf");
    expect(fetches.map((f) => f.url)).toEqual([
      "https://connector.agentic-team.ai/dashboard/overzicht",
      "https://www.agentic-team.ai/api/oauth/token",
      "https://connector.agentic-team.ai/dashboard/overzicht",
    ]);
    const refreshBody = new URLSearchParams(fetches[1].opties.body);
    expect(refreshBody.get("grant_type")).toBe("refresh_token");
    expect(refreshBody.get("refresh_token")).toBe("atr_eerste");
    // De herhaalde poging draagt het nieuwe token, en de sessie is geroteerd.
    expect(fetches[2].opties.headers.Authorization).toBe("Bearer nieuw.jwt.hier");
    expect(JSON.parse(sessionStorage.getItem("agentic-team-dashboard:oauth")).refresh_token).toBe("atr_tweede");
  });

  it("geeft na een mislukte refresh een oauthVerlopen-fout — en probeert het geen tweede keer", async () => {
    metSessie();
    const bron = BRON();
    zetFetch([
      json(401, { fout: "verlopen" }),
      json(400, { error: "invalid_grant" }),
    ]);
    await expect(g.fetchWerkruimte(bron, "/dashboard/overzicht")).rejects.toMatchObject({ oauthVerlopen: true });
    // Sessie weg: opnieuw inloggen is de enige uitweg.
    expect(sessionStorage.getItem("agentic-team-dashboard:oauth")).toBeNull();

    // Een tweede verzoek in dezelfde laadronde vernieuwt niet nóg een keer.
    const voor = fetches.length;
    zetFetch([json(401, { fout: "verlopen" })]);
    fetches.length = 0;
    await expect(g.fetchWerkruimte(bron, "/dashboard/entries?domein=acties")).rejects.toMatchObject({ oauthVerlopen: true });
    expect(fetches.map((f) => f.url)).toEqual(["https://connector.agentic-team.ai/dashboard/entries?domein=acties"]);
    expect(voor).toBe(2);
  });

  it("vernieuwt één keer, ook als vier verzoeken tegelijk een 401 krijgen", async () => {
    metSessie();
    const bron = BRON();
    let werkruimteRondes = 0;
    globalThis.fetch = async (url, opties = {}) => {
      fetches.push({ url: String(url), opties });
      if (String(url).includes("/api/oauth/token")) {
        return json(200, { ...TOKENANTWOORD, access_token: "nieuw.jwt.hier" });
      }
      werkruimteRondes++;
      return opties.headers.Authorization === "Bearer nieuw.jwt.hier"
        ? json(200, { entries: [] })
        : json(401, { fout: "verlopen" });
    };
    await Promise.all([1, 2, 3, 4].map((i) => g.fetchWerkruimte(bron, "/dashboard/entries?domein=d" + i)));
    const tokencalls = fetches.filter((f) => f.url.includes("/api/oauth/token"));
    // Precies één refresh: vier tegelijk zou de refresh-familie intrekken (contract §4).
    expect(tokencalls).toHaveLength(1);
    expect(werkruimteRondes).toBe(8); // vier keer 401, vier keer opnieuw
  });

  it("vernieuwt niet bij een daglink — die is niet te vernieuwen", async () => {
    const bron = { token: "daglinktoken", instantieUrl: "https://connector.agentic-team.ai" };
    zetFetch([json(401, { fout: "Deze dashboardlink is verlopen. Vraag je Coördinator om een nieuwe." })]);
    await expect(g.fetchWerkruimte(bron, "/dashboard/overzicht")).rejects.toMatchObject({ daglinkVerlopen: true });
    expect(fetches).toHaveLength(1);
  });

  it("behandelt een 403 (verkeerde scope) als 'opnieuw inloggen', niet als 'vernieuwen'", async () => {
    metSessie();
    zetFetch([json(403, { fout: "Dit token geeft geen toegang tot het dashboard." })]);
    await expect(g.fetchWerkruimte(BRON(), "/dashboard/overzicht")).rejects.toMatchObject({ oauthVerlopen: true });
    expect(fetches).toHaveLength(1);
  });
});

/* ── Bronkeuze en de vlag ────────────────────────────────────────────── */

describe("restoreBron", () => {
  it("kiest het JWT als er een sessie is", () => {
    sessionStorage.setItem("agentic-team-dashboard:oauth", JSON.stringify(TOKENANTWOORD));
    expect(g.restoreBron()).toEqual({
      token: DASHBOARD_JWT, instantieUrl: "https://connector.agentic-team.ai", oauth: true,
    });
  });

  it("valt terug op de daglink als er geen sessie is", () => {
    sessionStorage.setItem("agentic-team-dashboard:daglink",
      JSON.stringify({ token: "daglinktoken", instantieUrl: "https://connector.agentic-team.ai" }));
    expect(g.restoreBron()).toEqual({ token: "daglinktoken", instantieUrl: "https://connector.agentic-team.ai" });
  });

  it("laat een verse daglink in het fragment winnen van een lopende sessie", () => {
    zetOmgeving({ hash: "#t=versedaglink" });
    sessionStorage.setItem("agentic-team-dashboard:oauth", JSON.stringify(TOKENANTWOORD));
    expect(g.restoreBron()).toEqual({ token: "versedaglink", instantieUrl: "https://connector.agentic-team.ai" });
  });

  it("geeft null zonder sessie én zonder daglink", () => {
    expect(g.restoreBron()).toBeNull();
  });
});

describe("de build-vlag en file://", () => {
  it("inloggen kan alleen met de vlag aan", () => {
    expect(g.oauthMogelijk()).toBe(true);
    zetOmgeving({ oauthVlag: false });
    expect(g.oauthDashboardAan()).toBe(false);
    expect(g.oauthMogelijk()).toBe(false);
  });

  it("inloggen kan nooit via file:// — ook niet met de vlag aan", () => {
    zetOmgeving({ protocol: "file:", oauthVlag: true });
    expect(g.oauthDashboardAan()).toBe(true);
    expect(g.oauthMogelijk()).toBe(false);
  });
});
