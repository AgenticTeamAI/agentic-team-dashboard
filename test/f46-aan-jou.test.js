// @vitest-environment jsdom
/* f46 — één definitie van "aan jou" (src/voor-jou.js).
 *
 * Badge, lijst, de baan "Jij" en de klaar-check gaan straks allemaal op
 * aanJouZet() rekenen. Deze tests zetten de definitie vast: f44 (a+b), plus
 * Voorstel, te laat en weer aan de beurt; per persoon, met collega's apart; en
 * een koppeltabel status → soort die elke status uit de registry kent. */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [
  "schema/schema.generated.js",
  "src/teksten.js",
  "src/schema-helpers.js",
  "src/werkruimte-loader.js",
  "src/zones.js",
  "src/voor-jou.js",
];

const lees = (naam) => vm.runInThisContext(naam);
let g;
let AGENT; // weergavenaam van een echte agent uit de registry
beforeAll(() => {
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
  AGENT = g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === "outreach-specialist").displayName;
});

// Dinsdag 29 september 2026, 07:42 — zelfde moment als het prototype.
const NU = new Date(2026, 8, 29, 7, 42);
let volg = 0;
function rij(velden, stempel) {
  volg += 1;
  return { __entryId: "a" + volg, __stempels: { aangemaakt: stempel || null, bijgewerkt: stempel || null }, ...velden };
}
function bundel(acties) {
  return { kind: "rows", domains: { acties: { rows: acties } } };
}
const zet = (acties, ik) => g.aanJouZet(bundel(acties), g.AGENTIC_TEAM_SCHEMA, { ik, nu: NU });
const namen = () => g.agentNamen(g.AGENTIC_TEAM_SCHEMA);

describe("f46 — de koppeltabel status → soort", () => {
  it("kent precies de statussen uit de registry", () => {
    const registry = g.AGENTIC_TEAM_SCHEMA.datadomeinen.acties.velden.find(v => v.naam === "Status").opties;
    expect(Object.keys(lees("SOORT_PER_STATUS")).sort()).toEqual(registry.slice().sort());
  });

  it("elke soort heeft een klantlabel", () => {
    const soorten = new Set();
    for (const status of Object.keys(lees("SOORT_PER_STATUS"))) {
      for (const eigenaar of ["", "Sanne", AGENT]) {
        for (const extra of [{}, { Type: "Alert" }, { "Wachten tot": "2026-09-28" }, { "Wachten tot": "2026-10-05" }]) {
          soorten.add(g.soortVan({ Status: status, Eigenaar: eigenaar, ...extra }, namen(), NU));
        }
      }
    }
    soorten.add(g.soortVan({ Status: "" }, namen(), NU));
    for (const s of soorten) expect(lees("SOORT_LABEL")[s], s).toBeTruthy();
  });

  it("Wacht op review op naam van een agent klopt niet; op naam van een mens is het een check", () => {
    expect(g.soortVan({ Status: "Wacht op review", Eigenaar: AGENT }, namen(), NU)).toBe("klopt-niet");
    expect(g.soortVan({ Status: "Wacht op review", Eigenaar: "Sanne" }, namen(), NU)).toBe("check");
  });
});

describe("f46 — wat hoort bij een mens", () => {
  it("f44 (a): wacht op review bij een mens of niemand", () => {
    expect(zet([rij({ Status: "Wacht op review", Eigenaar: "Sanne" })], "Sanne")).toHaveLength(1);
    expect(zet([rij({ Status: "Wacht op review", Eigenaar: "" })], "Sanne")).toHaveLength(1);
    expect(zet([rij({ Status: "Wacht op review", Eigenaar: AGENT })], "Sanne")).toHaveLength(0);
  });

  it("f44 (b): door een agent klaargezet, eigenaar een mens — ook als Status Open is", () => {
    expect(zet([rij({ Status: "Open", Eigenaar: "Sanne", "Aangemaakt door": AGENT })], "Sanne")).toHaveLength(1);
    expect(zet([rij({ Status: "Open", Eigenaar: AGENT, "Aangemaakt door": AGENT })], "Sanne")).toHaveLength(0);
  });

  it("een voorstel wacht altijd op een mens, ook als een specialist eigenaar is", () => {
    expect(zet([rij({ Status: "Voorstel", Eigenaar: AGENT })], "Sanne")).toHaveLength(1);
  });

  it("te laat op je eigen naam telt; vandaag nog niet", () => {
    expect(zet([rij({ Status: "Open", Eigenaar: "Sanne", Deadline: "2026-09-28" })], "Sanne")).toHaveLength(1);
    expect(zet([rij({ Status: "Open", Eigenaar: "Sanne", Deadline: "2026-09-29" })], "Sanne")).toHaveLength(0);
  });

  it("weer aan de beurt: de wektijd is voorbij en het ligt niet bij een agent", () => {
    const weer = rij({ Status: "Wacht", Eigenaar: "Sanne", "Wachten tot": "2026-09-28" });
    expect(zet([weer], "Sanne")).toHaveLength(1);
    expect(g.soortVan(weer, namen(), NU)).toBe("weer");
    expect(zet([rij({ Status: "Wacht", Eigenaar: "Sanne", "Wachten tot": "2026-10-05" })], "Sanne")).toHaveLength(0);
    const bijAgent = rij({ Status: "Wacht", Eigenaar: AGENT, "Wachten tot": "2026-09-28" });
    expect(zet([bijAgent], "Sanne")).toHaveLength(0);
    expect(g.soortVan(bijAgent, namen(), NU)).toBe("team");
  });

  it("Klaar hoort nergens meer bij", () => {
    expect(zet([rij({ Status: "Klaar", Eigenaar: "Sanne", "Aangemaakt door": AGENT, Deadline: "2026-09-01" })], "Sanne")).toHaveLength(0);
  });

  it("alles wat f44 nu toont (buiten een lopende Wacht) zit erin — niets valt weg", () => {
    const acties = [
      rij({ Status: "Wacht op review", Eigenaar: "Sanne" }),
      rij({ Status: "Open", Eigenaar: "Mark", "Aangemaakt door": AGENT }),
      rij({ Status: "Bezig", Eigenaar: "", "Aangemaakt door": AGENT }),
      rij({ Status: "Open", Eigenaar: AGENT }),
      rij({ Status: "Klaar", Eigenaar: "Sanne", "Aangemaakt door": AGENT }),
    ];
    const f44 = g.teamOogstRijen(bundel(acties), g.AGENTIC_TEAM_SCHEMA).map(r => r.__entryId);
    const nu = zet(acties, undefined).map(r => r.__entryId);
    for (const id of f44) expect(nu).toContain(id);
  });
});

