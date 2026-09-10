// @vitest-environment jsdom
/* b58 — het dashboard klantklaar maken.
 *
 * Vier ingrepen die elk hun eigen manier hebben om stil fout te gaan:
 *
 *  1. de kanttekeningen zijn dichtgeklapt en dragen alleen "let op" als er
 *     iets met de bundel zelf mis is (niet bij een onleesbaar veld);
 *  2. gebruik-per-agent spreekt de teamfeed niet tegen — nul is geen antwoord
 *     en de bron staat erbij;
 *  3. een uitblijvend antwoord loopt af in plaats van eeuwig te laden;
 *  4. de Data-tab verdwijnt als hij niets te tonen heeft, en de opbrengst
 *     zet het gemeten werk vóór de schatting.
 */
import { describe, expect, it, beforeAll, afterEach } from "vitest";
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

const VANDAAG = new Date("2026-09-10T12:00:00Z");

let g;
beforeAll(() => {
  for (const rel of MODULES) {
    vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  }
  g = globalThis;
});

const el = () => document.createElement("div");
const schema = () => g.getSchema();

/* Eén teamfeed-entry zoals de werkruimte hem levert. */
function feedEntry(agent, dagenGeleden, id) {
  const t = new Date(VANDAAG.getTime() - dagenGeleden * 24 * 3600 * 1000);
  return {
    entryId: id,
    aangemaakt: t.toISOString(),
    data: { Agent: agent, Soort: "update", Bericht: "iets gedaan" },
  };
}

// ══ 1 · Kanttekeningen ═══════════════════════════════════════════════

describe("kanttekeningen bij de cijfers", () => {
  it("is leeg en verborgen als er niets te melden is", () => {
    const c = el();
    g.renderWaarschuwingen(c, { bundelWaarschuwingen: [], veldWaarschuwingen: [] });
    expect(c.style.display).toBe("none");
    expect(c.innerHTML).toBe("");
  });

  it("klapt de lijst dicht achter één samenvattende regel", () => {
    const c = el();
    g.renderWaarschuwingen(c, { bundelWaarschuwingen: [], veldWaarschuwingen: ["veld a", "veld b"] });
    const details = c.querySelector("details");
    expect(details).not.toBeNull();
    // dichtgeklapt: geen `open`-attribuut
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector("summary").textContent).toBe("2 kanttekeningen bij deze cijfers");
    expect(c.querySelectorAll("li")).toHaveLength(2);
  });

  it("telt in enkelvoud bij één kanttekening", () => {
    const c = el();
    g.renderWaarschuwingen(c, { bundelWaarschuwingen: [], veldWaarschuwingen: ["alleen deze"] });
    expect(c.querySelector("summary").textContent).toBe("1 kanttekening bij deze cijfers");
  });

  /* Het verschil dat de hele ingreep draagt: een onleesbaar veld is geen
     storing, een verouderde bundel wel. Alleen die tweede verdient de
     aandacht die het gele kader vroeger aan allebei gaf. */
  it("zegt alleen 'let op' als er iets met de bundel zelf mis is", () => {
    const zacht = el();
    g.renderWaarschuwingen(zacht, { bundelWaarschuwingen: [], veldWaarschuwingen: ["veld x"] });
    expect(zacht.querySelector("details").hasAttribute("data-let-op")).toBe(false);
    expect(zacht.querySelector("summary").textContent).not.toMatch(/Let op/);

    const hard = el();
    g.renderWaarschuwingen(hard, { bundelWaarschuwingen: ["mogelijk verouderd"], veldWaarschuwingen: ["veld x"] });
    expect(hard.querySelector("details").hasAttribute("data-let-op")).toBe(true);
    expect(hard.querySelector("summary").textContent).toBe("Let op: 2 kanttekeningen bij deze cijfers");
  });

  it("zet de bundelwaarschuwingen bovenaan en verliest er geen", () => {
    const c = el();
    g.renderWaarschuwingen(c, { bundelWaarschuwingen: ["bundel-1"], veldWaarschuwingen: ["veld-1", "veld-2"] });
    expect([...c.querySelectorAll("li")].map((li) => li.textContent))
      .toEqual(["bundel-1", "veld-1", "veld-2"]);
  });

  it("laat tekst uit de bundel nooit als markup binnen", () => {
    const c = el();
    g.renderWaarschuwingen(c, { bundelWaarschuwingen: ['<img src=q onerror=window.__xss58=1>'], veldWaarschuwingen: [] });
    expect(c.querySelector("img")).toBeNull();
    expect(window.__xss58).toBeUndefined();
  });
});

