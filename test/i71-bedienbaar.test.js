// @vitest-environment jsdom
/* i71 — het dashboard bedienbaar maken.
 *
 * Alles hier komt uit één 1-op-1 met de eerste klant die live in haar eigen
 * dashboard werkte (10-09-2026), plus twee punten uit de ontwerpreview. Wat
 * zij vond was geen smaakkwestie maar dood gedrag: klikken deed niets,
 * afgeronde items bleven staan, slepen bestond niet.
 *
 * De tests bewaken het gedrag, niet de opmaak — behalve waar de opmaak het
 * gedrag ís (de klikbaarheid van een rij, de afwezigheid van een affordance
 * bij een rij die niets kan). */
import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
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
  "src/modules-beheer.js",
];

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

/* Zonder schrijfrechten (een daglink is alleen-lezen) hoort het bord precies
 * te zijn wat het was. `schrijven: true` bootst een ingelogde sessie na. */
function ctxMet(domains, { schrijven = false } = {}) {
  return {
    schema: g.getSchema(),
    kanSchrijven: schrijven,
    bundle: { kind: "rows", source: "werkruimte", sourceLabel: "je werkruimte", domains },
  };
}

const ACTIES = [
  { Actie: "Offerte nabellen", Status: "Open", Eigenaar: "Tijmen", __entryId: "a1" },
  { Actie: "Rapport nakijken", Status: "Klaar", Eigenaar: "Tijmen", __entryId: "a2" },
  { Actie: "Deal afronden", Status: "Klaar", Eigenaar: "Yoram", __entryId: "a3" },
  { Actie: "Rij zonder id", Status: "Open" },   // geen __entryId
];

const alleActies = () => ({ acties: { rows: ACTIES.map((r) => ({ ...r })) } });

function verseTabel(opties) {
  const c = el();
  g.wisDataDetail();
  g.resetDataZoek();
  g.renderDataDomein(c, "acties", ctxMet(alleActies(), opties));
  return c;
}

// ══ 1 · Klikken doet iets ════════════════════════════════════════════

describe("een rij openen", () => {
  /* De klacht, letterlijk: "Ik kan er heel leuk op klikken, maar hij doet
     niks." Oorzaak: alleen de eerste cel was een knop. */
  it("maakt de hele rij klikbaar, niet alleen de titelcel", () => {
    const c = verseTabel();
    const rij = c.querySelector('tr[data-open-rij="acties|a1"]');
    expect(rij).not.toBeNull();
    expect(rij.classList.contains("rij-klikbaar")).toBe(true);
  });

  it("houdt de knop in de eerste kolom voor toetsenbordgebruik", () => {
    const c = verseTabel();
    expect(c.querySelector('.rij-open-knop[data-open-rij="acties|a1"]')).not.toBeNull();
  });

  it("opent de rij bij een klik midden in de rij", () => {
    const c = verseTabel();
    const cellen = c.querySelectorAll('tr[data-open-rij="acties|a1"] td');
    cellen[cellen.length - 1].click();   // niet de titelcel
    expect(c.querySelector("[data-detail-kaart]")).not.toBeNull();
  });

  /* Een rij die niets kan, mag er ook niet uitzien alsof ze iets kan — dat
     was tenslotte precies het probleem. */
  it("geeft een rij zonder id geen klik-affordance", () => {
    const c = verseTabel();
    const rijen = [...c.querySelectorAll("tbody tr")];
    const zonder = rijen.find((r) => !r.hasAttribute("data-open-rij"));
    expect(zonder).not.toBeUndefined();
    expect(zonder.classList.contains("rij-klikbaar")).toBe(false);
  });

  it("laat de knoppen in de rij hun eigen werk doen", () => {
    const c = verseTabel({ schrijven: true });
    g.wisDataDetail();
    const bewerkKnop = c.querySelector('[data-bewerk-rij="a1"]');
    expect(bewerkKnop).not.toBeNull();
    bewerkKnop.click();
    // de rij is niet opengeklapt door de klik op de bewerkknop
    expect(c.querySelector("[data-detail-kaart]")).toBeNull();
  });
});

