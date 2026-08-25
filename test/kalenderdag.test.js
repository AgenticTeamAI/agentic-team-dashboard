// @vitest-environment jsdom
/* b37 (AT-032 + AT-033): kalenderdag-semantiek en één breedte-noemer.
 * Laadt de echte src-modules in build-volgorde (zelfde patroon als
 * correctievrij.test.js). Alle verwachtingen zijn tijdzone-onafhankelijk:
 * `today` wordt met de lokale Date-constructor gebouwd (new Date(j, m, d, u)),
 * dus "18:00 lokale tijd" is in UTC-CI net zo goed 18:00 lokaal als in
 * Europe/Amsterdam. Er wordt bewust géén process.env.TZ gezet — vitest kan
 * dat niet na de start van het proces. */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [
  "schema/schema.generated.js",
  "src/schema-helpers.js",
  "src/zones.js",
  "src/metrics-sanitize.js",
  "src/metrics.js",
];

let g;
beforeAll(() => {
  for (const rel of MODULES) {
    vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  }
  g = globalThis;
});

// Lokale tijd: 24 augustus 2026, 18:00 (de situatie uit de bugmelding).
const VANDAAG_18U = new Date(2026, 7, 24, 18, 0, 0);

function bundelMetActies(rijen) {
  return { source: "json", sourceLabel: "test", domains: { acties: { rows: rijen, staleAt: VANDAAG_18U } }, waarschuwingen: [] };
}

describe("kalenderDag / daysBetween — hele kalenderdagen", () => {
  it("date-only string is die kalenderdag, ongeacht tijdzone", () => {
    expect(g.kalenderDag("2026-08-24")).toBe(g.kalenderDag(new Date(2026, 7, 24, 0, 0)));
    expect(g.kalenderDag("2026-08-24")).toBe(g.kalenderDag(new Date(2026, 7, 24, 23, 59)));
    expect(g.kalenderDag("1970-01-01")).toBe(0);
  });

  it("vandaag om 18:00 lokaal vs date-only vandaag = 0 dagen (de bug)", () => {
    expect(g.daysBetween(VANDAAG_18U, "2026-08-24")).toBe(0);
    expect(g.daysBetween(VANDAAG_18U, "2026-08-23")).toBe(1);
    expect(g.daysBetween(VANDAAG_18U, "2026-08-25")).toBe(-1);
  });

  it("geeft gehele getallen, ook rond een uur verschil over middernacht", () => {
    expect(g.daysBetween(new Date(2026, 7, 25, 0, 30), new Date(2026, 7, 24, 23, 30))).toBe(1);
    expect(g.daysBetween(new Date(2026, 7, 24, 23, 59), new Date(2026, 7, 24, 0, 0))).toBe(0);
  });

  it("DST-randen (29 maart, 25 oktober): 23- en 25-uursdagen tellen als 1 dag", () => {
    // zomertijd in: nacht 28->29 maart 2026
    expect(g.daysBetween(new Date(2026, 2, 29, 0, 30), new Date(2026, 2, 28, 0, 30))).toBe(1);
    expect(g.daysBetween(new Date(2026, 2, 29, 12, 0), "2026-03-28")).toBe(1);
    expect(g.daysBetween(new Date(2026, 2, 29, 23, 30), "2026-03-29")).toBe(0);
    expect(g.daysBetween(new Date(2026, 2, 30, 0, 30), new Date(2026, 2, 28, 23, 30))).toBe(2);
    // wintertijd in: nacht 24->25 oktober 2026
    expect(g.daysBetween(new Date(2026, 9, 25, 0, 30), new Date(2026, 9, 24, 0, 30))).toBe(1);
    expect(g.daysBetween(new Date(2026, 9, 25, 23, 30), "2026-10-25")).toBe(0);
    expect(g.daysBetween(new Date(2026, 9, 26, 0, 30), "2026-10-24")).toBe(2);
    // een reeks van 7 dagen over de overgang heen is exact 7
    expect(g.daysBetween(new Date(2026, 9, 28, 9, 0), new Date(2026, 9, 21, 9, 0))).toBe(7);
    expect(g.daysBetween(new Date(2026, 3, 1, 9, 0), new Date(2026, 2, 25, 9, 0))).toBe(7);
  });

  it("NaN / null bij ontbrekende of onleesbare waarden", () => {
    expect(g.kalenderDag(null)).toBeNull();
    expect(g.kalenderDag("")).toBeNull();
    expect(g.kalenderDag("geen datum")).toBeNull();
    expect(g.daysBetween(VANDAAG_18U, null)).toBeNaN();
  });

  it("parseDateField leest date-only als lokale middernacht (fmt en kalenderDag stemmen overeen)", () => {
    const d = g.parseDateField("2026-08-24");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(24);
    expect(d.getHours()).toBe(0);
    expect(g.kalenderDag(d)).toBe(g.kalenderDag("2026-08-24"));
    expect(g.parseDateField("2026-08-24T15:30:00Z")).toBeInstanceOf(Date);
    expect(g.parseDateField("")).toBeNull();
  });

  it("dagVanIndex is de inverse van kalenderDag", () => {
    const idx = g.kalenderDag("2026-10-25");
    const d = g.dagVanIndex(idx);
    expect(g.kalenderDag(d)).toBe(idx);
    expect([d.getDate(), d.getMonth() + 1]).toEqual([25, 10]);
  });
});