// ══ 2 · Gebruik per agent spreekt de teamfeed niet tegen ══════════════

describe("gebruik per agent", () => {
  const slugs = () => schema().agents.map((a) => a.slug);

  it("telt de teamfeed per agent, binnen en buiten de periode", () => {
    const [a, b] = slugs();
    const naamVan = (slug) => schema().agents.find((x) => x.slug === slug).displayName;
    const items = g.normaliseerFeed(
      [
        feedEntry(naamVan(a), 1, "1"),
        feedEntry(naamVan(a), 3, "2"),
        feedEntry(naamVan(a), 200, "3"),   // ver buiten de periode
        feedEntry(naamVan(b), 2, "4"),
        feedEntry("Iemand die niet bestaat", 1, "5"),
      ],
      schema(), g.buildAgentLookup(),
    );
    const uit = g.agentGebruikUitTeamfeed(items, schema(), VANDAAG, 84);
    expect(uit.status).toBe("ok");
    expect(uit.bron).toBe("teamfeed");
    const rij = (slug) => uit.ranking.find((r) => r.slug === slug);
    expect(rij(a).totaal).toBe(3);
    expect(rij(a).value).toBe(2);      // alleen wat in de periode viel
    expect(rij(b).totaal).toBe(1);
    // een onbekende agentnaam telt nergens mee — niet bij een willekeurige agent
    expect(uit.ranking.reduce((s, r) => s + r.totaal, 0)).toBe(4);
  });

  it("geeft niets terug als geen enkel bericht een bekende agent noemt", () => {
    const items = g.normaliseerFeed([feedEntry("Onbekend", 1, "1")], schema(), g.buildAgentLookup());
    expect(g.agentGebruikUitTeamfeed(items, schema(), VANDAAG, 84)).toBeNull();
  });

  it("herkent een ranglijst zonder signaal als 'geen antwoord'", () => {
    const nullen = { status: "ok", ranking: schema().agents.map((a) => ({ slug: a.slug, value: 0, totaal: 0 })) };
    expect(g.agentGebruikHeeftSignaal(nullen)).toBe(false);
    expect(g.agentGebruikHeeftSignaal({ status: "geen-bron", reden: "x" })).toBe(false);
    nullen.ranking[0].totaal = 1;
    expect(g.agentGebruikHeeftSignaal(nullen)).toBe(true);
  });

  /* Dit is de bevinding zelf: 466 berichten op de Team-tab naast "0 van 21
     agents" op Prestaties. Beide tabs horen daarna hetzelfde te tellen. */
  it("valt terug op de teamfeed in plaats van 21 balkjes op nul te tonen", () => {
    const naam = schema().agents[0].displayName;
    const items = g.normaliseerFeed([feedEntry(naam, 1, "1"), feedEntry(naam, 2, "2")], schema(), g.buildAgentLookup());
    const leeg = { status: "ok", ranking: schema().agents.map((a) => ({ slug: a.slug, value: 0, totaal: 0 })) };

    const uit = g.kiesAgentGebruik(leeg, items, schema(), VANDAAG, 84);
    expect(uit.bron).toBe("teamfeed");
    expect(uit.ranking.find((r) => r.slug === schema().agents[0].slug).totaal).toBe(2);
  });

  it("laat een ranglijst mét signaal ongemoeid, ook als er een feed is", () => {
    const naam = schema().agents[1].displayName;
    const items = g.normaliseerFeed([feedEntry(naam, 1, "1")], schema(), g.buildAgentLookup());
    const echt = { status: "ok", ranking: schema().agents.map((a, i) => ({ slug: a.slug, value: i === 0 ? 5 : 0, totaal: i === 0 ? 5 : 0 })) };
    expect(g.kiesAgentGebruik(echt, items, schema(), VANDAAG, 84)).toBe(echt);
  });

  it("houdt de preciezere reden vast als er ook geen feed is", () => {
    const bron = { status: "geen-veld", reden: "Het veld Agent komt niet gevuld voor." };
    expect(g.kiesAgentGebruik(bron, [], schema(), VANDAAG, 84)).toBe(bron);
  });

  it("zegt 'geen spoor' in plaats van nul als er niets te tellen valt", () => {
    const leeg = { status: "ok", ranking: schema().agents.map((a) => ({ slug: a.slug, value: 0, totaal: 0 })) };
    const uit = g.kiesAgentGebruik(leeg, [], schema(), VANDAAG, 84);
    expect(uit.status).toBe("geen-spoor");
    expect(uit.reden).toMatch(/niet gemeten, alleen niet vastgelegd/);
  });

  it("noemt de bron onder de grafiek zodra hij uit de feed komt", () => {
    const uitFeed = { status: "ok", bron: "teamfeed", ranking: [{ slug: "x", label: "X", emoji: "🙂", module: "core", value: 2, totaal: 2 }] };
    const c = el();
    g.renderGebruikPanel(c, uitFeed);
    expect(c.textContent).toMatch(/Geteld uit de teamfeed/);

    const gewoon = { status: "ok", ranking: [{ slug: "x", label: "X", emoji: "🙂", module: "core", value: 2, totaal: 2 }] };
    const d = el();
    g.renderGebruikPanel(d, gewoon);
    expect(d.textContent).toMatch(/Geteld uit Acties en Lessen/);
  });

  it("toont een grijs blok in plaats van een grafiek bij 'geen spoor'", () => {
    const c = el();
    g.renderGebruikPanel(c, { status: "geen-spoor", reden: "niets gemeten" });
    expect(c.querySelector("svg")).toBeNull();
    expect(c.querySelector(".grijs-blok")).not.toBeNull();
  });
});

