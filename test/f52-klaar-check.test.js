// @vitest-environment jsdom
/* f52 — "Is je team klaar?" en het stappenblad (src/vaste-taken.js).
 *
 * Klaar-als uit Notion: het "systeem deed niets"-scenario geeft een rode regel
 * met één handeling; na het aanzetten 36 uur "nog even wachten" in plaats van
 * rood. Rood alleen als er werk aan de beurt wás — een werkmoment zonder werk
 * laat geen spoor na. Notion-klanten: hooguit "let op", nooit rood. */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
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
];

let g;
let MA; // Management Assistent
let OS; // Outreach Specialist
beforeAll(() => {
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
  MA = g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === "management-assistent").displayName;
  OS = g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === "outreach-specialist").displayName;
});
beforeEach(() => { document.body.innerHTML = `<div id="melding" hidden></div>`; });
afterEach(() => { vi.restoreAllMocks(); window.location.hash = ""; });

// Dinsdag 29 september 2026, 07:42.
const NU = new Date(2026, 8, 29, 7, 42);
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;
const stempel = (aangemaakt) => ({ aangemaakt, bijgewerkt: aangemaakt });
const taak = (id, velden, aangemaakt = "2026-09-01T10:00:00") =>
  ({ __entryId: id, __stempels: stempel(aangemaakt), Agent: MA, Actief: true, ...velden });
const actie = (id, velden, aangemaakt = "2026-09-28T09:00:00") => ({ __entryId: id, __stempels: stempel(aangemaakt), ...velden });

function ctxMet({ taken = [], acties = [], feed = null, activaties = null, schrijven = true, systeemPerDomein = {}, kind = "rows" } = {}) {
  return {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU,
    bron: { oauth: schrijven, token: token(schrijven ? "dashboard:lees dashboard:schrijf" : "dashboard:lees"), instantieUrl: "https://connector.example" },
    kanSchrijven: schrijven, herlaad: vi.fn(), werkBij: vi.fn(),
    bundle: {
      kind, source: "werkruimte", klant: "Verbeek Advies", systeemPerDomein, activaties,
      teamfeed: feed ? { entries: feed } : null,
      domains: { ritmetaken: { rows: taken }, acties: { rows: acties } },
    },
  };
}
const regel = (kc, id) => kc.regels.find(r => r.id === id);
const dezeWeek = { sinds: "2026-09-01", weken: [{ week_start: "2026-09-28", per_agent: { "management-assistent": 4 } }] };

describe("f52 — je team werkt vanzelf", () => {
  it("het systeem deed niets: een rode regel met één handeling", () => {
    const kc = g.klaarCheck(ctxMet({ taken: [
      taak("t1", { Taak: "Openstaande acties oppakken", Ritme: "dagelijks", "Laatst gedraaid": "2026-09-24T02:10:00" }),
    ] }));
    expect(regel(kc, "werkt")).toMatchObject({ k: "nee", actie: "start" });
    expect(regel(kc, "werkt").tekst).toContain("sinds donderdag");
    expect(kc.stil).toBe(true);
    // Eerst moet het team weer werken; de beurt-regel oordeelt dan niet.
    expect(regel(kc, "beurt").k).toBe("onbekend");
  });

  it("na het aanzetten 36 uur 'nog even wachten' in plaats van rood", () => {
    const vers = [taak("t1", { Ritme: "dagelijks" }, "2026-09-28T20:00:00")];
    const kc = g.klaarCheck(ctxMet({ taken: vers }));
    expect(regel(kc, "werkt")).toMatchObject({ k: "onbekend" });
    expect(regel(kc, "werkt").tekst).toContain("Nog even wachten");
    expect(kc.stil).toBe(false);
    // Geen "alles in orde" zolang we het nog niet weten.
    expect(regel(kc, "beurt").k).toBe("onbekend");
    expect(g.klaarSamenvatting(kc).kop).toBe("Is je team klaar? Bijna — nog even wachten");
    // 40 uur later en nog steeds niets: dan wél rood.
    const later = ctxMet({ taken: [taak("t1", { Ritme: "dagelijks" }, "2026-09-27T15:00:00")] });
    expect(regel(g.klaarCheck(later), "werkt").k).toBe("nee");
  });

  it("een spoor van vannacht is genoeg: een taak, of werk dat een agent zelf afrondde", () => {
    const kc = g.klaarCheck(ctxMet({ taken: [taak("t1", { Ritme: "dagelijks", "Laatst gedraaid": "2026-09-29T02:10:00" })] }));
    expect(regel(kc, "werkt")).toMatchObject({ k: "ok", tekst: "Laatst: vannacht 02:10." });
    const viaActie = g.klaarCheck(ctxMet({
      taken: [taak("t1", { Ritme: "dagelijks", "Laatst gedraaid": "2026-09-24T02:10:00" })],
      acties: [actie("a", { Actie: "Prospectlijst", Status: "Klaar", "Afgerond door": OS, "Afgerond op": "2026-09-28T02:30:00" })],
    }));
    expect(regel(viaActie, "werkt").k).toBe("ok");
  });

  it("wat overdag in een gesprek ontstond, telt niet", () => {
    const kc = g.klaarCheck(ctxMet({
      taken: [taak("t1", { Ritme: "dagelijks", "Laatst gedraaid": "2026-09-24T02:10:00" })],
      acties: [actie("a", { Actie: "Offerte", Status: "Open", Eigenaar: "Sanne", "Aangemaakt door": OS }, "2026-09-28T14:00:00")],
      feed: [{ entryId: "f", aangemaakt: "2026-09-28T14:05:00", data: { Soort: "voorstel", Agent: "outreach-specialist" } }],
    }));
    expect(regel(kc, "werkt").k).toBe("nee");
  });

  it("was er niets aan de beurt, dan is stilte geen fout", () => {
    // Alleen een vrijdagtaak, vrijdag gedraaid: tot donderdagavond niets te doen.
    const kc = g.klaarCheck(ctxMet({ taken: [taak("t1", { Ritme: "wekelijks-vr", "Laatst gedraaid": "2026-09-25T02:00:00" })] }));
    expect(regel(kc, "werkt").k).toBe("ok");
    expect(regel(kc, "werkt").tekst).toContain("geen vaste taak aan de beurt");
  });

  it("geen vaste taken aan: rood, met de zin om ze aan te zetten", () => {
    const kc = g.klaarCheck(ctxMet({ taken: [taak("t1", { Ritme: "dagelijks", Actief: false })] }));
    expect(regel(kc, "aan")).toMatchObject({ k: "nee", actie: "start" });
    expect(kc.stil).toBe(true);
  });
});

