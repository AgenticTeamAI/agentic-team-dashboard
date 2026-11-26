// @vitest-environment jsdom
/* f62 — de dagstart is voor wie hem vraagt.
 *
 * Wat hier vastligt (besluit Tijmen 26-11-2026):
 *  - het dagplan (domein dagplannen, contract v1) is onbetrouwbare invoer:
 *    saneerDagplan houdt alleen bekende velden over, begrensd en getypeerd;
 *  - het dashboard kiest het plan van wie ingelogd is (jij()), nooit dat van
 *    een collega; met een daglink alleen "Log in om je eigen dag te zien";
 *  - de kaart "Jouw dag" escapet elke tekst;
 *  - op de Notion-route is de werkbak die uit jouw dagplan van vandaag (zelfde
 *    nummers als in de chat), anders het voor_jou-blok van metrics;
 *  - de eigenaarsketen: actie > project > deal > organisatie (ook via de
 *    contactpersoon) > verantwoordelijke van de agent > onverdeeld;
 *  - de feed toont de actie ("Dagstart van Tijmen"), en het verhaal telt een
 *    dagstart niet als werk van je team;
 *  - de loader leest alleen de metrics-entry "metrics" en haalt dagplannen op
 *    via fetchWerkruimte als de instantie het domein kent. */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { laadAlles, stubOpslag } from "./helpers/v2.js";

let g; let DM; let OS; let RS;
beforeAll(() => {
  stubOpslag(window);
  g = laadAlles();
  const naam = (slug) => g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === slug).displayName;
  DM = naam("dealmaker"); OS = naam("outreach-specialist"); RS = naam("researcher");
});

const NU = new Date(2026, 10, 26, 8, 40);
const VANDAAG = "2026-11-26";
const XSS = '"><img src=x onerror="window.__lek=1"><script>window.__lek=2</script>';
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;
const rij = (id, velden, aangemaakt = "2026-11-25T09:00:00") => ({ __entryId: id, __stempels: { aangemaakt, bijgewerkt: aangemaakt }, ...velden });
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function plan(over = {}) {
  return {
    versie: 1, type: "dagplan", datum: VANDAAG, gegenereerd_op: "2026-11-26T08:12:00+01:00", voor: "Sanne Verbeek",
    context: "Drukke dag: twee klantgesprekken.",
    acuut: [{ titel: "Offerte Van Dam vandaag de deur uit", toelichting: "Klant wacht sinds maandag." }],
    agenda: [{ start: "13:00", eind: "14:00", titel: "Gesprek De Vries" }, { start: "09:30", eind: null, titel: "Bezet" }],
    agents_vandaag: [{ agent: "dealmaker", taak: "Offerte Van Dam afmaken" }, { agent: "bestaat-niet", taak: "x" }],
    later: [{ titel: "Kwartaalcijfers doorlopen" }],
    ter_goedkeuring: { totaal: 2, items: [
      { nr: 1, titel: "Offerte Van Dam", soort: "check", te_laat: true, specialist: DM, sinds: "2026-11-24", deadline: "2026-11-26", url: "https://www.notion.so/a" },
      { nr: 2, titel: "Korting De Vries?", soort: "voorstel", te_laat: false, specialist: null, sinds: null, deadline: null, url: null },
    ] },
    collegas: [{ naam: "Mark de Groot", wachtend: 3 }],
    onverdeeld: 1,
    samen: [{ titel: "Planning december", met: ["Mark de Groot"] }],
    ...over,
  };
}
const entry = (persoon, p, extra = {}) => ({
  entryId: g.dagplanEntryId(persoon), aangemaakt: "2026-11-26T07:12:00Z", bijgewerkt: "2026-11-26T07:12:00Z",
  data: { Titel: `Dagplan ${persoon} ${p.datum}`, Persoon: persoon, Datum: p.datum, Inhoud: JSON.stringify(p) }, ...extra,
});

