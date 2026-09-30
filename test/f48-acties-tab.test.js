// @vitest-environment jsdom
/* f48 — de Acties-tab: wie is aan zet (src/acties-tab.js, baanVan in
 * src/voor-jou.js).
 *
 * Klaar-als uit Notion: "elke registry-status valt in een baan (test tegen het
 * schema)" en "oude link #/data/acties blijft werken". Daarbij: elke actie staat
 * in precies één baan, en de baan Jij is exact de werkbak van Voor jou. */
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

const lees = (naam) => vm.runInThisContext(naam);
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
beforeEach(() => {
  g._resetVoorJouNummers();
  g._resetActiesTab();
  window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne");
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; g._resetNaamvoorstel(); });

const NU = new Date(2026, 8, 29, 7, 42);
const opties = (ik) => ({ ik, namen: g.agentNamen(g.AGENTIC_TEAM_SCHEMA), nu: NU });

function nepToken(scope, sub = "at_test#seat1") {
  const payload = btoa(JSON.stringify({ scope, sub })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `kop.${payload}.handtekening`;
}

function ctxMet(rijen, { schrijven = true } = {}) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA,
    today: NU,
    bron: { oauth: schrijven, token: nepToken(schrijven ? "dashboard:lees dashboard:schrijf" : "dashboard:lees"), instantieUrl: "https://connector.example" },
    kanSchrijven: schrijven,
    herlaad: vi.fn().mockResolvedValue(undefined),
    werkBij: vi.fn(),
    bundle: { kind: "rows", source: "werkruimte", systeemPerDomein: {}, domains: { acties: { rows: rijen } } },
  };
}

const rij = (id, velden) => ({ __entryId: id, __stempels: { aangemaakt: null, bijgewerkt: null }, ...velden });

function mix() {
  return [
    rij("jij1", { Actie: "Mail nakijken", Status: "Wacht op review", Eigenaar: "Sanne", "Aangemaakt door": OS, Toelichting: "Beste Jan, over de offerte" }),
    rij("jij2", { Actie: "Factuur nabellen", Status: "Open", Eigenaar: "Sanne", Deadline: "2026-09-25" }),
    rij("later1", { Actie: "Website teksten", Status: "Open", Eigenaar: "Sanne", Deadline: "2026-10-20" }),
    rij("team1", { Actie: "Prospectlijst", Status: "Bezig", Eigenaar: RS }),
    rij("team2", { Actie: "Follow-up", Status: "Open", Eigenaar: OS }),
    rij("wacht1", { Actie: "Contract terug", Status: "Wacht", Eigenaar: "Sanne", "Wachten tot": "2026-10-05" }),
    rij("wacht2", { Actie: "Uitgesteld", Status: "Wacht op review", Eigenaar: "Sanne", "Wachten tot": "2026-10-01" }),
    rij("klaar1", { Actie: "Dossier", Status: "Klaar", "Afgerond op": "2026-09-27", "Aangemaakt door": RS }),
    rij("klaar2", { Actie: "Korting", Status: "Klaar", "Afgerond op": "2026-09-28", Correctie: "Niet doen: te duur" }),
    rij("col1", { Actie: "Contract Mark", Status: "Wacht op review", Eigenaar: "Mark" }),
    rij("zonder1", { Actie: "Iemand moet dit doen", Status: "Open" }),
    rij("raar1", { Actie: "Check bij agent", Status: "Wacht op review", Eigenaar: RS }),
  ];
}

