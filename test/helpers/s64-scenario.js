/* s64 — één vaste werkruimte met rijen in het werkgeheugen (teamfeed,
 * notities, lessen_inzichten, dagverslagen) plus rijen in andere domeinen
 * (besluit f van 26-11: de stempel staat op elke rij die iemand schrijft):
 * twee acties, een vaste taak, een organisatie en een contactpersoon. Dezelfde scenario's dienen voor de opname van main
 * (test/fixtures/s64-herkomst-main.json) en voor de test die daarmee vergelijkt
 * (test/s64-herkomst.test.js); daarom staat het hier apart.
 *
 * `door(id)` geeft per entry de waarde van het meta-veld `geschreven_door`
 * (of undefined: dan staat het veld er niet). Tijden zijn lokaal (zonder Z),
 * zodat de render niet van de tijdzone van de machine afhangt. */

export const NU = new Date(2026, 10, 26, 9, 30);

export const ROUTES = [
  "/team",
  "/team/agent/dealmaker",
  "/acties/a1",
  "/gegevens/organisaties/o1",
  "/gegevens/notities",
  "/gegevens/notities/n1",
  "/gegevens/lessen_inzichten",
  "/gegevens/lessen_inzichten/l1",
  "/gegevens/dagverslagen/d1",
  // Besluit f: ook buiten het werkgeheugen.
  "/",
  "/acties",
  "/team/vaste-taken",
  "/gegevens/contactpersonen",
  "/gegevens/contactpersonen/c1",
];

const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (scope) => `kop.${b64({ scope, sub: "at_test#seat1" })}.handtekening`;

/* Eén entry zoals /dashboard/entries hem geeft: met de modus aan staat
 * `geschreven_door` direct naast het entryId. */
function entry(domein, entryId, data, tijd, door) {
  const e = { domein, entryId };
  if (door !== undefined) e.geschreven_door = door;
  return Object.assign(e, { data, aangemaakt: tijd, bijgewerkt: tijd });
}

