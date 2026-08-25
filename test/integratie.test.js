/* s31: integratietest op de ÉCHTE, gebouwde dashboard.html (niet de losse
 * src-modules). Dit is de jsdom-harnas die de README onder "Getest, en hoe"
 * beschrijft; tot s31 stond hij niet in de repo.
 *
 * Sinds 25-08-2026 is de werkruimte-daglink de enige route, dus die wordt
 * hier end-to-end gedraaid: een gestubde `fetch` speelt de instantie na met
 * exact de vormen uit scripts/mock-instantie.mjs (/dashboard/overzicht en
 * /dashboard/entries), gevuld met de fictieve testdata uit testdata/.
 *
 * Draait bewust NIET in de vitest-jsdom-omgeving: elke test opent zijn eigen
 * JSDOM met runScripts, zodat DOMContentLoaded, de daglink-afhandeling en de
 * hash-router echt lopen. Vereist een actuele build (python3 scripts/build.py)
 * — CI bewaakt dat apart met de build-drift-job. */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(ROOT, "dashboard.html"), "utf8");
const TESTDATA = join(ROOT, "testdata");
const TOKEN = "testtoken";
const INSTANTIE = "http://localhost:8791";

/* ── de fictieve werkruimte-inhoud, zelfde omzetting als de mock-instantie ── */
function domeinenUitTestdata() {
  const domeinen = {};
  for (const f of readdirSync(join(TESTDATA, "data"))) {
    if (!f.endsWith(".json")) continue;
    const naam = f.replace(/\.json$/, "").replace(/-/g, "_");
    const parsed = JSON.parse(readFileSync(join(TESTDATA, "data", f), "utf8"));
    if (naam === "bedrijfscontext") {
      domeinen.bedrijfscontext = Object.entries(parsed)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, v], i) => ({
          domein: "bedrijfscontext", entryId: `bc-${i}`,
          data: { Onderdeel: k, Inhoud: String(v), Bijgewerkt: "2026-08-18" },
          aangemaakt: "2026-08-01T08:00:00Z", bijgewerkt: "2026-08-18T08:00:00Z",
        }));
      continue;
    }
    const items = Array.isArray(parsed) ? parsed : parsed.items || [];
    domeinen[naam] = items.map((data, i) => ({
      domein: naam, entryId: `${naam}-${i}`, data,
      aangemaakt: "2026-08-01T08:00:00Z", bijgewerkt: "2026-08-20T09:30:00Z",
    }));
  }
  return domeinen;
}

function metricsEntry({ vers = true, versie = 1, kapot = false } = {}) {
  const basis = JSON.parse(readFileSync(join(TESTDATA, "notion-metrics", "metrics.json"), "utf8"));
  if (vers) basis.gegenereerd_op = new Date().toISOString();
  basis.versie = versie;
  return [{
    domein: "dashboard_metrics", entryId: "metrics",
    data: { Titel: "Dashboardmetrics", Inhoud: kapot ? "{dit is geen json" : JSON.stringify(basis) },
    aangemaakt: "2026-08-01T08:00:00Z", bijgewerkt: String(basis.gegenereerd_op),
  }];
}

function teamfeedEntries() {
  const ruw = JSON.parse(readFileSync(join(TESTDATA, "werkruimte", "teamfeed.json"), "utf8"));
  const nieuwste = Math.max(...ruw.map((e) => Date.parse(e.aangemaakt)));
  const schuif = Date.now() - nieuwste;
  return ruw.map((e) => {
    const ts = new Date(Date.parse(e.aangemaakt) + schuif).toISOString();
    return { ...e, aangemaakt: ts, bijgewerkt: ts };
  });
}

