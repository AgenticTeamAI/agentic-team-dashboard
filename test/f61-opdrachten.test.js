// @vitest-environment jsdom
/* f61 — doorgeven aan je team, als je acties in je eigen systeem staan.
 *
 * Wat hier vastligt:
 * - de veldnamen en keuzes van het domein dashboard_opdrachten zijn precies
 *   die van het f61-contract (het domein staat niet in schema.datadomeinen,
 *   dus het dashboard codeert ze zelf — deze test houdt ze gelijk);
 * - de loader haalt opdrachten alleen bij een instantie die het domein kent,
 *   en een opdrachtrij telt nooit als werkdata in de arbitrage;
 * - knoppen alleen ingelogd met dashboard:schrijf, alleen bij een item met een
 *   link, per soort; een daglink krijgt een inlogregel;
 * - een klik is precies één POST naar /dashboard/opdrachten met het item als
 *   sleutel, ongedaan maken is intrekken;
 * - de stand van een opdracht staat op de kaart, en zolang hij open ligt is er
 *   geen tweede knop;
 * - weigeringen van de instantie in gewone taal, en nergens een merknaam. */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import vm from "node:vm";
import { laadAlles, stubOpslag } from "./helpers/v2.js";

let g, DM, RS;
beforeAll(() => {
  stubOpslag(window);
  g = laadAlles();
  const naam = (slug) => g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === slug).displayName;
  DM = naam("dealmaker"); RS = naam("researcher");
});

const NU = new Date(2026, 8, 29, 7, 42);
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;
const ID1 = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d";
const URL1 = `https://www.notion.so/ffg/Offerte-nakijken-${ID1}`;
const URL2 = "https://www.notion.so/ffg/Korting-De-Vries-0123456789abcdef0123456789abcdef";
const URL3 = "https://www.notion.so/ffg/Factuur-Smit-fedcba9876543210fedcba9876543210";
const ITEMS = () => [
  { nr: 1, titel: "Offerte nakijken", soort: "check", te_laat: false, specialist: DM, sinds: "2026-09-28", deadline: null, url: URL1 },
  { nr: 2, titel: "15% korting De Vries?", soort: "voorstel", te_laat: false, specialist: DM, sinds: "2026-09-28", deadline: null, url: URL2 },
  { nr: 3, titel: "Factuur Smit nabellen", soort: "taak", te_laat: true, specialist: null, sinds: "2026-09-20", deadline: "2026-09-25", url: URL3 },
  { nr: 4, titel: "Zonder link", soort: "signaal", te_laat: false, specialist: null, sinds: null, deadline: null, url: null },
];
const opdracht = (id, data, aangemaakt = "2026-09-29T07:30:00", bijgewerkt = aangemaakt) => ({ entryId: id, data, aangemaakt, bijgewerkt });

/* Een klant met acties in zijn eigen systeem, op de metricsroute. */
function ctxMet({ schrijven = true, daglink = false, opdrachten = [], items = ITEMS(), kent = true, acties = "notion" } = {}) {
  const bron = daglink ? { token: "daglink.handtekening", instantieUrl: "https://connector.example" }
    : { oauth: true, token: token(schrijven ? "dashboard:lees dashboard:schrijf" : "dashboard:lees"), instantieUrl: "https://connector.example" };
  return {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU, periodWeeks: 12, minutenPerActie: 25,
    bron, kanSchrijven: g.bronKanSchrijven(bron), herlaad: vi.fn(), bundelWaarschuwingen: [],
    metricsWerk: { voorJou: items, ritmetaken: null, gegenereerdOp: "2026-09-29T07:02:00" },
    bundle: { kind: "metrics", source: "werkruimte", klant: "FFG", systeemPerDomein: { acties, ritmetaken: "notion" }, domains: {},
      instantieDomeinen: kent ? ["dashboard_opdrachten"] : [], opdrachten: kent ? { entries: opdrachten } : null },
    werkBij: vi.fn(() => true),
  };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/* Een nep-instantie met de opdrachtroutes van het contract, in de vorm van de
 * echte server (agentic-team-werkruimte src/http.ts opdrachtFout): een
 * weigering is altijd { fout: <code>, melding: <zin> }. */
function nepInstantie({ fout = null } = {}) {
  let n = 0;
  const opgeslagen = new Map();
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, o = {}) => {
    const u = new URL(String(url));
    if (u.pathname === "/dashboard/opdrachten" && o.method === "POST") {
      if (fout) return json(fout.body, fout.status);
      const b = JSON.parse(o.body);
      const e = opdracht("op-" + (++n), { Actie: b.actie, Handeling: b.handeling, Status: "Doorgegeven", Tekst: b.tekst, Specialist: b.specialist, Datum: b.datum,
        "Gegeven door": "Sanne Verbeek", Bronsysteem: "notion", "Extern ID": b.extern_id, "Bron (link)": b.bron_link }, "2026-09-29T07:43:00");
      opgeslagen.set(e.entryId, e);
      return json({ entry: e }, 201);
    }
    const m = u.pathname.match(/^\/dashboard\/opdrachten\/([^/]+)\/intrekken$/);
    if (m && o.method === "POST") {
      const e = opgeslagen.get(decodeURIComponent(m[1]));
      if (!e) return json({ fout: "niet_gevonden", melding: "Deze opdracht bestaat niet (meer)." }, 404);
      if (e.data.Status !== "Doorgegeven") return json({ fout: "niet_meer_in_te_trekken", melding: "Deze opdracht wordt al verwerkt of is afgerond.", status: e.data.Status }, 409);
      const nieuw = { ...e, data: { ...e.data, Status: "Ingetrokken" }, bijgewerkt: "2026-09-29T07:44:00" };
      return json({ entry: nieuw });
    }
    return json({ fout: "onbekend" }, 404);
  });
  spy.opgeslagen = opgeslagen;
  return spy;
}
const posts = (spy) => spy.mock.calls.filter(c => (c[1] || {}).method === "POST").map(c => ({ pad: new URL(String(c[0])).pathname, body: c[1].body ? JSON.parse(c[1].body) : undefined }));
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const wacht = (fn) => vi.waitFor(fn, { timeout: 2000, interval: 5 });
const kaart = (nr) => $$(".stapel .item").find(k => k.querySelector(".nr").textContent === String(nr));
const knoppen = (nr) => [...kaart(nr).querySelectorAll(".iknoppen .knop")].map(b => b.textContent.trim());
const metOauth = () => { const m = document.createElement("meta"); m.name = "at-oauth"; m.content = "1"; document.head.appendChild(m); };

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div><div id="melding" hidden></div><div id="live"></div>';
  window.location.hash = "";
  g.V2._reset();
});
afterEach(() => { vi.restoreAllMocks(); window.location.hash = ""; document.head.querySelectorAll('meta[name="at-oauth"]').forEach(m => m.remove()); });
function open(ctx, hash = "") { window.location.hash = hash; g.V2.start({}); g.V2.toon(ctx); }

