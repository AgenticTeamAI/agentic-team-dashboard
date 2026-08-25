/* s26/016 — het dashboard vroeg alle gevulde domeinen tegelijk op, elk met
 * 5.000 records. Deze test pint dat er nooit meer dan het plafond tegelijk
 * loopt, dat de volgorde van de uitkomsten die van de invoer volgt, en dat
 * een fout net zo doorslaat als bij Promise.all. */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { metPlafond } = require("../src/werkruimte-loader.js");

describe("s26/016 — begrensde gelijktijdigheid", () => {
  it("laat er nooit meer dan het plafond tegelijk lopen", async () => {
    let bezig = 0;
    let piek = 0;
    const items = Array.from({ length: 17 }, (_, i) => i);
    const uit = await metPlafond(items, 4, async (n) => {
      bezig++;
      piek = Math.max(piek, bezig);
      await new Promise((r) => setTimeout(r, 5));
      bezig--;
      return n * 2;
    });
    expect(piek).toBeLessThanOrEqual(4);
    expect(piek).toBeGreaterThan(1); // en het blijft wél parallel
    expect(uit).toEqual(items.map((n) => n * 2));
  });

  it("houdt de volgorde aan, ook als de trage taak vooraan staat", async () => {
    const uit = await metPlafond([30, 1, 1], 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(uit).toEqual([30, 1, 1]);
  });

  it("slaat een fout door, net als Promise.all", async () => {
    await expect(
      metPlafond([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("domein onbereikbaar");
        return n;
      })
    ).rejects.toThrow("domein onbereikbaar");
  });

  it("werkt met minder items dan het plafond en met een lege lijst", async () => {
    expect(await metPlafond([], 4, async () => 1)).toEqual([]);
    expect(await metPlafond([7], 4, async (n) => n)).toEqual([7]);
  });
});
