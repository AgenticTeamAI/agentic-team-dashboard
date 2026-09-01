// @vitest-environment jsdom
/* f23 fase D — bewerken in de Data-tab.
 *
 * Dekt: knoppen bestaan alleen in een schrijfsessie (token met
 * dashboard:schrijf), een extern domein blijft lezen-met-uitleg, het
 * formulier is registry-gedreven en levert het juiste data-object, submit
 * doet een POST naar de instantie, verwijderen vraagt bevestiging, en op de
 * daglink verandert er helemaal niets. */
import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
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

afterEach(() => vi.restoreAllMocks());

/* Een JWT-vormig token met de gegeven scope — alleen de payload telt. */
function nepToken(scope) {
  const payload = btoa(JSON.stringify({ scope })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `kop.${payload}.handtekening`;
}

function ctxMet({ scope = "dashboard:lees dashboard:schrijf", systeemPerDomein = {}, rows } = {}) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA,
    bron: { oauth: true, token: nepToken(scope), instantieUrl: "https://connector.example" },
    kanSchrijven: scope.indexOf("dashboard:schrijf") !== -1,
    herlaad: vi.fn().mockResolvedValue(undefined),
    bundle: {
      kind: "rows", source: "werkruimte", sourceLabel: "je werkruimte",
      systeemPerDomein,
      domains: {
        interacties: {
          rows: rows || [{ Onderwerp: "Kennismaking", __entryId: "e1" }],
          herkomstLabel: "werkruimte — interacties",
        },
        organisaties: { rows: [{ Naam: "Acme B.V.", __entryId: "o1" }] },
      },
    },
  };
}

function el() {
  const d = document.createElement("div");
  document.body.appendChild(d);
  return d;
}

describe("wie mag bewerken", () => {
  it("schrijfsessie: nieuwe-rij-knop en actieknoppen per rij", () => {
    const c = el();
    g.renderDataDomein(c, "interacties", ctxMet());
    expect(c.querySelector("[data-bewerk-nieuw]")).not.toBeNull();
    expect(c.querySelector('[data-bewerk-rij="e1"]')).not.toBeNull();
    expect(c.querySelector('[data-verwijder-rij="e1"]')).not.toBeNull();
  });

  it("daglink (geen oauth-bron): geen enkele knop", () => {
    const ctx = ctxMet();
    ctx.bron = { token: "dag.link" };
    ctx.kanSchrijven = g.bronKanSchrijven(ctx.bron);
    const c = el();
    g.renderDataDomein(c, "interacties", ctx);
    expect(c.querySelector("[data-bewerk-nieuw]")).toBeNull();
    expect(c.querySelector("[data-bewerk-rij]")).toBeNull();
  });

  it("token zonder dashboard:schrijf: geen knoppen", () => {
    const c = el();
    g.renderDataDomein(c, "interacties", ctxMet({ scope: "dashboard:lees" }));
    expect(c.querySelector("[data-bewerk-nieuw]")).toBeNull();
  });

  it("extern domein: lezen met uitleg in plaats van knoppen", () => {
    const c = el();
    g.renderDataDomein(c, "interacties", ctxMet({ systeemPerDomein: { interacties: "notion" } }));
    expect(c.querySelector("[data-bewerk-nieuw]")).toBeNull();
    expect(c.textContent).toContain("woont volgens je bronkoppeling in notion");
  });
});

describe("het formulier", () => {
  it("rendert registry-gedreven veldtypen en leest ze terug in de juiste vorm", () => {
    const domein = {
      velden: [
        { naam: "Onderwerp", type: "titel" },
        { naam: "Type", type: "select", opties: ["Gesprek", "Mail"] },
        { naam: "Datum", type: "datum" },
        { naam: "Afgerond", type: "checkbox" },
        { naam: "Bedrag", type: "getal" },
        { naam: "Organisatie", type: "relatie", naar: "organisaties" },
      ],
    };
    const c = el();
    c.innerHTML = g.dataFormulierHtml(domein, ctxMet(), null, null);
    const form = c.querySelector("form");
    expect(form.querySelector('select[name="Type"] option[value="Mail"]')).not.toBeNull();
    expect(form.querySelector('input[type="date"][name="Datum"]')).not.toBeNull();
    // relatieveld kiest uit de geladen organisaties, op entryId
    expect(form.querySelector('select[name="Organisatie"] option[value="o1"]').textContent).toBe("Acme B.V.");

    form.querySelector('[name="Onderwerp"]').value = "Belafspraak";
    form.querySelector('[name="Type"]').value = "Gesprek";
    form.querySelector('[name="Afgerond"]').checked = true;
    form.querySelector('[name="Bedrag"]').value = "12.5";
    form.querySelector('[name="Organisatie"]').value = "o1";
    expect(g.leesFormulier(form)).toEqual({
      Onderwerp: "Belafspraak", Type: "Gesprek", Afgerond: true, Bedrag: 12.5, Organisatie: "o1",
    });
  });

  it("submit doet een POST naar de instantie en herlaadt daarna", async () => {
    const ctx = ctxMet();
    const fetchMock = vi.spyOn(g, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ entry: { entryId: "nieuw" } }), { status: 201 }));
    const c = el();
    g.renderDataDomein(c, "interacties", ctx);
    c.querySelector("[data-bewerk-nieuw]").click();
    const form = c.querySelector("[data-bewerk-formulier]");
    form.querySelector('[name="Onderwerp"]').value = "Testrij";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(ctx.herlaad).toHaveBeenCalled());

    const [url, opties] = fetchMock.mock.calls[0];
    expect(url).toBe("https://connector.example/dashboard/entries");
    expect(opties.method).toBe("POST");
    expect(JSON.parse(opties.body)).toMatchObject({ domein: "interacties", data: { Onderwerp: "Testrij" } });
  });

  it("een leesbare weigering van de instantie komt in het formulier terecht", async () => {
    const ctx = ctxMet();
    vi.spyOn(g, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ fout: "interacties.Type: 'X' is geen geldige keuze" }), { status: 422 }));
    const c = el();
    g.renderDataDomein(c, "interacties", ctx);
    c.querySelector("[data-bewerk-nieuw]").click();
    const form = c.querySelector("[data-bewerk-formulier]");
    form.querySelector('[name="Onderwerp"]').value = "x";
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(form.querySelector("[data-bewerk-fout]").textContent).toContain("geen geldige keuze"));
    expect(ctx.herlaad).not.toHaveBeenCalled();
  });
});

