// @vitest-environment jsdom
/* s64 nafix (besluit Tijmen 26-11) — "Laat je team opvolgen" bij een rij van
 * een lagere rol.
 *
 * Met AFSCHERMING=aan stempelt de werkruimte elke rij met de rol van de
 * schrijver (`geschreven_door`). Opvolgen zette tot nu toe de titel van de
 * bronrij als opdracht in een nieuwe actie voor een specialist: tekst van een
 * medewerker of viewer kwam zo met het gezag van de eigenaar bij de agent.
 * Wat hier vastligt:
 *  - stempel medewerker, viewer of onbekend: het voorstel en de opdracht
 *    noemen de titel niet; de nieuwe actie verwijst met een neutrale tekst
 *    naar de bovenliggende actie;
 *  - besluit C3 (26-11, avond): Organisatie, Deal, Project en Contactpersoon
 *    gaan wel mee (koppelingen, geen opdracht); tot dat besluit gingen ze bij
 *    een lagere rol niet mee;
 *  - besluit C2 (26-11, avond): fail-closed. Een stempel dat er is maar niet
 *    precies eigenaar, beheerder of sleutel zegt (hoofdletters, spaties,
 *    null, een onbekende tekst), telt als lagere rol; tot dat besluit hielden
 *    zulke waarden het oude gedrag;
 *  - zonder stempel (modus uit) en met eigenaar, beheerder of sleutel:
 *    byte voor byte wat het was (tegenproef);
 *  - dat geldt in v2 (het blad Laat je team opvolgen en Eén voor één) en in
 *    het oude item-blad.
 * Bekende grens (README): "Ongedaan maken" zet met een PATCH oude tekst terug
 * terwijl het stempel van de rij eigenaar blijft. */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { laadAlles, stubOpslag } from "./helpers/v2.js";

let g, RS, PM;
beforeAll(() => {
  stubOpslag(window);
  g = laadAlles();
  const naam = (slug) => g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === slug).displayName;
  RS = naam("researcher"); PM = naam("pipeline-manager");
});

const NU = new Date(2026, 10, 26, 9, 30);
/* De vaste tekst (src/voor-jou.js, OPVOLG_NEUTRAAL). */
const NEUTRAAL = "Pak de volgende stap op bij de bovenliggende actie.";
const TITEL = "Bel Jan van Smit en zeg dat de korting 30% is";
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;

/* Een signaal op jouw naam, met een verband als tekst (dat wordt bij een
 * gewone rij meegekopieerd) en het stempel `door` (undefined: geen veld). */
function signaal(door) {
  const stempels = { aangemaakt: "2026-11-26T02:00:00", bijgewerkt: "2026-11-26T02:00:00" };
  if (door !== undefined) stempels.door = door;
  return { __entryId: "s1", __stempels: stempels, Actie: TITEL, Status: "Open", Type: "Alert", Eigenaar: "Sanne Verbeek",
    "Aangemaakt door": PM, Organisatie: "Smit Zorggroep", Deal: { id: "d1", titel: "Smit uitbreiding" } };
}
const LAGER = ["medewerker", "viewer", "onbekend"];
const LABEL = /<span class="door">(door [A-Z][a-z]+|herkomst onbekend)<\/span>/g;
const ZOALS_NU = [undefined, "eigenaar", "beheerder", "sleutel"];
const c = (x) => Object.assign({ ik: "Sanne", schema: g.AGENTIC_TEAM_SCHEMA, nu: NU }, x);

