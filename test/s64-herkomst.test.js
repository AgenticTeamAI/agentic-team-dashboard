// @vitest-environment jsdom
/* s64 (lek 3A) — wie een rij in het werkgeheugen schreef.
 *
 * Met AFSCHERMING=aan stempelt de werkruimte elke rij in het werkgeheugen met
 * de rol van de schrijver; /dashboard/entries geeft die als meta-veld
 * `geschreven_door` naast het entryId (werkruimte-PR #259). Wat hier vastligt:
 *  - zonder dat veld is elk scherm byte voor byte de render van main
 *    (test/fixtures/s64-herkomst-main.json, opgenomen op main vóór s64);
 *  - met eigenaar/beheerder/medewerker/viewer staat er een rustig label
 *    "door <Rol>", en wie dat label weghaalt, houdt precies main over;
 *  - "sleutel" en alles wat de instantie niet hoort te sturen, geven geen
 *    label: ook dan byte-gelijk aan main;
 *  - "onbekend" geeft "herkomst onbekend" (nafix review #133: anders lijkt
 *    zo'n rij werk van de sleutel); wie dat label weghaalt, houdt main over;
 *  - de labeltekst komt uit een vaste tabel, nooit uit de waarde (XSS);
 *  - het meta-veld gaat nooit terug in een schrijfactie. */
import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { laadAlles, stubOpslag, ROOT } from "./helpers/v2.js";
import { NU, ROUTES, entries, maakCtx, render } from "./helpers/s64-scenario.js";

const MAIN = JSON.parse(readFileSync(join(ROOT, "test/fixtures/s64-herkomst-main.json"), "utf8"));
const ALLE = [...ROUTES.map((r) => [r, r, false]), ["notion:/", "/", true]];

let g;
beforeAll(() => {
  vi.useFakeTimers({ now: NU, toFake: ["Date"] });
  stubOpslag(window);
  g = laadAlles();
});
afterAll(() => vi.useRealTimers());
afterEach(() => { vi.restoreAllMocks(); window.location.hash = ""; });

const tekenAlles = (door) => {
  const ents = entries(g, door);
  return Object.fromEntries(ALLE.map(([sleutel, route, notion]) => [sleutel, render(g, maakCtx(g, ents, { notion }), route)]));
};
const LABEL = /( · )?<span class="door">door (Eigenaar|Beheerder|Medewerker|Viewer)<\/span>/g;
const ROLLEN = ["eigenaar", "beheerder", "medewerker", "viewer"];
// Elke rij een vaste rol, verspreid over de vier.
const rolVan = (id) => ROLLEN[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 4];
const LABELTEKST = { eigenaar: "Eigenaar", beheerder: "Beheerder", medewerker: "Medewerker", viewer: "Viewer" };

describe("s64 — zonder geschreven_door: byte-gelijk aan main", () => {
  it("de opname hoort bij dit scenario en dekt elk scherm", () => {
    expect(Object.keys(MAIN.routes).sort()).toEqual(ALLE.map((x) => x[0]).sort());
    expect(MAIN.herkomst).toContain("vóór s64");
  });

  it("elk scherm is byte voor byte de render van main", () => {
    const nu = tekenAlles(() => undefined);
    for (const [sleutel] of ALLE) expect(nu[sleutel], sleutel).toBe(MAIN.routes[sleutel]);
  });

  it("'sleutel' geeft geen label: ook dan byte-gelijk", () => {
    const nu = tekenAlles(() => "sleutel");
    for (const [sleutel] of ALLE) expect(nu[sleutel], sleutel).toBe(MAIN.routes[sleutel]);
  });

  // Nafix review #133: deze test legde eerst vast dat ook "onbekend" geen label
  // gaf. Bewust aangepast: een rij met herkomst "onbekend" mag er niet uitzien
  // als werk van de sleutel (besluit d: "onbekend" telt als medewerker).
  it("'onbekend' geeft 'herkomst onbekend' op precies de plekken van een rol; weghalen geeft main", () => {
    const ONBEKEND = /( · )?<span class="door">herkomst onbekend<\/span>/g;
    const nu = tekenAlles(() => "onbekend");
    const metRol = tekenAlles(rolVan);
    for (const [sleutel] of ALLE) {
      expect(nu[sleutel], sleutel).not.toMatch(LABEL);
      expect((nu[sleutel].match(ONBEKEND) || []).length, sleutel).toBe(metRol[sleutel].match(LABEL).length);
      expect(nu[sleutel].replace(ONBEKEND, ""), sleutel).toBe(MAIN.routes[sleutel]);
    }
  });

  it("wat de instantie niet hoort te sturen, geeft geen label (ook geen html uit de waarde)", () => {
    const raar = ["", "Eigenaar", " eigenaar", "EIGENAAR", "__proto__", "constructor", "toString", "hasOwnProperty",
      '<img src=x onerror="alert(1)">', '"><script>alert(1)</script>', "eigenaar<b>", "Onbekend", " onbekend", "onbekend ", 1, true, null, {}, ["eigenaar"]];
    for (const waarde of raar) {
      const nu = tekenAlles(() => waarde);
      for (const [sleutel] of ALLE) expect(nu[sleutel], `${JSON.stringify(waarde)} ${sleutel}`).toBe(MAIN.routes[sleutel]);
    }
  });
});

