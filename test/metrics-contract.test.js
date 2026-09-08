import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ob63: het contract met de werkruimte.
 *
 * De metrics-sanering bestaat twee keer: hier (JavaScript, browser — bepaalt wat
 * er wordt GETOOND uit een geüpload bestand) en in de werkruimte (TypeScript,
 * Node — bepaalt wat er wordt OPGESLAGEN). Ze kunnen niet samengevoegd worden:
 * dit is een statische bundel met CSP-hashes en kan niets uit die repo
 * importeren.
 *
 * Twee handgeschreven spiegels in twee talen lopen uiteen, en het faalt stil —
 * er valt niets om, er staat alleen iets anders op het scherm dan in de opslag.
 * De fixture is daarom het contract, byte-gelijk gevendord uit
 * agent-architecture/architectuur/metrics-fixture.json.
 */

const hier = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const { saneerMetricsPayload } = require_(join(hier, "../src/metrics-sanitize.js"));

const fixture = JSON.parse(readFileSync(join(hier, "fixtures/metrics-fixture.json"), "utf8"));
const schema = {
  datadomeinen: Object.fromEntries(fixture.domeinSlugs.map((d) => [d, {}])),
  agents: fixture.agentSlugs,
};

const saneer = (invoer) => saneerMetricsPayload(structuredClone(invoer), schema);

describe("metrics-sanering — het gedeelde contract", () => {
  it("dekt genoeg gevallen om iets te betekenen", () => {
    expect(fixture.gedeeld.length).toBeGreaterThanOrEqual(35);
  });

  it.each(fixture.gedeeld.map((g) => [g.naam, g]))("%s", (_naam, geval) => {
    expect(saneer(geval.invoer)).toEqual(geval.verwacht);
  });
});

describe("metrics-sanering — de bekende verschillen", () => {
  /**
   * Een bekend verschil is geen uitzondering maar een vastgepind feit. Zo vangt
   * de poort niet alleen NIEUWE drift, maar ook een stille wijziging aan déze
   * kant van het bekende verschil — die zou anders onopgemerkt blijven, want
   * "ze verschilden toch al".
   */
  it.each(fixture.verschilt.map((g) => [g.naam, g]))("%s — deze kant", (_naam, geval) => {
    expect(saneer(geval.invoer)).toEqual(geval.dashboard);
    expect(saneer(geval.invoer)).not.toEqual(geval.werkruimte);
  });
});
