// @vitest-environment jsdom
/* i77 — teamleden uitnodigen en verwijderen vanuit het beheerderspaneel.
 *
 * Wat hier vastligt, en waarom:
 *  - uitnodigen en verwijderen gaan uitsluitend via modulesFetch (de
 *    telemetrie-guard telt benoemde fetches) en sturen alleen een adres of seat;
 *  - verwijderen is onomkeerbaar voor wie eruit gaat — dus eerst een zichtbare
 *    bevestiging, en pas daarna een POST;
 *  - de eigenaar (het aankoopadres) krijgt geen verwijderknop;
 *  - de listeners hangen aan de vaste <section>, dus een hertekening mag er geen
 *    extra bij zetten — anders stuurt één klik er meerdere POSTs uit;
 *  - een site van vóór deze routes (rijen zonder `eigenaar`) houdt het oude
 *    namenpaneel, in plaats van knoppen die op een 404 stuklopen. */
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

const EIGENAAR = { seat: "seat-a", adres: "tijmen@voorbeeld.nl", naam: "Tijmen", uitgenodigdOp: "2026-09-01T00:00:00.000Z", aanvaardOp: "2026-09-02T00:00:00.000Z", eigenaar: true };
const JANINE = { seat: "seat-b", adres: "janine@klant.nl", naam: "janine", uitgenodigdOp: "2026-09-03T00:00:00.000Z", eigenaar: false };
const PIET = { seat: "seat-c", adres: "piet@klant.nl", naam: "piet", uitgenodigdOp: "2026-09-15T00:00:00.000Z", eigenaar: false };
const TEAM = [EIGENAAR, JANINE];

const tick = () => new Promise((r) => setTimeout(r, 0));

function sectie() {
  document.body.innerHTML = `<section id="p" style="display:none;"><div id="panel-team-namen-body"></div></section>`;
  return document.getElementById("p");
}

async function paneelMet(team) {
  g.modulesFetch = vi.fn(async () => ({ status: 200, body: { team } }));
  const el = sectie();
  await g.laadTeam({ oauth: true, token: "jwt" });
  g.renderTeamPanel(el);
  g.modulesFetch = vi.fn();
  return el;
}

beforeEach(() => {
  g._resetTeam();
});

describe("het beheerpaneel", () => {
  it("toont bovenaan een toegankelijk uitnodigformulier", async () => {
    const el = await paneelMet(TEAM);
    const form = el.querySelector("[data-team-uitnodigen]");
    expect(form).toBeTruthy();
    const veld = form.querySelector("[data-team-uitnodig-adres]");
    expect(veld.type).toBe("email");
    expect(form.querySelector(`label[for="${veld.id}"]`).textContent).toContain("uitnodigen");
    expect(form.querySelector('button[type="submit"]').textContent).toBe("Uitnodigen");
    // Formulier vóór de lijst.
    const body = el.querySelector("#panel-team-namen-body");
    expect(body.firstElementChild).toBe(form);
    expect(el.querySelector("[data-team-melding]").getAttribute("aria-live")).toBe("polite");
    expect(el.querySelector("[data-team-fout]").getAttribute("role")).toBe("alert");
  });

  it("geeft de eigenaar geen verwijderknop, de anderen wel", async () => {
    const el = await paneelMet(TEAM);
    expect(el.querySelector('[data-team-verwijder="seat-a"]')).toBeNull();
    expect(el.querySelector('[data-team-verwijder="seat-b"]')).toBeTruthy();
    const eigenaarRij = el.querySelector('[data-team-seat="seat-a"]').closest("tr");
    expect(eigenaarRij.textContent).toContain("eigenaar");
    expect(eigenaarRij.querySelector("button")).toBeNull();
  });

  it("verschijnt ook met een lege lijst — dan wil je juist iemand uitnodigen", async () => {
    const el = await paneelMet([]);
    expect(el.style.display).toBe("");
    expect(el.querySelector("[data-team-uitnodigen]")).toBeTruthy();
    expect(el.textContent).toContain("nog niemand");
  });

  it("houdt bij een site zonder `eigenaar` het oude namenpaneel — geen knoppen die op een 404 stuklopen", async () => {
    const el = await paneelMet(TEAM.map(({ eigenaar, ...r }) => r));
    expect(el.style.display).toBe("");
    expect(el.querySelectorAll("[data-team-seat]")).toHaveLength(2);
    expect(el.querySelector("[data-team-uitnodigen]")).toBeNull();
    expect(el.querySelector("[data-team-verwijder]")).toBeNull();
  });

  it("escapet adressen ook in de bevestiging", async () => {
    const vijand = { ...JANINE, adres: '"><img src=x onerror=window.__xss=1>' };
    const el = await paneelMet([EIGENAAR, vijand]);
    el.querySelector('[data-team-verwijder="seat-b"]').click();
    expect(el.querySelector("img")).toBeNull();
    expect(window.__xss).toBeUndefined();
    expect(el.querySelector(".team-bevestig").textContent).toContain("<img");
  });
});