describe("f61 — het domein volgt het contract", () => {
  it("veldnamen, typen en keuzes in de volgorde van het contract", () => {
    const velden = vm.runInThisContext("OPDRACHT_VELDEN");
    expect(velden).toEqual([
      { naam: "Actie", type: "titel" },
      { naam: "Handeling", type: "select", opties: ["Goedkeuren", "Ja", "Nee", "Terugsturen", "Doorzetten", "Later", "Nieuw"] },
      { naam: "Status", type: "select", opties: ["Doorgegeven", "In uitvoering", "Uitgevoerd", "Mislukt", "Ingetrokken"] },
      { naam: "Tekst", type: "tekst" },
      { naam: "Specialist", type: "select", opties_dynamisch: "agent_options" },
      { naam: "Datum", type: "datum" },
      { naam: "Gegeven door", type: "tekst" },
      { naam: "Bronsysteem", type: "tekst" },
      { naam: "Extern ID", type: "tekst" },
      { naam: "Bron (link)", type: "url" },
      { naam: "Uitkomst", type: "tekst" },
      { naam: "Uitgevoerd op", type: "datum" },
    ]);
    expect(vm.runInThisContext("OPDRACHTEN_DOMEIN")).toBe("dashboard_opdrachten");
    expect(vm.runInThisContext("[OPDRACHT_ACTIE_MAX, OPDRACHT_TEKST_MAX]")).toEqual([200, 4000]);
  });

  it("kent het gebakken schema het domein (na de registry-sync), dan zijn de namen gelijk", () => {
    const dom = g.AGENTIC_TEAM_SCHEMA.datadomeinen.dashboard_opdrachten;
    // opslag=werkruimte: hoort nooit in datadomeinen, hooguit als naam in werkruimteDomeinen.
    expect(dom).toBeUndefined();
    const ws = g.AGENTIC_TEAM_SCHEMA.werkruimteDomeinen || [];
    expect(Array.isArray(ws)).toBe(true);
  });

  it("de sleutel van een item: het page-id uit de link, anders de link zelf", () => {
    expect(g.externIdVanUrl(URL1)).toBe(ID1);
    expect(g.externIdVanUrl("https://www.notion.so/" + ID1.toUpperCase())).toBe(ID1);
    expect(g.externIdVanUrl("https://www.notion.so/ffg/1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d")).toBe(ID1);
    expect(g.externIdVanUrl("https://www.notion.so/ffg/Offerte-nakijken-" + ID1 + "?pvs=4")).toBe(ID1);
    expect(g.externIdVanUrl("https://ffg.notion.site/" + ID1)).toBe(ID1);
    expect(g.externIdVanUrl("https://crm.example/deal/42")).toBe("https://crm.example/deal/42");
    expect(g.externIdVanUrl("http://www.notion.so/" + ID1)).toBeNull();
    expect(g.externIdVanUrl(null)).toBeNull();
  });

  it("een link uit een databaseweergave: het page-id uit p, niet het database-id uit het pad", () => {
    const DB = "99999999999999999999999999999999";
    const peek = (p) => `https://www.notion.so/ffg/Acties-${DB}?v=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&p=${p}&pm=s`;
    expect(g.externIdVanUrl(peek(ID1))).toBe(ID1);
    expect(g.externIdVanUrl(peek("1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"))).toBe(ID1);
    expect(g.externIdVanUrl(peek("0123456789abcdef0123456789abcdef"))).toBe("0123456789abcdef0123456789abcdef");
    // Een p die geen page-id is: terug naar het pad.
    expect(g.externIdVanUrl(`https://www.notion.so/ffg/Acties-${DB}?p=geen-id`)).toBe(DB);
  });

  it("een andere host met een staart van 32 hex: de url zelf, nooit een page-id", () => {
    const vreemd = "https://andere-host.example/x-" + ID1;
    expect(g.externIdVanUrl(vreemd)).toBe(vreemd);
    expect(g.externIdVanUrl("https://notion.so.example/" + ID1)).toBe("https://notion.so.example/" + ID1);
    expect(g.externIdVanUrl("https://crm.example/" + ID1)).toBe("https://crm.example/" + ID1);
  });

  it("alleen een eenduidig item: dezelfde link of hetzelfde Extern ID bij twee items is geen sleutel", () => {
    const a = { nr: 1, url: URL1 }, b = { nr: 2, url: URL2 };
    expect(g.uniekItem([a, b], URL1)).toBe(a);
    expect(g.uniekItem([a, b], " " + URL1 + " ")).toBe(a);
    expect(g.uniekItem([a, b], "https://www.notion.so/ffg/iets-anders")).toBeNull();
    expect(g.uniekItem([a, { nr: 2, url: URL1 }], URL1)).toBeNull();
    // Andere link, zelfde page-id (bv. met en zonder ?pvs=4): ook niet eenduidig.
    expect(g.uniekItem([a, { nr: 2, url: URL1 + "?pvs=4" }], URL1)).toBeNull();
    expect(g.uniekItem([a, { nr: 2, url: null }], URL1)).toBe(a);
    expect(g.uniekItem(null, URL1)).toBeNull();
  });

  it("de body bevat alleen wat de handeling nodig heeft, nooit status of wie", () => {
    const it0 = ITEMS()[0];
    expect(g.opdrachtBody("Goedkeuren", it0)).toEqual({ handeling: "Goedkeuren", actie: "Offerte nakijken", extern_id: ID1, bron_link: URL1 });
    const b = g.opdrachtBody("Terugsturen", it0, { tekst: "  korter  ", specialist: DM });
    expect(b).toEqual({ handeling: "Terugsturen", actie: "Offerte nakijken", extern_id: ID1, bron_link: URL1, tekst: "korter", specialist: DM });
    expect(Object.keys(b)).not.toContain("status");
  });

  it("dezelfde regels als de instantie", () => {
    const it0 = ITEMS()[0];
    const c = (h, o) => g.controleerOpdracht(g.opdrachtBody(h, it0, o));
    expect(c("Goedkeuren")).toBeNull();
    expect(c("Terugsturen")).toMatch(/anders moet/);
    expect(c("Later")).toMatch(/datum/);
    expect(c("Later", { datum: "2026-10-01" })).toBeNull();
    expect(c("Doorzetten")).toMatch(/wie/);
    expect(g.controleerOpdracht({ handeling: "Weg", actie: "x" })).toBeTruthy();
    expect(g.controleerOpdracht({ handeling: "Ja", actie: "x" })).toMatch(/link/);
    expect(g.controleerOpdracht({ handeling: "Ja", actie: "x", bron_link: "http://x" })).toMatch(/https/);
    expect(g.controleerOpdracht({ handeling: "Nieuw", actie: "x" })).toMatch(/moet gebeuren/);
    expect(g.controleerOpdracht({ handeling: "Nieuw", actie: "x", tekst: "y".repeat(4001) })).toMatch(/te lang/);
  });

  it("Nieuw via de elders-tak van het opdrachtscherm: eerste regel als titel, de rest als tekst", () => {
    const b = g.opdrachtVoorBron({ wat: "zoek tien bedrijven\nin Utrecht", uitleg: "met bron", specialist: RS, deadline: "2026-10-02" });
    expect(b).toEqual({ handeling: "Nieuw", actie: "Zoek tien bedrijven", tekst: "zoek tien bedrijven\nin Utrecht\n\nmet bron", specialist: RS, datum: "2026-10-02" });
    expect(g.controleerOpdracht(b)).toBeNull();
  });

  it("weigeringen in gewone taal, in de vorm van de echte instantie ({ fout, melding })", () => {
    const f = (status, fout, melding) => g.opdrachtFoutTekst(Object.assign(new Error(fout), { status, body: melding === undefined ? { fout } : { fout, melding } }));
    expect(f(409, "al_doorgegeven", "Hiervoor ligt al een opdracht klaar voor het volgende werkmoment.")).toMatch(/al doorgegeven/);
    expect(f(409, "niet_meer_in_te_trekken", "Deze opdracht wordt al verwerkt of is afgerond.")).toMatch(/al mee bezig/);
    expect(f(404, "niet_gevonden", "Deze opdracht bestaat niet (meer).")).toMatch(/bestaat niet meer/);
    expect(f(409, "acties_in_werkruimte", "De acties van dit team staan in de werkruimte; het dashboard handelt ze daar direct af.")).toMatch(/in je werkruimte/);
    expect(f(404, "domein_onbekend", "Deze werkruimte kent nog geen dashboardopdrachten.")).toMatch(/nog niet/);
    // 403 met de rol als oorzaak, en 403 zonder persoon: dat is geen rechtenvraag.
    expect(f(403, "alleen_lezen", "Je rol mag dit domein niet wijzigen.")).toMatch(/rol/);
    const geenPersoon = f(403, "geen_persoon", "Een opdracht geef of trek je in vanuit een ingelogde sessie met je eigen account.");
    expect(geenPersoon).toMatch(/eigen account/);
    expect(geenPersoon).not.toMatch(/rechten/);
    // Een andere weigering: de zin van de instantie, niet een lege 'probeer opnieuw'.
    expect(f(422, "ongeldig", "Aan wie geef je dit? (specialist)")).toBe("Aan wie geef je dit? (specialist)");
    expect(f(409, "niet_bij_te_werken", "Deze rij kun je hier niet bijwerken.")).toBe("Deze rij kun je hier niet bijwerken.");
    expect(f(403, "iets_nieuws", "Dit mag je hier niet.")).toBe("Dit mag je hier niet.");
    // Een merknaam in de melding komt nooit in beeld.
    const merk = f(422, "ongeldig", "'bron_link' moet een link naar een Notion-pagina zijn.");
    expect(merk).not.toMatch(/Notion/);
    expect(merk).toMatch(/keurde de gegevens af/);
    // Zonder melding: een code valt terug op een eigen zin, een 403 op de rol.
    expect(f(403, "geen_schrijfrechten")).toMatch(/rol/);
    expect(f(409, "bronkoppeling")).toMatch(/Ververs/);
    // Een route die nog een zin in `fout` stuurt (weigerScope e.d.): die zin.
    expect(f(403, "Dit token mag het dashboard lezen maar niet bewerken.")).toBe("Dit token mag het dashboard lezen maar niet bewerken.");
  });
});

