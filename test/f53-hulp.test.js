// @vitest-environment jsdom
/* f53 — Hulp in het dashboard (src/hulp.js).
 *
 * Klaar-als uit Notion: een klant komt zonder schermdelen door de installatie
 * van het werkmoment; geen screenshots of base64. Verder: #/hulp werkt zonder
 * login en zonder data, en is de lege staat in plaats van alleen "Geen daglink
 * gevonden". De tweede helft draait het échte, gebouwde dashboard.html. */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
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
];

let g;
beforeAll(() => {
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
});
beforeEach(() => { document.body.innerHTML = `<div id="melding" hidden></div>`; });
afterEach(() => { vi.restoreAllMocks(); window.location.hash = ""; });

const NU = new Date(2026, 8, 29, 7, 42);
function open(ctx = null, opties = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  g.renderHulp(el, ctx, opties);
  return el;
}
const zichtbaar = (el) => [...el.querySelectorAll("[data-hulp-sectie]")].filter(d => !d.hidden).map(d => d.getAttribute("data-hulp-sectie"));

describe("f53 — de route", () => {
  it("#/hulp en #/hulp/<sectie>, en niets anders", () => {
    expect(g.hulpDoel("#/hulp")).toEqual({ sectie: null });
    expect(g.hulpDoel("#/hulp/daglink")).toEqual({ sectie: "daglink" });
    expect(g.hulpDoel("#/hulpje")).toBeNull();
    expect(g.hulpDoel("#/acties")).toBeNull();
    expect(g.hulpDoel("")).toBeNull();
  });
});

describe("f53 — zonder login en zonder data", () => {
  it("toont alle secties, zonder één verwijzing naar je eigen gegevens", () => {
    const el = open(null);
    expect(el.querySelector(".hulp-titel").textContent).toBe("Hoe werkt je team?");
    expect(zichtbaar(el)).toEqual(["in-een-minuut", "voor-jou", "wie-aan-zet", "vanzelf-werken", "vaste-taken", "voorbeelden",
      "grote-klussen", "opdracht", "daglink", "zeggen", "werkt-niet", "gegevens", "notion", "woorden"]);
    expect(el.querySelector(".kc-samenvatting")).toBeNull();
    expect(el.querySelector('a[href^="#/"]:not([href^="#/hulp"])')).toBeNull();
  });

  it("de hele installatie van het werkmoment staat erin: zin, Schedule, of zelf invullen", () => {
    const el = open(null, { sectie: "vanzelf-werken" });
    const sectie = el.querySelector("#hulp-vanzelf-werken");
    expect(sectie.open).toBe(true);
    const kopieer = [...sectie.querySelectorAll("[data-vt-kopieer]")].map(k => k.getAttribute("data-vt-kopieer"));
    expect(kopieer).toEqual(["Zet mijn ritmetaken aan.", "Werkmoment — je bedrijf", vm.runInThisContext("WERKMOMENT_OPDRACHT")]);
    expect(sectie.textContent).toContain("Druk op Schedule");
    expect(sectie.textContent).toContain("Scheduled › New task");
    expect(sectie.textContent).toContain("Agentic Team-connector aan");
    expect(sectie.textContent).toContain("hooguit 3 open acties en 1 vaste taak");
  });

  it("ook als de vaste taken al aanstaan: in de Hulp altijd de hele installatie", () => {
    const ctx = { schema: g.AGENTIC_TEAM_SCHEMA, today: NU, bundle: { kind: "rows", source: "werkruimte", klant: "Verbeek Advies", systeemPerDomein: {},
      domains: { ritmetaken: { rows: [{ __entryId: "t", Actief: true, Ritme: "dagelijks" }] }, acties: { rows: [] } } } };
    const el = open(ctx, { sectie: "vanzelf-werken" });
    const kopieer = [...el.querySelectorAll("#hulp-vanzelf-werken [data-vt-kopieer]")].map(k => k.getAttribute("data-vt-kopieer"));
    expect(kopieer.slice(0, 2)).toEqual(["Zet mijn ritmetaken aan.", "Werkmoment — Verbeek Advies"]);
  });

  it("geen screenshots en geen base64", () => {
    const bron = readFileSync(join(ROOT, "src/hulp.js"), "utf8");
    expect(bron).not.toMatch(/data:|base64|<img/i);
  });
});

