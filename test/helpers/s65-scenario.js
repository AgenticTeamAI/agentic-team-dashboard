/* s65 — het scherm Beheer, zoals elke rol en elke toegang het ziet.
 *
 * Dezelfde scenario's dienen voor de opname van main
 * (test/fixtures/s65-teamkanaal-main.json, opgenomen op s64-herkomst 03eb14d,
 * vóór s65) en voor de test die daarmee vergelijkt (test/s65-teamkanaal.test.js);
 * daarom staat het hier apart.
 *
 * Een scenario is: wat de site op /api/dashboard/team zegt (`team`, of null
 * voor een 404), wat de instantie op GET /dashboard/rollen zegt (`rollen`, of
 * een Error met een status), en of je ingelogd bent of met een daglink kijkt.
 * `kanaal` is wat de instantie op /dashboard/teamkanaal zegt (een antwoord, of
 * een Error met een status); op main vraagt niemand ernaar. */
import { entries, maakCtx, render } from "./s64-scenario.js";

const S = (c) => c.repeat(64);
export const EIG = S("a");
export const BEH = S("b");
export const MED = S("c");
export const VIEW = S("d");

export const TEAM = [
  { seat: EIG, adres: "sanne@verbeek.nl", naam: "Sanne Verbeek", uitgenodigdOp: "2026-09-01T00:00:00.000Z", aanvaardOp: "2026-09-02T00:00:00.000Z", eigenaar: true },
  { seat: BEH, adres: "bea@verbeek.nl", naam: "Bea", uitgenodigdOp: "2026-09-03T00:00:00.000Z", aanvaardOp: "2026-09-04T00:00:00.000Z", eigenaar: false },
  { seat: MED, adres: "jan@verbeek.nl", naam: "Jan", uitgenodigdOp: "2026-09-15T00:00:00.000Z", eigenaar: false },
];

const RIJEN = [
  { seat: BEH, rol: "beheerder", gezetOp: "2026-11-25T00:00:00.000Z", gezetDoor: EIG },
  { seat: VIEW, rol: "viewer", gezetOp: "2026-11-25T00:00:00.000Z", gezetDoor: EIG },
];
const lijst = (jij) => ({ jij, eigenaar: EIG, standaard: "medewerker", toewijsbaar: ["beheerder", "medewerker", "viewer"], rollen: RIJEN });

export const fout = (status, tekst = "x", code) => Object.assign(new Error(tekst), { status, ...(code ? { code } : {}) });

export const SCENARIOS = {
  "geen-register": { team: TEAM, rollen: fout(404, "Onbekende dashboardroute") },
  "eigenaar": { team: TEAM, rollen: lijst({ seat: EIG, rol: "eigenaar" }) },
  "eigenaar-zonder-site": { team: null, rollen: lijst({ seat: EIG, rol: "eigenaar" }) },
  "beheerder": { team: null, rollen: lijst({ seat: BEH, rol: "beheerder" }) },
  "beheerder-met-site": { team: TEAM, rollen: lijst({ seat: BEH, rol: "beheerder" }) },
  "medewerker": { team: null, rollen: { jij: { seat: MED, rol: "medewerker" } } },
  "viewer": { team: null, rollen: { jij: { seat: VIEW, rol: "viewer" } } },
  "daglink": { team: TEAM, rollen: lijst({ seat: EIG, rol: "eigenaar" }), daglink: true },
};

/* Zet de beheerstand op zoals app.js (laadBeheer) dat doet, en tekent /beheer.
 * Geeft de html van #root en elk verzoek dat naar de instantie ging. */
export async function tekenBeheer(g, scenario, kanaal) {
  const sc = SCENARIOS[scenario];
  g._resetTeam();
  const ctx = maakCtx(g, entries(g));
  if (sc.daglink) {
    ctx.bron = { token: "daglink-s65", instantieUrl: "https://connector.example" };
    ctx.kanSchrijven = false;
  }
  const bron = ctx.bron;
  g.huidigeBron = bron;
  const verzoeken = [];
  g.modulesFetch = async (pad) => (pad === "/api/dashboard/team" && sc.team ? { status: 200, body: { team: sc.team } } : { status: 404, body: {} });
  g.schrijfWerkruimte = async (b, methode, pad, payload) => {
    verzoeken.push({ methode, pad, token: b.token, ...(payload === undefined ? {} : { payload }) });
    const antwoord = pad === "/dashboard/rollen" ? sc.rollen : pad === "/dashboard/teamkanaal" ? kanaal : fout(404, "Onbekende dashboardroute");
    if (antwoord === undefined) throw fout(404, "Onbekende dashboardroute");
    if (antwoord instanceof Error) throw antwoord;
    return typeof antwoord === "function" ? antwoord(methode, payload) : JSON.parse(JSON.stringify(antwoord));
  };
  await g.laadTeam(bron);
  await g.laadRollen(bron);
  if (typeof g.laadTeamkanaal === "function") await g.laadTeamkanaal(bron);
  const html = render(g, ctx, "/beheer");
  return { html, verzoeken, ctx };
}