describe("f61 — de loader", () => {
  const BRON = { instantieUrl: "https://instantie.test", token: "t" };
  function zetFetch({ domeinen, metrics = null, opdrachten = { entries: [] }, opdrachtStatus = 200 }) {
    const gezien = [];
    const antwoord = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Map() });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const pad = String(url).replace("https://instantie.test", ""); gezien.push(pad);
      if (pad === "/dashboard/overzicht") return antwoord({ klant: "FFG", domeinen });
      if (pad.startsWith("/dashboard/opdrachten")) return antwoord(opdrachtStatus === 200 ? opdrachten : { fout: "domein_onbekend" }, opdrachtStatus);
      if (pad.startsWith("/dashboard/entries?domein=dashboard_metrics")) return antwoord({ entries: [{ entryId: "metrics", bijgewerkt: metrics, data: { Inhoud: JSON.stringify({ versie: 1, gegenereerd_op: metrics }) } }] });
      if (pad.startsWith("/dashboard/entries?domein=bronkoppeling")) return antwoord({ entries: [{ entryId: "acties", data: { Systeem: "notion" } }] });
      return antwoord({ entries: [] });
    });
    return gezien;
  }

  it("kent de instantie het domein, dan komen de opdrachten van de laatste dertig dagen mee", async () => {
    const gezien = zetFetch({ domeinen: [{ domein: "dashboard_opdrachten", aantal: 2 }], opdrachten: { entries: [opdracht("o1", { Actie: "x", Status: "Doorgegeven" })] } });
    const bundle = await g.loadWerkruimteBundle(BRON);
    expect(bundle.opdrachten.entries.map(e => e.entryId)).toEqual(["o1"]);
    expect(gezien.filter(p => p.startsWith("/dashboard/opdrachten"))).toEqual([expect.stringMatching(/^\/dashboard\/opdrachten\?sinds=\d{4}-\d{2}-\d{2}$/)]);
    // Nooit als rijen: geen entries-verzoek voor het domein, geen waarschuwing.
    expect(gezien.some(p => p.includes("domein=dashboard_opdrachten"))).toBe(false);
    expect(bundle.domains.dashboard_opdrachten).toBeUndefined();
    expect(bundle.waarschuwingen.join(" ")).not.toContain("dashboard_opdrachten");
  });

  it("zonder rijen geen verzoek; kent de instantie het domein niet, dan null en geen verzoek", async () => {
    let gezien = zetFetch({ domeinen: [{ domein: "dashboard_opdrachten", aantal: 0 }] });
    expect((await g.loadWerkruimteBundle(BRON)).opdrachten).toEqual({ entries: [], opgehaaldOp: expect.any(String) });
    expect(gezien.some(p => p.startsWith("/dashboard/opdrachten"))).toBe(false);
    gezien = zetFetch({ domeinen: [{ domein: "acties", aantal: 0 }] });
    expect((await g.loadWerkruimteBundle(BRON)).opdrachten).toBeNull();
    expect(gezien.some(p => p.startsWith("/dashboard/opdrachten"))).toBe(false);
  });

  it("een instantie die de route nog niet kent (404 domein_onbekend): stil null", async () => {
    zetFetch({ domeinen: [{ domein: "dashboard_opdrachten", aantal: 3 }], opdrachtStatus: 404 });
    const bundle = await g.loadWerkruimteBundle(BRON);
    expect(bundle.opdrachten).toBeNull();
    expect(bundle.waarschuwingen).toEqual([]);
  });

  it("een opdrachtrij is geen werkdata: een metricsbestand van gisteren blijft winnen", async () => {
    const gisteren = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    zetFetch({ domeinen: [{ domein: "dashboard_metrics", aantal: 1 }, { domein: "bronkoppeling", aantal: 1 }, { domein: "dashboard_opdrachten", aantal: 5 }], metrics: gisteren });
    const bundle = await g.loadWerkruimteBundle(BRON);
    expect(bundle.kind).toBe("metrics");
    expect(bundle.waarschuwingen.join(" ")).not.toMatch(/genegeerd/);
    expect(g.werkruimteDomeinen({ werkruimteDomeinen: ["teamfeed"] })).toEqual(["teamfeed", "dashboard_metrics", "dashboard_opdrachten"]);
    // Na de registry-sync staat hij in het schema; dan niet dubbel.
    expect(g.werkruimteDomeinen({ werkruimteDomeinen: ["dashboard_opdrachten", "dashboard_metrics"] })).toEqual(["dashboard_opdrachten", "dashboard_metrics"]);
  });
});

