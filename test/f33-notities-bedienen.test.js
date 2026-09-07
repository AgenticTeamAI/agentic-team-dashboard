// @vitest-environment jsdom
/* f33 fase E+F — notities onder een entiteit, en bedienen zonder formulier.
 *
 * Twee dingen die stil fout kunnen gaan en het daarom verdienen vastgezet te
 * worden: (1) een statuswissel moet dezelfde velden achterlaten als een agent
 * die doet, anders meet i25 (correctievrij werk) scheef; (2) een notitie hoort
 * via PATCH/POST te gaan en niet via PUT, want PUT vervangt de hele rij.
 *
 * Het domein 'notities' komt uit registry 1.65.0. Zolang de schema-pin daar
 * nog vóór ligt, zetten deze tests het domein zelf op de ctx — hetzelfde
 * patroon als de werkruimte-tests: de code hoort eerder klaar te zijn dan de
 * sync. */
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

/* jsdom levert in deze opzet geen werkende localStorage; de code vangt fouten
 * netjes af, maar dan test je het onthouden niet. Een minimale stub houdt de
 * test dicht bij de echte browser. */
function stubOpslag() {
  const kluis = new Map();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k) => (kluis.has(k) ? kluis.get(k) : null),
      setItem: (k, v) => kluis.set(k, String(v)),
      removeItem: (k) => kluis.delete(k),
    },
  });
}

let g;
beforeAll(() => {
  stubOpslag();
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
});
afterEach(() => vi.restoreAllMocks());

const NOTITIES_DOMEIN = {
  naam: "Notities", module: "core", emoji: "📝",
  velden: [
    { naam: "Onderwerp", type: "titel" },
    { naam: "Notitie", type: "tekst" },
    { naam: "Datum", type: "datum" },
    { naam: "Auteur", type: "tekst" },
    { naam: "Soort", type: "select", opties: ["Mens", "Agent"] },
    { naam: "Betreft", type: "relatie", naar: "*" },
  ],
};

function nepToken(scope, sub = "at_test#seat1") {
  const payload = btoa(JSON.stringify({ scope, sub })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `kop.${payload}.handtekening`;
}

function schemaMetNotities() {
  const schema = JSON.parse(JSON.stringify(g.AGENTIC_TEAM_SCHEMA));
  schema.datadomeinen.notities = schema.datadomeinen.notities || NOTITIES_DOMEIN;
  return schema;
}

const ACTIE = { Actie: "Offerte nabellen", Status: "Open", Eigenaar: "", __entryId: "act-1" };
const NOTITIE = {
  Onderwerp: "Gebeld", Notitie: "Wil eerst intern overleggen", Datum: "2026-09-01",
  Auteur: "Tijmen", Soort: "Mens", Betreft: { id: "act-1", titel: "Offerte nabellen", domein: "acties" },
  __entryId: "not-1",
};

function ctxMet({ scope = "dashboard:lees dashboard:schrijf", acties = [ACTIE], notities = [NOTITIE] } = {}) {
  return {
    schema: schemaMetNotities(),
    bron: { oauth: true, token: nepToken(scope), instantieUrl: "https://connector.example" },
    kanSchrijven: scope.indexOf("dashboard:schrijf") !== -1,
    herlaad: vi.fn().mockResolvedValue(undefined),
    bundle: {
      kind: "rows", source: "werkruimte", sourceLabel: "je werkruimte", systeemPerDomein: {},
      domains: {
        acties: { rows: acties, herkomstLabel: "werkruimte — acties" },
        notities: { rows: notities, herkomstLabel: "werkruimte — notities" },
      },
    },
  };
}

function el() {
  const d = document.createElement("div");
  document.body.appendChild(d);
  return d;
}

function openRij(ctx, key = "acties", id = "act-1") {
  const c = el();
  g.resetDataZoek();
  g.zetDataDetail(key, id);
  g.renderDataDomein(c, key, ctx);
  return c;
}

describe("f33 — de notitiedraad", () => {
  it("toont meerdere notities bij de rij, met auteur en datum, nieuwste boven", () => {
    const ouder = { ...NOTITIE, Onderwerp: "Eerste contact", Datum: "2026-08-01", __entryId: "not-0" };
    const c = openRij(ctxMet({ notities: [ouder, NOTITIE] }));
    const items = [...c.querySelectorAll(".notitie")];
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("Gebeld");        // nieuwste boven
    expect(items[0].textContent).toContain("Tijmen");
    expect(items[1].textContent).toContain("Eerste contact");
  });

  it("laat alleen notities zien die naar déze rij verwijzen", () => {
    const ander = { ...NOTITIE, Onderwerp: "Andere rij", __entryId: "not-2",
      Betreft: { id: "act-9", titel: "x", domein: "acties" } };
    const c = openRij(ctxMet({ notities: [NOTITIE, ander] }));
    expect(c.textContent).not.toContain("Andere rij");
  });

  it("een nieuwe notitie gaat als eigen rij naar het domein notities, met een polymorfe verwijzing", async () => {
    const ctx = ctxMet();
    window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Tijmen");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 201, json: async () => ({ entry: { entryId: "not-9" } }),
    });
    const c = openRij(ctx);
    c.querySelector("[data-notitie-onderwerp]").value = "Teruggebeld";
    c.querySelector("[data-notitie-tekst]").value = "Akkoord op de offerte";
    c.querySelector("[data-notitie-form]").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 0));

    const [url, opties] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/dashboard/entries");
    expect(opties.method).toBe("POST");
    const body = JSON.parse(opties.body);
    expect(body.domein).toBe("notities");
    expect(body.data.Betreft).toEqual({ domein: "acties", id: "act-1" });
    expect(body.data.Auteur).toBe("Tijmen");
    expect(body.data.Soort).toBe("Mens");
    expect(ctx.herlaad).toHaveBeenCalled();
  });

  it("zonder schrijfsessie lees je de draad wel, maar is er geen formulier", () => {
    const c = openRij(ctxMet({ scope: "dashboard:lees" }));
    expect(c.textContent).toContain("Gebeld");
    expect(c.querySelector("[data-notitie-form]")).toBeNull();
  });
});

