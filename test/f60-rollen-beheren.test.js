// @vitest-environment jsdom
/* f60 — rollen per teamlid zien en wijzigen in Beheer → "Wie werkt er mee".
 *
 * Wat hier vastligt, en waarom:
 *  - zonder rollenregister (404, 403, 503, een daglink, een oude instantie) is
 *    het paneel byte-gelijk aan vóór f60: geen kolom, geen regel, geen knop;
 *  - de rollen komen uit de eigen instantie (GET /dashboard/rollen) via
 *    schrijfWerkruimte, nooit via de site en nooit via een nieuwe fetch-plek;
 *  - wijzigen is voorstel → bevestig: de eerste klik verstuurt niets, pas
 *    Bevestigen stuurt één PUT met precies {seat, rol};
 *  - het aankoopadres heeft altijd "Eigenaar" en geen knop, jijzelf ook niet;
 *    een beheerder krijgt geen knop bij een andere beheerder en kan niemand
 *    beheerder maken (spiegel van §2b toets 3–6; de instantie toetst zelf);
 *  - een weigering van de instantie komt letterlijk in beeld en laat de rol staan;
 *  - één wijziging tegelijk; wisselt de sessie naar een daglink, dan gaat het
 *    paneel dicht;
 *  - geen tekst belooft afscherming (epicregel: vóór s61 staat dat woord nergens). */
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = ["src/teksten.js", "src/schema-helpers.js", "src/render.js", "src/team-beheer.js"];

let g;
beforeAll(() => {
  for (const rel of MODULES) vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  g = globalThis;
});

const S = (c) => c.repeat(64);
const EIG = S("a");
const JAN = S("b");
const PIET = S("c");
const BEH2 = S("d");
const ROEL = S("e");

const EIGENAAR = { seat: EIG, adres: "tijmen@voorbeeld.nl", naam: "Tijmen", uitgenodigdOp: "2026-09-01T00:00:00.000Z", aanvaardOp: "2026-09-02T00:00:00.000Z", eigenaar: true };
const JANINE = { seat: JAN, adres: "janine@klant.nl", naam: "janine", uitgenodigdOp: "2026-09-03T00:00:00.000Z", aanvaardOp: "2026-09-04T00:00:00.000Z", eigenaar: false };
const PIETR = { seat: PIET, adres: "piet@klant.nl", naam: "piet", uitgenodigdOp: "2026-09-15T00:00:00.000Z", eigenaar: false };
const BEHEER2 = { seat: BEH2, adres: "bea@klant.nl", naam: "bea", uitgenodigdOp: "2026-09-15T00:00:00.000Z", aanvaardOp: "2026-09-16T00:00:00.000Z", eigenaar: false };
const TEAM = [EIGENAAR, JANINE, PIETR, BEHEER2];

const BRON = { oauth: true, token: "jwt", instantieUrl: "https://connector.voorbeeld" };

function rollenAntwoord(jij, rollen = []) {
  return { jij, eigenaar: EIG, standaard: "medewerker", toewijsbaar: ["beheerder", "medewerker", "viewer"], rollen };
}
const ALS_EIGENAAR = rollenAntwoord({ seat: EIG, rol: "eigenaar" }, [
  { seat: PIET, rol: "viewer", gezetOp: "2026-11-25T00:00:00.000Z", gezetDoor: EIG },
  { seat: BEH2, rol: "beheerder", gezetOp: "2026-11-25T00:00:00.000Z", gezetDoor: EIG },
]);

const tick = () => new Promise((r) => setTimeout(r, 0));

function sectie() {
  document.body.innerHTML = `<section id="p" style="display:none;"><div id="panel-team-namen-body"></div></section>`;
  return document.getElementById("p");
}

/* Het paneel zoals app.js het opbouwt: eerst het team van de site, dan de
 * rollen van de instantie. `rollen` is het antwoord van GET /dashboard/rollen,
 * of een Error (404/403/503 van de instantie). */
async function paneel({ team = TEAM, rollen } = {}) {
  g.huidigeBron = { ...BRON };
  g.modulesFetch = vi.fn(async () => ({ status: 200, body: { team } }));
  g.schrijfWerkruimte = vi.fn(async () => {
    if (rollen instanceof Error) throw rollen;
    return rollen;
  });
  const el = sectie();
  await g.laadTeam(g.huidigeBron);
  if (rollen !== undefined) await g.laadRollen(g.huidigeBron);
  g.renderTeamPanel(el);
  g.modulesFetch = vi.fn();
  g.schrijfWerkruimte = vi.fn();
  return el;
}

