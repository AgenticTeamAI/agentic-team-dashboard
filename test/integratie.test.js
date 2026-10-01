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

function metricsEntry({ vers = true, versie = 1, kapot = false, agentsOpNul = false } = {}) {
  const basis = JSON.parse(readFileSync(join(TESTDATA, "notion-metrics", "metrics.json"), "utf8"));
  if (vers) basis.gegenereerd_op = new Date().toISOString();
  basis.versie = versie;
  // b58: het geval uit de praktijk — het blok is er, meldt dat het veld Agent
  // bestaat, en telt vervolgens overal nul. Precies dat gaf "0 van 21 agents"
  // naast een teamfeed vol berichten.
  if (agentsOpNul && basis.agents) {
    basis.agents.veld_aanwezig = true;
    for (const k of Object.keys(basis.agents.per_agent || {})) {
      basis.agents.per_agent[k] = { aantal_periode: 0, aantal_totaal: 0, laatst: null };
    }
  }
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
      // f30: jsdom kent createObjectURL niet. De download zelf kan hier dus
      // niet echt gebeuren; wat we wél toetsen is dat de pagina de route
      // aanroept, de naam uit de header overneemt en de link aanklikt.
      w.URL.createObjectURL = () => "blob:nep";
      w.URL.revokeObjectURL = () => {};
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
        if (u.pathname === "/dashboard/export") {
          const formaat = u.searchParams.get("formaat");
          return new Response(formaat === "json" ? '{"werkruimte":"Mockbedrijf BV"}' : "# Werkruimte-export — Mockbedrijf BV", {
            status: 200,
            headers: {
              "content-type": formaat === "json" ? "application/json" : "text/markdown",
              "content-disposition": `attachment; filename="werkruimte-export-mockbedrijf-bv-2026-08-28.${formaat === "json" ? "json" : "md"}"`,
            },
          });
        }
        return json(404, { fout: "Onbekende route" });
      };
    },
  });
  const w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  const $ = (id) => w.document.getElementById(id);
  const root = () => $("root");
  const tekst = () => root().textContent;
  const q = (sel) => root().querySelector(sel);
  const qa = (sel) => [...root().querySelectorAll(sel)];
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function tot(conditie, omschrijving) {
    for (let i = 0; i < 400; i++) {
      await tick();
      if (conditie()) return;
    }
    throw new Error("tijd verstreken: " + omschrijving + " — scherm: " + tekst().slice(0, 300));
  }
  // Klaar met laden = er staat een dashboard (tabbalk), of het is bewust
  // gestopt (versiefout), of het is misgegaan (melding boven de Hulp).
  const heeftTabs = () => !!q(".tabbalk");
  const versiefout = () => !!q(".balk.fout[role=alert]");
  async function geladen() {
    await tot(() => heeftTabs() || versiefout() || /niet laden|werkt niet meer/i.test(tekst()), "werkruimte geladen");
  }
  async function naar(hash) {
    w.location.hash = hash;
    await tot(() => w.V2._S.route === w.V2._routeUitHash(hash), "route " + hash);
    await tick();
  }
  const tabs = () => qa(".tabbalk .ttab").map((b) => b.textContent.replace(/\d+/g, "").trim());
  const actieveTab = () => (q('.tabbalk [aria-current="page"]') || {}).textContent || "";
  return { w, $, q, qa, tekst, tot, tick, naar, geladen, heeftTabs, versiefout, tabs, actieveTab, fouten, gevraagd };
}

/* ── tests ────────────────────────────────────────────────────────────── */
describe("dashboard.html — zonder daglink", () => {
  it("toont de Hulp als lege staat, draait de eigen JS, doet geen enkele fetch", async () => {
    const d = await open({ daglink: false });
    expect(d.heeftTabs()).toBe(false);
    expect(d.tekst()).toMatch(/Hoe werkt je team\?/);
    // iets dat alleen de gebouwde JS kan opleveren — anders slaagt deze test ook op een kapotte build
    expect(d.w.AGENTIC_TEAM_SCHEMA.registryVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof d.w.V2.toon).toBe("function");
    expect(d.gevraagd).toEqual([]);
    expect(d.fouten).toEqual([]);
  });
});