function maakCtx({ schrijven = true, acties = null, dagplannen = null, notion = false, metricsWerk = null, teamfeed = null } = {}) {
  const domains = notion ? {} : { acties: { rows: acties || [
    rij("a1", { Actie: "Offerte Van Dam", Status: "Wacht op review", Eigenaar: "Sanne Verbeek", Agent: DM, "Aangemaakt door": DM }, "2026-11-26T02:18:00"),
  ] } };
  const bundle = notion
    ? { kind: "metrics", source: "werkruimte", klant: "FFG", systeemPerDomein: { acties: "notion", ritmetaken: "notion" }, domains, instantieDomeinen: [] }
    : { kind: "rows", source: "werkruimte", klant: "Verbeek Advies", systeemPerDomein: {}, domains, instantieDomeinen: Object.keys(domains) };
  bundle.dagplannen = dagplannen ? { entries: dagplannen } : null;
  bundle.teamfeed = teamfeed ? { entries: teamfeed } : null;
  return {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU, periodWeeks: 12, minutenPerActie: 25,
    bron: { oauth: schrijven, token: token(schrijven ? "dashboard:lees dashboard:schrijf" : "dashboard:lees"), instantieUrl: "https://connector.example" },
    kanSchrijven: schrijven, herlaad: vi.fn(), werkBij: vi.fn(), bundelWaarschuwingen: [], bundle,
    ...(metricsWerk ? { metricsWerk } : {}),
  };
}
function open(ctx, hash = "") { window.location.hash = hash; g.V2.start({}); g.V2.toon(ctx); }

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div><div id="melding" hidden></div><div id="live"></div>';
  window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne Verbeek");
  window.location.hash = "";
  delete window.__lek;
  g.V2._reset();
});
afterEach(() => { vi.restoreAllMocks(); window.location.hash = ""; });

