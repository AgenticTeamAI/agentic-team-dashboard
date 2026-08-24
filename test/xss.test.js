// @vitest-environment jsdom
/* b32 / AT-003: stored DOM-XSS via dashboard_metrics en daglink-origin.
 * Laadt de echte src-modules (in build-volgorde) in de jsdom-globale scope en
 * rendert vijandige payloads door dezelfde functies die dashboard.html gebruikt. */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [
  "schema/schema.generated.js",
  "src/schema-helpers.js",
  "src/bundle-loaders.js",
  "src/werkruimte-loader.js",
  "src/zones.js",
  "src/metrics-sanitize.js",
  "src/metrics.js",
  "src/render.js",
  "src/charts.js",
  "src/homepage.js",
];

const XSS = '"><img src=q onerror=window.__xss=1><li class="';
const TODAY = new Date("2026-08-24T12:00:00Z");

let g;
beforeAll(() => {
  for (const rel of MODULES) {
    vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  }
  g = globalThis;
});

function el() {
  const d = document.createElement("div");
  document.body.appendChild(d);
  return d;
}

function vijandigPayload() {
  return {
    versie: 1,
    gegenereerd_op: "2026-08-24",
    aandacht: [
      { type: "deadline", ernst: XSS, label: `<b>${XSS}</b>`, link: "javascript:alert(1)" },
    ],
    domeinen: { [XSS]: { laatst_bijgewerkt: "2020-01-01", rijen: 3 }, acties: { laatst_bijgewerkt: "2020-01-01", rijen: 3 } },
    acties: { totaal: XSS, afgerond: "<script>1</script>", opmerking: XSS },
    sales_funnel: { per_fase: { [XSS]: XSS }, verwachte_omzet_totaal: XSS },
    content: { gepubliceerd: XSS },
    klantsucces: { in_onboarding: XSS },
    backlog: { besloten: XSS },
    lessen: { totaal: XSS, open: XSS, in_periode: XSS, per_categorie: { [XSS]: XSS } },
    weekreeks: { bronnen: ["dagverslagen"], buckets: [{ week_start: "2026-08-17", label: XSS, waarden: { interacties: XSS } }] },
    agents: { per_agent: { [XSS]: { aantal_periode: XSS }, jurist: { aantal_periode: 2, aantal_totaal: "<x>" } } },
  };
}

/* Structurele checks: de payload mag alleen als tekst overleven (geëscaped),
 * nooit als element of attribuut. */
function geenInjectie(container) {
  expect(container.querySelectorAll("img, script, iframe, svg").length).toBe(0);
  expect(container.querySelector("[onerror], [onload], [onclick]")).toBeNull();
  expect(g.__xss).toBeUndefined();
}

describe("saneerMetricsPayload", () => {
  it("laat alleen bekende velden in het juiste type door", () => {
    const uit = g.saneerMetricsPayload(vijandigPayload(), g.AGENTIC_TEAM_SCHEMA);
    expect(uit.aandacht[0]).toEqual({ type: "deadline", ernst: "grijs", label: `<b>${XSS}</b>`.slice(0, 300), link: null });
    expect(Object.keys(uit.domeinen)).toEqual(["acties"]);
    expect(uit.acties).toMatchObject({ totaal: 0, afgerond: 0 });
    expect(uit.sales_funnel.verwachte_omzet_totaal).toBe(0);
    expect(uit.lessen).toMatchObject({ totaal: 0, open: 0, in_periode: 0 });
    expect(Object.keys(uit.agents.per_agent)).toEqual(["jurist"]);
    expect(uit.agents.per_agent.jurist).toEqual({ aantal_periode: 2, aantal_totaal: 0, laatst: null });
  });

  it("geeft null voor niet-objecten", () => {
    expect(g.saneerMetricsPayload("x", g.AGENTIC_TEAM_SCHEMA)).toBeNull();
    expect(g.saneerMetricsPayload([1], g.AGENTIC_TEAM_SCHEMA)).toBeNull();
  });
});

describe("render met vijandig metricsbestand", () => {
  let metrics;
  beforeAll(() => {
    const result = g.parseNotionMetricsFile(vijandigPayload(), g.AGENTIC_TEAM_SCHEMA, TODAY, 25);
    expect(result.ok).toBe(true);
    metrics = result.metrics;
  });

  it("zone 1 (aandacht + verouderde domeinen) escapet ernst, label en domeinsleutels", () => {
    const c = el();
    g.renderZone1(c, metrics.z1);
    geenInjectie(c);
    const klassen = [...c.querySelectorAll("li")].map(li => li.className);
    expect(klassen.every(k => ["rood", "oranje", "groen", "grijs"].includes(k))).toBe(true);
    expect(c.textContent).toContain("<b>");
  });

  it("aandacht-top-5 op de homepage", () => {
    const c = el();
    g.renderAandachtTop5(c, metrics.z1);
    geenInjectie(c);
  });

  it("zone 4 (opbrengst) escapet de getal-slots", () => {
    const c = el();
    g.renderZone4(c, metrics.z4, 84);
    geenInjectie(c);
    expect(c.textContent).toContain("0 / 0");
  });

  it("zone 5 (leren)", () => {
    const c = el();
    g.renderZone5(c, metrics.z5, 84);
    geenInjectie(c);
  });

  it("kpi-tegels met minutenPerActie uit een vijandige waarde", () => {
    const c = el();
    g.renderKpiTegels(c, { adopt: metrics.adopt, tijdwinst: metrics.tijdwinst, sporenTotaal: metrics.sporenTotaal, periodWeeks: 12, minutenPerActie: XSS });
    geenInjectie(c);
    expect(c.querySelector("#input-minuten").getAttribute("value")).toBe(XSS);
  });
});

describe("render.js zelf — ook zonder sanitizer geen markup", () => {
  it("card()-getal en domeinen worden geëscaped", () => {
    const c = el();
    g.renderZone4(c, { acties: { totaal: XSS, afgerond: XSS, opmerking: "" } }, 84);
    geenInjectie(c);
    const d = el();
    g.renderZone1(d, [{ type: "verouderd", ernst: XSS, label: "x", domeinen: [XSS], rows: null }]);
    geenInjectie(d);
  });
});

describe("parseDaglinkFragment (instantie-origin)", () => {
  it("accepteert alleen Container-Apps-hosts (en localhost)", () => {
    expect(g.parseDaglinkFragment("#t=abc&i=https://wr-x.westeurope.azurecontainerapps.io")).toEqual({
      token: "abc", instantieUrl: "https://wr-x.westeurope.azurecontainerapps.io",
    });
    expect(g.parseDaglinkFragment("#t=abc&i=http://localhost:8080")).toEqual({ token: "abc", instantieUrl: "http://localhost:8080" });
    expect(g.parseDaglinkFragment("#t=abc&i=https://evil.example.com")).toBeNull();
    expect(g.parseDaglinkFragment("#t=abc&i=https://azurecontainerapps.io")).toBeNull();
    expect(g.parseDaglinkFragment("#t=abc&i=https://x.azurecontainerapps.io.evil.com")).toBeNull();
    expect(g.parseDaglinkFragment("#t=abc&i=http://wr-x.westeurope.azurecontainerapps.io")).toBeNull();
  });
});
