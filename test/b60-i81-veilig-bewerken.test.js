// @vitest-environment jsdom
/* b60 + i81 — bewerken zonder dataverlies, en bijwerken ter plekke.
 *
 * b60: het ✏️-formulier deed een PUT met wat het toonde. PUT vervangt de hele
 * rij, dus alles wat het formulier niet kon tonen verdween: de Agent (de
 * keuzelijst was leeg), de tijd achter een datum, velden die dit dashboard
 * niet kent, de regeleinden in een Toelichting. Deze tests zetten vast dat
 * alleen het verschil als PATCH gaat.
 *
 * i81: elke schrijfactie haalde daarna de hele werkruimte opnieuw op en
 * sprong naar boven. Nu vervangt het antwoord van de instantie de rij ter
 * plekke, met een meldingsregel om het ongedaan te maken. Het tweede deel
 * draait dat end-to-end op de gebouwde dashboard.html. */
import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";

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
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

function nepToken(scope, sub = "at_test#seat1") {
  const payload = btoa(JSON.stringify({ scope, sub })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `kop.${payload}.handtekening`;
}

const ACTIE = {
  Actie: "Offerte nabellen",
  Status: "Open",
  Agent: "Coördinator",
  Toelichting: "Eerste regel\nTweede regel",
  Deadline: "2026-10-02T14:00:00",
  Organisatie: { id: "org-1", titel: "Acme B.V." },
  "Veld dat het dashboard niet kent": "blijft staan",
  __entryId: "act-1",
};

function ctxMet({ werkBij } = {}) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA,
    bron: { oauth: true, token: nepToken("dashboard:lees dashboard:schrijf"), instantieUrl: "https://connector.example" },
    kanSchrijven: true,
    herlaad: vi.fn().mockResolvedValue(undefined),
    ...(werkBij ? { werkBij } : {}),
    bundle: {
      kind: "rows", source: "werkruimte", sourceLabel: "je werkruimte", systeemPerDomein: {},
      domains: { acties: { rows: [{ ...ACTIE }], herkomstLabel: "werkruimte — acties" } },
    },
  };
}

function meldingVak() {
  const vak = document.createElement("div");
  vak.id = "melding";
  vak.hidden = true;
  document.body.appendChild(vak);
  return vak;
}

function openFormulier(ctx) {
  const c = document.createElement("div");
  document.body.appendChild(c);
  g.resetDataZoek();
  g.zetDataDetail("acties", "act-1");
  g.renderDataDomein(c, "acties", ctx);
  c.querySelector('[data-detail-kaart] [data-bewerk-rij="act-1"]').click();
  return { c, form: c.querySelector("[data-bewerk-formulier]") };
}

function patchAntwoord(data) {
  return new Response(JSON.stringify({ entry: { domein: "acties", entryId: "act-1", data, aangemaakt: "x", bijgewerkt: "2026-09-30T10:00:00Z" } }), { status: 200 });
}