describe("werkruimte-route — rijen", () => {
  it("opent op Voor jou, met de vier tabs, en het token is weg uit de adresbalk", async () => {
    const d = await open();
    await d.geladen();
    expect(d.gevraagd[0]).toBe("/dashboard/overzicht");
    expect(d.tabs()).toEqual(["Voor jou", "Acties", "Team", "Gegevens"]);
    expect(d.actieveTab()).toMatch(/Voor jou/);
    expect(d.w.location.hash === "" || d.w.location.hash === "#/").toBe(true);
    expect(d.w.sessionStorage.getItem("agentic-team-dashboard:daglink")).toMatch(/testtoken/);
    // Voor jou: het verhaal, de werkbak (of "Niets meer voor jou"), en de kop
    expect(d.q(".verhaal")).not.toBeNull();
    expect(d.q(".werkbak-kop, .leeg")).not.toBeNull();
    expect(d.tekst()).toMatch(/Mockbedrijf BV/);
    expect(d.fouten).toEqual([]);
  });

  it("doorloopt elk scherm via de hash-router, ook de oude adressen, zonder fout", async () => {
    const d = await open();
    await d.geladen();
    const schermen = [
      ["#/acties", /Wie is aan zet\?/], ["#/team", /Je hele team|teamfeed/], ["#/team/vaste-taken", /vaste taken/i],
      ["#/team/klaar", /Is je team klaar\?/], ["#/team/resultaat", /resultaat|afgerond/i], ["#/gegevens", /Gegevens/],
      ["#/gegevens/organisaties", /Organisaties/], ["#/hulp", /Hoe werkt je team\?/], ["#/hulp/daglink", /Daglink of inloggen\?/],
      // oude adressen uit berichten van je team blijven werken
      ["#/klaar", /Is je team klaar\?/], ["#/vaste-taken", /vaste taken/i], ["#/prestaties", /resultaat|afgerond/i],
      ["#/detail/gebruik", /resultaat|afgerond/i], ["#/data", /Gegevens/], ["#/data/organisaties", /Organisaties/],
    ];
    for (const [hash, verwacht] of schermen) {
      await d.naar(hash);
      expect(d.tekst(), hash).toMatch(verwacht);
    }
    // de kale link uit het slotbericht van de werkronde wijst naar Voor jou
    await d.naar("#/data/acties");
    expect(d.w.V2._S.route).toBe("/");
    // onbekende routes en items crashen niet
    await d.naar("#/bestaat-niet");
    await d.naar("#/acties/bestaat-niet");
    expect(d.tekst()).toMatch(/Dit item is er niet \(meer\)/);
    expect(d.fouten).toEqual([]);
  });

  it("lege werkruimte (geen enkel gevuld domein): geen crash, wel wat je moet doen en eerlijke lege staten", async () => {
    const d = await open({ domeinen: {} });
    await d.geladen();
    expect(d.heeftTabs()).toBe(true);
    // nog geen vaste taken: dan is dát het eerste wat je hoort te zien
    expect(d.tekst()).toMatch(/Je team werkt nog niet vanzelf/);
    await d.naar("#/team/resultaat");
    expect(d.tekst()).toMatch(/Nog geen resultaat/);
    await d.naar("#/acties");
    expect(d.tekst()).toMatch(/Nog geen acties/);
    expect(d.fouten).toEqual([]);
  });

  it("onbekend domein in de werkruimte → waarschuwing op Voor jou, rest rendert door", async () => {
    const inhoud = domeinenUitTestdata();
    inhoud.verzonnen_domein = [{ domein: "verzonnen_domein", entryId: "x", data: { A: 1 }, bijgewerkt: "2026-08-20T09:30:00Z" }];
    const d = await open({ domeinen: inhoud });
    await d.geladen();
    expect(d.heeftTabs()).toBe(true);
    expect(d.q("[data-waarschuwingen]").textContent).toMatch(/verzonnen_domein.*onbekend in deze dashboardversie/);
    expect(d.fouten).toEqual([]);
  });

  it("teamfeed: berichten op Team; ontbreekt het domein, dan zegt Team dat eerlijk", async () => {
    const met = domeinenUitTestdata();
    met.teamfeed = teamfeedEntries();
    const a = await open({ domeinen: met });
    await a.geladen();
    await a.naar("#/team");
    expect(a.qa(".post").length).toBeGreaterThan(3);
    expect(a.gevraagd.some((p) => p.includes("domein=teamfeed"))).toBe(true);
    expect(a.fouten).toEqual([]);

    const b = await open(); // testdata/data bevat geen teamfeed-domein
    await b.geladen();
    expect(b.gevraagd.some((p) => p.includes("domein=teamfeed"))).toBe(false);
    await b.naar("#/team");
    expect(b.tekst()).toMatch(/houdt nog geen teamfeed bij/);
    expect(b.fouten).toEqual([]);
  });
});

