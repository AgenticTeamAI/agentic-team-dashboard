/* De buildCommand in vercel.json mag niet over de 256 tekens.
 *
 * Aanleiding (11-09-2026): met version.json erbij groeide de shell-ketting van
 * 228 naar 280 tekens en weigerde Vercel élke CLI-deploy met
 * "projectSettings.buildCommand should NOT be longer than 256 characters" —
 * nog voordat de build begon, met een foutmelding die niets over de inhoud zei.
 * De keten zat dus al dicht bij een grens die niemand kende.
 *
 * Sindsdien doet scripts/publiceer.py het werk en is de keten kort. Deze test
 * bewaakt de grens zelf: wie er toch weer stappen aan plakt, ziet het hier in
 * plaats van bij de volgende deploy. */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIMIET = 256;

describe("vercel.json buildCommand", () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));

  it(`blijft onder de ${LIMIET} tekens die Vercel accepteert`, () => {
    expect(typeof vercel.buildCommand).toBe("string");
    expect(vercel.buildCommand.length).toBeLessThanOrEqual(LIMIET);
  });

  it("roept alleen scripts aan die bestaan", () => {
    const scripts = [...vercel.buildCommand.matchAll(/scripts\/[\w.-]+\.py/g)].map((m) => m[0]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(existsSync(join(ROOT, script)), `${script} ontbreekt`).toBe(true);
    }
  });
});
