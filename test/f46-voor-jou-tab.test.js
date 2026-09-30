// @vitest-environment jsdom
/* f46 deel 2 — de tab Voor jou (src/voor-jou-scherm.js).
 *
 * Klaar-als uit Notion: "badge, lijst, baan Jij en klaar-check tellen
 * hetzelfde". Hier: de badge (voorJouAantal) en de werkbak tellen met dezelfde
 * functie; de nummers blijven staan tot je ververst; afhandelen gaat met de
 * knoppen van het item-blad; de verhaalkop zegt wat je team sinds gisteren
 * deed, uit vaste zinnen op de data. */
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
let RS;
beforeAll(() => {
  stubOpslag();
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
  const agent = (slug) => g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === slug).displayName;
  OS = agent("outreach-specialist");
  RS = agent("researcher");
});
beforeEach(() => { g._resetVoorJouNummers(); window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne"); });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; g._resetNaamvoorstel(); });

const NU = new Date(2026, 8, 29, 7, 42); // di 29 sep
const VANNACHT = "2026-09-29T02:14:00";

function nepToken(scope, sub = "at_test#seat1") {
  const payload = btoa(JSON.stringify({ scope, sub })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `kop.${payload}.handtekening`;
}

function ctxMet(rijen, { schrijven = true, kind = "rows" } = {}) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA,
    today: NU,
    bron: { oauth: schrijven, token: nepToken(schrijven ? "dashboard:lees dashboard:schrijf" : "dashboard:lees"), instantieUrl: "https://connector.example" },
    kanSchrijven: schrijven,
    herlaad: vi.fn().mockResolvedValue(undefined),
    werkBij: vi.fn(),
    bundle: { kind, source: "werkruimte", systeemPerDomein: {}, domains: { acties: { rows: rijen } } },
  };
}

function paneel() {
  document.body.innerHTML = `<div id="melding" hidden></div><section id="panel-voor-jou" style="display:none"><div id="panel-voor-jou-body"></div></section>`;
  return document.getElementById("panel-voor-jou");
}

const rij = (id, velden, stempel) => ({ __entryId: id, __stempels: { aangemaakt: stempel || null, bijgewerkt: stempel || null }, ...velden });

function standaard() {
  return [
    rij("a1", { Actie: "Follow-upmail Jansen", Status: "Wacht op review", Eigenaar: "Sanne", "Aangemaakt door": OS,
      Toelichting: "Beste Jan, dank voor het gesprek." }, VANNACHT),
    rij("a2", { Actie: "Factuur Smit nabellen", Status: "Open", Eigenaar: "Sanne", Deadline: "2026-09-25" }),
    rij("a3", { Actie: "Vacature bij Smit", Status: "Open", Type: "Alert", Eigenaar: "Sanne", "Aangemaakt door": RS }, VANNACHT),
    rij("a4", { Actie: "Prospectlijst", Status: "Bezig", Eigenaar: RS }, VANNACHT),
    rij("a5", { Actie: "Dossier Visser", Status: "Klaar", "Afgerond door": RS, "Afgerond op": "2026-09-29" }),
    rij("a6", { Actie: "Contract Mark", Status: "Wacht op review", Eigenaar: "Mark" }),
  ];
}

describe("f46 — de werkbak", () => {
  it("toont wat op jou wacht, genummerd, met hetzelfde getal als de badge", () => {
    const ctx = ctxMet(standaard());
    const p = paneel();
    g.renderVoorJou(p, ctx);
    expect(p.style.display).toBe("");
    const kaarten = [...p.querySelectorAll(".vj-kaart")];
    expect(kaarten.map(k => k.getAttribute("data-vj-id"))).toEqual(["a2", "a1", "a3"]); // te laat eerst
    expect(kaarten.map(k => k.querySelector(".vj-nr").textContent)).toEqual(["1", "2", "3"]);
    expect(p.querySelector(".vj-teller").textContent).toBe("3");
    expect(g.voorJouAantal(ctx)).toBe(3);
    // Van een collega: niet in jouw werkbak, wel als regel eronder.
    expect(p.textContent).not.toContain("Contract Mark");
    expect(p.textContent).toContain("Bij collega's: 1");
    expect(p.textContent).toContain("Bij je team: 1 bezig");
  });

  it("de nummers blijven staan na afhandelen, tot je ververst", () => {
    const ctx = ctxMet(standaard());
    const p = paneel();
    g.renderVoorJou(p, ctx);
    // Afgehandeld: werkRijBij vervangt de rijen, de bundel blijft dezelfde.
    ctx.bundle.domains.acties.rows = ctx.bundle.domains.acties.rows.map(r => (r.__entryId === "a2" ? { ...r, Status: "Klaar" } : r));
    g.renderVoorJou(p, ctx);
    expect([...p.querySelectorAll(".vj-nr")].map(n => n.textContent)).toEqual(["2", "3"]);
    // Ververs = een nieuwe bundel = opnieuw tellen vanaf 1.
    const vers = ctxMet(ctx.bundle.domains.acties.rows);
    g.renderVoorJou(p, vers);
    expect([...p.querySelectorAll(".vj-nr")].map(n => n.textContent)).toEqual(["1", "2"]);
  });

  it("afhandelen met één tik gebruikt de knop van het item-blad", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opties) =>
      new Response(JSON.stringify({ entry: { entryId: "a1", data: JSON.parse(opties.body).data } }), { status: 200 }));
    const ctx = ctxMet(standaard());
    const p = paneel();
    g.renderVoorJou(p, ctx);
    p.querySelector('[data-vj-id="a1"] [data-vj-afhandel="goedkeuren"]').click();
    await vi.waitFor(() => expect(ctx.werkBij).toHaveBeenCalled());
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/dashboard/entries/acties/a1");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).data).toEqual({ Status: "Klaar", "Afgerond op": "2026-09-29" });
  });

  it("een knop die een vraag heeft, opent het blad in plaats van te raden", () => {
    const p = paneel();
    g.renderVoorJou(p, ctxMet(standaard()));
    const signaal = p.querySelector('[data-vj-id="a3"]');
    expect(signaal.querySelector("[data-vj-afhandel]")).toBeNull();
    expect(signaal.querySelector('a.blad-knop[href="#/acties/a3"]').textContent).toBe("Laat je team opvolgen");
  });

  it("op de daglink: lezen en bekijken, niet afhandelen", () => {
    const p = paneel();
    g.renderVoorJou(p, ctxMet(standaard(), { schrijven: false }));
    expect(p.querySelector("[data-vj-afhandel]")).toBeNull();
    expect(p.querySelectorAll(".vj-kaart").length).toBeGreaterThan(0);
  });

  it("zonder acties-rijen (metricsroute) blijft het paneel weg", () => {
    const p = paneel();
    g.renderVoorJou(p, ctxMet(standaard(), { kind: "metrics" }));
    expect(p.style.display).toBe("none");
  });

  it("leeg is een rustige zin, geen lege lijst", () => {
    const p = paneel();
    g.renderVoorJou(p, ctxMet([rij("x", { Actie: "Klaar", Status: "Klaar" })]));
    expect(p.querySelector(".vj-leeg").textContent).toContain("Niets voor jou");
  });
});