describe("s64 — met geschreven_door: een rustig label 'door <Rol>'", () => {
  it("haal je de labels weg, dan blijft precies main over; elk scherm heeft er minstens één", () => {
    const nu = tekenAlles(rolVan);
    for (const [sleutel] of ALLE) {
      expect(nu[sleutel].match(LABEL), sleutel).not.toBeNull();
      expect(nu[sleutel].replace(LABEL, ""), sleutel).toBe(MAIN.routes[sleutel]);
    }
  });

  it("de teamfeed: naast de agent, ook bij een agent die het dashboard niet kent", () => {
    const html = render(g, maakCtx(g, entries(g, rolVan)), "/team");
    const root = document.getElementById("root");
    const posts = [...root.querySelectorAll(".post")];
    const bij = (tekst) => posts.find((p) => p.textContent.includes(tekst));
    expect(bij("Follow-up Jansen").querySelector(".rijtje .door").textContent).toBe("door " + LABELTEKST[rolVan("f2")]);
    expect(bij("Iets zonder bekende agent").querySelector(".rijtje .door").textContent).toBe("door " + LABELTEKST[rolVan("f4")]);
    expect(html.match(LABEL)).toHaveLength(posts.length);
  });

  it("de pagina van een agent: achter de dag", () => {
    render(g, maakCtx(g, entries(g, rolVan)), "/team/agent/dealmaker");
    const regel = [...document.querySelectorAll(".post .klein.stil")].map((x) => x.textContent);
    expect(regel).toEqual(["Vannacht · door " + LABELTEKST[rolVan("f1")]]);
  });

  it("een opmerking bij een actie en een notitie bij een organisatie: in de kopregel", () => {
    render(g, maakCtx(g, entries(g, rolVan)), "/acties/a1");
    expect(document.querySelector(".opm small").textContent).toBe("Janine · vandaag · door " + LABELTEKST[rolVan("n2")]);
    render(g, maakCtx(g, entries(g, rolVan)), "/gegevens/organisaties/o1");
    const koppen = [...document.querySelectorAll(".opm small")].map((x) => x.textContent);
    // Zonder auteur en datum geen losse scheidingsstreep ervoor.
    expect(koppen).toEqual(["Sanne Verbeek · wo 25 nov · door " + LABELTEKST[rolVan("n1")], "door " + LABELTEKST[rolVan("n3")]]);
  });

  it("de lijst en de pagina van een rij in het werkgeheugen", () => {
    render(g, maakCtx(g, entries(g, rolVan)), "/gegevens/lessen_inzichten");
    const regels = [...document.querySelectorAll(".orgrij .rl > span")].map((x) => x.textContent);
    expect(regels).toContain("door " + LABELTEKST[rolVan("l2")]);
    expect(regels.some((t) => t.endsWith(" · door " + LABELTEKST[rolVan("l1")]))).toBe(true);
    render(g, maakCtx(g, entries(g, rolVan)), "/gegevens/dagverslagen/d1");
    expect(document.querySelector(".orgkop p.stil").textContent).toMatch(new RegExp(" · door " + LABELTEKST[rolVan("d1")] + "$"));
  });

  it("het verhaal voor een Notion-klant: binnen de haakjes bij de agent", () => {
    render(g, maakCtx(g, entries(g, rolVan), { notion: true }), "/");
    expect(document.querySelector(".verhaal .detail").textContent)
      .toBe(`Follow-up Jansen geschreven (Outreach Specialist · door ${LABELTEKST[rolVan("f2")]}). Offerte Van Dam klaargezet (Dealmaker · door ${LABELTEKST[rolVan("f1")]}).`);
  });

  // Besluit f (26-11): de stempel staat op elke rij die iemand schrijft, in elk
  // datadomein. Dus ook acties, vaste taken en klantgegevens.
  it("buiten het werkgeheugen: een actie in de lijst, op Voor jou en op het blad, en wat eraan hangt", () => {
    const zelfde = () => "medewerker";
    render(g, maakCtx(g, entries(g, zelfde)), "/acties");
    const rij = [...document.querySelectorAll(".rij")].find((x) => x.textContent.includes("Offerte Van Dam"));
    expect(rij.querySelector(".rmeta .door").textContent).toBe("door Medewerker");
    render(g, maakCtx(g, entries(g, zelfde)), "/");
    expect(document.querySelector(".item .imeta .door").textContent).toBe("door Medewerker");
    render(g, maakCtx(g, entries(g, (id) => (id === "a2" ? "viewer" : "beheerder"))), "/acties/a1");
    const blad = document.querySelector(".blad");
    expect(blad.querySelector(":scope > .rijtje .door").textContent).toBe("door Beheerder");
    const sub = [...blad.querySelectorAll(".rij")].find((x) => x.textContent.includes("Prijs nakijken"));
    expect(sub.querySelector(".rmeta .door").textContent).toBe("door Viewer");
  });

  it("buiten het werkgeheugen: een vaste taak, een contactpersoon en een actie op de klantpagina", () => {
    const door = (id) => ({ v1: "beheerder", c1: "viewer", a1: "medewerker" })[id];
    render(g, maakCtx(g, entries(g, door)), "/team/vaste-taken");
    const taak = [...document.querySelectorAll(".taak")].find((x) => x.textContent.includes("Openstaande acties oppakken"));
    expect(taak.querySelector(".tregel .door").textContent).toBe("door Beheerder");
    render(g, maakCtx(g, entries(g, door)), "/gegevens/organisaties/o1");
    const lijstje = [...document.querySelectorAll(".lijstje > a")].find((x) => x.textContent.includes("Peter van Dam"));
    expect(lijstje.querySelector(".klein.stil").textContent).toBe("Directeur · door Viewer");
    const actie = [...document.querySelectorAll(".rij")].find((x) => x.textContent.includes("Offerte Van Dam"));
    expect(actie.querySelector(".rmeta .door").textContent).toBe("door Medewerker");
    render(g, maakCtx(g, entries(g, door)), "/gegevens/contactpersonen/c1");
    expect(document.querySelector(".orgkop p.stil").textContent).toMatch(/ · door Viewer$/);
  });

  it("het archief van wat je team klaarzette", () => {
    render(g, maakCtx(g, entries(g, () => "eigenaar")), "/acties");
    document.querySelector('[data-act="av"][data-k="toon"][data-v="klaargezet"]').click();
    const rij = [...document.querySelectorAll(".rij")].find((x) => x.textContent.includes("Offerte Van Dam"));
    expect(rij.querySelector(".rmeta .door").textContent).toBe("door Eigenaar");
    render(g, maakCtx(g, entries(g, () => "onbekend")), "/acties");
    document.querySelector('[data-act="av"][data-k="toon"][data-v="klaargezet"]').click();
    const oud = [...document.querySelectorAll(".rij")].find((x) => x.textContent.includes("Offerte Van Dam"));
    expect(oud.querySelector(".rmeta .door").textContent).toBe("herkomst onbekend");
    render(g, maakCtx(g, entries(g, () => "sleutel")), "/acties");
    document.querySelector('[data-act="av"][data-k="toon"][data-v="klaargezet"]').click();
    expect(document.querySelector("#root .door")).toBeNull();
  });

  it("een waarde met html wordt nooit html, ook niet naast een echte rol", () => {
    const door = (id) => (id === "f2" ? "medewerker" : '<img src=x onerror="alert(1)">');
    const nu = tekenAlles(door);
    for (const [sleutel] of ALLE) {
      expect(nu[sleutel]).not.toContain("<img");
      expect(nu[sleutel]).not.toContain("onerror");
    }
    expect(nu["/team"].match(LABEL)).toEqual(['<span class="door">door Medewerker</span>']);
  });
});

