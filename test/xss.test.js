// @vitest-environment jsdom
/* b32 / AT-003: stored DOM-XSS via dashboard_metrics en daglink-origin.
 * Laadt de echte src-modules (in build-volgorde) in de jsdom-globale scope en
 * rendert vijandige payloads door dezelfde functies die dashboard.html gebruikt. */
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
  "src/zones.js",
  "src/metrics-sanitize.js",
  "src/metrics.js",
  "src/render.js",
  "src/charts.js",
  "src/feed.js",
  "src/homepage.js",
  "src/databrowser.js",
];

const XSS = '"><img src=q onerror=window.__xss=1><li class="';
const TODAY = new Date("2026-08-24T12:00:00Z");

let g;
beforeAll(() => {
  for (const rel of MODULES) {
    vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  }
  g = globalThis;
});

function el() {
  const d = document.createElement("div");
  document.body.appendChild(d);
  return d;
}

function vijandigPayload() {
  return {
    versie: 1,
    gegenereerd_op: "2026-08-24",
    aandacht: [
      { type: "deadline", ernst: XSS, label: `<b>${XSS}</b>`, link: "javascript:alert(1)" },
    ],
    domeinen: { [XSS]: { laatst_bijgewerkt: "2020-01-01", rijen: 3 }, acties: { laatst_bijgewerkt: "2020-01-01", rijen: 3 } },
    acties: { totaal: XSS, afgerond: "<script>1</script>", opmerking: XSS },
    sales_funnel: { per_fase: { [XSS]: XSS }, verwachte_omzet_totaal: XSS },
    content: { gepubliceerd: XSS },
    klantsucces: { in_onboarding: XSS },
    backlog: { besloten: XSS },
    lessen: { totaal: XSS, open: XSS, in_periode: XSS, per_categorie: { [XSS]: XSS } },
    weekreeks: { bronnen: ["dagverslagen"], buckets: [{ week_start: "2026-08-17", label: XSS, waarden: { interacties: XSS } }] },
    agents: { per_agent: { [XSS]: { aantal_periode: XSS }, jurist: { aantal_periode: 2, aantal_totaal: "<x>" } } },
  };
}

/* Structurele checks: de payload mag alleen als tekst overleven (geëscaped),
 * nooit als element of attribuut. */
function geenInjectie(container) {
  expect(container.querySelectorAll("img, script, iframe, svg").length).toBe(0);
  expect(container.querySelector("[onerror], [onload], [onclick]")).toBeNull();
  expect(g.__xss).toBeUndefined();
}

describe("saneerMetricsPayload", () => {
  it("laat alleen bekende velden in het juiste type door", () => {
    const uit = g.saneerMetricsPayload(vijandigPayload(), g.AGENTIC_TEAM_SCHEMA);
    expect(uit.aandacht[0]).toEqual({ type: "deadline", ernst: "grijs", label: `<b>${XSS}</b>`.slice(0, 300), link: null });
    expect(uit.waarschuwingen.length).toBeGreaterThan(0);
    expect(Object.keys(uit.domeinen)).toEqual(["acties"]);
    expect(uit.acties).toMatchObject({ totaal: 0, afgerond: 0 });
    expect(uit.sales_funnel.verwachte_omzet_totaal).toBe(0);
    expect(uit.lessen).toMatchObject({ totaal: 0, open: 0, in_periode: 0 });
    expect(Object.keys(uit.agents.per_agent)).toEqual(["jurist"]);
    expect(uit.agents.per_agent.jurist).toEqual({ aantal_periode: 2, aantal_totaal: 0, laatst: null });
  });

  it("coerceert wat de Coördinator echt schrijft (review b32) in plaats van te nullen", () => {
    const uit = g.saneerMetricsPayload({
      versie: 1,
      gegenereerd_op: "2026-08-24T09:15:00+0200",
      minuten_per_actie: "25",
      periode: { weken: "8", van: "2026-06-29", tot: "2026-08-24" },
      acties: { totaal: "12", afgerond: "7" },
      aandacht: [{ type: "acties-deadline", ernst: "rood", label: "x" }, { type: "deals-stil", ernst: "paars", label: "y" }],
      agents: { per_agent: { Jurist: { aantal_periode: "2" }, jurist: { aantal_periode: 1 }, Onbekend: { aantal_periode: 9 } } },
    }, g.AGENTIC_TEAM_SCHEMA);
    expect(uit.gegenereerd_op).toBe("2026-08-24T09:15:00+0200");
    expect(uit.minuten_per_actie).toBe(25);
    expect(uit.periode).toEqual({ weken: 8, van: "2026-06-29", tot: "2026-08-24" });
    expect(uit.acties).toMatchObject({ totaal: 12, afgerond: 7 });
    expect(uit.aandacht.map(a => a.type)).toEqual(["acties-deadline", "deals-stil"]);
    expect(uit.aandacht[1].ernst).toBe("grijs");
    expect(Object.keys(uit.agents.per_agent)).toEqual(["jurist"]);
    expect(uit.waarschuwingen.some(w => w.includes("aandacht[1].ernst"))).toBe(true);
    expect(uit.waarschuwingen.some(w => w.includes("Onbekend"))).toBe(true);
  });

  it("geeft null voor niet-objecten", () => {
    expect(g.saneerMetricsPayload("x", g.AGENTIC_TEAM_SCHEMA)).toBeNull();
    expect(g.saneerMetricsPayload([1], g.AGENTIC_TEAM_SCHEMA)).toBeNull();
  });
});

