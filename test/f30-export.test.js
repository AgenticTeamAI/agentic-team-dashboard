/* f30 — de exportknop op de Data-tab.
 *
 * Twee niveaus, net als bij OAuth: hier de eenheden uit
 * src/werkruimte-loader.js in de globale scope (zelfde harnas als
 * test/oauth-client.test.js), en in test/integratie.test.js de echte knop in
 * de gebouwde dashboard.html.
 */
import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let g;
beforeAll(() => {
  // oauth-client.js hoort erbij: de 401-tak van downloadExport roept de
  // sessievernieuwing aan, en die woont daar.
  for (const rel of ["src/werkruimte-loader.js", "src/oauth-client.js"]) {
    vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  }
  g = globalThis;
});

describe("bestandsnaam uit de Content-Disposition", () => {
  it("neemt de naam over die de instantie meegeeft", () => {
    expect(g.bestandsnaamUitHeader('attachment; filename="werkruimte-export-janine-2026-08-28.md"', "markdown"))
      .toBe("werkruimte-export-janine-2026-08-28.md");
  });

  it("valt terug op een neutrale naam als de header ontbreekt of raar is", () => {
    for (const kop of [null, "", "attachment", 'attachment; filename=zonder-quotes.md']) {
      expect(g.bestandsnaamUitHeader(kop, "json")).toBe("werkruimte-export.json");
      expect(g.bestandsnaamUitHeader(kop, "markdown")).toBe("werkruimte-export.md");
    }
  });

  it("neemt nooit een naam over die het bestandssysteem of de pagina kan raken", () => {
    // De instantie zeeft al, maar het dashboard mag daar niet op vertrouwen:
    // dit is serverinvoer die rechtstreeks in a.download zou landen.
    for (const vies of [
      'attachment; filename="../../etc/passwd"',
      'attachment; filename="a/b.md"',
      'attachment; filename="naam met spaties.md"',
      'attachment; filename="<script>.md"',
    ]) {
      expect(g.bestandsnaamUitHeader(vies, "markdown")).toBe("werkruimte-export.md");
    }
  });
});

describe("downloadExport", () => {
  let gevraagd;
  let aangeklikt;
  let vrijgegeven;

  function zetOmgeving({ status = 200, disposition = 'attachment; filename="werkruimte-export-x-2026-08-28.md"' } = {}) {
    gevraagd = [];
    aangeklikt = [];
    vrijgegeven = [];
    globalThis.fetch = async (url, opties = {}) => {
      gevraagd.push({ url: String(url), auth: (opties.headers || {}).Authorization });
      return new Response(status === 200 ? "# Werkruimte-export" : JSON.stringify({ fout: "nee" }), {
        status,
        headers: status === 200 ? { "content-disposition": disposition } : {},
      });
    };
    globalThis.URL.createObjectURL = () => "blob:nep";
    globalThis.URL.revokeObjectURL = (u) => vrijgegeven.push(u);
    const anker = { click: () => aangeklikt.push({ ...anker }), remove: () => {} };
    globalThis.document = {
      createElement: () => anker,
      body: { appendChild: () => {} },
    };
    return anker;
  }

  beforeEach(() => { globalThis.setTimeout = (fn) => fn && 0; });

  it("haalt de export op met het bearer-token en biedt hem als download aan", async () => {
    const anker = zetOmgeving();
    await g.downloadExport({ instantieUrl: "https://c.example", token: "t1" }, "markdown");
    expect(gevraagd).toEqual([{ url: "https://c.example/dashboard/export?formaat=markdown", auth: "Bearer t1" }]);
    expect(anker.download).toBe("werkruimte-export-x-2026-08-28.md");
    expect(anker.href).toBe("blob:nep");
    expect(aangeklikt).toHaveLength(1);
  });

  it("geeft bij een verlopen daglink dezelfde melding als de rest van het dashboard", async () => {
    zetOmgeving({ status: 401 });
    await expect(g.downloadExport({ instantieUrl: "https://c.example", token: "t1" }, "json"))
      .rejects.toMatchObject({ daglinkVerlopen: true });
    expect(aangeklikt).toEqual([]);
  });

  it("markeert een verlopen OAuth-sessie als zodanig, zodat de loginknop verschijnt", async () => {
    zetOmgeving({ status: 401 });
    await expect(g.downloadExport({ instantieUrl: "https://c.example", token: "t1", oauth: true }, "json"))
      .rejects.toMatchObject({ oauthVerlopen: true });
  });

  it("downloadt niets bij een serverfout", async () => {
    zetOmgeving({ status: 500 });
    await expect(g.downloadExport({ instantieUrl: "https://c.example", token: "t1" }, "json")).rejects.toThrow(/status 500/);
    expect(aangeklikt).toEqual([]);
  });
});
