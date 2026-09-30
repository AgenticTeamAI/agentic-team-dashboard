// @vitest-environment jsdom
/* b61 — toewijzen aan een specialist werkt.
 *
 * Het werkmoment routeert op Eigenaar (werkronde.md stap 1). De oude
 * agentkiezer zette alleen Agent, dus een actie "aan de Researcher" bleef op
 * naam van een mens staan en werd nooit opgepakt. Nu is er één kiezer "Wie
 * pakt het op?": een specialist zet Eigenaar én Agent (en zet de actie terug op
 * Open als het werkmoment hem anders laat liggen), een mens zet alleen
 * Eigenaar — Agent blijft het spoor van wie het voorwerk deed. */
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
let RESEARCHER;
let OUTREACH;
beforeAll(() => {
  stubOpslag();
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
  const agent = (slug) => g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === slug);
  RESEARCHER = agent("researcher").displayName;
  OUTREACH = agent("outreach-specialist").displayName;
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; g._resetNaamvoorstel(); });

function nepToken(scope, sub = "at_test#seat1") {
  const payload = btoa(JSON.stringify({ scope, sub })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `kop.${payload}.handtekening`;
}

function ctxMet(rij, andere = []) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA,
    bron: { oauth: true, token: nepToken("dashboard:lees dashboard:schrijf"), instantieUrl: "https://connector.example" },
    kanSchrijven: true,
    herlaad: vi.fn().mockResolvedValue(undefined),
    werkBij: vi.fn(),
    bundle: {
      kind: "rows", source: "werkruimte", sourceLabel: "je werkruimte", systeemPerDomein: {},
      domains: { acties: { rows: [{ __entryId: "act-1", ...rij }].concat(andere), herkomstLabel: "werkruimte — acties" } },
    },
  };
}

function openKaart(ctx) {
  const vak = document.createElement("div");
  vak.id = "melding";
  vak.hidden = true;
  document.body.appendChild(vak);
  const c = document.createElement("div");
  document.body.appendChild(c);
  g.resetDataZoek();
  g.zetDataDetail("acties", "act-1");
  g.renderDataDomein(c, "acties", ctx);
  return c;
}

function kies(c, waarde) {
  const wie = c.querySelector("[data-snel-wie]");
  wie.value = waarde;
  wie.dispatchEvent(new Event("change", { bubbles: true }));
}

function nepFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opties) =>
    new Response(JSON.stringify({ entry: { entryId: "act-1", data: JSON.parse(opties.body).data } }), { status: 200 }));
}

const patchVan = (spy, i = 0) => JSON.parse(spy.mock.calls[i][1].body).data;

describe("b61 — toewijsPatch: de regel", () => {
  const acties = () => g.AGENTIC_TEAM_SCHEMA.datadomeinen.acties;

  it("een specialist zet Eigenaar én Agent op de weergavenaam", () => {
    expect(g.toewijsPatch(acties(), { Status: "Open" }, { soort: "specialist", naam: RESEARCHER }))
      .toEqual({ Eigenaar: RESEARCHER, Agent: RESEARCHER });
  });

  it("uit Wacht op review, Klaar of Wacht zonder datum gaat hij terug naar Open", () => {
    for (const status of ["Wacht op review", "Klaar", "Wacht"]) {
      expect(g.toewijsPatch(acties(), { Status: status }, { soort: "specialist", naam: RESEARCHER }).Status).toBe("Open");
    }
  });

  it("een Voorstel, Bezig of Wacht met datum houdt zijn status", () => {
    expect(g.toewijsPatch(acties(), { Status: "Voorstel" }, { soort: "specialist", naam: RESEARCHER }).Status).toBeUndefined();
    expect(g.toewijsPatch(acties(), { Status: "Bezig" }, { soort: "specialist", naam: RESEARCHER }).Status).toBeUndefined();
    expect(g.toewijsPatch(acties(), { Status: "Wacht", "Wachten tot": "2026-10-06" }, { soort: "specialist", naam: RESEARCHER }).Status).toBeUndefined();
  });

  it("een mens zet alleen Eigenaar: Agent blijft het spoor van het voorwerk", () => {
    expect(g.toewijsPatch(acties(), { Status: "Wacht op review", Agent: OUTREACH }, { soort: "mens", naam: "Sanne" }))
      .toEqual({ Eigenaar: "Sanne" });
  });

  it("niemand maakt alleen Eigenaar leeg", () => {
    expect(g.toewijsPatch(acties(), { Eigenaar: "Sanne" }, { soort: "niemand" })).toEqual({ Eigenaar: null });
  });

  it("herkent een specialist aan weergavenaam en aan slug", () => {
    expect(g.specialistVan({ schema: g.AGENTIC_TEAM_SCHEMA }, "researcher")).toBe(RESEARCHER);
    expect(g.specialistVan({ schema: g.AGENTIC_TEAM_SCHEMA }, RESEARCHER.toUpperCase())).toBe(RESEARCHER);
    expect(g.specialistVan({ schema: g.AGENTIC_TEAM_SCHEMA }, "Sanne")).toBeNull();
  });

  it("de melding noemt het gevolg", () => {
    const naarOpen = g.toewijsPatch(acties(), { Status: "Wacht op review" }, { soort: "specialist", naam: RESEARCHER });
    expect(g.toewijsTekst({ Status: "Wacht op review" }, naarOpen, { soort: "specialist", naam: RESEARCHER }))
      .toBe(`${RESEARCHER} pakt dit op bij het volgende werkmoment. Status staat weer op Open.`);
    expect(g.toewijsTekst({ Status: "Voorstel" }, {}, { soort: "specialist", naam: RESEARCHER }))
      .toContain("blijft een voorstel");
    expect(g.toewijsTekst({}, {}, { soort: "mens", naam: "Sanne" }, "Sanne")).toBe("Staat nu op jouw naam.");
  });
});