describe("render met vijandig metricsbestand", () => {
  let metrics;
  beforeAll(() => {
    const result = g.parseNotionMetricsFile(vijandigPayload(), g.AGENTIC_TEAM_SCHEMA, TODAY, 25);
    expect(result.ok).toBe(true);
    metrics = result.metrics;
  });

  it("zone 1 (aandacht + verouderde domeinen) escapet ernst, label en domeinsleutels", () => {
    const c = el();
    g.renderZone1(c, metrics.z1);
    geenInjectie(c);
    const klassen = [...c.querySelectorAll("li")].map(li => li.className);
    expect(klassen.every(k => ["rood", "oranje", "groen", "grijs"].includes(k))).toBe(true);
    expect(c.textContent).toContain("<b>");
  });

  it("aandacht-top-5 op de homepage", () => {
    const c = el();
    g.renderAandachtTop5(c, metrics.z1);
    geenInjectie(c);
  });

  it("zone 4 (opbrengst) escapet de getal-slots", () => {
    const c = el();
    g.renderZone4(c, metrics.z4, 84);
    geenInjectie(c);
    expect(c.textContent).toContain("0 / 0");
  });

  it("zone 5 (leren)", () => {
    const c = el();
    g.renderZone5(c, metrics.z5, 84);
    geenInjectie(c);
  });

  it("opbrengst-tegels met minutenPerActie uit een vijandige waarde", () => {
    const c = el();
    g.renderOpbrengstKpis(c, { tijdwinst: metrics.tijdwinst, minutenPerActie: XSS });
    geenInjectie(c);
    expect(c.querySelector("#input-minuten").getAttribute("value")).toBe(XSS);
  });

  it("prestatie-tegels met een vijandige adopt/correctievrij-inhoud", () => {
    const c = el();
    g.renderPrestatieKpis(c, { adopt: metrics.adopt, sporenTotaal: metrics.sporenTotaal, periodWeeks: 12, correctievrij: { aanwezig: false, reden: XSS }, intern: true });
    geenInjectie(c);
    expect(c.textContent).toContain(XSS);
  });
});

describe("render.js zelf — ook zonder sanitizer geen markup", () => {
  it("card()-getal en domeinen worden geëscaped", () => {
    const c = el();
    g.renderZone4(c, { acties: { totaal: XSS, afgerond: XSS, opmerking: "" } }, 84);
    geenInjectie(c);
    const d = el();
    g.renderZone1(d, [{ type: "verouderd", ernst: XSS, label: "x", domeinen: [XSS], rows: null }]);
    geenInjectie(d);
  });
});

