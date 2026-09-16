// @vitest-environment jsdom
/* f34 — "Jouw modules" is alleen voor de licentiebeheerder.
 *
 * Pakket, bedragen en abonnement horen bij wie de licentie kocht (PV 3.9 lid 2),
 * niet bij elk teamlid. De site geeft een gewoon teamlid daarom alleen welke
 * modules er aan staan (`beheerder: false`); tegel, detail-nav en detailpagina
 * blijven dan weg. Die module-keys blijven wél nodig: de agentsuggesties
 * (i71) mogen niets voorstellen uit een module die de klant niet heeft — ook
 * niet voor een teamlid.
 *
 * Een site van vóór dit onderscheid stuurt geen `beheerder` mee. Dan beslist
 * de vorm (een volledig overzicht mét maandbedrag), zodat een dashboard dat
 * eerder live gaat dan de site niets kapotmaakt.
 *
 * Twee lagen: de beslisfunctie los (vm, snel), en de drie plekken samen op het
 * échte gebouwde dashboard.html met een ingelogde sessie. */
import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [
  "schema/schema.generated.js",
  "src/teksten.js",
  "src/schema-helpers.js",
  "src/werkruimte-loader.js",
  "src/zones.js",
  "src/metrics-sanitize.js",
  "src/metrics.js",
  "src/render.js",
  "src/charts.js",
  "src/feed.js",
  "src/homepage.js",
  "src/databrowser.js",
  "src/data-bewerken.js",
  "src/modules-beheer.js",
];

const lees = (naam) => vm.runInThisContext(naam);
const zet = (naam, waarde) => {
  globalThis.__zetWaarde = waarde;
  vm.runInThisContext(`${naam} = globalThis.__zetWaarde`);
};

const VOLLEDIG = {
  pakket: "Modulair (Core + Growth)",
  maandbedragExclBtw: 128,
  btwPercentage: 21,
  jaarGratisMaanden: 2,
  modules: [
    { key: "core", naam: "Core", prijs: 79, actief: true, altijdInbegrepen: true, belofte: "Je digitale stafchef", agents: [], datadomeinen: [] },
    { key: "growth", naam: "Growth", prijs: 49, actief: true, altijdInbegrepen: false, belofte: "Gevulde pijplijn", agents: [], datadomeinen: [] },
    { key: "sales", naam: "Sales", prijs: 49, actief: false, altijdInbegrepen: false, belofte: "Naar getekend contract", agents: [], datadomeinen: [] },
  ],
};
const BEHEERDER = { ...VOLLEDIG, beheerder: true };
// Precies de vorm uit het contract: niets over geld of abonnement.
const TEAMLID = {
  beheerder: false,
  modules: [
    { key: "core", naam: "Core", actief: true },
    { key: "growth", naam: "Growth", actief: true },
    { key: "sales", naam: "Sales", actief: false },
  ],
};

describe("moduleOverzichtBeschikbaar — de beslissing", () => {
  beforeAll(() => {
    for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  });

  beforeEach(() => {
    zet("moduleOverzicht", null);
    document.body.innerHTML = `<section id="panel-modules" style="display:none;"><div id="panel-modules-body"></div></section><nav id="detail-nav"></nav>`;
  });

  it("verbergt tegel en nav-item voor een teamlid, maar kent de actieve modules wél", () => {
    zet("moduleOverzicht", TEAMLID);
    expect(lees("moduleOverzichtBeschikbaar")()).toBe(false);
    lees("renderModulesPanel")(document.getElementById("panel-modules"));
    expect(document.getElementById("panel-modules").style.display).toBe("none");
    lees("renderDetailNav")(document.getElementById("detail-nav"), "feed", false);
    expect(document.getElementById("detail-nav").textContent).not.toContain("Jouw modules");
    expect(lees("actieveModuleKeys")()).toEqual(["core", "growth"]);
  });

  it("toont ze voor de beheerder", () => {
    zet("moduleOverzicht", BEHEERDER);
    expect(lees("moduleOverzichtBeschikbaar")()).toBe(true);
    lees("renderModulesPanel")(document.getElementById("panel-modules"));
    expect(document.getElementById("panel-modules").style.display).toBe("");
    lees("renderDetailNav")(document.getElementById("detail-nav"), "feed", false);
    expect(document.getElementById("detail-nav").textContent).toContain("Jouw modules");
    expect(lees("actieveModuleKeys")()).toEqual(["core", "growth"]);
  });

  it("volgt het veld, niet de vorm, zodra de site het meestuurt", () => {
    zet("moduleOverzicht", { ...VOLLEDIG, beheerder: false });
    expect(lees("moduleOverzichtBeschikbaar")()).toBe(false);
  });

  it("zonder veld (oude site): volledig overzicht = zoals voorheen, beperkt = niet tonen", () => {
    zet("moduleOverzicht", VOLLEDIG);
    expect(lees("moduleOverzichtBeschikbaar")()).toBe(true);
    zet("moduleOverzicht", { modules: TEAMLID.modules });
    expect(lees("moduleOverzichtBeschikbaar")()).toBe(false);
    expect(lees("actieveModuleKeys")()).toEqual(["core", "growth"]);
  });
});

/* ── end-to-end op het gebouwde artefact ─────────────────────────────── */

const HTML = readFileSync(join(ROOT, "dashboard.html"), "utf8");
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "test/fixtures/oauth-fixture.json"), "utf8"));
const JWT = FIXTURE.tokens.dashboard.jwt;
const HTML_MET_LOGIN = HTML.replace("<title>", '<meta name="at-oauth" content="1">\n<title>');
const SITE = "https://www.agentic-team.ai";