export function entries(g, door = () => undefined) {
  const naam = (slug) => g.AGENTIC_TEAM_SCHEMA.agents.find((a) => a.slug === slug).displayName;
  const DM = naam("dealmaker"), OS = naam("outreach-specialist"), CO = naam("orchestrator");
  const e = (domein, id, data, tijd) => entry(domein, id, data, tijd, door(id));
  return {
    acties: [
      e("acties", "a1", { Actie: "Offerte Van Dam", Status: "Wacht op review", Eigenaar: "Sanne Verbeek", Agent: DM, "Aangemaakt door": DM, Toelichting: "De offerte.", Organisatie: [{ domein: "organisaties", id: "o1", titel: "Van Dam Bouw" }] }, "2026-11-26T02:18:00"),
      e("acties", "a2", { Actie: "Prijs nakijken", Status: "Open", Eigenaar: DM, Agent: DM, "Aangemaakt door": "Sanne Verbeek", "Bovenliggende actie": [{ domein: "acties", id: "a1", titel: "Offerte Van Dam" }] }, "2026-11-25T16:00:00"),
    ],
    contactpersonen: [
      e("contactpersonen", "c1", { Naam: "Peter van Dam", Functie: "Directeur", Organisatie: [{ domein: "organisaties", id: "o1", titel: "Van Dam Bouw" }] }, "2026-11-21T10:00:00"),
    ],
    organisaties: [
      e("organisaties", "o1", { Naam: "Van Dam Bouw", Fase: "Klant", Vestigingsplaats: "Utrecht" }, "2026-11-20T10:00:00"),
    ],
    ritmetaken: [
      e("ritmetaken", "v1", { Taak: "Openstaande acties oppakken", Agent: "Management Assistent", Ritme: "dagelijks", Actief: true, "Laatst gedraaid": "2026-11-26T02:10:00", Volgorde: 1 }, "2026-11-01T10:00:00"),
    ],
    notities: [
      e("notities", "n1", { Onderwerp: "Belafspraak", Notitie: "Peter belt dinsdag terug.", Datum: "2026-11-25", Auteur: "Sanne Verbeek", Soort: "Notitie", Betreft: [{ domein: "organisaties", id: "o1", titel: "Van Dam Bouw" }] }, "2026-11-25T11:00:00"),
      e("notities", "n2", { Onderwerp: "", Notitie: "Graag de korting eruit.", Datum: "2026-11-26", Auteur: "Janine", Soort: "Opmerking", Betreft: [{ domein: "acties", id: "a1", titel: "Offerte Van Dam" }] }, "2026-11-26T08:00:00"),
      e("notities", "n3", { Onderwerp: "", Notitie: "Zonder auteur en datum.", Betreft: [{ domein: "organisaties", id: "o1", titel: "Van Dam Bouw" }] }, "2026-11-24T08:00:00"),
    ],
    lessen_inzichten: [
      e("lessen_inzichten", "l1", { Les: "Offertes op vrijdag blijven liggen", Agent: DM, Categorie: "Proces", Datum: "2026-11-24", Status: "Nieuw" }, "2026-11-24T09:00:00"),
      e("lessen_inzichten", "l2", { Les: "Les zonder kenmerken" }, "2026-11-23T09:00:00"),
    ],
    dagverslagen: [
      e("dagverslagen", "d1", { Naam: "Dagstart 26 november", Verslag: "Drie dingen voor je.", Type: "Dagstart", Dag: "2026-11-26" }, "2026-11-26T07:00:00"),
    ],
    teamfeed: [
      e("teamfeed", "f1", { Agent: DM, Soort: "afgerond", Bericht: "Offerte Van Dam klaargezet.", Actie: "Offerte" }, "2026-11-26T02:20:00"),
      e("teamfeed", "f2", { Agent: "outreach-specialist", Soort: "update", Bericht: "Follow-up Jansen geschreven.", Link: "https://voorbeeld.nl/x" }, "2026-11-26T02:30:00"),
      e("teamfeed", "f3", { Agent: CO, Soort: "rondestart", Bericht: "Werkronde gestart." }, "2026-11-26T02:00:00"),
      e("teamfeed", "f4", { Agent: "Onbekende Hulp", Soort: "update", Bericht: "Iets zonder bekende agent." }, "2026-11-25T15:00:00"),
      e("teamfeed", "f5", { Agent: OS, Soort: "update", Bericht: "Gisteren nog iets." }, "2026-11-25T14:00:00"),
    ],
  };
}

export function maakCtx(g, ents, { notion = false } = {}) {
  const domains = {};
  for (const k of ["acties", "organisaties", "contactpersonen", "ritmetaken", "notities", "lessen_inzichten", "dagverslagen"]) {
    domains[k] = { rows: ents[k].map((x) => g.rijVanEntry(x)) };
  }
  const teamfeed = { entries: ents.teamfeed, opgehaaldOp: "2026-11-26T09:30:00" };
  const bundle = notion
    ? { kind: "metrics", source: "werkruimte", klant: "FFG", systeemPerDomein: { acties: "notion", ritmetaken: "notion" }, domains: {}, instantieDomeinen: [], teamfeed }
    : { kind: "rows", source: "werkruimte", klant: "Verbeek Advies", systeemPerDomein: {}, domains, instantieDomeinen: Object.keys(domains), teamfeed };
  const ctx = {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU, periodWeeks: 12, minutenPerActie: 25,
    bron: { oauth: true, token: token("dashboard:lees dashboard:schrijf"), instantieUrl: "https://connector.example" },
    kanSchrijven: true, herlaad: () => {}, werkBij: () => true, bundelWaarschuwingen: [], bundle,
  };
  if (notion) ctx.metricsWerk = { voorJou: null, ritmetaken: null, gegenereerdOp: "2026-11-26T07:02:00" };
  return ctx;
}

/* Tekent één route en geeft de html van #root terug. */
export function render(g, ctx, route) {
  document.body.innerHTML = '<div id="root"></div><div id="melding" hidden></div><div id="live"></div>';
  window.localStorage.setItem("agentic-team-dashboard:naam:at_test#seat1", "Sanne Verbeek");
  window.location.hash = "#" + route;
  g.V2._reset();
  g.V2.start({});
  g.V2.toon(ctx);
  return document.getElementById("root").innerHTML;
}