describe("uitnodigen", () => {
  it("stuurt het adres via modulesFetch en ververst de lijst", async () => {
    const el = await paneelMet(TEAM);
    g.modulesFetch = vi.fn(async () => ({
      status: 200,
      body: { team: [...TEAM, PIET], uitgenodigd: { nieuw: true, mailVerstuurd: true } },
    }));
    const veld = el.querySelector("[data-team-uitnodig-adres]");
    veld.value = "  piet@klant.nl ";
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();

    expect(g.modulesFetch).toHaveBeenCalledTimes(1);
    expect(g.modulesFetch.mock.calls[0][0]).toBe("/api/dashboard/team/uitnodigen");
    expect(g.modulesFetch.mock.calls[0][1]).toEqual({ adres: "piet@klant.nl" });
    expect(el.querySelector('[data-team-seat="seat-c"]')).toBeTruthy();
    expect(el.querySelector("[data-team-melding]").textContent).toBe("Uitnodiging verstuurd naar piet@klant.nl.");
    expect(el.querySelector("[data-team-fout]").textContent).toBe("");
    // Het formulier is hetzelfde element gebleven en het veld is leeg.
    expect(el.querySelector("[data-team-uitnodig-adres]")).toBe(veld);
    expect(veld.value).toBe("");
    expect(veld.disabled).toBe(false);
  });

  it("zegt het als iemand al op de lijst stond, en geeft letOp door", async () => {
    const el = await paneelMet(TEAM);
    g.modulesFetch = vi.fn(async () => ({
      status: 200,
      body: { team: TEAM, uitgenodigd: { nieuw: false, mailVerstuurd: false }, letOp: "Je gebruikt nu meer plekken dan je licentie telt." },
    }));
    el.querySelector("[data-team-uitnodig-adres]").value = "janine@klant.nl";
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();
    const melding = el.querySelector("[data-team-melding]").textContent;
    expect(melding).toContain("stond al op de lijst");
    expect(melding).toContain("meer plekken");
  });

  it("zegt het als de mail niet wegkwam", async () => {
    const el = await paneelMet(TEAM);
    g.modulesFetch = vi.fn(async () => ({
      status: 200,
      body: { team: [...TEAM, PIET], uitgenodigd: { nieuw: true, mailVerstuurd: false } },
    }));
    el.querySelector("[data-team-uitnodig-adres]").value = "piet@klant.nl";
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();
    expect(el.querySelector("[data-team-melding]").textContent).toContain("mail kwam niet weg");
  });

  it("toont de foutmelding van de site in de alert en laat de lijst staan", async () => {
    const el = await paneelMet(TEAM);
    g.modulesFetch = vi.fn(async () => ({ status: 400, body: { fout: "Dat lijkt geen geldig e-mailadres." } }));
    const veld = el.querySelector("[data-team-uitnodig-adres]");
    veld.value = "geen-adres";
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();
    const fout = el.querySelector("[data-team-fout]");
    expect(fout.getAttribute("role")).toBe("alert");
    expect(fout.textContent).toBe("Dat lijkt geen geldig e-mailadres.");
    expect(el.querySelectorAll("[data-team-seat]")).toHaveLength(2);
    // Het getypte adres blijft staan, zodat je het kunt verbeteren.
    expect(veld.value).toBe("geen-adres");
  });

  it("valt terug op een eigen tekst bij een netwerkfout of een antwoord zonder fout-veld", async () => {
    const el = await paneelMet(TEAM);
    g.modulesFetch = vi.fn(async () => { throw new TypeError("offline"); });
    el.querySelector("[data-team-uitnodig-adres]").value = "piet@klant.nl";
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();
    expect(el.querySelector("[data-team-fout]").textContent).toContain("geen verbinding");

    g.modulesFetch = vi.fn(async () => ({ status: 503, body: null }));
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();
    expect(el.querySelector("[data-team-fout]").textContent).toContain("Uitnodigen lukte niet");
  });

  it("stuurt niets zonder adres", async () => {
    const el = await paneelMet(TEAM);
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();
    expect(g.modulesFetch).not.toHaveBeenCalled();
    expect(el.querySelector("[data-team-fout]").textContent).toContain("e-mailadres");
  });
});

