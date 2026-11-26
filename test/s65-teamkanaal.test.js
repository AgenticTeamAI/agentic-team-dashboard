// @vitest-environment jsdom
/* s65 — wat er per agent naar het teamkanaal gaat, ingesteld door de eigenaar.
 *
 * Besluit Tijmen 26-11-2026: de eigenaar, en alleen de eigenaar, zet in het
 * dashboard per agent aan of uit wat er naar het teamkanaal gaat. De instantie
 * handhaaft dat (GET/PUT /dashboard/teamkanaal, werkruimte #261). Wat hier vastligt:
 *  - voor ieder ander dan de eigenaar (beheerder, medewerker, viewer, een
 *    daglink, een werkruimte zonder register) is Beheer byte voor byte de
 *    render van vóór s65 (test/fixtures/s65-teamkanaal-main.json), en gaat er
 *    geen verzoek naar /dashboard/teamkanaal;
 *  - ook voor de eigenaar blijft Beheer gelijk als de instantie de route niet
 *    kent (404: zonder_eigenaar, Obeya, een image van vóór s65), weigert (403),
 *    niet kan lezen (503) of iets onleesbaars stuurt;
 *  - de eigenaar ziet een blok "Teamkanaal" met per agent een schakelaar en de
 *    standaard; zonder gekoppeld kanaal alleen die mededeling, geen schakelaars;
 *  - een schakelaar stuurt precies één PUT {agents:{<slug>: true|false}},
 *    "Terug naar de standaard" stuurt null;
 *  - een weigering komt letterlijk in beeld en laat de stand staan; bij 403 of
 *    404 leest het dashboard de rol en de instelling opnieuw;
 *  - naam en emoji uit het antwoord worden nooit html. */
import { describe, expect, it, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { laadAlles, stubOpslag, ROOT } from "./helpers/v2.js";
import { NU } from "./helpers/s64-scenario.js";
import { SCENARIOS, BEH, EIG, fout, tekenBeheer } from "./helpers/s65-scenario.js";

const MAIN = JSON.parse(readFileSync(join(ROOT, "test/fixtures/s65-teamkanaal-main.json"), "utf8"));
const NIET_EIGENAAR = ["geen-register", "beheerder", "beheerder-met-site", "medewerker", "viewer", "daglink"];
const EIGENAAR = ["eigenaar", "eigenaar-zonder-site"];

let g;
beforeAll(() => {
  vi.useFakeTimers({ now: NU, toFake: ["Date"] });
  stubOpslag(window);
  g = laadAlles();
});
afterAll(() => vi.useRealTimers());
afterEach(() => { window.location.hash = ""; });

/* Het antwoord van GET /dashboard/teamkanaal, zoals werkruimte #261 het geeft:
 * alle agents uit de registry, in registryvolgorde. Met de modus aan gaan
 * Controller en Jurist standaard niet door (niet elke rol leest ze). */
function kanaalAntwoord({ ingesteld = true, soort = "slack", afscherming = "aan", keuzes = {}, uitStandaard = ["controller", "jurist"] } = {}) {
  return {
    kanaal: { ingesteld, soort: ingesteld ? soort : null },
    afscherming,
    standaard: afscherming === "aan" ? "leesbaar_voor_iedereen" : "alles",
    gezet_op: Object.keys(keuzes).length ? "2026-11-26T09:00:00.000Z" : null,
    agents: g.AGENTIC_TEAM_SCHEMA.agents.map((a) => {
      const keuze = Object.prototype.hasOwnProperty.call(keuzes, a.slug) ? keuzes[a.slug] : null;
      const standaard = afscherming === "uit" || !uitStandaard.includes(a.slug);
      return { slug: a.slug, naam: a.displayName, emoji: a.emoji, keuze, standaard, effectief: keuze ?? standaard };
    }),
  };
}

/* Een instantie met geheugen: GET geeft de stand, PUT zet zoals #261 (gedeeltelijk, null = standaard). */
function instantie(opties = {}) {
  const keuzes = { ...(opties.keuzes || {}) };
  return (methode, payload) => {
    if (methode === "PUT") for (const [slug, k] of Object.entries(payload.agents)) { if (k === null) delete keuzes[slug]; else keuzes[slug] = k; }
    return kanaalAntwoord({ ...opties, keuzes });
  };
}

const SECTIE = /\n    <section class="vak beheer" id="beheer-teamkanaal"[^>]*>[\s\S]*<\/section>(?=<\/div><\/main>)/;
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const sectie = () => document.getElementById("beheer-teamkanaal");
const schakelaar = (slug) => document.getElementById("kanaal-" + slug);
/* De tekst zoals je hem leest: losse elementen met een spatie ertussen. */
const tekst = (el) => {
  const delen = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) delen.push(w.currentNode.textContent);
  return delen.join(" ").replace(/\s+/g, " ").trim();
};
const kanaalVerzoeken = (v) => v.filter((x) => x.pad === "/dashboard/teamkanaal");