describe("f46 — per persoon (besluit 30-09)", () => {
  const acties = () => [
    rij({ Status: "Wacht op review", Eigenaar: "Sanne Verbeek" }),
    rij({ Status: "Wacht op review", Eigenaar: "Mark de Groot" }),
    rij({ Status: "Wacht op review", Eigenaar: "" }),
  ];

  it("jouw werk plus werk voor iedereen; dat van een collega staat apart", () => {
    const lijst = acties();
    expect(zet(lijst, "Sanne Verbeek").map(r => r.Eigenaar)).toEqual(expect.arrayContaining(["Sanne Verbeek", ""]));
    expect(zet(lijst, "Sanne Verbeek")).toHaveLength(2);
    expect(g.bijCollegas(bundel(lijst), g.AGENTIC_TEAM_SCHEMA, { ik: "Sanne Verbeek" }).map(r => r.Eigenaar)).toEqual(["Mark de Groot"]);
  });

  it("de naam vergelijkt zonder hoofdletters, accenten of dubbele spaties", () => {
    expect(g.naamGelijk("  sanne  verbeek", "Sanne Verbeek")).toBe(true);
    expect(g.naamGelijk("Renée", "renee")).toBe(true);
    expect(g.naamGelijk("Sanne", "Sanne Verbeek")).toBe(false);
  });

  it("weet het dashboard niet wie je bent, dan verstopt het niets", () => {
    expect(zet(acties(), undefined)).toHaveLength(3);
    expect(g.bijCollegas(bundel(acties()), g.AGENTIC_TEAM_SCHEMA, {})).toEqual([]);
  });
});

describe("f46 — volgorde", () => {
  it("te laat eerst, dan vandaag/morgen, dan Hoog, dan de rest (oudste boven)", () => {
    const rest = rij({ Status: "Wacht op review", Eigenaar: "Sanne", Actie: "rest" }, "2026-09-20T09:00:00Z");
    const hoog = rij({ Status: "Wacht op review", Eigenaar: "Sanne", Prioriteit: "Hoog", Actie: "hoog" }, "2026-09-27T09:00:00Z");
    const morgen = rij({ Status: "Wacht op review", Eigenaar: "Sanne", Deadline: "2026-09-30", Actie: "morgen" });
    const laat = rij({ Status: "Open", Eigenaar: "Sanne", Deadline: "2026-09-25", Actie: "laat" });
    expect(zet([rest, hoog, morgen, laat], "Sanne").map(r => r.Actie)).toEqual(["laat", "morgen", "hoog", "rest"]);
  });

  it("bij meer dan tien — een stille berg — gaat het oudste voor", () => {
    const lijst = [];
    for (let i = 0; i < 12; i++) {
      lijst.push(rij({ Status: "Wacht op review", Eigenaar: "Sanne", Actie: "n" + i, Prioriteit: i === 0 ? "Hoog" : "Normaal" },
        `2026-09-${String(28 - i).padStart(2, "0")}T02:00:00Z`));
    }
    const uit = zet(lijst, "Sanne").map(r => r.Actie);
    expect(uit[0]).toBe("n11"); // 17 september, de oudste
    expect(uit[uit.length - 1]).toBe("n0");
  });
});

describe("f46 — randgevallen", () => {
  it("zonder acties of zonder agentlijst: null, nooit gokken", () => {
    expect(g.aanJouZet({ kind: "rows", domains: {} }, g.AGENTIC_TEAM_SCHEMA, { nu: NU })).toBeNull();
    expect(g.aanJouZet(bundel([rij({ Status: "Voorstel" })]), { agents: [] }, { nu: NU })).toBeNull();
  });

  it("de stempels uit de instantie reizen mee, zonder een schemaveld te overschaduwen", () => {
    const r = g.rijVanEntry({ entryId: "x", data: { Onderwerp: "a" }, aangemaakt: "2026-09-01T08:00:00Z", bijgewerkt: "2026-09-02T08:00:00Z" });
    expect(r.__stempels).toEqual({ aangemaakt: "2026-09-01T08:00:00Z", bijgewerkt: "2026-09-02T08:00:00Z" });
    expect(g.getField(r, "Bijgewerkt")).toBeUndefined();
    expect(g.getField(r, "Aangemaakt")).toBeUndefined();
  });
});
