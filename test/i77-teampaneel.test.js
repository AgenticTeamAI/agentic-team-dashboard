// @vitest-environment jsdom
/* i77 — het beheerderspaneel "Wie werkt er mee".
 *
 * Drie dingen die hier fout kúnnen gaan en het daarom verdienen vastgezet te
 * worden: (1) een daglinksessie heeft geen seat en dus geen beheerderschap — het
 * daglink-token hoort onze server nooit te bereiken; (2) de listener hangt aan
 * de vaste <section> terwijl alleen het lichaam hertekend wordt, dus zonder
 * bind-once stapelt elke render een listener en stuurt één naamwijziging er
 * evenveel identieke POSTs uit; (3) namen en adressen komen van mensen en gaan
 * ongeëscaped de DOM in als je niet oplet. */
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

const TEAM = [
  { seat: "seat-a", adres: "tijmen@voorbeeld.nl", naam: "Tijmen", uitgenodigdOp: "2026-09-01T00:00:00.000Z", aanvaardOp: "2026-09-02T00:00:00.000Z" },
  { seat: "seat-b", adres: "janine@klant.nl", naam: "janine", uitgenodigdOp: "2026-09-03T00:00:00.000Z" },
];

function sectie() {
  document.body.innerHTML = `<section id="p" style="display:none;"><div id="panel-team-namen-body"></div></section>`;
  return document.getElementById("p");
}

beforeEach(() => {
  g.huidigeBron = { oauth: true, token: "jwt" };
  g.modulesFetch = vi.fn(async () => ({ status: 200, body: { team: TEAM } }));
  g._resetTeam();
});

describe("laadTeam", () => {
  it("stuurt in een daglinksessie niets naar de site", async () => {
    expect(await g.laadTeam({ token: "dag-token-zonder-oauth" })).toBeNull();
    expect(g.modulesFetch).not.toHaveBeenCalled();
  });

  it("haalt het team op met een ingelogde sessie", async () => {
    const team = await g.laadTeam({ oauth: true, token: "jwt" });
    expect(team).toHaveLength(2);
    expect(g.modulesFetch.mock.calls[0][0]).toBe("/api/dashboard/team");
  });

  it("levert null bij 404 — geen beheerder is geen fout", async () => {
    g.modulesFetch = vi.fn(async () => ({ status: 404, body: null }));
    expect(await g.laadTeam({ oauth: true, token: "jwt" })).toBeNull();
  });

  it("vraagt hoogstens één keer per token", async () => {
    const bron = { oauth: true, token: "jwt" };
    await g.laadTeam(bron);
    await g.laadTeam(bron);
    expect(g.modulesFetch).toHaveBeenCalledTimes(1);
  });
});

describe("renderTeamPanel", () => {
  it("blijft weg als er geen team is", async () => {
    const el = sectie();
    await g.laadTeam({ token: "dag" });
    g.renderTeamPanel(el);
    expect(el.style.display).toBe("none");
  });

  it("toont elke persoon met naam, adres en status", async () => {
    const el = sectie();
    await g.laadTeam({ oauth: true, token: "jwt" });
    g.renderTeamPanel(el);
    expect(el.style.display).toBe("");
    expect(el.querySelectorAll("[data-team-seat]")).toHaveLength(2);
    expect(el.textContent).toContain("janine@klant.nl");
    expect(el.textContent).toContain("uitgenodigd, nog niet ingelogd");
  });

  it("escapet namen en adressen", async () => {
    g.modulesFetch = vi.fn(async () => ({
      status: 200,
      body: { team: [{ seat: "s", adres: "x@y.nl", naam: '"><img src=x onerror=alert(1)>', uitgenodigdOp: "" }] },
    }));
    const el = sectie();
    await g.laadTeam({ oauth: true, token: "jwt" });
    g.renderTeamPanel(el);
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("[data-team-seat]").value).toContain("<img");
  });

  it("stuurt één POST per naamwijziging, ook na meerdere hertekeningen", async () => {
    const el = sectie();
    await g.laadTeam({ oauth: true, token: "jwt" });
    g.renderTeamPanel(el);
    g.renderTeamPanel(el);
    g.renderTeamPanel(el);

    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { team: TEAM } }));
    const veld = el.querySelector('[data-team-seat="seat-b"]');
    veld.value = "Janine Bakker";
    veld.dispatchEvent(new window.Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(g.modulesFetch).toHaveBeenCalledTimes(1);
    expect(g.modulesFetch.mock.calls[0][1]).toEqual({ seat: "seat-b", naam: "Janine Bakker" });
  });
});
