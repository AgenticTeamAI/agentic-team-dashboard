// @vitest-environment jsdom
/* f25 — waardezones + mobiel-eerst.
 *
 * Dekt de nieuwe presentatielaag op het niveau waar hij fout kan gaan:
 * de drempelregel die het ritme omhoog haalt (pure functie, beide routes),
 * de Data-tab (alleen-lezen browser over de al opgehaalde bundel, inclusief
 * vijandige inhoud) en de juridisch goedgekeurde privacyteksten. */
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

/* const-declaraties op topniveau landen niet op globalThis (net als in een
 * <script>-blok): ze staan in de gedeelde globale lexicale scope. Uitlezen
 * doen we daarom met een expressie in diezelfde scope. */
const lees = (naam) => vm.runInThisContext(naam);

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

function geenInjectie(node) {
  expect(window.__xss).toBeUndefined();
  expect(node.querySelector("img")).toBeNull();
  expect(node.querySelector("script")).toBeNull();
}

/* ── Drempelregel: het ritme komt alleen omhoog als het zakt ─────────── */
describe("voegRitmeToeAanAandacht — het ritme als aandachtspunt", () => {
  const bestaand = [{ type: "qc", ernst: "rood", label: "iets roods" }];

  it("onder de drempel: één oranje item erbij, achteraan", () => {
    const uit = g.voegRitmeToeAanAandacht(bestaand, { adoptiescore: 42 });
    expect(uit.length).toBe(2);
    expect(uit[0].type).toBe("qc"); // rood blijft voorop
    expect(uit[1]).toMatchObject({ type: "ritme", ernst: "oranje" });
    expect(uit[1].label).toContain("42%");
    expect(uit[1].label).toContain(String(lees("RITME_DREMPEL_PCT")));
  });

  it("op of boven de drempel: niets erbij", () => {
    expect(g.voegRitmeToeAanAandacht(bestaand, { adoptiescore: lees("RITME_DREMPEL_PCT") })).toEqual(bestaand);
    expect(g.voegRitmeToeAanAandacht(bestaand, { adoptiescore: 100 })).toEqual(bestaand);
  });

  it("niet te berekenen (null) is geen aandachtspunt — nooit een ontbrekende bron als slechte score tonen", () => {
    expect(g.voegRitmeToeAanAandacht(bestaand, { adoptiescore: null })).toEqual(bestaand);
    expect(g.voegRitmeToeAanAandacht(bestaand, null)).toEqual(bestaand);
    expect(g.voegRitmeToeAanAandacht(bestaand, {})).toEqual(bestaand);
  });

  it("idempotent: de metrics-route mag hem niet dubbel krijgen", () => {
    const een = g.voegRitmeToeAanAandacht(bestaand, { adoptiescore: 10 });
    expect(g.voegRitmeToeAanAandacht(een, { adoptiescore: 10 })).toEqual(een);
  });
});

