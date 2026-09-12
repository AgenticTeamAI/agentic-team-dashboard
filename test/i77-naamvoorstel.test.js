// @vitest-environment jsdom
/* i77 — het dashboard vroeg om een naam terwijl je al was ingelogd.
 *
 * De prompt komt nu voorgevuld met wat de site over jouw seat weet. Wat hier
 * vastgezet wordt is niet de tekst maar de terughoudendheid: er gaat alléén een
 * aanroep naar de site uit voor iemand die nog geen naam heeft opgeslagen, en
 * één keer per seat. Een regressie daarop zou betekenen dat het dashboard bij
 * elke schrijfactie een adres laat opzoeken voor iemand die het allang weet. */
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = ["src/data-bewerken.js"];

/* Zie f33-notities-bedienen.test.js: jsdom levert in deze opzet een
 * localStorage zonder getItem/setItem, en dan bewijst een assertie over
 * onthouden niets. */
function stubOpslag() {
  const kluis = new Map();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k) => (kluis.has(k) ? kluis.get(k) : null),
      setItem: (k, v) => kluis.set(k, String(v)),
      removeItem: (k) => kluis.delete(k),
    },
  });
  return kluis;
}

let g;
let kluis;

function bron(seat, token = true) {
  if (!token) return {};
  const payload = btoa(JSON.stringify({ sub: seat })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { token: `kop.${payload}.handtekening` };
}

beforeAll(() => {
  kluis = stubOpslag();
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
});

beforeEach(() => {
  kluis.clear();
  // Nieuwe seat per test, zodat de cache van de vorige test niet meelift.
  g.modulesFetch = vi.fn(async () => ({ status: 200, body: { voorstel: "janine" } }));
});

describe("haalNaamvoorstel", () => {
  it("vraagt de site om een voorstel als er nog geen naam is", async () => {
    expect(await g.haalNaamvoorstel(bron("lic#seat-a"))).toBe("janine");
    expect(g.modulesFetch).toHaveBeenCalledTimes(1);
    expect(g.modulesFetch.mock.calls[0][0]).toBe("/api/dashboard/wie-ben-ik");
  });

  it("vraagt NIETS als deze browser de naam al kent", async () => {
    const b = bron("lic#seat-b");
    g.zetMijnNaam(b, "Tijmen");
    expect(await g.haalNaamvoorstel(b)).toBe("Tijmen");
    expect(g.modulesFetch).not.toHaveBeenCalled();
  });

  it("vraagt hoogstens één keer per seat", async () => {
    const b = bron("lic#seat-c");
    await g.haalNaamvoorstel(b);
    await g.haalNaamvoorstel(b);
    await g.haalNaamvoorstel(b);
    expect(g.modulesFetch).toHaveBeenCalledTimes(1);
  });

  it("vraagt opnieuw voor een andere seat", async () => {
    await g.haalNaamvoorstel(bron("lic#seat-d"));
    await g.haalNaamvoorstel(bron("lic#seat-e"));
    expect(g.modulesFetch).toHaveBeenCalledTimes(2);
  });

  it("vraagt niets zonder sessie", async () => {
    expect(await g.haalNaamvoorstel(bron("", false))).toBe("");
    expect(g.modulesFetch).not.toHaveBeenCalled();
  });

  it("levert leeg bij een leeg serverantwoord", async () => {
    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { voorstel: null } }));
    expect(await g.haalNaamvoorstel(bron("lic#seat-f"))).toBe("");
  });

  it("levert leeg bij een foutstatus", async () => {
    g.modulesFetch = vi.fn(async () => ({ status: 404, body: null }));
    expect(await g.haalNaamvoorstel(bron("lic#seat-g"))).toBe("");
  });

  it("blokkeert niet als de aanroep gooit", async () => {
    g.modulesFetch = vi.fn(async () => { throw new Error("offline"); });
    expect(await g.haalNaamvoorstel(bron("lic#seat-h"))).toBe("");
  });
});