const rijVan = (el, seat) => el.querySelector(`[data-team-seat="${seat}"]`).closest("tr");
const rolTekst = (el, seat) => rijVan(el, seat).querySelector(".team-rol").textContent.replace(/\s+/g, " ").trim();

beforeEach(() => {
  g._resetTeam();
  delete g.schrijfWerkruimte;
});

describe("zonder rollenregister: byte-gelijk aan vóór f60", () => {
  it("een 404, 403 of 503 van de instantie verandert niets aan het paneel", async () => {
    const voor = (await paneel()).innerHTML;
    for (const status of [404, 403, 503]) {
      g._resetTeam();
      const fout = Object.assign(new Error("x"), { status });
      const na = (await paneel({ rollen: fout })).innerHTML;
      expect(na).toBe(voor);
    }
    expect(voor).not.toContain("Rol");
    expect(voor).not.toContain("data-team-jouw-rol");
  });

  it("een antwoord dat geen rollenantwoord is, telt als geen register", async () => {
    const voor = (await paneel()).innerHTML;
    for (const raar of [null, {}, { jij: { seat: "kort", rol: "eigenaar" } }, { jij: { seat: EIG, rol: "koning" } }, { jij: { seat: EIG, rol: "constructor" } }, { jij: { seat: EIG, rol: "__proto__" } }, "tekst"]) {
      g._resetTeam();
      expect((await paneel({ rollen: raar })).innerHTML).toBe(voor);
    }
  });

  it("een daglinksessie vraagt de rollen niet eens op", async () => {
    g.schrijfWerkruimte = vi.fn(async () => ALS_EIGENAAR);
    expect(await g.laadRollen({ token: "daglink", instantieUrl: "https://x" })).toBeNull();
    expect(await g.laadRollen(null)).toBeNull();
    expect(g.schrijfWerkruimte).not.toHaveBeenCalled();
  });

  it("zonder schrijfWerkruimte (oude bundel) gebeurt er niets", async () => {
    expect(await g.laadRollen(BRON)).toBeNull();
  });
});

describe("de rollen lezen", () => {
  it("leest GET /dashboard/rollen op de instantie, één keer per token", async () => {
    g.schrijfWerkruimte = vi.fn(async () => ALS_EIGENAAR);
    await g.laadRollen(BRON);
    await g.laadRollen(BRON);
    expect(g.schrijfWerkruimte).toHaveBeenCalledTimes(1);
    expect(g.schrijfWerkruimte).toHaveBeenCalledWith(BRON, "GET", "/dashboard/rollen");
  });

  it("de eigenaar ziet een kolom Rol met per teamlid de rol", async () => {
    const el = await paneel({ rollen: ALS_EIGENAAR });
    const koppen = Array.from(el.querySelectorAll("thead th")).map((t) => t.textContent);
    expect(koppen).toEqual(["Naam", "E-mailadres", "Status", "Rol", "Toegang"]);
    expect(rolTekst(el, EIG)).toBe("Eigenaar");
    expect(rijVan(el, EIG).querySelector(".team-rol button")).toBeNull();
    // Zonder rij: de standaardrol van de instantie.
    expect(rolTekst(el, JAN)).toBe("Medewerker Wijzigen");
    expect(rolTekst(el, PIET)).toBe("Viewer Wijzigen");
    expect(rolTekst(el, BEH2)).toBe("Beheerder Wijzigen");
    expect(el.querySelector("[data-team-jouw-rol]").textContent).toBe("Je rol: Eigenaar.");
  });

  it("filtert rijen met een onbekende rol, een eigenaarrij of een seat die geen seat is", async () => {
    const el = await paneel({
      rollen: rollenAntwoord({ seat: EIG, rol: "eigenaar" }, [
        { seat: JAN, rol: "koning" },
        { seat: PIET, rol: "eigenaar" },
        { seat: "<img src=x>", rol: "viewer" },
      ]),
    });
    expect(rolTekst(el, JAN)).toBe("Medewerker Wijzigen");
    expect(rolTekst(el, PIET)).toBe("Medewerker Wijzigen");
    expect(el.innerHTML).not.toContain("<img");
    expect(el.innerHTML).not.toContain("koning");
  });

  it("een medewerker krijgt alleen zijn eigen rol te zien, geen kolom", async () => {
    const el = await paneel({ rollen: { jij: { seat: JAN, rol: "medewerker" } } });
    expect(el.querySelector(".team-rol")).toBeNull();
    expect(el.querySelector("[data-team-jouw-rol]").textContent).toBe("Je rol: Medewerker.");
  });
});

