// @vitest-environment jsdom
/* f33 — de RUD van CRUD: een rij openklappen, zien wat eraan hangt, en werk
 * als bord bekijken.
 *
 * De kern van dit item is dat lezen niet plat is: de tabel toont zes kolommen
 * terwijl een rij er twintig heeft, en verwijzingen wijzen maar één kant op.
 * Deze tests bewaken die twee dingen — plus de bordkolommen, die uit het
 * registryschema moeten komen en niet uit een lijstje in de code. */
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
    schema: g.getSchema(),
    bundle: { kind, source: "werkruimte", sourceLabel: "je werkruimte", domains },
  };
}

const ORG = { Naam: "Acme Holding", __entryId: "org-1" };
const ACTIE = {
  Actie: "Offerte nabellen",
  Status: "Wacht op review",
  Eigenaar: "Tijmen",
  Organisatie: { id: "org-1", titel: "Acme Holding" },
  __entryId: "act-1",
};

describe("f33 — rij openklappen", () => {
  it("de titelcel opent de rij; de kaart toont álle gevulde velden, niet zes kolommen", () => {
    const c = el();
    g.wisDataDetail();
    g.renderDataDomein(c, "acties", ctxMet({ acties: { rows: [ACTIE] }, organisaties: { rows: [ORG] } }));
    const knop = c.querySelector('.rij-open-knop[data-open-rij="acties|act-1"]');
    expect(knop).not.toBeNull();
    knop.click();
    const kaart = c.querySelector("[data-detail-kaart]");
    expect(kaart).not.toBeNull();
    expect(kaart.textContent).toContain("Offerte nabellen");
    // 'Eigenaar' valt in de tabel binnen de eerste kolommen, 'Status' ook —
    // maar de kaart hoort ook velden te tonen die de tabel wegkapt.
    expect(kaart.textContent).toContain("Wacht op review");
    expect(kaart.textContent).toContain("Tijmen");
    // Wat niet is ingevuld wordt benoemd, niet stil weggelaten.
    expect(kaart.textContent).toMatch(/Niet ingevuld/);
  });

  it("toont terugverwijzingen: bij een organisatie zie je de acties die eraan hangen", () => {
    const c = el();
    g.wisDataDetail();
    g.zetDataDetail("organisaties", "org-1");
    g.renderDataDomein(c, "organisaties", ctxMet({ acties: { rows: [ACTIE] }, organisaties: { rows: [ORG] } }));
    const kaart = c.querySelector("[data-detail-kaart]");
    expect(kaart.textContent).toContain("Wat hieraan hangt");
    expect(kaart.textContent).toContain("Offerte nabellen");
    expect(kaart.querySelector('[data-open-rij="acties|act-1"]')).not.toBeNull();
  });

  it("zonder inkomende verwijzingen zegt de kaart dat expliciet", () => {
    const c = el();
    g.zetDataDetail("organisaties", "org-1");
    g.renderDataDomein(c, "organisaties", ctxMet({ organisaties: { rows: [ORG] } }));
    expect(c.querySelector("[data-detail-kaart]").textContent).toMatch(/Niets in je werkruimte verwijst/);
  });

  it("terugverwijzingen vinden ook een polymorfe verwijzing, en alleen die van het juiste domein", () => {
    const ctx = ctxMet({
      organisaties: { rows: [ORG] },
      acties: { rows: [{ Actie: "Andere rij, zelfde id", __entryId: "org-1" }] },
      notities: { rows: [
        { Onderwerp: "Gebeld", Betreft: { id: "org-1", titel: "Acme Holding", domein: "organisaties" }, __entryId: "not-1" },
        { Onderwerp: "Niet deze", Betreft: { id: "org-1", titel: "x", domein: "acties" }, __entryId: "not-2" },
      ] },
    });
    if (!ctx.schema.datadomeinen.notities) return; // registry nog niet gesynct
    const terug = g.terugverwijzingen(ctx, "organisaties", "org-1");
    const notitie = terug.find(t => t.slug === "notities");
    expect(notitie.treffers.map(r => r.__entryId)).toEqual(["not-1"]);
  });

  it("een tweede klik op dezelfde rij klapt hem weer dicht", () => {
    const c = el();
    g.wisDataDetail();
    g.renderDataDomein(c, "acties", ctxMet({ acties: { rows: [ACTIE] } }));
    c.querySelector('.rij-open-knop').click();
    expect(c.querySelector("[data-detail-kaart]")).not.toBeNull();
    c.querySelector('.rij-open-knop').click();
    expect(c.querySelector("[data-detail-kaart]")).toBeNull();
  });
});

describe("f33 — het bord", () => {
  const rijen = [
    ACTIE,
    { Actie: "Bellen", Status: "Open", __entryId: "act-2" },
    { Actie: "Zonder status", __entryId: "act-3" },
  ];

  it("kolommen komen uit het registryschema, niet uit de code", () => {
    const c = el();
    g.resetDataZoek();
    g.renderDataDomein(c, "acties", ctxMet({ acties: { rows: rijen } }));
    c.querySelector('[data-weergave="bord"]').click();
    const opties = g.getSchema().datadomeinen.acties.velden.find(v => v.naam === "Status").opties;
    const kolommen = [...c.querySelectorAll("[data-bord-kolom]")].map(k => k.getAttribute("data-bord-kolom"));
    expect(kolommen).toEqual(opties);
  });

  it("een rij zonder status verdwijnt niet, maar krijgt een eigen kolom", () => {
    const c = el();
    g.resetDataZoek();
    g.renderDataDomein(c, "acties", ctxMet({ acties: { rows: rijen } }));
    c.querySelector('[data-weergave="bord"]').click();
    const rest = c.querySelector(".bord-kolom-rest");
    expect(rest).not.toBeNull();
    expect(rest.textContent).toContain("Zonder status");
  });

  it("een kaart opent dezelfde detailkaart als de tabel", () => {
    const c = el();
    g.resetDataZoek();
    g.renderDataDomein(c, "acties", ctxMet({ acties: { rows: rijen } }));
    c.querySelector('[data-weergave="bord"]').click();
    c.querySelector('.bord-kaart[data-open-rij="acties|act-1"]').click();
    expect(c.querySelector("[data-detail-kaart]").textContent).toContain("Offerte nabellen");
  });

  it("de bordknop verschijnt alleen bij een domein met een Status-select", () => {
    const c = el();
    g.resetDataZoek();
    g.renderDataDomein(c, "organisaties", ctxMet({ organisaties: { rows: [ORG] } }));
    expect(c.querySelector('[data-weergave="bord"]')).toBeNull();
    expect(g.statusVeldVan(g.getSchema().datadomeinen.organisaties)).toBeNull();
  });

  it("telt subacties per kaart als het domein een self-relatie heeft", () => {
    const ctx = ctxMet({ acties: { rows: [
      ACTIE,
      { Actie: "Deeltaak", "Bovenliggende actie": { id: "act-1", titel: "Offerte nabellen" }, __entryId: "act-9" },
    ] } });
    if (!ctx.schema.datadomeinen.acties.velden.some(v => v.naam === "Bovenliggende actie")) return; // pre-1.65.0
    expect(g.subacties(ctx, "acties", "act-1").map(r => r.__entryId)).toEqual(["act-9"]);
  });
});