async function openIngelogd(modulesAntwoord) {
  const fouten = [];
  const dom = new JSDOM(HTML_MET_LOGIN, {
    runScripts: "dangerously",
    url: "http://localhost/dashboard.html",
    pretendToBeVisual: true,
    beforeParse(w) {
      w.console.error = (...a) => fouten.push(a.map(String).join(" "));
      w.scrollTo = () => {};
      w.addEventListener("error", (e) => fouten.push("error:" + e.message));
      w.Response = Response;
      w.sessionStorage.setItem("agentic-team-dashboard:oauth", JSON.stringify({ access_token: JWT, token_type: "Bearer", refresh_token: "atr_1", scope: "dashboard:lees" }));
      w.fetch = async (u, opties = {}) => {
        const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
        const url = new URL(String(u));
        if ((opties.headers || {}).Authorization !== "Bearer " + JWT) return json(401, { fout: "verlopen" });
        if (url.origin === SITE && url.pathname === "/api/dashboard/modules") return json(200, modulesAntwoord);
        if (url.origin === SITE) return json(404, { fout: "Niet beschikbaar." });
        if (url.pathname === "/dashboard/overzicht") return json(200, { klant: "Testbedrijf BV", intern: false, domeinen: [{ domein: "acties", aantal: 1 }] });
        if (url.pathname === "/dashboard/entries") {
          return json(200, { domein: "acties", entries: [{ domein: "acties", entryId: "a-1", data: { Actie: "Offerte nabellen", Status: "Open" }, aangemaakt: "2026-08-20T09:00:00Z", bijgewerkt: "2026-08-20T09:00:00Z" }] });
        }
        return json(404, { fout: "Onbekende route" });
      };
    },
  });
  const w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  const $ = (id) => w.document.getElementById(id);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function tot(conditie, wat) {
    for (let i = 0; i < 400; i++) {
      await tick();
      if (conditie()) return;
    }
    throw new Error("timeout: " + wat);
  }
  await tot(() => $("tabbar").style.display !== "none", "dashboard geladen");
  // Het moduleoverzicht komt ná de eerste render binnen; wachten tot het er is.
  await tot(() => w.actieveModuleKeys() !== null, "moduleoverzicht geladen");
  async function naarDetailModules() {
    w.location.hash = "#/detail/modules";
    await tot(() => $("detail-view").style.display !== "none", "detailroute");
  }
  return { w, $, fouten, naarDetailModules };
}

describe("gewisseld naar een daglink (zelfde tabblad)", () => {
  // De modules zijn al in deze context geladen door het eerste describe-blok;
  // nog eens laden botst op dubbele const-declaraties.
  beforeEach(() => {
    zet("moduleOverzicht", null);
    zet("moduleOverzichtVoorToken", null);
    document.body.innerHTML = `<section id="panel-modules" style="display:none;"><div id="panel-modules-body"></div></section><nav id="detail-nav"></nav>`;
  });

  it("verbergt de tegel van de beheerder zodra de bron een daglink is", async () => {
    const aanroepen = [];
    zet("modulesFetch", async (pad, body, token) => { aanroepen.push(token); return { ok: true, status: 200, body: BEHEERDER }; });
    await lees("laadModuleOverzicht")({ oauth: true, token: "jwt" });
    const el = document.getElementById("panel-modules");
    lees("renderModulesPanel")(el);
    expect(el.style.display).toBe("");

    await lees("laadModuleOverzicht")({ token: "daglinktoken" });
    lees("renderModulesPanel")(el);
    expect(el.style.display).toBe("none");
    expect(lees("moduleOverzichtBeschikbaar")()).toBe(false);
    // Het daglink-token hoort onze server nooit te bereiken.
    expect(aanroepen).toEqual(["jwt"]);
  });

  it("haalt het overzicht opnieuw op bij terugkeer naar dezelfde ingelogde sessie", async () => {
    const aanroepen = [];
    zet("modulesFetch", async (pad, body, token) => { aanroepen.push(token); return { ok: true, status: 200, body: BEHEERDER }; });
    const sessie = { oauth: true, token: "jwt" };
    await lees("laadModuleOverzicht")(sessie);
    await lees("laadModuleOverzicht")({ token: "daglinktoken" });
    expect(await lees("laadModuleOverzicht")(sessie)).not.toBeNull();
    expect(aanroepen).toEqual(["jwt", "jwt"]);
  });
});

describe("dashboard.html — tegel, nav en detailroute", () => {
  it("een teamlid ziet geen moduletegel, geen nav-item en geen detailpagina, maar de keys werken", async () => {
    const { w, $, fouten, naarDetailModules } = await openIngelogd(TEAMLID);
    expect($("panel-modules").style.display).toBe("none");
    expect(w.actieveModuleKeys()).toEqual(["core", "growth"]);
    await naarDetailModules();
    expect($("detail-nav").textContent).not.toContain("Jouw modules");
    expect($("detail-body").textContent).toContain("Onbekende detailpagina");
    // Niets over geld in de pagina — het teamlid kreeg het niet eens binnen.
    expect($("detail-body").textContent).not.toMatch(/€/);
    expect(fouten).toEqual([]);
  });

  it("de beheerder ziet tegel, nav-item en detailpagina", async () => {
    const { w, $, fouten, naarDetailModules } = await openIngelogd(BEHEERDER);
    expect($("panel-modules").style.display).toBe("");
    expect($("panel-modules-body").textContent).toContain("128");
    expect(w.actieveModuleKeys()).toEqual(["core", "growth"]);
    await naarDetailModules();
    expect($("detail-nav").textContent).toContain("Jouw modules");
    expect($("detail-inner").textContent).toContain("Modulair (Core + Growth)");
    expect(fouten).toEqual([]);
  });
});
