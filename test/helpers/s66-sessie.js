/* s66 stap 1 — het harnas voor de dashboardsessie op het ÉCHTE, gebouwde
 * dashboard.html.
 *
 * Zelfde opzet als test/oauth-login.test.js: elke test opent zijn eigen JSDOM
 * met runScripts, zodat DOMContentLoaded, het opstarten en de knoppen echt
 * lopen. De release-build heeft de vlaggen UIT; deze tests plakken exact de
 * twee meta's in de HTML die `build.py --oauth --sessie` zou zetten (en
 * test/s66-sessie-lege-staat.test.js pint apart dat build.py precies dat doet).
 *
 * Alles wat de pagina verstuurt komt in `verzoeken`, met de opties zoals ze
 * de fetch in gingen. De site (de BFF) en de instantie zijn hier nep, met
 * precies de antwoordvormen uit contract 2.17.0 §7g. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const HTML = readFileSync(join(ROOT, "dashboard.html"), "utf8");
export const OAUTH_META = '<meta name="at-oauth" content="1">';
export const SESSIE_META = '<meta name="at-sessie" content="1">';
/** De HTML zoals `build.py --oauth --sessie` hem zou opleveren. */
export const HTML_MET_SESSIE = HTML.replace("<title>", OAUTH_META + SESSIE_META + "\n<title>");
export const HTML_MET_LOGIN = HTML.replace("<title>", OAUTH_META + "\n<title>");

export const CONNECTOR = "https://connector.agentic-team.ai";
export const SITE = "https://www.agentic-team.ai";
export const URLS = {
  inloggen: SITE + "/api/dashboard/sessie/inloggen",
  token: SITE + "/api/dashboard/sessie/token",
  uitloggen: SITE + "/api/dashboard/sessie/uitloggen",
  overal: SITE + "/api/dashboard/sessie/uitloggen-overal",
  oudToken: SITE + "/api/oauth/token",
};
export const SESSIE_URLS = [URLS.token, URLS.uitloggen, URLS.overal];
export const MARKERING = "agentic-team-dashboard:sessie";

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

export const SEAT_A = "a".repeat(64);
export const SEAT_B = "b".repeat(64);
export const LIC_A = "at_klant-a";
export const LIC_B = "at_klant-b";

/** Een access-token in de vorm die de site uitgeeft. Niet ondertekend: het
 *  dashboard verifieert nooit, de nep-instantie vergelijkt letterlijk. */
export function jwt({ lic = LIC_A, seat = SEAT_A, jti = "1" } = {}) {
  return b64u({ alg: "ES256", typ: "JWT", kid: "test" }) + "." + b64u({
    iss: SITE, lic, seat, sub: lic + "#" + seat.slice(0, 16),
    client_id: SITE + "/oauth/clients/dashboard-sessie", hosted: true,
    aud: CONNECTOR + "/dashboard", scope: "dashboard:lees dashboard:schrijf",
    auth_time: 1764000000, jti, iat: 1764000000, exp: 1764003600,
  }) + ".handtekening";
}

/** Een daglink-token: payload in het eerste deel, zoals daglink.ts. */
export function daglink(licentie = LIC_A) {
  return b64u({ licentie, exp: 1764086400, iat: 1764000000 }) + ".handtekening";
}

export const TOT = "2026-12-11T09:00:00.000Z";

/** Het 200-antwoord van POST /api/dashboard/sessie/token. */
export function tokenOk(token, extra = {}) {
  return { status: 200, body: Object.assign({ access_token: token, token_type: "Bearer", expires_in: 3600, scope: "dashboard:lees dashboard:schrijf", sessie_tot: TOT }, extra) };
}

const OVERZICHT = { klant: "Testbedrijf BV", intern: false, domeinen: [{ domein: "acties", aantal: 1 }] };
const ENTRIES = [{
  domein: "acties", entryId: "a-1",
  data: { Actie: "Offerte nabellen", Status: "Open", Agent: "dealmaker" },
  aangemaakt: "2026-08-20T09:00:00Z", bijgewerkt: "2026-08-20T09:00:00Z",
}];