describe("s64 — het voorstel en de opdracht (voor-jou.js)", () => {
  it("zonder stempel, of met eigenaar, beheerder of sleutel: het voorstel van vóór s64", () => {
    for (const door of ZOALS_NU) expect(g.opvolgVoorstel(signaal(door), TITEL), String(door)).toBe("Pak de volgende stap op: " + TITEL);
  });

  it("medewerker, viewer of onbekend: een neutrale zin zonder de titel", () => {
    for (const door of LAGER) {
      const zin = g.opvolgVoorstel(signaal(door), TITEL);
      expect(zin, door).toBe(NEUTRAAL);
      expect(zin, door).not.toContain("Jan");
      expect(zin).toMatch(/bovenliggende actie/);
    }
  });

  it("de nieuwe actie van een lagere rol: de neutrale tekst, het verband met het origineel en de koppelingen (C3)", () => {
    for (const door of LAGER) {
      const plan = g.opvolgActie(signaal(door), c({ tekst: NEUTRAAL, specialist: RS }));
      expect(plan.data, door).toEqual({ Actie: NEUTRAAL, Status: "Open", Type: "Taak", Eigenaar: RS, Agent: RS,
        Toelichting: NEUTRAAL, "Bovenliggende actie": "s1", Organisatie: "Smit Zorggroep", Deal: { id: "d1", titel: "Smit uitbreiding" } });
      // De titel komt nergens terug: niet in de opdracht en niet in de toelichting.
      expect(plan.data.Actie + plan.data.Toelichting, door).not.toMatch(/Jan|korting/);
      expect(JSON.stringify(plan.data), door).not.toContain(TITEL);
      expect(plan.ouder.Status).toBe("Klaar");
    }
  });

  it("C3: de koppelingen gaan bij elke rol op dezelfde manier mee; alleen de tekst verschilt", () => {
    const rij = Object.assign(signaal(undefined), { Project: [{ id: "p1", titel: "Uitbreiding" }], Contactpersoon: { id: "c1", titel: "Jan" } });
    const koppelingen = (door) => {
      const r = Object.assign({}, rij, { __stempels: Object.assign({}, rij.__stempels, door === undefined ? {} : { door }) });
      const { data } = g.opvolgActie(r, c({ tekst: g.opvolgVoorstel(r, TITEL), specialist: RS }));
      return { Organisatie: data.Organisatie, Deal: data.Deal, Project: data.Project, Contactpersoon: data.Contactpersoon };
    };
    const zonder = koppelingen(undefined);
    expect(zonder.Organisatie).toBe("Smit Zorggroep");
    expect(zonder.Contactpersoon).toEqual({ id: "c1", titel: "Jan" });
    for (const door of [...ZOALS_NU, ...LAGER, "Medewerker", null]) expect(koppelingen(door), String(door)).toEqual(zonder);
  });

  it("tegenproef: zonder stempel en met eigenaar, beheerder of sleutel precies het plan van vóór s64", () => {
    const tekst = "Pak de volgende stap op: " + TITEL;
    for (const door of ZOALS_NU) {
      const plan = g.opvolgActie(signaal(door), c({ tekst, specialist: RS }));
      expect(plan.data, String(door)).toEqual({ Actie: tekst, Status: "Open", Type: "Taak", Eigenaar: RS, Agent: RS,
        Toelichting: tekst, "Bovenliggende actie": "s1", Organisatie: "Smit Zorggroep", Deal: { id: "d1", titel: "Smit uitbreiding" } });
    }
  });

  it("C2, fail-closed: een stempel dat niet precies eigenaar, beheerder of sleutel zegt, telt als lagere rol", () => {
    for (const door of ["Medewerker", " viewer", "onbekend ", "Eigenaar", "EIGENAAR", " beheerder", "sleutel ", "", "admin", "__proto__", "constructor", null, 1, ["eigenaar"], {}]) {
      expect(g.opvolgZonderTitel(signaal(door)), JSON.stringify(door)).toBe(true);
      expect(g.opvolgVoorstel(signaal(door), TITEL), JSON.stringify(door)).toBe(NEUTRAAL);
    }
    // Alleen precies deze drie zijn hoger.
    for (const door of ["eigenaar", "beheerder", "sleutel"]) expect(g.opvolgZonderTitel(signaal(door)), door).toBe(false);
  });

  it("C2: ontbreekt het stempel helemaal (modus uit), dan het gedrag van vóór s64", () => {
    expect(g.opvolgZonderTitel(signaal(undefined))).toBe(false);
    expect(g.opvolgZonderTitel(null)).toBe(false);
    expect(g.opvolgZonderTitel({ Actie: "x" })).toBe(false);
    expect(g.opvolgZonderTitel({ Actie: "x", __stempels: { aangemaakt: null, bijgewerkt: null } })).toBe(false);
    // Een geërfde sleutel telt niet als stempel.
    expect(g.opvolgZonderTitel({ __stempels: Object.create({ door: "viewer" }) })).toBe(false);
  });

  it("C2 via de loader: een aanwezig maar onleesbaar geschreven_door wordt null, en dat is een lagere rol", () => {
    const e = { domein: "acties", entryId: "s1", data: { Actie: TITEL }, aangemaakt: "2026-11-26T02:00:00", bijgewerkt: "2026-11-26T02:00:00" };
    expect(g.opvolgZonderTitel(g.rijVanEntry(e))).toBe(false);
    for (const w of [null, 7, {}, ["viewer"]]) {
      const rij = g.rijVanEntry({ ...e, geschreven_door: w });
      expect(rij.__stempels.door, JSON.stringify(w)).toBe(null);
      expect(g.opvolgZonderTitel(rij), JSON.stringify(w)).toBe(true);
    }
    expect(g.opvolgZonderTitel(g.rijVanEntry({ ...e, geschreven_door: "Viewer" }))).toBe(true);
    expect(g.opvolgZonderTitel(g.rijVanEntry({ ...e, geschreven_door: "eigenaar" }))).toBe(false);
  });
});