/* ── saneerDagplan ─────────────────────────────────────────────────── */
describe("f62 — saneerDagplan: alleen het contract, begrensd, nooit een fout", () => {
  it("een geldig plan komt er compleet en in vorm uit", () => {
    const p = g.saneerDagplan(JSON.stringify(plan()), g.AGENTIC_TEAM_SCHEMA);
    expect(p.versie).toBe(1); expect(p.type).toBe("dagplan"); expect(p.datum).toBe(VANDAAG);
    expect(p.voor).toBe("Sanne Verbeek");
    expect(p.agenda.map(a => a.start)).toEqual(["09:30", "13:00"]); // op tijd gesorteerd
    expect(p.agents_vandaag).toEqual([{ agent: "dealmaker", taak: "Offerte Van Dam afmaken" }]); // onbekende agent valt weg
    expect(p.ter_goedkeuring.totaal).toBe(2);
    expect(p.ter_goedkeuring.items[0]).toEqual({ nr: 1, titel: "Offerte Van Dam", soort: "check", te_laat: true, specialist: DM, sinds: "2026-11-24", deadline: "2026-11-26", url: "https://www.notion.so/a" });
    expect(p.collegas).toEqual([{ naam: "Mark de Groot", wachtend: 3 }]);
    expect(p.onverdeeld).toBe(1);
  });

  it("onbekende velden vallen weg, ook in de items", () => {
    const p = g.saneerDagplan(plan({ geheim: "x", acuut: [{ titel: "A", link: "https://x", __proto__: { boos: 1 } }],
      agenda: [{ start: "10:00", titel: "Overleg", url: "https://meet.example/abc", deelnemers: ["a@b.nl"], beschrijving: "inbelcode 123" }] }), g.AGENTIC_TEAM_SCHEMA);
    expect(p).not.toHaveProperty("geheim");
    expect(Object.keys(p.acuut[0])).toEqual(["titel", "toelichting"]);
    expect(p.agenda[0]).toEqual({ start: "10:00", eind: null, titel: "Overleg" });
    expect(JSON.stringify(p)).not.toMatch(/meet\.example|a@b\.nl|inbelcode/);
  });

  it("lengtes, aantallen, getallen, datums, tijden en urls worden afgedwongen", () => {
    const lang = "x".repeat(1000);
    const p = g.saneerDagplan(plan({
      voor: lang, context: lang,
      acuut: Array.from({ length: 12 }, (_, i) => ({ titel: lang + i, toelichting: lang })),
      agenda: [{ start: "25:00", titel: "kapot" }, { start: "9:05", eind: "24:00", titel: "" }, { start: "nu", titel: "weg" }],
      later: Array.from({ length: 30 }, () => ({ titel: "later" })),
      collegas: [{ naam: "Mark", wachtend: "4" }, { naam: "Piet", wachtend: -3 }, { naam: "Kees", wachtend: "veel" }, { naam: "", wachtend: 9 }],
      onverdeeld: "2,4", datum: "2026-02-30", gegenereerd_op: "gisteren",
      ter_goedkeuring: { totaal: "1", items: [
        { nr: "7", titel: "A", soort: "CHECK", url: "javascript:alert(1)" },
        { nr: 5000, titel: "B", soort: "taak", url: "http://onveilig.example" },
        { nr: 3, titel: "C", soort: "onbekend" },
        { nr: 4, titel: "", soort: "taak" },
      ] },
      samen: Array.from({ length: 9 }, () => ({ titel: "s", met: Array.from({ length: 30 }, () => "y".repeat(90)) })),
    }), g.AGENTIC_TEAM_SCHEMA);
    expect(p.voor.length).toBe(80); expect(p.context.length).toBe(200);
    expect(p.acuut).toHaveLength(10); expect(p.acuut[0].titel.length).toBe(120); expect(p.acuut[0].toelichting.length).toBe(300);
    expect(p.agenda).toEqual([{ start: "09:05", eind: null, titel: "Bezet" }]);
    expect(p.later).toHaveLength(10);
    expect(p.collegas).toEqual([{ naam: "Mark", wachtend: 4 }, { naam: "Piet", wachtend: 0 }, { naam: "Kees", wachtend: 0 }]);
    expect(p.onverdeeld).toBe(2);
    expect(p.datum).toBeNull(); expect(p.gegenereerd_op).toBeNull();
    expect(p.ter_goedkeuring.items.map(i => [i.nr, i.titel, i.soort, i.url])).toEqual([[7, "A", "check", null], [2, "B", "taak", null]]);
    expect(p.ter_goedkeuring.totaal).toBe(2); // nooit minder dan de items
    expect(p.samen).toHaveLength(5); expect(p.samen[0].met).toHaveLength(10); expect(p.samen[0].met[0].length).toBe(80);
  });

  it("geen dagplan v1, te groot of onzin: null, zonder uitzondering", () => {
    for (const raw of [undefined, null, 1, "", "{kapot", "[]", "null", JSON.stringify({ versie: 2, type: "dagplan" }),
      JSON.stringify({ versie: 1, type: "dashboard_metrics" }), JSON.stringify({ versie: 1 }), "x".repeat(70000),
      JSON.stringify(plan({ context: "x".repeat(70000) }))]) {
      expect(() => g.saneerDagplan(raw, g.AGENTIC_TEAM_SCHEMA)).not.toThrow();
      expect(g.saneerDagplan(raw, g.AGENTIC_TEAM_SCHEMA)).toBeNull();
    }
    // verkeerde types in de lijsten: lege lijsten, geen fout
    const p = g.saneerDagplan({ versie: 1, type: "dagplan", acuut: "x", agenda: {}, agents_vandaag: [null, 3, "dealmaker"], ter_goedkeuring: [], collegas: [[]], samen: [{ titel: "s", met: "Mark" }] }, g.AGENTIC_TEAM_SCHEMA);
    expect(p.acuut).toEqual([]); expect(p.agenda).toEqual([]); expect(p.agents_vandaag).toEqual([]);
    expect(p.ter_goedkeuring).toEqual({ totaal: 0, items: [] }); expect(p.collegas).toEqual([]);
    expect(p.samen).toEqual([{ titel: "s", met: [] }]);
    expect(p.voor).toBe(""); expect(p.context).toBeNull(); expect(p.onverdeeld).toBe(0);
  });

  it("stuurtekens worden spaties; tekst blijft tekst", () => {
    const p = g.saneerDagplan(plan({ acuut: [{ titel: "regel\n\u0000twee drie" }] }), g.AGENTIC_TEAM_SCHEMA);
    expect(p.acuut[0].titel).toBe("regel twee drie");
  });

  it("entry_id volgens de afspraak", () => {
    expect(g.dagplanEntryId("Tijmen")).toBe("dagplan-tijmen");
    expect(g.dagplanEntryId("José van Dijk")).toBe("dagplan-jose-van-dijk");
    expect(g.dagplanEntryId("  Ångström & Zoon!  ")).toBe("dagplan-angstrom-zoon");
    expect(g.dagplanEntryId("a".repeat(60))).toBe("dagplan-" + "a".repeat(40));
    expect(g.dagplanEntryId("!!!")).toBeNull();
  });
});

