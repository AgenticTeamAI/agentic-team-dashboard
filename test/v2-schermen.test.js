// @vitest-environment jsdom
/* Dashboard v2 — de schermen uit het klikbare ontwerp, op echte rijen.
 *
 * Wat hier vastligt is wat een klant merkt: welke knoppen er staan, wat elke
 * knop schrijft (precies één PATCH of POST, met de regels van i25 en b61), dat
 * ongedaan maken werkt, dat de daglink alleen-lezen is en dat tekst uit de
 * werkruimte nooit als HTML wordt gelezen. De patches zelf zijn getest in de
 * tests van voor-jou.js; hier gaat het om de knoppen die ze aanroepen. */
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { laadAlles, stubOpslag } from "./helpers/v2.js";

let g;
let RS, DM, OS;
beforeAll(() => {
  stubOpslag(window);
  g = laadAlles();
  const naam = (slug) => g.AGENTIC_TEAM_SCHEMA.agents.find(a => a.slug === slug).displayName;
  RS = naam("researcher"); DM = naam("dealmaker"); OS = naam("outreach-specialist");
});

const NU = new Date(2026, 8, 29, 7, 42);
const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;
const rij = (id, velden, aangemaakt = "2026-09-25T09:00:00") => ({ __entryId: id, __stempels: { aangemaakt, bijgewerkt: aangemaakt }, ...velden });

function maakCtx({ schrijven = true, acties = null, ritmetaken = null, organisaties = null, extra = {} } = {}) {
  const domains = {
    acties: { rows: acties || [
      rij("a1", { Actie: "Offerte Van Dam", Status: "Wacht op review", Eigenaar: "Sanne Verbeek", Agent: DM, "Aangemaakt door": DM, Toelichting: "De offerte.\n\nSes sessies." }, "2026-09-29T02:18:00"),
      rij("a2", { Actie: "Follow-up Jansen", Status: "Wacht op review", Eigenaar: "Sanne Verbeek", Agent: OS, "Aangemaakt door": OS, Toelichting: "Onderwerp: Vervolg\n\nBeste Peter," }, "2026-09-29T02:14:00"),
      rij("a3", { Actie: "15% korting De Vries?", Status: "Voorstel", Eigenaar: DM, Agent: DM, "Aangemaakt door": DM }, "2026-09-28T02:11:00"),
      rij("a4", { Actie: "Factuur Smit nabellen", Status: "Open", Eigenaar: "Sanne Verbeek", Deadline: "2026-09-25" }),
      rij("a5", { Actie: "Prospectlijst", Status: "Bezig", Eigenaar: RS, Agent: RS, "Aangemaakt door": "Sanne Verbeek" }),
    ] },
  };
  if (ritmetaken) domains.ritmetaken = { rows: ritmetaken };
  if (organisaties) domains.organisaties = { rows: organisaties };
  const ctx = {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU, periodWeeks: 12, minutenPerActie: 25,
    bron: { oauth: schrijven, token: token(schrijven ? "dashboard:lees dashboard:schrijf" : "dashboard:lees"), instantieUrl: "https://connector.example" },
    kanSchrijven: schrijven, herlaad: vi.fn(), bundelWaarschuwingen: [],
    bundle: { kind: "rows", source: "werkruimte", klant: "Verbeek Advies", systeemPerDomein: {}, domains, instantieDomeinen: Object.keys(domains) },
    ...extra,
  };
  // Zoals app.js: het antwoord van de instantie vervangt de rij, daarna opnieuw tekenen.
  ctx.werkBij = vi.fn((key, w) => {
    const dom = ctx.bundle.domains[key] || (ctx.bundle.domains[key] = { rows: [] });
    if (w.weg) dom.rows = dom.rows.filter(r => r.__entryId !== w.weg);
    else if (w.entry) {
      const nieuw = g.rijVanEntry(w.entry);
      const i = dom.rows.findIndex(r => r.__entryId === nieuw.__entryId);
      if (i === -1) dom.rows.unshift(nieuw); else dom.rows[i] = nieuw;
    }
    g.V2.toon(Object.assign({}, ctx, { today: NU }));
    return true;
  });
  return ctx;
}
/* Een nep-instantie: elke PATCH/POST geeft de rij terug zoals hij opgeslagen werd. */
function nepInstantie(ctx) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, o = {}) => {
    const u = new URL(String(url));
    const m = u.pathname.match(/^\/dashboard\/entries\/([^/]+)\/(.+)$/);
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (m && o.method === "PATCH") {
      const r = (ctx.bundle.domains[m[1]].rows || []).find(x => x.__entryId === decodeURIComponent(m[2]));
      const data = Object.assign({}, r); delete data.__entryId; delete data.__stempels;
      for (const [k, v] of Object.entries(JSON.parse(o.body).data)) { if (v === null) delete data[k]; else data[k] = v; }
      return json({ entry: { entryId: r.__entryId, data, aangemaakt: r.__stempels.aangemaakt, bijgewerkt: "2026-09-29T07:43:00" } });
    }
    if (u.pathname === "/dashboard/entries" && o.method === "POST") {
      const b = JSON.parse(o.body);
      return json({ entry: { entryId: "nieuw-1", data: b.data, aangemaakt: "2026-09-29T07:43:00", bijgewerkt: "2026-09-29T07:43:00" } });
    }
    if (m && o.method === "DELETE") return json({ ok: true });
    return new Response(JSON.stringify({ fout: "onbekend" }), { status: 404 });
  });
}
const patches = (spy) => spy.mock.calls.filter(c => (c[1] || {}).method === "PATCH").map(c => ({ pad: new URL(String(c[0])).pathname, data: JSON.parse(c[1].body).data }));
const posts = (spy) => spy.mock.calls.filter(c => (c[1] || {}).method === "POST").map(c => JSON.parse(c[1].body));
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const wacht = (fn) => vi.waitFor(fn, { timeout: 2000, interval: 5 });

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div><div id="melding" hidden></div><div id="live"></div>';
  window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne Verbeek");
  window.location.hash = "";
  g.V2._reset();
});
afterEach(() => { vi.restoreAllMocks(); window.location.hash = ""; });