describe("b61 — de kiezer 'Wie pakt het op?'", () => {
  it("vervangt de losse Eigenaar- en Agent-velden", () => {
    const c = openKaart(ctxMet({ Actie: "Prospectlijst", Status: "Open" }));
    expect(c.querySelector("[data-snel-wie]")).not.toBeNull();
    expect(c.querySelector("[data-snel-agent]")).toBeNull();
    expect(c.querySelector("[data-snel-eigenaar]")).toBeNull();
  });

  it("toont een specialist als eigenaar, ook als die als slug is opgeslagen", () => {
    const c = openKaart(ctxMet({ Actie: "Prospectlijst", Status: "Open", Eigenaar: "researcher" }));
    expect(c.querySelector("[data-snel-wie]").value).toBe("specialist:" + RESEARCHER);
  });

  it("biedt de mensen aan die al eigenaar zijn in je acties", () => {
    const c = openKaart(ctxMet({ Actie: "A", Status: "Open" }, [
      { __entryId: "act-2", Actie: "B", Eigenaar: "Mark" },
      { __entryId: "act-3", Actie: "C", Eigenaar: OUTREACH },
    ]));
    const mensen = [...c.querySelectorAll('[data-snel-wie] optgroup[label="Mensen"] option')].map(o => o.textContent);
    expect(mensen).toContain("Mark");
    expect(mensen).not.toContain(OUTREACH);
    expect(mensen).toContain("Iemand anders…");
  });

  it("een specialist kiezen: één PATCH met Eigenaar, Agent en Status, en een melding met het gevolg", async () => {
    const fetchSpy = nepFetch();
    const ctx = ctxMet({ Actie: "Offerte", Status: "Wacht op review", Eigenaar: "Sanne", Agent: OUTREACH });
    const c = openKaart(ctx);
    kies(c, "specialist:" + RESEARCHER);
    await vi.waitFor(() => expect(ctx.werkBij).toHaveBeenCalled());
    expect(fetchSpy.mock.calls[0][1].method).toBe("PATCH");
    expect(patchVan(fetchSpy)).toEqual({ Eigenaar: RESEARCHER, Agent: RESEARCHER, Status: "Open" });
    expect(document.getElementById("melding").textContent).toContain("volgende werkmoment");
  });

  it("ongedaan maken zet Eigenaar, Agent en Status alle drie terug", async () => {
    const fetchSpy = nepFetch();
    const ctx = ctxMet({ Actie: "Offerte", Status: "Wacht op review", Eigenaar: "Sanne", Agent: OUTREACH });
    const c = openKaart(ctx);
    kies(c, "specialist:" + RESEARCHER);
    await vi.waitFor(() => expect(ctx.werkBij).toHaveBeenCalled());
    document.querySelector("[data-melding-actie]").click();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(patchVan(fetchSpy, 1)).toEqual({ Eigenaar: "Sanne", Agent: OUTREACH, Status: "Wacht op review" });
  });

  it("een mens kiezen laat Agent staan", async () => {
    const fetchSpy = nepFetch();
    const c = openKaart(ctxMet({ Actie: "A", Status: "Open", Eigenaar: OUTREACH, Agent: OUTREACH },
      [{ __entryId: "act-2", Actie: "B", Eigenaar: "Mark" }]));
    kies(c, "mens:Mark");
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(patchVan(fetchSpy)).toEqual({ Eigenaar: "Mark" });
  });

  it("'Iemand anders…' vraagt een naam in de pagina; een specialistennaam wordt als specialist herkend", async () => {
    const fetchSpy = nepFetch();
    const c = openKaart(ctxMet({ Actie: "A", Status: "Open" }));
    kies(c, "anders:");
    const vak = c.querySelector("[data-snel-anders]");
    expect(vak.hidden).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    const invoer = c.querySelector("[data-snel-anders-naam]");
    invoer.value = "researcher";
    invoer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(patchVan(fetchSpy)).toEqual({ Eigenaar: RESEARCHER, Agent: RESEARCHER });
  });

  it("'Iemand anders…' annuleren stuurt niets en zet de kiezer terug", () => {
    const fetchSpy = nepFetch();
    const c = openKaart(ctxMet({ Actie: "A", Status: "Open", Eigenaar: "Mark" }));
    kies(c, "anders:");
    c.querySelector("[data-snel-anders-niet]").click();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(c.querySelector("[data-snel-wie]").value).toBe("mens:Mark");
    expect(c.querySelector("[data-snel-anders]").hidden).toBe(true);
  });

  it("'Niemand' maakt alleen Eigenaar leeg", async () => {
    const fetchSpy = nepFetch();
    const c = openKaart(ctxMet({ Actie: "A", Status: "Open", Eigenaar: "Mark", Agent: OUTREACH }));
    kies(c, "");
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(patchVan(fetchSpy)).toEqual({ Eigenaar: null });
  });
});
