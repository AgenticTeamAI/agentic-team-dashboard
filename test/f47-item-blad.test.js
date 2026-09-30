// @vitest-environment jsdom
/* f47 — het item-blad met afhandelknoppen (src/item-blad.js) en wat elke knop
 * schrijft (AFHANDEL in src/voor-jou.js).
 *
 * De knoppen raken i25, de correctievrij-meting, en die mag niet scheeftrekken:
 * een mens die afrondt laat Afgerond door leeg; "nee" zet Gecorrigeerd niet
 * en telt niet als opgeleverd werk; "toch weer openen" laat de afrondsporen
 * staan, want daaraan ziet de meting dat iets heropend is. */
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
let OS; // Outreach Specialist, zoals de registry hem noemt
let RS; // Researcher
beforeAll(() => {
  stubOpslag();
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
  const agent = (slug) => g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === slug).displayName;
  OS = agent("outreach-specialist");
  RS = agent("researcher");
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; g._resetNaamvoorstel(); });

// Dinsdag 29 september 2026, 07:42.
const NU = new Date(2026, 8, 29, 7, 42);
const c = (extra) => Object.assign({ ik: "Sanne", schema: g.AGENTIC_TEAM_SCHEMA, nu: NU }, extra);
const doe = (f, rij, extra) => g.afhandelPatch(f, rij, c(extra));

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

function openBlad(ctx, id = "a1") {
  const vak = document.createElement("div");
  vak.id = "melding";
  vak.hidden = true;
  document.body.appendChild(vak);
  const el = document.createElement("div");
  document.body.appendChild(el);
  g.renderItemBlad(el, "acties", id, ctx);
  return el;
}

function nepFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opties) => {
    const body = opties.body ? JSON.parse(opties.body) : {};
    return new Response(JSON.stringify({ entry: { entryId: "a1", data: body.data || {} } }), { status: opties.method === "POST" ? 201 : 200 });
  });
}
const patchVan = (spy, i = 0) => JSON.parse(spy.mock.calls[i][1].body).data;

const CHECK = () => ({ __entryId: "a1", Actie: "Follow-upmail Jansen", Status: "Wacht op review", Eigenaar: "Sanne",
  Agent: OS, "Aangemaakt door": OS, Toelichting: "Beste Jan,\n\nDank voor het gesprek." });

