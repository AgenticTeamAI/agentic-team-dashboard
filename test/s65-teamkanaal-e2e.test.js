// @vitest-environment jsdom
/* s65 — het teamkanaal op het échte gebouwde dashboard.html.
 *
 * De unit-test (test/s65-teamkanaal.test.js) mockt schrijfWerkruimte; hier
 * loopt het verkeer door de echte fetch-plek en door app.js (laadBeheer), zodat
 * vastligt wat er werkelijk over de lijn gaat:
 *  - de eigenaar vraagt GET /dashboard/teamkanaal op bij zijn eigen instantie,
 *    met het sessietoken, en een schakelaar is één PUT met
 *    Content-Type application/json en de body {agents:{<slug>: <waarde>}};
 *  - een beheerder vraagt het teamkanaal niet eens op, en ziet geen blok. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(ROOT, "dashboard.html"), "utf8");
const HTML_MET_LOGIN = HTML.replace("<title>", '<meta name="at-oauth" content="1">\n<title>');
const SITE = "https://www.agentic-team.ai";
const INSTANTIE = "connector.agentic-team.ai";

function nepToken(scope, sub = "at_e2e#seat1") {
  const payload = btoa(JSON.stringify({ scope, sub })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `kop.${payload}.handtekening`;
}
const JWT = nepToken("dashboard:lees dashboard:schrijf");
const EIG = "a".repeat(64);
const BEH = "b".repeat(64);
const TEAM = [
  { seat: EIG, adres: "sanne@verbeek.nl", naam: "Sanne", uitgenodigdOp: "2026-09-01T00:00:00.000Z", aanvaardOp: "2026-09-02T00:00:00.000Z", eigenaar: true },
  { seat: BEH, adres: "bea@verbeek.nl", naam: "Bea", uitgenodigdOp: "2026-09-03T00:00:00.000Z", aanvaardOp: "2026-09-04T00:00:00.000Z", eigenaar: false },
];

async function open(rol) {
  const fouten = [];
  const verzoeken = [];
  const keuzes = {};
  const dom = new JSDOM(HTML_MET_LOGIN, {
    runScripts: "dangerously",
    url: "http://localhost/dashboard.html",
    pretendToBeVisual: true,
    beforeParse(w) {
      w.console.error = (...a) => fouten.push(a.map(String).join(" "));
      w.scrollTo = () => {};
      w.addEventListener("error", (e) => fouten.push("error:" + e.message));
      w.Response = Response;
      w.sessionStorage.setItem("agentic-team-dashboard:oauth", JSON.stringify({ access_token: JWT, token_type: "Bearer", refresh_token: "atr_1", scope: "dashboard:lees dashboard:schrijf" }));
      w.fetch = async (u, opties = {}) => {
        const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
        const url = new URL(String(u));
        const methode = opties.method || "GET";
        const headers = opties.headers || {};
        verzoeken.push({ host: url.hostname, methode, pad: url.pathname, auth: headers.Authorization, type: headers["Content-Type"], body: opties.body });
        if (headers.Authorization !== "Bearer " + JWT) return json(401, { fout: "verlopen" });
        if (url.origin === SITE) {
          if (url.pathname === "/api/dashboard/team") return json(200, { team: TEAM });
          if (url.pathname === "/api/dashboard/wie-ben-ik") return json(200, { voorstel: "Sanne", gezet: true });
          return json(404, { fout: "Niet beschikbaar." });
        }
        if (url.hostname !== INSTANTIE) return json(404, { fout: "Niet beschikbaar." });
        if (url.pathname === "/dashboard/overzicht") return json(200, { klant: "Testbedrijf BV", intern: false, domeinen: [{ domein: "acties", aantal: 1 }] });
        if (url.pathname === "/dashboard/entries") {
          return json(200, { domein: "acties", entries: [{ domein: "acties", entryId: "a-1", data: { Actie: "Offerte nabellen", Status: "Open" }, aangemaakt: "2026-08-20T09:00:00Z", bijgewerkt: "2026-08-20T09:00:00Z" }] });
        }
        if (url.pathname === "/dashboard/rollen") {
          return json(200, rol === "eigenaar"
            ? { jij: { seat: EIG, rol: "eigenaar" }, eigenaar: EIG, standaard: "medewerker", toewijsbaar: ["beheerder", "medewerker", "viewer"], rollen: [{ seat: BEH, rol: "beheerder" }] }
            : { jij: { seat: BEH, rol: "beheerder" }, eigenaar: EIG, standaard: "medewerker", toewijsbaar: ["medewerker", "viewer"], rollen: [{ seat: BEH, rol: "beheerder" }] });
        }
        if (url.pathname === "/dashboard/teamkanaal") {
          // Zoals werkruimte #261: alleen de eigenaar.
          if (rol !== "eigenaar") return json(403, { fout: "Alleen de eigenaar stelt in wat er naar het teamkanaal gaat.", code: "alleen_eigenaar" });
          if (methode === "PUT") for (const [s, k] of Object.entries(JSON.parse(opties.body).agents)) { if (k === null) delete keuzes[s]; else keuzes[s] = k; }
          const stand = (slug, standaard) => ({ keuze: slug in keuzes ? keuzes[slug] : null, standaard, effectief: slug in keuzes ? keuzes[slug] : standaard });
          return json(200, {
            kanaal: { ingesteld: true, soort: "slack" }, afscherming: "aan", standaard: "leesbaar_voor_iedereen", gezet_op: null,
            agents: [
              { slug: "orchestrator", naam: "Coördinator", emoji: "🔮", ...stand("orchestrator", true) },
              { slug: "controller", naam: "Controller", emoji: "📊", ...stand("controller", false) },
            ],
          });
        }
        return json(404, { fout: "Onbekende dashboardroute" });
      };
    },
  });
  const w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function tot(conditie, wat) {
    for (let i = 0; i < 400; i++) {
      await tick();
      if (conditie()) return;
    }
    throw new Error("timeout: " + wat);
  }
  await tot(() => !!w.document.querySelector(".tabbalk"), "dashboard geladen");
  await tot(() => w.teamBeheerMogelijk(), "team geladen");
  return { w, d: w.document, fouten, verzoeken, tot };
}

const kanaal = (v) => v.filter((x) => x.pad === "/dashboard/teamkanaal");

describe("dashboard.html — teamkanaal", () => {
  it("de eigenaar ziet het blok, en een schakelaar is één PUT met het sessietoken", async () => {
    const { w, d, fouten, verzoeken, tot } = await open("eigenaar");
    w.location.hash = "#/beheer";
    await tot(() => d.getElementById("kanaal-controller"), "teamkanaal geladen");
    expect(kanaal(verzoeken)).toEqual([{ host: INSTANTIE, methode: "GET", pad: "/dashboard/teamkanaal", auth: "Bearer " + JWT, type: undefined, body: undefined }]);
    const knop = d.getElementById("kanaal-controller");
    expect(knop.getAttribute("aria-checked")).toBe("false");
    knop.click();
    await tot(() => d.getElementById("kanaal-controller") && d.getElementById("kanaal-controller").getAttribute("aria-checked") === "true", "controller aan");
    expect(kanaal(verzoeken).slice(1)).toEqual([{ host: INSTANTIE, methode: "PUT", pad: "/dashboard/teamkanaal", auth: "Bearer " + JWT, type: "application/json", body: '{"agents":{"controller":true}}' }]);
    expect(d.querySelector("[data-kanaal-melding]").textContent).toBe("Controller gaat nu naar het teamkanaal.");
    // Niets ging naar de site.
    expect(verzoeken.filter((v) => v.host !== INSTANTIE && /teamkanaal/.test(v.pad))).toEqual([]);
    expect(fouten).toEqual([]);
  });

  it("een beheerder vraagt het teamkanaal niet op en ziet geen blok", async () => {
    const { w, d, fouten, verzoeken, tot } = await open("beheerder");
    w.location.hash = "#/beheer";
    await tot(() => d.getElementById("panel-team-namen") && d.querySelector("[data-team-jouw-rol]"), "rollen geladen");
    await new Promise((r) => setTimeout(r, 30));
    expect(d.getElementById("beheer-teamkanaal")).toBeNull();
    expect(d.getElementById("root").textContent).not.toContain("Teamkanaal");
    expect(kanaal(verzoeken)).toEqual([]);
    expect(fouten).toEqual([]);
  });
});
