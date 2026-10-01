// @vitest-environment jsdom
/* f50 — Opdracht geven in drie vragen (src/opdracht.js).
 *
 * Klaar-als uit Notion: een nieuwe opdracht voor een specialist wordt bij het
 * volgende werkmoment opgepakt; staat de klaar-check rood, dan zegt het
 * formulier eerlijk dat het blijft liggen. "Opgepakt" toetsen we tegen de
 * selectie van werkronde.md stap 0: Status Open, een agent als Eigenaar, geen
 * Wachten tot in de toekomst — en Eigenaar + Agent altijd samen (b61). */
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
let RS; // Researcher
let DM; // Dealmaker
let MA; // Management Assistent
beforeAll(() => {
  stubOpslag();
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
  const naam = (slug) => g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === slug).displayName;
  RS = naam("researcher"); DM = naam("dealmaker"); MA = naam("management-assistent");
});
beforeEach(() => {
  window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne Verbeek");
  document.body.innerHTML = `<div id="melding" hidden></div>`;
  window.location.hash = "";
  vm.runInThisContext("opdrachtStaat = null");
});
afterEach(() => { vi.restoreAllMocks(); window.location.hash = ""; });

// Dinsdag 29 september 2026, 07:42.
const NU = new Date(2026, 8, 29, 7, 42);
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;
const rij = (id, velden, aangemaakt = "2026-09-28T09:00:00") => ({ __entryId: id, __stempels: { aangemaakt, bijgewerkt: aangemaakt }, ...velden });
const taak = (velden) => rij("t1", { Agent: MA, Actief: true, Ritme: "dagelijks", ...velden }, "2026-09-01T10:00:00");

function ctxMet({ acties = [], taken = [taak({ "Laatst gedraaid": "2026-09-29T02:10:00" })], schrijven = true, systeemPerDomein = {}, organisaties = [] } = {}) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU,
    bron: { oauth: schrijven, token: token(schrijven ? "dashboard:lees dashboard:schrijf" : "dashboard:lees"), instantieUrl: "https://connector.example" },
    kanSchrijven: schrijven, herlaad: vi.fn(), werkBij: vi.fn(),
    bundle: { kind: "rows", source: "werkruimte", klant: "Verbeek Advies", systeemPerDomein,
      domains: { acties: { rows: acties }, ritmetaken: { rows: taken }, organisaties: { rows: organisaties } } },
  };
}
const metSpecialisten = () => [
  rij("a", { Actie: "Prospects zoeken", Status: "Klaar", Eigenaar: RS, Agent: RS, "Afgerond door": RS }),
  rij("b", { Actie: "Lijst aanvullen", Status: "Klaar", Eigenaar: RS, Agent: RS }),
  rij("c", { Actie: "Offerte voorbereiden", Status: "Wacht op review", Eigenaar: "Sanne Verbeek", Agent: DM, "Aangemaakt door": DM }),
  rij("d", { Actie: "Factuur Smit", Status: "Open", Eigenaar: "Mark de Groot" }),
];

describe("f50 — wat er weggeschreven wordt", () => {
  const data = (o) => g.opdrachtData({ wat: "zoek tien installatiebedrijven in Utrecht\ndie groeien", uitleg: "", wie: { agent: RS }, deadline: "", hoortBij: "", ik: "Sanne Verbeek", nu: NU, ...o });

  it("een specialist: Open, Taak, Eigenaar én Agent, en jouw naam als aanmaker", () => {
    expect(data()).toEqual({
      Actie: "Zoek tien installatiebedrijven in Utrecht", Status: "Open", Type: "Taak", Prioriteit: "Normaal",
      Toelichting: "zoek tien installatiebedrijven in Utrecht\ndie groeien", Eigenaar: RS, Agent: RS, "Aangemaakt door": "Sanne Verbeek",
    });
  });

  it("…en dat is precies wat het volgende werkmoment oppakt", () => {
    const nieuw = rij("n", data(), "2026-09-29T07:43:00");
    const namen = vm.runInThisContext("agentNamen")(g.AGENTIC_TEAM_SCHEMA);
    // werkronde.md stap 0: Status Open, een agent als Eigenaar, niet wachtend.
    expect(nieuw.Status).toBe("Open");
    expect(g.isAgentNaam(nieuw.Eigenaar, namen)).toBe(true);
    expect(g.wachtInToekomst(nieuw, NU)).toBe(false);
    expect(g.baanVan(nieuw, { namen, nu: NU, ik: "Sanne Verbeek" })).toBe("team");
    // niet "aan jou", en geen "je team zette klaar": jij gaf de opdracht
    expect(g.aanJouZet({ domains: { acties: { rows: [nieuw] } } }, g.AGENTIC_TEAM_SCHEMA, { nu: NU })).toEqual([]);
    expect(g.isAgentNaam(nieuw["Aangemaakt door"], namen)).toBe(false);
  });

  it("uitleg komt onder de opdracht; zonder naam blijft Aangemaakt door leeg", () => {
    const d = data({ uitleg: "Alleen bedrijven met meer dan 20 mensen.", ik: null });
    expect(d.Toelichting).toBe("zoek tien installatiebedrijven in Utrecht\ndie groeien\n\nAlleen bedrijven met meer dan 20 mensen.");
    expect(d).not.toHaveProperty("Aangemaakt door");
  });

  it("een datum binnen twee werkdagen gaat voor (Hoog); verder weg niet", () => {
    expect(data({ deadline: "2026-09-30" })).toMatchObject({ Deadline: "2026-09-30", Prioriteit: "Hoog" });
    expect(data({ deadline: "2026-10-09" })).toMatchObject({ Deadline: "2026-10-09", Prioriteit: "Normaal" });
  });

  it("een mens: alleen Eigenaar, geen Agent; en 'hoort bij' is de organisatie", () => {
    const d = data({ wie: { mens: "Mark de Groot" }, hoortBij: "o-1", deadline: "2026-09-30" });
    expect(d).toMatchObject({ Eigenaar: "Mark de Groot", Organisatie: "o-1", Prioriteit: "Normaal" });
    expect(d).not.toHaveProperty("Agent");
  });
});

