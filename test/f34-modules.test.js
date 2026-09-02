// @vitest-environment jsdom
/* f34 fase 0 — "Jouw modules" (read-only tegel + detailpagina).
 *
 * Dekt de drie manieren waarop dit fout kan gaan: het paneel tonen zonder
 * dat de site iets leverde (moet verborgen blijven — afwezig is geen fout),
 * vijandige inhoud uit het site-antwoord (moet ge-escaped renderen), en het
 * laden zelf (alleen met een ingelogde p10-bron, één poging per token,
 * niet-200 = geen overzicht). */
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
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

const XSS = '"><img src=q onerror=window.__xss=1>';

const lees = (naam) => vm.runInThisContext(naam);
const zet = (naam, waarde) => {
  globalThis.__zetWaarde = waarde;
  vm.runInThisContext(`${naam} = globalThis.__zetWaarde`);
};

const overzicht = (over = {}) => ({
  pakket: "Modulair (Core + Growth)",
  maandbedragExclBtw: 128,
  btwPercentage: 21,
  jaarGratisMaanden: 2,
  modules: [
    { key: "core", naam: "Core", prijs: 79, actief: true, altijdInbegrepen: true, belofte: "Je digitale stafchef", agents: [{ slug: "orchestrator", naam: "🥷 Coördinator" }], datadomeinen: ["🗂️ Acties"] },
    { key: "growth", naam: "Growth", prijs: 49, actief: true, altijdInbegrepen: false, belofte: "Gevulde pijplijn", agents: [{ slug: "researcher", naam: "🔎 Researcher" }], datadomeinen: ["📇 Prospects"] },
    { key: "sales", naam: "Sales", prijs: 49, actief: false, altijdInbegrepen: false, belofte: "Naar getekend contract", agents: [{ slug: "dealmaker", naam: "🤝 Dealmaker" }], datadomeinen: ["💼 Deals"] },
  ],
  ...over,
});

beforeAll(() => {
  for (const rel of MODULES) {
    vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  }
});

beforeEach(() => {
  zet("moduleOverzicht", null);
  zet("moduleOverzichtVoorToken", null);
  document.body.innerHTML = `<section id="panel-modules" style="display:none;"><div id="panel-modules-body"></div></section><nav id="detail-nav"></nav><div id="detail-inner"></div>`;
});

describe("renderModulesPanel", () => {
  it("blijft verborgen zonder overzicht — afwezig is geen fout", () => {
    lees("renderModulesPanel")(document.getElementById("panel-modules"));
    expect(document.getElementById("panel-modules").style.display).toBe("none");
  });

  it("toont pakket en maandbedrag zodra het overzicht er is", () => {
    zet("moduleOverzicht", overzicht());
    lees("renderModulesPanel")(document.getElementById("panel-modules"));
    const el = document.getElementById("panel-modules");
    expect(el.style.display).toBe("");
    expect(el.textContent).toContain("Modulair (Core + Growth)");
    expect(el.textContent).toContain("128");
    expect(el.querySelector('[data-goto="modules"]')).toBeTruthy();
  });

  it("escapet vijandige inhoud uit het site-antwoord", () => {
    zet("moduleOverzicht", overzicht({ pakket: XSS }));
    lees("renderModulesPanel")(document.getElementById("panel-modules"));
    expect(window.__xss).toBeUndefined();
    expect(document.getElementById("panel-modules").querySelector("img")).toBeNull();
  });
});

describe("detail-nav en detailpagina", () => {
  it("toont het modules-item alleen mét overzicht", () => {
    lees("renderDetailNav")(document.getElementById("detail-nav"), "feed", false);
    expect(document.getElementById("detail-nav").textContent).not.toContain("Jouw modules");
    zet("moduleOverzicht", overzicht());
    lees("renderDetailNav")(document.getElementById("detail-nav"), "feed", false);
    expect(document.getElementById("detail-nav").textContent).toContain("Jouw modules");
  });

  it("rendert per module een kaart met actief-status, agents en domeinen", () => {
    zet("moduleOverzicht", overzicht());
    lees("renderDetailModules")(document.getElementById("detail-inner"));
    const html = document.getElementById("detail-inner").innerHTML;
    expect(html).toContain("Growth");
    expect(html).toContain("✓ actief");
    expect(html).toContain("niet actief");
    expect(html).toContain("Dealmaker");
    expect(html).toContain("💼 Deals");
    expect(document.getElementById("modules-verzoek-knop")).toBeTruthy();
  });
});

describe("laadModuleOverzicht", () => {
  it("laadt niets zonder ingelogde p10-bron (daglink heeft geen modulescope)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await lees("laadModuleOverzicht")(null)).toBeNull();
    expect(await lees("laadModuleOverzicht")({ token: "dag-token" })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("haalt het overzicht op met het token en cachet per token", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => overzicht() }));
    vi.stubGlobal("fetch", fetchSpy);
    const bron = { oauth: true, token: "tok-1" };
    const uit = await lees("laadModuleOverzicht")(bron);
    expect(uit.maandbedragExclBtw).toBe(128);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://www.agentic-team.ai/api/dashboard/modules");
    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-1");
    await lees("laadModuleOverzicht")(bron); // zelfde token → geen tweede call
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("laat het overzicht leeg bij een niet-200 (allowlist dicht, verlopen token)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    expect(await lees("laadModuleOverzicht")({ oauth: true, token: "tok-2" })).toBeNull();
    expect(lees("moduleOverzichtBeschikbaar")()).toBe(false);
    vi.unstubAllGlobals();
  });
});
