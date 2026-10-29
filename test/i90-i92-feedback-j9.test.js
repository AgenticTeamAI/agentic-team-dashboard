// @vitest-environment jsdom
/* i90, i91, i92 — dashboardfeedback van J9 (oktober 2026).
 *
 * i90: de Toelichting van een actie is een logboek, met het nieuwste onderaan.
 *      Bij twee of meer gedateerde stukken kies je Oudste eerst of Nieuwste
 *      eerst; de opgeslagen tekst verandert niet.
 * i91: Klaar vraagt wat je deed (mag leeg). De tekst komt met datum en naam
 *      onderaan de Toelichting, in dezelfde PATCH als het afronden. Staat er
 *      vandaag al iets, dan rondt Klaar meteen af.
 * i92: van een klantenkaart naar een gesprek en terug: Terug brengt je naar
 *      waar je vandaan kwam, niet naar de lijst met alle gesprekken. */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { laadAlles, stubOpslag } from "./helpers/v2.js";

let g;
beforeAll(() => { stubOpslag(window); g = laadAlles(); });

const NU = new Date(2026, 8, 29, 7, 42);
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;
const rij = (id, velden, aangemaakt = "2026-09-25T09:00:00") => ({ __entryId: id, __stempels: { aangemaakt, bijgewerkt: aangemaakt }, ...velden });

function maakCtx(domeinen) {
  const domains = Object.fromEntries(Object.entries(domeinen).map(([k, rows]) => [k, { rows }]));
  const ctx = {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU, periodWeeks: 12, minutenPerActie: 25,
    bron: { oauth: true, token: token("dashboard:lees dashboard:schrijf"), instantieUrl: "https://connector.example" },
    kanSchrijven: true, herlaad: vi.fn(), bundelWaarschuwingen: [],
    bundle: { kind: "rows", source: "werkruimte", klant: "Verbeek Advies", systeemPerDomein: {}, domains, instantieDomeinen: Object.keys(domains) },
  };
  ctx.werkBij = vi.fn((key, w) => {
    const dom = ctx.bundle.domains[key];
    if (w.entry) { const nieuw = g.rijVanEntry(w.entry); const i = dom.rows.findIndex(r => r.__entryId === nieuw.__entryId); dom.rows[i] = nieuw; }
    g.V2.toon(Object.assign({}, ctx, { today: NU }));
    return true;
  });
  return ctx;
}
/* Elke PATCH geeft de rij terug zoals hij opgeslagen werd. */
function nepInstantie(ctx) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, o = {}) => {
    const m = new URL(String(url)).pathname.match(/^\/dashboard\/entries\/([^/]+)\/(.+)$/);
    if (!m || o.method !== "PATCH") return new Response(JSON.stringify({ fout: "onbekend" }), { status: 404 });
    const r = ctx.bundle.domains[m[1]].rows.find(x => x.__entryId === decodeURIComponent(m[2]));
    const data = Object.assign({}, r); delete data.__entryId; delete data.__stempels;
    for (const [k, v] of Object.entries(JSON.parse(o.body).data)) { if (v === null) delete data[k]; else data[k] = v; }
    return new Response(JSON.stringify({ entry: { entryId: r.__entryId, data, aangemaakt: r.__stempels.aangemaakt, bijgewerkt: "2026-09-29T07:43:00" } }), { status: 200, headers: { "content-type": "application/json" } });
  });
}
const patches = (spy) => spy.mock.calls.filter(c => (c[1] || {}).method === "PATCH").map(c => ({ pad: new URL(String(c[0])).pathname, data: JSON.parse(c[1].body).data }));
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const wacht = (fn) => vi.waitFor(fn, { timeout: 2000, interval: 5 });
const typ = (sel, tekst) => { const el = $(sel); el.value = tekst; el.dispatchEvent(new Event("input", { bubbles: true })); };

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div><div id="melding" hidden></div><div id="live"></div>';
  window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne Verbeek");
  window.location.hash = "";
  g.V2._reset();
});
afterEach(() => { vi.restoreAllMocks(); window.location.hash = ""; });

function open(ctx, hash = "") { window.location.hash = hash; g.V2.start({}); g.V2.toon(ctx); }
function naar(hash) { window.location.hash = hash; g.V2.hashGewijzigd(); }