/* De klik wérkte altijd — de detailkaart landde alleen buiten beeld.
 *
 * De kaart wordt ingevoegd in <div data-data-detail>, dat BOVEN de tabel
 * staat. Klik je een rij aan die verder naar beneden staat, dan opent hij
 * ver boven je scherm, en omdat de browser de ingevoegde hoogte zelf
 * compenseert (scroll-anchoring) beweegt er niet eens iets. Samen met een
 * dode `tr.rij-open`-markering leverde dat exact "hij doet niks" op — en
 * omdat het een toggle is, sloot een tweede klik de kaart die je niet zag.
 *
 * jsdom kan geen viewport meten, dus dit toetst het mechanisme: wordt de
 * kaart in beeld gebracht, en gebeurt dat niet bij het dichtklappen. */
describe("de geopende kaart komt in beeld", () => {
  const origineel = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
  afterEach(() => {
    if (origineel) Object.defineProperty(Element.prototype, "scrollIntoView", origineel);
    else delete Element.prototype.scrollIntoView;
  });

  it("scrollt naar de detailkaart bij het openen", () => {
    const spion = vi.fn();
    Element.prototype.scrollIntoView = spion;
    const c = verseTabel();
    c.querySelector('.rij-open-knop[data-open-rij="acties|a1"]').click();
    expect(c.querySelector("[data-detail-kaart]")).not.toBeNull();
    expect(spion).toHaveBeenCalledTimes(1);
    expect(spion.mock.instances[0].classList.contains("detail-kaart")).toBe(true);
  });

  it("scrollt niet bij het dichtklappen", () => {
    const spion = vi.fn();
    Element.prototype.scrollIntoView = spion;
    const c = verseTabel();
    const knop = () => c.querySelector('[data-open-rij="acties|a1"].rij-open-knop');
    knop().click();
    expect(spion).toHaveBeenCalledTimes(1);
    knop().click();                                   // toggle: weer dicht
    expect(c.querySelector("[data-detail-kaart]")).toBeNull();
    expect(spion).toHaveBeenCalledTimes(1);           // niet nóg een keer
  });

  /* Zonder guard gooit dit in jsdom (scrollIntoView bestaat daar niet) en
     sterft de hele click-handler — dan zou de fix het probleem verplaatsen
     in plaats van oplossen. */
  it("valt niet om in een omgeving zonder scrollIntoView", () => {
    delete Element.prototype.scrollIntoView;
    const c = verseTabel();
    expect(() => c.querySelector('.rij-open-knop[data-open-rij="acties|a1"]').click()).not.toThrow();
    expect(c.querySelector("[data-detail-kaart]")).not.toBeNull();
  });
});

// ══ 2 · Statusfilter ═════════════════════════════════════════════════