describe("f52 — de andere regels", () => {
  it("alles in orde", () => {
    const kc = g.klaarCheck(ctxMet({ activaties: dezeWeek, taken: [taak("t1", { Ritme: "dagelijks", "Laatst gedraaid": "2026-09-29T02:10:00" })] }));
    expect(kc.regels.filter(r => r.telt !== false).every(r => r.k === "ok")).toBe(true);
    expect(g.klaarSamenvatting(kc).kop).toBe("Is je team klaar? Ja, alles in orde");
  });

  it("een taak die achterloopt terwijl het team wel werkt: vaker laten werken", () => {
    const kc = g.klaarCheck(ctxMet({ activaties: dezeWeek, taken: [
      taak("t1", { Taak: "Openstaande acties oppakken", Ritme: "dagelijks", Volgorde: 1, "Laatst gedraaid": "2026-09-29T02:10:00" }),
      taak("t2", { Taak: "Gesprekken verwerken", Ritme: "dagelijks", Volgorde: 2, "Laatst gedraaid": "2026-09-24T02:10:00" }),
    ] }));
    expect(regel(kc, "beurt")).toMatchObject({ k: "let", actie: "vaker" });
    expect(regel(kc, "beurt").tekst).toContain("‘Gesprekken verwerken’ kwam 3 werkdagen niet aan de beurt");
    expect(g.klaarSamenvatting(kc).kop).toBe("Is je team klaar? 4 van 5 · 1 punt vraagt aandacht");
  });

  it("werk dat al vijf werkdagen op je wacht", () => {
    const kc = g.klaarCheck(ctxMet({
      taken: [taak("t1", { Ritme: "dagelijks", "Laatst gedraaid": "2026-09-29T02:10:00" })],
      acties: [actie("a", { Actie: "Mail nakijken", Status: "Wacht op review", "Aangemaakt door": OS }, "2026-09-21T02:00:00")],
    }));
    expect(regel(kc, "wacht")).toMatchObject({ k: "let", actie: "ronde" });
    expect(regel(kc, "wacht").tekst).toContain("al 8 dagen");
  });

  it("zonder activatietelling weten we niet of je verbonden bent", () => {
    expect(regel(g.klaarCheck(ctxMet()), "verbonden").k).toBe("onbekend");
    const leeg = { sinds: "2026-09-01", weken: [{ week_start: "2026-09-21", per_agent: { x: 3 } }] };
    expect(regel(g.klaarCheck(ctxMet({ activaties: leeg })), "verbonden").k).toBe("let");
  });

  it("op de daglink: meekijken, met een inlogknop — telt niet mee in de score", () => {
    const kc = g.klaarCheck(ctxMet({ schrijven: false }));
    expect(regel(kc, "afhandelen")).toMatchObject({ k: "let", actie: "login", telt: false });
  });
});

describe("f52 — Notion-klanten", () => {
  const notion = { acties: "notion", ritmetaken: "notion" };
  const post = (dag, soort = "rondestart") => ({ entryId: dag, aangemaakt: `${dag}T02:05:00`, data: { Soort: soort, Agent: "orchestrator" } });

  it("een recente werkronde in de feed: in orde", () => {
    const kc = g.klaarCheck(ctxMet({ kind: "metrics", systeemPerDomein: notion, feed: [post("2026-09-29")] }));
    expect(kc.notion).toBe(true);
    expect(regel(kc, "werkt").k).toBe("ok");
    expect(regel(kc, "aan").k).toBe("onbekend");
  });

  it("lang niets in de feed: let op, nooit rood — een lege ronde meldt niets", () => {
    const kc = g.klaarCheck(ctxMet({ kind: "metrics", systeemPerDomein: notion, feed: [post("2026-09-14")] }));
    expect(regel(kc, "werkt")).toMatchObject({ k: "let", actie: "start" });
    expect(kc.stil).toBe(false);
    expect(regel(g.klaarCheck(ctxMet({ kind: "metrics", systeemPerDomein: notion, feed: [post("2026-09-25")] })), "werkt").k).toBe("onbekend");
  });
});

