// @vitest-environment jsdom
/* i25: correctievrij-percentage (de f19-gate). Laadt de echte src-modules in
 * build-volgorde (zelfde patroon als xss.test.js) en test beide routes tegen
 * dezelfde definitie, plus sanitizer-whitelist en XSS op de detailrender. */
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

const TODAY = new Date(2026, 7, 24, 12, 0); // maandag, lokale tijd (TZ-onafhankelijk)
const XSS = '"><img src=q onerror=window.__xss=1><li class="';

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
function geenInjectie(container) {
  expect(container.querySelectorAll("img, script, iframe, svg").length).toBe(0);
  expect(container.querySelector("[onerror], [onload], [onclick]")).toBeNull();
  expect(g.__xss).toBeUndefined();
}

function actie(over) {
  return { Actie: "x", Status: "Klaar", "Afgerond door": "Jurist", "Afgerond op": "2026-08-20", Gecorrigeerd: false, Correctie: "", ...over };
}
function bundelMet(rijen) {
  return { source: "json", sourceLabel: "test", domains: rijen ? { acties: { rows: rijen, staleAt: TODAY } } : {}, waarschuwingen: [] };
}

describe("computeCorrectievrij (rij-route)", () => {
  const rijen = [
    actie({ "Afgerond op": "2026-08-20" }),                                      // schoon, week 17-08
    actie({ "Afgerond op": "2026-08-19", Gecorrigeerd: true }),                  // gecorrigeerd (boolean), week 17-08
    actie({ "Afgerond op": "2026-08-12", Gecorrigeerd: "Ja", "Afgerond door": "Controller" }), // gecorrigeerd ("Ja"), week 10-08
    actie({ "Afgerond op": "2026-08-11", Status: "Open", Gecorrigeerd: "" }),   // heropend => gecorrigeerd, week 10-08
    actie({ "Afgerond op": "2026-07-20" }),                                      // buiten venster én buiten de 5 weken
    actie({ "Afgerond op": "2026-08-21", "Afgerond door": "" }),                 // door een mens afgerond: telt niet
    actie({ "Afgerond op": "2026-08-05", Gecorrigeerd: "nee" }),                 // schoon, week 03-08
    actie({ "Afgerond op": "2026-08-24" }),                                      // schoon, lopende week
  ];

  it("telt autonoom / gecorrigeerd / heropend en rekent het percentage", () => {
    const cv = g.computeCorrectievrij(bundelMet(rijen), TODAY);
    expect(cv.aanwezig).toBe(true);
    expect(cv).toMatchObject({ vensterDagen: 28, drempel: 80, autonoom: 6, gecorrigeerd: 3, heropend: 1 });
    expect(cv.pct).toBe(50);
  });

  it("bouwt vijf kalenderweken (maandag) en markeert de lopende", () => {
    const cv = g.computeCorrectievrij(bundelMet(rijen), TODAY);
    expect(cv.weken.map(w => w.label)).toEqual(["27-07", "03-08", "10-08", "17-08", "24-08"]);
    expect(cv.weken.map(w => [w.autonoom, w.gecorrigeerd])).toEqual([[0, 0], [1, 0], [2, 2], [2, 1], [1, 0]]);
    expect(cv.weken.map(w => w.afgesloten)).toEqual([true, true, true, true, false]);
    expect(cv.weken[2].pct).toBe(0);
    expect(cv.weken[0].pct).toBeNull();
  });

  it("gate niet gehaald: te weinig afgesloten weken met autonoom werk", () => {
    const cv = g.computeCorrectievrij(bundelMet(rijen), TODAY);
    expect(cv.gate).toMatchObject({ gehaald: false, wekenGehaald: 0, wekenVereist: 4 });
    expect(cv.gate.reden).toBe("nog maar 3 afgesloten weken met autonoom werk (4 nodig)");
  });

  it("gate gehaald bij vier schone afgesloten weken; lopende week telt niet mee", () => {
    const schoon = ["2026-07-28", "2026-08-04", "2026-08-11", "2026-08-18"].map(d => actie({ "Afgerond op": d }));
    const cv = g.computeCorrectievrij(bundelMet(schoon.concat([actie({ "Afgerond op": "2026-08-24", Gecorrigeerd: "x" })])), TODAY);
    expect(cv.gate).toMatchObject({ gehaald: true, wekenGehaald: 4, reden: null });
    expect(cv.pct).toBe(80);
  });

  it("herkent alle checkbox-schrijfwijzen", () => {
    for (const v of [true, "true", "ja", "Ja", "x", "__YES__", 1]) expect(g.checkboxWaar(v)).toBe(true);
    for (const v of [false, "", "nee", 0, null, undefined, "false"]) expect(g.checkboxWaar(v)).toBe(false);
  });

  it("zonder Acties-domein: aanwezig=false met reden; zonder autonoom werk: pct null met reden", () => {
    expect(g.computeCorrectievrij(bundelMet(null), TODAY)).toMatchObject({ aanwezig: false });
    const cv = g.computeCorrectievrij(bundelMet([actie({ "Afgerond door": "" })]), TODAY);
    expect(cv.pct).toBeNull();
    expect(cv.reden).toContain("nog geen autonoom afgeronde acties");
  });
});