describe("f47 — wat elke knop schrijft (i25)", () => {
  it("goedkeuren: Klaar met datum; Afgerond door blijft leeg of wordt gewist", () => {
    expect(doe("goedkeuren", CHECK()).patch).toEqual({ Status: "Klaar", "Afgerond op": "2026-09-29" });
    expect(doe("goedkeuren", { ...CHECK(), "Afgerond door": OS }).patch["Afgerond door"]).toBeNull();
  });

  it("terug: Open, Eigenaar én Agent, Gecorrigeerd, Correctie en een gemarkeerd citaat bovenaan", () => {
    const { patch } = doe("terug", CHECK(), { tekst: "Korter graag." });
    expect(patch).toMatchObject({ Status: "Open", Eigenaar: OS, Agent: OS, Gecorrigeerd: true, Correctie: "Korter graag." });
    expect(patch.Toelichting.startsWith("— Opmerking van Sanne (mens)")).toBe(true);
    expect(patch.Toelichting).toContain("Beste Jan,");
    // Twee keer terug: één citaat, niet een stapel.
    const tweede = doe("terug", { ...CHECK(), Toelichting: patch.Toelichting }, { tekst: "Nog korter." }).patch.Toelichting;
    expect(tweede.match(/— Opmerking van/g)).toHaveLength(1);
    expect(tweede).toContain("Nog korter.");
  });

  it("nee: Klaar met 'Niet doen: …' in Correctie, zonder Gecorrigeerd — en telt niet als opgeleverd", () => {
    const voorstel = { __entryId: "v1", Actie: "15% korting", Status: "Voorstel", Eigenaar: OS };
    const { patch } = doe("nee", voorstel, { tekst: "te duur" });
    expect(patch).toMatchObject({ Status: "Klaar", Correctie: "Niet doen: te duur" });
    expect("Gecorrigeerd" in patch).toBe(false);
    const na = { ...voorstel, ...patch };
    expect(g.isNietDoen(na)).toBe(true);
    const bundel = { domains: { acties: { rows: [na, { Status: "Klaar", Actie: "echt werk" }] } } };
    expect(g.computeZone4(bundel, NU, 28).acties.afgerond).toBe(1);
    expect(g.computeTijdwinst(bundel, 25).afgerond).toBe(1);
  });

  it("zelf aangepast: afgerond, met Gecorrigeerd en wat je aanpaste", () => {
    expect(doe("zelf", CHECK(), { tekst: "formeler" }).patch).toMatchObject({ Status: "Klaar", Gecorrigeerd: true, Correctie: "formeler" });
  });

  it("toch weer openen laat Afgerond door en Afgerond op staan (zo ziet i25 het als heropend)", () => {
    const klaar = { __entryId: "k1", Status: "Klaar", "Afgerond door": RS, "Afgerond op": "2026-09-27" };
    expect(doe("heropen", klaar).patch).toEqual({ Status: "Open", Eigenaar: "Sanne" });
  });

  it("ja: naar de specialist die het voorstelde, of op je eigen lijst als er geen is", () => {
    expect(doe("ja", { Status: "Voorstel", Eigenaar: OS }).patch).toEqual({ Status: "Open", Eigenaar: OS, Agent: OS });
    expect(doe("ja", { Status: "Voorstel", Eigenaar: "Mark" }).patch).toEqual({ Status: "Open", Eigenaar: "Sanne" });
  });

  it("later: alleen Wachten tot — en dan is het tot die dag uit je lijst", () => {
    const rij = CHECK();
    const { patch } = doe("later", rij, { datum: "2026-10-02" });
    expect(patch).toEqual({ "Wachten tot": "2026-10-02" });
    const na = { ...rij, ...patch };
    const bundel = { kind: "rows", domains: { acties: { rows: [na] } } };
    expect(g.aanJouZet(bundel, g.AGENTIC_TEAM_SCHEMA, { ik: "Sanne", nu: NU })).toHaveLength(0);
    expect(g.aanJouZet(bundel, g.AGENTIC_TEAM_SCHEMA, { ik: "Sanne", nu: new Date(2026, 9, 2, 8, 0) })).toHaveLength(1);
  });

  it("opvolgen: een subactie voor de specialist met de verbanden van het origineel, en het origineel op Klaar", () => {
    const signaal = { __entryId: "s1", Actie: "Vacature bij Smit", Status: "Open", Type: "Alert", Eigenaar: "Sanne",
      Organisatie: { id: "o1", titel: "Smit Zorggroep" } };
    const plan = g.opvolgActie(signaal, c({ tekst: "Zoek uit wie daar beslist.", specialist: RS }));
    expect(plan.data).toMatchObject({ Status: "Open", Eigenaar: RS, Agent: RS, "Bovenliggende actie": "s1",
      Organisatie: { id: "o1", titel: "Smit Zorggroep" }, Toelichting: "Zoek uit wie daar beslist." });
    expect(plan.ouder.Status).toBe("Klaar");
  });

  it("de datumkeuzes vallen nooit in het weekend en komen niet dubbel voor", () => {
    const vrijdag = new Date(2026, 9, 2, 9, 0);
    const keuzes = g.datumKeuzes(vrijdag);
    expect(keuzes[0].label).toBe("Maandag");
    const datums = keuzes.map(k => k.datum);
    expect(new Set(datums).size).toBe(datums.length);
    expect(g.datumKeuzes(NU)[0]).toEqual({ label: "Morgen", datum: "2026-09-30" });
  });
});

describe("f47 — de knoppen per soort", () => {
  const knoppen = (rij) => g.afhandelKnoppen(rij, g.AGENTIC_TEAM_SCHEMA, NU);

  it("check: goedkeuren voorop, terugsturen naar de specialist die het maakte", () => {
    const k = knoppen(CHECK());
    expect(k.hoofd.f).toBe("goedkeuren");
    expect(k.rest.map(x => x.label)).toContain(`Terug naar ${OS}`);
    expect(k.regel).toContain("verstuurt niets zelf");
  });

  it("zonder specialist valt 'terug' weg", () => {
    const k = knoppen({ Status: "Wacht op review", Eigenaar: "Sanne", Actie: "Contract lezen" });
    expect(k.rest.map(x => x.f)).not.toContain("terug");
  });

  it("voorstel, signaal, taak, team, wacht, klaar en klopt-niet hebben elk hun eigen uitkomst", () => {
    expect(knoppen({ Status: "Voorstel", Eigenaar: OS }).hoofd.label).toBe("Ja, doe maar");
    expect(knoppen({ Status: "Open", Type: "Alert", Eigenaar: "Sanne" }).hoofd.f).toBe("opvolgen");
    expect(knoppen({ Status: "Open", Eigenaar: "Sanne" }).hoofd.f).toBe("klaar");
    expect(knoppen({ Status: "Open", Eigenaar: RS }).regel).toContain("volgende werkmoment");
    expect(knoppen({ Status: "Wacht", Eigenaar: "Sanne", "Wachten tot": "2026-10-05" }).hoofd.f).toBe("nuOppakken");
    expect(knoppen({ Status: "Klaar", "Afgerond door": RS, "Afgerond op": "2026-09-27" }).regel).toContain(RS);
    expect(knoppen({ Status: "Wacht op review", Eigenaar: RS }).hoofd.f).toBe("zetBijMij");
  });
});

