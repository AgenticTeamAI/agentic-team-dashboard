// @vitest-environment jsdom
/* f23/f29 fase A — verwijzingen in de Data-tab zijn klikbaar.
 *
 * Dekt: relatievelden komen als kolom in beeld (ook buiten de eerste zes),
 * een {id, titel}-cel wordt een sprong naar het doeldomein met de titel als
 * zoekterm, meervoud rendert als losse links, een kale id blijft tekst, en
 * vijandige titels blijven ge-escaped. */
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
  "src/data-bewerken.js",
];

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

function ctxMet(domains, kind = "rows") {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA,
    bundle: { kind, source: "werkruimte", sourceLabel: "je werkruimte", domains },
  };
}

describe("dataCelHtml — de verwijzingscel", () => {
  const veld = { naam: "Organisatie", type: "relatie", naar: "organisaties" };

  it("{id, titel} wordt een link naar het doeldomein met de titel als zoekterm", () => {
    const html = g.dataCelHtml({ id: "abc", titel: "Acme B.V." }, veld);
    expect(html).toContain('href="#/data/organisaties"');
    expect(html).toContain('data-relatie-zoek="Acme B.V."');
    expect(html).toContain(">Acme B.V.</a>");
  });

  it("meervoud rendert als losse links", () => {
    const html = g.dataCelHtml([
      { id: "a", titel: "Acme" },
      { id: "b", titel: "Beta" },
    ], veld);
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain("Acme");
    expect(html).toContain("Beta");
  });

  it("een kale id (zonder titel) blijft tekst — nooit een dode link", () => {
    const html = g.dataCelHtml({ id: "abc" }, veld);
    expect(html).not.toContain("<a ");
  });

  it("een niet-relatieveld blijft gewone tekst", () => {
    expect(g.dataCelHtml("gewoon", { naam: "X", type: "tekst" })).toBe("gewoon");
  });

  it("een vijandige titel blijft ge-escaped", () => {
    const html = g.dataCelHtml({ id: "x", titel: XSS }, veld);
    expect(html).not.toContain("<img");
    const c = el();
    c.innerHTML = html;
    expect(window.__xss).toBeUndefined();
    expect(c.querySelector("img")).toBeNull();
  });
});

describe("renderDataDomein — relatiekolommen en de sprong", () => {
  it("relatievelden buiten de eerste zes komen tóch als kolom in beeld", () => {
    const c = el();
    g.resetDataZoek();
    g.renderDataDomein(c, "interacties", ctxMet({
      interacties: {
        rows: [{ Onderwerp: "Kennismaking", Organisatie: { id: "o1", titel: "Acme B.V." } }],
        herkomstLabel: "werkruimte — interacties",
      },
    }));
    const koppen = [...c.querySelectorAll("th")].map(n => n.textContent);
    expect(koppen).toContain("Organisatie");
    const link = c.querySelector('a.relatie-link[data-relatie-zoek="Acme B.V."]');
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("#/data/organisaties");
  });

  it("klik op de verwijzing zet de zoekterm, zodat het doeldomein de rij toont", () => {
    const c = el();
    g.resetDataZoek();
    g.renderDataDomein(c, "interacties", ctxMet({
      interacties: { rows: [{ Onderwerp: "Kennismaking", Organisatie: { id: "o1", titel: "Acme B.V." } }] },
    }));
    c.querySelector("a.relatie-link").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    const c2 = el();
    g.renderDataDomein(c2, "organisaties", ctxMet({
      organisaties: { rows: [{ Naam: "Acme B.V." }, { Naam: "Beta Corp" }] },
    }));
    const cellen = [...c2.querySelectorAll("tbody td")].map(n => n.textContent);
    expect(cellen.join(" ")).toContain("Acme B.V.");
    expect(cellen.join(" ")).not.toContain("Beta Corp");
    g.resetDataZoek();
  });
});