describe("metrics-route (parseNotionMetricsFile + testdata)", () => {
  it("leest het testdata-blok en haalt de gate niet: week 10-08 op 67%", () => {
    const raw = JSON.parse(readFileSync(join(ROOT, "testdata/notion-metrics/metrics.json"), "utf8"));
    const result = g.parseNotionMetricsFile(raw, g.AGENTIC_TEAM_SCHEMA, TODAY, 25);
    expect(result.ok).toBe(true);
    const cv = result.metrics.correctievrij;
    expect(cv.aanwezig).toBe(true);
    expect(cv).toMatchObject({ autonoom: 22, gecorrigeerd: 3, heropend: 1, vensterDagen: 28, drempel: 80 });
    expect(Math.round(cv.pct)).toBe(86);
    expect(cv.weken.map(w => w.label)).toEqual(["27-07", "03-08", "10-08", "17-08", "24-08"]);
    expect(cv.gate).toMatchObject({ gehaald: false, wekenGehaald: 1, wekenVereist: 4 });
    expect(cv.gate.reden).toBe("week van 10-08 zat op 67%");
  });

  it("zonder blok: aanwezig=false met de registry-1.34.0-reden", () => {
    const result = g.parseNotionMetricsFile({ versie: 1, gegenereerd_op: "2026-08-24" }, g.AGENTIC_TEAM_SCHEMA, TODAY, 25);
    expect(result.ok).toBe(true);
    expect(result.metrics.correctievrij.aanwezig).toBe(false);
    expect(result.metrics.correctievrij.reden).toContain("registry 1.34.0");
  });

  it("beide routes rekenen identiek op dezelfde tellingen", () => {
    const weken = [
      { weekStart: new Date("2026-08-03"), autonoom: 5, gecorrigeerd: 1 },
      { weekStart: new Date("2026-08-10"), autonoom: 3, gecorrigeerd: 1 },
    ];
    const a = g.berekenCorrectievrij({ autonoom: 8, gecorrigeerd: 2, heropend: 0, weken }, TODAY);
    const b = g.buildCorrectievrijFromMetrics({ autonoom_afgerond: 8, gecorrigeerd: 2, heropend: 0, weken: [
      { week_start: "2026-08-03", autonoom_afgerond: 5, gecorrigeerd: 1 },
      { week_start: "2026-08-10", autonoom_afgerond: 3, gecorrigeerd: 1 },
    ] }, TODAY);
    expect(b.pct).toBe(a.pct);
    expect(b.gate).toEqual(a.gate);
    expect(b.weken.map(w => w.pct)).toEqual(a.weken.map(w => w.pct));
  });
});

