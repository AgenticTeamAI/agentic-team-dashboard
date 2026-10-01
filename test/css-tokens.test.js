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

  it("houdt de focus altijd zichtbaar", () => {
    // Dashboard v2: wie met het toetsenbord werkt (1–9, G, T, J/K) moet zien
    // waar hij is. Eén regel voor alles, met een eigen token.
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)/);
    expect(css).toMatch(/--focus\s*:/);
  });
});

/* i86 — huisstijl v2: licht/donker/systeem via tokens.
 *
 * Drie dingen die stil mis kunnen gaan en daarom hier vastliggen:
 * - een losse kleur buiten de tokenblokken klopt maar in één van de twee
 *   thema's (typisch: wit op wit in licht);
 * - een token dat alleen in licht of alleen in donker bestaat, valt in het
 *   andere thema terug op iets onbedoelds;
 * - de tekst/vlak-paren moeten in béíde thema's AA halen (4,5:1 voor tekst,
 *   3:1 voor randen en grote vlakken met betekenis). */
describe("i86 — thema's", () => {
  const css = readFileSync(join(ROOT, "src/styles.css"), "utf8");
  const licht = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")) + 1);
  const mediaStart = css.indexOf("@media (prefers-color-scheme: dark)");
  const donkerStart = css.indexOf(":root {", mediaStart);
  const donker = css.slice(donkerStart, css.indexOf("}", donkerStart) + 1);
  const tokens = (blok) => Object.fromEntries([...blok.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const L = tokens(licht);
  const D = tokens(donker);

  it("heeft een licht thema en een donker thema dat de systeeminstelling volgt", () => {
    expect(Object.keys(L).length).toBeGreaterThan(20);
    expect(donkerStart).toBeGreaterThan(mediaStart);
    expect(licht).toMatch(/color-scheme:\s*light/);
    expect(donker).toMatch(/color-scheme:\s*dark/);
  });

  it("donker definieert dezelfde kleurtokens als licht", () => {
    const kleuren = (t) => Object.keys(t).filter((k) => !["--font", "--mono"].includes(k)).sort();
    expect(kleuren(D)).toEqual(kleuren(L));
  });

  it("gebruikt buiten de tokenblokken geen losse kleuren", () => {
    const rest = css.replace(licht, "").replace(donker, "");
    const los = [...rest.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g)].map((m) => m[0]);
    expect(los, "losse kleuren in styles.css — maak er een token van").toEqual([]);
    for (const bestand of ["src/charts.js", "src/render.js", "src/homepage.js", "src/databrowser.js", "src/shell.html"]) {
      const bron = readFileSync(join(ROOT, bestand), "utf8");
      expect(bron.match(/(fill|stroke|color|background)\s*[=:]\s*["']?#[0-9a-fA-F]{3,6}\b/g), bestand).toBeNull();
    }
  });

  function lum(hex) {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }

  // [voorgrond, achtergrond, minimum]
  const PAREN = [
    ["--ink", "--bg", 4.5], ["--ink", "--surface", 4.5], ["--ink", "--surface-2", 4.5], ["--ink", "--jij-zacht", 4.5],
    ["--muted", "--bg", 4.5], ["--muted", "--surface", 4.5], ["--muted", "--surface-2", 4.5],
    ["--team-tekst", "--surface", 4.5], ["--team-tekst", "--team-zacht", 4.5], ["--team-tekst", "--bg", 4.5],
    ["--jij-tekst", "--surface", 4.5], ["--jij-tekst", "--jij-zacht", 4.5],
    ["--rood", "--surface", 4.5], ["--rood", "--rood-zacht", 4.5],
    ["--klaar", "--surface", 4.5], ["--klaar", "--klaar-zacht", 4.5],
    ["--op-team", "--team", 4.5], ["--op-jij", "--jij", 4.5],
    ["--toast-ink", "--toast-bg", 4.5], ["--toast-accent", "--toast-bg", 4.5],
    ["--team", "--surface", 3], ["--veldrand", "--surface", 3], ["--focus", "--surface", 3],
  ];
  for (const [thema, T] of [["licht", () => L], ["donker", () => D]]) {
    it(`haalt AA-contrast in ${thema}`, () => {
      const te = [];
      for (const [voor, achter, min] of PAREN) {
        const c = contrast(T()[voor], T()[achter]);
        if (c < min) te.push(`${voor} op ${achter}: ${c.toFixed(2)} < ${min}`);
      }
      expect(te).toEqual([]);
    });
  }
});