describe("b60 — wijzigingenVan / formulierPatch / vorigeWaarden", () => {
  it("geeft alleen wat veranderde; leeggemaakt wordt null", () => {
    expect(g.wijzigingenVan({ A: "1", B: "2", C: ["x"] }, { A: "1", B: "3" })).toEqual({ B: "3", C: null });
    expect(g.wijzigingenVan({ A: "1" }, { A: "1" })).toEqual({});
    expect(g.wijzigingenVan({}, { Nieuw: true })).toEqual({ Nieuw: true });
  });

  it("Klaar via het formulier zet Afgerond op, tenzij je hem zelf invulde (i25: Afgerond door blijft leeg)", () => {
    const domein = g.AGENTIC_TEAM_SCHEMA.datadomeinen.acties;
    const auto = g.formulierPatch(domein, { Status: "Open" }, { Status: "Klaar" });
    expect(auto.Status).toBe("Klaar");
    expect(auto["Afgerond op"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(auto["Afgerond door"]).toBeUndefined();
    const zelf = g.formulierPatch(domein, { Status: "Open" }, { Status: "Klaar", "Afgerond op": "2026-09-01" });
    expect(zelf["Afgerond op"]).toBe("2026-09-01");
  });

  it("de vorige waarden zetten precies de gewijzigde velden terug", () => {
    expect(g.vorigeWaarden({ Status: "Open", Eigenaar: "" }, { Status: "Klaar", "Afgerond op": "2026-09-30", Eigenaar: "Jan" }))
      .toEqual({ Status: "Open", "Afgerond op": null, Eigenaar: null });
  });
});

describe("b60 — het formulier toont wat er staat", () => {
  it("de Agent-lijst komt uit de registry en de opgeslagen agent staat gekozen", () => {
    const { form } = openFormulier(ctxMet());
    const agent = form.querySelector('select[name="Agent"]');
    const opties = [...agent.options].map(o => o.value).filter(Boolean);
    expect(opties).toEqual(g.agentOpties(g.AGENTIC_TEAM_SCHEMA));
    expect(opties.length).toBeGreaterThan(5);
    expect(agent.value).toBe("Coördinator");
  });

  it("een waarde buiten de keuzelijst blijft gekozen in plaats van leeg te tonen", () => {
    const html = g.veldInvoerHtml({ naam: "Status", type: "select", opties: ["Open", "Klaar"] }, "Oud label", ctxMet());
    const d = document.createElement("div");
    d.innerHTML = html;
    expect(d.querySelector("select").value).toBe("Oud label");
  });

  it("Toelichting is een tekstvak en houdt zijn regeleinden", () => {
    const { form } = openFormulier(ctxMet());
    const vak = form.querySelector('[name="Toelichting"]');
    expect(vak.tagName).toBe("TEXTAREA");
    expect(vak.value).toBe("Eerste regel\nTweede regel");
    for (const naam of ["Correctie"]) expect(form.querySelector(`[name="${naam}"]`).tagName).toBe("TEXTAREA");
  });

  it("een segmentveld (vrije tekst) is een tekstinvoer, geen lege keuzelijst", () => {
    const html = g.veldInvoerHtml({ naam: "Segment", type: "select", opties_dynamisch: "segment_options" }, "Zorg", ctxMet());
    const d = document.createElement("div");
    d.innerHTML = html;
    expect(d.querySelector("input").value).toBe("Zorg");
  });
});

describe("b60 — opslaan stuurt alleen het verschil, als PATCH", () => {
  it("één veld wijzigen = één veld in de PATCH; Agent, tijd, onbekende velden en regeleinden blijven onaangeroerd", async () => {
    const werkBij = vi.fn();
    const ctx = ctxMet({ werkBij });
    meldingVak();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(patchAntwoord({ ...ACTIE, Prioriteit: "Hoog" }));
    const { form } = openFormulier(ctx);
    form.querySelector('[name="Prioriteit"]').value = "Hoog";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(werkBij).toHaveBeenCalled());

    const [url, opties] = fetchSpy.mock.calls[0];
    expect(opties.method).toBe("PATCH");
    expect(String(url)).toBe("https://connector.example/dashboard/entries/acties/act-1");
    expect(JSON.parse(opties.body).data).toEqual({ Prioriteit: "Hoog" });
    // i81: het antwoord vervangt de rij; niet de hele werkruimte opnieuw ophalen.
    expect(werkBij.mock.calls[0][0]).toBe("acties");
    expect(werkBij.mock.calls[0][1].entry.entryId).toBe("act-1");
    expect(ctx.herlaad).not.toHaveBeenCalled();
  });

  it("een veld leegmaken stuurt null (weghalen), niet een lege string", async () => {
    const ctx = ctxMet({ werkBij: vi.fn() });
    meldingVak();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(patchAntwoord({ ...ACTIE, Agent: undefined }));
    const { form } = openFormulier(ctx);
    form.querySelector('[name="Agent"]').value = "";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).data).toEqual({ Agent: null });
  });

  it("niets gewijzigd = niets versturen", async () => {
    const vak = meldingVak();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { c, form } = openFormulier(ctxMet({ werkBij: vi.fn() }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 0));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(c.querySelector("[data-bewerk-formulier]")).toBeNull();
    expect(vak.textContent).toContain("Niets gewijzigd");
  });

  it("een weigering houdt je invoer vast en zegt wat er mis is", async () => {
    const ctx = ctxMet({ werkBij: vi.fn() });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ fout: "acties.Status: 'X' is geen geldige keuze" }), { status: 422 }));
    const { form } = openFormulier(ctx);
    form.querySelector('[name="Actie"]').value = "Nieuwe titel";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(form.querySelector("[data-bewerk-fout]").textContent).toContain("geen geldige keuze"));
    expect(form.isConnected).toBe(true);
    expect(form.querySelector('[name="Actie"]').value).toBe("Nieuwe titel");
    expect(form.querySelector('button[type="submit"]').disabled).toBe(false);
    expect(ctx.werkBij).not.toHaveBeenCalled();
  });
});

