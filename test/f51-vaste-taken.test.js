// @vitest-environment jsdom
/* f51 — vaste taken in Team (src/vaste-taken.js).
 *
 * Klaar-als uit Notion: aan/uit en ritme wijzigen zonder reconnect, met
 * ongedaan maken; donderdag zichtbaar "kan nog niet"; Notion-klanten krijgen
 * uitleg en een kopieerzin, alleen lezen. De statusregels volgen de
 * due-regels van core/served/werkronde.md en oordelen alleen "te laat volgens
 * het eigen ritme" — nooit een geraden frequentie. */
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
];

let g;
let MA; // Management Assistent
beforeAll(() => {
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
  MA = g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === "management-assistent").displayName;
});
beforeEach(() => { document.body.innerHTML = `<div id="melding" hidden></div>`; });
afterEach(() => { vi.restoreAllMocks(); window.location.hash = ""; });

// Dinsdag 29 september 2026, 07:42.
const NU = new Date(2026, 8, 29, 7, 42);
const taak = (id, velden) => ({ __entryId: id, Agent: MA, Actief: true, ...velden });
const status = (velden) => g.taakStatus(taak("t", velden), NU);

describe("f51 — hoe staat een taak ervoor, volgens zijn eigen ritme", () => {
  it("uit, of nog nooit gedraaid", () => {
    expect(status({ Actief: false, Ritme: "dagelijks" }).k).toBe("uit");
    expect(status({ Ritme: "dagelijks" }).k).toBe("onbekend");
  });

  it("dagelijks: pas na twee gemiste werkdagen 'kwam niet aan de beurt'", () => {
    expect(status({ Ritme: "dagelijks", "Laatst gedraaid": "2026-09-29T02:10:00" })).toMatchObject({ k: "ok", tekst: "laatst vannacht 02:10" });
    expect(status({ Ritme: "dagelijks", "Laatst gedraaid": "2026-09-28T02:10:00" }).k).toBe("ok");
    // do 24 sep → vr, ma, di = 3 werkdagen niet
    expect(status({ Ritme: "dagelijks", "Laatst gedraaid": "2026-09-24T02:10:00" })).toMatchObject({ k: "achter", n: 3 });
  });

  it("wekelijks: aan de beurt vanaf 21:00 de avond ervoor, anders achter", () => {
    expect(status({ Ritme: "wekelijks-ma", "Laatst gedraaid": "2026-09-27T22:00:00" }).k).toBe("ok"); // zo-avond telt voor maandag
    expect(status({ Ritme: "wekelijks-ma", "Laatst gedraaid": "2026-09-21T02:00:00" })).toMatchObject({ k: "achter", tekst: "kwam 1 werkdag niet aan de beurt" });
    expect(status({ Ritme: "wekelijks-di", "Laatst gedraaid": "2026-09-22T02:00:00" }).k).toBe("wacht"); // vandaag nog niet
  });

  it("maandelijks: vanaf de 1e", () => {
    expect(status({ Ritme: "maandelijks", "Laatst gedraaid": "2026-09-01T02:00:00" }).k).toBe("ok");
    expect(status({ Ritme: "maandelijks", "Laatst gedraaid": "2026-08-01T02:00:00" }).k).toBe("achter");
  });

  it("telt alleen werkdagen", () => {
    expect(g.werkdagenNa(new Date(2026, 8, 25), new Date(2026, 8, 28))).toBe(1); // vr → ma
  });
});

describe("f51 — de week", () => {
  it("telt per werkdag en per maand, en ziet de drukste dag", () => {
    const w = g.weekTelling([
      taak("a", { Ritme: "dagelijks" }), taak("b", { Ritme: "dagelijks" }),
      taak("c", { Ritme: "wekelijks-ma" }), taak("d", { Ritme: "maandelijks" }),
      taak("e", { Ritme: "elk-uur" }), taak("f", { Ritme: "wekelijks-vr", Actief: false }),
    ], NU);
    expect(w.dagen.map(d => d.taken.length)).toEqual([3, 2, 2, 2, 2]);
    expect(w.drukste.map(d => d.kort)).toEqual(["ma"]);
    expect(w.vaak).toHaveLength(1);
    // september 2026: 22 werkdagen, waarvan 4 maandagen → 22×2 + 4 + 1 (maandelijks)
    expect(w.werkdagen).toBe(22);
    expect(w.perMaand).toBe(49);
  });

  it("de ritmes komen uit de registry; donderdag kan (nog) niet", () => {
    const keuzes = g.ritmeKeuzes(g.AGENTIC_TEAM_SCHEMA);
    expect(keuzes.find(k => k.waarde === "wekelijks-do")).toMatchObject({ kan: false, label: "Elke donderdag" });
    expect(keuzes.find(k => k.waarde === "dagelijks")).toMatchObject({ kan: true, label: "Elke dag" });
  });
});