describe("deadline-checks op kalenderdag (zone 1 + opvolging)", () => {
  const rijen = [
    { Actie: "vandaag", Status: "Open", Deadline: "2026-08-24" },
    { Actie: "gisteren", Status: "Open", Deadline: "2026-08-23" },
    { Actie: "morgen", Status: "Open", Deadline: "2026-08-25" },
    { Actie: "gisteren klaar", Status: "Klaar", Deadline: "2026-08-23" },
  ];

  it("om 18:00 lokaal is een deadline van vandaag NIET over de deadline; gisteren wél", () => {
    const items = g.computeZone1(bundelMetActies(rijen), {}, VANDAAG_18U);
    const dl = items.find(it => it.type === "acties-deadline");
    expect(dl).toBeDefined();
    expect(dl.rows.map(r => r.Actie)).toEqual(["gisteren"]);
  });

  it("opvolging telt alleen verstreken deadlines (gisteren), niet vandaag", () => {
    const o = g.computeOpvolging(bundelMetActies(rijen), VANDAAG_18U);
    expect(o.berekenbaar).toBe(true);
    expect(o.verstreken).toBe(2); // gisteren open + gisteren klaar
    expect(o.klaar).toBe(1);
    expect(o.waarde).toBe(50);
  });

  it("vlak na middernacht is vandaag ook nog niet verlopen", () => {
    const o = g.computeOpvolging(bundelMetActies(rijen), new Date(2026, 7, 24, 0, 5));
    expect(o.verstreken).toBe(2);
  });
});

describe("isStale en contextgezondheid op hele dagen", () => {
  it("precies 30 dagen oud is nog niet verouderd, 31 wel — ongeacht het uur", () => {
    expect(g.isStale("2026-07-25", new Date(2026, 7, 24, 23, 30))).toBe(false); // 30 dagen
    expect(g.isStale("2026-07-24", new Date(2026, 7, 24, 0, 30))).toBe(true);   // 31 dagen
    expect(g.isStale(new Date(2026, 6, 25, 2, 0), new Date(2026, 7, 24, 23, 30))).toBe(false);
  });

  it("zone 2: 90 dagen oud is groen, 91 oranje; kopie op dezelfde dag als bron is niet ouder", () => {
    const ctx = (laatst, kopie) => ({ bedrijfscontext: { Bron: "Notion", staleAt: g.parseDateField(laatst), Projectkennis_kopie_laatst_bijgewerkt: kopie } });
    expect(g.computeZone2(ctx("2026-05-26", "2026-05-26"), new Date(2026, 7, 24, 22, 0)).signaal).toBe("groen");
    expect(g.computeZone2(ctx("2026-05-25", "2026-05-25"), new Date(2026, 7, 24, 1, 0)).signaal).toBe("oranje");
    expect(g.computeZone2(ctx("2026-08-20", "2026-08-19"), VANDAAG_18U).signaal).toBe("oranje");
  });
});

