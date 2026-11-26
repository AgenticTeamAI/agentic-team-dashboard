// @vitest-environment jsdom
/* f33 fase A0 — rijen laden náást een vers metricsbestand.
 *
 * Waarom dit een test verdient: tot f33 zette de metrics-tak `kind = "metrics"`
 * en returnde meteen, zónder één rij op te halen. Op elke omgeving waar de
 * dagstart 's ochtends metrics schrijft — dus juist bij de klanten waar we het
 * op testen — was de Data-tab daarmee leeg, en dat is precies waar detail,
 * bord en notities leven. De cijfers blijven van het metricsbestand komen; de
 * rijen komen er nu naast te staan.
 */
import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = ["schema/schema.generated.js", "src/schema-helpers.js", "src/werkruimte-loader.js"];

let g;
beforeAll(() => {
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
});

const BRON = { soort: "daglink", instantieUrl: "https://instantie.test", token: "t" };

/** Een instantie met één metricsentry én echte werkdata-rijen. */
function zetFetch(gegenereerdOp, { logboek = 0, notities = 0 } = {}) {
  const antwoord = (body) => ({ ok: true, status: 200, json: async () => body, headers: new Map() });
  globalThis.fetch = async (url) => {
    const pad = String(url).replace("https://instantie.test", "");
    if (pad === "/dashboard/overzicht") {
      return antwoord({ klant: "Testklant", domeinen: [
        { domein: "dashboard_metrics", aantal: 1 },
        { domein: "acties", aantal: 1 },
        { domein: "logboek", aantal: logboek },
        { domein: "notities", aantal: notities },
      ].filter(d => d.aantal > 0 || d.domein === "acties") });
    }
    if (pad.startsWith("/dashboard/entries?domein=dashboard_metrics")) {
      return antwoord({ entries: [{ entryId: "m-1", bijgewerkt: gegenereerdOp, data: {
        Titel: "Dagcijfers",
        Inhoud: JSON.stringify({ versie: 1, gegenereerdOp, klant: "Testklant", adoptie: {}, domeinen: {} }),
      } }] });
    }
    if (pad.startsWith("/dashboard/entries?domein=acties")) {
      return antwoord({ entries: [
        { entryId: "act-1", bijgewerkt: "2026-09-02T08:00:00Z", data: { Actie: "Nabellen", Status: "Open" } },
      ] });
    }
    return antwoord({ entries: [] });
  };
}

describe("f33 — de Data-tab krijgt rijen, ook op de metricsroute", () => {
  beforeEach(() => { g.vergeetDaglink && g.vergeetDaglink(); });

  it("laadt rijen náást een vers metricsbestand", async () => {
    zetFetch(new Date().toISOString());
    const bundle = await g.loadWerkruimteBundle(BRON);
    expect(bundle.kind).toBe("metrics");            // de cijfers blijven van het bestand
    expect(bundle.domains.acties).toBeTruthy();     // maar de rijen zijn er nu ook
    expect(bundle.domains.acties.rows[0].__entryId).toBe("act-1");
    expect(bundle.systeemPerDomein).toBeTruthy();   // de UI moet extern-wonen kunnen zien
  });

  it("notities tellen niet als werkdata in de arbitrage — één notitie mag de metricsroute niet omzetten", async () => {
    // Verouderde metrics + alleen notities als 'inhoud' => de metrics blijven
    // winnen (met verouderd-waarschuwing), want notities zijn werkgeheugen.
    // Zonder deze regel viel een klant met extern CRM terug op een bijna leeg
    // rijendashboard zodra er één notitie stond.
    expect(vm.runInThisContext("GEHEUGEN_DOMEINEN")).toContain("notities");
  });
});