describe("parseDaglinkFragment (b32 fase 2: altijd via de router)", () => {
  it("negeert elke i-parameter behalve localhost en praat via connector.agentic-team.ai", () => {
    const via = { token: "abc", instantieUrl: "https://connector.agentic-team.ai" };
    expect(g.parseDaglinkFragment("#t=abc")).toEqual(via);
    expect(g.parseDaglinkFragment("#t=abc&i=https://wr-x.westeurope.azurecontainerapps.io")).toEqual(via);
    expect(g.parseDaglinkFragment("#t=abc&i=https://evil.example.com")).toEqual(via);
    expect(g.parseDaglinkFragment("#t=abc&i=javascript:alert(1)")).toEqual(via);
    expect(g.parseDaglinkFragment("#t=abc&i=http://localhost:8080")).toEqual({ token: "abc", instantieUrl: "http://localhost:8080" });
    expect(g.parseDaglinkFragment("#/detail/agent/jurist")).toBeNull();
    expect(g.parseDaglinkFragment("#i=https://x")).toBeNull();
  });

  it("restoreDaglink gooit een opgeslagen sessie met een vreemde bestemming weg (pre-fase-2)", () => {
    sessionStorage.setItem("agentic-team-dashboard:daglink", JSON.stringify({ token: "abc", instantieUrl: "https://wr-x.westeurope.azurecontainerapps.io" }));
    expect(g.restoreDaglink()).toBeNull();
    expect(sessionStorage.getItem("agentic-team-dashboard:daglink")).toBeNull();
    sessionStorage.setItem("agentic-team-dashboard:daglink", JSON.stringify({ token: "abc", instantieUrl: "https://connector.agentic-team.ai" }));
    expect(g.restoreDaglink()).toEqual({ token: "abc", instantieUrl: "https://connector.agentic-team.ai" });
  });
});

describe("CSP (b32 fase 2)", () => {
  it("dashboard.html draagt script-src-hashes die exact bij de twee inline scriptblokken horen", async () => {
    const { createHash } = await import("node:crypto");
    const html = readFileSync(join(ROOT, "dashboard.html"), "utf8");
    const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="script-src ([^"]+)">/);
    expect(meta).not.toBeNull();
    const hashes = meta[1].split(" ");
    const blokken = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(blokken).toHaveLength(2);
    const verwacht = blokken.map((b) => "'sha256-" + createHash("sha256").update(b, "utf8").digest("base64") + "'");
    expect(hashes).toEqual(verwacht);
    expect(html).not.toMatch(/ on[a-z]+="/i);
    const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
    const header = vercel.headers[0].headers[0].value;
    expect(header).toContain("connect-src https://connector.agentic-team.ai");
    // Header en meta dragen dezelfde hashes; 'unsafe-inline' staat niet meer in script-src.
    expect(header).toContain(`script-src ${verwacht.join(" ")};`);
    expect(header).not.toMatch(/script-src[^;]*unsafe-inline/);
  });
});

/* f22 — teamfeed: entries zijn LLM-tekst uit de werkruimte; alleen esc()
 * plus **vet** en "- "-lijsten mogen het rendering halen. */
