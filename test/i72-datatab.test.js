// @vitest-environment jsdom
/* i72 — de Data-tab op orde: groepen in plaats van 27 gelijke regels, en
 * zichtbaar maken wat níét in je werkruimte woont.
 *
 * Twee dingen zijn hier geen smaak maar eis:
 *  - er mag nooit een domein stil van de pagina vallen (de belofte van dit
 *    dashboard is dat het nooit ongemerkt iets weglaat), en
 *  - "we weten het niet" mag nooit lezen als "het staat in je werkruimte".
 */
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

/* const-declaraties op topniveau landen niet op globalThis (net als in een
 * <script>-blok): ze staan in de gedeelde globale lexicale scope. Uitlezen
 * doen we daarom met een expressie in diezelfde scope — zelfde truc als
 * test/f25-indeling.test.js. */
const lees = (naam) => vm.runInThisContext(naam);

let g;
beforeAll(() => {
  for (const rel of MODULES) {
    vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  }
  g = globalThis;
});

const el = () => {
  const d = document.createElement("div");
  document.body.appendChild(d);
  return d;
};
const schema = () => g.getSchema();

function ctxMet({ domains = {}, systeemPerDomein = null, kanSchrijven = false, schemaOverride = null } = {}) {
  const bundle = { kind: "rows", source: "werkruimte", sourceLabel: "je werkruimte", domains };
  if (systeemPerDomein) bundle.systeemPerDomein = systeemPerDomein;
  return { schema: schemaOverride || schema(), bundle, kanSchrijven };
}

const overzicht = (opties) => {
  const c = el();
  g.renderDataOverzicht(c, ctxMet(opties));
  return c;
};

// ══ 1 · Er valt nooit stil een domein van de pagina ══════════════════

describe("volledigheid", () => {
  it("toont élk browsbaar domein precies één keer, ook op een lege bundel", () => {
    const c = overzicht({});
    const namen = g.dataBrowsbareDomeinen(schema()).map((d) => d.naam || d.key);
    for (const naam of namen) {
      const treffers = c.textContent.split(naam).length - 1;
      expect(treffers, `"${naam}" komt ${treffers}x voor, verwacht precies 1x`).toBe(1);
    }
  });

  it("noemt in de telregel het echte totaal, niet een geschat getal", () => {
    const totaal = g.dataBrowsbareDomeinen(schema()).length;
    expect(overzicht({}).textContent).toContain(`0 van de ${totaal}`);
    const c = overzicht({ domains: { acties: { rows: [{ Actie: "A" }] } } });
    expect(c.textContent).toContain(`1 van de ${totaal}`);
  });

  /* Het vangnet: een domein dat na een schema-sync nieuw is en nog niet is
     ingedeeld, valt in "Overig" en blijft dus zichtbaar. Zonder dit zou een
     registry-update stil een domein laten verdwijnen. */
  it("vangt een niet-ingedeeld domein op in Overig", () => {
    expect(g.groepVan("verzonnen_domein")).toBe(lees("DATA_GROEP_OVERIG"));
    const eigen = JSON.parse(JSON.stringify(schema()));
    eigen.datadomeinen.verzonnen_domein = { naam: "Verzonnen Domein", emoji: "🆕", velden: [] };
    const c = el();
    g.renderDataOverzicht(c, ctxMet({
      domains: { verzonnen_domein: { rows: [{ A: 1 }] } },
      schemaOverride: eigen,
    }));
    expect(c.textContent).toContain("Verzonnen Domein");
    expect(c.textContent).toContain("Overig");
  });

  it("deelt elk browsbaar domein in precies één groep in", () => {
    const alle = g.dataBrowsbareDomeinen(schema()).map((d) => d.key);
    const ingedeeld = lees("DATA_GROEPEN").flatMap((groep) => groep.domeinen);
    expect([...new Set(ingedeeld)].length).toBe(ingedeeld.length);   // geen dubbelen
    expect(alle.filter((k) => ingedeeld.indexOf(k) === -1)).toEqual([]); // niets vergeten
    expect(ingedeeld.filter((k) => alle.indexOf(k) === -1)).toEqual([]); // geen wezen
  });
});

