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
 *    namenpaneel, in plaats van knoppen die op een 404 stuklopen;
 *  - één verwijdering tegelijk, ook als het dashboard tijdens de aanvraag
 *    hertekent — anders overschrijft de 404 van een tweede POST het succes;
 *  - de focus belandt na een actie op een vaste plek, niet op <body>;
 *  - zonder ingelogde sessie (gewisseld naar een daglink) gaat er niets naar
 *    de site: het daglink-token hoort onze server nooit te bereiken. */
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

/* Een aanvraag die pas antwoordt als de test dat zegt — om de toestand
 * tíjdens het versturen te kunnen bekijken. */
function uitgesteld() {
  let los;
  const belofte = new Promise((r) => { los = r; });
  return { fetch: vi.fn(() => belofte), los };
}

/* jsdom haalt de focus niet weg van een element dat uitgeschakeld wordt; een
 * browser wel (dan staat hij op <body>). Dat doen we hier na, anders bewijst
 * een focus-assertie niets. */
function zoalsDeBrowserBijUitschakelen() {
  const actief = document.activeElement;
  if (!actief || actief === document.body) return;
  if (!actief.disabled && actief.isConnected) return;
  // blur() op een uitgeschakeld element doet in jsdom niets; een tijdelijk
  // element focussen en weghalen zet de focus wel op <body>.
  const tijdelijk = document.createElement("button");
  document.body.append(tijdelijk);
  tijdelijk.focus();
  tijdelijk.remove();
}

function sectie() {
  document.body.innerHTML = `<section id="p" style="display:none;"><div id="panel-team-namen-body"></div></section>`;
  return document.getElementById("p");
}

