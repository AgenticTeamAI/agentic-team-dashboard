/* i85 — de soort van een actie en het klantlabel van een ritme komen uit de
 * registry (opties_meta, vanaf registry 1.92.0), zodat het dashboard geen
 * statusnamen hardcodeert. Klaar-als: een status zonder rol maakt deze test rood.
 * Tot de schemasync geldt de terugval — dezelfde indeling. */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let g;
beforeAll(() => {
  globalThis.window = globalThis.window || globalThis;
  for (const rel of ["schema/schema.generated.js", "src/schema-helpers.js", "src/zones.js", "src/voor-jou.js", "src/render.js", "src/vaste-taken.js"]) {
    try { vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel }); } catch (e) { if (!/is not defined/.test(String(e))) throw e; }
  }
  g = globalThis;
});

const statusVeld = (schema) => schema.datadomeinen.acties.velden.find(v => v.naam === "Status");
const ROLLEN = ["voorstel", "open", "bezig", "wacht", "check", "klaar"];

describe("i85 — elke status heeft een rol", () => {
  it("elke status in de registry heeft een bekende rol, en dus een soort", () => {
    for (const status of statusVeld(g.AGENTIC_TEAM_SCHEMA).opties) {
      expect(ROLLEN, `status "${status}" heeft geen (bekende) rol`).toContain(g.statusRol(status, g.AGENTIC_TEAM_SCHEMA));
      expect(vm.runInThisContext("SOORT_PER_STATUS")[status], `status "${status}" heeft geen soort`).toBeTypeOf("function");
    }
  });

  it("met opties_meta komt de rol uit de registry, niet uit de naam", () => {
    const schema = structuredClone(g.AGENTIC_TEAM_SCHEMA);
    const veld = statusVeld(schema);
    veld.opties = veld.opties.map(o => (o === "Wacht op review" ? "Te checken" : o));
    veld.opties_meta = Object.fromEntries(veld.opties.map(o => [o, { rol: o === "Te checken" ? "check" : g.statusRol(o), klantlabel: o }]));
    expect(g.statusRol("Te checken", schema)).toBe("check");
    expect(g.statusRol("Iets nieuws", schema)).toBeNull();
  });

  it("het ritmelabel komt uit opties_meta als die er is", () => {
    const schema = structuredClone(g.AGENTIC_TEAM_SCHEMA);
    const ritme = schema.datadomeinen.ritmetaken.velden.find(v => v.naam === "Ritme");
    ritme.opties_meta = Object.fromEntries(ritme.opties.map(o => [o, { klantlabel: o === "dagelijks" ? "Iedere werkdag" : o }]));
    expect(g.ritmeLabel("dagelijks", schema)).toBe("Iedere werkdag");
    expect(g.ritmeLabel("dagelijks")).toBe("Elke dag"); // terugval zonder opties_meta
  });

  it("de schema-extractie laat opties_meta door naar het dashboard", () => {
    const py = readFileSync(join(ROOT, "scripts/extract-schema.py"), "utf8");
    expect(py).toMatch(/PUBLIEKE_VELDSLEUTELS = \([^)]*"opties_meta"/);
  });
});
