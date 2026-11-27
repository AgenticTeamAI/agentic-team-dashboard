/* s66, juristronde 27-11-2026 (rapport-jurist-s66-dashboardsessie-2026-11-27.md).
 *
 * Het privacyconcept achter de vlag DASHBOARD_SESSIE is door de jurist gelezen
 * en gecorrigeerd, maar nog niet vastgesteld. Deze toetsen leggen de
 * correcties vast, en dat zonder de vlag niets verandert: de goedgekeurde
 * PRIVACY_UITKLAP en de Hulpcel "Tot je dit tabblad sluit" blijven. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { open, HTML_MET_LOGIN, ROOT } from "./helpers/s66-sessie.js";

const require = createRequire(import.meta.url);
const teksten = require(join(ROOT, "src/teksten.js"));
const C = teksten.PRIVACY_UITKLAP_SESSIE_CONCEPT;

describe("het concept na de juristronde van 27-11", () => {
  it("blijft gemarkeerd als niet vastgesteld", () => {
    expect(C.markering).toBe("CONCEPT — juridische ronde s66, niet vastgesteld");
  });

  it("een sessie stopt alleen bij minder rechten of verwijderen, niet bij elke rolwijziging (besluit 27-11)", () => {
    expect(C.inloggen).toContain("Krijg je in je team minder rechten of word je uit het team verwijderd, dan stopt je sessie");
    expect(C.inloggen).not.toMatch(/rol in het team gewijzigd/);
  });

  it("het cookie overleeft het sluiten van de browser, en dat staat er", () => {
    expect(C.inloggen).toContain("dat je ingelogd houdt, ook als je de browser sluit");
  });

  it("uitloggen op alle apparaten laat de koppeling met de AI-assistent staan", () => {
    expect(C.inloggen).toContain("op al je apparaten tegelijk; de koppeling met je AI-assistent blijft dan bestaan");
  });

  it("wij lezen van de opentelling alleen totalen over 28 dagen", () => {
    expect(C.inloggen).toContain("wij lezen daarvan alleen de totalen over de laatste 28 dagen, per licentie");
  });

  it("de Hulpcel bij Inloggen noemt de duur van de sessie", () => {
    expect(C.hulpInlogDuur).toBe("Tot je uitlogt: 14 dagen na je laatste gebruik (7 bij afscherming), hooguit 30 dagen");
  });
});

describe("de Hulpcel volgt de vlag", () => {
  it("met de vlag het concept", async () => {
    const { w } = await open();
    expect(w.hulpInlogDuur()).toBe(C.hulpInlogDuur);
  });

  it("zonder de vlag precies de tekst van main", async () => {
    const { w } = await open({ html: HTML_MET_LOGIN });
    expect(w.hulpInlogDuur()).toBe("Tot je dit tabblad sluit");
  });

  it("v1 en v2 gebruiken dezelfde functie, en de vaste cel staat er niet meer los", () => {
    for (const f of ["src/hulp.js", "src/v2-hulp.js"]) {
      const bron = readFileSync(join(ROOT, f), "utf8");
      expect(bron, f).toContain("<td>${esc(hulpInlogDuur())}</td>");
      expect(bron, f).not.toContain("<td>Tot je dit tabblad sluit</td>");
    }
  });
});