async function paneelMet(team) {
  g.huidigeBron = { oauth: true, token: "jwt" };
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
    // "licentiehouder", niet "eigenaar": die naam heeft de werkdatakolom al.
    expect(eigenaarRij.querySelector(".team-actie").textContent.trim()).toBe("licentiehouder");
    expect(eigenaarRij.querySelector(".team-actie [title]").getAttribute("title")).toContain("niet verwijderen");
    expect(eigenaarRij.querySelector("button")).toBeNull();
  });

  it("geeft in een gemengde lijst alleen rijen met eigenaar: false een knop", async () => {
    const { eigenaar, ...zonderVeld } = JANINE;
    const el = await paneelMet([EIGENAAR, zonderVeld, PIET]);
    // Eén rij met het veld is genoeg om te weten dat de site dit kan.
    expect(el.querySelector("[data-team-uitnodigen]")).toBeTruthy();
    expect(el.querySelector('[data-team-verwijder="seat-b"]')).toBeNull();
    expect(el.querySelector('[data-team-seat="seat-b"]').closest("tr").querySelector("button")).toBeNull();
    expect(el.querySelector('[data-team-verwijder="seat-c"]')).toBeTruthy();
  });

  it("gebruikt de dashboardtabelstijl en stapelt de rijen op een telefoon", async () => {
    const el = await paneelMet(TEAM);
    const tabel = el.querySelector("table");
    expect(tabel.classList.contains("detail-table")).toBe(true);
    expect(tabel.classList.contains("team-tabel")).toBe(true);
    const css = readFileSync(join(ROOT, "src/styles.css"), "utf8");
    const mobiel = [...css.matchAll(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
    expect(mobiel).toMatch(/\.team-tabel thead \{ display: none; \}/);
    expect(mobiel).toMatch(/\.team-tabel tr[^{]*\{[^}]*display: block/);
    // Naamvelden in dezelfde donkere stijl als het uitnodigveld.
    expect(css).toMatch(/\.team-uitnodigen input\[type="email"\],\s*input\.team-naam \{/);
  });

  it("verschijnt ook met een lege lijst — dan wil je juist iemand uitnodigen", async () => {
    const el = await paneelMet([]);
    expect(el.style.display).toBe("");
    expect(el.querySelector("[data-team-uitnodigen]")).toBeTruthy();
    // De beheerder logt zelf wel in — "niemand" mag dat niet ontkennen.
    expect(el.textContent).toContain("nog niemand uitgenodigd");
    expect(el.textContent).toContain("aankoopadres");
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
    expect(el.querySelector(".team-bevestig").getAttribute("role")).toBe("group");
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
    // Het token van de ingelogde sessie gaat expliciet mee.
    expect(g.modulesFetch.mock.calls[0][2]).toBe("jwt");
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
    // letOp staat op een eigen, oranje regel — geen bijzin in grijze voetnoottekst.
    expect(melding).not.toContain("plekken");
    const letOp = el.querySelector("[data-team-let-op]");
    expect(letOp.textContent).toBe("Je gebruikt nu meer plekken dan je licentie telt.");
    expect(letOp.classList.contains("warn")).toBe(true);

    // Een volgende melding ruimt de waarschuwing op.
    g.modulesFetch = vi.fn(async () => ({ status: 400, body: { fout: "Dat lijkt geen geldig e-mailadres." } }));
    el.querySelector("[data-team-uitnodig-adres]").value = "x";
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();
    expect(letOp.textContent).toBe("");
  });

  it("zet veld en knop uit tijdens het versturen en de focus daarna terug op het veld", async () => {
    const el = await paneelMet(TEAM);
    const { fetch, los } = uitgesteld();
    g.modulesFetch = fetch;
    const veld = el.querySelector("[data-team-uitnodig-adres]");
    const knop = el.querySelector('[data-team-uitnodigen] button[type="submit"]');
    veld.value = "geen-adres";
    veld.focus();
    knop.click();
    await tick();
    expect(veld.disabled).toBe(true);
    expect(knop.disabled).toBe(true);
    zoalsDeBrowserBijUitschakelen();
    expect(document.activeElement).toBe(document.body);

    los({ status: 400, body: { fout: "Dat lijkt geen geldig e-mailadres." } });
    await tick();
    expect(veld.disabled).toBe(false);
    expect(document.activeElement).toBe(veld);

    // En na succes ook — dan kun je meteen de volgende uitnodigen.
    const tweede = uitgesteld();
    g.modulesFetch = tweede.fetch;
    veld.value = "piet@klant.nl";
    knop.click();
    await tick();
    zoalsDeBrowserBijUitschakelen();
    tweede.los({ status: 200, body: { team: [...TEAM, PIET], uitgenodigd: { nieuw: true, mailVerstuurd: true } } });
    await tick();
    expect(document.activeElement).toBe(veld);
  });

  it("zegt wat wél kan als de site de route nog niet kent (kale 404)", async () => {
    const el = await paneelMet([]);
    g.modulesFetch = vi.fn(async () => ({ status: 404, body: null }));
    el.querySelector("[data-team-uitnodig-adres]").value = "piet@klant.nl";
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();
    expect(el.querySelector("[data-team-fout]").textContent).toContain("Vraag je team in Claude");

    // Een 404 mét fout-veld is de nieuwe site die "geen beheerder" zegt: die tekst tonen.
    g.modulesFetch = vi.fn(async () => ({ status: 404, body: { fout: "Niet beschikbaar." } }));
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();
    expect(el.querySelector("[data-team-fout]").textContent).toBe("Niet beschikbaar.");
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
    expect(bevestig.textContent).toContain("stopt binnen een uur");
    // Niet meer "worden afgesloten": bij een eigen werkruimte loopt een open
    // sessie tot het access token verloopt (intrekken fase 1, 16-09-2026).
    expect(bevestig.textContent).not.toContain("worden afgesloten");
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
    expect(g.modulesFetch.mock.calls[0][2]).toBe("jwt");
  });

  it("maakt 'Ja, verwijderen' niet opnieuw klikbaar als het paneel tijdens de aanvraag hertekent", async () => {
    const el = await paneelMet([EIGENAAR, JANINE, PIET]);
    const { fetch, los } = uitgesteld();
    g.modulesFetch = fetch;
    el.querySelector('[data-team-verwijder="seat-b"]').click();
    el.querySelector('[data-team-verwijder-ja="seat-b"]').click();
    await tick();
    expect(el.querySelector('[data-team-verwijder-ja="seat-b"]').disabled).toBe(true);

    // Ververs of periodekeuze tekent het paneel opnieuw.
    g.renderTeamPanel(el);
    const ja = el.querySelector('[data-team-verwijder-ja="seat-b"]');
    expect(ja.disabled).toBe(true);
    expect(el.querySelector('[data-team-verwijder-nee="seat-b"]').disabled).toBe(true);
    // Ook de knop bij een ander teamlid wacht.
    expect(el.querySelector('[data-team-verwijder="seat-c"]').disabled).toBe(true);

    // Zelfs een klik die de knop bereikt, stuurt niets extra's.
    ja.disabled = false;
    ja.click();
    el.querySelector('[data-team-verwijder="seat-c"]').disabled = false;
    el.querySelector('[data-team-verwijder="seat-c"]').click();
    // En de functie zelf weigert een tweede verwijdering zolang er een loopt.
    void g.verwijderTeamlid(el, "seat-c");
    await tick();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-team-verwijder-ja="seat-c"]')).toBeNull();

    los({ status: 200, body: { team: [EIGENAAR, PIET] } });
    await tick();
    expect(el.querySelector("[data-team-melding]").textContent).toContain("janine@klant.nl is verwijderd");
    expect(el.querySelector("[data-team-fout]").textContent).toBe("");
    expect(el.querySelector('[data-team-verwijder="seat-c"]').disabled).toBe(false);
  });

  it("zet de focus na verwijderen op het adresveld, en na een fout op Annuleren", async () => {
    const el = await paneelMet([EIGENAAR, JANINE, PIET]);
    const fout = uitgesteld();
    g.modulesFetch = fout.fetch;
    el.querySelector('[data-team-verwijder="seat-b"]').click();
    el.querySelector('[data-team-verwijder-ja="seat-b"]').focus();
    el.querySelector('[data-team-verwijder-ja="seat-b"]').click();
    await tick();
    zoalsDeBrowserBijUitschakelen();
    fout.los({ status: 503, body: { fout: "De teamlijst is even niet bij te werken. Probeer het zo opnieuw." } });
    await tick();
    expect(document.activeElement).toBe(el.querySelector('[data-team-verwijder-nee="seat-b"]'));

    const goed = uitgesteld();
    g.modulesFetch = goed.fetch;
    el.querySelector('[data-team-verwijder-ja="seat-b"]').click();
    await tick();
    zoalsDeBrowserBijUitschakelen();
    goed.los({ status: 200, body: { team: [EIGENAAR, PIET] } });
    await tick();
    expect(document.activeElement).toBe(el.querySelector("[data-team-uitnodig-adres]"));
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

describe("naam opslaan terwijl de lijst hertekent", () => {
  it("toont na het opslaan de nieuwe naam, ook als een klik op Verwijderen de lijst intussen hertekende", async () => {
    const el = await paneelMet([EIGENAAR, JANINE, PIET]);
    const { fetch, los } = uitgesteld();
    g.modulesFetch = fetch;
    const veld = el.querySelector('[data-team-seat="seat-b"]');
    veld.value = "Janine Bakker";
    veld.dispatchEvent(new window.Event("change", { bubbles: true }));
    el.querySelector('[data-team-verwijder="seat-c"]').click();
    expect(el.querySelector('[data-team-seat="seat-b"]').value).toBe("janine");

    los({ status: 200, body: { team: [EIGENAAR, { ...JANINE, naam: "Janine Bakker" }, PIET] } });
    await tick();
    expect(el.querySelector('[data-team-seat="seat-b"]').value).toBe("Janine Bakker");
    expect(el.querySelector("[data-team-melding]").textContent).toBe("Opgeslagen.");
    // De open bevestiging bij Piet blijft staan.
    expect(el.querySelector('[data-team-verwijder-ja="seat-c"]')).toBeTruthy();
  });
});

describe("gewisseld naar een daglink", () => {
  it("stuurt bij uitnodigen, verwijderen en een naamwijziging niets naar de site en sluit het paneel", async () => {
    for (const actie of ["uitnodigen", "verwijderen", "naam"]) {
      g._resetTeam();
      const el = await paneelMet(TEAM);
      if (actie === "verwijderen") el.querySelector('[data-team-verwijder="seat-b"]').click();
      // Zelfde tabblad, daglink geopend: huidigeBron is geen ingelogde sessie meer.
      g.huidigeBron = { token: "daglinktoken", instantieUrl: "https://connector.agentic-team.ai" };
      if (actie === "uitnodigen") {
        el.querySelector("[data-team-uitnodig-adres]").value = "piet@klant.nl";
        el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
      } else if (actie === "verwijderen") {
        el.querySelector('[data-team-verwijder-ja="seat-b"]').click();
      } else {
        const veld = el.querySelector('[data-team-seat="seat-b"]');
        veld.value = "Janine";
        veld.dispatchEvent(new window.Event("change", { bubbles: true }));
      }
      await tick();
      expect(g.modulesFetch, actie).not.toHaveBeenCalled();
      expect(el.style.display, actie).toBe("none");
    }
  });

  it("laat een antwoord dat pas na de wissel binnenkomt het paneel niet terugzetten", async () => {
    const el = await paneelMet(TEAM);
    const { fetch, los } = uitgesteld();
    g.modulesFetch = fetch;
    el.querySelector("[data-team-uitnodig-adres]").value = "piet@klant.nl";
    el.querySelector('[data-team-uitnodigen] button[type="submit"]').click();
    await tick();
    g.huidigeBron = { token: "daglinktoken" };
    await g.laadTeam(g.huidigeBron);
    g.renderTeamPanel(el);
    los({ status: 200, body: { team: [...TEAM, PIET], uitgenodigd: { nieuw: true, mailVerstuurd: true } } });
    await tick();
    expect(el.style.display).toBe("none");
  });

  it("haalt het team opnieuw op bij terugkeer naar dezelfde ingelogde sessie", async () => {
    g.modulesFetch = vi.fn(async () => ({ status: 200, body: { team: TEAM } }));
    const sessie = { oauth: true, token: "jwt" };
    expect(await g.laadTeam(sessie)).toHaveLength(2);
    expect(await g.laadTeam({ token: "daglinktoken" })).toBeNull();
    expect(await g.laadTeam(sessie)).toHaveLength(2);
    expect(g.modulesFetch).toHaveBeenCalledTimes(2);
    for (const [, , token] of g.modulesFetch.mock.calls) expect(token).toBe("jwt");
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
