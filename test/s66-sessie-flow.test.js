/* s66 stap 1 — de dashboardsessie end-to-end op het gebouwde dashboard.html,
 * plus de losse bouwstenen in de node-omgeving.
 *
 * Wat hier vastligt (contract 2.17.0 §7g, ontwerp §11):
 *  - inloggen is een navigatie naar de site, met alleen terug en route;
 *  - de fragmenten #sessie=fout&reden=… en #sessie=nieuw&r=…;
 *  - cookies (credentials) gaan alleen mee naar de drie sessie-POST's, zonder
 *    body en zonder eigen headers; nooit naar de instantie of de router;
 *  - een 503 van de token-route krijgt precies één herhaling;
 *  - een token voor een ander account (andere licentie of andere seat) wordt
 *    nooit gebruikt: geen enkel verzoek met dat token;
 *  - het storage-event (een ander tabblad logde uit) zonder netwerk;
 *  - 401 {sessie: "beeindigd"}: uitloggen bij de site, de melding, geen
 *    vernieuwing;
 *  - uitloggen overal in de volgorde token → instantie → site, en afbreken
 *    bij een andere identiteit;
 *  - daglink tegenover markering bij dezelfde en bij een andere licentie. */
import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import {
  open, jwt, daglink, tokenOk, credentialsAlleenNaarSessie, ROOT, URLS, SESSIE_URLS, CONNECTOR, MARKERING, TOT,
  LIC_A, LIC_B, SEAT_A, SEAT_B,
} from "./helpers/s66-sessie.js";

const A = jwt({ lic: LIC_A, seat: SEAT_A, jti: "a" });
const A2 = jwt({ lic: LIC_A, seat: SEAT_A, jti: "a2" });
const ANDERE_LIC = jwt({ lic: LIC_B, seat: SEAT_A, jti: "x" });
const ANDERE_SEAT = jwt({ lic: LIC_A, seat: SEAT_B, jti: "y" });

/** Een site die bij elke token-POST het volgende antwoord uit de rij geeft. */
function siteMet(tokenAntwoorden, overig = {}) {
  const rij = tokenAntwoorden.slice();
  return (naam) => {
    if (naam === "token") return rij.length > 1 ? rij.shift() : rij[0];
    if (naam === "uitloggen") return overig.uitloggen || { status: 204 };
    if (naam === "overal") return overig.overal || { status: 200, body: { ingetrokken: 2 } };
    return { status: 404, body: {} };
  };
}
const metToken = (v, token) => ((v.opties.headers || {}).Authorization === "Bearer " + token);

/* ── de bouwstenen, los ───────────────────────────────────────────────── */