describe("i90 — de Toelichting in stukken", () => {
  const LOG = "Bel Piet over de offerte.\n\n12-09: Gebeld, hij denkt erover na.\n\n20-09-2026 · Sanne Verbeek: Mail gestuurd.\n\nUpdate 26-09: Afspraak gemaakt.";

  it("gedateerde regels zijn stukken; de beschrijving ervoor blijft bovenaan", () => {
    const { intro, stukken, aflopend } = g.toelichtingStukken(LOG, NU);
    expect(intro).toBe("Bel Piet over de offerte.");
    expect(stukken.map(s => s.tekst)).toEqual(["12-09: Gebeld, hij denkt erover na.", "20-09-2026 · Sanne Verbeek: Mail gestuurd.", "Update 26-09: Afspraak gemaakt."]);
    expect(aflopend).toBe(false);
    expect(g.toelichtingInVolgorde(LOG, true, NU)).toBe("Bel Piet over de offerte.\n\nUpdate 26-09: Afspraak gemaakt.\n\n20-09-2026 · Sanne Verbeek: Mail gestuurd.\n\n12-09: Gebeld, hij denkt erover na.");
    expect(g.toelichtingInVolgorde(LOG, false, NU)).toBe(LOG);
  });

  it("een Resultaat-kop van je team is een stuk; een tijdlijn in dat resultaat blijft erbij", () => {
    const t = "## Resultaat — 2026-09-12 — Dealmaker\nTijdlijn:\n02-09-2026: eerste gesprek\n09-09-2026: offerte\n\n## Resultaat — 2026-09-20 — Dealmaker — versie 2\nKorter.";
    const { stukken } = g.toelichtingStukken(t, NU);
    expect(stukken.map(s => s.tekst.split("\n")[0])).toEqual(["## Resultaat — 2026-09-12 — Dealmaker", "## Resultaat — 2026-09-20 — Dealmaker — versie 2"]);
    expect(g.toelichtingInVolgorde(t, true, NU)).toBe("## Resultaat — 2026-09-20 — Dealmaker — versie 2\nKorter.\n\n## Resultaat — 2026-09-12 — Dealmaker\nTijdlijn:\n02-09-2026: eerste gesprek\n09-09-2026: offerte");
  });

  it("geen stuk: een aantal, een planning die nog moet komen, een datum die niet bestaat", () => {
    for (const regel of ["3-4 weken doorlooptijd", "14-11: oplevering", "12 maanden looptijd", "1.5 uur gewerkt", "31-02: niets", "dossier 12-09: niets", "12-09 gebeld"]) {
      expect(g.toelichtingStukken("Beschrijving\n" + regel, NU).stukken, regel).toEqual([]);
    }
  });

  it("al nieuwste boven opgeslagen: dat wordt herkend, en losse regels blijven losse regels", () => {
    const t = "26-09: derde\n20-09: tweede\n12-09: eerste";
    expect(g.toelichtingStukken(t, NU).aflopend).toBe(true);
    expect(g.toelichtingInVolgorde(t, true, NU)).toBe(t);
    expect(g.toelichtingInVolgorde(t, false, NU)).toBe("12-09: eerste\n20-09: tweede\n26-09: derde");
  });

  it("het itemblad: de keuze staat er bij twee of meer stukken en geldt daarna voor elk item", () => {
    const ctx = maakCtx({ acties: [
      rij("t1", { Actie: "Offerte Piet", Status: "Open", Eigenaar: "Sanne Verbeek", Toelichting: LOG }),
      rij("t2", { Actie: "Alleen uitleg", Status: "Open", Eigenaar: "Sanne Verbeek", Toelichting: "Een beschrijving zonder data." }),
      rij("t3", { Actie: "Twee versies", Status: "Open", Eigenaar: "Sanne Verbeek", Toelichting: "## Resultaat — 2026-09-20 — Dealmaker\nA\n\n## Resultaat — 2026-09-25 — Dealmaker — versie 2\nB" }),
    ] });
    open(ctx, "#/acties/t1");
    expect($('.papier [data-act="volgorde"][data-v="oud"]').getAttribute("aria-pressed")).toBe("true");
    expect($(".papier .werk").textContent).toBe(LOG);
    $('.papier [data-act="volgorde"][data-v="nieuw"]').click();
    expect($('.papier [data-act="volgorde"][data-v="nieuw"]').getAttribute("aria-pressed")).toBe("true");
    expect($(".papier .werk").textContent.split("\n\n")[1]).toBe("Update 26-09: Afspraak gemaakt.");
    naar("#/acties/t2");
    expect($('[data-act="volgorde"]')).toBeNull();
    expect($(".papier .werk").textContent).toBe("Een beschrijving zonder data.");
    naar("#/acties/t3");
    expect($('.papier [data-act="volgorde"][data-v="nieuw"]').getAttribute("aria-pressed")).toBe("true");
    expect($(".papier .werk").textContent.startsWith("## Resultaat — 2026-09-25 — Dealmaker — versie 2\nB")).toBe(true);
  });
});