describe("werkruimte-route — metricsbestand (f24)", () => {
  it("verse metrics naast rijen: de cijfers komen uit het bestand, de schermen uit je rijen", async () => {
    const inhoud = domeinenUitTestdata();
    inhoud.dashboard_metrics = metricsEntry({ vers: true });
    const d = await open({ domeinen: inhoud });
    await d.geladen();
    expect(d.versiefout()).toBe(false);
    expect(d.w.__dashboardCtx.bundle.kind).toBe("metrics");
    expect(d.q(".verhaal")).not.toBeNull();
    expect(d.fouten).toEqual([]);
  });

  it("verouderde metrics naast werkdata worden genegeerd, met zichtbare uitleg", async () => {
    const inhoud = domeinenUitTestdata();
    inhoud.dashboard_metrics = metricsEntry({ vers: false });
    const d = await open({ domeinen: inhoud });
    await d.geladen();
    expect(d.w.__dashboardCtx.bundle.kind).toBe("rows");
    expect(d.q("[data-waarschuwingen]").textContent).toMatch(/genegeerd/);
    expect(d.fouten).toEqual([]);
  });

  it("onleesbare metrics-entry: waarschuwing en terugval op de rijen, nooit stil", async () => {
    const inhoud = domeinenUitTestdata();
    inhoud.dashboard_metrics = metricsEntry({ kapot: true });
    const d = await open({ domeinen: inhoud });
    await d.geladen();
    expect(d.heeftTabs()).toBe(true);
    expect(d.q("[data-waarschuwingen]").textContent).toMatch(/geen geldige JSON/);
    expect(d.fouten).toEqual([]);
  });

  it("onbekende versie: niets tekenen, duidelijke melding", async () => {
    // f29: versie 2 is inmiddels een geldig contract — versie 3 is de onbekende.
    const d = await open({ domeinen: { dashboard_metrics: metricsEntry({ vers: true, versie: 3 }) } });
    await d.geladen();
    expect(d.versiefout()).toBe(true);
    expect(d.heeftTabs()).toBe(false);
    expect(d.tekst()).toMatch(/versie 3/);
    // ook ná een hashwissel blijven de tabs weg
    d.w.dispatchEvent(new d.w.Event("hashchange"));
    await d.tick();
    expect(d.heeftTabs()).toBe(false);
  });
});

describe("werkruimte-route — foutpaden", () => {
  it("verlopen daglink (401): melding, en de link wordt vergeten", async () => {
    const d = await open({ status: 401 });
    await d.tot(() => /verlopen/i.test(d.tekst()), "401-melding");
    expect(d.heeftTabs()).toBe(false);
    expect(d.w.sessionStorage.getItem("agentic-team-dashboard:daglink")).toBeNull();
  });

  it("instantie geeft 500: nette melding, geen half dashboard", async () => {
    const d = await open({ status: 500 });
    await d.tot(() => /niet laden/i.test(d.tekst()), "foutmelding");
    expect(d.tekst()).toMatch(/onverwacht antwoord|fout/i);
    expect(d.heeftTabs()).toBe(false);
  });
});

describe("interne meting (f19-gate)", () => {
  it("alleen met intern:true kan 'Klopte het werk?' op Resultaat staan", async () => {
    const inhoud = domeinenUitTestdata();
    const b = await open({ domeinen: inhoud, intern: false });
    await b.geladen();
    await b.naar("#/team/resultaat");
    expect(b.tekst()).not.toMatch(/alleen intern/);
    const a = await open({ domeinen: inhoud, intern: true });
    await a.geladen();
    expect(a.w.__dashboardCtx.intern).toBe(true);
  });
});

/* ── f30: de export, in de echte gebouwde pagina ─────────────────────── */
describe("f30 — statische export als knop", () => {
  it("staat onder Gegevens, haalt de route op en neemt de naam uit de header over", async () => {
    const d = await open();
    await d.geladen();
    await d.naar("#/gegevens");
    const knop = d.q('[data-act="export"][data-v="markdown"]');
    expect(knop).not.toBeNull();
    expect(d.tekst()).toMatch(/Alles meenemen/);

    // Vastleggen welke anchor de pagina aanmaakt: dat is de download.
    const aangeklikt = [];
    const origineel = d.w.HTMLAnchorElement.prototype.click;
    d.w.HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute("download")) { aangeklikt.push({ download: this.download, href: this.href }); return; }
      return origineel.call(this);
    };

    knop.click();
    await d.tot(() => aangeklikt.length > 0, "download aangeboden");
    expect(d.gevraagd).toContain("/dashboard/export?formaat=markdown");
    expect(aangeklikt[0].download).toBe("werkruimte-export-mockbedrijf-bv-2026-08-28.md");
    await d.tot(() => /Klaar/.test(d.$("melding").textContent), "melding klaar");
    expect(d.fouten).toEqual([]);
  });

  it("meldt een verlopen link in plaats van een stille mislukking", async () => {
    const d = await open();
    await d.geladen();
    await d.naar("#/gegevens");
    // De sessie verloopt tussen laden en klikken: elk volgend verzoek geeft 401.
    d.w.fetch = async () => new Response(JSON.stringify({ fout: "weg" }), { status: 401 });
    d.q('[data-act="export"][data-v="json"]').click();
    await d.tot(() => /verlopen/.test(d.$("melding").textContent), "melding over de verlopen link");
  });
});