describe("statusfilter", () => {
  it("bouwt de chips uit het registryschema, nooit uit een lijstje in de code", () => {
    const c = verseTabel();
    const opties = g.getSchema().datadomeinen.acties.velden.find((v) => v.naam === "Status").opties;
    expect([...c.querySelectorAll("[data-status-chip]")].map((b) => b.getAttribute("data-status-chip")))
      .toEqual(opties);
  });

  /* De vraag zelf: "Ik wil een statusfilter. Als het klaar is, wil ik het
     niet meer zien." */
  it("verbergt de rijen van een uitgezette status", () => {
    const c = verseTabel();
    expect(c.querySelectorAll("tbody tr")).toHaveLength(4);
    c.querySelector('[data-status-chip="Klaar"]').click();
    const over = [...c.querySelectorAll("tbody tr")];
    expect(over).toHaveLength(2);
    expect(c.textContent).not.toMatch(/Rapport nakijken/);
    expect(c.textContent).toMatch(/Offerte nabellen/);
  });

  it("laat de telling meelopen met wat je ziet", () => {
    const c = verseTabel();
    c.querySelector('[data-status-chip="Klaar"]').click();
    expect(c.querySelector("[data-data-telling]").textContent).toBe("2 van 4 rijen");
  });

  it("zet de chip terug aan bij een tweede klik", () => {
    const c = verseTabel();
    const chip = c.querySelector('[data-status-chip="Klaar"]');
    chip.click();
    expect(g.statusVerborgen("acties")).toEqual(["Klaar"]);
    c.querySelector('[data-status-chip="Klaar"]').click();
    expect(g.statusVerborgen("acties")).toEqual([]);
    expect(c.querySelectorAll("tbody tr")).toHaveLength(4);
  });

  it("filtert vóór het zoeken, zodat zoeken binnen de selectie blijft werken", () => {
    const c = verseTabel();
    c.querySelector('[data-status-chip="Klaar"]').click();
    g.zetDataZoek("Rapport");           // staat op Klaar → weggefilterd
    const d = el();
    g.renderDataDomein(d, "acties", ctxMet(alleActies()));
    expect(d.querySelectorAll("tbody tr")).toHaveLength(0);
    g.resetDataZoek();
  });

  /* Harde eis, geen voorkeur: de juridisch getoetste privacytekst somt
     uitputtend op wat dit dashboard blijvend in de browser bewaart. Een
     onthouden filter zou die tekst onwaar maken. */
  it("onthoudt niets in localStorage", () => {
    const voor = { ...window.localStorage };
    const c = verseTabel();
    c.querySelector('[data-status-chip="Klaar"]').click();
    expect({ ...window.localStorage }).toEqual(voor);
    // en er staat geen enkele opslagaanroep in dit bestand — ook niet voor
    // iets anders, want dan zou de opsomming in de privacytekst alsnog gaan
    // schuiven zodra iemand hem "even" hergebruikt.
    expect(readFileSync(join(ROOT, "src/databrowser.js"), "utf8"))
      .not.toMatch(/(localStorage|sessionStorage)\s*\.\s*(set|get|remove)Item/);
  });

  it("is weg zodra je de Data-tab opnieuw binnenkomt", () => {
    const c = verseTabel();
    c.querySelector('[data-status-chip="Klaar"]').click();
    expect(g.statusVerborgen("acties")).toEqual(["Klaar"]);
    g.resetDataZoek();
    expect(g.statusVerborgen("acties")).toEqual([]);
  });

  it("laat een domein zonder Status-veld ongemoeid", () => {
    const c = el();
    g.resetDataZoek();
    g.renderDataDomein(c, "organisaties", ctxMet({ organisaties: { rows: [{ Naam: "Acme", __entryId: "o1" }] } }));
    expect(c.querySelector("[data-status-chip]")).toBeNull();
  });
});

// ══ 3 · Kaarten verplaatsen ══════════════════════════════════════════

describe("het bord bedienen", () => {
  function bord(opties) {
    const c = verseTabel(opties);
    c.querySelector('[data-weergave="bord"]').click();
    return c;
  }

  it("geeft elke kaart een statuskiezer met de waarden uit het schema", () => {
    const c = bord({ schrijven: true });
    const kiezer = c.querySelector('[data-bord-status="a1"]');
    expect(kiezer).not.toBeNull();
    const opties = g.getSchema().datadomeinen.acties.velden.find((v) => v.naam === "Status").opties;
    expect([...kiezer.options].map((o) => o.value)).toEqual(opties);
    expect(kiezer.value).toBe("Open");   // de huidige stand staat voor
  });

  /* Slepen is de tweede route, niet de eerste: zonder muis moet het bord ook
     te bedienen zijn. */
  it("maakt kaarten sleepbaar én de kolommen een doelgebied", () => {
    const c = bord({ schrijven: true });
    expect(c.querySelector('[data-sleep-id="a1"]').getAttribute("draggable")).toBe("true");
    const zones = [...c.querySelectorAll("[data-bord-dropzone]")].map((z) => z.getAttribute("data-bord-kolom"));
    expect(zones.length).toBeGreaterThan(1);
    expect(zones).toContain("Klaar");
  });

  it("laat het bord met alleen leesrechten precies zoals het was", () => {
    const c = bord();
    expect(c.querySelector("[data-bord-status]")).toBeNull();
    expect(c.querySelector("[data-sleep-id]")).toBeNull();
    expect(c.querySelector(".bord-kaart")).not.toBeNull();
  });

  it("houdt de kaart klikbaar naast de kiezer", () => {
    const c = bord({ schrijven: true });
    expect(c.querySelector('.bord-kaart[data-open-rij="acties|a1"]')).not.toBeNull();
  });
});

// ══ 4 · Suggesties in plaats van een tekortkoming ════════════════════