/* ── het plan van de kijker ─────────────────────────────────────────── */
describe("f62 — kiesDagplan: alleen het jouwe", () => {
  const plannen = (lijst) => g.dagplannenUitEntries(lijst, g.AGENTIC_TEAM_SCHEMA);
  it("dezelfde naam (hoofdletters en accenten tellen niet), nooit die van een collega", () => {
    const l = plannen([entry("Mark de Groot", plan({ voor: "Mark de Groot" })), entry("José Verbeek", plan({ voor: "José Verbeek" }))]);
    expect(g.kiesDagplan(l, "jose  verbeek", VANDAAG).persoon).toBe("José Verbeek");
    expect(g.kiesDagplan(l, "Sanne Verbeek", VANDAAG)).toBeNull();
    expect(g.kiesDagplan(l, "", VANDAAG)).toBeNull();
    expect(g.kiesDagplan(l, undefined, VANDAAG)).toBeNull();
  });
  it("een unieke voornaam telt, als één kant alleen een voornaam is", () => {
    const l = plannen([entry("Tijmen", plan({ voor: "Tijmen" })), entry("Mark de Groot", plan({ voor: "Mark de Groot" }))]);
    expect(g.kiesDagplan(l, "Tijmen Kip", VANDAAG).persoon).toBe("Tijmen");
    expect(g.kiesDagplan(l, "Mark", VANDAAG).persoon).toBe("Mark de Groot");
    // twee verschillende volle namen met dezelfde voornaam: geen gok
    expect(g.kiesDagplan(plannen([entry("Mark de Groot", plan({ voor: "Mark de Groot" }))]), "Mark Jansen", VANDAAG)).toBeNull();
    // twee mensen die op "Mark" passen: niet uniek, dus niets
    expect(g.kiesDagplan(plannen([entry("Mark de Groot", plan({ voor: "Mark de Groot" })), entry("Mark Jansen", plan({ voor: "Mark Jansen" }))]), "Mark", VANDAAG)).toBeNull();
  });
  it("het plan van vandaag wint; anders het nieuwste, gemarkeerd als niet van vandaag", () => {
    const oud = entry("Sanne Verbeek", plan({ datum: "2026-11-24" }), { entryId: "dagplan-oud" });
    const nieuw = entry("Sanne Verbeek", plan({ datum: "2026-11-25" }), { entryId: "dagplan-nieuw" });
    const vandaag = entry("Sanne Verbeek", plan());
    expect(g.kiesDagplan(plannen([oud, vandaag, nieuw]), "Sanne Verbeek", VANDAAG)).toMatchObject({ datum: VANDAAG, vandaag: true });
    expect(g.kiesDagplan(plannen([oud, nieuw]), "Sanne Verbeek", VANDAAG)).toMatchObject({ entryId: "dagplan-nieuw", vandaag: false });
  });
  it("een entry zonder leesbaar plan valt weg", () => {
    const kapot = { entryId: "dagplan-sanne", data: { Persoon: "Sanne Verbeek", Inhoud: "{geen json" } };
    expect(plannen([kapot, null, { data: null }])).toEqual([]);
  });
});