describe("f53 — zoeken, voorbeelden, kopiëren", () => {
  it("zoeken filtert ter plekke en klapt open wat past", () => {
    const el = open(null);
    const zoek = el.querySelector("[data-hulp-zoek]");
    zoek.value = "24 uur";
    zoek.dispatchEvent(new Event("input"));
    expect(zichtbaar(el)).toEqual(["daglink", "woorden"]);
    expect(el.querySelector("#hulp-daglink").open).toBe(true);
    expect(el.querySelector("[data-hulp-intro]").hidden).toBe(true);
    zoek.value = "xyzzy";
    zoek.dispatchEvent(new Event("input"));
    expect(el.querySelector("[data-hulp-niets]").hidden).toBe(false);
    zoek.value = "";
    zoek.dispatchEvent(new Event("input"));
    expect(zichtbaar(el)).toHaveLength(14);
  });

  it("een voorbeeld loop je stap voor stap door, zonder dat de rest dichtklapt", () => {
    const el = open(null, { sectie: "voorbeelden" });
    el.querySelector("#hulp-daglink").open = true;
    el.querySelector("[data-hulp-stap]").click();
    expect(el.querySelector(".hulp-tijdlijn li.nu").textContent).toContain("Jij plakt je notities in Claude");
    el.querySelector("[data-hulp-stap]").click();
    expect(el.querySelector(".hulp-tijdlijn li.nu").textContent).toContain("Elke afspraak wordt een actie");
    el.querySelector('[data-hulp-vb="fact"]').click();
    expect(el.querySelector(".hulp-tijdlijn li.nu")).toBeNull();
    expect(el.querySelector("[data-hulp-vb-blok] h3").textContent).toContain("facturatie");
    expect(el.querySelector("#hulp-daglink").open).toBe(true);
  });

  it("de ketens komen uit het register, met de namen uit het schema en de vier beslismomenten van de contentketen", () => {
    const el = open(null, { sectie: "grote-klussen" });
    const ketens = [...el.querySelectorAll(".hulp-keten")];
    expect(ketens).toHaveLength(3);
    expect(ketens[1].textContent).toContain("SEO/GEO Specialist");
    // drie ruitjes en de laatste stap is van jou: vier momenten waarop jij beslist
    expect(ketens[1].querySelectorAll(".hulp-ruit")).toHaveLength(3);
    expect(ketens[1].querySelector(".hulp-station.jij").textContent).toBe("Jij publiceert");
  });

  it("kopiëren meldt wat je ermee doet", async () => {
    const kopieer = vi.fn(async () => true);
    const echt = g.kopieerTekst;
    g.kopieerTekst = kopieer;
    try {
      const el = open(null, { sectie: "zeggen" });
      el.querySelector('#hulp-zeggen [data-vt-kopieer="Start mijn dag."]').click();
      await vi.waitFor(() => expect(document.getElementById("melding").textContent).toContain("Plak het in Claude"));
      expect(kopieer).toHaveBeenCalledWith("Start mijn dag.");
    } finally { g.kopieerTekst = echt; }
  });
});

describe("f53 — met je eigen gegevens", () => {
  const ctxMet = () => ({ schema: g.AGENTIC_TEAM_SCHEMA, today: NU, kanSchrijven: true,
    bundle: { kind: "rows", source: "werkruimte", systeemPerDomein: {}, domains: { ritmetaken: { rows: [] }, acties: { rows: [] } } } });

  it("bovenaan de klaar-check, en per sectie een weg naar je eigen scherm", () => {
    const el = open(ctxMet());
    expect(el.querySelector("a.kc-samenvatting").getAttribute("href")).toBe("#/klaar");
    expect(el.querySelector('#hulp-vaste-taken a[href="#/vaste-taken"]')).not.toBeNull();
    expect(el.querySelector('#hulp-wie-aan-zet a[href="#/acties"]')).not.toBeNull();
  });

  it("'Hoe werkt dit?' op Voor jou, Acties, Vaste taken en de klaar-check", () => {
    const ctx = ctxMet();
    ctx.bundle.domains.acties.rows = [{ __entryId: "a", Actie: "Factuur", Status: "Open", Deadline: "2026-09-20" }];
    const paneel = document.createElement("section");
    paneel.innerHTML = `<div id="panel-voor-jou-body"></div>`;
    document.body.appendChild(paneel);
    g.renderVoorJou(paneel, ctx);
    expect(paneel.querySelector('a[href="#/hulp/voor-jou"]')).not.toBeNull();
    const acties = document.createElement("div");
    g.renderActiesTab(acties, ctx);
    expect(acties.querySelector('a[href="#/hulp/wie-aan-zet"]')).not.toBeNull();
    expect(g.vasteTakenHtml(ctx)).toContain('href="#/hulp/vaste-taken"');
    const klaar = document.createElement("div");
    g.renderKlaar(klaar, ctx);
    expect(klaar.querySelector('a[href="#/hulp/vanzelf-werken"]')).not.toBeNull();
  });
});

/* ── het echte dashboard: de Hulp als lege staat ─────────────────────── */