describe("f61 — wie knoppen krijgt", () => {
  it("ingelogd met schrijfrechten: per soort de knoppen, alleen bij een item met een link", () => {
    open(ctxMet());
    expect(knoppen(1)).toEqual(["Goedkeuren", "Terug", "Open in je eigen systeem"]);
    expect(knoppen(2)).toEqual(["Ja, doe maar", "Nee, niet doen", "Open in je eigen systeem"]);
    expect(knoppen(3)).toEqual(["Geef aan je team", "Later", "Open in je eigen systeem"]);
    expect(knoppen(4)).toEqual(["Kopieer voor je team"]);
    expect($(".balk.notion").textContent).toContain("Je acties en vaste taken staan in je eigen systeem");
    expect($(".balk.notion").textContent).toContain("Afhandelen kan hier");
    expect($('.fab[data-type="opdracht"]')).not.toBeNull();
  });

  it("met een daglink: geen knoppen, wel een inlogregel", () => {
    metOauth();
    open(ctxMet({ daglink: true }));
    expect($$('[data-act^="x-"]')).toEqual([]);
    expect(knoppen(1)).toEqual(["Open in je eigen systeem", "Kopieer voor je team"]);
    const balk = $(".balk.notion");
    expect(balk.textContent).toContain("Log in om hier af te handelen");
    expect(balk.querySelector('[data-act="login"]')).not.toBeNull();
    expect($('[data-type="opdracht"]')).toBeNull();
  });

  it("ingelogd zonder schrijfrechten: geen knoppen, wel opnieuw inloggen", () => {
    metOauth();
    open(ctxMet({ schrijven: false }));
    expect($$('[data-act^="x-"]')).toEqual([]);
    expect($(".balk.notion").textContent).toContain("Je sessie mag alleen lezen");
  });

  it("een instantie die doorgeven niet kent, of acties in je werkruimte: precies zoals het was", () => {
    open(ctxMet({ kent: false }));
    expect($$('[data-act^="x-"]')).toEqual([]);
    expect($(".balk.notion").textContent).toContain("Afhandelen doe je in je eigen systeem, of vraag het je team.");
    expect($("#root").textContent).not.toContain("Doorgegeven");
    // De poort voor acties zelf blijft dicht: die rijen woont elders.
    expect(g.magDomeinBewerken(ctxMet(), "acties").ok).toBe(false);
  });
});