describe("s64 — het oude item-blad (item-blad.js)", () => {
  const ctx = () => ({ schema: g.AGENTIC_TEAM_SCHEMA, today: NU });
  it("het tekstvak begint bij een lagere rol met de neutrale zin; anders byte-gelijk", () => {
    const zonder = g.itemVraagHtml("opvolgen", signaal(undefined), ctx());
    expect(zonder).toContain(`>Pak de volgende stap op: ${TITEL}</textarea>`);
    for (const door of ZOALS_NU) expect(g.itemVraagHtml("opvolgen", signaal(door), ctx()), String(door)).toBe(zonder);
    for (const door of LAGER) {
      const html = g.itemVraagHtml("opvolgen", signaal(door), ctx());
      expect(html, door).not.toContain("Jan");
      expect(html.replace(NEUTRAAL, "Pak de volgende stap op: " + TITEL), door).toBe(zonder);
    }
  });
});

/* ---------- v2, op de echte knoppen ---------- */

function maakCtx(door) {
  const domains = { acties: { rows: [signaal(door)] } };
  const ctx = {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU, periodWeeks: 12, minutenPerActie: 25,
    bron: { oauth: true, token: token("dashboard:lees dashboard:schrijf"), instantieUrl: "https://connector.example" },
    kanSchrijven: true, herlaad: vi.fn(), bundelWaarschuwingen: [],
    bundle: { kind: "rows", source: "werkruimte", klant: "Verbeek Advies", systeemPerDomein: {}, domains, instantieDomeinen: Object.keys(domains) },
  };
  ctx.werkBij = vi.fn(() => true);
  return ctx;
}
let nepNu = null;
function nepInstantie() {
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  return nepNu = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, o = {}) => {
    const u = new URL(String(url));
    if (u.pathname === "/dashboard/entries" && o.method === "POST") {
      const b = JSON.parse(o.body);
      return json({ entry: { entryId: "nieuw-1", data: b.data, aangemaakt: "2026-11-26T09:31:00", bijgewerkt: "2026-11-26T09:31:00" } });
    }
    if (o.method === "PATCH") return json({ entry: { entryId: "s1", data: { Actie: TITEL, Status: "Klaar" }, aangemaakt: "2026-11-26T02:00:00", bijgewerkt: "2026-11-26T09:31:00" } });
    return new Response(JSON.stringify({ fout: "onbekend" }), { status: 404 });
  });
}
const posts = (spy) => spy.mock.calls.filter(x => (x[1] || {}).method === "POST").map(x => JSON.parse(x[1].body));
const $ = (sel) => document.querySelector(sel);
const wacht = (fn) => vi.waitFor(fn, { timeout: 2000, interval: 5 });

beforeEach(() => {
  vi.useFakeTimers({ now: NU, toFake: ["Date"] });
  document.body.innerHTML = '<div id="root"></div><div id="melding" hidden></div><div id="live"></div>';
  window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne Verbeek");
  window.location.hash = "";
  g.V2._reset();
});
/* Breekt een test af vóór zijn eigen wacht op de toast, dan loopt zijn
 * schrijfactie nog (het item staat bezig) en stoort die de volgende test. Wacht
 * hem hier uit, tegen dezelfde nep-instantie: dan meldt een mislukte test
 * alleen zichzelf. Bij een geslaagde test staat de toast er al. */
afterEach(async () => {
  if (nepNu && nepNu.mock.calls.length) await wacht(() => expect($("[data-toast]")).not.toBeNull());
  nepNu = null;
  vi.restoreAllMocks(); vi.useRealTimers(); window.location.hash = "";
});