describe("wie welke knop krijgt (spiegel van §2b)", () => {
  it("geen knop bij jezelf en bij het aankoopadres, ook als dat niet als eigenaar op de lijst staat", async () => {
    const zonderVlag = { ...EIGENAAR, eigenaar: false };
    const el = await paneel({ team: [zonderVlag, JANINE], rollen: ALS_EIGENAAR });
    expect(rolTekst(el, EIG)).toBe("Eigenaar");
    expect(g.rolKeuzesVoor(EIG)).toEqual([]);
  });

  it("een beheerder: geen knop bij een andere beheerder, nooit de keuze beheerder, jezelf (jij) zonder knop", async () => {
    const el = await paneel({
      team: [EIGENAAR, JANINE, BEHEER2, { ...PIETR, aanvaardOp: "x" }],
      rollen: rollenAntwoord({ seat: PIET, rol: "beheerder" }, [
        { seat: PIET, rol: "beheerder" },
        { seat: BEH2, rol: "beheerder" },
      ]),
    });
    expect(rolTekst(el, BEH2)).toBe("Beheerder");
    expect(rolTekst(el, PIET)).toBe("Beheerder (jij)");
    expect(rolTekst(el, EIG)).toBe("Eigenaar");
    expect(g.rolKeuzesVoor(JAN)).toEqual(["viewer"]);
  });

  it("de keuzes bevatten nooit de huidige rol en nooit eigenaar", async () => {
    await paneel({ rollen: ALS_EIGENAAR });
    expect(g.rolKeuzesVoor(JAN)).toEqual(["beheerder", "viewer"]);
    expect(g.rolKeuzesVoor(PIET)).toEqual(["beheerder", "medewerker"]);
    expect(g.rolKeuzesVoor(BEH2)).toEqual(["medewerker", "viewer"]);
    expect(g.rolKeuzesVoor("geen-seat")).toEqual([]);
  });
});

