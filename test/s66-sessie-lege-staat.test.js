/* s66 stap 1 — de lege staat met de vlag DASHBOARD_SESSIE: geen enkel
 * netwerkverzoek zonder markering of fragment.
 *
 * Besluit Tijmen 26-11-2026: de dashboardsessie overleeft het tabblad. Dat
 * mag de belofte van de lege staat niet breken: wie het dashboard opent
 * zonder eerder te zijn ingelogd (geen markering) en zonder link, krijgt de
 * Hulp en de loginknop, en de pagina praat met niemand. De markering is een
 * optimalisatie; zonder markering hervat de loginknop een levende sessie bij
 * de site (een navigatie, geen fetch). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { open, HTML, HTML_MET_LOGIN, HTML_MET_SESSIE, SESSIE_META, OAUTH_META, ROOT, MARKERING, TOT } from "./helpers/s66-sessie.js";

const BUILD_PY = readFileSync(join(ROOT, "scripts", "build.py"), "utf8");
const VERCEL = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));

describe("de build-vlag DASHBOARD_SESSIE", () => {
  it("is build-time: build.py zet de meta alleen met --sessie, direct na de oauth-meta", () => {
    expect(BUILD_PY).toContain('sessie = "--sessie" in sys.argv');
    expect(BUILD_PY).toContain(`('${OAUTH_META}' if oauth else "") + ('${SESSIE_META}' if sessie else "")`);
    expect(VERCEL.buildCommand).toContain("${DASHBOARD_SESSIE:+--sessie}");
  });

  it("staat in de gecommitte release-build uit", () => {
    expect(HTML).not.toContain(SESSIE_META);
    expect(HTML).not.toContain(OAUTH_META);
  });

  it("build.py weigert --sessie zonder --oauth, vóór er iets geschreven is", () => {
    const voor = readFileSync(join(ROOT, "dashboard.html"), "utf8");
    expect(() => execFileSync("python3", ["scripts/build.py", "--sessie"], { cwd: ROOT, stdio: "pipe" })).toThrow(/--sessie vraagt ook --oauth/);
    expect(readFileSync(join(ROOT, "dashboard.html"), "utf8")).toBe(voor);
  });
});

describe("met de vlag: de lege staat doet niets", () => {
  it("zonder markering en zonder fragment: loginknop, Hulp, nul verzoeken", async () => {
    const { titel, loginknop, heeftTabs, verzoeken, fouten, markeringNu } = await open();
    expect(heeftTabs()).toBe(false);
    expect(titel()).toBe("Log in om je team te zien");
    expect(loginknop()).not.toBeNull();
    expect(verzoeken).toEqual([]);
    expect(markeringNu()).toBeNull();
    expect(fouten).toEqual([]);
  });

  it("een verstreken markering wordt opgeruimd, zonder verzoek", async () => {
    const { verzoeken, markeringNu, titel } = await open({ markering: JSON.stringify({ tot: "2020-01-01T00:00:00.000Z" }) });
    expect(verzoeken).toEqual([]);
    expect(markeringNu()).toBeNull();
    expect(titel()).toBe("Log in om je team te zien");
  });

  it("een kapotte markering telt niet, en verdwijnt", async () => {
    for (const raw of ["niet-json", JSON.stringify({ tot: "morgen" }), JSON.stringify({}), JSON.stringify(null)]) {
      const { verzoeken, markeringNu } = await open({ markering: raw });
      expect(verzoeken, raw).toEqual([]);
      expect(markeringNu(), raw).toBeNull();
    }
  });

  it("een deeplink zonder markering vraagt om inloggen, zonder verzoek", async () => {
    const { verzoeken, titel } = await open({ url: "https://dashboard.agentic-team.ai/#/acties" });
    expect(titel()).toBe("Log in om deze pagina te openen");
    expect(verzoeken).toEqual([]);
  });

  it("de sleutels van de oude tabbladflow gaan bij het laden weg, ook dan zonder verzoek", async () => {
    const { w, verzoeken } = await open({
      voor(w) {
        w.sessionStorage.setItem("agentic-team-dashboard:oauth", JSON.stringify({ access_token: "oud.jwt.x", refresh_token: "atr_oud" }));
        w.localStorage.setItem("agentic-team-dashboard:oauth-pkce", JSON.stringify({ verifier: "V".repeat(43), state: "S", t: Date.now() }));
      },
    });
    expect(w.sessionStorage.getItem("agentic-team-dashboard:oauth")).toBeNull();
    expect(w.localStorage.getItem("agentic-team-dashboard:oauth-pkce")).toBeNull();
    // Geen refresh met het achtergebleven token: dat is precies wat s66 weghaalt.
    expect(verzoeken).toEqual([]);
  });

  it("via file:// blijft het nul verzoeken, ook mét markering", async () => {
    const { verzoeken, q } = await open({ url: "file:///Users/iemand/Downloads/dashboard.html", markering: true });
    expect(q('[data-act="login"]')).toBeNull();
    expect(verzoeken).toEqual([]);
  });
});

describe("zonder de vlag: alles zoals het was", () => {
  it("een markering in de opslag doet niets, en blijft onaangeroerd", async () => {
    const { verzoeken, markeringNu, loginknop } = await open({ html: HTML_MET_LOGIN, markering: true });
    expect(verzoeken).toEqual([]);
    expect(markeringNu()).toBe(JSON.stringify({ tot: TOT }));
    expect(loginknop()).not.toBeNull();
  });

  it("de oude tabbladsessie werkt nog: één refresh naar het oude token-endpoint, geen cookies", async () => {
    const { verzoeken, tot, heeftTabs } = await open({
      html: HTML_MET_LOGIN,
      geldig: ["nieuw.jwt.hier"],
      voor(w) { w.sessionStorage.setItem("agentic-team-dashboard:oauth", JSON.stringify({ access_token: "oud.jwt.x", refresh_token: "atr_oud" })); },
      instantie: () => undefined,
    });
    // De oude refresh krijgt van het harnas een 404 (niet de sessie-URL): de pagina valt terug op de loginknop.
    await tot(() => !heeftTabs() && verzoeken.some((v) => v.url.endsWith("/api/oauth/token")), "oude refresh");
    for (const v of verzoeken) expect(v.opties.credentials, v.url).toBeUndefined();
    expect(verzoeken.filter((v) => v.url.includes("/api/dashboard/sessie/"))).toEqual([]);
  });

  it("de sessiemeta zonder at-oauth zet de flow niet aan", async () => {
    const { verzoeken, markeringNu } = await open({ html: HTML.replace("<title>", SESSIE_META + "\n<title>"), markering: true });
    expect(verzoeken).toEqual([]);
    expect(markeringNu()).not.toBeNull();
  });
});

describe("de releasebuild met de vlag (smoke)", () => {
  it("HTML_MET_SESSIE draagt beide meta's precies één keer", () => {
    expect(HTML_MET_SESSIE.split(SESSIE_META)).toHaveLength(2);
    expect(HTML_MET_SESSIE.split(OAUTH_META)).toHaveLength(2);
    expect(MARKERING).toBe("agentic-team-dashboard:sessie");
  });
});

/* ── de privacytekst: concept achter de vlag, de goedgekeurde tekst ongemoeid ── */