/* ── harnas ───────────────────────────────────────────────────────────── */
async function open({ domeinen = null, status = 200, klant = "Mockbedrijf BV", intern = false, daglink = true } = {}) {
  const inhoud = domeinen === null ? domeinenUitTestdata() : domeinen;
  const fouten = [];
  const gevraagd = [];
  const dom = new JSDOM(HTML, {
    runScripts: "dangerously",
    url: "http://localhost/dashboard.html" + (daglink ? `#t=${TOKEN}&i=${encodeURIComponent(INSTANTIE)}` : ""),
    pretendToBeVisual: true,
    beforeParse(w) {
      w.console.error = (...a) => fouten.push(a.map(String).join(" "));
      w.scrollTo = () => {};
      // Vóór het parsen registreren: inline scripts draaien al tijdens de
      // constructor, een top-level fout in de build moet hier landen.
      w.addEventListener("error", (e) => fouten.push("error:" + e.message));
      // jsdom heeft geen Fetch API; Node's Response voldoet voor de loader
      // (hij leest alleen .status en .json()).
      w.Response = Response;
      w.fetch = async (url, opties = {}) => {
        const u = new URL(String(url));
        gevraagd.push(u.pathname + u.search);
        const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
        if ((opties.headers || {}).Authorization !== "Bearer " + TOKEN) return json(401, { fout: "Deze dashboardlink is verlopen. Vraag je Coördinator om een nieuwe." });
        if (status !== 200) return json(status, { fout: status === 401 ? "Deze dashboardlink is verlopen. Vraag je Coördinator om een nieuwe." : "Je werkruimte gaf een fout." });
        if (u.pathname === "/dashboard/overzicht") {
          return json(200, { klant, intern, domeinen: Object.entries(inhoud).map(([domein, e]) => ({ domein, aantal: e.length })) });
        }
        if (u.pathname === "/dashboard/entries") {
          const d = u.searchParams.get("domein");
          if (!d || !inhoud[d]) return json(400, { fout: `Onbekend domein ${d}` });
          const limiet = Number(u.searchParams.get("limiet") ?? 50);
          const sinds = u.searchParams.get("sinds");
          const lijst = sinds ? inhoud[d].filter((e) => String(e.bijgewerkt) >= sinds) : inhoud[d];
          return json(200, { domein: d, entries: lijst.slice(0, limiet) });
        }
        return json(404, { fout: "Onbekende route" });
      };
    },
  });
  const w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  const $ = (id) => w.document.getElementById(id);
  const tekst = (id) => $(id).textContent;
  const zichtbaar = (id) => $(id).style.display !== "none";
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function tot(conditie, omschrijving) {
    for (let i = 0; i < 400; i++) {
      await tick();
      if (conditie()) return;
    }
    throw new Error("tijd verstreken: " + omschrijving + " — statusregel: " + tekst("status-line"));
  }
  async function geladen() {
    await tot(() => !/opgehaald…|wordt opgehaald/i.test(tekst("status-line")) && tekst("status-line") !== "", "werkruimte geladen");
    return tekst("status-line");
  }
  async function naar(hash) {
    w.location.hash = hash;
    const detail = hash.startsWith("#/detail/");
    await tot(() => ($("detail-view").style.display !== "none") === detail && (!detail || $("detail-inner")), "route " + hash);
  }
  return { w, $, tekst, zichtbaar, tot, tick, naar, geladen, fouten, gevraagd };
}