function open(ctx, hash = "") {
  window.location.hash = hash;
  g.V2.start({});
  g.V2.toon(ctx);
}

describe("v2 — de kop en de vier tabs", () => {
  it("vier tabs, en de badge bij Voor jou is precies het aantal aan jou", () => {
    open(maakCtx());
    expect($$(".tabbalk .ttab").map(t => t.textContent.replace(/\d+/g, "").trim())).toEqual(["Voor jou", "Acties", "Team", "Gegevens"]);
    expect($(".tabbalk .badge").textContent).toBe(String(g.V2._aanJouZet().length));
    expect($(".akop .merk").textContent).toContain("Verbeek Advies");
    // Emoji alleen als gezicht van een specialist: nergens in de kop of de tabs.
    expect($(".akop").textContent + $(".tabbalk").textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("de werkbak is genummerd, en de nummers blijven staan na een afhandeling", async () => {
    const ctx = maakCtx(); const spy = nepInstantie(ctx);
    open(ctx);
    const nummers = () => Object.fromEntries($$("[data-kaart]").map(k => [k.dataset.kaart, k.querySelector(".nr").textContent]));
    const voor = nummers();
    expect(Object.keys(voor).length).toBe(g.V2._aanJouZet().length);
    $('[data-kaart="a1"] [data-f="goedkeuren"]').click();
    await wacht(() => expect(patches(spy)).toHaveLength(1));
    await wacht(() => expect($('[data-kaart="a1"]')).toBeNull());
    for (const [id, nr] of Object.entries(nummers())) expect(nr).toBe(voor[id]);
  });
});

describe("v2 — afhandelen vanaf Voor jou en het item-blad", () => {
  it("goedkeuren: één PATCH, Afgerond door blijft leeg (i25), met ongedaan maken", async () => {
    const ctx = maakCtx(); const spy = nepInstantie(ctx);
    open(ctx);
    $('[data-kaart="a1"] [data-f="goedkeuren"]').click();
    await wacht(() => expect($("[data-toast]")).not.toBeNull());
    expect(patches(spy)).toEqual([{ pad: "/dashboard/entries/acties/a1", data: { Status: "Klaar", "Afgerond op": "2026-09-29" } }]);
    expect($("[data-toast]").textContent).toContain("Goedgekeurd.");
    $('[data-toast] [data-act="undo"]').click();
    await wacht(() => expect(patches(spy)).toHaveLength(2));
    expect(patches(spy)[1].data).toEqual({ Status: "Wacht op review", "Afgerond op": null });
  });

  it("een mail van je team: de knop zegt dat jij hem verstuurt", () => {
    open(maakCtx());
    expect($('[data-kaart="a2"] [data-f="goedkeuren"]').textContent).toBe("Goedgekeurd, ik verstuur hem zelf");
  });

  it("terug naar de specialist: Eigenaar én Agent, Gecorrigeerd, en jouw zin als citaat bovenaan", async () => {
    const ctx = maakCtx(); const spy = nepInstantie(ctx);
    open(ctx, "#/voor-jou/a1");
    $('.beslisbalk [data-type="terug"]').click();
    const tekst = $("#sh-tekst");
    tekst.value = "Korter graag";
    tekst.dispatchEvent(new Event("input", { bubbles: true }));
    $('.scrim [data-act="sh-ok"]').click();
    await wacht(() => expect(patches(spy)).toHaveLength(1));
    const p = patches(spy)[0].data;
    expect(p).toMatchObject({ Status: "Open", Eigenaar: DM, Agent: DM, Gecorrigeerd: true, Correctie: "Korter graag" });
    expect(p.Toelichting).toMatch(/^— Opmerking van Sanne Verbeek \(mens\), .*: Korter graag —\n\nDe offerte\./);
    await wacht(() => expect($("[data-toast]")).not.toBeNull()); // de schrijfactie is af vóór de volgende test
  });

  it("terugsturen zonder zin kan niet: het blad zegt wat er ontbreekt en verstuurt niets", () => {
    const ctx = maakCtx(); const spy = nepInstantie(ctx);
    open(ctx, "#/voor-jou/a1");
    $('.beslisbalk [data-type="terug"]').click();
    $('.scrim [data-act="sh-ok"]').click();
    expect($(".scrim .fout").textContent).toContain("Schrijf in één zin");
    expect(spy).not.toHaveBeenCalled();
  });

  it("nee, niet doen: afgerond met de reden, zonder Gecorrigeerd (i25)", async () => {
    const ctx = maakCtx(); const spy = nepInstantie(ctx);
    open(ctx);
    $('[data-kaart="a3"] [data-type="nee"]').click();
    const t = $("#sh-tekst"); t.value = "Marge te laag"; t.dispatchEvent(new Event("input", { bubbles: true }));
    $('.scrim [data-act="sh-ok"]').click();
    await wacht(() => expect(patches(spy)).toHaveLength(1));
    const p = patches(spy)[0].data;
    expect(p).toMatchObject({ Status: "Klaar", Correctie: "Niet doen: Marge te laag" });
    expect(p).not.toHaveProperty("Gecorrigeerd");
    await wacht(() => expect($("[data-toast]")).not.toBeNull()); // de schrijfactie is af vóór de volgende test
  });

  it("ja, doe maar: de specialist wordt eigenaar én agent", async () => {
    const ctx = maakCtx(); const spy = nepInstantie(ctx);
    open(ctx);
    $('[data-kaart="a3"] [data-act="ja"]').click();
    await wacht(() => expect(patches(spy)).toHaveLength(1));
    expect(patches(spy)[0].data).toEqual({ Status: "Open", Eigenaar: DM, Agent: DM });
    await wacht(() => expect($("[data-toast]")).not.toBeNull()); // de schrijfactie is af vóór de volgende test
  });

  it("een fout van de instantie: melding, niets weg, en je kunt het opnieuw proberen", async () => {
    const ctx = maakCtx();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ fout: "Je werkruimte is even niet bereikbaar." }), { status: 503 }));
    open(ctx);
    $('[data-kaart="a1"] [data-f="goedkeuren"]').click();
    await wacht(() => expect($("[data-toast]").textContent).toMatch(/Niet gelukt/));
    expect($('[data-kaart="a1"]')).not.toBeNull();
    expect(ctx.werkBij).not.toHaveBeenCalled();
  });
});

