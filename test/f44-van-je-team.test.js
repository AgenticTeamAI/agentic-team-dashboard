// @vitest-environment jsdom
/* f44 — zichtbaar en terugvindbaar wat je team voor je klaarzette.
 *
 * De aanleiding: een klant ontdekte per ongeluk dat er werk voor haar
 * klaarstond. computeZone1 kende de categorie niet, dus drie verse
 * review-acties gaven letterlijk "Niets vraagt vandaag om aandacht".
 *
 * De scherpste eis zit in de definitie: filteren op alleen "Wacht op review"
 * mist de ritmetaak-acties (Status Open, mens als eigenaar) — waarschijnlijk
 * de grootste berg. En die krijgen Deadline vandaag, dus de dag erna staan ze
 * óók in het rode "over de deadline". Twee keer hetzelfde melden, waarvan één
 * keer als jouw achterstand, is erger dan één keer niet melden.
 */
import { describe, expect, it, beforeAll } from "vitest";
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
  "src/metrics-sanitize.js",
  "src/metrics.js",
  "src/render.js",
  "src/charts.js",
  "src/feed.js",
  "src/homepage.js",
  "src/databrowser.js",
  "src/data-bewerken.js",
];

/* const-declaraties op topniveau landen niet op globalThis; uitlezen met een
 * expressie in diezelfde scope (zelfde truc als test/f25-indeling.test.js). */
const lees = (naam) => vm.runInThisContext(naam);

let g;
beforeAll(() => {
  for (const rel of MODULES) {
    vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  }
  g = globalThis;
});


/* jsdom levert in deze opzet geen werkende localStorage — window.localStorage
 * bestaat wél, maar heeft geen setItem/getItem. Een assertie als
 * `expect({...localStorage}).toEqual(voor)` vergelijkt daardoor twee keer {}
 * en bewijst niets; die stond hier eerst. Dezelfde minimale stub als
 * test/f33-notities-bedienen.test.js houdt de test dicht bij een echte
 * browser, zodat "er wordt niets bewaard" ook echt gemeten wordt. */
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
  return kluis;
}

const VANDAAG = new Date("2026-09-10T09:00:00Z");
const schema = () => g.getSchema();
const AGENT = () => schema().agents.find((a) => a.slug === "outreach-specialist").displayName;

function bundelMet(acties) {
  return {
    kind: "rows",
    source: "werkruimte",
    sourceLabel: "je werkruimte",
    domains: { acties: { rows: acties, staleAt: VANDAAG } },
  };
}

const zone1 = (bundle) => g.computeZone1(bundle, g.buildAgentLookup(), VANDAAG);
const metOogst = (bundle) => g.voegTeamOogstToeAanAandacht(zone1(bundle), bundle, schema());

describe("de twee takken van de definitie", () => {
  it("tak (a): Wacht op review met een mens als eigenaar telt mee", () => {
    const b = bundelMet([{ Actie: "Concept offerte", Status: "Wacht op review", Eigenaar: "Janine", __entryId: "a1" }]);
    const item = metOogst(b).find((i) => i.type === "team-oogst");
    expect(item, "zonder dit item staat er 'Niets vraagt vandaag om aandacht'").not.toBeUndefined();
    expect(item.label).toMatch(/1 ding\(en\) voor je klaar/);
    expect(item.label).toMatch(/1 wacht op je oordeel/);
  });

  /* Dit is de tak die de voor de hand liggende oplossing mist. Alle vier de
     ritmetaken schrijven Status Open met de mens als eigenaar, en de werkronde
     verbiedt "Wacht op review" daar expliciet. */
  it("tak (b): Status Open, aangemaakt door een agent, mens als eigenaar telt óók mee", () => {
    const b = bundelMet([{ Actie: "Dubbele deal-entry opruimen", Status: "Open", Eigenaar: "Janine", "Aangemaakt door": AGENT(), __entryId: "a2" }]);
    const item = metOogst(b).find((i) => i.type === "team-oogst");
    expect(item).not.toBeUndefined();
    expect(item.rows.map((r) => r.__entryId)).toEqual(["a2"]);
    // geen review-actie erbij, dus geen "wacht op je oordeel"
    expect(item.label).not.toMatch(/oordeel/);
  });

  it("ligt het bij een agent, dan ligt het niet bij jou", () => {
    const b = bundelMet([{ Actie: "Nog aan het werk", Status: "Wacht op review", Eigenaar: AGENT(), __entryId: "a3" }]);
    expect(metOogst(b).find((i) => i.type === "team-oogst")).toBeUndefined();
  });

  it("afgeronde acties tellen niet mee", () => {
    const b = bundelMet([{ Actie: "Al gedaan", Status: "Klaar", Eigenaar: "Janine", "Aangemaakt door": AGENT(), __entryId: "a4" }]);
    expect(metOogst(b).find((i) => i.type === "team-oogst")).toBeUndefined();
  });

  /* Zelfde regel als bij correctievrij: geen agentlijst = niet gokken. */
  it("toont niets zonder agentlijst", () => {
    const b = bundelMet([{ Actie: "X", Status: "Wacht op review", Eigenaar: "Janine", __entryId: "a5" }]);
    expect(g.teamOogstRijen(b, { agents: [] })).toBeNull();
    expect(g.voegTeamOogstToeAanAandacht(zone1(b), b, { agents: [] }).find((i) => i.type === "team-oogst")).toBeUndefined();
  });
});