describe("voorstel → bevestig", () => {
  it("Wijzigen verstuurt niets; Bevestigen stuurt één PUT met precies {seat, rol}", async () => {
    const el = await paneel({ rollen: ALS_EIGENAAR });
    el.querySelector(`[data-rol-wijzig="${JAN}"]`).click();
    expect(g.schrijfWerkruimte).not.toHaveBeenCalled();
    const keuze = el.querySelector(`[data-rol-keuze="${JAN}"]`);
    expect(Array.from(keuze.options).map((o) => o.value)).toEqual(["beheerder", "viewer"]);
    expect(document.activeElement).toBe(keuze);
    keuze.value = "viewer";

    g.schrijfWerkruimte = vi.fn(async () => ({ seat: JAN, rol: "viewer" }));
    el.querySelector(`[data-rol-bevestig="${JAN}"]`).click();
    await tick();
    expect(g.schrijfWerkruimte).toHaveBeenCalledTimes(1);
    const [bron, methode, pad, body] = g.schrijfWerkruimte.mock.calls[0];
    expect(bron.token).toBe("jwt");
    expect([methode, pad]).toEqual(["PUT", "/dashboard/rollen"]);
    expect(body).toEqual({ seat: JAN, rol: "viewer" });
    expect(rolTekst(el, JAN)).toBe("Viewer Wijzigen");
    expect(el.querySelector("[data-team-melding]").textContent).toBe("janine@klant.nl heeft nu de rol Viewer.");
    expect(document.activeElement).toBe(el.querySelector(`[data-rol-wijzig="${JAN}"]`));
  });

  it("Annuleren sluit het voorstel zonder iets te versturen", async () => {
    const el = await paneel({ rollen: ALS_EIGENAAR });
    el.querySelector(`[data-rol-wijzig="${JAN}"]`).click();
    el.querySelector(`[data-rol-annuleer="${JAN}"]`).click();
    expect(el.querySelector(`[data-rol-keuze="${JAN}"]`)).toBeNull();
    expect(g.schrijfWerkruimte).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(el.querySelector(`[data-rol-wijzig="${JAN}"]`));
  });

  it("een keuze die niet in de lijst stond (gemanipuleerde select), gaat niet de deur uit", async () => {
    const el = await paneel({ rollen: ALS_EIGENAAR });
    el.querySelector(`[data-rol-wijzig="${JAN}"]`).click();
    const keuze = el.querySelector(`[data-rol-keuze="${JAN}"]`);
    const optie = document.createElement("option");
    optie.value = "eigenaar";
    keuze.append(optie);
    keuze.value = "eigenaar";
    el.querySelector(`[data-rol-bevestig="${JAN}"]`).click();
    await tick();
    expect(g.schrijfWerkruimte).not.toHaveBeenCalled();
  });

  it("een weigering van de instantie komt letterlijk in beeld; de rol blijft staan", async () => {
    const el = await paneel({ rollen: ALS_EIGENAAR });
    el.querySelector(`[data-rol-wijzig="${JAN}"]`).click();
    g.schrijfWerkruimte = vi.fn(async () => {
      throw Object.assign(new Error("Alleen de eigenaar geeft of neemt de rol beheerder."), { status: 403 });
    });
    el.querySelector(`[data-rol-bevestig="${JAN}"]`).click();
    await tick();
    expect(el.querySelector("[data-team-fout]").textContent).toBe("Alleen de eigenaar geeft of neemt de rol beheerder.");
    expect(g.rolVanSeat(JAN)).toBe("medewerker");
    // Het voorstel blijft open, met de focus op de veilige keuze.
    expect(document.activeElement).toBe(el.querySelector(`[data-rol-annuleer="${JAN}"]`));
  });

  it("een antwoord voor een andere seat telt niet als gelukt", async () => {
    const el = await paneel({ rollen: ALS_EIGENAAR });
    el.querySelector(`[data-rol-wijzig="${JAN}"]`).click();
    g.schrijfWerkruimte = vi.fn(async () => ({ seat: PIET, rol: "beheerder" }));
    el.querySelector(`[data-rol-bevestig="${JAN}"]`).click();
    await tick();
    expect(g.rolVanSeat(JAN)).toBe("medewerker");
    expect(g.rolVanSeat(PIET)).toBe("viewer");
    expect(el.querySelector("[data-team-fout]").textContent).toContain("niet gewijzigd");
  });

  it("één wijziging tegelijk: tijdens de aanvraag staan de knoppen uit en doet een tweede klik niets", async () => {
    const el = await paneel({ rollen: ALS_EIGENAAR });
    el.querySelector(`[data-rol-wijzig="${JAN}"]`).click();
    let los;
    g.schrijfWerkruimte = vi.fn(() => new Promise((r) => { los = r; }));
    el.querySelector(`[data-rol-bevestig="${JAN}"]`).click();
    expect(el.querySelector(`[data-rol-bevestig="${JAN}"]`).disabled).toBe(true);
    expect(el.querySelector(`[data-rol-wijzig="${PIET}"]`).disabled).toBe(true);
    expect(el.querySelector(`[data-team-verwijder="${PIET}"]`).disabled).toBe(true);
    el.querySelector(`[data-rol-bevestig="${JAN}"]`).click();
    await g.wijzigRol(el, JAN, "viewer");
    expect(g.schrijfWerkruimte).toHaveBeenCalledTimes(1);
    los({ seat: JAN, rol: "beheerder" });
    await tick();
    expect(rolTekst(el, JAN)).toBe("Beheerder Wijzigen");
  });

  it("wisselt de sessie tijdens de aanvraag naar een daglink, dan gaat het paneel dicht", async () => {
    const el = await paneel({ rollen: ALS_EIGENAAR });
    el.querySelector(`[data-rol-wijzig="${JAN}"]`).click();
    g.schrijfWerkruimte = vi.fn(async () => {
      g.huidigeBron = { token: "daglink" };
      return { seat: JAN, rol: "viewer" };
    });
    el.querySelector(`[data-rol-bevestig="${JAN}"]`).click();
    await tick();
    expect(el.style.display).toBe("none");
    expect(g.rolVanSeat(JAN)).toBeNull();
  });

  it("zonder ingelogde sessie gaat er geen PUT weg", async () => {
    const el = await paneel({ rollen: ALS_EIGENAAR });
    g.huidigeBron = { token: "daglink" };
    await g.wijzigRol(el, JAN, "viewer");
    expect(g.schrijfWerkruimte).not.toHaveBeenCalled();
  });

  it("de seat gaat niet in een selector: een rare seat breekt het paneel niet", async () => {
    const el = await paneel({ rollen: ALS_EIGENAAR });
    expect(() => el.querySelector(`[data-rol-wijzig="${JAN}"]`).click()).not.toThrow();
  });
});

describe("tekst", () => {
  it("belooft nergens afscherming en noemt geen seat", async () => {
    const el = await paneel({ rollen: ALS_EIGENAAR });
    el.querySelector(`[data-rol-wijzig="${JAN}"]`).click();
    expect(el.textContent.toLowerCase()).not.toMatch(/afscherm|afgeschermd/);
    expect(el.textContent).not.toContain(JAN);
    const bron = readFileSync(join(ROOT, "src/team-beheer.js"), "utf8");
    const zichtbaar = (bron.match(/`[^`]*`|"[^"]*"/g) || []).join(" ").toLowerCase();
    expect(zichtbaar).not.toMatch(/afscherm/);
  });
});
