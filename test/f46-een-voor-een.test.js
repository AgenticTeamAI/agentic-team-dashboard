// @vitest-environment jsdom
/* f46 — "Loop ze één voor één door" en de sneltoetsen (src/voor-jou-scherm.js).
 *
 * De ronde toont het item-blad van elk stuk in de werkbak, in dezelfde volgorde
 * en met dezelfde nummers als Voor jou. Afhandelen haalt een stuk uit de
 * werkbak, en dan staat het volgende er vanzelf; aan het eind een slotkaart.
 * Sneltoetsen werken nooit terwijl je typt. */
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
];

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
let OS;
beforeAll(() => {
  stubOpslag();
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
  OS = g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === "outreach-specialist").displayName;
});
beforeEach(() => {
  g._resetVoorJouNummers();
  g._resetRonde();
  window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne");
  document.body.innerHTML = `<div id="melding" hidden></div>`;
  window.location.hash = "";
});
afterEach(() => { vi.restoreAllMocks(); g._resetNaamvoorstel(); window.location.hash = ""; });

const NU = new Date(2026, 8, 29, 7, 42);
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const TOKEN = `kop.${b64({ scope: "dashboard:lees dashboard:schrijf", sub: "at_test#seat1" })}.handtekening`;

function ctxMet(rijen) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU,
    bron: { oauth: true, token: TOKEN, instantieUrl: "https://connector.example" },
    kanSchrijven: true, herlaad: vi.fn().mockResolvedValue(undefined), werkBij: vi.fn(),
    bundle: { kind: "rows", source: "werkruimte", systeemPerDomein: {}, domains: { acties: { rows: rijen } } },
  };
}
const rij = (id, velden) => ({ __entryId: id, __stempels: { aangemaakt: null, bijgewerkt: null }, ...velden });
const drie = () => [
  rij("a", { Actie: "Factuur nabellen", Status: "Open", Eigenaar: "Sanne", Deadline: "2026-09-25" }),
  rij("b", { Actie: "Mail nakijken", Status: "Wacht op review", Eigenaar: "Sanne", "Aangemaakt door": OS, Toelichting: "Beste Jan" }),
  rij("c", { Actie: "Korting De Vries", Status: "Voorstel", Eigenaar: OS }),
];

function openRonde(ctx) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  g.renderRonde(el, ctx);
  return el;
}
const titel = (el) => el.querySelector(".blad-titel").textContent;

describe("f46 — één voor één", () => {
  it("begint bij nummer 1 en loopt in de volgorde van de werkbak", () => {
    const el = openRonde(ctxMet(drie()));
    expect(titel(el)).toBe("Factuur nabellen");
    expect(el.querySelector(".ronde-voortgang").textContent).toBe("Nr 1 · 1 van 3");
    el.querySelector('[data-ronde="over"]').click();
    expect(titel(el)).toBe("Mail nakijken");
    el.querySelector('[data-ronde="vorige"]').click();
    expect(titel(el)).toBe("Factuur nabellen");
  });

  it("afhandelen haalt het stuk eruit, en dan staat het volgende er vanzelf", () => {
    const ctx = ctxMet(drie());
    const el = openRonde(ctx);
    // Zoals werkRijBij na een PATCH: de rij verandert, de bundel blijft.
    ctx.bundle.domains.acties.rows = ctx.bundle.domains.acties.rows.map(r => (r.__entryId === "a" ? { ...r, Status: "Klaar" } : r));
    g.renderRonde(el, ctx);
    expect(titel(el)).toBe("Mail nakijken");
    expect(el.querySelector(".ronde-voortgang").textContent).toBe("Nr 2 · 2 van 3");
  });

  it("een knop op het blad doet het één keer, ook na bladeren", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, o) =>
      new Response(JSON.stringify({ entry: { entryId: "b", data: JSON.parse(o.body).data } }), { status: 200 }));
    const ctx = ctxMet(drie());
    const el = openRonde(ctx);
    el.querySelector('[data-ronde="over"]').click();
    el.querySelector('[data-ronde="vorige"]').click();
    el.querySelector('[data-ronde="over"]').click();
    el.querySelector('[data-afhandel="goedkeuren"]').click();
    await vi.waitFor(() => expect(ctx.werkBij).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("aan het eind een slotkaart, en de overgeslagen kun je nog eens doorlopen", () => {
    const ctx = ctxMet(drie());
    const el = openRonde(ctx);
    ctx.bundle.domains.acties.rows = ctx.bundle.domains.acties.rows.map(r => (r.__entryId === "a" ? { ...r, Status: "Klaar" } : r));
    g.renderRonde(el, ctx);
    el.querySelector('[data-ronde="over"]').click();
    el.querySelector('[data-ronde="over"]').click();
    expect(titel(el)).toBe("Klaar voor nu");
    expect(el.textContent).toContain("Je handelde er 1 af, 2 sloeg je over.");
    el.querySelector('[data-ronde="opnieuw"]').click();
    expect(titel(el)).toBe("Mail nakijken");
  });

  it("Voor jou biedt de ronde aan vanaf twee stukken", () => {
    const paneel = document.createElement("section");
    paneel.innerHTML = `<div id="panel-voor-jou-body"></div>`;
    document.body.appendChild(paneel);
    g.renderVoorJou(paneel, ctxMet(drie()));
    expect(paneel.querySelector('a.vj-ronde-start[href="#/ronde"]')).not.toBeNull();
    g.renderVoorJou(paneel, ctxMet(drie().slice(0, 1)));
    expect(paneel.querySelector(".vj-ronde-start")).toBeNull();
  });
});

describe("f46 — sneltoetsen", () => {
  const toets = (key, doel = document.body) =>
    doel.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  beforeAll(() => g.zetSneltoetsenAan());

  it("op Voor jou opent een cijfer dat nummer", () => {
    const paneel = document.createElement("section");
    paneel.innerHTML = `<div id="panel-voor-jou-body"></div>`;
    document.body.appendChild(paneel);
    g.renderVoorJou(paneel, ctxMet(drie()));
    window.location.hash = "#/";
    toets("2");
    expect(window.location.hash).toBe("#/acties/b");
  });

  it("nooit terwijl je typt", () => {
    const paneel = document.createElement("section");
    paneel.innerHTML = `<div id="panel-voor-jou-body"></div><input id="typ">`;
    document.body.appendChild(paneel);
    g.renderVoorJou(paneel, ctxMet(drie()));
    window.location.hash = "#/";
    toets("2", document.getElementById("typ"));
    expect(window.location.hash).toBe("#/");
  });

  it("in de ronde bladeren J en K, en Esc stopt", () => {
    const el = openRonde(ctxMet(drie()));
    window.location.hash = "#/ronde";
    toets("j");
    expect(titel(el)).toBe("Mail nakijken");
    toets("k");
    expect(titel(el)).toBe("Factuur nabellen");
    toets("Escape");
    expect(window.location.hash).toBe("#/");
  });
});