describe("f50 — wie kun je kiezen", () => {
  it("alleen specialisten die al in je team voorkomen, vaakst gezien eerst, plus de Management Assistent", () => {
    const lijst = g.beschikbareSpecialisten(ctxMet({ acties: metSpecialisten(), taken: [] }));
    expect(lijst.map(s => s.naam)).toEqual([RS, DM, MA]);
  });

  it("nooit de Coördinator, Quality Control of de Gids", () => {
    const qc = g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === "quality-control").displayName;
    const lijst = g.beschikbareSpecialisten(ctxMet({ acties: [rij("q", { Actie: "x", Status: "Klaar", "Afgerond door": qc })], taken: [] }));
    expect(lijst.map(s => s.slug)).toEqual(["management-assistent"]);
  });

  it("collega's zijn wie al eigenaar is, zonder jou en zonder agents", () => {
    expect(g.opdrachtCollegas(ctxMet({ acties: metSpecialisten() }), "Sanne Verbeek")).toEqual(["Mark de Groot"]);
  });
});

describe("f50 — de verwachting, eerlijk", () => {
  it("in orde: het volgende werkmoment, en wanneer dat laatst was", () => {
    const v = g.opdrachtVerwachting(ctxMet(), { agent: RS });
    expect(v).toMatchObject({ k: "ok" });
    expect(v.tekst).toBe(`${RS} pakt dit op bij het volgende werkmoment (laatst: vannacht 02:10). Het resultaat zie je bij Voor jou.`);
  });

  it("klaar-check rood: het blijft liggen, en zo regel je het", () => {
    const v = g.opdrachtVerwachting(ctxMet({ taken: [taak({ "Laatst gedraaid": "2026-09-24T02:10:00" })] }), { agent: RS });
    expect(v).toMatchObject({ k: "let", klaar: true });
    expect(v.tekst).toContain("Dit blijft liggen tot je team weer werkt");
  });

  it("al drie of meer opdrachten klaar: je team doet er 3 per werkmoment", () => {
    const acties = [1, 2, 3].map(i => rij("o" + i, { Actie: "x" + i, Status: "Open", Eigenaar: RS, Agent: RS }));
    expect(g.opdrachtVerwachting(ctxMet({ acties }), { agent: DM }).tekst).toContain("Er staan al 3 opdrachten klaar; je team doet er 3 per werkmoment, Hoog eerst.");
  });

  it("een mens: op wiens lijst het komt", () => {
    expect(g.opdrachtVerwachting(ctxMet(), { mens: "Sanne Verbeek" }).tekst).toBe("Het komt op je eigen lijst.");
    expect(g.opdrachtVerwachting(ctxMet(), { mens: "Mark de Groot" }).tekst).toBe("Het komt op de lijst van Mark de Groot.");
  });
});

