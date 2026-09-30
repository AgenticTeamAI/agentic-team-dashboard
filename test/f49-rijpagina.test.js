// @vitest-environment jsdom
/* f49 — één rij als pagina (src/rijpagina.js), te beginnen bij organisaties.
 *
 * Klaar-als uit Notion: velden komen uit de registry, niets hardgecodeerd;
 * contactpersonen, deals en projecten kunnen dezelfde opbouw volgen (de pagina
 * is generiek); bij een naamswijziging loopt de koppeling via het id en
 * verhuist de naam mee. */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
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
  "src/oauth-client.js",
  "src/zones.js",
  "src/voor-jou.js",
  "src/metrics-sanitize.js",
  "src/metrics.js",
  "src/render.js",
  "src/charts.js",
  "src/feed.js",
  "src/homepage.js",
  "src/databrowser.js",
  "src/data-bewerken.js",
  "src/item-blad.js",
  "src/voor-jou-scherm.js",
  "src/acties-tab.js",
  "src/vaste-taken.js",
  "src/hulp.js",
  "src/opdracht.js",
  "src/rijpagina.js",
];

function stubOpslag() {
  const kluis = new Map();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { getItem: (k) => (kluis.has(k) ? kluis.get(k) : null), setItem: (k, v) => kluis.set(k, String(v)), removeItem: (k) => kluis.delete(k) },
  });
}

let g;
let RS;
beforeAll(() => {
  stubOpslag();
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
  RS = g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === "researcher").displayName;
});
beforeEach(() => {
  window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne Verbeek");
  document.body.innerHTML = `<div id="melding" hidden></div>`;
  window.location.hash = "";
  vm.runInThisContext("opdrachtStaat = null");
});
afterEach(() => { vi.restoreAllMocks(); window.location.hash = ""; window.__dashboardCtx = undefined; });

const NU = new Date(2026, 8, 29, 7, 42);
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;
const rij = (id, velden) => ({ __entryId: id, __stempels: { aangemaakt: "2026-09-20T09:00:00", bijgewerkt: "2026-09-20T09:00:00" }, ...velden });

function ctxMet({ schrijven = true } = {}) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU,
    bron: { oauth: schrijven, token: token(schrijven ? "dashboard:lees dashboard:schrijf" : "dashboard:lees"), instantieUrl: "https://connector.example" },
    kanSchrijven: schrijven, herlaad: vi.fn(), werkBij: vi.fn(),
    bundle: { kind: "rows", source: "werkruimte", systeemPerDomein: {}, domains: {
      organisaties: { rows: [rij("o1", { Naam: "Van Dam Bouw", Fase: "Lead", Vestigingsplaats: "Utrecht" })] },
      contactpersonen: { rows: [rij("c1", { Naam: "Piet van Dam", Organisatie: { id: "o1", titel: "Van Dam Bouw" } })] },
      sales_funnel: { rows: [rij("d1", { "Deal Naam": "Leiderschapstraject", Organisatie: { id: "o1", titel: "Van Dam Bouw" } })] },
      acties: { rows: [
        rij("a1", { Actie: "Offerte Van Dam", Status: "Wacht op review", Eigenaar: "Sanne Verbeek", Organisatie: { id: "o1", titel: "Van Dam Bouw" } }),
        rij("a2", { Actie: "Prospects zoeken", Status: "Klaar", Eigenaar: RS, Agent: RS, "Afgerond door": RS }),
      ] },
    } },
  };
}
function open(ctx, id = "o1") {
  const el = document.createElement("div");
  document.body.appendChild(el);
  g.renderRijPagina(el, "organisaties", id, ctx);
  return el;
}
const antwoord = (url, o) => new Response(JSON.stringify({ entry: { entryId: "n1", data: o && o.body ? JSON.parse(o.body).data : {} } }), { status: 200 });

describe("f49 — de route", () => {
  it("#/data/<domein>/<id> is een rijpagina onder Gegevens", () => {
    window.location.hash = "#/data/organisaties/o1";
    expect(g.bepaalActieveView()).toEqual({ soort: "rij", domein: "organisaties", id: "o1", tab: "data" });
    window.location.hash = "#/data/organisaties";
    expect(g.bepaalActieveView()).toEqual({ soort: "data", domein: "organisaties", tab: "data" });
  });
});

