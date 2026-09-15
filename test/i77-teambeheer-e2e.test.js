// @vitest-environment jsdom
/* i77 — uitnodigen en verwijderen op het échte gebouwde dashboard.html.
 *
 * De unit-tests mocken modulesFetch; hier loopt het verkeer door de echte
 * fetch-plek, zodat vastligt wat er werkelijk over de lijn gaat:
 *  - een uitnodiging is een POST naar de site met het token van de ingelogde
 *    sessie in de Authorization-header;
 *  - wie in hetzelfde tabblad naar een daglink wisselt, houdt het beheerpaneel
 *    niet in beeld, en het daglink-token bereikt de site niet. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(ROOT, "dashboard.html"), "utf8");
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "test/fixtures/oauth-fixture.json"), "utf8"));
const JWT = FIXTURE.tokens.dashboard.jwt;
const HTML_MET_LOGIN = HTML.replace("<title>", '<meta name="at-oauth" content="1">\n<title>');
const SITE = "https://www.agentic-team.ai";
const DAGLINK = "daglinktoken-i77";

const TEAM = [
  { seat: "seat-a", adres: "eigenaar@voorbeeld.nl", naam: "Eigenaar", uitgenodigdOp: "2026-09-01T00:00:00.000Z", aanvaardOp: "2026-09-02T00:00:00.000Z", eigenaar: true },
  { seat: "seat-b", adres: "collega@voorbeeld.nl", naam: "Collega", uitgenodigdOp: "2026-09-03T00:00:00.000Z", eigenaar: false },
];

async function openIngelogd() {
  const fouten = [];
  const siteCalls = [];
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
        const auth = (opties.headers || {}).Authorization;
        if (url.origin === SITE) {
          siteCalls.push({ pad: url.pathname, methode: opties.method || "GET", auth, body: opties.body ? JSON.parse(opties.body) : undefined });
          if (auth !== "Bearer " + JWT) return json(401, { fout: "verlopen" });
          if (url.pathname === "/api/dashboard/team") return json(200, { team: TEAM });
          if (url.pathname === "/api/dashboard/team/uitnodigen") {
            return json(200, { team: [...TEAM, { seat: "seat-c", adres: "nieuw@voorbeeld.nl", naam: "", uitgenodigdOp: "2026-09-15T00:00:00.000Z", eigenaar: false }], uitgenodigd: { nieuw: true, mailVerstuurd: true } });
          }
          return json(404, { fout: "Niet beschikbaar." });
        }
        // De werkruimte-instantie accepteert beide sessies: zo komt de daglink
        // echt tot een render, en dat is precies het geval dat we willen zien.
        if (auth !== "Bearer " + JWT && auth !== "Bearer " + DAGLINK) return json(401, { fout: "verlopen" });
        if (url.pathname === "/dashboard/overzicht") return json(200, { klant: "Testbedrijf BV", intern: false, domeinen: [{ domein: "acties", aantal: 1 }] });
        if (url.pathname === "/dashboard/entries") {
          return json(200, { domein: "acties", entries: [{ domein: "acties", entryId: "a-1", data: { Actie: "Offerte nabellen", Status: "Open" }, aangemaakt: "2026-08-20T09:00:00Z", bijgewerkt: "2026-08-20T09:00:00Z" }] });
        }
        return json(404, { fout: "Onbekende route" });
      };
    },
  });
  const w = dom.window;
  await new Promise((r) => w.addEventListener("load", r));
  const $ = (id) => w.document.getElementById(id);
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function tot(conditie, wat) {
    for (let i = 0; i < 400; i++) {
      await tick();
      if (conditie()) return;
    }
    throw new Error("timeout: " + wat);
  }
  await tot(() => $("tabbar").style.display !== "none", "dashboard geladen");
  await tot(() => $("panel-team-namen").style.display === "" && $("panel-team-namen").querySelector("[data-team-uitnodigen]"), "teampaneel geladen");
  return { w, $, fouten, siteCalls, tot };
}

describe("dashboard.html — teambeheer", () => {
  it("stuurt een uitnodiging als POST met het sessietoken en toont de nieuwe rij", async () => {
    const { w, $, fouten, siteCalls, tot } = await openIngelogd();
    const paneel = $("panel-team-namen");
    paneel.querySelector("[data-team-uitnodig-adres]").value = "nieuw@voorbeeld.nl";
    paneel.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tot(() => paneel.querySelector('[data-team-seat="seat-c"]'), "nieuwe rij");

    const post = siteCalls.find((c) => c.pad === "/api/dashboard/team/uitnodigen");
    expect(post).toEqual({ pad: "/api/dashboard/team/uitnodigen", methode: "POST", auth: "Bearer " + JWT, body: { adres: "nieuw@voorbeeld.nl" } });
    expect(paneel.querySelector("[data-team-melding]").textContent).toBe("Uitnodiging verstuurd naar nieuw@voorbeeld.nl.");
    expect(w.document.activeElement).toBe(paneel.querySelector("[data-team-uitnodig-adres]"));
    expect(fouten).toEqual([]);
  });

  it("sluit het beheerpaneel na een wissel naar een daglink, en het daglink-token bereikt de site niet", async () => {
    const { w, $, fouten, siteCalls, tot } = await openIngelogd();
    const paneel = $("panel-team-namen");
    w.location.hash = `#t=${DAGLINK}`;
    await tot(() => paneel.style.display === "none", "teampaneel dicht na daglink");

    // Ook een formulier dat nog in de DOM staat, stuurt niets.
    const voor = siteCalls.length;
    paneel.querySelector("[data-team-uitnodig-adres]").value = "nieuw@voorbeeld.nl";
    paneel.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await new Promise((r) => setTimeout(r, 20));
    expect(siteCalls.length).toBe(voor);
    expect(siteCalls.filter((c) => c.auth === "Bearer " + DAGLINK)).toEqual([]);
    expect(fouten).toEqual([]);
  });
});