// ══ 3 · Een link die niet werkt zegt dat ook ══════════════════════════

describe("tijdslimiet op de werkruimte-aanroep", () => {
  const echteFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = echteFetch; });

  it("breekt af zodra de tijd om is", async () => {
    const tl = g.tijdslimiet(5);
    expect(tl.signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 25));
    expect(tl.signal.aborted).toBe(true);
  });

  it("laat het signaal met rust als het verzoek op tijd klaar is", async () => {
    const tl = g.tijdslimiet(5);
    tl.klaar();
    await new Promise((r) => setTimeout(r, 25));
    expect(tl.signal.aborted).toBe(false);
  });

  it("herkent een afgebroken verzoek", () => {
    expect(g.isAfgebroken({ name: "AbortError" })).toBe(true);
    expect(g.isAfgebroken({ name: "TypeError" })).toBe(false);
    expect(g.isAfgebroken(null)).toBe(false);
  });

  /* De bevinding: de pagina bleef staan op "Live gegevens … worden opgehaald".
     Een afgebroken verzoek moet als leesbare fout naar boven komen, niet als
     een belofte die nooit rond komt. */
  it("vertaalt een afgebroken verzoek naar een melding die zegt wat je kunt doen", async () => {
    globalThis.fetch = () => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await expect(g.fetchWerkruimte({ token: "t", instantieUrl: "http://localhost:1" }, "/dashboard/overzicht"))
      .rejects.toThrow(/reageert niet/);
  });

  it("houdt de bestaande melding voor een onbereikbare instantie", async () => {
    globalThis.fetch = () => Promise.reject(new TypeError("network down"));
    await expect(g.fetchWerkruimte({ token: "t", instantieUrl: "http://localhost:1" }, "/dashboard/overzicht"))
      .rejects.toThrow(/niet bereikbaar/);
  });

  it("ziet het verschil tussen geen link en een afgekapte link", () => {
    expect(g.hashLijktOpDaglink("")).toBe(false);
    expect(g.hashLijktOpDaglink("#/prestaties")).toBe(false);   // gewone route
    expect(g.hashLijktOpDaglink("#t=abc")).toBe(true);
    expect(g.hashLijktOpDaglink("#t")).toBe(true);              // afgekapt: wél een poging
    expect(g.parseDaglinkFragment("#t")).toBeNull();            // …maar onbruikbaar
  });
});

