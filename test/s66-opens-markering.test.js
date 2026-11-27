/* s66 — besluit Tijmen 27-11-2026, op het gebouwde dashboard.html.
 *
 * 1. De opens-teller van de instantie (werkruimte #266, dashboard-opens.ts)
 *    telt alleen GET /dashboard/overzicht?open=1. Het dashboard stuurt die
 *    markering bij precies het eerste laden van een pagina, via de sessie én
 *    via de daglink, ook met de vlag DASHBOARD_SESSIE uit. Nooit bij Ververs,
 *    bij het herladen na een schrijfactie, bij een daglink op een al open
 *    tabblad of bij de daglink-terugval na uitloggen: die keren zouden de
 *    verhouding daglink/sessie scheeftrekken.
 * 2. Uitloggen op alle apparaten waarbij zowel de site (het cookie) als de
 *    instantie (stap g) faalt: dezelfde fout als bij een mislukt gewoon
 *    uitloggen, de markering blijft, en er is geen loginknop. */
import { describe, expect, it } from "vitest";
import {
  open, jwt, daglink, tokenOk, credentialsAlleenNaarSessie, HTML, URLS, CONNECTOR, TOT, LIC_A, SEAT_A,
} from "./helpers/s66-sessie.js";

const A = jwt({ lic: LIC_A, seat: SEAT_A, jti: "a" });
const A2 = jwt({ lic: LIC_A, seat: SEAT_A, jti: "a2" });
const OVERZICHT = CONNECTOR + "/dashboard/overzicht";
const STORING = { status: 503, body: { error: "temporarily_unavailable" }, headers: { "Retry-After": "0" } };

/** Elk overzichtverzoek, als pad + query, in volgorde. */
const overzichten = (verzoeken) => verzoeken
  .filter((v) => v.url === OVERZICHT || v.url.startsWith(OVERZICHT + "?"))
  .map((v) => v.url.slice(CONNECTOR.length));
const metToken = (v, token) => ((v.opties.headers || {}).Authorization === "Bearer " + token);

function siteMet(tokenAntwoorden, overig = {}) {
  const rij = tokenAntwoorden.slice();
  return (naam) => {
    if (naam === "token") return rij.length > 1 ? rij.shift() : rij[0];
    if (naam === "uitloggen") return overig.uitloggen ? overig.uitloggen() : { status: 204 };
    if (naam === "overal") return overig.overal || { status: 200, body: { ingetrokken: 2 } };
    return { status: 404, body: {} };
  };
}