/* ── Data-tab ────────────────────────────────────────────────────────── */
describe("Data-tab — alleen-lezen browser over de bundel", () => {
  const schema = () => g.getSchema();

  function ctxMet(domains, kind = "rows") {
    return {
      schema: schema(),
      bundle: { kind, source: "werkruimte", sourceLabel: "je werkruimte", domains },
    };
  }

  it("overzicht: gevulde domeinen zijn klikbaar, lege niet", () => {
    const c = el();
    g.renderDataOverzicht(c, ctxMet({ acties: { rows: [{ Actie: "A" }, { Actie: "B" }], herkomstLabel: "werkruimte — acties" } }));
    const acties = c.querySelector('[data-data-domein="acties"]');
    expect(acties).not.toBeNull();
    expect(acties.textContent).toContain("2 rijen");
    // organisaties zit niet in de bundel -> geen doorklik, wel zichtbaar
    expect(c.querySelector('[data-data-domein="organisaties"]')).toBeNull();
    expect(c.textContent).toContain("Organisaties");
    expect(c.textContent).toMatch(/geen rijen in deze bundel/);
  });

  it("overzicht: domeinen die per opzet niet worden opgehaald staan benoemd, niet stil weggelaten", () => {
    const c = el();
    g.renderDataOverzicht(c, ctxMet({}));
    expect(c.querySelector('[data-data-domein="logboek"]')).toBeNull();
    expect(c.textContent).toMatch(/Niet opgehaald/);
    expect(c.textContent).toMatch(/Logboek/);
  });

  it("domein: tabel met schemavelden, nieuwste datum boven", () => {
    const c = el();
    const rows = [
      { Actie: "Oud", Status: "Klaar", Deadline: "2026-01-01" },
      { Actie: "Nieuw", Status: "Open", Deadline: "2026-08-20" },
    ];
    g.renderDataDomein(c, "acties", ctxMet({ acties: { rows, herkomstLabel: "werkruimte — acties" } }));
    const cellen = [...c.querySelectorAll("tbody tr td:first-child")].map((t) => t.textContent);
    expect(cellen).toEqual(["Nieuw", "Oud"]);
    expect(c.querySelector(".tabel-scroll")).not.toBeNull(); // mobiel: scrollt in eigen kader
    expect(c.querySelector('a[href="#/data"]')).not.toBeNull();
  });

  it("domein: zoeken filtert client-side en telt mee", () => {
    const c = el();
    const rows = [{ Actie: "Offerte sturen" }, { Actie: "Bellen" }];
    g.renderDataDomein(c, "acties", ctxMet({ acties: { rows } }));
    const zoek = c.querySelector("#data-zoek");
    zoek.value = "offerte";
    zoek.dispatchEvent(new window.Event("input"));
    expect([...c.querySelectorAll("tbody tr")].length).toBe(1);
    expect(c.querySelector("[data-data-telling]").textContent).toBe("1 van 2 rijen");
    g.resetDataZoek();
  });

  it("leeg domein: uitleg, geen lege tabel", () => {
    const c = el();
    g.renderDataDomein(c, "acties", ctxMet({}));
    expect(c.querySelector("table")).toBeNull();
    expect(c.textContent).toMatch(/Geen rijen in deze bundel/);
  });

  it("metricsroute: eerlijke uitleg in plaats van een lege tabel", () => {
    const c = el();
    g.renderDataOverzicht(c, ctxMet({}, "metrics"));
    expect(c.textContent).toMatch(/draagt geen rijen/);
    const d = el();
    g.renderDataDomein(d, "acties", ctxMet({}, "metrics"));
    expect(d.querySelector("table")).toBeNull();
    expect(d.textContent).toMatch(/draagt geen rijen/);
  });

  it("onbekend domein crasht niet", () => {
    const c = el();
    g.renderDataDomein(c, "bestaat_niet", ctxMet({}));
    expect(c.textContent).toMatch(/Onbekend domein/);
  });

  it("vijandige celwaarden en lijstvelden komen als tekst binnen, niet als markup", () => {
    const c = el();
    const rows = [{ Actie: XSS, Status: [XSS, "Open"], Deadline: XSS, Toelichting: { raar: 1 } }];
    g.renderDataDomein(c, "acties", ctxMet({ acties: { rows, herkomstLabel: XSS } }));
    geenInjectie(c);
    expect(c.textContent).toContain(XSS);
  });

  it("dataCelTekst: lijsten, booleans en objecten worden leesbaar, nooit 'undefined'", () => {
    expect(g.dataCelTekst(["a", "b"])).toBe("a, b");
    expect(g.dataCelTekst(true)).toBe("ja");
    expect(g.dataCelTekst(false)).toBe("nee");
    expect(g.dataCelTekst(null)).toBe("");
    expect(g.dataCelTekst(undefined)).toBe("");
    expect(g.dataCelTekst({ a: 1 })).toBe("");
    expect(g.dataCelTekst(0)).toBe("0");
  });
});

/* ── Privacybelofte ──────────────────────────────────────────────────── */
describe("privacybelofte — de goedgekeurde formulering, in de UI zelf", () => {
  it("de één-regelversie is de samenvatting, de uitklap de juridische tekst", () => {
    const c = el();
    g.renderPrivacyBlok(c);
    expect(c.textContent).toContain(lees("PRIVACY_REGEL"));
    expect(c.textContent).toContain(lees("PRIVACY_UITKLAP"));
    // de volledige tekst moet hier staan, niet achter een tweede klik of op
    // een andere pagina — een <details> op dezelfde tab voldoet daaraan
    expect(c.querySelector("details > summary")).not.toBeNull();
    expect(c.querySelector("a")).toBeNull();
  });

  it("de tekst claimt niet dat er niets naar agentic-team.ai gaat", () => {
    // De pagina zelf komt wél van dashboard.agentic-team.ai; die nuance moet
    // erin blijven staan (juridische toets 26-08-2026).
    expect(lees("PRIVACY_REGEL")).not.toMatch(/niets naar/i);
    expect(lees("PRIVACY_UITKLAP")).toMatch(/dashboard\.agentic-team\.ai/);
    expect(lees("PRIVACY_UITKLAP")).toMatch(/IP-adres/);
    expect(lees("PRIVACY_UITKLAP")).toMatch(/#-teken/);
    expect(lees("PRIVACY_UITKLAP")).toMatch(/24 uur/);
  });
});