describe("weekbuckets op kalenderdag", () => {
  it("een spoor van vandaag (date-only) telt mee in de laatste week, ook 's avonds", () => {
    // periode = 4 weken vanaf 27 juli; buckets zijn 7-daagse vensters vanaf die dag,
    // de laatste bucket (17-23 aug) krijgt ook vandaag zelf (24 aug) erbij.
    const bundle = { domains: { dagverslagen: { rows: [{ Dag: "2026-08-24" }, { Dag: "2026-08-25" }, { Dag: "2026-08-17" }, { Dag: "2026-08-16" }], staleAt: VANDAAG_18U } } };
    const a = g.computeActiviteitPerWeek(bundle, new Date(2026, 7, 24, 23, 30), 4);
    expect(a.buckets[3].values.dagverslagen).toBe(2); // vandaag + 17 aug; morgen telt niet (toekomst)
    expect(a.buckets[2].values.dagverslagen).toBe(1); // 16 aug = dag 20 van de periode -> bucket 2
    expect(a.buckets[0].weekStart.getDate()).toBe(27); // 27 juli, 28 dagen terug
    expect(a.buckets[0].label).toMatch(/^27/);
  });

  it("correctievrij-weken: weekStart valt op maandag en label toont de lokale dag", () => {
    const bundle = bundelMetActies([{ Actie: "x", Status: "Klaar", "Afgerond door": "Jurist", "Afgerond op": "2026-08-24" }]);
    const c = g.computeCorrectievrij(bundle, new Date(2026, 7, 24, 23, 45));
    const laatste = c.weken[c.weken.length - 1];
    expect(laatste.label).toBe("24-08");
    expect(laatste.weekStart.getDay()).toBe(1);
    expect(laatste.autonoom).toBe(1);
    expect(c.autonoom).toBe(1);
  });
});

describe("meetbareDomeinen — één breedte-noemer voor beide routes (AT-033)", () => {
  it("sluit bedrijfscontext uit en staat in het schema", () => {
    expect(Object.keys(g.AGENTIC_TEAM_SCHEMA.datadomeinen)).toContain("bedrijfscontext");
    const m = g.meetbareDomeinen(g.AGENTIC_TEAM_SCHEMA);
    expect(m).not.toContain("bedrijfscontext");
    expect(m.length).toBe(Object.keys(g.AGENTIC_TEAM_SCHEMA.datadomeinen).length - 1);
  });

  it("rij-route en metrics-route geven op dezelfde fixture dezelfde noemer en teller", () => {
    const schema = g.AGENTIC_TEAM_SCHEMA;
    const rijRoute = {
      source: "json", sourceLabel: "test", waarschuwingen: [],
      bedrijfscontext: { Bron: "Notion", staleAt: VANDAAG_18U },
      domains: {
        acties: { rows: [{ Actie: "a", Status: "Open", Deadline: "2026-08-20" }], staleAt: VANDAAG_18U },
        lessen_inzichten: { rows: [{ Les: "l", Datum: "2026-08-20" }], staleAt: VANDAAG_18U },
        organisaties: { rows: [], staleAt: VANDAAG_18U },
      },
    };
    const metricsRaw = {
      versie: 1, type: "dashboard_metrics",
      domeinen: {
        acties: { rijen: 1, laatst_bijgewerkt: "2026-08-24" },
        lessen_inzichten: { rijen: 1, laatst_bijgewerkt: "2026-08-24" },
        organisaties: { rijen: 0, laatst_bijgewerkt: "2026-08-24" },
        bedrijfscontext: { rijen: 7, laatst_bijgewerkt: "2026-08-24" }, // mag de score niet beïnvloeden
      },
    };
    const breedteRij = g.computeBreedte(rijRoute, schema);
    const res = g.parseNotionMetricsFile(metricsRaw, schema, VANDAAG_18U, 25);
    expect(res.ok).toBe(true);
    const breedteMetrics = res.metrics.adopt.componenten.find(c => c.key === "breedte");

    expect(breedteMetrics.totaalDomeinen).toBe(breedteRij.totaalDomeinen);
    expect(breedteMetrics.totaalDomeinen).toBe(g.meetbareDomeinen(schema).length);
    expect(breedteMetrics.metInhoud).toBe(2);
    expect(breedteRij.metInhoud).toBe(2);
    expect(breedteMetrics.waarde).toBe(breedteRij.waarde);
    expect(breedteMetrics.domeinenLijst.sort()).toEqual(breedteRij.domeinenLijst.sort());
  });
});
