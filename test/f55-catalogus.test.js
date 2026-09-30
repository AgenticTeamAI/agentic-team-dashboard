// @vitest-environment jsdom
/* f55 — "Beschikbaar voor jouw team" met "Zet aan" (src/catalogus.js).
 * Contract met de werkruimte: GET /dashboard/ritmetaken/catalogus en
 * POST /dashboard/ritmetaken/activeer { sleutel }. */
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
  "src/vaste-taken.js", "src/catalogus.js",
];

let g;
let MA;
beforeAll(() => {
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
  MA = g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === "management-assistent").displayName;
});
beforeEach(() => { document.body.innerHTML = `<div id="melding" hidden></div>`; g._resetCatalogus(); });
afterEach(() => { vi.restoreAllMocks(); });

const NU = new Date(2026, 8, 29, 7, 42);
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;
const TEMPLATES = [
  { sleutel: "acties-oppakken", klantnaam: "Openstaande acties oppakken", beschrijving: "Wat klaarstaat, wordt gedaan.", specialist: { slug: "management-assistent", naam: MA }, ritme_advies: "dagelijks", module: "core", bestaat: true, actief: true },
  { sleutel: "facturen", klantnaam: "Openstaande facturen nalopen", beschrijving: "Herinneringen staan klaar op vrijdag.", specialist: { slug: "administratie", naam: "Administratie" }, ritme_advies: "wekelijks-vr", module: "backoffice", bestaat: false, actief: false },
  { sleutel: "pipeline", klantnaam: "Stilstaande deals signaleren", beschrijving: null, specialist: null, ritme_advies: "wekelijks-ma", module: "growth", bestaat: true, actief: false },
];

function ctxMet({ schrijven = true } = {}) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU,
    bron: { oauth: schrijven, token: token(schrijven ? "dashboard:lees dashboard:schrijf" : "dashboard:lees"), instantieUrl: "https://connector.example" },
    kanSchrijven: schrijven, herlaad: vi.fn(), werkBij: vi.fn(),
    bundle: { kind: "rows", source: "werkruimte", systeemPerDomein: {}, domains: { ritmetaken: { rows: [
      { __entryId: "t1", Taak: "Openstaande acties oppakken", Agent: MA, Ritme: "dagelijks", Actief: true, "Laatst gedraaid": "2026-09-29T02:10:00" },
    ] } } },
  };
}
const nepInstantie = (catalogus = { status: 200, body: { templates: TEMPLATES } }) => vi.spyOn(globalThis, "fetch").mockImplementation(async (url, o) => {
  const pad = new URL(String(url)).pathname;
  if (pad === "/dashboard/ritmetaken/catalogus") return new Response(JSON.stringify(catalogus.body), { status: catalogus.status });
  if (pad === "/dashboard/ritmetaken/activeer") return new Response(JSON.stringify({ entry: { entryId: "t9", domein: "ritmetaken", data: { Taak: "Openstaande facturen nalopen", Actief: true } } }), { status: 200 });
  if (o && o.method === "DELETE") return new Response("{}", { status: 200 });
  return new Response(JSON.stringify({ fout: "onbekend" }), { status: 404 });
});
function open(ctx) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  g.renderVasteTaken(el, ctx);
  return el;
}

describe("f55 — beschikbaar voor jouw team", () => {
  it("toont wat nog niet aanstaat, met Zet aan en Zet weer aan", async () => {
    nepInstantie();
    const el = open(ctxMet());
    await vi.waitFor(() => expect(el.querySelector(".vt-catalogus")).not.toBeNull());
    const namen = [...el.querySelectorAll(".vt-catalogus-rij .vt-titel")].map(n => n.textContent);
    expect(namen).toEqual(["Openstaande facturen nalopen", "Stilstaande deals signaleren"]);
    expect(el.querySelector('[data-vt-zet-aan="facturen"]').textContent).toBe("Zet aan");
    expect(el.querySelector('[data-vt-zet-aan="pipeline"]').textContent).toBe("Zet weer aan");
    expect(el.querySelector('[data-vt-sleutel="facturen"]').textContent).toContain("Elke vrijdag");
  });

  it("Zet aan is één POST, werkt de lijst ter plekke bij en is ongedaan te maken", async () => {
    const fetchSpy = nepInstantie();
    const ctx = ctxMet();
    const el = open(ctx);
    await vi.waitFor(() => expect(el.querySelector('[data-vt-zet-aan="facturen"]')).not.toBeNull());
    el.querySelector('[data-vt-zet-aan="facturen"]').click();
    await vi.waitFor(() => expect(ctx.werkBij).toHaveBeenCalledWith("ritmetaken", expect.objectContaining({ entry: expect.objectContaining({ entryId: "t9" }) })));
    const post = fetchSpy.mock.calls.find(c => String(c[0]).endsWith("/dashboard/ritmetaken/activeer"));
    expect(JSON.parse(post[1].body)).toEqual({ sleutel: "facturen" });
    const melding = document.getElementById("melding");
    expect(melding.textContent).toContain("‘Openstaande facturen nalopen’ staat aan, elke vrijdag.");
    melding.querySelector("[data-melding-actie]").click();
    await vi.waitFor(() => expect(fetchSpy.mock.calls.some(c => c[1] && c[1].method === "DELETE" && String(c[0]).includes("/ritmetaken/t9"))).toBe(true));
  });

  it("de catalogus wordt één keer opgehaald, niet bij elke tekening", async () => {
    const fetchSpy = nepInstantie();
    const ctx = ctxMet();
    const el = open(ctx);
    await vi.waitFor(() => expect(el.querySelector(".vt-catalogus")).not.toBeNull());
    g.renderVasteTaken(el, ctx);
    await vi.waitFor(() => expect(el.querySelector(".vt-catalogus")).not.toBeNull());
    expect(fetchSpy.mock.calls.filter(c => String(c[0]).endsWith("/catalogus"))).toHaveLength(1);
  });

  it("kent de instantie de route nog niet: geen blok, geen fout", async () => {
    nepInstantie({ status: 404, body: { fout: "Onbekende route" } });
    const el = open(ctxMet());
    await new Promise(r => setTimeout(r, 20));
    expect(el.querySelector(".vt-catalogus")).toBeNull();
    expect(document.getElementById("melding").hidden).toBe(true);
  });

  it("op de daglink: wel zien, niet aanzetten", async () => {
    nepInstantie();
    const el = open(ctxMet({ schrijven: false }));
    await vi.waitFor(() => expect(el.querySelector(".vt-catalogus")).not.toBeNull());
    expect(el.querySelector("[data-vt-zet-aan]")).toBeNull();
    expect(el.textContent).toContain("Aanzetten kan na inloggen");
  });
});