describe("v2 — Acties: wie is aan zet", () => {
  it("vier banen; de baan Jij is precies Voor jou", () => {
    open(maakCtx(), "#/acties");
    const seg = $$('.seg.vol button').map(b => b.textContent);
    expect(seg[0]).toBe("Jij " + g.V2._aanJouZet().length);
    expect(seg.map(s => s.replace(/ \d+$/, ""))).toEqual(["Jij", "Je team", "Wacht", "Afgerond"]);
  });

  it("verplaatsen naar je team vraagt aan wie, en zet Eigenaar én Agent (b61)", async () => {
    const ctx = maakCtx(); const spy = nepInstantie(ctx);
    open(ctx, "#/acties/a4");
    // via Meer → Aan een collega bestaat ook; hier: Geef aan je team
    $('.beslisbalk [data-type="wie"][data-doel="geef"]').click();
    expect($(".scrim h3").textContent).toBe("Geef aan je team");
    $(`.scrim [data-act="sh-kies"][data-v="ag:researcher"]`).click();
    await wacht(() => expect(patches(spy)).toHaveLength(1));
    expect(patches(spy)[0].data).toEqual({ Status: "Open", Eigenaar: RS, Agent: RS });
    await wacht(() => expect($("[data-toast]")).not.toBeNull()); // de schrijfactie is af vóór de volgende test
  });

  it("zoeken gaat ook door wat je team schreef", () => {
    open(maakCtx(), "#/acties");
    const z = $("#acties-zoek"); z.value = "beste peter"; z.dispatchEvent(new Event("input", { bubbles: true }));
    expect($$(".baan .rij").map(r => r.dataset.id)).toEqual(["a2"]);
  });
});