describe("saneerMetricsPayload — correctievrij", () => {
  it("laat onbekende subsleutels (percentage) weg en coerceert getallen", () => {
    const uit = g.saneerMetricsPayload({
      versie: 1,
      correctievrij: {
        venster_dagen: "28", drempel_pct: 80, autonoom_afgerond: "10", gecorrigeerd: 2, heropend: 1,
        percentage: 80, gate_gehaald: true,
        weken: [{ week_start: "2026-08-17", autonoom_afgerond: 4, gecorrigeerd: 1, pct: 75 }, "rommel"],
        opmerking: XSS,
      },
    }, g.AGENTIC_TEAM_SCHEMA);
    expect(Object.keys(uit.correctievrij).sort()).toEqual(["autonoom_afgerond", "drempel_pct", "gecorrigeerd", "heropend", "opmerking", "venster_dagen", "weken"]);
    expect(uit.correctievrij).toMatchObject({ venster_dagen: 28, drempel_pct: 80, autonoom_afgerond: 10, gecorrigeerd: 2, heropend: 1 });
    expect(uit.correctievrij.weken).toEqual([{ week_start: "2026-08-17", autonoom_afgerond: 4, gecorrigeerd: 1 }]);
    expect(uit.correctievrij.opmerking).toBe(XSS);
  });
});

describe("render — XSS via opmerking", () => {
  it("een opmerking met <img onerror> wordt als tekst getoond, niet uitgevoerd", () => {
    const result = g.parseNotionMetricsFile({
      versie: 1, gegenereerd_op: "2026-08-24",
      correctievrij: { autonoom_afgerond: 5, gecorrigeerd: 1, heropend: 0, weken: [{ week_start: XSS, autonoom_afgerond: 5, gecorrigeerd: 1 }], opmerking: XSS },
    }, g.AGENTIC_TEAM_SCHEMA, TODAY, 25);
    expect(result.ok).toBe(true);
    const cv = result.metrics.correctievrij;
    const c = el();
    g.renderDetailCorrectievrij(c, cv);
    geenInjectie(c);
    expect(c.textContent).toContain(XSS);

    const k = el();
    g.renderKpiTegels(k, { adopt: result.metrics.adopt, tijdwinst: result.metrics.tijdwinst, sporenTotaal: 0, periodWeeks: 12, minutenPerActie: 25, correctievrij: cv, intern: true });
    geenInjectie(k);
    expect(k.querySelector('[data-goto="correctievrij"] .kpi-getal').textContent).toBe("80%");
  });

  it("kpi-tegel zonder correctievrij in ctx (oudere aanroep) rendert n.v.t.", () => {
    const k = el();
    g.renderKpiTegels(k, { adopt: { adoptiescore: null }, tijdwinst: { berekenbaar: false, uren: 0, minuten: 0, afgerond: 0, minutenPerActie: 25 }, sporenTotaal: 0, periodWeeks: 12, minutenPerActie: 25, intern: true });
    expect(k.querySelector('[data-goto="correctievrij"] .kpi-getal').textContent).toBe("n.v.t.");
  });
});

describe("intern-vlag — de correctievrij-tegel is nooit zichtbaar voor klanten", () => {
  const ctxBasis = () => ({ adopt: { adoptiescore: null }, tijdwinst: { berekenbaar: false, uren: 0, minuten: 0, afgerond: 0, minutenPerActie: 25 }, sporenTotaal: 0, periodWeeks: 12, minutenPerActie: 25 });

  it("zonder intern (klant, bestandsroute) ontbreekt de tegel én de detailnav-link", () => {
    const k = el();
    g.renderKpiTegels(k, ctxBasis());
    expect(k.querySelector('[data-goto="correctievrij"]')).toBeNull();
    expect(k.textContent).not.toContain("f19");
    const nav = el();
    g.renderDetailNav(nav, "gebruik", false);
    expect(nav.querySelector('a[href="#detail/correctievrij"]')).toBeNull();
    const navOud = el();
    g.renderDetailNav(navOud, "gebruik"); // oudere aanroep zonder vlag = klant
    expect(navOud.querySelector('a[href="#detail/correctievrij"]')).toBeNull();
  });

  it("met intern (werkruimte met DASHBOARD_INTERN=1) staan tegel en nav-link er wel", () => {
    const k = el();
    g.renderKpiTegels(k, { ...ctxBasis(), intern: true });
    expect(k.querySelector('[data-goto="correctievrij"]')).not.toBeNull();
    const nav = el();
    g.renderDetailNav(nav, "gebruik", true);
    expect(nav.querySelector('a[href="#detail/correctievrij"]')).not.toBeNull();
  });
});
