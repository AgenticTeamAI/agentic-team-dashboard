/* s66 stap 1 — met de vlag staat er geen token in de browseropslag.
 *
 * Besluit Tijmen 26-11-2026: het vervangingstoken (refresh token) staat in
 * een httpOnly-cookie op www, gezet door de site; deze pagina krijgt het nooit
 * te zien. Het access-token van een uur leeft alleen in een modulevariabele.
 * Lokaal staat alleen de markering {"tot": …}, zonder token, seat of licentie.
 *
 * Dit bestand pint dat op twee manieren: op de bron (het s66-deel van
 * oauth-client.js verwerkt geen refresh_token en raakt sessionStorage niet
 * aan) en op het gedrag (na een volledige login en een vernieuwing staat er
 * nergens in de opslag een token, ook niet als de site er per ongeluk een
 * vervangingstoken bij zou sturen). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { open, jwt, tokenOk, ROOT, MARKERING, TOT, CONNECTOR } from "./helpers/s66-sessie.js";

const OAUTH_CLIENT = readFileSync(join(ROOT, "src/oauth-client.js"), "utf8");
const S66_DEEL = OAUTH_CLIENT.slice(OAUTH_CLIENT.indexOf("/* ── s66 stap 1: de dashboardsessie"), OAUTH_CLIENT.indexOf('if (typeof module !== "undefined")'));

/** Alles wat er in beide opslagen staat, als één tekst. */
function opslagTekst(w) {
  const uit = [];
  for (const opslag of [w.localStorage, w.sessionStorage]) {
    for (let i = 0; i < opslag.length; i++) {
      const k = opslag.key(i);
      uit.push(k + "=" + opslag.getItem(k));
    }
  }
  return uit.join("\n");
}

describe("de bron: het s66-deel van oauth-client.js", () => {
  it("is gevonden en niet leeg", () => {
    expect(S66_DEEL.length).toBeGreaterThan(2000);
  });

  it("verwerkt geen refresh_token", () => {
    expect(S66_DEEL).not.toMatch(/refresh_token/);
  });

  it("schrijft niets naar sessionStorage", () => {
    expect(S66_DEEL).not.toMatch(/sessionStorage\s*\./);
  });

  it("raakt localStorage alleen aan voor de markering", () => {
    // Methode en eerste argument van elke aanroep: altijd de markeringssleutel.
    const aanroepen = [...S66_DEEL.matchAll(/localStorage\.(\w+)\(([^,)]*)/g)].map((m) => m[1] + "(" + m[2] + ")");
    expect([...new Set(aanroepen)].sort()).toEqual(["getItem(SESSIE_LS_KEY)", "removeItem(SESSIE_LS_KEY)", "setItem(SESSIE_LS_KEY)"]);
  });

  it("de markering bevat alleen tot", () => {
    expect(S66_DEEL).toContain("JSON.stringify({ tot: new Date(Date.parse(tot)).toISOString() })");
  });
});

describe("het gedrag: geen token in de opslag", () => {
  const A = jwt({ jti: "opslag-a" });
  const A2 = jwt({ jti: "opslag-a2" });

  it("na inloggen en een vernieuwing staat er nergens een token, ook niet als de site er een vervangingstoken bij stuurt", async () => {
    let aGeldig = true;
    const lek = "atr_DIT_HOORT_NERGENS";
    const antwoorden = [tokenOk(A, { refresh_token: lek }), tokenOk(A2, { refresh_token: lek })];
    const { w, heeftTabs, tot, markeringNu } = await open({
      url: "https://dashboard.agentic-team.ai/#sessie=nieuw",
      site: (naam) => (naam === "token" ? antwoorden.length > 1 ? antwoorden.shift() : antwoorden[0] : { status: 204 }),
      geldig: [A, A2],
      instantie: (pad, v, auth) => (auth === "Bearer " + A && !aGeldig ? { status: 401, body: { fout: "verlopen" } } : undefined),
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    aGeldig = false;
    await w.eval("laadWerkruimte(huidigeBron, { behoudRoute: true })");
    expect(w.eval("huidigeBron.token")).toBe(A2);

    const alles = opslagTekst(w);
    for (const geheim of [A, A2, lek, "access_token", "refresh_token"]) expect(alles).not.toContain(geheim);
    expect(w.sessionStorage.getItem("agentic-team-dashboard:oauth")).toBeNull();
    expect(w.localStorage.getItem("agentic-team-dashboard:oauth-pkce")).toBeNull();
    // De markering: precies {"tot": …}, niets anders.
    expect(JSON.parse(markeringNu())).toEqual({ tot: TOT });
    // Het token leeft in het geheugen, en nergens anders.
    expect(w.eval("sessieToegang")).toBe(A2);
    expect(w.eval("typeof sessieToegang")).toBe("string");
  });

  it("een sessie_tot die geen datum is, levert geen markering op (en zeker geen andere waarde)", async () => {
    const A3 = jwt({ jti: "opslag-a3" });
    const { heeftTabs, tot, markeringNu } = await open({
      url: "https://dashboard.agentic-team.ai/#sessie=nieuw",
      site: (naam) => (naam === "token" ? tokenOk(A3, { sessie_tot: "<script>" }) : { status: 204 }),
      geldig: [A3],
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    expect(markeringNu()).toBeNull();
  });

  it("de werkdata gaat met het sessietoken als Bearer naar de router, nooit met cookies", async () => {
    const A4 = jwt({ jti: "opslag-a4" });
    const { verzoeken, heeftTabs, tot } = await open({ markering: true, site: (n) => (n === "token" ? tokenOk(A4) : { status: 204 }), geldig: [A4] });
    await tot(() => heeftTabs(), "dashboard geladen");
    const werk = verzoeken.filter((v) => v.url.startsWith(CONNECTOR));
    expect(werk.length).toBeGreaterThan(0);
    for (const v of werk) {
      expect(v.opties.headers.Authorization).toBe("Bearer " + A4);
      expect(v.opties.credentials).toBeUndefined();
    }
  });

  it("de markering is de enige nieuwe sleutel", async () => {
    const A5 = jwt({ jti: "opslag-a5" });
    const { w, heeftTabs, tot } = await open({ markering: true, site: (n) => (n === "token" ? tokenOk(A5) : { status: 204 }), geldig: [A5] });
    await tot(() => heeftTabs(), "dashboard geladen");
    const sleutels = [];
    for (let i = 0; i < w.localStorage.length; i++) sleutels.push(w.localStorage.key(i));
    for (let i = 0; i < w.sessionStorage.length; i++) sleutels.push("ss:" + w.sessionStorage.key(i));
    expect(sleutels.filter((k) => /sessie|oauth/.test(k))).toEqual([MARKERING]);
  });
});