describe("f51 — het scherm", () => {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;
  function ctxMet(rijen, { schrijven = true, systeemPerDomein = {} } = {}) {
    return {
      schema: g.AGENTIC_TEAM_SCHEMA, today: NU,
      bron: { oauth: schrijven, token: token(schrijven ? "dashboard:lees dashboard:schrijf" : "dashboard:lees"), instantieUrl: "https://connector.example" },
      kanSchrijven: schrijven, herlaad: vi.fn().mockResolvedValue(undefined), werkBij: vi.fn(),
      bundle: { kind: "rows", source: "werkruimte", systeemPerDomein, domains: { ritmetaken: { rows: rijen } } },
    };
  }
  const twee = () => [
    taak("t1", { Taak: "Openstaande acties oppakken", Ritme: "dagelijks", Volgorde: 1, "Laatst gedraaid": "2026-09-29T02:10:00" }),
    taak("t2", { Taak: "Facturen nalopen", Ritme: "wekelijks-vr", Volgorde: 2, "Laatst gedraaid": "2026-09-25T02:00:00" }),
  ];
  function open(ctx) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    g.renderVasteTaken(el, ctx);
    return el;
  }
  const nepFetch = () => vi.spyOn(globalThis, "fetch").mockImplementation(async (url, o) =>
    new Response(JSON.stringify({ entry: { entryId: "t2", data: JSON.parse(o.body).data } }), { status: 200 }));

  it("toont de week en de taken, in de volgorde waarin het werkmoment ze pakt", () => {
    const el = open(ctxMet(twee()));
    expect([...el.querySelectorAll(".vt-titel")].map(t => t.textContent)).toEqual(["Openstaande acties oppakken", "Facturen nalopen"]);
    expect(el.querySelectorAll(".vt-dag")).toHaveLength(5);
    expect(el.textContent).toContain("geen wekelijkse");
    const opt = [...el.querySelectorAll("[data-vt-ritme] option")].find(o => o.value === "wekelijks-do");
    expect(opt.disabled).toBe(true);
    expect(opt.textContent).toContain("kan nog niet");
  });

  it("uitzetten is één PATCH met ongedaan maken", async () => {
    const fetchSpy = nepFetch();
    const ctx = ctxMet(twee());
    const el = open(ctx);
    const schakel = el.querySelector('[data-vt-id="t2"] [data-vt-actief]');
    schakel.checked = false;
    schakel.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(ctx.werkBij).toHaveBeenCalled());
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/dashboard/entries/ritmetaken/t2");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).data).toEqual({ Actief: false });
    const melding = document.getElementById("melding");
    await vi.waitFor(() => expect(melding.textContent).toContain("staat uit"));
    melding.querySelector("[data-melding-actie]").click();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body).data).toEqual({ Actief: true });
  });

  it("het ritme wijzigen is ook één PATCH", async () => {
    const fetchSpy = nepFetch();
    const ctx = ctxMet(twee());
    const el = open(ctx);
    const ritme = el.querySelector('[data-vt-id="t2"] [data-vt-ritme]');
    ritme.value = "wekelijks-wo";
    ritme.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).data).toEqual({ Ritme: "wekelijks-wo" });
    await vi.waitFor(() => expect(document.getElementById("melding").textContent).toContain("elke woensdag"));
  });

  it("op de daglink: kijken, niet aanpassen", () => {
    const el = open(ctxMet(twee(), { schrijven: false }));
    expect([...el.querySelectorAll("[data-vt-actief], [data-vt-ritme]")].every(x => x.disabled)).toBe(true);
    expect(el.textContent).toContain("Aanpassen kan na inloggen");
  });

  it("vaste taken in Notion: uitleg en een kopieerzin, alleen lezen", () => {
    const el = open(ctxMet(twee(), { systeemPerDomein: { ritmetaken: "notion" } }));
    expect(el.textContent).toContain("Je vaste taken staan in je eigen systeem");
    expect(el.querySelector("[data-vt-kopieer]")).not.toBeNull();
    expect(el.querySelector("[data-vt-actief]")).toBeNull();
  });

  it("nog geen vaste taken: de zin waarmee je ze aanzet", () => {
    const el = open(ctxMet([]));
    expect(el.textContent).toContain("Je team heeft nog geen vaste taken");
    expect(el.querySelector("[data-vt-kopieer]").getAttribute("data-vt-kopieer")).toBe("Zet mijn ritmetaken aan.");
  });

  it("is een deel van Team: #/vaste-taken licht Team op", () => {
    window.location.hash = "#/vaste-taken";
    expect(g.bepaalActieveView()).toEqual({ soort: "tab", tab: "vaste-taken" });
    const bar = document.createElement("nav");
    document.body.appendChild(bar);
    g.renderTabbar(bar, "vaste-taken", ctxMet(twee()));
    expect(bar.querySelector(".tab.actief .tab-titel").textContent).toBe("Team");
  });
});