describe("verwijderen", () => {
  it("vraagt bevestiging; annuleren doet niets, bevestigen stuurt DELETE", async () => {
    const ctx = ctxMet();
    const fetchMock = vi.spyOn(g, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const confirmMock = vi.spyOn(window, "confirm").mockReturnValue(false);
    const c = el();
    g.renderDataDomein(c, "interacties", ctx);

    c.querySelector('[data-verwijder-rij="e1"]').click();
    expect(fetchMock).not.toHaveBeenCalled();

    confirmMock.mockReturnValue(true);
    c.querySelector('[data-verwijder-rij="e1"]').click();
    await vi.waitFor(() => expect(ctx.herlaad).toHaveBeenCalled());
    const [url, opties] = fetchMock.mock.calls[0];
    expect(url).toBe("https://connector.example/dashboard/entries/interacties/e1");
    expect(opties.method).toBe("DELETE");
  });
});

describe("aandacht-doorklik (f23-klikproef)", () => {
  it("wijst elk itemtype naar zijn domein; context blijft tekst, https-link wint", () => {
    expect(g.aandachtDoelHref({ type: "acties-deadline" })).toBe("#/data/acties");
    expect(g.aandachtDoelHref({ type: "deals-stil" })).toBe("#/data/sales_funnel");
    expect(g.aandachtDoelHref({ type: "klantsucces" })).toBe("#/data/klantsucces");
    expect(g.aandachtDoelHref({ type: "verouderd" })).toBe("#/data");
    expect(g.aandachtDoelHref({ type: "context" })).toBeNull();
    expect(g.aandachtDoelHref({ type: "overig", link: "https://notion.so/x" })).toBe("https://notion.so/x");
  });

  it("rendert het alert als link in zone 1", () => {
    const c = document.createElement("div");
    g.renderZone1(c, [{ type: "acties-deadline", ernst: "rood", label: "9 actie(s) over de deadline", rows: [] }]);
    const a = c.querySelector("a.aandacht-link");
    expect(a).not.toBeNull();
    expect(a.getAttribute("href")).toBe("#/data/acties");
  });
});

describe("alert-voorselectie (klikproef-ronde 2)", () => {
  it("een alert draagt zijn rijen als filter mee en de Data-tab toont alleen die set", () => {
    const c = document.createElement("div");
    document.body.appendChild(c);
    g.renderZone1(c, [{
      type: "acties-deadline", ernst: "rood", label: "2 actie(s) over de deadline",
      rows: [{ Actie: "Voorstel Hendriks", __entryId: "a1" }, { Actie: "Budget Terwolde", __entryId: "a2" }],
    }]);
    const link = c.querySelector("a.aandacht-link");
    expect(link.getAttribute("data-filter-ids")).toBe("a1,a2");

    g.zetDataVoorselectie("interacties", "2 actie(s) over de deadline", ["e1"]);
    const ctx = {
      schema: g.AGENTIC_TEAM_SCHEMA, kanSchrijven: false,
      bundle: { kind: "rows", source: "werkruimte", domains: { interacties: {
        rows: [{ Onderwerp: "Kennismaking", __entryId: "e1" }, { Onderwerp: "Andere rij", __entryId: "e2" }],
      } } },
    };
    const d = document.createElement("div");
    document.body.appendChild(d);
    g.renderDataDomein(d, "interacties", ctx);
    expect(d.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(d.textContent).toContain("Kennismaking");
    expect(d.textContent).not.toContain("Andere rij");
    expect(d.querySelector(".filter-chip")).not.toBeNull();

    // ✕ wist de voorselectie en toont weer alles
    d.querySelector("[data-filter-wis]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.querySelectorAll("tbody tr")).toHaveLength(2);
    g.wisDataVoorselectie();
  });

  it("namen in een alert zijn links naar hun rij (zoekterm = naam)", () => {
    const c = document.createElement("div");
    g.renderZone1(c, [{
      type: "klantsucces", ernst: "oranje", label: "1 klant(en) op oranje",
      rows: [{ Klantnaam: "Hazenberg Groothandel", __entryId: "k1" }],
    }]);
    const naam = c.querySelector('a.relatie-link[data-relatie-zoek="Hazenberg Groothandel"]');
    expect(naam).not.toBeNull();
    expect(naam.getAttribute("href")).toBe("#/data/klantsucces");
  });
});
