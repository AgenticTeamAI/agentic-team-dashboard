/* s64 — hoe lang een daglink geldig is, bij een verlopen link.
 *
 * Tot s64 stond er vast "Daglinks zijn 24 uur geldig." Bij Business
 * (AFSCHERMING=aan) geeft de werkruimte kortere links uit, standaard 4 uur
 * (s60). De werkruimte zet `exp` en `iat` in het token (daglink.ts); het
 * dashboard leest daaruit de echte geldigheid. Wat hier vastligt:
 *  - een link van 24 uur (zonder afscherming) en een link zonder `iat`
 *    geven byte voor byte de tekst van vóór s64;
 *  - een link van 4 uur zegt in de melding 4 uur, op de gebouwde dashboard.html;
 *  - een onzinnige waarde geeft een neutrale zin, nooit een getal uit de link
 *    als html. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(ROOT, "dashboard.html"), "utf8");
const MELDING = "Deze dashboardlink is verlopen. Vraag je Coördinator om een nieuwe.";
const VOOR_S64 = MELDING + " Daglinks zijn 24 uur geldig.";

const b64 = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
const IAT = 1795600000;
const daglink = (payload) => `${b64({ scope: "lees", licentie: "AT-TEST", jti: "abc", ...payload })}.handtekening`;

const g = {};
vm.runInNewContext(readFileSync(join(ROOT, "src", "werkruimte-loader.js"), "utf8"), Object.assign(g, { atob, module: { exports: {} } }));
const { daglinkGeldigheid, daglinkGeldigTekst } = g.module.exports;

describe("s64 — de geldigheid uit de daglink", () => {
  it("rekent exp − iat; zonder bruikbare waarden null", () => {
    expect(daglinkGeldigheid(daglink({ iat: IAT, exp: IAT + 4 * 3600 }))).toBe(4 * 3600);
    expect(daglinkGeldigheid(daglink({ iat: IAT, exp: IAT + 86400 }))).toBe(86400);
    for (const t of [daglink({ exp: IAT + 86400 }), daglink({ iat: IAT, exp: IAT }), daglink({ iat: IAT, exp: IAT - 5 }),
      daglink({ iat: "1", exp: "14401" }), daglink({ iat: IAT + 0.5, exp: IAT + 3600 }), "testtoken", "", "!!.x", null, undefined, 42]) {
      expect(daglinkGeldigheid(t), String(t)).toBeNull();
    }
  });

  it("zonder afscherming (24 uur) en zonder gegevens: precies de zin van vóór s64", () => {
    expect(daglinkGeldigTekst(daglink({ iat: IAT, exp: IAT + 86400 }))).toBe("Daglinks zijn 24 uur geldig.");
    expect(daglinkGeldigTekst(daglink({ exp: IAT + 86400 }))).toBe("Daglinks zijn 24 uur geldig.");
    expect(daglinkGeldigTekst("testtoken")).toBe("Daglinks zijn 24 uur geldig.");
    expect(daglinkGeldigTekst(undefined)).toBe("Daglinks zijn 24 uur geldig.");
  });

  it("bij Business de echte geldigheid, in de schrijfwijze van de werkruimte", () => {
    expect(daglinkGeldigTekst(daglink({ iat: IAT, exp: IAT + 4 * 3600 }))).toBe("Daglinks zijn 4 uur geldig.");
    expect(daglinkGeldigTekst(daglink({ iat: IAT, exp: IAT + 90 * 60 }))).toBe("Daglinks zijn 90 minuten geldig.");
    expect(daglinkGeldigTekst(daglink({ iat: IAT, exp: IAT + 61 }))).toBe("Daglinks zijn 1 minuut geldig.");
    expect(daglinkGeldigTekst(daglink({ iat: IAT, exp: IAT + 3 * 3600 + 1800 }))).toBe("Daglinks zijn 210 minuten geldig.");
  });

  it("een waarde die de werkruimte niet uitgeeft: een neutrale zin", () => {
    expect(daglinkGeldigTekst(daglink({ iat: IAT, exp: IAT + 400 * 86400 }))).toBe("Een daglink is maar een beperkte tijd geldig.");
  });
});

/* De gebouwde pagina, met een instantie die elke vraag met 401 beantwoordt. */
async function verlopen(token) {
  const dom = new JSDOM(HTML, {
    runScripts: "dangerously",
    url: "http://localhost/dashboard.html#t=" + encodeURIComponent(token) + "&i=" + encodeURIComponent("http://localhost:8791"),
    pretendToBeVisual: true,
    beforeParse(w) {
      w.scrollTo = () => {};
      w.console.error = () => {};
      w.Response = Response;
      w.fetch = async () => new Response(JSON.stringify({ fout: MELDING }), { status: 401, headers: { "content-type": "application/json" } });
    },
  });
  const w = dom.window;
  for (let i = 0; i < 200; i++) {
    if (/verlopen/.test((w.document.getElementById("root") || w.document.body).textContent) && /geldig/.test((w.document.getElementById("root") || w.document.body).textContent)) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  const tekst = (w.document.getElementById("root") || w.document.body).textContent;
  w.close();
  return tekst;
}

describe("s64 — de melding op de gebouwde pagina", () => {
  it("een link van 24 uur en een link zonder iat: de melding van vóór s64", async () => {
    expect(await verlopen(daglink({ iat: IAT, exp: IAT + 86400 }))).toContain(VOOR_S64);
    expect(await verlopen("testtoken")).toContain(VOOR_S64);
  });

  // De Hulp onder de melding noemt de standaard van 24 uur nog (zie de PR).
  it("een Business-link van 4 uur zegt in de melding 4 uur, niet 24 uur", async () => {
    const tekst = await verlopen(daglink({ iat: IAT, exp: IAT + 4 * 3600, seat: "s1", groepen: ["werkgeheugen"] }));
    expect(tekst).toContain(MELDING + " Daglinks zijn 4 uur geldig.");
    expect(tekst).not.toContain("Daglinks zijn 24 uur");
  });
});
