// @vitest-environment jsdom
/* s64, besluiten Tijmen 26-11-2026 (avond) C1 en C2 — "Kopieer voor je team"
 * op Voor jou van een Notion-klant (vraagVoorTeam in src/v2-voor-jou.js).
 *
 * De knop zet een vraag op het klembord die de eigenaar als zijn eigen vraag in
 * de chat plakt. Tot nu toe stond de titel van het item daarin. Wat hier
 * vastligt:
 *  - C1: komt het item van een medewerker, een viewer of `onbekend`, dan noemt
 *    de vraag de titel niet, maar het nummer uit de dagstart (een neutrale
 *    verwijzing);
 *  - C2: fail-closed. Elke waarde die er is maar niet precies eigenaar,
 *    beheerder of sleutel zegt (hoofdletters, spaties, null, onbekende tekst),
 *    telt als lagere rol;
 *  - zonder het veld (modus uit): byte voor byte de vraag en het scherm van
 *    vóór s64 (tegenproef), en eigenaar, beheerder en sleutel net zo;
 *  - het veld reist alleen mee door de sanering van het metricsbestand als het
 *    er is; zonder het veld is een item precies wat het was.
 * Kanttekening (PR-tekst): de werkruimte (src/domeinen/metrics.ts) en de
 * dagstart sturen dit veld nu niet mee bij voor_jou. Tot dat zo is, verandert
 * er voor een klant niets. */
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { laadAlles, stubOpslag } from "./helpers/v2.js";
import { NU, entries, maakCtx, render } from "./helpers/s64-scenario.js";

let g;
beforeAll(() => {
  vi.useFakeTimers({ now: NU, toFake: ["Date"] });
  stubOpslag(window);
  g = laadAlles();
});
afterAll(() => { vi.useRealTimers(); window.location.hash = ""; });

const TITEL = "Bel Jan van Smit en zeg dat de korting 30% is";
const SOORTEN = ["check", "voorstel", "signaal", "taak"];
/* De vier vragen zoals ze vóór s64 waren (src/v2-voor-jou.js op main). */
const OUD = {
  check: `Laat me ‘${TITEL}’ zien, dan kijk ik het na.`,
  voorstel: `Laat me het voorstel ‘${TITEL}’ zien.`,
  signaal: `Laat mijn team ‘${TITEL}’ opvolgen.`,
  taak: `Wat moet ik doen met ‘${TITEL}’?`,
};
const NEUTRAAL = {
  check: "Laat me nummer 3 uit mijn dagstart zien, dan kijk ik het na.",
  voorstel: "Laat me het voorstel nummer 3 uit mijn dagstart zien.",
  signaal: "Laat mijn team nummer 3 uit mijn dagstart opvolgen.",
  taak: "Wat moet ik doen met nummer 3 uit mijn dagstart?",
};
const LAGER = ["medewerker", "viewer", "onbekend"];
const RAAR = ["Medewerker", " viewer", "onbekend ", "Eigenaar", "EIGENAAR", "beheerder ", "", "admin", "__proto__", null];
const HOGER = ["eigenaar", "beheerder", "sleutel"];

/* Een item zoals de sanering het oplevert; `door` undefined: geen veld. */
function item(soort, door) {
  const it = { nr: 3, titel: TITEL, soort, te_laat: false, specialist: "Dealmaker", sinds: null, deadline: null, url: null };
  if (door !== undefined) it.geschreven_door = door;
  return it;
}
/* Voor jou van een Notion-klant met deze items; geeft de html van #root. */
function scherm(items) {
  const ctx = maakCtx(g, entries(g), { notion: true });
  ctx.metricsWerk = { voorJou: items, ritmetaken: null, gegenereerdOp: "2026-11-26T07:02:00" };
  return render(g, ctx, "/");
}
const vragen = (html) => {
  const d = document.createElement("div"); d.innerHTML = html;
  return [...d.querySelectorAll('[data-act="kopieer-tekst"]')].map(b => b.getAttribute("data-t"));
};

describe("s64 C1 — de gekopieerde vraag", () => {
  it("tegenproef: zonder het veld precies de vraag van vóór s64", () => {
    expect(vragen(scherm(SOORTEN.map(s => item(s))))).toEqual(SOORTEN.map(s => OUD[s]));
  });

  it("tegenproef: eigenaar, beheerder en sleutel geven byte voor byte het scherm zonder het veld", () => {
    const zonder = scherm(SOORTEN.map(s => item(s)));
    for (const door of HOGER) expect(scherm(SOORTEN.map(s => item(s, door))), door).toBe(zonder);
  });

  it("medewerker, viewer of onbekend: het nummer uit de dagstart, nooit de titel", () => {
    for (const door of LAGER) {
      const v = vragen(scherm(SOORTEN.map(s => item(s, door))));
      expect(v, door).toEqual(SOORTEN.map(s => NEUTRAAL[s]));
      for (const zin of v) expect(zin, door).not.toMatch(/Jan|korting/);
    }
  });

  it("C2, fail-closed: een onverwachte waarde telt als lagere rol", () => {
    for (const door of RAAR) {
      expect(vragen(scherm(SOORTEN.map(s => item(s, door)))), JSON.stringify(door)).toEqual(SOORTEN.map(s => NEUTRAAL[s]));
    }
  });

  it("alleen de vraag verandert: de kaart zelf (titel, nummer, soort) blijft wat hij was", () => {
    const zonder = scherm(SOORTEN.map(s => item(s)));
    for (const door of [...LAGER, null]) {
      let html = scherm(SOORTEN.map(s => item(s, door)));
      for (const s of SOORTEN) html = html.replace(`data-t="${NEUTRAAL[s]}"`, `data-t="${OUD[s]}"`);
      expect(html, String(door)).toBe(zonder);
    }
  });

  it("zonder nummer: een verwijzing naar het item uit de dagstart", () => {
    const it = item("signaal", "viewer"); delete it.nr;
    expect(vragen(scherm([it]))).toEqual(["Laat mijn team dit item uit mijn dagstart opvolgen."]);
  });
});

describe("s64 C1 — de sanering van het metricsbestand", () => {
  const ruw = (extra) => ({ nr: 3, titel: TITEL, soort: "signaal", ...extra });
  it("zonder het veld: het item van vóór s64, zonder extra sleutel", () => {
    const [it] = g.saneerVoorJouBlok({ items: [ruw()] }, { waarschuwingen: [] }).items;
    expect(it).toStrictEqual({ nr: 3, titel: TITEL, soort: "signaal", te_laat: false, specialist: null, sinds: null, deadline: null, url: null });
  });
  it("met het veld: een tekst reist mee, al het andere als null", () => {
    const met = (w) => g.saneerVoorJouBlok({ items: [ruw({ geschreven_door: w })] }, { waarschuwingen: [] }).items[0].geschreven_door;
    expect(met("viewer")).toBe("viewer");
    expect(met("Eigenaar")).toBe("Eigenaar");
    for (const w of [null, 7, {}, ["eigenaar"], true]) expect(met(w), JSON.stringify(w)).toBe(null);
    expect(met("x".repeat(500))).toHaveLength(40);
  });
});