describe("bouwstenen (node)", () => {
  let navigaties;
  beforeAll(() => {
    for (const rel of ["src/werkruimte-loader.js", "src/oauth-client.js"]) {
      vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
    }
  });
  function omgeving({ sessie = true, basis = null, hash = "" } = {}) {
    navigaties = [];
    globalThis.document = {
      querySelector: (sel) => {
        if (sel === 'meta[name="at-oauth"][content="1"]') return {};
        if (sel === 'meta[name="at-sessie"][content="1"]') return sessie ? {} : null;
        if (sel === 'meta[name="at-basis"]' && basis) return { getAttribute: () => basis };
        return null;
      },
    };
    globalThis.window = { location: { protocol: "https:", hash, set href(v) { navigaties.push(v); } } };
  }
  beforeEach(() => omgeving());

  it("de inlog-URL: alleen terug en route, en de route alleen als hij een echte route is", () => {
    expect(globalThis.sessieInlogUrl("#/data/acties")).toBe(URLS.inloggen + "?terug=/&route=%23%2Fdata%2Facties");
    expect(globalThis.sessieInlogUrl("")).toBe(URLS.inloggen + "?terug=/&route=");
    // Nooit een daglink- of OAuth-fragment als route meesturen.
    expect(globalThis.sessieInlogUrl("#t=geheim")).toBe(URLS.inloggen + "?terug=/&route=");
    expect(globalThis.sessieInlogUrl("#code=atc_x&state=s")).toBe(URLS.inloggen + "?terug=/&route=");
  });

  it("startSessieLogin navigeert, zonder fetch en zonder opslag", async () => {
    let gefetcht = 0;
    globalThis.fetch = async () => { gefetcht++; };
    omgeving({ hash: "#/acties" });
    await globalThis.startSessieLogin();
    expect(navigaties).toEqual([URLS.inloggen + "?terug=/&route=%23%2Facties"]);
    expect(gefetcht).toBe(0);
  });

  it("een losse link op /v2/ keert terug naar /v2/ (de site kent alleen / en /v2/)", () => {
    // dashboardBasis() leest de meta pas bij aanroep; OAUTH_REDIRECT_URI niet,
    // maar die speelt in de sessieflow geen rol.
    omgeving({ basis: "/v2/" });
    expect(globalThis.sessieInlogUrl("")).toBe(URLS.inloggen + "?terug=/v2/&route=");
  });

  it("de fragmenten van de site", () => {
    const p = globalThis.parseSessieFragment;
    expect(p("#sessie=nieuw&r=%23%2Facties")).toEqual({ nieuw: true, route: "#/acties" });
    expect(p("#sessie=nieuw&r=")).toEqual({ nieuw: true, route: null });
    // Alles wat geen route is, telt niet: geen open redirect via r.
    for (const r of ["https://evil.example/", "//evil.example", "#t=x", "%23%2F<script>", "#/" + "a".repeat(201)]) {
      expect(p("#sessie=nieuw&r=" + encodeURIComponent(r)).route, r).toBeNull();
    }
    for (const reden of ["andere_poging", "afgebroken", "geweigerd", "storing"]) {
      const f = p("#sessie=fout&reden=" + reden);
      expect(f.fout).toBe(true);
      expect(f.reden).toBe(reden);
      expect(f.tekst).toBe(vm.runInThisContext("SESSIE_FOUT_TEKST")[reden]);
    }
    // Een onbekende reden: een vaste tekst, nooit iets uit de URL.
    const onbekend = p("#sessie=fout&reden=%3Cb%3Ehallo%3C%2Fb%3E");
    expect(onbekend.reden).toBeNull();
    expect(onbekend.tekst).not.toContain("hallo");
    expect(p("#/acties")).toBeNull();
    expect(p("#t=abc")).toBeNull();
    expect(p("")).toBeNull();
  });

  it("herhaalNaMs: min(Retry-After, 2) seconden", () => {
    const met = (v) => ({ headers: { get: () => v } });
    expect(globalThis.herhaalNaMs(met("1"))).toBe(1000);
    expect(globalThis.herhaalNaMs(met("0"))).toBe(0);
    expect(globalThis.herhaalNaMs(met("30"))).toBe(2000);
    expect(globalThis.herhaalNaMs(met(null))).toBe(2000);
    expect(globalThis.herhaalNaMs(met("onzin"))).toBe(2000);
    expect(globalThis.herhaalNaMs(met("-5"))).toBe(2000);
  });

  it("sitePost weigert een sessiebestemming zonder de vlag, vóór er een fetch is", async () => {
    let gefetcht = 0;
    globalThis.fetch = async () => { gefetcht++; return new Response("{}"); };
    omgeving({ sessie: false });
    for (const doel of ["sessie", "uitloggen", "overal"]) {
      await expect(globalThis.sitePost(doel)).rejects.toThrow(/staat niet aan/);
    }
    await expect(globalThis.sitePost("ergens-anders")).rejects.toThrow(/Onbekende bestemming/);
    expect(gefetcht).toBe(0);
  });

  it("sitePost herhaalt alleen de sessie-token-route bij een 503, en dan één keer", async () => {
    const urls = [];
    globalThis.fetch = async (u) => { urls.push(String(u)); return new Response("{}", { status: 503, headers: { "Retry-After": "0" } }); };
    expect((await globalThis.sitePost("sessie")).status).toBe(503);
    expect(urls).toEqual([URLS.token, URLS.token]);
    urls.length = 0;
    await globalThis.sitePost("uitloggen");
    await globalThis.sitePost("overal");
    await globalThis.sitePost("token", { grant_type: "refresh_token" });
    expect(urls).toEqual([URLS.uitloggen, URLS.overal, URLS.oudToken]);
  });

  it("de identiteit komt uit lic en seat; zonder een van beide is er geen", () => {
    expect(globalThis.sessieIdentiteit(A)).toEqual({ lic: LIC_A, seat: SEAT_A });
    expect(globalThis.sessieIdentiteit("geen.jwt")).toBeNull();
    const zonderSeat = "e30." + Buffer.from(JSON.stringify({ lic: LIC_A })).toString("base64url") + ".x";
    expect(globalThis.sessieIdentiteit(zonderSeat)).toBeNull();
  });
});