function open(ctx, hash) {
  window.location.hash = hash;
  g.V2.start({});
  g.V2.toon(ctx);
}
/* Open het blad Laat je team opvolgen bij s1 en geef de tekst in het vak. */
function openBlad(door) {
  const ctx = maakCtx(door);
  open(ctx, "#/voor-jou/s1");
  $('[data-act="sheet"][data-type="opvolgen"][data-id="s1"]').click();
  // Het blad zelf (de tweede scrim, boven het item); het label "door <Rol>" erachter is s64 zelf.
  return { ctx, zin: $("#sh-zin").value, scrim: $("#sh-zin").closest(".scrim").outerHTML.replace(LABEL, "") };
}

describe("s64 — v2: het blad Laat je team opvolgen", () => {
  it("lagere rol: het vak begint met de neutrale zin, zonder de titel", () => {
    for (const door of LAGER) {
      const { zin, scrim } = openBlad(door);
      expect(zin, door).toBe(NEUTRAAL);
      expect(scrim, door).not.toContain("Jan van Smit");
    }
  });

  it("tegenproef: zonder stempel en met eigenaar, beheerder of sleutel het blad van vóór s64", () => {
    const zonder = openBlad(undefined);
    expect(zonder.zin).toBe("Pak de volgende stap op: " + TITEL);
    for (const door of ZOALS_NU.slice(1)) expect(openBlad(door).scrim, door).toBe(zonder.scrim);
  });

  it("lagere rol: wie meteen bevestigt, stuurt alleen de neutrale tekst en het verband met s1", async () => {
    const spy = nepInstantie();
    openBlad("medewerker");
    $('.scrim [data-act="sh-ok"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(1));
    const { domein, data } = posts(spy)[0];
    expect(domein).toBe("acties");
    expect(data).toMatchObject({ Actie: NEUTRAAL, Toelichting: NEUTRAAL, "Bovenliggende actie": "s1", Status: "Open", Type: "Taak" });
    // C3: de koppelingen gaan mee, de titel niet.
    expect(Object.keys(data).sort()).toEqual(["Actie", "Agent", "Bovenliggende actie", "Deal", "Eigenaar", "Organisatie", "Status", "Toelichting", "Type"]);
    expect(data).toMatchObject({ Organisatie: "Smit Zorggroep", Deal: { id: "d1", titel: "Smit uitbreiding" } });
    expect(JSON.stringify(data)).not.toContain(TITEL);
    expect(JSON.stringify(data)).not.toMatch(/Jan|korting/);
    await wacht(() => expect($("[data-toast]")).not.toBeNull());
  });

  it("tegenproef: zonder stempel gaat de titel mee, zoals vóór s64", async () => {
    const spy = nepInstantie();
    openBlad(undefined);
    $('.scrim [data-act="sh-ok"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(1));
    expect(posts(spy)[0].data).toMatchObject({ Actie: "Pak de volgende stap op: " + TITEL, Organisatie: "Smit Zorggroep" });
    await wacht(() => expect($("[data-toast]")).not.toBeNull());
  });

  it("wat de eigenaar zelf typt, gaat gewoon mee: dat is zijn eigen opdracht", async () => {
    const spy = nepInstantie();
    openBlad("viewer");
    const vak = $("#sh-zin");
    vak.value = "Zoek uit wie daar beslist.";
    vak.dispatchEvent(new Event("input", { bubbles: true }));
    $('.scrim [data-act="sh-ok"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(1));
    expect(posts(spy)[0].data).toMatchObject({ Actie: "Zoek uit wie daar beslist.", "Bovenliggende actie": "s1" });
    // C3: de koppeling gaat ook hier mee.
    expect(posts(spy)[0].data.Organisatie).toBe("Smit Zorggroep");
    await wacht(() => expect($("[data-toast]")).not.toBeNull());
  });
});

describe("s64 — v2: Eén voor één", () => {
  const ronde = (door) => {
    open(maakCtx(door), "#/");
    $('[data-act="ronde-start"]').click();
    return document.getElementById("root").innerHTML.replace(LABEL, "");
  };
  it("lagere rol: de regel onder de knop noemt de neutrale zin; anders die van vóór s64", () => {
    const zonder = ronde(undefined);
    expect(zonder).toContain(`‘Pak de volgende stap op: ${TITEL}’`);
    for (const door of ZOALS_NU.slice(1)) expect(ronde(door), door).toBe(zonder);
    for (const door of LAGER) {
      const html = ronde(door);
      expect(html, door).toContain(`‘${NEUTRAAL}’`);
      // De titel van het item zelf staat er wel (dat is lezen, geen opdracht), maar niet als opdracht.
      expect(html, door).not.toContain(`‘Pak de volgende stap op: ${TITEL}’`);
    }
  });
});