describe("s65 — voor ieder ander dan de eigenaar: byte-gelijk aan vóór s65", () => {
  it("de opname hoort bij deze scenario's", () => {
    expect(Object.keys(MAIN.schermen).sort()).toEqual(Object.keys(SCENARIOS).sort());
    expect(MAIN.herkomst).toContain("vóór s65");
    expect(MAIN.bron).toBe("03eb14d");
    for (const html of Object.values(MAIN.schermen)) expect(html).not.toContain("eamkanaal");
  });

  it("zonder antwoord op /dashboard/teamkanaal is elk scenario byte voor byte main", async () => {
    for (const sc of Object.keys(SCENARIOS)) expect((await tekenBeheer(g, sc)).html, sc).toBe(MAIN.schermen[sc]);
  });

  it("beheerder, medewerker, viewer, daglink en geen register: geen verzoek en geen blok, ook als de instantie wel zou antwoorden", async () => {
    for (const sc of NIET_EIGENAAR) {
      const { html, verzoeken } = await tekenBeheer(g, sc, kanaalAntwoord());
      expect(html, sc).toBe(MAIN.schermen[sc]);
      expect(kanaalVerzoeken(verzoeken), sc).toEqual([]);
    }
  });

  it("de eigenaar met een 404 (zonder_eigenaar, Obeya, vóór s65), 403, 503, geen verbinding of een raar antwoord: byte-gelijk", async () => {
    const antwoorden = [
      fout(404, "Onbekende dashboardroute"),
      fout(403, "Alleen de eigenaar stelt in wat er naar het teamkanaal gaat.", "alleen_eigenaar"),
      fout(403, "Het teamkanaal stel je in vanuit een ingelogde sessie op het dashboard, niet met een dashboardlink."),
      fout(503, "De instelling van het teamkanaal is nu niet te lezen of te wijzigen. Probeer het zo opnieuw."),
      new Error("Je werkruimte-instantie is niet bereikbaar. Controleer je verbinding en probeer het opnieuw."),
      null, "tekst", [], {}, { kanaal: { ingesteld: true }, afscherming: "aan" },
      { kanaal: { ingesteld: "ja" }, afscherming: "aan", agents: [] },
      { kanaal: { ingesteld: true, soort: "slack" }, afscherming: "misschien", agents: [] },
      { kanaal: { ingesteld: true, soort: "slack" }, afscherming: "aan", agents: "alle" },
    ];
    for (const sc of EIGENAAR) {
      for (const a of antwoorden) {
        const { html, verzoeken } = await tekenBeheer(g, sc, a);
        expect(html, `${sc} ${JSON.stringify(a && a.message ? a.message : a)}`).toBe(MAIN.schermen[sc]);
        expect(kanaalVerzoeken(verzoeken).length).toBe(1);
      }
    }
  });
});