describe("f46 — de verhaalkop", () => {
  it("zegt in vaste zinnen wat je team sinds gisteren deed", () => {
    const ctx = ctxMet(standaard());
    const v = g.vjVerhaal(ctx, g.voorJouLijst(ctx));
    expect(v.zin).toBe("Sinds gisteren rondde je team 1 ding zelf af, zette er 2 voor je klaar en begon aan 1.");
    expect(v.wie).toEqual(expect.arrayContaining([RS, OS]));
  });

  it("zonder nieuws zegt hij dat ook", () => {
    const ctx = ctxMet([rij("x", { Actie: "Oud", Status: "Open", Eigenaar: "Sanne" })]);
    expect(g.vjVerhaal(ctx, g.voorJouLijst(ctx)).zin).toBe("Sinds gisteren zette je team niets nieuws voor je klaar.");
  });
});

describe("f46 — de tab", () => {
  it("heet Voor jou en draagt het aantal als badge", () => {
    const ctx = ctxMet(standaard());
    const bar = document.createElement("nav");
    document.body.appendChild(bar);
    g.renderTabbar(bar, "vandaag", ctx);
    const tab = bar.querySelector('a[href="#/"]');
    expect(tab.querySelector(".tab-titel").textContent).toBe("Voor jou");
    expect(tab.querySelector(".tab-badge").textContent).toBe("3");
  });
});
