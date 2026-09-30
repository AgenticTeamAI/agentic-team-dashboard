// @vitest-environment jsdom
/* f48 (restant) — verplaatsen tussen de banen van de Acties-tab.
 *
 * Slepen, of "Verplaats" op de rij (toetsenbord, telefoon). Naar Je team vraagt
 * "aan wie?", naar Wacht "tot wanneer?"; naar Jij en Afgerond gebeurt het
 * meteen, met ongedaan maken. De patches zijn die van de afhandelknoppen, dus
 * i25 geldt: afronden laat Afgerond door leeg, heropenen laat Afgerond op staan. */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [
  "schema/schema.generated.js", "src/teksten.js", "src/schema-helpers.js", "src/werkruimte-loader.js", "src/oauth-client.js",
  "src/zones.js", "src/voor-jou.js", "src/metrics-sanitize.js", "src/metrics.js", "src/render.js", "src/charts.js", "src/feed.js",
  "src/homepage.js", "src/databrowser.js", "src/data-bewerken.js", "src/item-blad.js", "src/voor-jou-scherm.js", "src/acties-tab.js",
  "src/vaste-taken.js", "src/hulp.js", "src/opdracht.js",
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
  g._resetActiesTab();
});
afterEach(() => { vi.restoreAllMocks(); });

const NU = new Date(2026, 8, 29, 7, 42);
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;
const rij = (id, velden) => ({ __entryId: id, __stempels: { aangemaakt: "2026-09-25T09:00:00", bijgewerkt: "2026-09-25T09:00:00" }, ...velden });
const c = (o) => ({ ik: "Sanne Verbeek", schema: g.AGENTIC_TEAM_SCHEMA, nu: NU, ...o });

function ctxMet({ schrijven = true } = {}) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU,
    bron: { oauth: schrijven, token: token(schrijven ? "dashboard:lees dashboard:schrijf" : "dashboard:lees"), instantieUrl: "https://connector.example" },
    kanSchrijven: schrijven, herlaad: vi.fn(), werkBij: vi.fn(),
    bundle: { kind: "rows", source: "werkruimte", systeemPerDomein: {}, domains: { acties: { rows: [
      rij("a", { Actie: "Factuur Smit nabellen", Status: "Open", Eigenaar: "Sanne Verbeek" }),
      rij("b", { Actie: "Prospects zoeken", Status: "Klaar", Eigenaar: RS, Agent: RS, "Afgerond door": RS, "Afgerond op": "2026-09-28" }),
    ] } } },
  };
}
function open(ctx) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  g.renderActiesTab(el, ctx);
  return el;
}
const nepFetch = () => vi.spyOn(globalThis, "fetch").mockImplementation(async (url, o) =>
  new Response(JSON.stringify({ entry: { entryId: "a", data: JSON.parse(o.body).data } }), { status: 200 }));

describe("f48 — wat verplaatsen verandert", () => {
  const open1 = rij("a", { Actie: "x", Status: "Open", Eigenaar: "Sanne Verbeek" });
  it("naar Afgerond: Klaar met Afgerond op, Afgerond door blijft leeg (i25)", () => {
    const { patch } = g.verplaatsPatch(open1, "jij", "afgerond", c());
    expect(patch.Status).toBe("Klaar");
    expect(patch["Afgerond op"]).toBeTruthy();
    expect(patch).not.toHaveProperty("Afgerond door");
  });
  it("naar je team: Eigenaar én Agent, en een wachtdatum eraf", () => {
    const wachtend = rij("w", { Actie: "x", Status: "Wacht", Eigenaar: "Sanne Verbeek", "Wachten tot": "2026-10-06" });
    expect(g.verplaatsPatch(wachtend, "wacht", "team", c({ specialist: RS })).patch).toEqual({ Status: "Open", Eigenaar: RS, Agent: RS, "Wachten tot": null });
    expect(g.verplaatsPatch(wachtend, "wacht", "team", c())).toBeNull();
  });
  it("uit Afgerond naar jou: heropenen, Afgerond op blijft staan (i25)", () => {
    const af = rij("b", { Actie: "x", Status: "Klaar", "Afgerond op": "2026-09-28" });
    expect(g.verplaatsPatch(af, "afgerond", "jij", c()).patch).toEqual({ Status: "Open", Eigenaar: "Sanne Verbeek" });
  });
  it("laten wachten: met of zonder datum", () => {
    expect(g.verplaatsPatch(open1, "jij", "wacht", c({ datum: "2026-10-02" })).patch).toEqual({ Status: "Wacht", "Wachten tot": "2026-10-02" });
    expect(g.verplaatsPatch(open1, "jij", "wacht", c()).patch).toEqual({ Status: "Wacht", "Wachten tot": null });
  });
});