describe("teamfeed (f22)", () => {
  const nu = new Date(TODAY);
  const iso = (minGeleden) => new Date(nu.getTime() - minGeleden * 60000).toISOString();
  function entries() {
    return [
      { entryId: "a", aangemaakt: iso(10), data: { Actie: "Dagstart", Agent: "orchestrator", Soort: "afgerond", Bericht: "Dagstart afgerond: 2 prioriteiten.\n**Prioriteiten:**\n- Offerte **Van Dijk**\n- Q3-cijfers", Link: "https://voorbeeld.nl/a" } },
      { entryId: "b", aangemaakt: iso(120), data: { Actie: "werkronde gestart", Agent: "orchestrator", Soort: "rondestart", Bericht: "werkronde gestart: 2 acties", Link: "" } },
      { entryId: "c", aangemaakt: iso(30), data: { Actie: "werkronde gestart", Agent: "orchestrator", Soort: "rondestart", Bericht: "werkronde gestart: 1 actie", Link: "" } },
      { entryId: "d", aangemaakt: iso(60), data: { Actie: XSS, Agent: "stagiair", Soort: "<script>", Bericht: `${XSS}\n- <img src=x onerror=window.__xss=1>\n**<b>kop</b>**`, Link: "javascript:alert(1)" } },
      { entryId: "e", aangemaakt: iso(2000), data: { Actie: "Lang", Agent: "Pipeline Manager", Soort: "voorstel", Bericht: "Kernzin.\n" + "x".repeat(600), Link: "https://voorbeeld.nl/e" } },
    ];
  }
  function ctxMet(bundle) {
    return { bundle, schema: g.AGENTIC_TEAM_SCHEMA, agentLookup: g.buildAgentLookup(), today: nu };
  }

  it("normaliseert: agent-slug én displayName matchen, onbekende soort/agent degraderen, link alleen https", () => {
    const items = g.normaliseerFeed(entries(), g.AGENTIC_TEAM_SCHEMA, g.buildAgentLookup());
    expect(items.map(i => i.id)).toEqual(["a", "c", "d", "b", "e"]); // nieuwste eerst
    const d = items.find(i => i.id === "d");
    expect(d.soort).toBe("update");
    expect(d.agentSlug).toBeNull();
    expect(d.agentEmoji).toBe("🤖");
    expect(d.link).toBeNull();
    expect(items.find(i => i.id === "e").agentSlug).toBe("pipeline-manager");
  });

  it("markeert een rondestart zonder afronding na 90 minuten als open lus — een verse niet", () => {
    const items = g.markeerOpenLussen(g.normaliseerFeed(entries(), g.AGENTIC_TEAM_SCHEMA, g.buildAgentLookup()), nu);
    expect(items.find(i => i.id === "b").openLus).toBe(true);
    expect(items.find(i => i.id === "c").openLus).toBe(false);
  });

  it("feedTekstHtml: alleen vet en lijsten, al het andere als tekst", () => {
    const c = el();
    c.innerHTML = g.feedTekstHtml(`${XSS}\n**Kop:**\n- <img src=x onerror=window.__xss=1>\n- **vet** woord`);
    geenInjectie(c);
    expect(c.querySelectorAll("li").length).toBe(2);
    expect(c.querySelector("strong").textContent).toBe("vet");
    expect(c.querySelector(".feed-kop").textContent).toBe("Kop:");
    expect(c.textContent).toContain("<img");
  });

  it("vouwt lange berichten in", () => {
    const c = el();
    c.innerHTML = g.feedTekstHtml("Kernzin.\n" + "x".repeat(600));
    expect(c.querySelector("details summary").textContent).toBe("meer");
  });

  it("renderDetailFeed: vijandige entries, dagkoppen, agentfilter", () => {
    const c = el();
    g.renderDetailFeed(c, ctxMet({ source: "werkruimte", kind: "rows", teamfeed: { entries: entries() } }));
    geenInjectie(c);
    expect(c.querySelectorAll(".feed-rij").length).toBe(5);
    expect(c.querySelectorAll(".feed-dag").length).toBeGreaterThanOrEqual(2);
    expect(c.querySelector('a[href="javascript:alert(1)"]')).toBeNull();
    expect(c.querySelector('a.agent[href="#/detail/agent/orchestrator"]')).not.toBeNull();
    expect(c.querySelector(".feed-rij.open-lus").textContent).toContain("afgerond — geen samenvatting");
    c.querySelector('[data-feed-filter="pipeline-manager"]').click();
    expect(c.querySelectorAll(".feed-rij").length).toBe(1);
    expect(c.querySelector('[data-feed-filter="pipeline-manager"]').classList.contains("actief")).toBe(true);
  });

  it("renderFeedPanel: maximaal vijf, met doorklik; leeg en degradatie netjes", () => {
    const c = el();
    g.renderFeedPanel(c, ctxMet({ source: "werkruimte", kind: "rows", teamfeed: { entries: entries() } }));
    geenInjectie(c);
    expect(c.querySelectorAll(".feed-rij").length).toBe(3); // f25: de strook toont er drie
    expect(c.querySelector('a[href="#/team"]')).not.toBeNull();

    const leeg = el();
    g.renderFeedPanel(leeg, ctxMet({ source: "werkruimte", kind: "rows", teamfeed: { entries: [] } }));
    expect(leeg.textContent).toContain("Nog geen teamactiviteit");

    const oud = el();
    g.renderFeedPanel(oud, ctxMet({ source: "werkruimte", kind: "rows", teamfeed: null }));
    expect(oud.textContent).toContain("kent de teamfeed nog niet");

    const bestand = el();
    g.renderDetailFeed(bestand, ctxMet({ source: "excel", kind: "rows", teamfeed: null }));
    expect(bestand.textContent).toContain("daglink van je Coördinator");
  });
});