describe("i91 — een afsluitnotitie bij Klaar", () => {
  const taak = (over = {}) => rij("t1", { Actie: "Factuur Smit nabellen", Status: "Open", Eigenaar: "Sanne Verbeek", Toelichting: "Bel voor vrijdag.", ...over });

  it("Klaar vraagt wat je deed; je tekst komt met datum en naam onderaan de Toelichting, in dezelfde PATCH", async () => {
    const ctx = maakCtx({ acties: [taak()] }); const spy = nepInstantie(ctx);
    open(ctx, "#/acties/t1");
    $('.beslisbalk [data-f="klaar"]').click();
    expect($("#sheet-titel").textContent).toBe("Wat heb je gedaan?");
    expect(spy).not.toHaveBeenCalled();
    typ("#sh-tekst", "Piet gebeld, hij betaalt vrijdag.");
    $('.scrim [data-act="sh-ok"]').click();
    await wacht(() => expect(patches(spy)).toHaveLength(1));
    expect(patches(spy)[0]).toEqual({ pad: "/dashboard/entries/acties/t1", data: {
      Status: "Klaar", "Afgerond op": "2026-09-29", Toelichting: "Bel voor vrijdag.\n\n29-09-2026 · Sanne Verbeek: Piet gebeld, hij betaalt vrijdag.",
    } });
    await wacht(() => expect($("[data-toast]")).not.toBeNull());
    expect($("[data-toast]").textContent).toContain("Afgerond, met je notitie.");
    // De nieuwe regel is zelf een stuk van vandaag: een tweede Klaar zou niets meer vragen.
    expect(g.toelichtingStukken(patches(spy)[0].data.Toelichting, NU).stukken.map(s => s.datum.getDate())).toEqual([29]);
    $('[data-toast] [data-act="undo"]').click();
    await wacht(() => expect(patches(spy)).toHaveLength(2));
    expect(patches(spy)[1].data).toEqual({ Status: "Open", "Afgerond op": null, Toelichting: "Bel voor vrijdag." });
    await wacht(() => expect($("[data-toast]").textContent).toContain("Ongedaan gemaakt"));
  });

  it("leeg laten is gewoon afronden, vanaf de kaart bij Voor jou net zo", async () => {
    const ctx = maakCtx({ acties: [taak({ Deadline: "2026-09-25" })] }); const spy = nepInstantie(ctx);
    open(ctx);
    $('[data-kaart="t1"] [data-f="klaar"]').click();
    expect($("#sheet-titel").textContent).toBe("Wat heb je gedaan?");
    $('.scrim [data-act="sh-ok"]').click();
    await wacht(() => expect(patches(spy)).toHaveLength(1));
    expect(patches(spy)[0].data).toEqual({ Status: "Klaar", "Afgerond op": "2026-09-29" });
    await wacht(() => expect($("[data-toast]").textContent).toContain("Afgerond."));
  });

  it("Annuleer: niets verstuurd, het item staat er nog", () => {
    const ctx = maakCtx({ acties: [taak()] }); const spy = nepInstantie(ctx);
    open(ctx, "#/acties/t1");
    $('.beslisbalk [data-f="klaar"]').click();
    $$('.scrim [data-act="sh-dicht"]').pop().click();
    expect($("#sheet-titel")).toBeNull();
    expect($("#blad-titel").textContent).toBe("Factuur Smit nabellen");
    expect(spy).not.toHaveBeenCalled();
  });

  it("staat er vandaag al iets (een regel met de datum, of een opmerking), dan rondt Klaar meteen af", async () => {
    const ctx = maakCtx({
      acties: [taak({ Toelichting: "Bel voor vrijdag.\n\n29-09: Piet gebeld." }), rij("t2", { Actie: "Contract tekenen", Status: "Open", Eigenaar: "Sanne Verbeek" })],
      notities: [rij("n1", { Onderwerp: "Getekend", Notitie: "Ligt bij Piet.", Datum: "2026-09-29", Auteur: "Sanne Verbeek", Betreft: { domein: "acties", id: "t2", titel: "Contract tekenen" } })],
    });
    const spy = nepInstantie(ctx);
    open(ctx, "#/acties/t1");
    $('.beslisbalk [data-f="klaar"]').click();
    expect($("#sheet-titel")).toBeNull();
    await wacht(() => expect(patches(spy)).toHaveLength(1));
    expect(patches(spy)[0].data).toEqual({ Status: "Klaar", "Afgerond op": "2026-09-29" });
    await wacht(() => expect($("[data-toast]")).not.toBeNull());
    naar("#/acties/t2");
    $('.beslisbalk [data-f="klaar"]').click();
    expect($("#sheet-titel")).toBeNull();
    await wacht(() => expect(patches(spy)).toHaveLength(2));
    expect(patches(spy)[1].pad).toBe("/dashboard/entries/acties/t2");
    await wacht(() => expect(ctx.werkBij).toHaveBeenCalledTimes(2));
  });

  it("de regel: datum en naam vooraan, witregels in je tekst worden één regel verder", () => {
    expect(g.afsluitRegel("  Gebeld\n\n\nofferte volgt ", { nu: NU, ik: "Sanne Verbeek" })).toBe("29-09-2026 · Sanne Verbeek: Gebeld\nofferte volgt");
    expect(g.afsluitRegel("Gebeld", { nu: NU })).toBe("29-09-2026: Gebeld");
    expect(g.afsluitRegel("   ", { nu: NU })).toBe("");
  });
});