describe("de markering open=1 bij het eerste laden", () => {
  it("met een sessie: het eerste overzicht draagt open=1, Ververs en herladen na een schrijfactie niet", async () => {
    const { heeftTabs, tot, verzoeken, w, q } = await open({ markering: true, site: siteMet([tokenOk(A)]), geldig: [A] });
    await tot(() => heeftTabs(), "dashboard geladen");
    expect(overzichten(verzoeken)).toEqual(["/dashboard/overzicht?open=1"]);
    expect(metToken(verzoeken.find((v) => v.url === OVERZICHT + "?open=1"), A)).toBe(true);

    // Ververs: de knop op Voor jou.
    q('[data-act="ververs"]').click();
    await tot(() => overzichten(verzoeken).length === 2, "ververst");
    // Herladen na een schrijfactie: ctx.herlaad (data-bewerken, v2-bediening).
    await w.__dashboardCtx.herlaad();
    expect(overzichten(verzoeken)).toEqual([
      "/dashboard/overzicht?open=1",
      "/dashboard/overzicht",
      "/dashboard/overzicht",
    ]);
  });

  it("#sessie=nieuw (terug van inloggen) is een eerste laden: open=1", async () => {
    const { heeftTabs, tot, verzoeken } = await open({
      url: "https://dashboard.agentic-team.ai/#sessie=nieuw&r=" + encodeURIComponent("#/acties"),
      site: siteMet([tokenOk(A)]),
      geldig: [A],
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    expect(overzichten(verzoeken)).toEqual(["/dashboard/overzicht?open=1"]);
  });

  it("via de daglink, met de vlag aan maar zonder markering: open=1, met het daglink-token", async () => {
    const dl = daglink(LIC_A);
    const { heeftTabs, tot, verzoeken } = await open({ url: "https://dashboard.agentic-team.ai/#t=" + encodeURIComponent(dl), geldig: [dl] });
    await tot(() => heeftTabs(), "dashboard geladen");
    expect(overzichten(verzoeken)).toEqual(["/dashboard/overzicht?open=1"]);
    expect(metToken(verzoeken.find((v) => v.url === OVERZICHT + "?open=1"), dl)).toBe(true);
  });

  it("via de daglink in de build zonder vlag: open=1 bij het laden, Ververs niet", async () => {
    const dl = daglink(LIC_A);
    const { heeftTabs, tot, verzoeken, q } = await open({ html: HTML, url: "https://dashboard.agentic-team.ai/#t=" + encodeURIComponent(dl), geldig: [dl] });
    await tot(() => heeftTabs(), "dashboard geladen");
    expect(overzichten(verzoeken)).toEqual(["/dashboard/overzicht?open=1"]);
    q('[data-act="ververs"]').click();
    await tot(() => overzichten(verzoeken).length === 2, "ververst");
    expect(overzichten(verzoeken)).toEqual(["/dashboard/overzicht?open=1", "/dashboard/overzicht"]);
    // Zonder de vlag gaat er nooit iets naar www.
    expect(verzoeken.filter((v) => v.url.startsWith("https://www.agentic-team.ai"))).toEqual([]);
  });

  it("een daglink op een al open tabblad (hashchange) is geen eerste laden", async () => {
    const dl = daglink(LIC_A);
    const dl2 = daglink(LIC_A) + "x";
    const { heeftTabs, tot, verzoeken, w } = await open({ html: HTML, url: "https://dashboard.agentic-team.ai/#t=" + encodeURIComponent(dl), geldig: [dl, dl2] });
    await tot(() => heeftTabs(), "dashboard geladen");
    w.location.hash = "#t=" + encodeURIComponent(dl2);
    await tot(() => overzichten(verzoeken).length === 2, "nieuwe daglink geladen");
    expect(overzichten(verzoeken)).toEqual(["/dashboard/overzicht?open=1", "/dashboard/overzicht"]);
    expect(metToken(verzoeken.filter((v) => v.url.startsWith(OVERZICHT)).at(-1), dl2)).toBe(true);
  });

  it("de daglink-terugval na uitloggen is geen eerste laden", async () => {
    const dl = daglink(LIC_A);
    const { heeftTabs, tot, verzoeken, w } = await open({
      url: "https://dashboard.agentic-team.ai/#t=" + encodeURIComponent(dl),
      markering: true, site: siteMet([tokenOk(A)]), geldig: [A, dl],
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    expect(w.__dashboardCtx.bron.sessie).toBe(true);
    await w.eval("uitloggen()");
    await tot(() => overzichten(verzoeken).length === 2 && heeftTabs(), "terug op de daglink");
    const laatste = verzoeken.filter((v) => v.url.startsWith(OVERZICHT)).at(-1);
    expect(metToken(laatste, dl)).toBe(true);
    expect(overzichten(verzoeken)).toEqual(["/dashboard/overzicht?open=1", "/dashboard/overzicht"]);
  });

  it("de markering is exact open=1 en staat op geen enkel ander verzoek", async () => {
    const { heeftTabs, tot, verzoeken } = await open({ markering: true, site: siteMet([tokenOk(A)]), geldig: [A] });
    await tot(() => heeftTabs(), "dashboard geladen");
    const metMarkering = verzoeken.filter((v) => new URL(v.url).searchParams.has("open"));
    expect(metMarkering.map((v) => v.url)).toEqual([OVERZICHT + "?open=1"]);
    // Geen body, geen extra header: hetzelfde GET-verzoek als voorheen.
    expect(metMarkering[0].opties.body).toBeUndefined();
    expect(Object.keys(metMarkering[0].opties.headers || {})).toEqual(["Authorization"]);
  });
});

describe("uitloggen op alle apparaten: de site én de instantie falen", () => {
  const intrekFaalt = (pad) => (pad === "/dashboard/sessies/intrekken" ? { status: 503, body: { fout: "storing" } } : undefined);

  it("de fout met Opnieuw uitloggen, de markering blijft, inloggen wacht", async () => {
    let uitlogOk = true;
    const { heeftTabs, tot, verzoeken, w, q, titel, uitleg, markeringNu } = await open({
      markering: true,
      site: siteMet([tokenOk(A), tokenOk(A2)], { overal: STORING, uitloggen: () => (uitlogOk ? { status: 204 } : STORING) }),
      geldig: [A, A2],
      instantie: intrekFaalt,
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    const bezig = w.eval("uitloggenOveral()");
    let klaar = false;
    const wacht = w.eval("wachtOpSessieAfsluiten()").then(() => { klaar = true; });
    expect(klaar).toBe(false);
    await bezig;
    await wacht;
    expect(titel()).toBe("Uitloggen is niet gelukt");
    expect(uitleg()).toBe(w.eval("SESSIE_UITLOG_MISLUKT_TEKST"));
    expect(uitleg()).not.toContain("In dit tabblad ben je uitgelogd");
    expect(markeringNu()).toBe(JSON.stringify({ tot: TOT }));
    expect(w.eval("sessieToegang")).toBeNull();
    expect(w.eval("huidigeBron")).toBeNull();
    expect(heeftTabs()).toBe(false);
    // Geen loginknop: die zou het levende cookie zonder mail hervatten.
    expect(q('#root .balk [data-act="login"]')).toBeNull();
    const knop = q('#root .balk [data-act="uitloggen"]');
    expect(knop && knop.textContent).toBe("Opnieuw uitloggen");
    // Opnieuw uitloggen lukt: dan pas uitgelogd, en de markering weg.
    knop.click();
    await tot(() => titel() === "Je bent uitgelogd", "uitgelogd");
    expect(markeringNu()).toBeNull();
    expect(credentialsAlleenNaarSessie(verzoeken)).toBe(true);
  });

  it("ook als de site niet bereikbaar is (netwerkfout)", async () => {
    const { heeftTabs, tot, w, titel, markeringNu } = await open({
      markering: true, site: siteMet([tokenOk(A), tokenOk(A2)]), geldig: [A, A2], instantie: intrekFaalt,
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    const echteFetch = w.fetch;
    w.fetch = async (u, o) => {
      if (String(u) === URLS.overal) throw new TypeError("Failed to fetch");
      return echteFetch(u, o);
    };
    await w.eval("uitloggenOveral()");
    expect(titel()).toBe("Uitloggen is niet gelukt");
    expect(markeringNu()).toBe(JSON.stringify({ tot: TOT }));
  });

  it("alleen de site faalt (de instantie trok in): de bestaande melding, de markering weg", async () => {
    const { heeftTabs, tot, w, titel, uitleg, markeringNu } = await open({
      markering: true, site: siteMet([tokenOk(A), tokenOk(A2)], { overal: STORING }), geldig: [A, A2],
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    await w.eval("uitloggenOveral()");
    expect(titel()).toBe("Je bent uitgelogd");
    expect(uitleg()).toContain("In dit tabblad ben je uitgelogd");
    expect(markeringNu()).toBeNull();
  });

  it("alleen de instantie faalt (het cookie is ingetrokken): de melding met de daglink-voetnoot", async () => {
    const { heeftTabs, tot, w, titel, uitleg, markeringNu } = await open({
      markering: true, site: siteMet([tokenOk(A), tokenOk(A2)]), geldig: [A, A2], instantie: intrekFaalt,
    });
    await tot(() => heeftTabs(), "dashboard geladen");
    await w.eval("uitloggenOveral()");
    expect(titel()).toBe("Je bent uitgelogd");
    expect(uitleg()).toBe("Je bent op alle apparaten uitgelogd. " + w.eval("SESSIE_OVERAL_ZONDER_INSTANTIE_TEKST"));
    expect(markeringNu()).toBeNull();
  });
});