describe("f61 — twee items met dezelfde sleutel worden nooit door elkaar gehaald", () => {
  const DB = "99999999999999999999999999999999";
  const ID_B = "0123456789abcdef0123456789abcdef";
  const peek = (p) => `https://www.notion.so/ffg/Acties-${DB}?v=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&p=${p}&pm=s`;

  it("links uit een databaseweergave: elke kaart stuurt zijn eigen titel, link en page-id", async () => {
    const items = [
      { nr: 1, titel: "Offerte X versturen", soort: "check", specialist: DM, url: peek(ID1) },
      { nr: 2, titel: "Blogpost Y", soort: "check", specialist: DM, url: peek(ID_B) },
    ];
    const spy = nepInstantie();
    open(ctxMet({ items }));
    expect(knoppen(1)).toEqual(["Goedkeuren", "Terug", "Open in je eigen systeem"]);
    expect(knoppen(2)).toEqual(["Goedkeuren", "Terug", "Open in je eigen systeem"]);
    kaart(2).querySelector('[data-h="Goedkeuren"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(1));
    expect(posts(spy)[0].body).toEqual({ handeling: "Goedkeuren", actie: "Blogpost Y", extern_id: ID_B, bron_link: peek(ID_B) });
    await wacht(() => expect(kaart(2).querySelector("[data-opdracht-status]")).not.toBeNull());
    // Kaart 1 houdt zijn eigen knoppen en draagt niet de stand van kaart 2.
    expect(kaart(1).querySelector("[data-opdracht-status]")).toBeNull();
    expect(knoppen(1)).toEqual(["Goedkeuren", "Terug", "Open in je eigen systeem"]);
  });

  it("twee items met precies dezelfde link: geen doorgeefknoppen, wel Open en Kopieer", () => {
    const items = [
      { nr: 1, titel: "Offerte X versturen", soort: "check", specialist: DM, url: URL1 },
      { nr: 2, titel: "Blogpost Y", soort: "check", specialist: DM, url: URL1 },
      { nr: 3, titel: "Factuur Smit nabellen", soort: "taak", specialist: null, url: URL3 },
    ];
    open(ctxMet({ items, opdrachten: [opdracht("o1", { Actie: "Offerte X versturen", Handeling: "Goedkeuren", Status: "Doorgegeven", "Extern ID": ID1 })] }));
    expect(knoppen(1)).toEqual(["Open in je eigen systeem", "Kopieer voor je team"]);
    expect(knoppen(2)).toEqual(["Open in je eigen systeem", "Kopieer voor je team"]);
    expect(kaart(1).querySelector("[data-opdracht-status]")).toBeNull();
    expect(knoppen(3)).toEqual(["Geef aan je team", "Later", "Open in je eigen systeem"]);
    // Ook een blad dat (bv. uit een oude stand) zo'n sleutel draagt, geeft niets door.
    g.V2._S.sheet = { type: "x-terug", x: URL1, tekst: "", datum: "" }; g.V2.render();
    expect($(".scrim h3").textContent).toBe("Dit item is er niet (meer)");
  });
});

describe("f61 — doorgeven, de stand op de kaart, en ongedaan maken", () => {
  it("Goedkeuren: één POST met het item als sleutel; daarna de stand en geen tweede knop; ongedaan = intrekken", async () => {
    const ctx = ctxMet(); const spy = nepInstantie();
    open(ctx);
    kaart(1).querySelector('[data-act="x-doe"][data-h="Goedkeuren"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(1));
    expect(posts(spy)[0]).toEqual({ pad: "/dashboard/opdrachten", body: { handeling: "Goedkeuren", actie: "Offerte nakijken", extern_id: ID1, bron_link: URL1 } });
    await wacht(() => expect($("[data-toast]")).not.toBeNull());
    expect($("[data-toast]").textContent).toContain("Je team verwerkt het bij het volgende werkmoment");
    expect(kaart(1).querySelector("[data-opdracht-status]").textContent).toBe("Doorgegeven — wordt bij het volgende werkmoment verwerkt");
    expect(knoppen(1)).toEqual(["Ongedaan maken", "Open in je eigen systeem"]);
    expect($("[data-doorgegeven]").textContent).toContain("Offerte nakijken");
    // Ongedaan maken in de melding: intrekken.
    $('[data-toast] [data-act="undo"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(2));
    expect(posts(spy)[1].pad).toBe("/dashboard/opdrachten/op-1/intrekken");
    await wacht(() => expect(knoppen(1)).toEqual(["Goedkeuren", "Terug", "Open in je eigen systeem"]));
    expect($("[data-doorgegeven]")).toBeNull();
  });

  it("Terug vraagt een tekst en stuurt hem met de specialist mee", async () => {
    const spy = nepInstantie();
    open(ctxMet());
    kaart(1).querySelector('[data-type="x-terug"]').click();
    expect($(".scrim h3").textContent).toBe("Terug naar de " + DM);
    $('.scrim [data-act="sh-ok"]').click();
    expect($(".scrim .fout").textContent).toContain("wat anders moet");
    expect(posts(spy)).toHaveLength(0);
    const t = $("#sh-tekst"); t.value = "Korter graag"; t.dispatchEvent(new Event("input", { bubbles: true }));
    $('.scrim [data-act="sh-ok"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(1));
    expect(posts(spy)[0].body).toEqual({ handeling: "Terugsturen", actie: "Offerte nakijken", extern_id: ID1, bron_link: URL1, tekst: "Korter graag", specialist: DM });
    await wacht(() => expect($(".scrim")).toBeNull());
  });

  it("Ja op een voorstel met de specialist van het item; Nee met een reden die mag ontbreken", async () => {
    const spy = nepInstantie();
    open(ctxMet());
    kaart(2).querySelector('[data-h="Ja"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(1));
    expect(posts(spy)[0].body).toMatchObject({ handeling: "Ja", specialist: DM });
    await wacht(() => expect($("[data-toast]")).not.toBeNull());
    g.V2._reset(); document.body.innerHTML = '<div id="root"></div><div id="live"></div>';
    open(ctxMet());
    kaart(2).querySelector('[data-type="x-nee"]').click();
    $('.scrim [data-act="sh-ok"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(2));
    expect(posts(spy)[1].body).toEqual({ handeling: "Nee", actie: "15% korting De Vries?", extern_id: "0123456789abcdef0123456789abcdef", bron_link: URL2 });
  });

  it("Geef aan je team: een specialist kiezen; Later: een datum kiezen", async () => {
    const spy = nepInstantie();
    open(ctxMet());
    kaart(3).querySelector('[data-type="x-wie"]').click();
    expect($(".scrim h3").textContent).toBe("Geef aan je team");
    const keuze = $('.scrim [data-act="sh-kies"][data-v^="ag:"]');
    const slug = keuze.dataset.v.slice(3);
    keuze.click();
    await wacht(() => expect(posts(spy)).toHaveLength(1));
    await wacht(() => expect($("[data-toast]")).not.toBeNull());
    expect(posts(spy)[0].body).toMatchObject({ handeling: "Doorzetten", specialist: g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === slug).displayName, extern_id: "fedcba9876543210fedcba9876543210" });
    g.V2._reset(); document.body.innerHTML = '<div id="root"></div><div id="live"></div>';
    open(ctxMet());
    kaart(3).querySelector('[data-type="x-later"]').click();
    const dag = $('.scrim [data-act="sh-kies"][data-v^="datum:"]');
    dag.click();
    await wacht(() => expect(posts(spy)).toHaveLength(2));
    expect(posts(spy)[1].body).toMatchObject({ handeling: "Later", datum: dag.dataset.v.slice(6) });
  });

  it("de stand per opdracht: wordt verwerkt, gedaan, niet gelukt (met reden, en dan weer knoppen)", () => {
    open(ctxMet({ opdrachten: [
      opdracht("o1", { Actie: "Offerte nakijken", Handeling: "Goedkeuren", Status: "In uitvoering", "Extern ID": ID1 }),
      opdracht("o2", { Actie: "15% korting De Vries?", Handeling: "Ja", Status: "Uitgevoerd", "Bron (link)": URL2 }, "2026-09-29T07:10:00", "2026-09-29T07:20:00"),
      opdracht("o3", { Actie: "Factuur Smit nabellen", Handeling: "Later", Status: "Mislukt", Uitkomst: "Wachten tot bestaat niet", "Extern ID": "fedcba9876543210fedcba9876543210" }),
    ] }));
    expect(kaart(1).querySelector("[data-opdracht-status]").textContent).toBe("Wordt verwerkt");
    expect(knoppen(1)).toEqual(["Open in je eigen systeem"]); // al opgepakt: niet meer in te trekken
    expect(kaart(2).querySelector("[data-opdracht-status]").textContent).toBe("Gedaan");
    expect(knoppen(2)).toEqual(["Open in je eigen systeem"]);
    expect(kaart(3).querySelector("[data-opdracht-status]").textContent).toBe("Niet gelukt: Wachten tot bestaat niet");
    expect(knoppen(3)).toEqual(["Geef aan je team", "Later", "Open in je eigen systeem"]);
  });

  it("uitgevoerd vóór de dagstart en toch weer in je lijst: een nieuwe beurt, met knoppen", () => {
    open(ctxMet({ opdrachten: [opdracht("o1", { Actie: "Offerte nakijken", Handeling: "Later", Status: "Uitgevoerd", "Extern ID": ID1 }, "2026-09-27T09:00:00", "2026-09-28T02:00:00")] }));
    expect(kaart(1).querySelector("[data-opdracht-status]")).toBeNull();
    expect(knoppen(1)).toEqual(["Goedkeuren", "Terug", "Open in je eigen systeem"]);
  });

  it("het blok Doorgegeven toont ook opdrachten waarvan het item uit je dagstart verdween; ingetrokken niet", async () => {
    const spy = nepInstantie();
    open(ctxMet({ opdrachten: [
      opdracht("weg-1", { Actie: "Oud item", Handeling: "Doorzetten", Status: "Doorgegeven", "Extern ID": "ffffffffffffffffffffffffffffffff" }),
      opdracht("weg-2", { Actie: "Ingetrokken item", Handeling: "Ja", Status: "Ingetrokken", "Extern ID": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" }),
    ] }));
    const blok = $("[data-doorgegeven]");
    expect(blok.textContent).toContain("Oud item");
    expect(blok.textContent).toContain("1 nog te verwerken");
    expect(blok.textContent).not.toContain("Ingetrokken item");
    // Intrekken vanuit het blok; de nep-instantie kent deze niet meer (opgeruimd):
    // 404 niet_gevonden, een eerlijke melding en de actuele stand ophalen.
    blok.querySelector('[data-act="x-intrek"]').click();
    await wacht(() => expect($("[data-toast]")).not.toBeNull());
    expect(posts(spy)[0].pad).toBe("/dashboard/opdrachten/weg-1/intrekken");
    expect($("[data-toast]").textContent).toContain("Deze opdracht bestaat niet meer");
  });

  it("intrekken: al opgepakt (409) of opgeruimd (404) haalt allebei de stand op", async () => {
    let ctx = ctxMet({ opdrachten: [opdracht("weg-1", { Actie: "Oud item", Handeling: "Doorzetten", Status: "Doorgegeven", "Extern ID": "ffffffffffffffffffffffffffffffff" })] });
    nepInstantie();
    open(ctx);
    $('[data-doorgegeven] [data-act="x-intrek"]').click();
    await wacht(() => expect(ctx.herlaad).toHaveBeenCalled());
    vi.restoreAllMocks();
    g.V2._reset(); document.body.innerHTML = '<div id="root"></div><div id="melding" hidden></div><div id="live"></div>';
    ctx = ctxMet();
    const spy = nepInstantie();
    open(ctx);
    kaart(1).querySelector('[data-h="Goedkeuren"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(1));
    // De werkronde claimt hem intussen; daarna komt het intrekken te laat.
    spy.opgeslagen.get("op-1").data.Status = "In uitvoering";
    await wacht(() => expect(kaart(1).querySelector('[data-act="x-intrek"]')).not.toBeNull());
    kaart(1).querySelector('[data-act="x-intrek"]').click();
    await wacht(() => expect($("[data-toast]").textContent).toContain("Je team is er al mee bezig"));
    expect(ctx.herlaad).toHaveBeenCalled();
  });

  it("al doorgegeven (409) of geen recht (403): in gewone taal, en bij 409 de stand ophalen", async () => {
    let ctx = ctxMet();
    let spy = nepInstantie({ fout: { status: 409, body: { fout: "al_doorgegeven", melding: "Hiervoor ligt al een opdracht klaar voor het volgende werkmoment.", entryId: "x" } } });
    open(ctx);
    kaart(1).querySelector('[data-h="Goedkeuren"]').click();
    await wacht(() => expect($("[data-toast]")).not.toBeNull());
    expect($("[data-toast]").textContent).toContain("Dit is al doorgegeven");
    await wacht(() => expect(ctx.herlaad).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 20));
    vi.restoreAllMocks();
    g.V2._reset(); document.body.innerHTML = '<div id="root"></div><div id="live"></div>';
    ctx = ctxMet(); spy = nepInstantie({ fout: { status: 403, body: { fout: "alleen_lezen", melding: "Je rol mag dit domein niet wijzigen." } } });
    open(ctx);
    kaart(3).querySelector('[data-type="x-later"]').click();
    $('.scrim [data-act="sh-kies"][data-v^="datum:"]').click();
    await wacht(() => expect($(".scrim .fout")).not.toBeNull());
    expect($(".scrim .fout").textContent).toContain("rol");
    expect(posts(spy)).toHaveLength(1);
  });

  it("Ctrl+Z trekt de laatste opdracht in, ook bij acties in je eigen systeem", async () => {
    const spy = nepInstantie();
    open(ctxMet());
    kaart(1).querySelector('[data-h="Goedkeuren"]').click();
    await wacht(() => expect($('[data-toast] [data-act="undo"]')).not.toBeNull());
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    await wacht(() => expect(posts(spy).map(p => p.pad)).toContain("/dashboard/opdrachten/op-1/intrekken"));
  });
});

describe("f61 — een nieuwe opdracht, als je acties in je eigen systeem staan", () => {
  it("het opdrachtblad kent alleen specialisten en schrijft Handeling Nieuw", async () => {
    const spy = nepInstantie();
    open(ctxMet());
    $('.fab[data-type="opdracht"]').click();
    expect($(".scrim h3").textContent).toBe("Geef je team een opdracht");
    expect($(".scrim").textContent).not.toContain("Ikzelf");
    const wat = $("#sh-wat"); wat.value = "Zoek tien bedrijven in Utrecht"; wat.dispatchEvent(new Event("input", { bubbles: true }));
    const keuze = $('.scrim [data-act="sh-set"][data-k="ag"]'); const slug = keuze.dataset.v; keuze.click();
    expect($(".scrim .verwachting").textContent).toContain("het werkmoment daarna");
    $('.scrim [data-act="sh-ok"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(1));
    expect(posts(spy)[0]).toEqual({ pad: "/dashboard/opdrachten", body: { handeling: "Nieuw", actie: "Zoek tien bedrijven in Utrecht", tekst: "Zoek tien bedrijven in Utrecht", specialist: g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === slug).displayName } });
    await wacht(() => expect($("[data-doorgegeven]")).not.toBeNull());
    expect($("[data-doorgegeven]").textContent).toContain("Nieuwe opdracht");
  });

  it("op een groot scherm staat Opdracht geven in de kop van je lijst", () => {
    const mm = window.matchMedia;
    window.matchMedia = (q) => ({ matches: /min-width/.test(q), addEventListener() {}, removeEventListener() {} });
    try {
      open(ctxMet());
      expect($('.werkbak-kop [data-type="opdracht"]')).not.toBeNull();
      expect($(".fab")).toBeNull();
    } finally { window.matchMedia = mm; }
  });

  it("op een telefoon staat de knop Opdracht onderaan, ook bij acties in je eigen systeem", () => {
    open(ctxMet());
    expect($(".fab")).not.toBeNull();
    open(ctxMet({ kent: false }));
    expect($(".fab")).toBeNull();
  });
});

describe("f61 — geen merknaam in beeld, en de hulp legt het uit", () => {
  const juridisch = () => vm.runInThisContext("PRIVACY_UITKLAP_ALINEAS");
  const inBeeld = () => juridisch().reduce((t, a) => t.split(a).join(""), document.body.textContent) + " " + $$("[title],[aria-label],[placeholder]").map(e => ["title", "aria-label", "placeholder"].map(a => e.getAttribute(a) || "").join(" ")).join(" ");

  it("kaarten, bladen, blok en hulp: nergens Claude of Notion", () => {
    const ctx = ctxMet({ opdrachten: [opdracht("o1", { Actie: "Offerte nakijken", Handeling: "Goedkeuren", Status: "Mislukt", Uitkomst: "Niet gevonden", "Extern ID": ID1 })] });
    open(ctx);
    expect(inBeeld()).not.toMatch(/Claude|Notion/);
    for (const type of ["x-terug", "x-nee", "x-later", "x-wie"]) {
      g.V2._S.sheet = { type, x: URL1, tekst: "", datum: "" }; g.V2.render();
      expect(inBeeld(), type).not.toMatch(/Claude|Notion/);
    }
    g.V2._S.sheet = { type: "opdracht", wat: "", ag: null, mens: null, wanneer: "geen" }; g.V2.render();
    expect(inBeeld()).not.toMatch(/Claude|Notion/);
    g.V2._S.sheet = null;
    open(ctx, "#/hulp/eigen-systeem");
    const sec = $("#h-eigen-systeem");
    expect(sec.textContent).toContain("Hier handel je af");
    expect(sec.textContent).toContain("ongedaan maken");
    expect(inBeeld()).not.toMatch(/Claude|Notion/);
  });

  it("zonder doorgeven blijft de hulp zoals hij was", () => {
    open(ctxMet({ kent: false }), "#/hulp/eigen-systeem");
    expect($("#h-eigen-systeem").textContent).toContain("In je eigen systeem doe je het afhandelen");
  });
});
