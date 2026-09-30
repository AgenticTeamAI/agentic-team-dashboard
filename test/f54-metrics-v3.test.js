// @vitest-environment jsdom
/* f54 — de werkbak en de vaste taken voor Notion-klanten, uit het
 * metricsbestand van de dagstart (optionele blokken voor_jou en ritmetaken,
 * binnen versie 2). Klaar-als: Notion-klanten zien een echte werkbak met
 * "Open in Notion". Contract: zelfde als werkruimte src/domeinen/metrics.ts en
 * de orchestrator-prompt. */
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [
  "schema/schema.generated.js", "src/teksten.js", "src/schema-helpers.js", "src/werkruimte-loader.js", "src/oauth-client.js",
  "src/zones.js", "src/voor-jou.js", "src/metrics-sanitize.js", "src/metrics.js", "src/render.js", "src/charts.js", "src/feed.js",
  "src/homepage.js", "src/databrowser.js", "src/data-bewerken.js", "src/item-blad.js", "src/voor-jou-scherm.js", "src/acties-tab.js",
  "src/vaste-taken.js", "src/hulp.js", "src/opdracht.js", "src/rijpagina.js", "src/notion-werk.js",
];

let g;
let MA;
beforeAll(() => {
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
  MA = g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === "management-assistent").displayName;
});
beforeEach(() => { document.body.innerHTML = `<div id="melding" hidden></div>`; });

const NU = new Date(2026, 8, 29, 7, 42);
const blokken = (o = {}) => ({
  voor_jou: { items: [
    { nr: 1, titel: "Offerte Van Dam nakijken", soort: "check", te_laat: true, specialist: "Dealmaker", sinds: "2026-09-22", deadline: "2026-09-26", url: "https://www.notion.so/Offerte-abc" },
    { nr: 2, titel: "Follow-up De Vries?", soort: "voorstel", te_laat: false, specialist: null, sinds: "2026-09-28", deadline: null, url: null },
  ] },
  ritmetaken: { items: [
    { taak: "Openstaande acties oppakken", agent: MA, ritme: "dagelijks", actief: true, laatst_gedraaid: "2026-09-29T02:10:00", volgorde: 1, url: "https://www.notion.so/taak1" },
    { taak: "Facturen nalopen", agent: "Administratie", ritme: "wekelijks-vr", actief: false, laatst_gedraaid: null, volgorde: 2, url: null },
  ] },
  ...o,
});
function ctxNotion(werk) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU, kanSchrijven: false,
    metricsWerk: { voorJou: werk.voor_jou ? werk.voor_jou.items : null, ritmetaken: werk.ritmetaken ? werk.ritmetaken.items : null, gegenereerdOp: "2026-09-29T06:30:00" },
    bundle: { kind: "metrics", source: "werkruimte", systeemPerDomein: { acties: "notion", ritmetaken: "notion" }, domains: {} },
  };
}

describe("f54 — saneren (zelfde regels als de werkruimte)", () => {
  it("houdt alleen wat klopt: bekende soort, https-link, tekst ingekort", () => {
    const vj = g.saneerVoorJouBlok({ items: [
      { nr: 1, titel: "x".repeat(300), soort: "check", url: "javascript:alert(1)" },
      { nr: 2, titel: "Onbekend", soort: "iets-anders" },
      { nr: 3, titel: "Goed", soort: "TAAK", url: "https://www.notion.so/p", sinds: "gisteren" },
    ] }, { waarschuwingen: [] });
    expect(vj.items).toHaveLength(2);
    expect(vj.items[0].titel).toHaveLength(120);
    expect(vj.items[0].url).toBeNull();
    expect(vj.items[1]).toMatchObject({ soort: "taak", url: "https://www.notion.so/p", sinds: null });
  });

  it("het metricsbestand geeft het werk door, binnen versie 2", () => {
    const raw = { versie: 2, type: "dashboard_metrics", gegenereerd_op: "2026-09-29T06:30:00", ...blokken() };
    const r = g.parseNotionMetricsFile(raw, g.AGENTIC_TEAM_SCHEMA, NU, 15);
    expect(r.ok).toBe(true);
    expect(r.metrics.werk.voorJou).toHaveLength(2);
    expect(r.metrics.werk.ritmetaken[0]).toMatchObject({ taak: "Openstaande acties oppakken", ritme: "dagelijks", actief: true });
  });
});

describe("f54 — Voor jou voor Notion-klanten", () => {
  it("een echte werkbak: dezelfde nummers, te laat, en 'Open in Notion'", () => {
    const paneel = document.createElement("section");
    paneel.innerHTML = `<div id="panel-voor-jou-body"></div>`;
    document.body.appendChild(paneel);
    const ctx = ctxNotion(blokken());
    g.renderVoorJou(paneel, ctx);
    expect(paneel.style.display).toBe("");
    const nrs = [...paneel.querySelectorAll(".vj-nr")].map(n => n.textContent);
    expect(nrs).toEqual(["1", "2"]);
    expect(paneel.textContent).toContain("te laat");
    const link = paneel.querySelector('a[href="https://www.notion.so/Offerte-abc"]');
    expect(link.textContent).toContain("Open in Notion");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(g.voorJouAantal(ctx)).toBe(2);
  });

  it("markup in een titel blijft tekst", () => {
    const paneel = document.createElement("section");
    const werk = blokken({ voor_jou: { items: [{ nr: 1, titel: "<img src=x onerror=alert(1)>", soort: "taak" }] } });
    g.renderVoorJou(paneel, ctxNotion(werk));
    expect(paneel.querySelector("img")).toBeNull();
  });

  it("staan de acties wél in de werkruimte, dan winnen die (live)", () => {
    const ctx = ctxNotion(blokken());
    ctx.bundle.domains.acties = { rows: [] };
    expect(g.metricsVoorJou(ctx)).toBeNull();
  });
});

describe("f54 — vaste taken en de klaar-check voor Notion-klanten", () => {
  it("de vaste taken uit de dagstart, met de week en 'Open in Notion'", () => {
    const html = g.vasteTakenHtml(ctxNotion(blokken()));
    const el = document.createElement("div");
    el.innerHTML = html;
    expect(el.textContent).toContain("Je vaste taken · 1 aan");
    expect(el.querySelectorAll(".vt-dag")).toHaveLength(5);
    expect(el.querySelector('a[href="https://www.notion.so/taak1"]')).not.toBeNull();
    expect(el.querySelector("[data-vt-actief]")).toBeNull(); // alleen lezen
  });

  it("de klaar-check oordeelt nu echt: vannacht gedraaid = je team werkt vanzelf", () => {
    const kc = g.klaarCheck(ctxNotion(blokken()));
    const werkt = kc.regels.find(r => r.id === "werkt");
    expect(werkt).toMatchObject({ k: "ok", tekst: "Laatst: vannacht 02:10." });
    expect(kc.regels.find(r => r.id === "aan").k).toBe("ok");
  });

  it("…en ziet het ook als het stilstaat", () => {
    const stil = blokken({ ritmetaken: { items: [{ taak: "Openstaande acties oppakken", agent: MA, ritme: "dagelijks", actief: true, laatst_gedraaid: "2026-09-23T02:10:00" }] } });
    const kc = g.klaarCheck(ctxNotion(stil));
    expect(kc.regels.find(r => r.id === "werkt").k).toBe("nee");
    expect(kc.stil).toBe(true);
  });

  it("zonder blokken blijft het de voorzichtige Notion-check", () => {
    const kc = g.klaarCheck(ctxNotion({}));
    expect(kc.regels.find(r => r.id === "aan").k).toBe("onbekend");
  });
});