// ══ 2 · Ordening ═════════════════════════════════════════════════════

describe("ordening", () => {
  it("zet wat je gebruikt onder een groepskop en de rest in een uitklap", () => {
    const c = overzicht({ domains: { acties: { rows: [{ Actie: "A" }] } } });
    const koppen = [...c.querySelectorAll(".data-groepkop")].map((h) => h.textContent);
    expect(koppen.join(" ")).toContain("Werk & ritme");
    // en niet één kop per groep — alleen groepen met inhoud
    expect(koppen.length).toBe(1);

    const uitklap = c.querySelector("details.data-leeg");
    expect(uitklap).not.toBeNull();
    expect(uitklap.hasAttribute("open")).toBe(false);
    expect(uitklap.querySelector("summary").textContent).toMatch(/Nog niet in gebruik/);
  });

  /* De scherpste eis: voorspelbaar tussen bezoeken. De volgorde bínnen een
     groep ligt vast en mag níét meebewegen met het aantal rijen. */
  it("houdt de volgorde binnen een groep vast, ongeacht de aantallen", () => {
    const veelDagverslagen = { rows: Array.from({ length: 50 }, (_, i) => ({ Dag: `d${i}` })) };
    const c = overzicht({ domains: { acties: { rows: [{ Actie: "A" }] }, dagverslagen: veelDagverslagen } });
    const volgorde = [...c.querySelectorAll("[data-data-domein]")].map((r) => r.getAttribute("data-data-domein"));
    // Acties staat in DATA_GROEPEN vóór dagverslagen en blijft daar staan
    expect(volgorde.indexOf("acties")).toBeLessThan(volgorde.indexOf("dagverslagen"));
  });

  it("gebruikt geen interne termen in de domeinlijst", () => {
    expect(overzicht({}).textContent).not.toMatch(/bundel|bronkoppeling|metricsbestand/i);
  });
});

// ══ 3 · Waar woont dit? ══════════════════════════════════════════════

describe("bronVan", () => {
  const met = (kaart) => ctxMet({ systeemPerDomein: kaart });

  it("noemt vier toestanden, en onbekend is er één van", () => {
    expect(g.bronVan(met({ acties: "werkruimte" }), "acties").toestand).toBe("hier");
    expect(g.bronVan(met({ acties: "notion" }), "acties").toestand).toBe("elders");
    expect(g.bronVan(met({ acties: "geen" }), "acties").toestand).toBe("nergens");
    expect(g.bronVan(met({ offertes: "notion" }), "acties").toestand).toBe("onbekend");
  });

  it("normaliseert zoals de instantie dat doet", () => {
    expect(g.bronVan(met({ acties: "  Werkruimte " }), "acties").toestand).toBe("hier");
    expect(g.bronVan(met({ acties: " NOTION " }), "acties").toestand).toBe("elders");
    expect(g.bronVan(met({ acties: " NOTION " }), "acties").naam).toBe("Notion");
  });

  it("laat domeinen die per definitie hier wonen altijd 'hier' zijn", () => {
    for (const slug of lees("ALTIJD_WERKRUIMTE")) {
      expect(g.bronVan(met({ [slug]: "notion" }), slug).toestand).toBe("hier");
    }
  });

  /* Twee soorten "onbekend": er is helemaal geen koppeling (dan weten we van
     niets iets en zeggen we ook niets), of er is er één maar dit domein staat
     er niet in (dan is dat een gat dat de gebruiker mag zien). */
  it("onderscheidt 'geen koppeling' van 'staat er niet in'", () => {
    expect(g.bronVan(ctxMet({}), "acties").geenKoppeling).toBe(true);
    expect(g.bronVan(met({ offertes: "notion" }), "acties").geenKoppeling).toBe(false);
  });

  it("citeert een onbekend systeem in plaats van er een naam bij te verzinnen", () => {
    const uit = g.bronVan(met({ acties: "airtable" }), "acties");
    expect(uit.toestand).toBe("elders");
    expect(uit.naam).toBe("airtable");
  });
});