/* ── terug van de site ────────────────────────────────────────────────── */

describe("#sessie=fout&reden=…", () => {
  for (const [reden, stuk] of [
    ["andere_poging", "hoort niet bij deze browser"],
    ["afgebroken", "afgebroken"],
    ["geweigerd", "niet geaccepteerd"],
    ["storing", "storing aan onze kant"],
    ["iets_anders", "Inloggen is niet gelukt"],
  ]) {
    it(`${reden}: een melding naast de loginknop, het fragment weg, geen verzoek`, async () => {
      const { w, titel, uitleg, loginknop, verzoeken } = await open({ url: "https://dashboard.agentic-team.ai/#sessie=fout&reden=" + reden });
      expect(titel()).toBe("Inloggen is niet gelukt");
      expect(uitleg()).toContain(stuk);
      expect(loginknop()).not.toBeNull();
      expect(w.location.hash).toBe("");
      expect(verzoeken).toEqual([]);
    });
  }
});

describe("#sessie=nieuw&r=…", () => {
  it("één token-POST met cookies, de markering, dan de werkruimte op route r", async () => {
    const { w, heeftTabs, tot, verzoeken, markeringNu, naar } = await open({
      url: "https://dashboard.agentic-team.ai/#sessie=nieuw&r=" + encodeURIComponent("#/acties"),
      site: siteMet([tokenOk(A)]),
      geldig: [A],
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    const tokenPosts = verzoeken.filter((v) => v.url === URLS.token);
    expect(tokenPosts).toHaveLength(1);
    expect(tokenPosts[0].opties).toEqual({ method: "POST", credentials: "include" });
    expect(credentialsAlleenNaarSessie(verzoeken)).toBe(true);
    // Alle werkdata naar de router, met het sessietoken.
    const werk = naar(CONNECTOR);
    expect(werk.length).toBeGreaterThan(0);
    for (const v of werk) expect(metToken(v, A)).toBe(true);
    expect(markeringNu()).toBe(JSON.stringify({ tot: TOT }));
    expect(w.location.hash).toBe("#/acties");
    expect(w.__dashboardCtx.bron.sessie).toBe(true);
  });

  it("een route die geen route is, wordt genegeerd", async () => {
    const { w, heeftTabs, tot } = await open({
      url: "https://dashboard.agentic-team.ai/#sessie=nieuw&r=" + encodeURIComponent("https://evil.example/"),
      site: siteMet([tokenOk(A)]),
      geldig: [A],
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    expect(w.location.href).not.toContain("evil");
  });

  it("een 401 van de token-route: de loginknop met een melding, geen markering", async () => {
    const { titel, uitleg, tot, markeringNu, verzoeken } = await open({
      url: "https://dashboard.agentic-team.ai/#sessie=nieuw",
      site: siteMet([{ status: 401, body: { sessie: "verlopen" } }]),
    });
    await tot(() => titel() === "Inloggen is niet gelukt", "melding");
    expect(uitleg()).toContain("Log opnieuw in");
    expect(markeringNu()).toBeNull();
    expect(verzoeken.filter((v) => v.url.startsWith(CONNECTOR))).toEqual([]);
  });

  it("een #code=… van de oude flow wordt nooit ingewisseld", async () => {
    const { w, verzoeken, titel } = await open({ url: "https://dashboard.agentic-team.ai/#code=atc_oud&state=s&iss=x" });
    expect(titel()).toBe("Log opnieuw in");
    expect(w.location.hash).toBe("");
    expect(verzoeken).toEqual([]);
  });
});

/* ── 503: één herhaling ───────────────────────────────────────────────── */

describe("503 van de token-route", () => {
  it("wordt precies één keer herhaald; blijft het 503, dan de storingsmelding en de markering blijft", async () => {
    const { titel, uitleg, tot, verzoeken, markeringNu } = await open({
      markering: true,
      site: siteMet([{ status: 503, body: { error: "temporarily_unavailable" }, headers: { "Retry-After": "0" } }]),
    });
    await tot(() => /storing/.test(uitleg()), "storingsmelding");
    expect(titel()).toBe("Log in om je team te zien");
    expect(verzoeken.filter((v) => v.url === URLS.token)).toHaveLength(2);
    expect(markeringNu()).toBe(JSON.stringify({ tot: TOT }));
  });

  it("een 503 gevolgd door een 200 laadt gewoon door", async () => {
    const { heeftTabs, tot, verzoeken } = await open({
      markering: true,
      site: siteMet([{ status: 503, body: {}, headers: { "Retry-After": "0" } }, tokenOk(A)]),
      geldig: [A],
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    expect(verzoeken.filter((v) => v.url === URLS.token)).toHaveLength(2);
  });
});

/* ── alleen een markering ─────────────────────────────────────────────── */

describe("alleen een markering", () => {
  it("een token-POST en de werkruimte, geen tokenopslag", async () => {
    const { heeftTabs, tot, verzoeken, w } = await open({ markering: true, site: siteMet([tokenOk(A)]), geldig: [A] });
    await tot(() => heeftTabs(), "dashboard geladen");
    expect(verzoeken.filter((v) => v.url === URLS.token)).toHaveLength(1);
    expect(w.sessionStorage.length).toBe(0);
  });

  it("bij 401: de markering weg en de lege staat", async () => {
    const { titel, uitleg, tot, markeringNu, verzoeken, heeftTabs } = await open({
      markering: true, site: siteMet([{ status: 401, body: { sessie: "verlopen" } }]),
    });
    await tot(() => titel() === "Log in om je team te zien" && /verlopen/.test(uitleg()), "lege staat");
    expect(markeringNu()).toBeNull();
    expect(heeftTabs()).toBe(false);
    expect(verzoeken.map((v) => v.url)).toEqual([URLS.token]);
  });
});

/* ── een 401 van de instantie ─────────────────────────────────────────── */

describe("een 401 van de instantie", () => {
  it("een gewone 401: één token-POST, dan door met het nieuwe token", async () => {
    let aGeldig = true;
    const { heeftTabs, tot, verzoeken, w } = await open({
      markering: true,
      site: siteMet([tokenOk(A), tokenOk(A2)]),
      geldig: [A, A2],
      instantie: (pad, v, auth) => (auth === "Bearer " + A && !aGeldig ? { status: 401, body: { fout: "verlopen" } } : undefined),
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    aGeldig = false;
    const voor = verzoeken.length;
    await w.eval("laadWerkruimte(huidigeBron, { behoudRoute: true })");
    const na = verzoeken.slice(voor);
    // Hooguit één vernieuwing, gedeeld door de gelijktijdige verzoeken.
    expect(na.filter((v) => v.url === URLS.token)).toHaveLength(1);
    expect(na.filter((v) => metToken(v, A2)).length).toBeGreaterThan(0);
    expect(w.eval("huidigeBron.token")).toBe(A2);
    expect(credentialsAlleenNaarSessie(verzoeken)).toBe(true);
  });

  it("401 {sessie: 'beeindigd'}: uitloggen bij de site, de melding, nooit vernieuwen", async () => {
    let grens = false;
    const { heeftTabs, tot, verzoeken, w, titel, uitleg, markeringNu } = await open({
      markering: true,
      site: siteMet([tokenOk(A)]),
      geldig: [A],
      instantie: () => (grens ? { status: 401, body: { fout: "Je sessie is beëindigd. Log opnieuw in.", sessie: "beeindigd" } } : undefined),
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    grens = true;
    const voor = verzoeken.length;
    await w.eval("laadWerkruimte(huidigeBron, { behoudRoute: true })");
    await tot(() => !heeftTabs(), "lege staat");
    const na = verzoeken.slice(voor);
    expect(na.filter((v) => v.url === URLS.token)).toEqual([]);
    expect(na.filter((v) => v.url === URLS.uitloggen)).toHaveLength(1);
    expect(titel()).toBe("Je sessie is beëindigd");
    expect(uitleg()).toBe("Je sessie is beëindigd (je rol is gewijzigd of je bent overal uitgelogd). Log opnieuw in.");
    expect(markeringNu()).toBeNull();
    expect(w.eval("sessieToegang")).toBeNull();
    expect(w.eval("huidigeBron")).toBeNull();
  });

  it("na 'beeindigd' wacht inloggen tot het uitloggen bij de site klaar is", async () => {
    let grens = false;
    let losUitloggen;
    const uitloggenKlaar = new Promise((r) => { losUitloggen = r; });
    const { heeftTabs, tot, w } = await open({
      markering: true,
      site: (naam) => (naam === "token" ? tokenOk(A) : { status: 204 }),
      geldig: [A],
      instantie: () => (grens ? { status: 401, body: { sessie: "beeindigd" } } : undefined),
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    // Het uitloggen blijft hangen tot de test het loslaat.
    const echteFetch = w.fetch;
    w.fetch = async (u, o) => { if (String(u) === URLS.uitloggen) await uitloggenKlaar; return echteFetch(u, o); };
    grens = true;
    await w.eval("laadWerkruimte(huidigeBron, { behoudRoute: true })");
    let klaar = false;
    const wacht = w.eval("wachtOpSessieAfsluiten()").then(() => { klaar = true; });
    await new Promise((r) => setTimeout(r, 20));
    expect(klaar).toBe(false);
    losUitloggen();
    await wacht;
    expect(klaar).toBe(true);
  });
});

/* ── identiteitspin ───────────────────────────────────────────────────── */

describe("een ander account in een ander tabblad", () => {
  for (const [wat, ander] of [["andere licentie", ANDERE_LIC], ["andere seat", ANDERE_SEAT]]) {
    it(`${wat}: het nieuwe token wordt nooit gebruikt, geheugen leeg, de lege staat`, async () => {
      let aGeldig = true;
      const { heeftTabs, tot, verzoeken, w, titel, uitleg } = await open({
        markering: true,
        site: siteMet([tokenOk(A), tokenOk(ander)]),
        geldig: [A, ander],
        instantie: (pad, v, auth) => (auth === "Bearer " + A && !aGeldig ? { status: 401, body: { fout: "verlopen" } } : undefined),
      });
      await tot(() => heeftTabs(), "dashboard geladen");
      aGeldig = false;
      await w.eval("laadWerkruimte(huidigeBron, { behoudRoute: true })");
      await tot(() => !heeftTabs(), "lege staat");
      expect(titel()).toBe("Ander account");
      expect(uitleg()).toBe("Je bent in een ander tabblad met een ander account ingelogd. Laad de pagina opnieuw.");
      // Geen enkel verzoek, lezen of schrijven, naar de instantie of de site, met het andere token.
      expect(verzoeken.filter((v) => JSON.stringify(v.opties).includes(ander))).toEqual([]);
      expect(w.eval("sessieToegang")).toBeNull();
      expect(w.eval("huidigeBron")).toBeNull();
      // Ook een schrijfactie daarna verstuurt niets met het andere token.
      const voor = verzoeken.length;
      await w.eval("haalSessieToken().catch(() => null)");
      expect(verzoeken.slice(voor).filter((v) => v.url.startsWith(CONNECTOR))).toEqual([]);
    });
  }
});

/* ── het storage-event ────────────────────────────────────────────────── */

describe("een ander tabblad logt uit", () => {
  it("de markering verdwijnt: geheugen leeg en de lege staat, zonder netwerk", async () => {
    const { heeftTabs, tot, verzoeken, w, titel } = await open({ markering: true, site: siteMet([tokenOk(A)]), geldig: [A] });
    await tot(() => heeftTabs(), "dashboard geladen");
    const voor = verzoeken.length;
    w.localStorage.removeItem(MARKERING);
    w.dispatchEvent(new w.StorageEvent("storage", { key: MARKERING, oldValue: JSON.stringify({ tot: TOT }), newValue: null }));
    await tot(() => !heeftTabs(), "lege staat");
    expect(titel()).toBe("Je bent uitgelogd");
    expect(verzoeken.length).toBe(voor);
    expect(w.eval("sessieToegang")).toBeNull();
  });

  it("een andere sleutel, of een nieuwe markering, doet niets", async () => {
    const { heeftTabs, tot, verzoeken, w } = await open({ markering: true, site: siteMet([tokenOk(A)]), geldig: [A] });
    await tot(() => heeftTabs(), "dashboard geladen");
    const voor = verzoeken.length;
    w.dispatchEvent(new w.StorageEvent("storage", { key: "agentic-team-dashboard:thema", newValue: null }));
    w.dispatchEvent(new w.StorageEvent("storage", { key: MARKERING, newValue: JSON.stringify({ tot: TOT }) }));
    await new Promise((r) => setTimeout(r, 20));
    expect(heeftTabs()).toBe(true);
    expect(verzoeken.length).toBe(voor);
  });
});

/* ── uitloggen ────────────────────────────────────────────────────────── */

describe("uitloggen", () => {
  it("POST uitloggen met cookies, de markering en het geheugen weg", async () => {
    const { heeftTabs, tot, verzoeken, w, markeringNu, titel } = await open({ markering: true, site: siteMet([tokenOk(A)]), geldig: [A] });
    await tot(() => heeftTabs(), "dashboard geladen");
    w.eval("uitloggen()");
    await tot(() => titel() === "Je bent uitgelogd", "uitgelogd");
    expect(verzoeken.filter((v) => v.url === URLS.uitloggen)).toHaveLength(1);
    expect(markeringNu()).toBeNull();
    expect(w.eval("sessieToegang")).toBeNull();
    expect(credentialsAlleenNaarSessie(verzoeken)).toBe(true);
  });
});

describe("uitloggen op alle apparaten", () => {
  const na = (verzoeken, voor) => verzoeken.slice(voor).map((v) => (v.url.startsWith(CONNECTOR) ? "instantie " + new URL(v.url).pathname : v.url));

  it("de knop staat alleen in het accountmenu met een sessie, en vraagt eerst om bevestiging", async () => {
    const { heeftTabs, tot, w, q, verzoeken } = await open({ markering: true, site: siteMet([tokenOk(A), tokenOk(A2)]), geldig: [A, A2] });
    await tot(() => heeftTabs(), "dashboard geladen");
    q('[data-act="sheet"][data-type="account"]').click();
    await tot(() => !!q('[data-type="overal"]'), "accountmenu");
    q('[data-type="overal"]').click();
    await tot(() => !!q('[data-act="uitloggen-overal"]'), "bevestiging");
    expect(q(".sheet").textContent).toContain("Heeft je licentie afscherming (Business), dan vervallen ook de daglinks die voor jou zijn gemaakt.");
    const voor = verzoeken.length;
    q('[data-act="uitloggen-overal"]').click();
    await tot(() => !heeftTabs() && /alle apparaten/.test(q("[data-leeg-tekst]") ? q("[data-leeg-tekst]").textContent : ""), "uitgelogd");
    expect(na(verzoeken, voor)).toEqual([URLS.token, "instantie /dashboard/sessies/intrekken", URLS.overal]);
  });

  it("volgorde token → instantie → site, met dát token en body {}, daarna alles weg", async () => {
    const { heeftTabs, tot, verzoeken, w, uitleg, markeringNu, titel } = await open({ markering: true, site: siteMet([tokenOk(A), tokenOk(A2)]), geldig: [A, A2] });
    await tot(() => heeftTabs(), "dashboard geladen");
    const voor = verzoeken.length;
    await w.eval("uitloggenOveral()");
    expect(na(verzoeken, voor)).toEqual([URLS.token, "instantie /dashboard/sessies/intrekken", URLS.overal]);
    const intrek = verzoeken.slice(voor)[1];
    expect(intrek.opties.method).toBe("POST");
    expect(metToken(intrek, A2)).toBe(true);
    expect(JSON.parse(intrek.opties.body)).toEqual({});
    expect(intrek.opties.credentials).toBeUndefined();
    expect(titel()).toBe("Je bent uitgelogd");
    expect(uitleg()).toBe("Je bent op alle apparaten uitgelogd.");
    expect(markeringNu()).toBeNull();
    expect(w.eval("sessieToegang")).toBeNull();
    expect(credentialsAlleenNaarSessie(verzoeken)).toBe(true);
  });

  it("mislukt de instantie, dan toch de site, en de voetnoot over het uur", async () => {
    const { heeftTabs, tot, verzoeken, w, uitleg } = await open({
      markering: true,
      site: siteMet([tokenOk(A), tokenOk(A2)]),
      geldig: [A, A2],
      instantie: (pad) => (pad === "/dashboard/sessies/intrekken" ? { status: 503, body: { fout: "storing" } } : undefined),
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    const voor = verzoeken.length;
    await w.eval("uitloggenOveral()");
    // `eenmalig`: geen vernieuwing en geen tweede poging bij de instantie.
    expect(na(verzoeken, voor)).toEqual([URLS.token, "instantie /dashboard/sessies/intrekken", URLS.overal]);
    expect(uitleg()).toBe("Je bent op alle apparaten uitgelogd. Open tabbladen elders stoppen uiterlijk binnen een uur.");
  });

  it("een 401 van de instantie wordt niet vernieuwd (eenmalig)", async () => {
    const { heeftTabs, tot, verzoeken, w, uitleg } = await open({
      markering: true,
      site: siteMet([tokenOk(A), tokenOk(A2)]),
      geldig: [A, A2],
      instantie: (pad) => (pad === "/dashboard/sessies/intrekken" ? { status: 401, body: { sessie: "beeindigd" } } : undefined),
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    const voor = verzoeken.length;
    await w.eval("uitloggenOveral()");
    expect(na(verzoeken, voor)).toEqual([URLS.token, "instantie /dashboard/sessies/intrekken", URLS.overal]);
    expect(uitleg()).toContain("uiterlijk binnen een uur");
  });

  it("breekt af bij een andere identiteit: geen verzoek naar de instantie of de site", async () => {
    const { heeftTabs, tot, verzoeken, w, titel } = await open({ markering: true, site: siteMet([tokenOk(A), tokenOk(ANDERE_SEAT)]), geldig: [A, ANDERE_SEAT] });
    await tot(() => heeftTabs(), "dashboard geladen");
    const voor = verzoeken.length;
    await w.eval("uitloggenOveral()");
    expect(na(verzoeken, voor)).toEqual([URLS.token]);
    expect(titel()).toBe("Ander account");
    expect(verzoeken.filter((v) => JSON.stringify(v.opties).includes(ANDERE_SEAT))).toEqual([]);
  });

  it("een storing bij het verse token: er verandert niets", async () => {
    const { heeftTabs, tot, verzoeken, w, markeringNu } = await open({
      markering: true,
      site: siteMet([tokenOk(A), { status: 503, body: {}, headers: { "Retry-After": "0" } }]),
      geldig: [A],
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    const voor = verzoeken.length;
    await w.eval("uitloggenOveral()");
    expect(na(verzoeken, voor)).toEqual([URLS.token, URLS.token]);
    expect(heeftTabs()).toBe(true);
    expect(markeringNu()).toBe(JSON.stringify({ tot: TOT }));
  });

  it("inloggen wacht tot uitloggen overal klaar is", async () => {
    const { heeftTabs, tot, w } = await open({ markering: true, site: siteMet([tokenOk(A), tokenOk(A2)]), geldig: [A, A2] });
    await tot(() => heeftTabs(), "dashboard geladen");
    const bezig = w.eval("uitloggenOveral()");
    let klaar = false;
    const wacht = w.eval("wachtOpSessieAfsluiten()").then(() => { klaar = true; });
    expect(klaar).toBe(false);
    await bezig;
    await wacht;
    expect(klaar).toBe(true);
  });
});

/* ── daglink tegenover markering ──────────────────────────────────────── */

describe("een daglink in het fragment", () => {
  it("met markering en dezelfde licentie: de sessie wint, de daglink is de terugval", async () => {
    const dl = daglink(LIC_A);
    const { heeftTabs, tot, verzoeken, w } = await open({
      url: "https://dashboard.agentic-team.ai/#t=" + encodeURIComponent(dl),
      markering: true, site: siteMet([tokenOk(A)]), geldig: [A, dl],
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    const werk = verzoeken.filter((v) => v.url.startsWith(CONNECTOR));
    for (const v of werk) expect(metToken(v, A)).toBe(true);
    expect(w.location.href).not.toContain(dl);
    expect(JSON.parse(w.sessionStorage.getItem("agentic-team-dashboard:daglink")).token).toBe(dl);
    expect(w.__dashboardCtx.bron.sessie).toBe(true);
  });

  it("met markering en een andere licentie: de daglink wint, het sessietoken gaat nergens heen", async () => {
    const dl = daglink(LIC_B);
    const { heeftTabs, tot, verzoeken, w } = await open({
      url: "https://dashboard.agentic-team.ai/#t=" + encodeURIComponent(dl),
      markering: true, site: siteMet([tokenOk(A)]), geldig: [A, dl],
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    const werk = verzoeken.filter((v) => v.url.startsWith(CONNECTOR));
    expect(werk.length).toBeGreaterThan(0);
    for (const v of werk) expect(metToken(v, dl)).toBe(true);
    expect(verzoeken.filter((v) => JSON.stringify(v.opties).includes(A))).toEqual([]);
    expect(w.__dashboardCtx.bron.sessie).toBeUndefined();
    expect(w.eval("sessieToegang")).toBeNull();
  });

  it("zonder markering: het daglinkpad, ongewijzigd, zonder één verzoek naar www", async () => {
    const dl = daglink(LIC_A);
    const { heeftTabs, tot, verzoeken } = await open({ url: "https://dashboard.agentic-team.ai/#t=" + encodeURIComponent(dl), geldig: [dl] });
    await tot(() => heeftTabs(), "dashboard geladen");
    expect(verzoeken.filter((v) => v.url.startsWith("https://www.agentic-team.ai"))).toEqual([]);
    for (const v of verzoeken) expect(v.opties.credentials).toBeUndefined();
  });

  it("met markering maar een sessie die verlopen is: de daglink, en de markering weg", async () => {
    const dl = daglink(LIC_A);
    const { heeftTabs, tot, verzoeken, markeringNu } = await open({
      url: "https://dashboard.agentic-team.ai/#t=" + encodeURIComponent(dl),
      markering: true, site: siteMet([{ status: 401, body: { sessie: "verlopen" } }]), geldig: [dl],
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    for (const v of verzoeken.filter((x) => x.url.startsWith(CONNECTOR))) expect(metToken(v, dl)).toBe(true);
    expect(markeringNu()).toBeNull();
  });
});

describe("de invariant over alle routes", () => {
  it("SESSIE_URLS zijn precies de drie POST-routes", () => {
    expect(SESSIE_URLS).toEqual([
      "https://www.agentic-team.ai/api/dashboard/sessie/token",
      "https://www.agentic-team.ai/api/dashboard/sessie/uitloggen",
      "https://www.agentic-team.ai/api/dashboard/sessie/uitloggen-overal",
    ]);
  });
});