describe("s64 — de stempel in de rij en in de feed", () => {
  it("rijVanEntry: bij de andere stempels, en zonder veld precies zoals vóór s64", () => {
    const e = { domein: "notities", entryId: "n1", data: { Notitie: "x" }, aangemaakt: "2026-11-26T08:00:00", bijgewerkt: "2026-11-26T08:00:00" };
    expect(g.rijVanEntry(e)).toStrictEqual({ Notitie: "x", __entryId: "n1", __stempels: { aangemaakt: e.aangemaakt, bijgewerkt: e.bijgewerkt } });
    expect(g.rijVanEntry({ ...e, geschreven_door: "viewer" }).__stempels).toStrictEqual({ aangemaakt: e.aangemaakt, bijgewerkt: e.bijgewerkt, door: "viewer" });
    expect(g.rijVanEntry({ ...e, geschreven_door: 7 }).__stempels).not.toHaveProperty("door");
    // Geen nieuw veld op de rij zelf: een schemaveld als "Geschreven door" leest de stempel nooit.
    expect(g.getField(g.rijVanEntry({ ...e, geschreven_door: "viewer" }), "Geschreven door")).toBeUndefined();
  });

  it("schrijverLabel: alleen de vier rollen van een mens", () => {
    expect(ROLLEN.map(g.schrijverLabel)).toEqual(["Eigenaar", "Beheerder", "Medewerker", "Viewer"]);
    for (const w of ["sleutel", "onbekend", "", "Viewer", "__proto__", "constructor", undefined, null, 3]) expect(g.schrijverLabel(w)).toBeNull();
  });

  it("herkomstTekst: 'door <Rol>', 'herkomst onbekend' bij onbekend, verder niets", () => {
    expect(ROLLEN.map(g.herkomstTekst)).toEqual(["door Eigenaar", "door Beheerder", "door Medewerker", "door Viewer"]);
    expect(g.herkomstTekst("onbekend")).toBe("herkomst onbekend");
    for (const w of ["sleutel", "Onbekend", " onbekend", "", "__proto__", "constructor", undefined, null, 3, {}]) expect(g.herkomstTekst(w)).toBeNull();
  });

  it("normaliseerFeed: 'door' alleen als de instantie hem meestuurt", () => {
    const e = { entryId: "f1", data: { Agent: "dealmaker", Soort: "update", Bericht: "x" }, aangemaakt: "2026-11-26T02:20:00" };
    const lookup = g.buildAgentLookup();
    expect(g.normaliseerFeed([e], g.AGENTIC_TEAM_SCHEMA, lookup)[0]).not.toHaveProperty("door");
    expect(g.normaliseerFeed([{ ...e, geschreven_door: "beheerder" }], g.AGENTIC_TEAM_SCHEMA, lookup)[0].door).toBe("beheerder");
  });
});