describe("i81 — snel bedienen: ter plekke, ongedaan maken, fouten in beeld", () => {
  function openKaart(ctx) {
    const c = document.createElement("div");
    document.body.appendChild(c);
    g.resetDataZoek();
    g.zetDataDetail("acties", "act-1");
    g.renderDataDomein(c, "acties", ctx);
    return c;
  }

  it("de Agent-kiezer op de kaart gebruikt dezelfde lijst als de instantie", () => {
    const c = openKaart(ctxMet());
    const opties = [...c.querySelectorAll("[data-snel-agent] option")].map(o => o.value).filter(Boolean);
    expect(opties).toEqual(g.agentOpties(g.AGENTIC_TEAM_SCHEMA));
  });

  it("een statuswissel meldt zich met 'Ongedaan maken', en dat zet precies de oude waarden terug", async () => {
    const werkBij = vi.fn();
    const vak = meldingVak();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => patchAntwoord({ ...ACTIE }));
    const c = openKaart(ctxMet({ werkBij }));
    const select = c.querySelector("[data-snel-status]");
    select.value = "Klaar";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(werkBij).toHaveBeenCalledTimes(1));

    expect(vak.hidden).toBe(false);
    expect(vak.textContent).toContain("Status is nu Klaar");
    vak.querySelector("[data-melding-actie]").click();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body).data).toEqual({ Status: "Open", "Afgerond op": null });
    await vi.waitFor(() => expect(vak.textContent).toContain("Teruggezet"));
  });

  it("mislukt het, dan staat de kiezer weer op wat er echt is opgeslagen en staat de fout ernaast", async () => {
    const vak = meldingVak();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ fout: "Je werkruimte is even niet bereikbaar." }), { status: 503 }));
    const alert = vi.spyOn(window, "alert");
    const c = openKaart(ctxMet({ werkBij: vi.fn() }));
    const select = c.querySelector("[data-snel-status]");
    select.value = "Bezig";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(c.querySelector("[data-snel-fout]").textContent).toContain("niet bereikbaar"));

    expect(c.querySelector("[data-snel-status]").value).toBe("Open");
    expect(c.querySelector("[data-snel-status]").disabled).toBe(false);
    expect(vak.querySelector("[data-melding-actie]").textContent).toBe("Opnieuw");
    expect(alert).not.toHaveBeenCalled();
  });
});

/* ── end-to-end op het gebouwde artefact ─────────────────────────────── */

const HTML = readFileSync(join(ROOT, "dashboard.html"), "utf8");
const HTML_MET_LOGIN = HTML.replace("<title>", '<meta name="at-oauth" content="1">\n<title>');
const JWT = nepToken("dashboard:lees dashboard:schrijf", "at_e2e#seat1");

async function openIngelogd() {
  const fouten = [];
  const verzoeken = [];
  const scrolls = [];
  const opslag = {
    "a-1": { Actie: "Offerte nabellen", Status: "Open", Agent: "Coördinator", Toelichting: "Regel 1\nRegel 2" },
    "a-2": { Actie: "Contract versturen", Status: "Bezig" },
  };
  const entry = (id) => ({ domein: "acties", entryId: id, data: { ...opslag[id] }, aangemaakt: "2026-09-20T09:00:00Z", bijgewerkt: "2026-09-30T09:00:00Z" });
  const dom = new JSDOM(HTML_MET_LOGIN, {
    runScripts: "dangerously",
    url: "http://localhost/dashboard.html",
    pretendToBeVisual: true,
    beforeParse(w) {
      w.console.error = (...a) => fouten.push(a.map(String).join(" "));
      w.scrollTo = (x, y) => scrolls.push(y);
      w.addEventListener("error", (e) => fouten.push("error:" + e.message));
      w.Response = Response;
      w.sessionStorage.setItem("agentic-team-dashboard:oauth", JSON.stringify({ access_token: JWT, token_type: "Bearer", refresh_token: "atr_1", scope: "dashboard:lees dashboard:schrijf" }));
      w.fetch = async (u, opties = {}) => {
        const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
        const url = new URL(String(u));
        const methode = opties.method || "GET";
        verzoeken.push(`${methode} ${url.pathname}`);
        if ((opties.headers || {}).Authorization !== "Bearer " + JWT) return json(401, { fout: "verlopen" });
        if (url.pathname === "/api/dashboard/wie-ben-ik") return json(200, { voorstel: "Sanne", gezet: true });
        if (url.hostname !== "connector.agentic-team.ai") return json(404, { fout: "Niet beschikbaar." });
        if (url.pathname === "/dashboard/overzicht") return json(200, { klant: "Testbedrijf BV", intern: false, domeinen: [{ domein: "acties", aantal: 2 }] });
        if (url.pathname === "/dashboard/entries" && methode === "GET") return json(200, { domein: "acties", entries: Object.keys(opslag).map(entry) });
        const m = url.pathname.match(/^\/dashboard\/entries\/acties\/(.+)$/);
        if (m && methode === "PATCH") {
          const id = decodeURIComponent(m[1]);
          for (const [k, v] of Object.entries(JSON.parse(opties.body).data)) {
            if (v === null) delete opslag[id][k]; else opslag[id][k] = v;
          }
          return json(200, { entry: entry(id) });
        }
        return json(404, { fout: "Onbekende route" });
      };
    },
  });
  const w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function tot(conditie, wat) {
    for (let i = 0; i < 400; i++) {
      await tick();
      if (conditie()) return;
    }
    throw new Error("timeout: " + wat);
  }
  await tot(() => w.document.getElementById("tabbar").style.display !== "none", "dashboard geladen");
  return { w, d: w.document, fouten, verzoeken, scrolls, opslag, tot };
}