describe("nog niet ingezette agents", () => {
  const basisCtx = (gebruikt) => ({
    schema: g.getSchema(),
    agentUsage: {
      status: "ok",
      ranking: g.getSchema().agents.map((a) => ({ slug: a.slug, value: 0, totaal: gebruikt.includes(a.slug) ? 3 : 0 })),
    },
  });

  const vakAgents = () => g.getSchema().agents.filter((a) => a.rol !== "cross-cutting");

  it("stelt alleen agents voor die nog geen spoor hebben", () => {
    const gebruikt = vakAgents().slice(0, 2).map((a) => a.slug);
    const uit = g.agentSuggesties(basisCtx(gebruikt));
    expect(uit.length).toBeGreaterThan(0);
    for (const a of uit) expect(gebruikt).not.toContain(a.slug);
  });

  /* De Coördinator, Quality Control en de Gids draaien mee zonder een eigen
     rij weg te schrijven. "Nog niet ingezet" is over hen bijna altijd onwaar
     — dat is de blinde vlek die i68 structureel oplost. */
  it("stelt nooit een cross-cutting rol voor", () => {
    for (const a of g.agentSuggesties(basisCtx([]))) expect(a.rol).not.toBe("cross-cutting");
  });

  /* Zonder moduleoverzicht (een daglink, of een licentie buiten de
     f34-allowlist) weten we niet wat iemand heeft. Dan leiden we het af uit
     de data: core heeft iedereen, en een module waarin al gewerkt is, heb je
     aantoonbaar. Nooit een suggestie voor iets wat je niet hebt. */
  it("blijft binnen core en de modules waarin al gewerkt is", () => {
    for (const a of g.agentSuggesties(basisCtx([]))) expect(a.module).toBe("core");

    const sales = g.getSchema().agents.find((a) => a.module !== "core" && a.rol !== "cross-cutting");
    const uit = g.agentSuggesties(basisCtx([sales.slug]));
    const toegestaan = new Set(["core", sales.module]);
    expect(uit.length).toBeGreaterThan(0);
    for (const a of uit) expect(toegestaan.has(a.module)).toBe(true);
  });

  it("noemt er hoogstens drie", () => {
    expect(g.agentSuggesties(basisCtx([])).length).toBeLessThanOrEqual(3);
  });

  it("zegt per agent waarvoor hij is, in de taal van de menukaart", () => {
    const c = el();
    c.innerHTML = g.agentSuggestiesHtml(basisCtx([]));
    const eerste = c.querySelector(".suggesties-lijst a");
    expect(eerste).not.toBeNull();
    expect(eerste.getAttribute("href")).toMatch(/^#\/detail\/agent\//);
    expect(eerste.querySelector(".suggestie-waarvoor").textContent.length).toBeGreaterThan(10);
  });

  it("blijft weg als er niets te suggereren valt", () => {
    const alles = g.getSchema().agents.map((a) => a.slug);
    expect(g.agentSuggestiesHtml(basisCtx(alles))).toBe("");
  });

  it("laat de ritmescore-formule ongemoeid", () => {
    // De suggestie vervangt de breedte-subscore niet; die telt gewoon mee.
    const bron = readFileSync(join(ROOT, "src/zones.js"), "utf8");
    expect(bron).toMatch(/computeAdoptiescore/);
    expect(bron).toMatch(/\{ key: "breedte", label: "Breedte", \.\.\.breedte \}/);
  });
});

// ══ 5 · Wat vind ik waar, en welke versie is dit ═════════════════════

describe("wegwijzers", () => {
  it("zegt per tab wat je er vindt", () => {
    const c = el();
    g.renderTabbar(c, "vandaag", { bundle: { kind: "rows", domains: { acties: { rows: [] } } } });
    const titels = [...c.querySelectorAll("a.tab")].map((a) => a.getAttribute("title"));
    expect(titels.every((t) => t && t.length > 5)).toBe(true);
    expect(titels.join(" | ")).toMatch(/agents deden/);
  });

  it("noemt de schemaversie als schemaversie, niet als de versie van je connector", () => {
    const html = readFileSync(join(ROOT, "dashboard.html"), "utf8");
    expect(html).toMatch(/Teamdefinitie: schemaversie/);
    expect(html).toMatch(/Je connector kan een\s+nieuwere versie draaien/);
    expect(html).not.toMatch(/Gegenereerd uit registryVersion/);
  });
});