describe("extern in de domeinlijst", () => {
  it("geeft een leeg extern domein een eigen blok, een merkteken en een doorklik", () => {
    const c = overzicht({ systeemPerDomein: { sales_funnel: "notion" } });
    expect(c.textContent).toMatch(/Woont niet in je werkruimte/);
    const rij = c.querySelector('[data-data-domein="sales_funnel"]');
    expect(rij, "een extern domein moet klikbaar zijn — daar zit het antwoord op 'waar dan wel?'").not.toBeNull();
    expect(rij.textContent).toContain("woont in Notion");
  });

  /* Een kale telling is bij een extern domein een onwaarheid in cijfervorm:
     "1 rij" leest als "mijn team heeft één deal". */
  it("kwalificeert losse rijen die tóch in de werkruimte staan", () => {
    const c = overzicht({
      domains: { sales_funnel: { rows: [{ Deal: "X" }] } },
      systeemPerDomein: { sales_funnel: "notion" },
    });
    const rij = c.querySelector('[data-data-domein="sales_funnel"]');
    expect(rij.textContent).toContain("woont in Notion");
    expect(rij.textContent).toContain("1 losse rij hier");
  });

  it("markeert de norm niet — alleen de afwijking", () => {
    const c = overzicht({
      domains: { acties: { rows: [{ Actie: "A" }] } },
      systeemPerDomein: { acties: "werkruimte" },
    });
    expect(c.querySelector('[data-data-domein="acties"]').textContent).not.toMatch(/woont in/);
  });

  it("maakt een leeg domein klikbaar zodra je mag schrijven", () => {
    expect(overzicht({}).querySelector('[data-data-domein="offertes"]')).toBeNull();
    expect(overzicht({ kanSchrijven: true }).querySelector('[data-data-domein="offertes"]')).not.toBeNull();
  });
});

// ══ 4 · De herkomststrook op de domeinpagina ═════════════════════════

describe("herkomststrook", () => {
  const domein = () => schema().datadomeinen.interacties;

  it("zegt waar het woont, wat dat hier betekent, en belooft geen sync", () => {
    const html = g.herkomstStrookHtml(ctxMet({ systeemPerDomein: { interacties: "notion" } }), "interacties", domein(), 0);
    expect(html).toContain("Notion");
    expect(html).toMatch(/niet wijzigen|meekijken/);
    expect(html).toMatch(/leest niet mee/);
    expect(html).toMatch(/hoort ook zo/);
  });

  it("legt losse rijen uit in plaats van ze als het volledige beeld te tonen", () => {
    const html = g.herkomstStrookHtml(ctxMet({ systeemPerDomein: { interacties: "notion" } }), "interacties", domein(), 3);
    expect(html).toMatch(/geen kopie van Notion/);
    expect(html).toMatch(/volledige beeld staat daar/);
  });

  it("zwijgt als er helemaal geen koppeling is", () => {
    expect(g.herkomstStrookHtml(ctxMet({}), "interacties", domein(), 2)).toBe("");
  });

  /* Wél een koppeling, maar dit domein staat er niet in: dat is een gat dat
     de gebruiker mag zien — en het mag nooit als "staat in je werkruimte" lezen. */
  it("benoemt het gat als er wel een koppeling is maar dit domein ontbreekt", () => {
    const html = g.herkomstStrookHtml(ctxMet({ systeemPerDomein: { acties: "notion" } }), "interacties", domein(), 2);
    expect(html).toMatch(/niet vastgelegd/);
    expect(html).toMatch(/weten we niet/);
  });

  it("zwijgt als het domein gewoon hier woont", () => {
    expect(g.herkomstStrookHtml(ctxMet({ systeemPerDomein: { interacties: "werkruimte" } }), "interacties", domein(), 2)).toBe("");
  });
});
