/* Elk CSS-token dat gebruikt wordt, moet ook gedefinieerd zijn.
 *
 * Aanleiding: vijf tokens (--bg, --border, --card, --muted, --text) werden
 * 43 keer gebruikt en waren nergens gedefinieerd. Een browser stilt dat
 * geruisloos af — `background: var(--card)` wordt dan gewoon transparant.
 * Het hele Data-tab-blok rendeerde daardoor zonder kaartvlakken en zonder
 * randen, en `tr.rij-open` — de énige terugkoppeling op de plek waar je een
 * rij aanklikt — was onzichtbaar. Dat was de helft van de reden dat een
 * klant concludeerde dat klikken niets deed.
 *
 * Deze test bewaakt de hele klasse fouten, niet dat ene geval: een typefout
 * in een tokennaam is hier voortaan rood in plaats van onzichtbaar. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("CSS-tokens", () => {
  const css = readFileSync(join(ROOT, "src/styles.css"), "utf8");

  it("definieert elk token dat het gebruikt", () => {
    const gebruikt = [...new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))];
    const gedefinieerd = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const ontbreekt = gebruikt.filter((t) => !gedefinieerd.has(t));
    expect(
      ontbreekt,
      `deze tokens worden gebruikt maar nergens gedefinieerd: ${ontbreekt.join(", ")}. ` +
        `De browser maakt daar stil "niets" van — definieer ze in het :root-blok.`,
    ).toEqual([]);
  });

  it("houdt de terugkoppeling op een geopende rij zichtbaar", () => {
    // Deze regel was het concrete slachtoffer; hij mag niet opnieuw naar een
    // token wijzen dat niet bestaat.
    expect(css).toMatch(/tr\.rij-open\s*\{[^}]*background:\s*var\(--card\)/);
    expect(css).toMatch(/--card\s*:/);
  });
});