/**
 * @param {object} o
 * @param {string} [o.html]
 * @param {string} [o.url]
 * @param {boolean|string} [o.markering] true = een geldige markering, of een eigen ruwe waarde
 * @param {Function} [o.site] (naam, verzoek) => {status, body, headers} voor de drie sessie-URL's
 * @param {Function} [o.instantie] (pad, verzoek, auth) => {status, body} | undefined (dan de standaard)
 * @param {string[]} [o.geldig] tokens die de instantie accepteert
 * @param {Function} [o.voor] (window) => void, vóór het laden
 */
export async function open({
  html = HTML_MET_SESSIE,
  url = "https://dashboard.agentic-team.ai/",
  markering = false,
  site = () => ({ status: 401, body: { sessie: "geen" } }),
  instantie = () => undefined,
  geldig = [],
  voor = () => {},
} = {}) {
  const fouten = [];
  const verzoeken = [];
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
        if (markering === true) w.localStorage.setItem(MARKERING, JSON.stringify({ tot: TOT }));
        else if (typeof markering === "string") w.localStorage.setItem(MARKERING, markering);
      } catch (e) { /* file:// */ }
      voor(w);
      w.fetch = async (u, opties = {}) => {
        const full = String(u);
        const verzoek = { url: full, opties };
        verzoeken.push(verzoek);
        const antwoord = (r) => new Response(r.body === undefined ? null : JSON.stringify(r.body), {
          status: r.status, headers: Object.assign({ "content-type": "application/json" }, r.headers || {}),
        });
        const naam = Object.keys(URLS).find((k) => URLS[k] === full);
        if (naam && naam !== "oudToken" && naam !== "inloggen") return antwoord(site(naam, verzoek) || { status: 500, body: {} });
        if (full.startsWith(SITE)) return antwoord({ status: 404, body: { fout: "Niet beschikbaar." } });

        const parsed = new URL(full);
        const auth = (opties.headers || {}).Authorization || "";
        const eigen = instantie(parsed.pathname, verzoek, auth);
        if (eigen) return antwoord(eigen);
        if (!geldig.some((t) => auth === "Bearer " + t)) {
          return antwoord({ status: 401, body: { fout: "Deze dashboardlink is verlopen. Vraag je Coördinator om een nieuwe." } });
        }
        if (parsed.pathname === "/dashboard/overzicht") return antwoord({ status: 200, body: OVERZICHT });
        if (parsed.pathname === "/dashboard/entries") return antwoord({ status: 200, body: { domein: parsed.searchParams.get("domein"), entries: ENTRIES } });
        if (parsed.pathname === "/dashboard/sessies/intrekken") return antwoord({ status: 200, body: { beeindigd_vanaf: "2026-11-27T09:00:00.000Z", eigen: true } });
        return antwoord({ status: 404, body: { fout: "Onbekende route" } });
      };
    },
  });
  const w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  const q = (sel) => w.document.querySelector(sel);
  const titel = () => (q("[data-leeg-titel]") || {}).textContent || "";
  const uitleg = () => (q("[data-leeg-tekst]") || {}).textContent || "";
  const loginknop = () => q('#root .balk [data-act="login"]');
  const heeftTabs = () => !!q(".tabbalk");
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function tot(conditie, wat) {
    for (let i = 0; i < 600; i++) {
      await tick();
      if (conditie()) return;
    }
    throw new Error("timeout: " + wat + " — titel: " + titel() + " / " + uitleg());
  }
  const markeringNu = () => w.localStorage.getItem(MARKERING);
  const naar = (prefix) => verzoeken.filter((v) => v.url.startsWith(prefix));
  return { w, q, titel, uitleg, loginknop, heeftTabs, verzoeken, fouten, tot, tick, markeringNu, naar };
}

/** Elk verzoek met cookies gaat naar een van de drie sessie-URL's, zonder
 *  body en zonder eigen headers; elk ander verzoek draagt geen credentials. */
export function credentialsAlleenNaarSessie(verzoeken) {
  for (const v of verzoeken) {
    if (v.opties && "credentials" in v.opties) {
      if (!SESSIE_URLS.includes(v.url)) throw new Error("credentials naar " + v.url);
      if (v.opties.credentials !== "include") throw new Error("onverwachte credentials " + v.opties.credentials);
      if (v.opties.body !== undefined || v.opties.headers !== undefined) throw new Error("body of headers naar " + v.url);
      if (v.opties.method !== "POST") throw new Error("geen POST naar " + v.url);
    } else if (SESSIE_URLS.includes(v.url)) {
      throw new Error("sessie-URL zonder credentials: " + v.url);
    }
  }
  return true;
}