describe("nooit twee keer hetzelfde melden", () => {
  /* Een ritmetaak-actie krijgt Deadline vandaag. De dag erna is hij over de
     deadline — rood, en dat leest als jouw achterstand op werk dat je team
     gisteren neerlegde. */
  it("dedupliceert tegen 'over de deadline'", () => {
    const gisteren = "2026-09-09";
    const b = bundelMet([{ Actie: "Van gisteren", Status: "Open", Eigenaar: "Janine", "Aangemaakt door": AGENT(), Deadline: gisteren, __entryId: "a6" }]);
    const items = metOogst(b);
    const deadline = items.find((i) => i.type === "acties-deadline");
    expect(deadline, "de bestaande deadline-afleiding hoort hem te pakken").not.toBeUndefined();
    expect(items.find((i) => i.type === "team-oogst"), "en dan niet nóg een keer").toBeUndefined();
  });

  it("dedupliceert tegen het kwaliteitscontrole-item", () => {
    const qc = schema().agents.find((a) => a.slug === "quality-control").displayName;
    const b = bundelMet([{ Actie: "QC-punt", Status: "Wacht op review", Eigenaar: "Janine", Agent: qc, __entryId: "a7" }]);
    const items = metOogst(b);
    expect(items.find((i) => i.type === "qc")).not.toBeUndefined();
    expect(items.find((i) => i.type === "team-oogst")).toBeUndefined();
  });

  it("meldt wél wat nog niet gemeld was", () => {
    const b = bundelMet([
      { Actie: "Over de deadline", Status: "Open", Eigenaar: "Janine", "Aangemaakt door": AGENT(), Deadline: "2026-09-09", __entryId: "a8" },
      { Actie: "Verse review", Status: "Wacht op review", Eigenaar: "Janine", __entryId: "a9" },
    ]);
    const item = metOogst(b).find((i) => i.type === "team-oogst");
    expect(item.rows.map((r) => r.__entryId)).toEqual(["a9"]);
  });

  it("is idempotent", () => {
    const b = bundelMet([{ Actie: "X", Status: "Wacht op review", Eigenaar: "Janine", __entryId: "b1" }]);
    const een = metOogst(b);
    const twee = g.voegTeamOogstToeAanAandacht(een, b, schema());
    expect(twee.filter((i) => i.type === "team-oogst")).toHaveLength(1);
  });
});

describe("plaats en doorklik", () => {
  it("staat achter wat rood is, maar vóór de rest", () => {
    const b = bundelMet([
      { Actie: "Te laat", Status: "Open", Eigenaar: "Janine", Deadline: "2026-09-01", __entryId: "c1" },
      { Actie: "Verse review", Status: "Wacht op review", Eigenaar: "Janine", __entryId: "c2" },
    ]);
    const types = metOogst(b).map((i) => i.type);
    expect(types.indexOf("acties-deadline")).toBeLessThan(types.indexOf("team-oogst"));
  });

  it("klikt door naar precies die rijen", () => {
    const b = bundelMet([{ Actie: "Verse review", Status: "Wacht op review", Eigenaar: "Janine", __entryId: "d1" }]);
    const item = metOogst(b).find((i) => i.type === "team-oogst");
    const el = document.createElement("div");
    g.renderZone1(el, [item]);
    const link = el.querySelector("a.aandacht-link");
    expect(link.getAttribute("href")).toBe("#/data/acties");
    expect(link.getAttribute("data-filter-ids")).toBe("d1");
  });
});