describe("s64 — het meta-veld gaat nooit terug naar de werkruimte", () => {
  it("een veld wijzigen bij een gestempelde rij: de PATCH draagt alleen dat veld; de nieuwe stempel komt uit het antwoord", async () => {
    const ents = entries(g, (id) => (id === "l1" ? "eigenaar" : undefined));
    const ctx = maakCtx(g, ents);
    ctx.werkBij = (key, w) => {
      const dom = ctx.bundle.domains[key];
      const nieuw = g.rijVanEntry(w.entry);
      dom.rows = dom.rows.map((r) => (r.__entryId === nieuw.__entryId ? nieuw : r));
      g.V2.toon(ctx);
      return true;
    };
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, o = {}) => {
      const body = JSON.parse(o.body);
      const oud = ents.lessen_inzichten.find((x) => x.entryId === "l1");
      return new Response(JSON.stringify({ entry: { domein: "lessen_inzichten", entryId: "l1", geschreven_door: "medewerker", data: { ...oud.data, ...body.data }, aangemaakt: oud.aangemaakt, bijgewerkt: "2026-11-26T09:31:00" } }),
        { status: 200, headers: { "content-type": "application/json" } });
    });
    render(g, ctx, "/gegevens/lessen_inzichten/l1");
    expect(document.querySelector(".orgkop p.stil").textContent).toMatch(/ · door Eigenaar$/);
    document.querySelector('[data-act="veld-wijzig"][data-v="Actie"]').click();
    const invoer = document.querySelector(".inline-edit [data-veldtype]"); invoer.value = "Vrijdag eerder versturen";
    document.querySelector("[data-v2-veldform]").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1), { timeout: 2000, interval: 5 });
    const [url, o] = spy.mock.calls[0];
    expect(o.method).toBe("PATCH");
    expect(new URL(String(url)).pathname).toBe("/dashboard/entries/lessen_inzichten/l1");
    expect(JSON.parse(o.body)).toStrictEqual({ data: { Actie: "Vrijdag eerder versturen" } });
    expect(o.body).not.toMatch(/geschreven|door|__stempels/);
    await vi.waitFor(() => expect(document.querySelector(".orgkop p.stil").textContent).toMatch(/ · door Medewerker$/), { timeout: 2000, interval: 5 });
  });
});
