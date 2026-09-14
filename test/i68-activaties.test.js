// @vitest-environment jsdom
/* i68 — gebruik per agent meet inzet, niet sporen.
 *
 * De tegel telde rijen met een agentnaam. Een agent die draaide maar niets
 * wegschreef stond daardoor op nul. De werkruimte-instantie telt nu zelf hoe
 * vaak een agent aan de slag ging; het dashboard toont dát, en alleen dat —
 * niet een tweede telling ernaast die het tegenspreekt.
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
];

const VANDAAG = new Date("2026-09-16T12:00:00Z");
let g;
beforeAll(() => {
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
});

const schema = () => g.getSchema();
const el = () => document.createElement("div");
const slug = (i) => schema().agents[i].slug;

function teller() {
  return g.saneerActivaties({
    sinds: "2026-05-04",
    weken: [
      { week_start: "2026-05-04", per_agent: { [slug(0)]: 7 } },           // ver buiten 84 dagen
      { week_start: "2026-09-07", per_agent: { [slug(1)]: 3, [slug(0)]: 1 } },
      { week_start: "2026-09-14", per_agent: { [slug(1)]: 2 } },
    ],
  }, schema());
}

describe("saneren bij binnenkomst", () => {
  it("laat alleen bekende agents, hele aantallen en geldige weken door", () => {
    const uit = g.saneerActivaties({
      sinds: "2026-09-07",
      weken: [
        { week_start: "2026-09-07", per_agent: { [slug(0)]: 2, "<img src=x onerror=alert(1)>": 5, [slug(1)]: -1, [slug(2)]: 1.5, [slug(3)]: "4" } },
        { week_start: "gisteren", per_agent: { [slug(0)]: 9 } },
        { week_start: "2026-02-31", per_agent: { [slug(0)]: 9 } },
        null,
      ],
    }, schema());
    expect(uit).toEqual({ sinds: "2026-09-07", weken: [{ week_start: "2026-09-07", per_agent: { [slug(0)]: 2 } }] });
  });

  it("geeft null als de instantie nog geen teller heeft", () => {
    expect(g.saneerActivaties(undefined, schema())).toBeNull();
    expect(g.saneerActivaties([], schema())).toBeNull();
  });
});

describe("de ranglijst uit de teller", () => {
  it("scheidt de periode van het totaal sinds de start", () => {
    const uit = g.agentGebruikUitActivaties(teller(), schema(), VANDAAG, 84);
    expect(uit.bron).toBe("activaties");
    expect(uit.sinds).toBe("2026-05-04");
    const rij = (s) => uit.ranking.find((r) => r.slug === s);
    expect(rij(slug(1))).toMatchObject({ value: 5, totaal: 5 });
    expect(rij(slug(0))).toMatchObject({ value: 1, totaal: 8 });
    expect(uit.ranking[0].slug).toBe(slug(1));
    expect(uit.perWeek).toEqual([
      { week_start: "2026-09-07", totaal: 4 },
      { week_start: "2026-09-14", totaal: 2 },
    ]);
  });

  it("zegt niets zolang er nog niets geteld is", () => {
    expect(g.agentGebruikUitActivaties({ sinds: null, weken: [] }, schema(), VANDAAG, 84)).toBeNull();
    expect(g.agentGebruikUitActivaties(null, schema(), VANDAAG, 84)).toBeNull();
  });

  it("gaat vóór de sporen én vóór de teamfeed — nooit twee tellingen naast elkaar", () => {
    const sporen = { status: "ok", ranking: schema().agents.map((a, i) => ({ slug: a.slug, value: i === 2 ? 9 : 0, totaal: i === 2 ? 9 : 0 })) };
    const naam = schema().agents[2].displayName;
    const feed = g.normaliseerFeed([{ entryId: "1", aangemaakt: VANDAAG.toISOString(), data: { Agent: naam, Soort: "update", Bericht: "x" } }], schema(), g.buildAgentLookup());
    const uit = g.kiesAgentGebruik(sporen, feed, schema(), VANDAAG, 84, teller());
    expect(uit.bron).toBe("activaties");
    expect(uit.ranking.find((r) => r.slug === slug(2)).totaal).toBe(0);
  });

  it("valt terug op het oude gedrag bij een instantie zonder teller", () => {
    const sporen = { status: "ok", ranking: schema().agents.map((a, i) => ({ slug: a.slug, value: i === 0 ? 1 : 0, totaal: i === 0 ? 1 : 0 })) };
    expect(g.kiesAgentGebruik(sporen, [], schema(), VANDAAG, 84, null)).toBe(sporen);
    expect(g.kiesAgentGebruik(sporen, [], schema(), VANDAAG, 84)).toBe(sporen);
  });
});

describe("het scherm", () => {
  const ctxMet = (usage) => ({ agentUsage: usage, schema: schema(), periodDays: 84, today: VANDAAG });

  it("de tegel noemt inzet, niet sporen", () => {
    const c = el();
    g.renderGebruikPanel(c, g.agentGebruikUitActivaties(teller(), schema(), VANDAAG, 84));
    expect(c.textContent).toMatch(/2 van \d+ agents is minstens één keer ingezet sinds 04-05-2026/);
    expect(c.textContent).toMatch(/ook zonder iets weg te schrijven/);
    expect(c.textContent).not.toMatch(/spoor/);
  });

  it("het detail toont inzet per module en per week, zonder sporentelling ernaast", () => {
    const usage = g.agentGebruikUitActivaties(teller(), schema(), VANDAAG, 84);
    const c = el();
    g.renderDetailGebruik(c, { perModule: {}, geenEnkeleBron: true }, schema(), VANDAAG, 84, usage, null);
    expect(c.textContent).toMatch(/5× ingezet in 84d · 5× sinds 04-05-2026/);
    expect(c.textContent).toMatch(/nog niet ingezet sinds 04-05-2026/);
    expect(c.textContent).toMatch(/Inzet per week/);
    expect(c.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(c.textContent).not.toMatch(/Geen sporen|Sporen komen uit/);
    expect(c.querySelector(`[data-goto="agent/${slug(1)}"]`)).not.toBeNull();
  });

  it("de herkomst legt uit wat er geteld wordt en dat er geen inhoud meegaat", () => {
    const c = el();
    const usage = g.agentGebruikUitActivaties(teller(), schema(), VANDAAG, 84);
    // Woont in app.js (localStorage); die laden we hier bewust niet.
    g.leesLaatstGebruikt = () => null;
    g.renderHerkomst(c, {
      ...ctxMet(usage),
      activiteit: { aanwezigeBronnen: [], ontbrekendeBronnen: [] },
      adopt: { componenten: [] },
      tijdwinst: { berekenbaar: true },
      bundle: { kind: "rows", domains: {} },
      waarschuwingen: [], bundelWaarschuwingen: [], veldWaarschuwingen: [],
    });
    expect(c.innerHTML).toMatch(/telt inzet/);
    expect(c.innerHTML).toMatch(/geen gesprek of inhoud mee/);
    expect(c.innerHTML).not.toMatch(/niet noodzakelijk "nooit ingezet"/);
  });
});

describe("de loader", () => {
  const echteFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = echteFetch; });

  function zetOverzicht(extra) {
    globalThis.fetch = async (url) => ({
      ok: true, status: 200, headers: new Map(),
      json: async () => String(url).endsWith("/dashboard/overzicht")
        ? { klant: "Testklant", domeinen: [], ...extra }
        : { entries: [] },
    });
  }
  const BRON = { soort: "daglink", instantieUrl: "https://instantie.test", token: "t" };

  it("neemt de gesaneerde teller mee in de bundel", async () => {
    zetOverzicht({ activaties: { sinds: "2026-09-14", weken: [{ week_start: "2026-09-14", per_agent: { [slug(0)]: 1, nep: 3 } }] } });
    const bundle = await g.loadWerkruimteBundle(BRON);
    expect(bundle.activaties).toEqual({ sinds: "2026-09-14", weken: [{ week_start: "2026-09-14", per_agent: { [slug(0)]: 1 } }] });
  });

  it("zet null bij een instantie die het veld nog niet kent", async () => {
    zetOverzicht({});
    expect((await g.loadWerkruimteBundle(BRON)).activaties).toBeNull();
  });
});