describe("f48 — baanVan: elke actie in precies één baan", () => {
  it("elke status uit de registry valt in een baan, in elke combinatie", () => {
    const statussen = g.AGENTIC_TEAM_SCHEMA.datadomeinen.acties.velden.find(v => v.naam === "Status").opties.concat([""]);
    const banen = lees("BANEN");
    for (const status of statussen) {
      for (const eigenaar of ["", "Sanne", "Mark", RS]) {
        for (const extra of [{}, { "Aangemaakt door": OS }, { "Wachten tot": "2026-09-20" }, { "Wachten tot": "2026-10-20" },
          { Deadline: "2026-09-01" }, { Type: "Alert" }]) {
          for (const ik of ["Sanne", undefined]) {
            const b = g.baanVan({ Status: status, Eigenaar: eigenaar, ...extra }, opties(ik));
            expect(banen, `${status}/${eigenaar}/${JSON.stringify(extra)}/${ik}`).toContain(b);
          }
        }
      }
    }
  });

  it("verdeelt een mix zonder overlap en zonder gaten", () => {
    const b = g.banenVan({ domains: { acties: { rows: mix() } } }, g.AGENTIC_TEAM_SCHEMA, { ik: "Sanne", nu: NU });
    const per = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.map(r => r.__entryId)]));
    expect(per).toEqual({
      jij: ["jij2", "jij1"],
      "jij-later": ["later1"],
      team: ["team1", "team2"],
      wacht: ["wacht2", "wacht1"],
      afgerond: ["klaar2", "klaar1"],
      collega: ["col1"],
      zonder: ["zonder1"],
      "klopt-niet": ["raar1"],
    });
    const alle = Object.values(per).flat();
    expect(new Set(alle).size).toBe(mix().length);
  });

  it("de baan Jij is exact de werkbak van Voor jou — ook als het dashboard niet weet wie je bent", () => {
    for (const ik of ["Sanne", undefined]) {
      const bundel = { kind: "rows", domains: { acties: { rows: mix() } } };
      const jij = g.banenVan(bundel, g.AGENTIC_TEAM_SCHEMA, { ik, nu: NU }).jij.map(r => r.__entryId);
      const werkbak = g.aanJouZet(bundel, g.AGENTIC_TEAM_SCHEMA, { ik, nu: NU }).map(r => r.__entryId);
      expect(jij).toEqual(werkbak);
    }
  });
});

describe("f48 — de tab", () => {
  function open(ctx) {
    document.body.innerHTML = `<div id="melding" hidden></div>`;
    const el = document.createElement("div");
    document.body.appendChild(el);
    g.renderActiesTab(el, ctx);
    return el;
  }
  // Alleen de baan zelf; "Later op je lijst" staat eronder, in een eigen uitklap.
  const idsIn = (el, baan) => [...el.querySelectorAll(`[data-baan="${baan}"] > .baan-lijst .baan-titel`)].map(a => a.getAttribute("href").replace("#/acties/", ""));

  it("toont vier banen met hun aantallen, en elke rij opent het blad", () => {
    const el = open(ctxMet(mix()));
    expect([...el.querySelectorAll(".baan h3")].map(h => h.textContent.replace(/\s+/g, " ").trim()))
      .toEqual(["● Jij 2", "◐ Je team 2", "○ Wacht 2", "✓ Afgerond 2"]);
    expect(idsIn(el, "jij")).toEqual(["jij2", "jij1"]);
    expect(el.textContent).toContain("Later op je lijst (1)");
    expect(el.textContent).toContain("Bij collega's (1)");
    expect(el.textContent).toContain("Zonder eigenaar (1)");
    expect(el.textContent).toContain("Klopt niet helemaal (1)");
    expect(el.textContent).toContain("niet gedaan");
  });

  it("de baan Jij draagt dezelfde nummers als Voor jou", () => {
    const ctx = ctxMet(mix());
    const paneel = document.createElement("section");
    paneel.innerHTML = `<div id="panel-voor-jou-body"></div>`;
    document.body.appendChild(paneel);
    g.renderVoorJou(paneel, ctx);
    const voorJou = [...paneel.querySelectorAll(".vj-kaart")].map(k => k.getAttribute("data-vj-id") + ":" + k.querySelector(".vj-nr").textContent);
    const el = open(ctx);
    const acties = [...el.querySelectorAll('[data-baan="jij"] > .baan-lijst > .baan-rij')].map(li =>
      li.querySelector(".baan-titel").getAttribute("href").replace("#/acties/", "") + ":" + li.querySelector(".vj-nr").textContent);
    expect(acties).toEqual(voorJou);
  });

  it("zoekt ook in wat je team schreef", () => {
    const el = open(ctxMet(mix()));
    const zoek = el.querySelector("[data-acties-zoek]");
    zoek.value = "offerte";
    zoek.dispatchEvent(new Event("input", { bubbles: true }));
    expect(idsIn(el, "jij")).toEqual(["jij1"]);
    expect(idsIn(el, "team")).toEqual([]);
  });

  it("'Klaargezet door je team' is het archief van alles wat een agent klaarzette, ook afgerond", () => {
    const el = open(ctxMet(mix()));
    el.querySelector("[data-acties-archief]").click();
    expect(idsIn(el, "jij")).toEqual(["jij1"]);
    expect(idsIn(el, "afgerond")).toEqual(["klaar1"]);
  });

  it("op de telefoon kies je één baan", () => {
    const el = open(ctxMet(mix()));
    el.querySelector('[data-baan-kies="team"]').click();
    expect(el.querySelector(".banen").getAttribute("data-baan-actief")).toBe("team");
    expect(el.querySelector('[data-baan-kies="team"]').getAttribute("aria-selected")).toBe("true");
  });

  it("'Klopt niet helemaal' zet je met één tik bij jezelf", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, o) =>
      new Response(JSON.stringify({ entry: { entryId: "raar1", data: JSON.parse(o.body).data } }), { status: 200 }));
    const ctx = ctxMet(mix());
    const el = open(ctx);
    el.querySelector('[data-zet-bij-mij="raar1"]').click();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).data).toEqual({ Eigenaar: "Sanne" });
  });

  it("zonder schrijfrecht geen knop", () => {
    const el = open(ctxMet(mix(), { schrijven: false }));
    expect(el.querySelector("[data-zet-bij-mij]")).toBeNull();
  });
});

