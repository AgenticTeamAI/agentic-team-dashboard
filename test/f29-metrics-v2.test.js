// @vitest-environment jsdom
/* f29 fase B — metricscontract v2: relatie-aggregaten.
 *
 * Dekt: versie 1 én 2 worden geaccepteerd, versie 3 niet; de relaties-sectie
 * wordt gesaneerd (onbekende domeinen weg, top op drie, vijandige titels
 * plat); de Data-tab toont bij een metricsbundel relatiekaarten, en zonder
 * relaties (v1) blijft alleen de bestaande uitleg staan. */
import { describe, expect, it, beforeAll } from "vitest";
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
];

const XSS = '"><img src=q onerror=window.__xss=1><li class="';

let g;
beforeAll(() => {
  for (const rel of MODULES) {
    vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  }
  g = globalThis;
});

const RELATIE = {
  van: "interacties", veld: "Organisatie", naar: "organisaties",
  gekoppeld: 34, totaal: 40, doelen: 12,
  top: [{ titel: "Acme B.V.", aantal: 9 }],
};

function parse(payload) {
  return g.parseNotionMetricsFile(payload, g.AGENTIC_TEAM_SCHEMA, new Date(), 25);
}

describe("metricscontract v2 — versies en sanering", () => {
  it("accepteert versie 1 én versie 2, weigert versie 3", () => {
    expect(parse({ versie: 1 }).ok).toBe(true);
    const v2 = parse({ versie: 2, relaties: [RELATIE] });
    expect(v2.ok).toBe(true);
    expect(v2.metrics.relaties).toEqual([RELATIE]);
    const v3 = parse({ versie: 3 });
    expect(v3.ok).toBe(false);
    expect(v3.kind).toBe("onbekende-versie");
  });

  it("saneert relaties: onbekend domein weg, top op drie, titels plat", () => {
    const schoon = g.saneerMetricsPayload({
      versie: 2,
      relaties: [
        { van: "interacties", veld: "X", naar: "niet_bestaand", gekoppeld: 1, totaal: 1 },
        {
          van: "organisaties", veld: "Contactpersonen", naar: "contactpersonen",
          gekoppeld: "5", totaal: 5, doelen: 5,
          top: [{ titel: XSS, aantal: 1 }, { titel: "B", aantal: 1 }, { titel: "C", aantal: 1 }, { titel: "D", aantal: 1 }],
        },
      ],
    }, g.AGENTIC_TEAM_SCHEMA);
    expect(schoon.relaties).toHaveLength(1);
    const rel = schoon.relaties[0];
    expect(rel).toMatchObject({ van: "organisaties", naar: "contactpersonen", gekoppeld: 5 });
    expect(rel.top).toHaveLength(3);
    expect(rel.top[0].titel).toBe(XSS); // platte tekst; renderen escapet
    expect(schoon.waarschuwingen.some(w => w.includes("relaties[0]"))).toBe(true);
  });
});

describe("dataRelatieKaarten — de Data-tab op de metricsroute", () => {
  const ctx = {
    schema: null, // beforeAll vult het schema pas; in de its via g
    bundle: { kind: "metrics", source: "werkruimte", sourceLabel: "je werkruimte", domains: {} },
  };

  function ctxMet(relaties) {
    return { ...ctx, schema: g.AGENTIC_TEAM_SCHEMA, relaties };
  }

  it("toont een relatiekaart met tellingen en top-titels", () => {
    const el = document.createElement("div");
    g.renderDataOverzicht(el, ctxMet([RELATIE]));
    expect(el.textContent).toContain("Verbanden");
    expect(el.textContent).toContain("34 van de 40");
    expect(el.textContent).toContain("Acme B.V. (9)");
  });

  it("filtert op domein op de detailpagina, en escapet vijandige titels", () => {
    const kwaad = { ...RELATIE, top: [{ titel: XSS, aantal: 1 }] };
    const el = document.createElement("div");
    g.renderDataDomein(el, "organisaties", ctxMet([kwaad, { ...RELATIE, van: "acties", veld: "Deal", naar: "sales_funnel" }]));
    expect(el.querySelectorAll(".relatie-kaart")).toHaveLength(1);
    expect(el.querySelector("img")).toBeNull();
    expect(window.__xss).toBeUndefined();
  });

  it("zonder relaties (v1) blijft alleen de bestaande uitleg staan", () => {
    const el = document.createElement("div");
    g.renderDataOverzicht(el, ctxMet(null));
    expect(el.textContent).toContain("geen rijen");
    expect(el.querySelector(".relatie-blok")).toBeNull();
  });
});