describe("i92 — terug naar waar je vandaan kwam", () => {
  const ctxMet = () => maakCtx({
    acties: [rij("t9", { Actie: "Offerte Van Dam opvolgen", Status: "Open", Eigenaar: "Sanne Verbeek", Organisatie: { id: "o1", titel: "Van Dam Bouw" } })],
    organisaties: [rij("o1", { Naam: "Van Dam Bouw", Vestigingsplaats: "Utrecht" }), rij("o2", { Naam: "Jansen Advies" })],
    interacties: [
      rij("g1", { Onderwerp: "Kennismaking Van Dam", Datum: "2026-09-20", Organisatie: { id: "o1", titel: "Van Dam Bouw" } }),
      rij("g2", { Onderwerp: "Belletje Jansen", Datum: "2026-09-21", Organisatie: { id: "o2", titel: "Jansen Advies" } }),
    ],
  });
  const terug = () => $(".inhoud > button.link");

  it("van de klantenkaart naar een gesprek: Terug heet naar de klantenkaart en brengt je daar", () => {
    open(ctxMet(), "#/gegevens/organisaties/o1");
    $('[data-act="go"][data-r="/gegevens/interacties/g1"]').click();
    expect($("#rij-titel").textContent).toBe("Kennismaking Van Dam");
    expect(terug().dataset.r).toBe("__terug");
    expect(terug().textContent.trim()).toBe("Van Dam Bouw");
    terug().click();
    expect($("#rij-titel").textContent).toBe("Van Dam Bouw");
    expect(window.location.hash).toBe("#/gegevens/organisaties/o1");
    // Daar is de herkomst op: Terug gaat naar de lijst.
    expect(terug().dataset.r).toBe("/gegevens/organisaties");
  });

  it("direct geopend, zonder herkomst: Terug gaat naar de lijst van dat soort gegevens", () => {
    open(ctxMet(), "#/gegevens/interacties/g1");
    expect(terug().dataset.r).toBe("/gegevens/interacties");
    expect(terug().textContent.trim()).toBe("Gesprekken");
  });

  it("de terugknop van de browser loopt dezelfde geschiedenis af, vooruit ook", () => {
    open(ctxMet(), "#/gegevens/organisaties/o1");
    $('[data-act="go"][data-r="/gegevens/interacties/g1"]').click();
    naar("#/gegevens/organisaties/o1");
    expect(g.V2._S.hist).toEqual([]);
    expect(terug().dataset.r).toBe("/gegevens/organisaties");
    naar("#/gegevens/interacties/g1");
    expect(terug().textContent.trim()).toBe("Van Dam Bouw");
  });

  it("vanaf een actie (Hoort bij) naar de klantenkaart: Terug brengt je bij de actie", () => {
    open(ctxMet(), "#/acties/t9");
    $('.hoortbij [data-act="go"]').click();
    expect($("#rij-titel").textContent).toBe("Van Dam Bouw");
    expect(terug().textContent.trim()).toBe("Offerte Van Dam opvolgen");
    terug().click();
    expect(window.location.hash).toBe("#/acties/t9");
    expect($("#blad-titel").textContent).toBe("Offerte Van Dam opvolgen");
  });
});