describe("f48 — de knop en de vervolgvraag", () => {
  it("Verplaats → naar je team → aan wie? → één PATCH, met ongedaan maken", async () => {
    const fetchSpy = nepFetch();
    const ctx = ctxMet();
    const el = open(ctx);
    el.querySelector('[data-verplaats="a"]').click();
    const keuzes = [...el.querySelectorAll("[data-verplaats-naar]")].map(k => k.getAttribute("data-verplaats-naar"));
    expect(keuzes).toEqual(["team", "wacht", "afgerond"]); // niet naar de baan waar hij al staat
    el.querySelector('[data-verplaats-naar="team"]').click();
    expect(el.textContent).toContain("aan wie?");
    // RS staat in de testdata als enige specialist, dus als knop
    el.querySelector(`[data-verplaats-specialist="${RS}"]`).click();
    await vi.waitFor(() => expect(ctx.werkBij).toHaveBeenCalled());
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/dashboard/entries/acties/a");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).data).toEqual({ Status: "Open", Eigenaar: RS, Agent: RS });
    const melding = document.getElementById("melding");
    expect(melding.textContent).toContain(`Doorgegeven aan ${RS}`);
    expect(melding.querySelector("[data-melding-actie]")).not.toBeNull();
  });

  it("annuleren laat alles staan", () => {
    const fetchSpy = nepFetch();
    const el = open(ctxMet());
    el.querySelector('[data-verplaats="a"]').click();
    el.querySelector("[data-verplaats-annuleer]").click();
    expect(el.querySelector(".verplaats-paneel")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("op de daglink: niet sleepbaar, geen Verplaats", () => {
    const el = open(ctxMet({ schrijven: false }));
    expect(el.querySelector("[data-verplaats], [draggable]")).toBeNull();
  });
});

describe("f48 — slepen", () => {
  it("naar Afgerond slepen rondt af, meteen", async () => {
    const fetchSpy = nepFetch();
    const ctx = ctxMet();
    const el = open(ctx);
    const li = el.querySelector('[data-sleep-actie="a"]');
    const doel = el.querySelector('section[data-baan="afgerond"]');
    li.dispatchEvent(new Event("dragstart", { bubbles: true }));
    const over = new Event("dragover", { bubbles: true, cancelable: true });
    doel.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    doel.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).data.Status).toBe("Klaar");
  });

  it("naar Wacht slepen vraagt eerst tot wanneer", () => {
    const fetchSpy = nepFetch();
    const el = open(ctxMet());
    el.querySelector('[data-sleep-actie="a"]').dispatchEvent(new Event("dragstart", { bubbles: true }));
    el.querySelector('section[data-baan="wacht"]').dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    expect(el.textContent).toContain("tot wanneer?");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("op zijn eigen baan loslaten doet niets", () => {
    const fetchSpy = nepFetch();
    const el = open(ctxMet());
    el.querySelector('[data-sleep-actie="a"]').dispatchEvent(new Event("dragstart", { bubbles: true }));
    const over = new Event("dragover", { bubbles: true, cancelable: true });
    el.querySelector('section[data-baan="jij"]').dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    el.querySelector('section[data-baan="jij"]').dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