/* ── de kaart Jouw dag ──────────────────────────────────────────────── */
describe("f62 — Jouw dag op Voor jou", () => {
  it("ingelogd: de kaart staat bovenaan met elke sectie, en de stand van vandaag", () => {
    open(maakCtx({ dagplannen: [entry("Sanne Verbeek", plan()), entry("Mark de Groot", plan({ voor: "Mark de Groot", acuut: [{ titel: "Geheim van Mark" }] }))] }));
    const kaart = $("[data-jouwdag]");
    expect(kaart).not.toBeNull();
    expect($(".inhoud .kol").firstElementChild === kaart || $(".inhoud").children[0] === kaart).toBe(true);
    expect(kaart.querySelector("h2").textContent).toBe("Jouw dag");
    expect(kaart.querySelector("[data-jouwdag-stand]").textContent).toBe("stand van je dagstart 08:12");
    const koppen = [...kaart.querySelectorAll(".jd-sectie h3")].map(h => h.textContent);
    expect(koppen).toEqual(["Vandaag acuut", "Agenda", "Je agents vandaag", "Ter goedkeuring", "Bij collega’s", "Samen afstemmen", "Later deze week"]);
    expect(kaart.textContent).toContain("Offerte Van Dam vandaag de deur uit");
    expect(kaart.textContent).toContain("3bij Mark");
    expect(kaart.textContent).toContain("onverdeeld");
    expect(kaart.textContent).not.toContain("Geheim van Mark");
    const bezet = [...kaart.querySelectorAll(".post")].find(p => p.textContent.includes("Bezet"));
    expect(bezet.querySelector(".t").textContent).toBe("09:30");
    expect(bezet.querySelector("p").classList.contains("stil")).toBe(true);
    // de sprong naar de werkbak
    kaart.querySelector('[data-act="naar-werkbak"]').click();
    expect($("#werkbak")).not.toBeNull();
  });

  it("lege secties staan er niet; een plan van eerder zegt van wanneer", () => {
    open(maakCtx({ dagplannen: [entry("Sanne Verbeek", plan({ datum: "2026-11-24", acuut: [], agenda: [], agents_vandaag: [], later: [], collegas: [], onverdeeld: 0, samen: [], ter_goedkeuring: { totaal: 0, items: [] } }))] }));
    const kaart = $("[data-jouwdag]");
    expect(kaart.querySelectorAll(".jd-sectie")).toHaveLength(0);
    const stand = kaart.querySelector("[data-jouwdag-stand]");
    expect(stand.textContent).toBe("van di 24 nov");
    expect(stand.classList.contains("stil")).toBe(true);
  });

  it("geen plan van jou: geen kaart", () => {
    open(maakCtx({ dagplannen: [entry("Mark de Groot", plan({ voor: "Mark de Groot" }))] }));
    expect($("[data-jouwdag]")).toBeNull();
    expect($("[data-jouwdag-login]")).toBeNull();
  });

  it("met een daglink: geen kaart, wel de vraag om in te loggen", () => {
    open(maakCtx({ schrijven: false, dagplannen: [entry("Sanne Verbeek", plan())] }));
    expect($("[data-jouwdag]")).toBeNull();
    expect($("[data-jouwdag-login]").textContent).toBe("Log in om je eigen dag te zien.");
    expect($("#root").textContent).not.toContain("Offerte Van Dam vandaag");
  });

  it("vijandige tekst in elk veld blijft tekst", () => {
    const boos = plan({
      voor: "Sanne Verbeek", context: XSS,
      acuut: [{ titel: XSS, toelichting: XSS }], agenda: [{ start: "10:00", eind: "11:00", titel: XSS }],
      agents_vandaag: [{ agent: "dealmaker", taak: XSS }], later: [{ titel: XSS }],
      ter_goedkeuring: { totaal: 1, items: [{ nr: 1, titel: XSS, soort: "check", te_laat: true, specialist: XSS, sinds: XSS, deadline: XSS, url: "javascript:window.__lek=3" }] },
      collegas: [{ naam: XSS, wachtend: XSS }], onverdeeld: XSS, samen: [{ titel: XSS, met: [XSS] }],
    });
    open(maakCtx({ dagplannen: [entry("Sanne Verbeek", boos)] }));
    const kaart = $("[data-jouwdag]");
    expect(kaart.querySelectorAll("img, script")).toHaveLength(0);
    expect(kaart.textContent).toContain('"><img src=x');
    // Notion-route: de werkbak uit hetzelfde plan
    open(maakCtx({ notion: true, dagplannen: [entry("Sanne Verbeek", boos)], metricsWerk: { voorJou: null, ritmetaken: null, gegenereerdOp: null } }));
    expect($$("#root img, #root script")).toHaveLength(0);
    expect($('#root a[href^="javascript"]')).toBeNull();
    expect(window.__lek).toBeUndefined();
  });
});

/* ── Notion: de werkbak uit je dagplan ──────────────────────────────── */
describe("f62 — Notion-route: de werkbak volgens jouw dagstart", () => {
  const licentieBreed = { voorJou: [{ nr: 1, titel: "Iets van iedereen", soort: "taak", te_laat: false, specialist: null, sinds: null, deadline: null, url: null }], ritmetaken: null, gegenereerdOp: "2026-11-26T07:02:00" };
  it("jouw plan van vandaag heeft items: die, met de nummers uit de chat, en de badge telt mee", () => {
    open(maakCtx({ notion: true, dagplannen: [entry("Sanne Verbeek", plan())], metricsWerk: licentieBreed }));
    expect($$(".item .nr").map(n => n.textContent)).toEqual(["1", "2"]);
    expect($("#root").textContent).toContain("Volgens je dagstart 2");
    expect($("#root").textContent).not.toContain("Iets van iedereen");
    expect($(".tabbalk .badge").textContent).toBe("2");
    expect($('.item a[href="https://www.notion.so/a"]')).not.toBeNull();
  });
  it("geen plan van vandaag, of zonder items: terug naar het voor_jou-blok van metrics", () => {
    open(maakCtx({ notion: true, dagplannen: [entry("Sanne Verbeek", plan({ datum: "2026-11-25" }))], metricsWerk: licentieBreed }));
    expect($("#root").textContent).toContain("Iets van iedereen");
    expect($(".tabbalk .badge").textContent).toBe("1");
    open(maakCtx({ notion: true, dagplannen: [entry("Sanne Verbeek", plan({ ter_goedkeuring: { totaal: 0, items: [] } }))], metricsWerk: licentieBreed }));
    expect($("#root").textContent).toContain("Iets van iedereen");
    // de kaart staat er wel
    expect($("[data-jouwdag]")).not.toBeNull();
  });
  it("met een daglink: altijd het metrics-blok", () => {
    open(maakCtx({ schrijven: false, notion: true, dagplannen: [entry("Sanne Verbeek", plan())], metricsWerk: licentieBreed }));
    expect($("#root").textContent).toContain("Iets van iedereen");
    expect($("[data-jouwdag-login]")).not.toBeNull();
  });
});