describe("f50 — het formulier", () => {
  function open(ctx, hash = "#/opdracht") {
    const el = document.createElement("div");
    document.body.appendChild(el);
    window.location.hash = hash;
    g.renderOpdracht(el, ctx, g.opdrachtDoel(hash));
    return el;
  }

  it("drie vragen: wat, wie, wanneer — en de knop noemt de uitkomst", () => {
    const el = open(ctxMet({ acties: metSpecialisten() }));
    expect(el.querySelectorAll("fieldset legend")).toHaveLength(2);
    expect(el.querySelector("[data-opdracht-ok]").disabled).toBe(true);
    expect(el.querySelector("[data-opdracht-ok]").textContent).toBe("Kies eerst wie het oppakt");
    el.querySelector(`[data-opdracht-wie="agent:${RS}"]`).click();
    expect(el.querySelector("[data-opdracht-ok]").textContent).toBe(`Geef aan ${RS}`);
    expect(el.querySelector("[data-opdracht-verwachting]").textContent).toContain("volgende werkmoment");
    el.querySelector('[data-opdracht-wie="mens:Sanne Verbeek"]').click();
    expect(el.querySelector("[data-opdracht-ok]").textContent).toBe("Zet op mijn lijst");
  });

  it("#/opdracht/<specialist> kiest hem alvast", () => {
    const el = open(ctxMet({ acties: metSpecialisten() }), "#/opdracht/dealmaker");
    expect(el.querySelector(`[data-opdracht-wie="agent:${DM}"]`).getAttribute("aria-pressed")).toBe("true");
  });

  it("doorgeven is één POST; daarna naar Acties, met ongedaan maken", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, o) =>
      new Response(JSON.stringify({ entry: { entryId: "n-1", domein: "acties", data: JSON.parse(o.body).data } }), { status: 200 }));
    const ctx = ctxMet({ acties: metSpecialisten() });
    const el = open(ctx);
    const wat = el.querySelector("[data-opdracht-wat]");
    wat.value = "zoek tien installatiebedrijven in Utrecht die groeien";
    wat.dispatchEvent(new Event("input"));
    el.querySelector(`[data-opdracht-wie="agent:${RS}"]`).click();
    el.querySelector('[data-opdracht-datum="2026-10-02"]').click();
    el.querySelector("[data-opdracht]").dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(ctx.werkBij).toHaveBeenCalled());
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/dashboard/entries");
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toMatchObject({ domein: "acties", data: { Status: "Open", Type: "Taak", Eigenaar: RS, Agent: RS, "Aangemaakt door": "Sanne Verbeek", Deadline: "2026-10-02" } });
    expect(window.location.hash).toBe("#/acties");
    const melding = document.getElementById("melding");
    expect(melding.textContent).toContain(`Doorgegeven aan ${RS}. Die pakt het op bij het volgende werkmoment.`);
    expect(melding.querySelector("[data-melding-actie]")).not.toBeNull();
  });

  it("zonder tekst: een fout bij het veld, geen verzoek", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const el = open(ctxMet({ acties: metSpecialisten() }));
    el.querySelector(`[data-opdracht-wie="agent:${RS}"]`).click();
    el.querySelector("[data-opdracht]").dispatchEvent(new Event("submit", { cancelable: true }));
    await Promise.resolve();
    expect(el.querySelector("[data-opdracht-fout]").textContent).toBe("Schrijf eerst wat er moet gebeuren.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("het concept blijft staan als je even wegklikt", () => {
    const ctx = ctxMet({ acties: metSpecialisten() });
    let el = open(ctx);
    const wat = el.querySelector("[data-opdracht-wat]");
    wat.value = "bel De Vries";
    wat.dispatchEvent(new Event("input"));
    el = open(ctx);
    expect(el.querySelector("[data-opdracht-wat]").value).toBe("bel De Vries");
  });

  it("met de daglink: geen formulier, wel wat je kunt doen", () => {
    const el = open(ctxMet({ acties: metSpecialisten(), schrijven: false }));
    expect(el.querySelector("[data-opdracht]")).toBeNull();
    expect(el.textContent).toContain("Met je daglink kun je meekijken");
    expect(el.querySelector("[data-vt-kopieer]")).not.toBeNull();
    expect(g.opdrachtKnopHtml(ctxMet({ schrijven: false }))).toBe("");
  });

  it("acties in je eigen systeem: geen formulier, wel de zin voor je team", () => {
    const el = open(ctxMet({ acties: metSpecialisten(), systeemPerDomein: { acties: "notion" } }));
    expect(el.querySelector("[data-opdracht]")).toBeNull();
    expect(el.textContent).toContain("je eigen systeem");
  });
});

describe("f50 — waar je hem vindt", () => {
  it("op Acties, bij Voor jou, en in Gegevens vervangt hij 'Nieuw' voor acties", () => {
    const ctx = ctxMet({ acties: metSpecialisten() });
    const acties = document.createElement("div");
    g.renderActiesTab(acties, ctx);
    expect(acties.querySelector('a[href="#/opdracht"]').textContent).toContain("Opdracht geven");
    const paneel = document.createElement("section");
    paneel.innerHTML = `<div id="panel-voor-jou-body"></div>`;
    document.body.appendChild(paneel);
    g.renderVoorJou(paneel, ctx);
    expect(paneel.querySelector('a[href="#/opdracht"]')).not.toBeNull();
    const data = document.createElement("div");
    g.renderDataDomein(data, "acties", ctx);
    expect(data.querySelector('a[href="#/opdracht"]')).not.toBeNull();
    expect(data.querySelector("[data-bewerk-nieuw]")).toBeNull();
  });

  it("#/opdracht hoort bij Acties", () => {
    window.location.hash = "#/opdracht/researcher";
    expect(g.bepaalActieveView()).toEqual({ soort: "tab", tab: "opdracht" });
    const bar = document.createElement("nav");
    document.body.appendChild(bar);
    g.renderTabbar(bar, "opdracht", ctxMet({ acties: metSpecialisten() }));
    expect(bar.querySelector(".tab.actief .tab-titel").textContent).toBe("Acties");
  });
});