// ══ 4 · Data-tab en de volgorde van de opbrengst ══════════════════════

describe("Data-tab alleen als er iets te tonen is", () => {
  const rijenBundel = { kind: "werkruimte", domains: { acties: { rows: [] } } };

  it("blijft staan op de rijenroute", () => {
    expect(g.dataTabBeschikbaar({ bundle: rijenBundel })).toBe(true);
    expect(g.zichtbareTabs({ bundle: rijenBundel }).map((t) => t.key))
      .toEqual(["vandaag", "team", "data", "prestaties"]);
  });

  it("verdwijnt bij een metricsbestand zonder relaties", () => {
    const ctx = { bundle: { kind: "metrics", domains: {} }, relaties: null };
    expect(g.dataTabBeschikbaar(ctx)).toBe(false);
    expect(g.zichtbareTabs(ctx).map((t) => t.key)).toEqual(["vandaag", "team", "prestaties"]);
  });

  /* f29: uit een metricsbestand komen géén rijen maar wél relatiekaarten.
     Die zijn inhoud, dus dan hoort de tab er te blijven. */
  it("blijft staan als het metricsbestand relatiekaarten draagt", () => {
    const ctx = { bundle: { kind: "metrics", domains: {} }, relaties: [{ van: "acties", naar: "organisaties" }] };
    expect(g.dataTabBeschikbaar(ctx)).toBe(true);
  });

  it("valt niet om zonder bundel", () => {
    expect(g.dataTabBeschikbaar(null)).toBe(false);
    expect(g.dataTabBeschikbaar({})).toBe(false);
  });
});

describe("opbrengst: gemeten werk vóór de schatting", () => {
  const ctxMet = (opvolging) => ({
    tijdwinst: { berekenbaar: true, afgerond: 362, totaal: 448, minutenPerActie: 25, minuten: 9050, uren: 150.83 },
    adopt: { componenten: [{ key: "opvolging", label: "Opvolging", ...opvolging }] },
    minutenPerActie: 25,
  });

  it("zet afgerond en op tijd vooraan, de rekenhulp achteraan", () => {
    const c = el();
    g.renderOpbrengstKpis(c, ctxMet({ berekenbaar: true, waarde: 93.78, klaar: 181, verstreken: 193 }));
    expect([...c.querySelectorAll(".kpi-kop")].map((e) => e.textContent))
      .toEqual(["Acties afgerond", "Op tijd afgerond", "Rekenhulp · geschatte tijdwinst"]);
    const tegels = c.querySelectorAll(".kpi-tile");
    expect(tegels[1].querySelector(".kpi-getal").textContent).toBe("94%");
    expect(tegels[1].querySelector(".kpi-label").textContent).toMatch(/181 van 193/);
    // alleen de schatting is 'zacht' — de twee metingen niet
    expect(tegels[0].classList.contains("kpi-zacht")).toBe(false);
    expect(tegels[2].classList.contains("kpi-zacht")).toBe(true);
  });

  it("blijft de schatting als schatting labelen", () => {
    const c = el();
    g.renderOpbrengstKpis(c, ctxMet({ berekenbaar: true, waarde: 90, klaar: 9, verstreken: 10 }));
    expect(c.textContent).toMatch(/schatting op basis van jouw aanname, geen meting/);
    expect(c.textContent).toMatch(/362 × 25 min/);
  });

  it("toont n.v.t. met de reden als opvolging niet te berekenen is", () => {
    const c = el();
    g.renderOpbrengstKpis(c, ctxMet({ berekenbaar: false, reden: "Geen enkele actie met een verstreken deadline." }));
    const tegels = c.querySelectorAll(".kpi-tile");
    expect(tegels[1].querySelector(".kpi-getal").textContent).toBe("n.v.t.");
    expect(tegels[1].getAttribute("data-nvt")).toBe("1");
    expect(tegels[1].textContent).toMatch(/verstreken deadline/);
  });
});