const HTML = readFileSync(join(ROOT, "dashboard.html"), "utf8");
const HTML_MET_LOGIN = HTML.replace("<title>", '<meta name="at-oauth" content="1">\n<title>');

const FIXTURE = JSON.parse(readFileSync(join(ROOT, "test/fixtures/oauth-fixture.json"), "utf8"));
const SESSIE = { access_token: FIXTURE.tokens.dashboard.jwt, token_type: "Bearer", refresh_token: "atr_x", scope: "dashboard:lees" };

async function dashboard({ html = HTML, hash = "", sessie = null } = {}) {
  const fouten = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously", url: "http://localhost/dashboard.html" + hash, pretendToBeVisual: true,
    beforeParse(w) {
      w.console.error = (...a) => fouten.push(a.map(String).join(" "));
      w.scrollTo = () => {};
      w.addEventListener("error", (e) => fouten.push("error:" + e.message));
      w.Response = Response;
      if (sessie) w.sessionStorage.setItem("agentic-team-dashboard:oauth", JSON.stringify(sessie));
      w.fetch = async (u) => {
        if (!sessie) throw new Error("geen netwerk verwacht");
        const pad = new URL(String(u)).pathname;
        const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
        if (pad === "/dashboard/overzicht") return json({ klant: "Testbedrijf BV", intern: false, domeinen: [{ domein: "acties", aantal: 1 }] });
        if (pad === "/dashboard/entries") return json({ domein: "acties", entries: [{ domein: "acties", entryId: "a-1", data: { Actie: "Offerte", Status: "Open" }, aangemaakt: "2026-09-20T09:00:00Z", bijgewerkt: "2026-09-20T09:00:00Z" }] });
        return json({ fout: "niet hier" }, 404);
      };
    },
  });
  const w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 20; i++) await tick();
  const $ = (id) => w.document.getElementById(id);
  return { w, $, fouten, tick, zichtbaar: (id) => $(id).style.display !== "none" };
}

describe("f53 — in het gebouwde dashboard", () => {
  it("zonder daglink of sessie: inloggen bovenaan, de Hulp eronder", async () => {
    const { $, zichtbaar, fouten } = await dashboard({ html: HTML_MET_LOGIN });
    expect(fouten).toEqual([]);
    expect($("empty-state-titel").textContent).toBe("Log in om je team te zien");
    expect(zichtbaar("empty-state-acties")).toBe(true);
    expect($("empty-state-privacy").textContent.length).toBeGreaterThan(20);
    expect(zichtbaar("tab-hulp")).toBe(true);
    expect($("tab-hulp-body").textContent).toContain("Hoe werkt je team?");
  });

  it("kan er niet ingelogd worden: de daglink-uitleg blijft de kop, de Hulp staat eronder", async () => {
    const { $, zichtbaar } = await dashboard();
    expect($("empty-state-titel").textContent).toBe("Geen daglink gevonden");
    expect(zichtbaar("tab-hulp")).toBe(true);
  });

  it("#/hulp/daglink zonder sessie: geen inlogpoort, de sectie staat open", async () => {
    const { $, w } = await dashboard({ html: HTML_MET_LOGIN, hash: "#/hulp/daglink" });
    expect($("empty-state-titel").textContent).not.toBe("Log in om deze pagina te openen");
    expect(w.document.querySelector("#hulp-daglink").open).toBe(true);
    expect(w.document.title).toBe("Hulp — Agentic Team Dashboard");
  });

  it("een andere deeplink zonder sessie houdt de inlogpoort", async () => {
    const { $ } = await dashboard({ html: HTML_MET_LOGIN, hash: "#/acties/a-1" });
    expect($("empty-state-titel").textContent).toBe("Log in om deze pagina te openen");
  });

  it("herladen met een sessie blijft op de pagina waar je was", async () => {
    const { w, zichtbaar } = await dashboard({ html: HTML_MET_LOGIN, hash: "#/hulp/daglink", sessie: SESSIE });
    for (let i = 0; i < 200 && !w.__dashboardCtx; i++) await new Promise((r) => setTimeout(r, 0));
    expect(w.__dashboardCtx).toBeTruthy();
    expect(w.location.hash).toBe("#/hulp/daglink");
    expect(zichtbaar("tab-hulp")).toBe(true);
    expect(zichtbaar("empty-state")).toBe(false);
    expect(w.document.querySelector("#tab-hulp-body .kc-samenvatting, #tab-hulp-body .hulp-titel")).not.toBeNull();
  });

  it("de kop heeft altijd een weg naar de Hulp", async () => {
    const { w } = await dashboard();
    expect(w.document.querySelector('header a.kop-hulp[href="#/hulp"]')).not.toBeNull();
  });
});