describe("v2 — opdracht geven in drie vragen", () => {
  it("één POST met Eigenaar én Agent, Aangemaakt door jij, Status Open", async () => {
    const ctx = maakCtx(); const spy = nepInstantie(ctx);
    open(ctx, "#/acties");
    $('.werkbalk [data-type="opdracht"]').click();
    const wat = $("#sh-wat"); wat.value = "Zoek tien installatiebedrijven"; wat.dispatchEvent(new Event("input", { bubbles: true }));
    const knop = $('.scrim [data-act="sh-set"][data-k="ag"][data-v="researcher"]');
    if (knop) knop.click();
    else { const ander = $("#sh-ander"); ander.value = "ag:researcher"; ander.dispatchEvent(new Event("change", { bubbles: true })); }
    $('.scrim [data-act="sh-ok"]').click();
    await wacht(() => expect(posts(spy)).toHaveLength(1));
    expect(posts(spy)[0]).toEqual({ domein: "acties", data: expect.objectContaining({ Actie: "Zoek tien installatiebedrijven", Status: "Open", Type: "Taak", Eigenaar: RS, Agent: RS, "Aangemaakt door": "Sanne Verbeek" }) });
    await wacht(() => expect(($("[data-toast]") || {}).textContent).toContain("Doorgegeven aan de Researcher."));
  });
});

describe("v2 — de daglink is alleen-lezen", () => {
  it("geen afhandelknoppen, geen Opdracht, wel de balk met inloggen", () => {
    const meta = document.createElement("meta"); meta.name = "at-oauth"; meta.content = "1"; document.head.appendChild(meta);
    try {
      open(maakCtx({ schrijven: false }));
      expect($('[data-act="doe"], [data-act="ja"], .fab, [data-type="opdracht"]')).toBeNull();
      expect($(".balk.daglink").textContent).toContain("Je kijkt mee met je daglink");
      expect($$('[data-act="login"]').length).toBeGreaterThan(0);
      window.location.hash = "#/acties/a1"; g.V2.hashGewijzigd();
      expect($(".beslisbalk").textContent).toContain("Inloggen en afhandelen");
      expect($('.beslisbalk [data-act="doe"]')).toBeNull();
    } finally { meta.remove(); }
  });
});