describe("de privacytekst", () => {
  const CONCEPT_INLOG = "zet agentic-team.ai een functioneel cookie in je browser dat je ingelogd houdt";
  const CONCEPT_OPSLAG = "Je inlogtoken staat alleen in het geheugen van deze pagina";
  const OUD_INLOG = "wisselt je browser een inlogcode om bij agentic-team.ai";
  const OUD_OPSLAG = "In je browser bewaren we je inlogtoken, de daglink en je gekozen filter voor de duur van dit tabblad";

  it("met de vlag toont de Hulp het concept op de plek van de inlog- en de opslagalinea", async () => {
    const { w } = await open();
    const tekst = w.document.getElementById("root").textContent;
    expect(tekst).toContain(CONCEPT_INLOG);
    expect(tekst).toContain(CONCEPT_OPSLAG);
    expect(tekst).not.toContain(OUD_INLOG);
    expect(tekst).not.toContain(OUD_OPSLAG);
    // De tellerzin, uitgebreid met de opens via een daglink of een sessie.
    expect(tekst).toContain("hoe vaak het dashboard opent via een daglink en hoe vaak via een sessie");
  });

  it("zonder de vlag de goedgekeurde tekst, en geen concept", async () => {
    const { w } = await open({ html: HTML_MET_LOGIN });
    const tekst = w.document.getElementById("root").textContent;
    expect(tekst).toContain(OUD_INLOG);
    expect(tekst).toContain(OUD_OPSLAG);
    expect(tekst).not.toContain(CONCEPT_INLOG);
  });

  it("het concept is gemarkeerd, en PRIVACY_UITKLAP is de goedgekeurde tekst gebleven", () => {
    const src = readFileSync(join(ROOT, "src/teksten.js"), "utf8");
    expect(src).toContain('markering: "CONCEPT — juridische ronde s66, niet vastgesteld"');
    expect(src).toContain('const PRIVACY_UITKLAP = PRIVACY_UITKLAP_ALINEAS.join(" ");');
    expect(HTML).toContain(OUD_OPSLAG);
  });
});