describe("verwijderen", () => {
  it("vraagt eerst bevestiging en stuurt pas daarna de seat", async () => {
    const el = await paneelMet(TEAM);
    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { team: [EIGENAAR] } }));

    el.querySelector('[data-team-verwijder="seat-b"]').click();
    await tick();
    expect(g.modulesFetch).not.toHaveBeenCalled();
    const bevestig = el.querySelector(".team-bevestig");
    expect(bevestig.textContent).toContain("janine@klant.nl kan daarna niet meer inloggen");
    expect(bevestig.textContent).toContain("sessies worden afgesloten");
    // Focus op de veilige keuze.
    expect(document.activeElement).toBe(el.querySelector('[data-team-verwijder-nee="seat-b"]'));

    el.querySelector('[data-team-verwijder-ja="seat-b"]').click();
    await tick();
    expect(g.modulesFetch).toHaveBeenCalledTimes(1);
    expect(g.modulesFetch.mock.calls[0][0]).toBe("/api/dashboard/team/verwijderen");
    expect(g.modulesFetch.mock.calls[0][1]).toEqual({ seat: "seat-b" });
    expect(el.querySelector('[data-team-seat="seat-b"]')).toBeNull();
    expect(el.querySelector(".team-bevestig")).toBeNull();
    expect(el.querySelector("[data-team-melding]").textContent).toContain("janine@klant.nl is verwijderd");
  });

  it("annuleren stuurt niets en zet de knop terug", async () => {
    const el = await paneelMet(TEAM);
    el.querySelector('[data-team-verwijder="seat-b"]').click();
    el.querySelector('[data-team-verwijder-nee="seat-b"]').click();
    await tick();
    expect(g.modulesFetch).not.toHaveBeenCalled();
    expect(el.querySelector(".team-bevestig")).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('[data-team-verwijder="seat-b"]'));
  });

  it("houdt de bevestiging open bij een fout, met de melding van de site", async () => {
    const el = await paneelMet(TEAM);
    g.modulesFetch = vi.fn(async () => ({ status: 503, body: { fout: "De teamlijst is even niet bij te werken. Probeer het zo opnieuw." } }));
    el.querySelector('[data-team-verwijder="seat-b"]').click();
    el.querySelector('[data-team-verwijder-ja="seat-b"]').click();
    await tick();
    expect(el.querySelector("[data-team-fout]").textContent).toBe("De teamlijst is even niet bij te werken. Probeer het zo opnieuw.");
    const ja = el.querySelector('[data-team-verwijder-ja="seat-b"]');
    expect(ja).toBeTruthy();
    expect(ja.disabled).toBe(false);
    expect(el.querySelectorAll("[data-team-seat]")).toHaveLength(2);
  });

  it("de bevestiging overleeft een hertekening van het dashboard", async () => {
    const el = await paneelMet(TEAM);
    el.querySelector('[data-team-verwijder="seat-b"]').click();
    g.renderTeamPanel(el);
    expect(el.querySelector('[data-team-verwijder-ja="seat-b"]')).toBeTruthy();
  });
});

describe("geen dubbele listeners", () => {
  it("één POST per uitnodiging en per verwijdering, ook na meerdere hertekeningen", async () => {
    const el = await paneelMet(TEAM);
    g.renderTeamPanel(el);
    g.renderTeamPanel(el);
    g.renderTeamPanel(el);

    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { team: [...TEAM, PIET], uitgenodigd: { nieuw: true, mailVerstuurd: true } } }));
    el.querySelector("[data-team-uitnodig-adres]").value = "piet@klant.nl";
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();
    expect(g.modulesFetch).toHaveBeenCalledTimes(1);

    g.renderTeamPanel(el);
    g.renderTeamPanel(el);
    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { team: TEAM } }));
    el.querySelector('[data-team-verwijder="seat-c"]').click();
    el.querySelector('[data-team-verwijder-ja="seat-c"]').click();
    await tick();
    expect(g.modulesFetch).toHaveBeenCalledTimes(1);
    expect(g.modulesFetch.mock.calls[0][1]).toEqual({ seat: "seat-c" });
  });
});