describe("terugvinden", () => {
  const ctxMet = (acties) => ({ schema: schema(), bundle: bundelMet(acties), kanSchrijven: false });

  it("zet 'Aangemaakt door' in beeld, ook al is het veld 9", () => {
    const velden = schema().datadomeinen.acties.velden.map((v) => v.naam);
    expect(velden.indexOf("Aangemaakt door")).toBeGreaterThan(5); // buiten de eerste zes
    const c = document.createElement("div");
    g.resetDataZoek();
    g.renderDataDomein(c, "acties", ctxMet([{ Actie: "X", Status: "Open", Eigenaar: "Janine", "Aangemaakt door": AGENT(), __entryId: "e1" }]));
    expect([...c.querySelectorAll("th")].map((t) => t.textContent)).toContain("Aangemaakt door");
    expect(c.textContent).toContain(AGENT());
  });

  it("biedt een 'Van je team'-filter zodra er iets van je team is", () => {
    const c = document.createElement("div");
    g.resetDataZoek();
    g.renderDataDomein(c, "acties", ctxMet([{ Actie: "X", Status: "Wacht op review", Eigenaar: "Janine", __entryId: "f1" }]));
    expect(c.querySelector("[data-van-team]")).not.toBeNull();
  });

  it("laat het filter weg als er niets van je team is", () => {
    const c = document.createElement("div");
    g.resetDataZoek();
    g.renderDataDomein(c, "acties", ctxMet([{ Actie: "Zelf gemaakt", Status: "Open", Eigenaar: "Janine", __entryId: "g1" }]));
    expect(c.querySelector("[data-van-team]")).toBeNull();
  });

  it("filtert op dezelfde afleiding als het aandachtsitem", () => {
    const c = document.createElement("div");
    g.resetDataZoek();
    g.renderDataDomein(c, "acties", ctxMet([
      { Actie: "Van je team", Status: "Wacht op review", Eigenaar: "Janine", __entryId: "h1" },
      { Actie: "Zelf gemaakt", Status: "Open", Eigenaar: "Janine", __entryId: "h2" },
    ]));
    expect(c.querySelectorAll("tbody tr")).toHaveLength(2);
    c.querySelector("[data-van-team]").click();
    expect(c.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(c.textContent).toContain("Van je team");
    expect(c.textContent).not.toContain("Zelf gemaakt");
    g.resetDataZoek();
  });

  it("bewaart niets — het filter leeft alleen in het geheugen van de pagina", () => {
    const kluis = stubOpslag();
    const c = document.createElement("div");
    g.resetDataZoek();
    g.renderDataDomein(c, "acties", ctxMet([{ Actie: "X", Status: "Wacht op review", Eigenaar: "Janine", __entryId: "i1" }]));
    c.querySelector("[data-van-team]").click();
    expect([...kluis.keys()], "het filter mag niets bewaren — de privacytekst is uitputtend").toEqual([]);
    g.resetDataZoek();
  });
});

describe("deeplink achter de login", () => {
  it("herkent alleen echte routes, nooit een token", () => {
    expect(g.bedoeldeRoute("#/data/acties")).toBe("#/data/acties");
    expect(g.bedoeldeRoute("#/prestaties")).toBe("#/prestaties");
    expect(g.bedoeldeRoute("#t=geheimtoken")).toBeNull();      // daglink
    expect(g.bedoeldeRoute("#code=abc&state=xyz")).toBeNull(); // redirect
    expect(g.bedoeldeRoute("")).toBeNull();
  });

  /* Geen nieuwe opslagsleutel: de route reist mee in de PKCE-record die er al
     is en die zichzelf na gebruik opruimt. Anders breekt de uitputtende
     sleutellijst in geen-telemetrie.test.js én de juridische opsomming. */
  /* Wie de link uit het slotbericht opent zonder sessie, kreeg "Geen daglink
     gevonden" te zien — met de inlogknop ernaast. Dat leest als een storing,
     terwijl er niets stuk is. */
  it("zegt bij een deeplink zonder sessie wat je moet doen, niet wat er ontbreekt", () => {
    const html = readFileSync(join(ROOT, "dashboard.html"), "utf8");
    expect(html).toContain("Log in om deze pagina te openen");
    expect(html).toMatch(/bedoeldeRoute\(window\.location\.hash\) && oauthMogelijk\(\)/);
    // en de daglink-uitleg blijft bestaan voor wie niet kán inloggen
    expect(html).toContain("Geen daglink gevonden");
  });

  /* De route hoort in de PKCE-record die er al is, niet in een eigen sleutel:
     anders breekt de uitputtende sleutellijst in geen-telemetrie.test.js én de
     juridisch getoetste opsomming in teksten.js. */
  it("reist mee in de bestaande PKCE-record, zonder nieuwe opslagsleutel", () => {
    const kluis = stubOpslag();
    g.bewaarPkce({ verifier: "v", state: "s", route: "#/data/acties" });
    expect([...kluis.keys()]).toEqual([lees("OAUTH_PKCE_SS_KEY")]);
    expect(g.leesPkce().route).toBe("#/data/acties");
    g.vergeetPkce();
    expect([...kluis.keys()]).toEqual([]);   // ruimt zichzelf op
  });

  /* De uitputtende sleutellijst in geen-telemetrie.test.js is de echte
     bewaker; hier alleen dat we er niet stiekem eentje bij hebben gezet. */
  it("voegt geen opslagsleutel toe aan het artefact", () => {
    const html = readFileSync(join(ROOT, "dashboard.html"), "utf8");
    const sleutels = [...new Set(html.match(/"agentic-team-dashboard:[a-z-]+"/g) || [])];
    expect(sleutels).toHaveLength(7);
  });
});