/* ── Gegevens, blijven waar je was, en de privacybelofte ────────────── */
describe("Gegevens en navigatie in dashboard.html", () => {
  it("Gegevens: overzicht → lijst → één rij → terug", async () => {
    const d = await open();
    await d.geladen();
    await d.naar("#/gegevens");
    const regel = d.q('[data-act="go"][data-r="/gegevens/organisaties"]');
    expect(regel).not.toBeNull();
    regel.click();
    await d.tot(() => d.qa(".orgrij").length > 0, "lijst met organisaties");
    expect(d.w.location.hash).toBe("#/gegevens/organisaties");
    d.q(".orgrij").click();
    await d.tot(() => !!d.q(".orgkop"), "pagina van één organisatie");
    expect(d.q("#rij-titel").textContent.length).toBeGreaterThan(0);
    expect(d.q("dl.velden")).not.toBeNull();
    d.q('[data-act="go"][data-r="/gegevens/organisaties"]').click();
    await d.tot(() => d.qa(".orgrij").length > 0, "terug naar de lijst");
    expect(d.fouten).toEqual([]);
  });

  it("Gegevens bij een metricsbestand zónder rijen: geen lege tabel, wel uitleg of de lege lijst", async () => {
    const d = await open({ domeinen: { dashboard_metrics: metricsEntry({ vers: true }) } });
    await d.geladen();
    await d.naar("#/gegevens");
    expect(d.q("table")).toBeNull();
    expect(d.fouten).toEqual([]);
  });

  /* i71 — na een schrijfactie blijf je waar je was: ctx.herlaad is de echte
     code die een schrijfactie aanroept als de instantie geen rij terugstuurt. */
  it("een herlaadde bundel houdt je waar je was", async () => {
    const d = await open();
    await d.geladen();
    await d.naar("#/gegevens/organisaties");
    await d.w.__dashboardCtx.herlaad();
    await d.tot(() => d.qa(".orgrij").length > 0, "nog steeds op de lijst");
    expect(d.w.location.hash).toBe("#/gegevens/organisaties");
    expect(d.fouten).toEqual([]);
  });

  it("de ververs-knop laat je staan waar je was", async () => {
    const d = await open();
    await d.geladen();
    await d.naar("#/acties");
    d.q('[data-act="ververs"]').click();
    await d.tot(() => d.gevraagd.filter((p) => p === "/dashboard/overzicht").length === 2, "opnieuw opgehaald");
    await d.tot(() => d.heeftTabs() && /Wie is aan zet\?/.test(d.tekst()), "nog steeds op Acties");
    expect(d.w.location.hash).toBe("#/acties");
    expect(d.fouten).toEqual([]);
  });

  it("maar een vers geladen bundel begint gewoon op Voor jou", async () => {
    const d = await open();
    await d.geladen();
    expect(d.w.location.hash === "" || d.w.location.hash === "#/").toBe(true);
    expect(d.actieveTab()).toMatch(/Voor jou/);
  });

  /* b58 — Team en Resultaat spreken elkaar niet tegen als het metricsbestand
     nul telt: dan telt het meest ingezet uit de teamfeed. */
  it("Team en Resultaat spreken elkaar niet tegen als het metricsbestand nul telt", async () => {
    const inhoud = domeinenUitTestdata();
    inhoud.teamfeed = teamfeedEntries();
    inhoud.dashboard_metrics = metricsEntry({ vers: true, agentsOpNul: true });
    const d = await open({ domeinen: inhoud });
    await d.geladen();
    await d.naar("#/team");
    expect(d.qa(".post").length).toBeGreaterThan(0);
    const usage = d.w.__dashboardCtx.agentUsage;
    expect(usage.bron).toBe("teamfeed");
    expect(usage.ranking.reduce((s, r) => s + r.totaal, 0)).toBeGreaterThan(0);
    await d.naar("#/team/resultaat");
    expect(d.tekst()).not.toMatch(/0 van \d+ agents/);
    expect(d.fouten).toEqual([]);
  });

  it("de goedgekeurde privacybelofte staat op Voor jou, samenvatting én volledige tekst", async () => {
    const d = await open();
    await d.geladen();
    const blok = d.q("details.privacy");
    expect(blok).not.toBeNull();
    expect(blok.querySelector("summary").textContent).toContain("Je gegevens komen rechtstreeks uit je eigen werkruimte en blijven in je browser — wij zien ze niet.");
    expect(blok.textContent).toContain("Het daglink-token staat achter het #-teken en wordt daarom nooit naar een server verstuurd");
    // de oude, te absolute claim mag nergens meer staan
    expect(d.w.document.body.textContent).not.toMatch(/nooit naar agentic-team\.ai/i);
    expect(d.w.document.body.textContent).not.toMatch(/niets naar agentic-team\.ai/i);
  });
});