describe("s65 — de eigenaar ziet het blok Teamkanaal", () => {
  it("haalt de instelling één keer op, met het sessietoken; wie het blok weghaalt, houdt main over", async () => {
    for (const sc of EIGENAAR) {
      const { html, verzoeken, ctx } = await tekenBeheer(g, sc, kanaalAntwoord());
      expect(kanaalVerzoeken(verzoeken), sc).toEqual([{ methode: "GET", pad: "/dashboard/teamkanaal", token: ctx.bron.token }]);
      expect(html).toContain('<h3>Teamkanaal</h3>');
      expect(html.replace(SECTIE, ""), sc).toBe(MAIN.schermen[sc]);
    }
  });

  it("per agent een schakelaar in registryvolgorde, met wat er nu gebeurt en wat de standaard is", async () => {
    await tekenBeheer(g, "eigenaar", kanaalAntwoord({ keuzes: { controller: true, dealmaker: false } }));
    const knoppen = [...sectie().querySelectorAll("[data-kanaal-agent]")];
    expect(knoppen.map((k) => k.getAttribute("data-kanaal-agent"))).toEqual(g.AGENTIC_TEAM_SCHEMA.agents.map((a) => a.slug));
    for (const k of knoppen) {
      expect(k.getAttribute("role")).toBe("switch");
      expect(k.disabled).toBe(false);
    }
    const rij = (slug) => tekst(schakelaar(slug).closest(".taak"));
    // Geen keuze: de standaard.
    expect(schakelaar("researcher").getAttribute("aria-checked")).toBe("true");
    expect(rij("researcher")).toBe("🔍 Researcher Volgt de standaard: aan");
    expect(schakelaar("jurist").getAttribute("aria-checked")).toBe("false");
    expect(rij("jurist")).toBe("⚖️ Jurist Volgt de standaard: uit");
    expect(schakelaar("jurist").closest(".taak").classList.contains("uit")).toBe(true);
    // Een keuze van de eigenaar, in beide richtingen.
    expect(schakelaar("controller").getAttribute("aria-checked")).toBe("true");
    expect(rij("controller")).toBe("📊 Controller Jouw keuze · standaard: uit Terug naar de standaard");
    expect(schakelaar("dealmaker").getAttribute("aria-checked")).toBe("false");
    expect(rij("dealmaker")).toBe("🤝 Dealmaker Jouw keuze · standaard: aan Terug naar de standaard");
    expect(sectie().querySelectorAll("[data-kanaal-standaard]").length).toBe(2);
    expect(schakelaar("controller").getAttribute("aria-label")).toBe("Controller naar het teamkanaal");
  });

  it("legt uit dat het kanaal geen rollen kent, en noemt het soort kanaal", async () => {
    await tekenBeheer(g, "eigenaar", kanaalAntwoord({ soort: "teams" }));
    const t = tekst(sectie());
    expect(t).toContain("Je agents melden in je teamkanaal (Teams) wat ze doen.");
    expect(t).toContain("Het kanaal kent geen rollen: iedereen die erin zit, leest alles wat erheen gaat.");
    expect(t).toContain("Daarom gaat een agent waarvan niet iedereen in je team het werk mag lezen, standaard niet door.");
    expect(t).toContain("In je werkruimte blijft alles staan, ook wat niet doorgaat.");
    // Geen filter per soort: alleen schakelaars per agent.
    expect(sectie().querySelectorAll("select, input").length).toBe(0);
  });

  it("met de afscherming uit: standaard gaat alles door", async () => {
    await tekenBeheer(g, "eigenaar", kanaalAntwoord({ afscherming: "uit", soort: "discord" }));
    const t = tekst(sectie());
    expect(t).toContain("(Discord)");
    expect(t).toContain("Je werkruimte schermt niets af, dus standaard gaat alles door.");
    expect(t).not.toContain("standaard niet door");
    expect([...sectie().querySelectorAll("[data-kanaal-agent]")].every((k) => k.getAttribute("aria-checked") === "true")).toBe(true);
  });

  it("zonder gekoppeld kanaal: dat zeggen, en geen schakelaars", async () => {
    await tekenBeheer(g, "eigenaar", kanaalAntwoord({ ingesteld: false }));
    expect(tekst(sectie())).toBe("Teamkanaal Er is geen teamkanaal gekoppeld. Koppel je een kanaal in Slack, Teams of Discord, dan stel je hier per agent in wat erheen gaat.");
    expect(sectie().querySelectorAll("button").length).toBe(0);
  });

  it("een sessie die alleen mag lezen: schakelaars uit, met de reden", async () => {
    g._resetTeam();
    const kop = btoa(JSON.stringify({ scope: "dashboard:lees", sub: "at_test#seat1" })).replace(/=+$/, "");
    const { html } = await tekenBeheerMet({ token: `kop.${kop}.handtekening` }, kanaalAntwoord());
    expect(html).toContain("Je sessie mag alleen lezen. Log opnieuw in om dit aan te passen.");
    expect([...sectie().querySelectorAll("[data-kanaal-agent]")].every((k) => k.disabled)).toBe(true);
  });

  it("zegt de instantie intussen dat je geen eigenaar meer bent, dan is het blok weg, ook vóór de instelling opnieuw geladen is", async () => {
    await tekenBeheer(g, "eigenaar", kanaalAntwoord());
    expect(sectie()).not.toBeNull();
    // Een vernieuwd token, en de instantie geeft nu een andere rol (eigenaarswissel).
    const oud = g.schrijfWerkruimte;
    g.schrijfWerkruimte = async (b, methode, pad, payload) => (pad === "/dashboard/rollen"
      ? { jij: { seat: EIG, rol: "beheerder" }, eigenaar: BEH, standaard: "medewerker", toewijsbaar: ["medewerker", "viewer"], rollen: [] }
      : oud(b, methode, pad, payload));
    g.huidigeBron = { ...g.huidigeBron, token: g.huidigeBron.token + "-vernieuwd" };
    await g.laadRollen(g.huidigeBron);
    // laadTeamkanaal is nog niet gedraaid: de instelling van de eigenaar staat nog in het geheugen.
    expect(g.kanaalInfo).not.toBeNull();
    g.V2.render();
    expect(sectie()).toBeNull();
    expect(document.getElementById("root").innerHTML).not.toContain("eamkanaal");
  });

  it("naam en emoji uit het antwoord worden nooit html; een slug die geen slug is, valt weg", async () => {
    const a = kanaalAntwoord();
    a.agents[0].naam = '<img src=x onerror="alert(1)">';
    a.agents[1].emoji = "<b>x</b>";
    a.agents.push({ slug: '"><script>', naam: "Kwaad", emoji: "", keuze: null, standaard: true, effectief: true });
    a.agents.push({ slug: "Controller", naam: "Hoofdletters", emoji: "", keuze: null, standaard: true, effectief: true });
    a.agents.push({ ...a.agents[2] }); // dubbel
    await tekenBeheer(g, "eigenaar", a);
    expect(sectie().querySelector("img, script, b")).toBeNull();
    expect(sectie().innerHTML).toContain("&lt;img src=x");
    expect(sectie().querySelectorAll("[data-kanaal-agent]").length).toBe(g.AGENTIC_TEAM_SCHEMA.agents.length);
  });
});