/* ── de eigenaarsketen ──────────────────────────────────────────────── */
describe("f62 — eigenaarVan: de eerste treffer wint", () => {
  const namen = () => g.agentNamen(g.AGENTIC_TEAM_SCHEMA);
  const bundel = (domains) => ({ kind: "rows", domains: Object.fromEntries(Object.entries(domains).map(([k, rows]) => [k, { rows }])) });
  const B = () => bundel({
    projecten: [rij("p1", { Naam: "Project X", Eigenaar: ["Tijmen"] }), rij("p0", { Naam: "Leeg", Eigenaar: [] })],
    sales_funnel: [rij("d1", { Naam: "Deal Y", Eigenaar: "Yoram, Tijmen" })],
    organisaties: [rij("o1", { Naam: "Acme", Eigenaar: "Yoram" }), rij("o2", { Naam: "Beta", Eigenaar: "[afgeschermd]" })],
    contactpersonen: [rij("c1", { Naam: "Piet", Organisatie: { id: "o1", titel: "Acme" } })],
  });
  const ctx = (extra) => Object.assign({ namen: namen(), bundle: B() }, extra);
  const actie = (velden) => ({ Actie: "x", Status: "Open", ...velden });

  it("1. een mens als Eigenaar van de actie", () => {
    expect(g.eigenaarVan(actie({ Eigenaar: "Mark", Project: { id: "p1" } }), ctx())).toBe("Mark");
  });
  it("2. anders de eigenaar van het project (ook na een agent als Eigenaar)", () => {
    expect(g.eigenaarVan(actie({ Project: { id: "p1", titel: "Project X" }, Deal: { id: "d1" } }), ctx())).toBe("Tijmen");
    expect(g.eigenaarVan(actie({ Eigenaar: DM, Status: "Voorstel", Project: { id: "p1" } }), ctx())).toBe("Tijmen");
  });
  it("3. dan de deal (mensen als tekst met komma's)", () => {
    expect(g.eigenaarVan(actie({ Project: { id: "p0" }, Deal: [{ id: "d1", titel: "Deal Y" }] }), ctx())).toBe("Yoram, Tijmen");
    expect(g.isEigenaar("Yoram, Tijmen", "tijmen")).toBe(true);
    expect(g.isEigenaar("Yoram, Tijmen", "Mark")).toBe(false);
  });
  it("4. dan de organisatie, direct of via de contactpersoon", () => {
    expect(g.eigenaarVan(actie({ Organisatie: { id: "o1" } }), ctx())).toBe("Yoram");
    expect(g.eigenaarVan(actie({ Contactpersoon: { id: "c1", titel: "Piet" } }), ctx())).toBe("Yoram");
  });
  it("5. dan wie verantwoordelijk is voor de agent — alleen als een bron het zegt", () => {
    const a = actie({ Agent: OS });
    expect(g.eigenaarVan(a, ctx())).toBe("");
    expect(g.eigenaarVan(a, ctx({ agentMens: (ag) => (ag === OS ? "Tijmen" : "") }))).toBe("Tijmen");
  });
  it("6. anders niemand; afgeschermd en losse tekst tellen niet", () => {
    expect(g.eigenaarVan(actie({ Organisatie: "[afgeschermd]", Project: "Project X" }), ctx())).toBe("");
    expect(g.eigenaarVan(actie({ Organisatie: { id: "o2" } }), ctx())).toBe("");
    expect(g.eigenaarVan(actie({ Eigenaar: "[afgeschermd]" }), ctx())).toBe("");
    expect(g.eigenaarVan(actie({ Project: { id: "bestaat-niet" } }), ctx())).toBe("");
    expect(g.eigenaarVan(actie({ Eigenaar: RS }), ctx())).toBe("");
  });

  it("vanMij, bijCollegas en de banen rekenen met de keten; een agent blijft 'je team'", () => {
    const acties = [
      rij("k1", { Actie: "Bij Tijmens project", Status: "Wacht op review", "Aangemaakt door": DM, Project: { id: "p1" } }),
      rij("k2", { Actie: "Bij Yorams organisatie", Status: "Wacht op review", "Aangemaakt door": DM, Organisatie: { id: "o1" } }),
      rij("k3", { Actie: "Voorstel bij Yoram", Status: "Voorstel", Eigenaar: DM, Organisatie: { id: "o1" } }),
      rij("k4", { Actie: "Onverdeeld", Status: "Wacht op review", "Aangemaakt door": DM }),
      rij("k5", { Actie: "Team aan zet", Status: "Open", Eigenaar: RS, Project: { id: "p1" } }),
    ];
    const b = B(); b.domains.acties = { rows: acties };
    const ids = (l) => l.map(r => r.__entryId).sort();
    expect(ids(g.aanJouZet(b, g.AGENTIC_TEAM_SCHEMA, { ik: "Tijmen", nu: NU }))).toEqual(["k1", "k4"]);
    expect(ids(g.aanJouZet(b, g.AGENTIC_TEAM_SCHEMA, { ik: "Yoram", nu: NU }))).toEqual(["k2", "k3", "k4"]);
    expect(ids(g.bijCollegas(b, g.AGENTIC_TEAM_SCHEMA, { ik: "Tijmen", nu: NU }))).toEqual(["k2", "k3"]);
    const banen = g.banenVan(b, g.AGENTIC_TEAM_SCHEMA, { ik: "Tijmen", nu: NU });
    expect(ids(banen.jij)).toEqual(["k1", "k4"]);
    expect(ids(banen.collega)).toEqual(["k2", "k3"]);
    expect(ids(banen.team)).toEqual(["k5"]);
    // zonder ik: niets verstoppen (zelfde regel als altijd)
    expect(ids(g.aanJouZet(b, g.AGENTIC_TEAM_SCHEMA, { nu: NU }))).toEqual(["k1", "k2", "k3", "k4"]);
    // de soort verandert niet door de keten
    expect(g.soortVan(acties[4], namen(), NU)).toBe("team");
  });

  it("zonder keten (oude aanroep) gedraagt vanMij zich als vroeger", () => {
    const n = namen();
    expect(g.vanMij({ Eigenaar: "Sanne Verbeek", Status: "Open" }, "Sanne Verbeek", n)).toBe(true);
    expect(g.vanMij({ Eigenaar: "Mark", Status: "Open" }, "Sanne Verbeek", n)).toBe(false);
    expect(g.vanMij({ Eigenaar: DM, Status: "Voorstel" }, "Sanne Verbeek", n)).toBe(true);
    expect(g.vanMij({ Eigenaar: DM, Status: "Open" }, undefined, n)).toBe(false);
    expect(g.vanMij({ Status: "Open" }, "Sanne Verbeek", n)).toBe(true);
  });

  it("op Voor jou staat een collega-item onder de naam uit de keten", () => {
    const ctx = maakCtx({ acties: [
      rij("a1", { Actie: "Van mij", Status: "Wacht op review", Eigenaar: "Sanne Verbeek", Agent: DM, "Aangemaakt door": DM }),
      rij("a2", { Actie: "Bij Mark", Status: "Open", Organisatie: { id: "o9", titel: "Acme" } }),
    ] });
    ctx.bundle.domains.organisaties = { rows: [rij("o9", { Naam: "Acme", Eigenaar: ["Mark de Groot"] })] };
    open(ctx);
    expect($("#root").textContent).toContain("1 bij Mark");
  });
});