describe("f49 — de pagina", () => {
  it("elk veld uit de registry, lege velden als —, en wat erop staat als kenmerk", () => {
    const el = open(ctxMet());
    expect(el.querySelector(".rp-titel").textContent).toContain("Van Dam Bouw");
    const velden = [...el.querySelectorAll("[data-rp-veld]")].map(v => v.getAttribute("data-rp-veld"));
    expect(velden).toEqual(g.AGENTIC_TEAM_SCHEMA.datadomeinen.organisaties.velden.map(v => v.naam));
    expect(el.querySelector('[data-rp-veld="KvK-nummer"]').textContent).toContain("—");
    expect(el.querySelector(".rp-chips").textContent).toContain("Lead");
  });

  it("wat eraan hangt: acties bovenaan als blad, de rest als eigen pagina", () => {
    const el = open(ctxMet());
    const koppen = [...el.querySelectorAll(".rp-rechts h3")].map(h => h.textContent);
    expect(koppen[0]).toContain("Acties en werk van je team");
    expect(el.querySelector('a[href="#/acties/a1"]')).not.toBeNull();
    expect(el.querySelector('a[href="#/data/contactpersonen/c1"]')).not.toBeNull();
    expect(el.querySelector('a[href="#/data/sales_funnel/d1"]')).not.toBeNull();
  });

  it("een rij die er niet (meer) is", () => {
    expect(open(ctxMet(), "weg").textContent).toContain("Niet gevonden");
  });

  it("op de daglink: lezen, geen knoppen", () => {
    const el = open(ctxMet({ schrijven: false }));
    expect(el.querySelector("[data-rp-wijzig], [data-rp-verwijder], [data-rp-toevoeg]")).toBeNull();
  });
});

describe("f49 — wijzigen, toevoegen, verwijderen", () => {
  it("één veld wijzigen is één PATCH met alleen dat veld, met ongedaan maken", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(antwoord);
    const ctx = ctxMet();
    const el = open(ctx);
    el.querySelector('[data-rp-wijzig="Vestigingsplaats"]').click();
    const invoer = el.querySelector('[data-rp-veld="Vestigingsplaats"] [data-veldtype]');
    invoer.value = "Amersfoort";
    el.querySelector("[data-rp-veldform]").dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(ctx.werkBij).toHaveBeenCalled());
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/dashboard/entries/organisaties/o1");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).data).toEqual({ Vestigingsplaats: "Amersfoort" });
    expect(document.getElementById("melding").querySelector("[data-melding-actie]")).not.toBeNull();
  });

  it("niets veranderd: niets versturen", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const el = open(ctxMet());
    el.querySelector('[data-rp-wijzig="Fase"]').click();
    el.querySelector("[data-rp-veldform]").dispatchEvent(new Event("submit", { cancelable: true }));
    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.getElementById("melding").textContent).toContain("Niets gewijzigd");
  });

  it("snel toevoegen: een contactpersoon, meteen gekoppeld", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(antwoord);
    const ctx = ctxMet();
    const el = open(ctx);
    const soort = el.querySelector("[data-rp-toevoeg-domein]");
    expect([...soort.options].map(o => o.value)).toEqual(expect.arrayContaining(["contactpersonen", "sales_funnel"]));
    soort.value = "contactpersonen";
    el.querySelector("[data-rp-toevoeg-naam]").value = "Anna de Vries";
    el.querySelector("[data-rp-toevoeg]").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ domein: "contactpersonen", data: { Naam: "Anna de Vries", Organisatie: "o1" } });
  });

  it("verwijderen vraagt eerst, zegt wat blijft staan, en gaat terug naar de lijst", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200 }));
    const ctx = ctxMet();
    const el = open(ctx);
    el.querySelector("[data-rp-verwijder]").click();
    expect(el.textContent).toContain("Wat eraan hangt (3), blijft bestaan");
    expect(fetchSpy).not.toHaveBeenCalled();
    el.querySelector("[data-verwijder-ja]").click();
    await vi.waitFor(() => expect(window.location.hash).toBe("#/data/organisaties"));
    expect(fetchSpy.mock.calls[0][1].method).toBe("DELETE");
    expect(ctx.werkBij).toHaveBeenCalledWith("organisaties", { weg: "o1" });
  });

  it("'Laat je team de gegevens aanvullen' zet een opdracht voor de Researcher klaar, met de lege velden en bron", () => {
    const el = open(ctxMet());
    el.querySelector("[data-rp-aanvullen]").click();
    expect(window.location.hash).toBe("#/opdracht/researcher");
    const staat = vm.runInThisContext("opdrachtStaat");
    expect(staat.wie).toEqual({ agent: RS });
    expect(staat.hoortBij).toBe("o1");
    expect(staat.wat).toContain("Vul de gegevens van Van Dam Bouw aan:");
    expect(staat.wat).toContain("KvK-nummer");
    expect(staat.uitleg).toContain("bron");
  });
});

describe("f49 — een naamswijziging verhuist mee", () => {
  it("een verwijzing toont de naam van nu, en linkt via het id", () => {
    const ctx = ctxMet();
    ctx.bundle.domains.organisaties.rows[0].Naam = "Van Dam Bouw & Infra";
    window.__dashboardCtx = ctx;
    const veld = g.AGENTIC_TEAM_SCHEMA.datadomeinen.contactpersonen.velden.find(v => v.naam === "Organisatie");
    const html = g.dataCelHtml({ id: "o1", titel: "Van Dam Bouw" }, veld);
    expect(html).toContain('href="#/data/organisaties/o1"');
    expect(html).toContain(">Van Dam Bouw &amp; Infra</a>");
  });
});