describe("f47 — het blad", () => {
  it("toont wat je team maakte, wie het klaarzette en de knoppen", () => {
    const el = openBlad(ctxMet([CHECK()]));
    expect(el.querySelector(".blad-titel").textContent).toBe("Follow-upmail Jansen");
    expect(el.textContent).toContain("Wat je team maakte");
    expect(el.textContent).toContain(`${OS} zette dit klaar`);
    expect(el.querySelector('[data-afhandel="goedkeuren"]')).not.toBeNull();
  });

  it("goedkeuren: één PATCH, de rij ter plekke bijgewerkt, met ongedaan maken", async () => {
    const fetchSpy = nepFetch();
    const ctx = ctxMet([CHECK()]);
    const el = openBlad(ctx);
    el.querySelector('[data-afhandel="goedkeuren"]').click();
    await vi.waitFor(() => expect(ctx.werkBij).toHaveBeenCalled());
    expect(fetchSpy.mock.calls[0][1].method).toBe("PATCH");
    expect(patchVan(fetchSpy)).toEqual({ Status: "Klaar", "Afgerond op": "2026-09-29" });
    expect(document.getElementById("melding").textContent).toContain("Ongedaan maken");
  });

  it("terug vraagt eerst wat er anders moet; leeg gaat niet door", async () => {
    window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne");
    const fetchSpy = nepFetch();
    const ctx = ctxMet([CHECK()]);
    const el = openBlad(ctx);
    el.querySelector('[data-afhandel="terug"]').click();
    const vraag = el.querySelector('[data-vraag="terug"]');
    expect(vraag).not.toBeNull();
    vraag.querySelector("[data-vraag-ok]").click();
    expect(vraag.querySelector("[data-vraag-fout]").textContent).toContain("Schrijf");
    expect(fetchSpy).not.toHaveBeenCalled();
    vraag.querySelector("[data-vraag-tekst]").value = "Korter graag.";
    vraag.querySelector("[data-vraag-ok]").click();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(patchVan(fetchSpy)).toMatchObject({ Status: "Open", Eigenaar: OS, Agent: OS, Gecorrigeerd: true, Correctie: "Korter graag." });
  });

  it("later: een dag kiezen is één tik", async () => {
    window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne");
    const fetchSpy = nepFetch();
    const el = openBlad(ctxMet([CHECK()]));
    el.querySelector('[data-afhandel="later"]').click();
    el.querySelector("[data-vraag-datum]").click();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(patchVan(fetchSpy)).toEqual({ "Wachten tot": "2026-09-30" });
  });

  it("vraagt je naam in de pagina als een knop hem nodig heeft", async () => {
    window.localStorage.removeItem("agentic-team-dashboard:naam:at_test#seat1");
    const fetchSpy = nepFetch();
    const el = openBlad(ctxMet([{ __entryId: "a1", Actie: "Raar item", Status: "Wacht op review", Eigenaar: RS }]));
    el.querySelector('[data-afhandel="zetBijMij"]').click();
    await vi.waitFor(() => expect(el.querySelector("[data-naam-invoer]")).not.toBeNull());
    expect(fetchSpy).not.toHaveBeenCalled();
    el.querySelector("[data-naam-invoer]").value = "Sanne";
    el.querySelector("[data-naam-ok]").click();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(patchVan(fetchSpy)).toEqual({ Eigenaar: "Sanne" });
  });

  it("op de daglink: meekijken, geen knoppen", () => {
    const el = openBlad(ctxMet([CHECK()], { schrijven: false }));
    expect(el.querySelector("[data-afhandel]")).toBeNull();
    expect(el.textContent).toContain("Je kijkt mee");
  });

  it("een onbekend item zegt dat eerlijk", () => {
    const el = openBlad(ctxMet([CHECK()]), "bestaat-niet");
    expect(el.textContent).toContain("er niet (meer)");
  });

  it("#/acties/<id> is een eigen adres; kale #/acties is de lijst", () => {
    window.location.hash = "#/acties/act%201";
    expect(g.bepaalActieveView()).toEqual({ soort: "item", domein: "acties", id: "act 1", tab: "acties" });
    window.location.hash = "#/acties";
    expect(g.bepaalActieveView()).toEqual({ soort: "tab", tab: "acties" });
    window.location.hash = "";
  });
});

describe("f47 — na terugsturen", () => {
  it("zie je je eigen opmerking terug, los van wat je team maakte", () => {
    const na = { ...CHECK(), ...g.afhandelPatch("terug", CHECK(), { ik: "Sanne", schema: g.AGENTIC_TEAM_SCHEMA, nu: NU, tekst: "Korter graag." }) .patch };
    const el = openBlad(ctxMet([na]));
    expect(el.querySelector(".blad-citaat").textContent).toContain("Korter graag.");
    expect(el.querySelector("[data-werk]").textContent).not.toContain("Opmerking van");
  });
});
