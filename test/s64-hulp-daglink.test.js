// @vitest-environment jsdom
/* s64 nafix (besluit Tijmen 26-11) — de Hulp zegt niet meer vast "24 uur".
 *
 * Een daglink is standaard 24 uur geldig, in een afgeschermd team
 * (AFSCHERMING=aan) korter, standaard 4 uur; werkruimte_dashboard_link zegt
 * het zelf. De Hulp (v2 en het oude hulp.js: de tabel Daglink of inloggen en
 * de woordenlijst) volgt nu de link waarmee je kijkt, met dezelfde rekensom
 * als de melding bij een verlopen link (daglinkGeldigTekst). Zonder daglink
 * (ingelogd, of de lege staat) een neutrale zin.
 *
 * Vergeleken met de opname van main (test/fixtures/s64-hulp-main.json):
 *  - daglink van 24 uur, en een daglink zonder `iat`: byte voor byte main;
 *  - Business-daglink van 4 uur: main, met op precies twee plekken 4 in plaats van 24;
 *  - inlogsessie en lege staat: main, met op precies twee plekken de neutrale
 *    zin. Dat is de bewuste tekstwijziging van deze nafix, voor iedereen die
 *    ingelogd is, ook met de modus uit.
 * De privacytekst (src/teksten.js) is sinds besluit C5 (26-11-2026) de zin
 * van de jurist; de opname is daarvoor opnieuw gemaakt op main d8e0731 met
 * alleen die tekstwijziging (en "De eigenaar (het aankoopadres)"). Besluit D2
 * (26-11-2026) maakte van "de beheerder van je licentie" in dezelfde tekst "de
 * eigenaar van je licentie (het aankoopadres)"; de opname is daarvoor nogmaals
 * gemaakt op main d8e0731, met alleen C5 en D2 erop. Na de merge van main
 * 6706df4 (f62, #136) is de opname op dezelfde manier opnieuw gemaakt op
 * 6706df4, met alleen C5 en D2 erop; dat is de huidige basis (zie `bron` en
 * `herkomst` in de fixture). */
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { laadAlles, stubOpslag, ROOT } from "./helpers/v2.js";
import { NU, alles } from "./helpers/s64-hulp-scenario.js";

const MAIN = JSON.parse(readFileSync(join(ROOT, "test/fixtures/s64-hulp-main.json"), "utf8"));
const CEL_MAIN = "<td>24 uur</td>";
const WOORD_MAIN = "in je dagstart, 24 uur geldig</dd>";
const CEL_NEUTRAAL = "<td>Standaard 24 uur, in een afgeschermd team korter</td>";
const WOORD_NEUTRAAL = "in je dagstart, standaard 24 uur geldig, in een afgeschermd team korter</dd>";
const tel = (s, deel) => s.split(deel).length - 1;
const terug = (s, van, naar) => s.split(van).join(naar);

let g, NUW;
beforeAll(() => {
  vi.useFakeTimers({ now: NU, toFake: ["Date"] });
  stubOpslag(window);
  window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne Verbeek");
  g = laadAlles();
  NUW = alles(g);
});
afterAll(() => { vi.useRealTimers(); window.location.hash = ""; });

describe("s64 — de opname", () => {
  it("hoort bij dit scenario en is van main vóór s64", () => {
    expect(Object.keys(MAIN.v2).sort()).toEqual(Object.keys(NUW.v2).sort());
    expect(Object.keys(MAIN.v1).sort()).toEqual(Object.keys(NUW.v1).sort());
    expect(MAIN.herkomst).toContain("vóór s64");
    // Op main stond overal vast 24 uur.
    for (const html of Object.values(MAIN.v2)) { expect(tel(html, CEL_MAIN)).toBe(1); expect(tel(html, WOORD_MAIN)).toBe(1); }
  });
});

describe("s64 — met een daglink: de duur van die link", () => {
  it("daglink van 24 uur en daglink zonder iat: byte voor byte main", () => {
    for (const naam of ["daglink24", "daglinkZonderIat"]) {
      expect(NUW.v2[naam], naam).toBe(MAIN.v2[naam]);
      expect(NUW.v1[naam], naam).toEqual(MAIN.v1[naam]);
    }
  });

  it("Business-daglink van 4 uur: 4 uur in de tabel en de woordenlijst, verder main", () => {
    const cel = "<td>4 uur</td>", woord = "in je dagstart, 4 uur geldig</dd>";
    const v2 = NUW.v2.daglink4;
    expect(tel(v2, cel)).toBe(1);
    expect(tel(v2, woord)).toBe(1);
    expect(tel(v2, CEL_MAIN) + tel(v2, WOORD_MAIN)).toBe(0);
    expect(terug(terug(v2, cel, CEL_MAIN), woord, WOORD_MAIN)).toBe(MAIN.v2.daglink4);
    expect(terug(NUW.v1.daglink4.daglink, cel, CEL_MAIN)).toBe(MAIN.v1.daglink4.daglink);
    expect(terug(NUW.v1.daglink4.woorden, woord, WOORD_MAIN)).toBe(MAIN.v1.daglink4.woorden);
    expect(NUW.v1.daglink4.daglink).toContain(cel);
  });
});

