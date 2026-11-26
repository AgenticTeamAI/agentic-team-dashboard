// @vitest-environment jsdom
/* s66 stap 1 — een teamlid verwijderen stopt ook zijn open dashboardsessies.
 *
 * Na een geslaagde POST /api/dashboard/team/verwijderen (de site trekt de
 * koppeling in) roept het paneel met de vlag DASHBOARD_SESSIE ook de eigen
 * instantie aan: POST /dashboard/sessies/intrekken {seat}, via de bestaande
 * schrijfWerkruimte (geen nieuwe fetch-plek). Dat zet een sessiegrens, zodat
 * een token dat al onderweg is meteen stopt — ook bij een lid met de
 * standaardrol (contract 2.17.0 §7g g).
 *
 * Een 403, 404 of 503 daarvan is geen fout van de verwijdering, wel een
 * voetnoot: een open sessie van die persoon stopt dan uiterlijk binnen een
 * uur (als zijn access-token verloopt). Een 200 geeft geen voetnoot. Zonder
 * de vlag verandert er niets. Zelfde harnas als test/i77-teambeheer.test.js. */
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = ["src/teksten.js", "src/schema-helpers.js", "src/render.js", "src/team-beheer.js"];

let g;
beforeAll(() => {
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
});

const EIGENAAR = { seat: "a".repeat(64), adres: "tijmen@voorbeeld.nl", naam: "Tijmen", uitgenodigdOp: "2026-09-01T00:00:00.000Z", aanvaardOp: "2026-09-02T00:00:00.000Z", eigenaar: true };
const LID = { seat: "b".repeat(64), adres: "janine@klant.nl", naam: "janine", uitgenodigdOp: "2026-09-03T00:00:00.000Z", eigenaar: false };
const tick = () => new Promise((r) => setTimeout(r, 0));
const VOETNOOT = "Een open sessie van deze persoon stopt uiterlijk binnen een uur.";

function sectie() {
  document.body.innerHTML = `<section id="p" style="display:none;"><div id="panel-team-namen-body"></div></section>`;
  return document.getElementById("p");
}

async function paneel({ vlag = true, bron = { oauth: true, sessie: true, token: "jwt" }, intrekken } = {}) {
  g._resetTeam();
  g.huidigeBron = bron;
  g.sessieFlowAan = () => vlag;
  g.schrijfWerkruimte = vi.fn(intrekken || (async () => ({ beeindigd_vanaf: "2026-11-27T09:00:00.000Z", eigen: false })));
  g.modulesFetch = vi.fn(async () => ({ status: 200, body: { team: [EIGENAAR, LID] } }));
  const el = sectie();
  await g.laadTeam(bron);
  g.renderTeamPanel(el);
  g.modulesFetch = vi.fn(async () => ({ status: 200, body: { team: [EIGENAAR] } }));
  return el;
}

async function verwijderLid(el) {
  el.querySelector(`[data-team-verwijder="${LID.seat}"]`).click();
  await tick();
  el.querySelector(`[data-team-verwijder-ja="${LID.seat}"]`).click();
  for (let i = 0; i < 20; i++) await tick();
  return el.querySelector("[data-team-melding]").textContent;
}

function fout(status) {
  const e = new Error("Je werkruimte gaf een onverwacht antwoord (status " + status + ").");
  e.status = status;
  return e;
}

beforeEach(() => { delete g.schrijfWerkruimte; });

describe("intrekken na verwijderen", () => {
  it("na een geslaagde verwijdering: POST /dashboard/sessies/intrekken {seat} via schrijfWerkruimte, met de sessiebron", async () => {
    const el = await paneel();
    const melding = await verwijderLid(el);
    expect(g.modulesFetch.mock.calls[0][0]).toBe("/api/dashboard/team/verwijderen");
    expect(g.schrijfWerkruimte).toHaveBeenCalledTimes(1);
    const [bron, methode, pad, body] = g.schrijfWerkruimte.mock.calls[0];
    expect(bron).toBe(g.huidigeBron);
    expect(methode).toBe("POST");
    expect(pad).toBe("/dashboard/sessies/intrekken");
    // Alleen de seat, in de body (nooit in het pad).
    expect(body).toEqual({ seat: LID.seat });
    expect(melding).toBe("janine@klant.nl is verwijderd en kan niet meer inloggen.");
  });

  it("de volgorde: eerst de site, pas daarna de instantie", async () => {
    const volgorde = [];
    const el = await paneel({ intrekken: async () => { volgorde.push("instantie"); return {}; } });
    g.modulesFetch = vi.fn(async () => { volgorde.push("site"); return { status: 200, body: { team: [EIGENAAR] } }; });
    await verwijderLid(el);
    expect(volgorde).toEqual(["site", "instantie"]);
  });

  for (const status of [403, 404, 503]) {
    it(`een ${status} van de instantie: de verwijdering is gelukt, met de voetnoot`, async () => {
      const el = await paneel({ intrekken: async () => { throw fout(status); } });
      const melding = await verwijderLid(el);
      expect(melding).toBe("janine@klant.nl is verwijderd en kan niet meer inloggen. " + VOETNOOT);
      // Het lid is echt weg uit de lijst: de fout van de instantie draait niets terug.
      expect(el.querySelector(`[data-team-verwijder="${LID.seat}"]`)).toBeNull();
    });
  }

  it("geen verbinding met de instantie: ook de voetnoot", async () => {
    const el = await paneel({ intrekken: async () => { throw new Error("Je werkruimte-instantie is niet bereikbaar."); } });
    expect(await verwijderLid(el)).toContain(VOETNOOT);
  });

  it("een mislukte verwijdering bij de site roept de instantie niet aan", async () => {
    const el = await paneel();
    g.modulesFetch = vi.fn(async () => ({ status: 503, body: { fout: "storing" } }));
    await verwijderLid(el);
    expect(g.schrijfWerkruimte).not.toHaveBeenCalled();
  });
});

describe("zonder de vlag, of zonder sessie: precies zoals het was", () => {
  it("zonder de vlag: geen aanroep naar de instantie, geen voetnoot", async () => {
    const el = await paneel({ vlag: false });
    const melding = await verwijderLid(el);
    expect(g.schrijfWerkruimte).not.toHaveBeenCalled();
    expect(melding).toBe("janine@klant.nl is verwijderd en kan niet meer inloggen.");
  });

  it("met de oude tabbladlogin (geen sessie): geen aanroep", async () => {
    const el = await paneel({ bron: { oauth: true, token: "jwt" } });
    await verwijderLid(el);
    expect(g.schrijfWerkruimte).not.toHaveBeenCalled();
  });
});