/* ── de feed ───────────────────────────────────────────────────────── */
describe("f62 — de feed: 'Dagstart van …' in beeld, maar geen werk van je team", () => {
  const post = (id, tijd, data) => ({ entryId: id, aangemaakt: tijd, bijgewerkt: tijd, data });
  const feed = () => [
    post("f1", "2026-11-26T08:15:00", { Soort: "afgerond", Agent: "orchestrator", Actie: "Dagstart van Sanne", Bericht: "Dagstart van Sanne Verbeek afgerond: 3 prioriteiten, 2 ter goedkeuring." }),
    post("f2", "2026-11-26T08:20:00", { Soort: "afgerond", Agent: "orchestrator", Actie: "Dagstart van Mark", Bericht: "Dagstart van Mark de Groot afgerond: 1 prioriteiten, 0 ter goedkeuring." }),
  ];
  it("de actie staat vet als eerste regel van de post", () => {
    const ctx = maakCtx({ teamfeed: feed() });
    open(ctx, "#/team");
    const posts = $$(".post");
    expect(posts.length).toBe(2);
    expect(posts.map(p => p.querySelector(".post-actie b").textContent)).toEqual(["Dagstart van Mark", "Dagstart van Sanne"]);
  });
  it("het verhaal telt de dagstart niet als werk van je team", () => {
    // Zonder acties: alles wat het verhaal noemt, komt dan uit de feed.
    open(maakCtx({ acties: [], teamfeed: feed() }));
    expect($(".verhaal").textContent).not.toMatch(/Coördinator/);
    expect($$(".verhaal .chiprij .ag")).toHaveLength(0);
    // Notion-route: geen 'specialisten aan het werk' door een dagstart
    open(maakCtx({ notion: true, teamfeed: feed(), metricsWerk: { voorJou: [], ritmetaken: null, gegenereerdOp: null } }));
    expect($(".verhaal").textContent).toContain("deed je team niets vanzelf");
  });
});