/* Zoals tekenBeheer, maar met een eigen bron (een ander token). */
async function tekenBeheerMet(bronDelta, kanaal) {
  const { html, verzoeken, ctx } = await tekenBeheer(g, "eigenaar", kanaal);
  Object.assign(g.huidigeBron, bronDelta);
  await g.laadRollen(g.huidigeBron);
  await g.laadTeamkanaal(g.huidigeBron);
  g.V2.render();
  return { html: document.getElementById("root").innerHTML, verzoeken, ctx };
}

describe("s65 — schakelen", () => {
  let verzoeken;
  const puts = () => kanaalVerzoeken(verzoeken).filter((v) => v.methode === "PUT");
  const melding = () => sectie().querySelector("[data-kanaal-melding]").textContent;
  const foutTekst = () => sectie().querySelector("[data-kanaal-fout]").textContent;

  beforeEach(() => { verzoeken = null; });

  it("een schakelaar stuurt precies één PUT met die agent en de nieuwe waarde, en toont de nieuwe stand", async () => {
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", instantie()));
    schakelaar("jurist").click();
    // Tijdens de aanvraag staat elke schakelaar uit.
    expect([...sectie().querySelectorAll("[data-kanaal-agent]")].every((k) => k.disabled)).toBe(true);
    expect(melding()).toBe("Opslaan…");
    await tick();
    expect(puts()).toEqual([{ methode: "PUT", pad: "/dashboard/teamkanaal", token: g.huidigeBron.token, payload: { agents: { jurist: true } } }]);
    expect(schakelaar("jurist").getAttribute("aria-checked")).toBe("true");
    expect(tekst(schakelaar("jurist").closest(".taak"))).toBe("⚖️ Jurist Jouw keuze · standaard: uit Terug naar de standaard");
    expect(melding()).toBe("Jurist gaat nu naar het teamkanaal.");
    expect(foutTekst()).toBe("");
    expect(document.activeElement).toBe(schakelaar("jurist"));

    schakelaar("researcher").click();
    await tick();
    expect(puts()[1].payload).toEqual({ agents: { researcher: false } });
    expect(schakelaar("researcher").getAttribute("aria-checked")).toBe("false");
    expect(melding()).toBe("Researcher gaat nu niet meer naar het teamkanaal.");
  });

  it("'Terug naar de standaard' stuurt null", async () => {
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", instantie({ keuzes: { controller: true } })));
    schakelaar("controller").closest(".taak").querySelector("[data-kanaal-standaard]").click();
    await tick();
    expect(puts().map((p) => p.payload)).toEqual([{ agents: { controller: null } }]);
    expect(schakelaar("controller").getAttribute("aria-checked")).toBe("false");
    expect(tekst(schakelaar("controller").closest(".taak"))).toBe("📊 Controller Volgt de standaard: uit");
    expect(melding()).toBe("Controller volgt weer de standaard: gaat niet naar het kanaal.");
  });

  it("de stand blijft bij een hertekening van Beheer staan", async () => {
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", instantie()));
    schakelaar("jurist").click();
    await tick();
    g.V2.render();
    expect(schakelaar("jurist").getAttribute("aria-checked")).toBe("true");
    expect(melding()).toBe("Jurist gaat nu naar het teamkanaal.");
  });

  it("één wijziging tegelijk: een tweede klik tijdens de aanvraag stuurt niets", async () => {
    let los;
    const inst = instantie();
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", (m, p) => (m === "PUT" ? new Promise((r) => { los = () => r(inst(m, p)); }) : inst(m, p))));
    schakelaar("jurist").click();
    schakelaar("jurist").click();
    schakelaar("researcher").click();
    sectie().querySelector("[data-kanaal-agent]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    expect(puts().length).toBe(1);
    los();
    await tick();
    expect(puts().length).toBe(1);
    expect(schakelaar("researcher").disabled).toBe(false);
  });

  it("een weigering (400, 503, 401, geen verbinding) komt letterlijk in beeld en laat de stand staan", async () => {
    const gevallen = [
      fout(400, "Onbekende agent-slug: 'jurist'. Gebruik de slug uit de lijst van GET /dashboard/teamkanaal.", "ongeldige_agent"),
      fout(400, "De keuze voor 'jurist' is true (naar het kanaal), false (niet) of null (de standaard).", "ongeldige_keuze"),
      fout(503, "De instelling van het teamkanaal is nu niet te lezen of te wijzigen. Probeer het zo opnieuw."),
      fout(413, "Bericht te groot (max 16384 bytes)."),
      Object.assign(new Error("Je sessie is verlopen. Log opnieuw in met je licentie."), { oauthVerlopen: true }),
      new Error("Je werkruimte-instantie is niet bereikbaar. Controleer je verbinding en probeer het opnieuw."),
    ];
    for (const f of gevallen) {
      const inst = instantie();
      ({ verzoeken } = await tekenBeheer(g, "eigenaar", (m, p) => { if (m === "PUT") throw f; return inst(m, p); }));
      schakelaar("jurist").click();
      await tick();
      expect(puts().length).toBe(1);
      expect(foutTekst(), f.message).toBe(f.message);
      expect(melding()).toBe("");
      expect(schakelaar("jurist").getAttribute("aria-checked")).toBe("false");
      expect(schakelaar("jurist").disabled).toBe(false);
      // Geen nieuwe GET: alleen bij 403 of 404 leest het dashboard opnieuw.
      expect(kanaalVerzoeken(verzoeken).filter((v) => v.methode === "GET").length).toBe(1);
    }
  });

  it("een antwoord dat geen stand is: zeggen dat het onduidelijk is, de oude stand blijft", async () => {
    const inst = instantie();
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", (m, p) => (m === "PUT" ? { ok: true } : inst(m, p))));
    schakelaar("jurist").click();
    await tick();
    expect(foutTekst()).toBe("Je werkruimte gaf een onverwacht antwoord. Ververs de pagina om te zien wat er nu staat.");
    expect(schakelaar("jurist").getAttribute("aria-checked")).toBe("false");
  });

  it("403 alleen_eigenaar: rol en instelling opnieuw lezen; geen eigenaar meer, dan de reden en geen schakelaars", async () => {
    const inst = instantie();
    let rol = "eigenaar";
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", (m, p) => {
      if (m === "PUT") { rol = "beheerder"; throw fout(403, "Alleen de eigenaar stelt in wat er naar het teamkanaal gaat.", "alleen_eigenaar"); }
      return inst(m, p);
    }));
    const oud = g.schrijfWerkruimte;
    g.schrijfWerkruimte = async (b, methode, pad, payload) => {
      if (pad === "/dashboard/rollen" && rol === "beheerder") {
        verzoeken.push({ methode, pad, token: b.token });
        return { jij: { seat: EIG, rol: "beheerder" }, eigenaar: BEH, standaard: "medewerker", toewijsbaar: ["medewerker", "viewer"], rollen: [] };
      }
      return oud(b, methode, pad, payload);
    };
    schakelaar("jurist").click();
    await tick(12);
    expect(verzoeken.filter((v) => v.pad === "/dashboard/rollen").length).toBe(2);
    // Geen eigenaar meer: geen nieuwe GET op het teamkanaal.
    expect(kanaalVerzoeken(verzoeken).map((v) => v.methode)).toEqual(["GET", "PUT"]);
    expect(sectie().querySelectorAll("button").length).toBe(0);
    expect(tekst(sectie())).toBe("Teamkanaal Alleen de eigenaar stelt in wat er naar het teamkanaal gaat.");
    // Bij de volgende hertekening is Beheer weer wat elke beheerder ziet: zonder blok.
    g.V2.render();
    expect(sectie()).toBeNull();
  });

  it("404 (de instelling bestaat hier niet meer): opnieuw lezen, dan de reden en geen schakelaars", async () => {
    const inst = instantie();
    let weg = false;
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", (m, p) => {
      if (m === "PUT") weg = true;
      if (weg) throw fout(404, "Onbekende dashboardroute");
      return inst(m, p);
    }));
    schakelaar("jurist").click();
    await tick(12);
    expect(kanaalVerzoeken(verzoeken).map((v) => v.methode)).toEqual(["GET", "PUT", "GET"]);
    expect(sectie().querySelectorAll("button").length).toBe(0);
    expect(tekst(sectie())).toBe("Teamkanaal Het teamkanaal is op deze werkruimte nu niet in te stellen.");
  });

  it("403 zonder schrijfscope (weigerScope) met eigenaar blijft eigenaar: de reden, en de schakelaars blijven", async () => {
    const inst = instantie();
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", (m, p) => { if (m === "PUT") throw fout(403, "Dit token mag het dashboard lezen maar niet bewerken."); return inst(m, p); }));
    schakelaar("jurist").click();
    await tick(12);
    expect(foutTekst()).toBe("Dit token mag het dashboard lezen maar niet bewerken.");
    expect(schakelaar("jurist").getAttribute("aria-checked")).toBe("false");
    expect(kanaalVerzoeken(verzoeken).map((v) => v.methode)).toEqual(["GET", "PUT", "GET"]);
  });

  it("een hertekening tijdens de aanvraag: het antwoord komt in de sectie die je ziet, niet in de losgekoppelde", async () => {
    let los;
    const inst = instantie();
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", (m, p) => (m === "PUT" ? new Promise((r) => { los = () => r(inst(m, p)); }) : inst(m, p))));
    const oud = sectie();
    schakelaar("jurist").click();
    await tick();
    // Een toast die verloopt, laadTeam dat binnenkomt, of heen en terug: Beheer tekent opnieuw.
    g.V2.render();
    expect(sectie()).not.toBe(oud);
    expect([...sectie().querySelectorAll("[data-kanaal-agent]")].every((k) => k.disabled)).toBe(true);
    expect(melding()).toBe("Opslaan…");
    los();
    await tick();
    expect(oud.isConnected).toBe(false);
    expect([...sectie().querySelectorAll("[data-kanaal-agent]")].every((k) => !k.disabled)).toBe(true);
    expect(schakelaar("jurist").getAttribute("aria-checked")).toBe("true");
    expect(melding()).toBe("Jurist gaat nu naar het teamkanaal.");
    expect(document.activeElement).toBe(schakelaar("jurist"));
    // En de volgende klik doet weer iets.
    schakelaar("researcher").click();
    await tick();
    expect(puts().map((p) => p.payload)).toEqual([{ agents: { jurist: true } }, { agents: { researcher: false } }]);
    los();
    await tick();
    expect(schakelaar("researcher").getAttribute("aria-checked")).toBe("false");
  });

  it("een hertekening tijdens een aanvraag die met 403 eindigt: de reden staat in de sectie die je ziet", async () => {
    let los;
    let rol = "eigenaar";
    const inst = instantie();
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", (m, p) => (m === "PUT"
      ? new Promise((_, nee) => { los = () => { rol = "beheerder"; nee(fout(403, "Alleen de eigenaar stelt in wat er naar het teamkanaal gaat.", "alleen_eigenaar")); }; })
      : inst(m, p))));
    const oud = g.schrijfWerkruimte;
    g.schrijfWerkruimte = async (b, methode, pad, payload) => {
      if (pad === "/dashboard/rollen" && rol === "beheerder") {
        verzoeken.push({ methode, pad, token: b.token });
        return { jij: { seat: EIG, rol: "beheerder" }, eigenaar: BEH, standaard: "medewerker", toewijsbaar: ["medewerker", "viewer"], rollen: [] };
      }
      return oud(b, methode, pad, payload);
    };
    schakelaar("jurist").click();
    await tick();
    g.V2.render();
    los();
    await tick(12);
    expect(sectie().querySelectorAll("button").length).toBe(0);
    expect(tekst(sectie())).toBe("Teamkanaal Alleen de eigenaar stelt in wat er naar het teamkanaal gaat.");
  });

  it("wisselt de sessie na een hertekening tijdens de aanvraag naar een daglink, dan gaan het blok en 'Wie werkt er mee' dicht", async () => {
    let los;
    const inst = instantie();
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", (m, p) => (m === "PUT" ? new Promise((r) => { los = () => r(inst(m, p)); }) : inst(m, p))));
    schakelaar("jurist").click();
    await tick();
    g.V2.render();
    const el = sectie();
    g.huidigeBron = { token: "daglink-s65", instantieUrl: "https://connector.example" };
    los();
    await tick();
    expect(el.isConnected).toBe(true);
    expect(el.style.display).toBe("none");
    expect(el.querySelector("[data-kanaal-agent]")).toBeNull();
    expect(document.getElementById("panel-team-namen").style.display).toBe("none");
  });

  it("wisselt de sessie tijdens de aanvraag naar een daglink, dan gaat het blok dicht", async () => {
    let los;
    const inst = instantie();
    ({ verzoeken } = await tekenBeheer(g, "eigenaar", (m, p) => (m === "PUT" ? new Promise((r) => { los = () => r(inst(m, p)); }) : inst(m, p))));
    const el = sectie();
    schakelaar("jurist").click();
    await tick();
    g.huidigeBron = { token: "daglink-s65", instantieUrl: "https://connector.example" };
    los();
    await tick();
    expect(el.style.display).toBe("none");
    expect(el.querySelector("[data-kanaal-agent]")).toBeNull();
  });
});

describe("s65 — de bron", () => {
  it("geen nieuwe fetch-plek: het verkeer loopt over schrijfWerkruimte", () => {
    const bron = readFileSync(join(ROOT, "src/team-beheer.js"), "utf8");
    const s65 = bron.slice(bron.indexOf("/* s65 —"));
    expect(s65).not.toMatch(/\bfetch\(/);
    expect(s65).toContain('schrijfWerkruimte(bron, "PUT", "/dashboard/teamkanaal", { agents: { [slug]: waarde } })');
  });
});