describe("f33 — bedienen", () => {
  it("een statuswissel gaat via PATCH, niet via PUT", async () => {
    const ctx = ctxMet();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ entry: {} }),
    });
    const c = openRij(ctx);
    const select = c.querySelector("[data-snel-status]");
    select.value = "Bezig";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    const [url, opties] = fetchSpy.mock.calls[0];
    expect(opties.method).toBe("PATCH");
    expect(String(url)).toContain("/dashboard/entries/acties/act-1");
    expect(JSON.parse(opties.body).data).toEqual({ Status: "Bezig" });
  });

  it("op Klaar zet alleen de afrondingsdatum, niet de autonomiemarkering (i25)", () => {
    const domein = schemaMetNotities().datadomeinen.acties;
    const patch = g.statusPatch(domein, "Klaar", "Tijmen");
    expect(patch.Status).toBe("Klaar");
    expect(patch["Afgerond op"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Hier klikt een mens: "Afgerond door" is de autonomiemarkering en blijft leeg.
    expect(patch["Afgerond door"]).toBeUndefined();
    // "Wacht op review" is per statuscontract een mens die nog niets afrondde.
    expect(g.statusPatch(domein, "Wacht op review", "Tijmen")).toEqual({ Status: "Wacht op review" });
  });

  it("'Aan mij' zet de opgegeven naam als eigenaar en onthoudt hem per seat", async () => {
    const ctx = ctxMet();
    window.localStorage.removeItem("agentic-team-dashboard:naam:at_test#seat1");
    vi.spyOn(window, "prompt").mockReturnValue("Yoram");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => ({ entry: {} }),
    });
    const c = openRij(ctx);
    c.querySelector("[data-snel-mij]").click();
    await new Promise(r => setTimeout(r, 0));

    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).data).toEqual({ Eigenaar: "Yoram" });
    expect(g.mijnNaam(ctx.bron)).toBe("Yoram");
  });

  it("de bedienbalk bestaat niet op de daglink", () => {
    const c = openRij(ctxMet({ scope: "dashboard:lees" }));
    expect(c.querySelector(".bedien-balk")).toBeNull();
    expect(c.querySelector("[data-snel-status]")).toBeNull();
  });
});

describe("f33 — het notitieblok wacht op de instantie", () => {
  it("verschijnt niet als de instantie het domein 'notities' nog niet kent", () => {
    const ctx = ctxMet();
    // Zoals /dashboard/overzicht het meldt: alle domeinen die de instantie
    // kent, ook met aantal 0. Een instantie op een ouder image noemt 'notities'
    // dus niet — en dan hoort er geen formulier te staan dat 400't.
    ctx.bundle.instantieDomeinen = ["acties", "organisaties"];
    const c = openRij(ctx);
    expect(c.querySelector("[data-notitie-form]")).toBeNull();
    expect(c.textContent).not.toContain("Nog geen notities");
  });

  it("verschijnt wel zodra de instantie hem noemt", () => {
    const ctx = ctxMet();
    ctx.bundle.instantieDomeinen = ["acties", "notities"];
    const c = openRij(ctx);
    expect(c.querySelector("[data-notitie-form]")).not.toBeNull();
  });
});