describe("f48 — vier tabs, nooit een vijfde", () => {
  it("Voor jou · Acties · Team · Gegevens; Resultaat hoort bij Team", () => {
    const ctx = ctxMet(mix());
    const bar = document.createElement("nav");
    document.body.appendChild(bar);
    g.renderTabbar(bar, "prestaties", ctx);
    expect([...bar.querySelectorAll(".tab-titel")].map(t => t.textContent)).toEqual(["Voor jou", "Acties", "Team", "Gegevens"]);
    expect(bar.querySelector(".tab.actief .tab-titel").textContent).toBe("Team");
  });

  it("oude adressen blijven werken", () => {
    window.location.hash = "#/prestaties";
    expect(g.bepaalActieveView()).toEqual({ soort: "tab", tab: "prestaties" });
    window.location.hash = "#/data/acties";
    expect(g.bepaalActieveView()).toEqual({ soort: "data", domein: "acties", tab: "data" });
    window.location.hash = "#/acties";
    expect(g.bepaalActieveView()).toEqual({ soort: "tab", tab: "acties" });
    window.location.hash = "";
  });
});

describe("f46/f48 — per persoon zonder bekende naam", () => {
  it("zegt het als er meer mensen zijn, en na je naam telt alleen jouw werk", async () => {
    window.localStorage.removeItem("agentic-team-dashboard:naam:at_test#seat1");
    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { voorstel: "", gezet: false } }));
    const ctx = ctxMet(mix());
    ctx.hertekenAlles = vi.fn();
    const paneel = document.createElement("section");
    paneel.innerHTML = `<div id="panel-voor-jou-body"></div>`;
    document.body.innerHTML = `<div id="melding" hidden></div>`;
    document.body.appendChild(paneel);
    g.renderVoorJou(paneel, ctx);
    // Onbekend wie je bent: ook het werk van Mark staat erin — en de uitleg staat erbij.
    expect([...paneel.querySelectorAll(".vj-kaart")].map(k => k.getAttribute("data-vj-id"))).toContain("col1");
    paneel.querySelector("[data-vj-naam]").click();
    await vi.waitFor(() => expect(paneel.querySelector("[data-naam-invoer]")).not.toBeNull());
    paneel.querySelector("[data-naam-invoer]").value = "Sanne";
    paneel.querySelector("[data-naam-ok]").click();
    await vi.waitFor(() => expect(ctx.hertekenAlles).toHaveBeenCalled());
    g.renderVoorJou(paneel, ctx);
    expect([...paneel.querySelectorAll(".vj-kaart")].map(k => k.getAttribute("data-vj-id"))).not.toContain("col1");
    expect(paneel.querySelector("[data-vj-naam]")).toBeNull();
    delete g.modulesFetch;
  });
});