/* ── tests ────────────────────────────────────────────────────────────── */
describe("dashboard.html — zonder daglink", () => {
  it("toont de lege staat, draait de eigen JS, doet geen enkele fetch", async () => {
    const d = await open({ daglink: false });
    expect(d.zichtbaar("empty-state")).toBe(true);
    expect(d.zichtbaar("home-view")).toBe(false);
    expect(d.zichtbaar("version-error")).toBe(false);
    // iets dat alleen de gebouwde JS kan opleveren — anders slaagt deze test ook op een kapotte build
    expect(d.w.AGENTIC_TEAM_SCHEMA.registryVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(d.gevraagd).toEqual([]);
    expect(d.fouten).toEqual([]);
  });
});

describe("werkruimte-route — rijen", () => {
  it("leest de instantie uit en rendert de homepage volledig", async () => {
    const d = await open();
    expect(await d.geladen()).toMatch(/geladen/);
    expect(d.gevraagd[0]).toBe("/dashboard/overzicht");
    expect(d.zichtbaar("home-view")).toBe(true);
    expect(d.zichtbaar("empty-state")).toBe(false);
    expect(d.$("kpi-grid").querySelectorAll(".kpi-tile").length).toBe(4);
    expect(d.$("panel-activiteit-body").querySelectorAll("rect").length).toBeGreaterThan(0);
    expect(d.$("panel-adoptie-body").querySelectorAll(".subscore-col").length).toBe(3);
    expect(d.$("panel-gebruik-body").querySelector(".grijs-blok")).toBeNull(); // Agent is gevuld in de testdata
    expect(d.tekst("bundle-info")).toMatch(/Mockbedrijf BV/);
    // het token hoort uit de adresbalk te verdwijnen en in sessionStorage te staan
    expect(d.w.location.hash).toBe("");
    expect(d.w.sessionStorage.getItem("agentic-team-dashboard:daglink")).toMatch(/testtoken/);
    expect(d.fouten).toEqual([]);
  });

  it("doorloopt alle detailpagina's via de hash-router en terug, zonder fout", async () => {
    const d = await open();
    await d.geladen();
    for (const key of ["feed", "aandacht", "context", "gebruik", "opbrengst", "leren", "adoptiescore", "tijdwinst", "activiteit"]) {
      await d.naar("#/detail/" + key);
      expect(d.zichtbaar("detail-view"), key).toBe(true);
      expect(d.zichtbaar("home-view"), key).toBe(false);
      expect(d.tekst("detail-inner").trim().length, key).toBeGreaterThan(0);
    }
    await d.naar("#/detail/gebruik");
    d.$("btn-terug").click();
    await d.tot(() => d.zichtbaar("home-view"), "terug naar home");
    expect(d.zichtbaar("detail-view")).toBe(false);
    // onbekende sleutel mag niet crashen
    d.w.location.hash = "#/detail/bestaat-niet";
    await d.tick(); await d.tick();
    expect(d.fouten).toEqual([]);
  });

  it("periodeschakelaar en minuten-per-actie herrekenen echt, ook met open detailpagina", async () => {
    const d = await open();
    await d.geladen();
    const rects = () => d.$("panel-activiteit-body").querySelectorAll("rect").length;
    await d.naar("#/detail/activiteit");
    const sel = d.$("period-select");
    expect(sel.disabled).toBe(false);
    const per = {};
    for (const v of ["8", "24", "12"]) {
      sel.value = v;
      sel.dispatchEvent(new d.w.Event("change"));
      await d.tick();
      per[v] = { rects: rects(), detail: d.tekst("detail-inner") };
      expect(d.zichtbaar("detail-view")).toBe(true);
    }
    expect(per["8"].rects).toBeLessThan(per["24"].rects); // een no-op schakelaar zou gelijk blijven
    expect(per["8"].detail).not.toBe(per["24"].detail);
    d.$("btn-terug").click();
    await d.tot(() => d.zichtbaar("home-view"), "terug naar home");

    const tijdwinst = () => [...d.$("kpi-grid").querySelectorAll(".kpi-tile")].at(-1).querySelector(".kpi-getal").textContent;
    const voor = tijdwinst();
    const inp = d.$("input-minuten");
    inp.value = "60";
    inp.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    await d.tick();
    expect(tijdwinst()).not.toBe(voor);
    expect(d.w.localStorage.getItem("agentic-team-dashboard:minuten-per-actie")).toBe("60");
    expect(d.fouten).toEqual([]);
  });

  it("lege werkruimte (geen enkel gevuld domein): geen crash, adoptiescore 0%, geen verzonnen nullen", async () => {
    const d = await open({ domeinen: {} });
    await d.geladen();
    expect(d.zichtbaar("home-view")).toBe(true);
    const tegels = d.$("kpi-grid").querySelectorAll(".kpi-tile");
    expect(tegels.length).toBe(4);
    expect(tegels[0].querySelector(".kpi-getal").textContent).toBe("0%");
    expect(d.tekst("panel-adoptie-body")).toMatch(/niet te berekenen/);
    expect(d.$("panel-gebruik-body").querySelector(".grijs-blok")).not.toBeNull();
    expect(d.fouten).toEqual([]);
  });

  it("onbekend domein in de werkruimte → waarschuwing, rest rendert door", async () => {
    const inhoud = domeinenUitTestdata();
    inhoud.verzonnen_domein = [{ domein: "verzonnen_domein", entryId: "x", data: { A: 1 }, bijgewerkt: "2026-08-20T09:30:00Z" }];
    const d = await open({ domeinen: inhoud });
    await d.geladen();
    expect(d.zichtbaar("home-view")).toBe(true);
    expect(d.zichtbaar("warnings-box")).toBe(true);
    expect(d.tekst("warnings-box")).toMatch(/verzonnen_domein.*onbekend in deze dashboardversie/);
    expect(d.fouten).toEqual([]);
  });

  it("teamfeed: entries renderen; ontbreekt het domein, dan blijft de rest werken", async () => {
    const met = domeinenUitTestdata();
    met.teamfeed = teamfeedEntries();
    const a = await open({ domeinen: met });
    await a.geladen();
    expect(a.tekst("panel-feed-body").length).toBeGreaterThan(0);
    expect(a.gevraagd.some((p) => p.includes("domein=teamfeed"))).toBe(true);
    expect(a.fouten).toEqual([]);

    const b = await open(); // testdata/data bevat geen teamfeed-domein
    await b.geladen();
    expect(b.gevraagd.some((p) => p.includes("domein=teamfeed"))).toBe(false);
    expect(b.zichtbaar("home-view")).toBe(true);
    expect(b.fouten).toEqual([]);
  });
});

describe("werkruimte-route — metricsbestand (f24)", () => {
  it("verse metrics winnen van de rijen: periode vast, gebruik 'niet af te leiden', aandachtlijst gevuld", async () => {
    const inhoud = domeinenUitTestdata();
    inhoud.dashboard_metrics = metricsEntry({ vers: true });
    const d = await open({ domeinen: inhoud });
    await d.geladen();
    expect(d.zichtbaar("home-view")).toBe(true);
    expect(d.zichtbaar("version-error")).toBe(false);
    expect(d.$("period-select").disabled).toBe(true);
    expect(d.tekst("panel-gebruik-body")).toMatch(/Niet af te leiden/);
    const items = [...d.$("panel-aandacht-body").querySelectorAll(".attention-list li")].map((li) => li.textContent);
    expect(items.length).toBeGreaterThan(0);
    expect(items.join(" | ")).toMatch(/\S/);
    expect(d.fouten).toEqual([]);
  });

  it("verouderde metrics naast werkdata worden genegeerd, met zichtbare uitleg", async () => {
    const inhoud = domeinenUitTestdata();
    inhoud.dashboard_metrics = metricsEntry({ vers: false });
    const d = await open({ domeinen: inhoud });
    await d.geladen();
    expect(d.$("period-select").disabled).toBe(false); // rijenroute
    expect(d.zichtbaar("warnings-box")).toBe(true);
    expect(d.tekst("warnings-box")).toMatch(/genegeerd/);
    expect(d.fouten).toEqual([]);
  });

  it("onleesbare metrics-entry: waarschuwing en terugval op de rijen, nooit stil", async () => {
    const inhoud = domeinenUitTestdata();
    inhoud.dashboard_metrics = metricsEntry({ kapot: true });
    const d = await open({ domeinen: inhoud });
    await d.geladen();
    expect(d.zichtbaar("home-view")).toBe(true);
    expect(d.tekst("warnings-box")).toMatch(/geen geldige JSON/);
    expect(d.fouten).toEqual([]);
  });

  it("onbekende versie: niets tekenen, duidelijke melding", async () => {
    const d = await open({ domeinen: { dashboard_metrics: metricsEntry({ vers: true, versie: 2 }) } });
    await d.geladen();
    expect(d.zichtbaar("version-error")).toBe(true);
    expect(d.zichtbaar("home-view")).toBe(false);
    expect(d.tekst("version-error")).toMatch(/Onbekende versie|versie 2/);
    expect(d.$("kpi-grid").querySelectorAll(".kpi-tile").length).toBe(0);
    // ook ná de hash-opschoning van de daglink blijft de homepage weg
    d.w.dispatchEvent(new d.w.Event("hashchange"));
    await d.tick();
    expect(d.zichtbaar("home-view")).toBe(false);
  });
});

describe("werkruimte-route — foutpaden", () => {
  it("verlopen daglink (401): melding, en de link wordt vergeten", async () => {
    const d = await open({ status: 401 });
    await d.tot(() => /verlopen/i.test(d.tekst("status-line")), "401-melding");
    expect(d.zichtbaar("home-view")).toBe(false);
    expect(d.w.sessionStorage.getItem("agentic-team-dashboard:daglink")).toBeNull();
  });

  it("instantie geeft 500: nette melding, geen half dashboard", async () => {
    const d = await open({ status: 500 });
    await d.tot(() => d.tekst("status-line").length > 0 && !/opgehaald…/.test(d.tekst("status-line")), "foutmelding");
    expect(d.tekst("status-line")).toMatch(/onverwacht antwoord|fout/i);
    expect(d.zichtbaar("home-view")).toBe(false);
    expect(d.zichtbaar("empty-state")).toBe(true);
  });
});

describe("interne tegels (f19-gate)", () => {
  it("intern:true toont de correctievrij-tegel, intern:false niet", async () => {
    const inhoud = domeinenUitTestdata();
    const a = await open({ domeinen: inhoud, intern: true });
    await a.geladen();
    expect(a.tekst("kpi-grid")).toMatch(/Correctievrij/);
    const b = await open({ domeinen: inhoud, intern: false });
    await b.geladen();
    expect(b.tekst("kpi-grid")).not.toMatch(/Correctievrij/);
  });
});
