// @vitest-environment jsdom
/* i77 — de naam hoort bij je seat, niet bij je browser.
 *
 * Eerst stond de weergavenaam alleen in localStorage. Dat werkte voor één
 * persoon op één apparaat en verder nergens: een tweede laptop vroeg het
 * opnieuw, en bij meerdere mensen op één licentie kon niemand corrigeren dat
 * dezelfde persoon in drie spellingen in dezelfde kolom stond. Nu is de server
 * de bron en houdt de browser een terugvalkopie.
 *
 * Drie dingen staan hier vast, en ze zijn alle drie eerder fout gegaan:
 * (1) een gekozen naam van de server wint van de kopie — anders komt een
 *     correctie door de beheerder nooit aan, en dan is het beheerpaneel decor;
 * (2) een naam die deze browser al kende wordt NIET overschreven door het deel
 *     vóór de @ van het adres, maar één keer omhooggetild;
 * (3) hoogstens één aanroep per seat, en zonder sessie geen enkele. */
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
  g._resetNaamvoorstel();
  // Nieuwe seat per test, zodat de cache van de vorige test niet meelift.
  g.modulesFetch = vi.fn(async () => ({ status: 200, body: { voorstel: "janine" } }));
});

describe("haalNaamvoorstel", () => {
  it("neemt de naam die de server heeft vastgelegd", async () => {
    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { voorstel: "Janine Bakker", gezet: true } }));
    expect(await g.haalNaamvoorstel(bron("lic#seat-a"))).toBe("Janine Bakker");
    expect(g.modulesFetch.mock.calls[0][0]).toBe("/api/dashboard/wie-ben-ik");
  });

  it("laat een correctie door de beheerder winnen van de kopie in deze browser", async () => {
    const b = bron("lic#seat-b");
    g.bewaarKopie(b, "typfuot");
    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { voorstel: "Janine Bakker", gezet: true } }));
    expect(await g.haalNaamvoorstel(b)).toBe("Janine Bakker");
  });

  it("overschrijft een zelfgekozen naam NIET met een afleiding uit het adres", async () => {
    const b = bron("lic#seat-c");
    g.bewaarKopie(b, "Tijmen Kip");
    // Server kent nog geen gekozen naam en stelt het deel vóór de @ voor.
    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { voorstel: "tijmen", gezet: false } }));
    expect(await g.haalNaamvoorstel(b)).toBe("Tijmen Kip");
  });

  it("tilt die naam één keer omhoog naar de server", async () => {
    const b = bron("lic#seat-d");
    g.bewaarKopie(b, "Tijmen Kip");
    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { voorstel: "tijmen", gezet: false } }));
    await g.haalNaamvoorstel(b);
    const schrijf = g.modulesFetch.mock.calls.filter((c) => c[1] && c[1].naam);
    expect(schrijf).toHaveLength(1);
    expect(schrijf[0][1].naam).toBe("Tijmen Kip");
  });

  it("stelt het deel vóór de @ voor als niemand een naam koos", async () => {
    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { voorstel: "janine", gezet: false } }));
    expect(await g.haalNaamvoorstel(bron("lic#seat-e"))).toBe("janine");
  });

  it("vraagt hoogstens één keer per seat", async () => {
    const b = bron("lic#seat-f");
    await g.haalNaamvoorstel(b);
    await g.haalNaamvoorstel(b);
    await g.haalNaamvoorstel(b);
    expect(g.modulesFetch.mock.calls.filter((c) => c[1] === undefined)).toHaveLength(1);
  });

  it("vraagt opnieuw voor een andere seat", async () => {
    await g.haalNaamvoorstel(bron("lic#seat-g"));
    await g.haalNaamvoorstel(bron("lic#seat-h"));
    expect(g.modulesFetch.mock.calls.filter((c) => c[1] === undefined)).toHaveLength(2);
  });

  it("vraagt niets zonder sessie", async () => {
    expect(await g.haalNaamvoorstel(bron("", false))).toBe("");
    expect(g.modulesFetch).not.toHaveBeenCalled();
  });

  it("valt bij een storing terug op de kopie in deze browser", async () => {
    const b = bron("lic#seat-i");
    g.bewaarKopie(b, "Tijmen");
    g.modulesFetch = vi.fn(async () => { throw new Error("offline"); });
    expect(await g.haalNaamvoorstel(b)).toBe("Tijmen");
  });

  it("levert leeg bij een foutstatus zonder kopie", async () => {
    g.modulesFetch = vi.fn(async () => ({ status: 404, body: null }));
    expect(await g.haalNaamvoorstel(bron("lic#seat-j"))).toBe("");
  });
});

describe("zetMijnNaam", () => {
  it("bewaart een kopie én stuurt hem naar de server", async () => {
    const b = bron("lic#seat-k");
    expect(g.zetMijnNaam(b, "  Janine  ")).toBe("Janine");
    expect(g.mijnNaam(b)).toBe("Janine");
    const schrijf = g.modulesFetch.mock.calls.filter((c) => c[1] && "naam" in c[1]);
    expect(schrijf).toHaveLength(1);
    expect(schrijf[0][1].naam).toBe("Janine");
  });

  it("houdt de gebruiker niet op als de server niet bereikbaar is", () => {
    g.modulesFetch = vi.fn(async () => { throw new Error("offline"); });
    const b = bron("lic#seat-l");
    expect(g.zetMijnNaam(b, "Janine")).toBe("Janine");
    expect(g.mijnNaam(b)).toBe("Janine");
  });
});