describe("v2 — vaste taken", () => {
  const taken = () => [
    rij("v1", { Taak: "Openstaande acties oppakken", Agent: "Management Assistent", Ritme: "dagelijks", Actief: true, "Laatst gedraaid": "2026-09-29T02:10:00", Volgorde: 1 }),
    rij("v2", { Taak: "Facturen nalopen", Agent: "Administratie", Ritme: "wekelijks-vr", Actief: true, "Laatst gedraaid": "2026-09-26T02:12:00", Volgorde: 2 }),
  ];
  it("aan/uit en het ritme zijn elk één PATCH, met ongedaan maken", async () => {
    const ctx = maakCtx({ ritmetaken: taken() }); const spy = nepInstantie(ctx);
    open(ctx, "#/team/vaste-taken");
    $('[data-act="taak-aan"][data-id="v2"]').click();
    await wacht(() => expect(patches(spy)).toHaveLength(1));
    expect(patches(spy)[0]).toEqual({ pad: "/dashboard/entries/ritmetaken/v2", data: { Actief: false } });
    await wacht(() => expect(($("[data-toast]") || {}).textContent).toContain("staat uit"));
    const s = $("#ritme-v1"); s.value = "wekelijks-wo"; s.dispatchEvent(new Event("change", { bubbles: true }));
    await wacht(() => expect(patches(spy)).toHaveLength(2));
    expect(patches(spy)[1].data).toEqual({ Ritme: "wekelijks-wo" });
    await wacht(() => expect(($("[data-toast]") || {}).textContent).toContain("draait nu elke woensdag"));
  });

  it("het weekoverzicht telt per werkdag, zonder weekend", () => {
    open(maakCtx({ ritmetaken: taken() }), "#/team/vaste-taken");
    expect($$(".wdag .dn").map(d => d.textContent)).toEqual(["ma", "di", "wo", "do", "vr"]);
    expect($$(".wdag .aantal").map(d => d.textContent)).toEqual(["1", "1", "1", "1", "2"]);
  });
});

describe("v2 — Gegevens", () => {
  const orgs = () => [rij("o1", { Naam: "Van Dam Bouw", Fase: "Lead", Vestigingsplaats: "Utrecht" })];
  it("één veld wijzigen is één PATCH met alleen dat veld", async () => {
    const ctx = maakCtx({ organisaties: orgs() }); const spy = nepInstantie(ctx);
    open(ctx, "#/gegevens/organisaties/o1");
    expect($("#rij-titel").textContent).toBe("Van Dam Bouw");
    $('[data-act="veld-wijzig"][data-v="Vestigingsplaats"]').click();
    const invoer = $(".inline-edit [data-veldtype]"); invoer.value = "Amersfoort";
    $("[data-v2-veldform]").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await wacht(() => expect(patches(spy)).toHaveLength(1));
    expect(patches(spy)[0]).toEqual({ pad: "/dashboard/entries/organisaties/o1", data: { Vestigingsplaats: "Amersfoort" } });
    await wacht(() => expect($("[data-toast]")).not.toBeNull()); // de schrijfactie is af vóór de volgende test
  });

  it("niets veranderd: niets versturen", () => {
    const ctx = maakCtx({ organisaties: orgs() }); const spy = nepInstantie(ctx);
    open(ctx, "#/gegevens/organisaties/o1");
    $('[data-act="veld-wijzig"][data-v="Fase"]').click();
    $("[data-v2-veldform]").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(spy).not.toHaveBeenCalled();
    expect($("[data-toast]").textContent).toContain("Niets gewijzigd");
  });
});

describe("v2 — tekst uit de werkruimte is nooit HTML", () => {
  it("een titel met een script blijft tekst, overal waar hij staat", () => {
    const boos = '<img src=x onerror="window.__lek=1">Boos';
    const ctx = maakCtx({
      acties: [rij("x1", { Actie: boos, Status: "Wacht op review", Eigenaar: "Sanne Verbeek", Agent: DM, "Aangemaakt door": DM, Toelichting: boos })],
      organisaties: [rij("o1", { Naam: boos })],
    });
    for (const hash of ["#/", "#/acties", "#/acties/x1", "#/gegevens/organisaties", "#/gegevens/organisaties/o1"]) {
      open(ctx, hash);
      expect(document.querySelector("#root img"), hash).toBeNull();
      expect(document.getElementById("root").textContent, hash).toContain("Boos");
    }
    expect(window.__lek).toBeUndefined();
  });
});