describe("s64 — zonder daglink: een neutrale zin (bewuste tekstwijziging)", () => {
  it("ingelogd (v2 en oud): de neutrale zin op precies de twee plekken, verder main", () => {
    const v2 = NUW.v2.oauth;
    expect(tel(v2, CEL_NEUTRAAL)).toBe(1);
    expect(tel(v2, WOORD_NEUTRAAL)).toBe(1);
    expect(terug(terug(v2, CEL_NEUTRAAL, CEL_MAIN), WOORD_NEUTRAAL, WOORD_MAIN)).toBe(MAIN.v2.oauth);
    for (const naam of ["oauth", "leeg"]) {
      expect(terug(NUW.v1[naam].daglink, CEL_NEUTRAAL, CEL_MAIN), naam).toBe(MAIN.v1[naam].daglink);
      expect(terug(NUW.v1[naam].woorden, WOORD_NEUTRAAL, WOORD_MAIN), naam).toBe(MAIN.v1[naam].woorden);
      expect(NUW.v1[naam].daglink, naam).toContain(CEL_NEUTRAAL);
    }
  });

  it("de token van een inlogsessie telt niet als daglink (die is een uur geldig, geen daglink)", () => {
    expect(NUW.v2.oauth).not.toContain("<td>1 uur</td>");
    expect(g.daglinkHulpDuur({ oauth: true, token: "x" })).toBe("Standaard 24 uur, in een afgeschermd team korter");
    expect(g.daglinkHulpDuur(null)).toBe("Standaard 24 uur, in een afgeschermd team korter");
    expect(g.daglinkHulpWoord(undefined)).toBe("standaard 24 uur geldig, in een afgeschermd team korter");
    expect(g.daglinkHulpDuur({ token: "" })).toBe("Standaard 24 uur, in een afgeschermd team korter");
  });

  it("een waarde langer dan een week: geen getal, zoals de melding", () => {
    const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const lang = { token: `${b64({ iat: 1, exp: 1 + 400 * 86400 })}.x` };
    expect(g.daglinkHulpDuur(lang)).toBe("Een beperkte tijd");
    expect(g.daglinkHulpWoord(lang)).toBe("een beperkte tijd geldig");
  });

  /* Besluit C5 (26-11-2026, juristtoets rapport-jurist-business-v1-2026-11-26.md,
   * punt 3): de privacytekst noemt nu beide duren, statisch (ook in de lege
   * staat). De opname is opnieuw gemaakt op main d8e0731 met alleen die
   * tekstwijziging; de oude zin staat nergens meer. */
  it("de privacytekst zegt de zin van de jurist (C5), de oude zin staat er niet meer", () => {
    for (const naam of Object.keys(MAIN.v2)) {
      expect(NUW.v2[naam]).toContain("Hij is alleen-lezen en verloopt vanzelf: standaard na 24 uur, en na 4 uur als je licentie afscherming heeft.");
      expect(NUW.v2[naam]).not.toContain("verloopt na 24 uur");
    }
  });

  it("C5: wie collega's uitnodigt is de eigenaar (het aankoopadres), niet 'de beheerder' (botst met de rol Beheerder)", () => {
    for (const naam of Object.keys(MAIN.v2)) {
      expect(NUW.v2[naam]).toContain("<th scope=\"row\">Collega's uitnodigen</th><td>Nee</td><td>De eigenaar (het aankoopadres)</td>");
      expect(NUW.v2[naam]).not.toContain("<td>De beheerder</td>");
    }
    for (const naam of Object.keys(MAIN.v1)) expect(NUW.v1[naam].daglink).toContain("<td>De eigenaar (het aankoopadres)</td>");
  });

  it("D2: wie je naam rechtzet is de eigenaar van je licentie (het aankoopadres), niet 'de beheerder van je licentie'", () => {
    for (const naam of Object.keys(MAIN.v2)) {
      expect(NUW.v2[naam]).toContain("kan de eigenaar van je licentie (het aankoopadres) hem rechtzetten.");
      expect(NUW.v2[naam]).not.toContain("beheerder van je licentie");
    }
  });
});