describe("i81 end-to-end — de rij wordt ter plekke bijgewerkt", () => {
  it("statuswissel: één PATCH, geen herlaad, geen sprong naar boven, kaart blijft open; ongedaan maken werkt", async () => {
    const { w, d, fouten, verzoeken, scrolls, opslag, tot } = await openIngelogd();
    w.location.hash = "#/data/acties";
    await tot(() => d.querySelector('[data-open-rij="acties|a-1"]'), "acties-tabel");
    d.querySelector('[data-open-rij="acties|a-1"]').click();
    await tot(() => d.querySelector("[data-snel-status]"), "detailkaart");

    const verzoekenVoor = verzoeken.length;
    const scrollsVoor = scrolls.length;
    const select = d.querySelector("[data-snel-status]");
    select.focus();
    select.value = "Wacht";
    select.dispatchEvent(new w.Event("change", { bubbles: true }));
    await tot(() => opslag["a-1"].Status === "Wacht" && d.querySelector("[data-snel-status]") !== select, "bijgewerkt");

    expect(verzoeken.slice(verzoekenVoor)).toEqual(["PATCH /dashboard/entries/acties/a-1"]);
    expect(scrolls.slice(scrollsVoor)).not.toContain(0);
    const kaart = d.querySelector("[data-detail-kaart]");
    expect(kaart.getAttribute("data-detail-id")).toBe("a-1");
    expect(d.querySelector("[data-snel-status]").value).toBe("Wacht");
    // De bediening die je gebruikte, houdt de focus.
    expect(d.activeElement).toBe(d.querySelector("[data-snel-status]"));
    // De laadtekst van een volledige herlaad is nooit verschenen.
    expect(d.getElementById("empty-state").style.display).toBe("none");

    const melding = d.getElementById("melding");
    expect(melding.hidden).toBe(false);
    melding.querySelector("[data-melding-actie]").click();
    await tot(() => opslag["a-1"].Status === "Open" && d.querySelector("[data-snel-status]").value === "Open", "teruggezet");
    expect(verzoeken.filter(v => v.startsWith("GET /dashboard/entries")).length).toBe(1);
    expect(fouten).toEqual([]);
  });

  it("✏️-formulier: alleen het gewijzigde veld gaat mee, de rest van de rij blijft intact", async () => {
    const { w, d, fouten, verzoeken, opslag, tot } = await openIngelogd();
    w.location.hash = "#/data/acties";
    await tot(() => d.querySelector('[data-open-rij="acties|a-1"]'), "acties-tabel");
    d.querySelector('[data-open-rij="acties|a-1"]').click();
    await tot(() => d.querySelector('[data-detail-kaart] [data-bewerk-rij="a-1"]'), "detailkaart");
    d.querySelector('[data-detail-kaart] [data-bewerk-rij="a-1"]').click();
    const form = d.querySelector("[data-bewerk-formulier]");
    form.querySelector('[name="Prioriteit"]').value = "Hoog";
    form.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await tot(() => opslag["a-1"].Prioriteit === "Hoog" && !d.querySelector("[data-bewerk-formulier]"), "opgeslagen");

    expect(verzoeken.filter(v => v.startsWith("PUT"))).toEqual([]);
    expect(opslag["a-1"]).toEqual({ Actie: "Offerte nabellen", Status: "Open", Agent: "Coördinator", Toelichting: "Regel 1\nRegel 2", Prioriteit: "Hoog" });
    expect(d.querySelector("[data-detail-kaart]").textContent).toContain("Hoog");
    expect(fouten).toEqual([]);
  });
});

describe("i81 — geen wijziging, geen schrijfactie", () => {
  it("een kaart naar zijn eigen status verplaatsen stuurt niets", async () => {
    meldingVak();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const c = document.createElement("div");
    document.body.appendChild(c);
    g.resetDataZoek();
    g.zetDataDetail("acties", "act-1");
    g.renderDataDomein(c, "acties", ctxMet({ werkBij: vi.fn() }));
    const select = c.querySelector("[data-snel-status]");
    select.value = "Open";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.getElementById("melding").hidden).toBe(true);
  });

  it("valt terug op herladen als de rij niet ter plekke bij te werken is", async () => {
    const ctx = ctxMet({ werkBij: vi.fn(() => false) });
    await g.verwerkAntwoord(ctx, "acties", { entry: { entryId: "act-1", data: {} } });
    expect(ctx.herlaad).toHaveBeenCalled();
  });
});