describe("f52 — de schermen", () => {
  const dood = () => ctxMet({ taken: [taak("t1", { Ritme: "dagelijks", "Laatst gedraaid": "2026-09-24T02:10:00" })] });
  function open(ctx) {
    const el = document.createElement("div");
    document.body.appendChild(el);
    g.renderKlaar(el, ctx);
    return el;
  }

  it("taken staan aan maar niets draait: alleen het werkmoment, geen tweede starter-set", () => {
    const el = open(dood());
    const kopieer = [...el.querySelectorAll("[data-vt-kopieer]")].map(k => k.getAttribute("data-vt-kopieer"));
    expect(kopieer).toEqual(["Werkmoment — Verbeek Advies", vm.runInThisContext("WERKMOMENT_OPDRACHT")]);
    expect(el.textContent).toContain("Zet je werkmoment (weer) aan");
  });

  it("het stappenblad: de kopieerzin, de naam met je bedrijf en de letterlijke opdracht", () => {
    const el = open(ctxMet({ taken: [] }));
    expect(el.querySelector(".kc-kop").textContent).toContain("Is je team klaar?");
    expect(el.querySelector(".kc-nee")).not.toBeNull();
    const kopieer = [...el.querySelectorAll("[data-vt-kopieer]")].map(k => k.getAttribute("data-vt-kopieer"));
    const opdracht = vm.runInThisContext("WERKMOMENT_OPDRACHT");
    expect(kopieer).toEqual(["Zet mijn ritmetaken aan.", "Werkmoment — Verbeek Advies", opdracht]);
    // Letterlijk de opdracht uit de orchestrator-prompt: een andere zin haalt het playbook niet op.
    expect(opdracht).toBe("Haal via de Agentic Team-connector met get_werkronde het actuele werkronde-playbook op en voer het exact uit.");
  });

  it("vaker laten werken: elke 4 uur, zonder het startblad", () => {
    const el = open(ctxMet({ activaties: dezeWeek, taken: [
      taak("t1", { Ritme: "dagelijks", Volgorde: 1, "Laatst gedraaid": "2026-09-29T02:10:00" }),
      taak("t2", { Ritme: "dagelijks", Volgorde: 2, "Laatst gedraaid": "2026-09-24T02:10:00" }),
    ] }));
    expect(el.textContent).toContain("Laat je team vaker werken");
    expect(el.textContent).toContain("elke 4 uur");
    expect(el.textContent).not.toContain("Zet mijn ritmetaken aan.");
    // De link staat op dezelfde pagina: hij brengt je naar het blad, geen dode klik.
    const kop = el.querySelector(".kc-stappen h2");
    kop.scrollIntoView = vi.fn();
    el.querySelector(".kc-beurt, .kc-let").querySelector("a.kc-actie").click();
    expect(kop.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(kop);
  });

  it("Voor jou: 'Je team staat stil' bovenaan, alleen als het zo is", () => {
    expect(g.stilKaartHtml(dood())).toContain("Je team staat stil.");
    expect(g.stilKaartHtml(dood())).toContain('href="#/klaar"');
    expect(g.stilKaartHtml(ctxMet({ taken: [taak("t1", { Ritme: "dagelijks", "Laatst gedraaid": "2026-09-29T02:10:00" })] }))).toBe("");
  });

  it("Vaste taken opent met de samenvatting, één tik naar de hele check", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    g.renderVasteTaken(el, dood());
    const s = el.querySelector("a.kc-samenvatting");
    expect(s.getAttribute("href")).toBe("#/klaar");
    expect(s.classList.contains("kc-nee")).toBe(true);
  });

  it("de statusregel zegt 'je team werkte' alleen op een spoor van een werkmoment", () => {
    const el = document.createElement("p");
    const ctx = dood();
    ctx.bundle.domains.acties.staleAt = new Date(2026, 8, 29, 7, 30); // je wijzigde zelf iets
    g.renderStatusregel(el, ctx);
    expect(el.textContent).toBe("Je team werkte laatst do 24 sep.");
    ctx.bundle.domains.ritmetaken.rows[0]["Laatst gedraaid"] = undefined;
    g.renderStatusregel(el, ctx);
    expect(el.textContent).toBe("Laatst bijgewerkt 07:30.");
  });

  it("#/klaar is een deel van Team", () => {
    window.location.hash = "#/klaar";
    expect(g.bepaalActieveView()).toEqual({ soort: "tab", tab: "klaar" });
    const bar = document.createElement("nav");
    document.body.appendChild(bar);
    g.renderTabbar(bar, "klaar", dood());
    expect(bar.querySelector(".tab.actief .tab-titel").textContent).toBe("Team");
  });
});