/* ── de loader ─────────────────────────────────────────────────────── */
describe("f62 — loader: alleen de entry 'metrics', en de dagplannen via fetchWerkruimte", () => {
  const BRON = { soort: "daglink", instantieUrl: "https://instantie.test", token: "t" };
  function zetFetch({ domeinen, metrics }) {
    const gevraagd = [];
    const antwoord = (body) => ({ ok: true, status: 200, json: async () => body, headers: new Map() });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const pad = String(url).replace("https://instantie.test", "");
      gevraagd.push(pad);
      if (pad === "/dashboard/overzicht") return antwoord({ klant: "Test", domeinen });
      if (pad.startsWith("/dashboard/entries?domein=dashboard_metrics")) return antwoord({ entries: metrics });
      if (pad.startsWith("/dashboard/entries?domein=dagplannen")) return antwoord({ entries: [entry("Sanne Verbeek", plan())] });
      return antwoord({ entries: [] });
    });
    return gevraagd;
  }
  const metricsInhoud = () => JSON.stringify({ versie: 1, gegenereerd_op: new Date().toISOString(), domeinen: {} });

  it("een andere entry in dashboard_metrics is geen metricsbestand", async () => {
    zetFetch({ domeinen: [{ domein: "dashboard_metrics", aantal: 1 }], metrics: [{ entryId: "iets-anders", bijgewerkt: new Date().toISOString(), data: { Inhoud: metricsInhoud() } }] });
    const b = await g.loadWerkruimteBundle(BRON);
    expect(b.kind).toBe("rows");
    expect(b.metricsRaw).toBeUndefined();
  });
  it("de entry 'metrics' wel", async () => {
    zetFetch({ domeinen: [{ domein: "dashboard_metrics", aantal: 1 }], metrics: [{ entryId: "iets-anders", bijgewerkt: "2030-01-01", data: { Inhoud: "{}" } }, { entryId: "metrics", bijgewerkt: new Date().toISOString(), data: { Inhoud: metricsInhoud() } }] });
    const b = await g.loadWerkruimteBundle(BRON);
    expect(b.kind).toBe("metrics");
  });
  it("dagplannen alleen als de instantie het domein kent; nooit als rijen", async () => {
    let gevraagd = zetFetch({ domeinen: [{ domein: "acties", aantal: 0 }], metrics: [] });
    let b = await g.loadWerkruimteBundle(BRON);
    expect(b.dagplannen).toBeNull();
    expect(gevraagd.some(p => p.includes("dagplannen"))).toBe(false);
    vi.restoreAllMocks();
    gevraagd = zetFetch({ domeinen: [{ domein: "dagplannen", aantal: 1 }], metrics: [] });
    b = await g.loadWerkruimteBundle(BRON);
    expect(gevraagd.filter(p => p.includes("dagplannen"))).toEqual(["/dashboard/entries?domein=dagplannen&limiet=50"]);
    expect(b.dagplannen.entries).toHaveLength(1);
    expect(b.domains.dagplannen).toBeUndefined();
  });
  it("het schema kent dagplannen als werkruimte-domein", () => {
    expect(g.AGENTIC_TEAM_SCHEMA.werkruimteDomeinen).toContain("dagplannen");
    expect(g.AGENTIC_TEAM_SCHEMA.datadomeinen.dagplannen).toBeUndefined();
  });
});
