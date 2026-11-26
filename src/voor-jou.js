/* f46 — één definitie van "aan jou".
 *
 * Dashboard v2 opent op "Voor jou": een genummerde werkbak met wat er op jou
 * wacht. Die telling komt straks op vier plekken terug — de badge op de tab,
 * de lijst zelf, de baan "Jij" op Acties en de klaar-check. Tellen die vier
 * verschillend, dan gelooft niemand er nog één. Daarom woont de definitie hier,
 * één keer, en rekent alles ermee.
 *
 * Wat hoort bij een mens (hoortBijMens):
 *   - f44 (a): Status "Wacht op review" en de eigenaar is geen agent;
 *   - f44 (b): een agent zette het klaar ("Aangemaakt door") en de eigenaar
 *     is geen agent — de ritmetaken schrijven Open met de mens als eigenaar;
 *   - een Voorstel: dat wacht altijd op een mens, ook als een specialist het
 *     straks uitvoert;
 *   - te laat: over de deadline en op naam van een mens (of van niemand);
 *   - weer aan de beurt: Wacht, de "Wachten tot" is voorbij, en het ligt niet
 *     bij een agent (dan wekt het werkmoment hem zelf).
 *
 * Van wie (vanMij, besluit 30-09 "per persoon"): wat op jouw naam staat, plus
 * wat op niemands naam staat ("voor iedereen"), plus een voorstel van een
 * specialist. Wat op naam van een collega staat, staat apart (bijCollegas).
 * Sinds f62 bepaalt de eigenaarsketen (eigenaarVan, hieronder) op wiens naam
 * iets staat: een actie zonder eigenaar bij Tijmens project is van Tijmen.
 * Weet het dashboard niet wie je bent (geen naam gekozen, of de daglink), dan
 * telt alles wat bij een mens hoort — liever een collega's stuk te veel in
 * beeld dan een stille berg.
 *
 * Geen agentlijst in het schema = niets tonen, nooit gokken (zelfde regel als
 * teamOogstRijen en correctievrij). */

const VJ_KLAAR = "Klaar";
const VJ_REVIEW = "Wacht op review";
const VJ_VOORSTEL = "Voorstel";
const VJ_WACHT = "Wacht";
const VJ_OPEN = "Open";
const VJ_BEZIG = "Bezig";
const VJ_STILLE_BERG = 10;

function vjTekst(rij, veld) {
  const v = getField(rij, veld);
  return v === undefined || v === null ? "" : String(v).trim();
}

function vjDag(v) {
  const d = parseDateField(v);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function vjVandaag(nu) {
  const d = nu instanceof Date ? nu : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function vjIsAgent(waarde, namen) { return isAgentNaam(waarde, namen); }
function vjMensOfLeeg(waarde, namen) { return !waarde || !vjIsAgent(waarde, namen); }

function naamGelijk(a, b) {
  const n = (s) => normAgentNaam(s).replace(/\s+/g, " ");
  return !!a && !!b && n(a) === n(b);
}

function vjVerlopen(rij, nu) {
  const tot = vjDag(getField(rij, "Wachten tot"));
  return !!tot && tot <= vjVandaag(nu);
}

function isTeLaat(rij, namen, nu) {
  if (vjTekst(rij, "Status") === VJ_KLAAR) return false;
  const deadline = vjDag(getField(rij, "Deadline"));
  return !!deadline && deadline < vjVandaag(nu) && vjMensOfLeeg(vjTekst(rij, "Eigenaar"), namen);
}

/* i85: de rol van een status komt uit de registry (acties.Status.opties_meta,
 * vanaf registry 1.92.0): voorstel, open, bezig, wacht, check of klaar. Zo
 * hardcodeert het dashboard geen statusnamen. Draagt het schema die sleutel
 * nog niet (tot de sync), dan geldt deze terugval — dezelfde indeling. */
const STATUS_ROL_TERUGVAL = { [VJ_VOORSTEL]: "voorstel", [VJ_OPEN]: "open", [VJ_BEZIG]: "bezig", [VJ_WACHT]: "wacht", [VJ_REVIEW]: "check", [VJ_KLAAR]: "klaar" };
function statusRol(status, schema) {
  const s = schema || (typeof AGENTIC_TEAM_SCHEMA !== "undefined" ? AGENTIC_TEAM_SCHEMA : null);
  const dom = s && s.datadomeinen && s.datadomeinen.acties;
  const veld = dom && Array.isArray(dom.velden) ? dom.velden.find(v => v.naam === "Status") : null;
  const meta = veld && veld.opties_meta && veld.opties_meta[status];
  return (meta && meta.rol) || STATUS_ROL_TERUGVAL[status] || null;
}

/* Koppeltabel rol → soort. Elke rol uit de registry staat hier; een status
 * zonder (bekende) rol maakt test/i85-rol-uit-registry.test.js rood in plaats
 * van dat hij stil als "klopt niet" in beeld komt. */
const SOORT_PER_ROL = {
  klaar: () => "klaar",
  voorstel: () => "voorstel",
  // Wacht op review op naam van een agent is volgens het statuscontract een
  // fout-toestand: niemand is dan aan zet.
  check: (rij, namen) => (vjMensOfLeeg(vjTekst(rij, "Eigenaar"), namen) ? "check" : "klopt-niet"),
  wacht: (rij, namen, nu) => {
    if (!vjVerlopen(rij, nu)) return "wacht";
    return vjIsAgent(vjTekst(rij, "Eigenaar"), namen) ? "team" : "weer";
  },
  open: (rij, namen) => {
    if (vjIsAgent(vjTekst(rij, "Eigenaar"), namen)) return "team";
    return vjTekst(rij, "Type") === "Alert" ? "signaal" : "taak";
  },
  bezig: (rij, namen) => (vjIsAgent(vjTekst(rij, "Eigenaar"), namen) ? "team" : "taak"),
};

/* Status → regel, via de rol: precies de statussen uit de registry die een
 * bekende rol hebben. */
const SOORT_PER_STATUS = (() => {
  const s = typeof AGENTIC_TEAM_SCHEMA !== "undefined" ? AGENTIC_TEAM_SCHEMA : null;
  const dom = s && s.datadomeinen && s.datadomeinen.acties;
  const veld = dom && Array.isArray(dom.velden) ? dom.velden.find(v => v.naam === "Status") : null;
  const statussen = veld && Array.isArray(veld.opties) ? veld.opties : Object.keys(STATUS_ROL_TERUGVAL);
  const uit = {};
  for (const st of statussen) { const regel = SOORT_PER_ROL[statusRol(st, s)]; if (regel) uit[st] = regel; }
  return uit;
})();

const SOORT_LABEL = {
  check: "Klaar om te checken",
  voorstel: "Voorstel",
  signaal: "Signaal",
  taak: "Taak",
  weer: "Weer aan de beurt",
  team: "Bij je team",
  wacht: "Wacht",
  klaar: "Afgerond",
  "klopt-niet": "Klopt niet helemaal",
};

function soortVan(rij, namen, nu) {
  const regel = SOORT_PER_STATUS[vjTekst(rij, "Status")];
  return regel ? regel(rij, namen, nu) : "klopt-niet";
}

/* f47 "Later": een datum in "Wachten tot" haalt een item tot die dag uit je
 * lijst, zonder de status te veranderen. Voor Status Wacht is dat de gewone
 * wektijd (zie hieronder); voor elke andere status betekent het: nu even niet. */
function wachtInToekomst(rij, nu) {
  const tot = vjDag(getField(rij, "Wachten tot"));
  return !!tot && tot > vjVandaag(nu);
}

function hoortBijMens(rij, namen, nu) {
  const status = vjTekst(rij, "Status");
  const eigenaar = vjTekst(rij, "Eigenaar");
  if (status === VJ_KLAAR) return false;
  if (status !== VJ_WACHT && wachtInToekomst(rij, nu)) return false;
  if (status === VJ_REVIEW) return vjMensOfLeeg(eigenaar, namen);
  if (status === VJ_VOORSTEL) return true;
  if (status === VJ_WACHT) return vjVerlopen(rij, nu) && vjMensOfLeeg(eigenaar, namen);
  if (status === VJ_OPEN || status === VJ_BEZIG) {
    if (!vjMensOfLeeg(eigenaar, namen)) return false;
    return vjIsAgent(vjTekst(rij, "Aangemaakt door"), namen) || isTeLaat(rij, namen, nu);
  }
  return false;
}

/* ── f62: de eigenaarsketen ────────────────────────────────────────────
 *
 * Van wie is een actie? Besluit 26-11-2026: de eerste treffer wint.
 *   1. de Eigenaar van de actie, als dat een mens is;
 *   2. de Eigenaar van het gekoppelde Project;
 *   3. de Eigenaar van de gekoppelde Deal (sales_funnel);
 *   4. de Eigenaar van de gekoppelde Organisatie (direct, of via de
 *      Organisatie van de gekoppelde Contactpersoon);
 *   5. wie verantwoordelijk is voor de Agent van de actie — alleen als een
 *      bron dat zegt (opties.agentMens); het dashboard kent die koppeling
 *      zelf niet, en dan slaat het deze stap over;
 *   6. niemand: "onverdeeld", en dat ziet iedereen.
 * Belt Tijmens relatie, dan doet Yoram de sales niet, ook al zijn de
 * sales-agents "van hem" (Yoram). Een agent als Eigenaar blijft voor de
 * status "je team is aan zet" (soortVan, hoortBijMens, ongewijzigd); bij een
 * Voorstel op naam van een agent zoekt de keten vanaf stap 2 de mens die moet
 * beslissen.
 *
 * Relaties staan in een rij als {id, titel} (of een lijst daarvan). Een
 * afgeschermde relatie komt als de tekst "[afgeschermd]" binnen, en van een
 * domein dat je niet mag lezen zijn er geen rijen: alleen objecten met een id
 * tellen. Eigenaar is op projecten, deals en organisaties van het type
 * mensen: een lijst namen, of één tekst met komma's. */
const VJ_AFGESCHERMD = /^\[afgeschermd\]$/i;
const VJ_KETEN_DOMEINEN = ["projecten", "sales_funnel", "organisaties", "contactpersonen"];

/* Opzoektabel per domein (entryId → rij), één keer per bundel per aanroep. */
function eigenaarIndex(bundle) {
  const index = {};
  for (const d of VJ_KETEN_DOMEINEN) {
    const m = new Map();
    const lijst = bundle && bundle.domains ? rows(bundle, d) : null;
    for (const r of lijst || []) if (r && r.__entryId) m.set(String(r.__entryId), r);
    index[d] = m;
  }
  return index;
}

/* De mensen in een Eigenaar-waarde, zonder agents en zonder afgeschermd. */
function vjMensenIn(waarde, namen) {
  const ruw = Array.isArray(waarde) ? waarde : (waarde === undefined || waarde === null ? [] : [waarde]);
  const uit = [];
  for (const w of ruw) {
    if (typeof w !== "string" && typeof w !== "number") continue;
    for (const deel of String(w).split(",")) {
      const n = deel.trim();
      if (!n || VJ_AFGESCHERMD.test(n) || vjIsAgent(n, namen)) continue;
      if (!uit.some(x => naamGelijk(x, n))) uit.push(n);
    }
  }
  return uit;
}

function vjRelatieRij(rij, veld, index, domein) {
  const w = getField(rij, veld);
  const v = Array.isArray(w) ? w.find(x => x && typeof x === "object" && x.id) : w;
  if (!v || typeof v !== "object" || !v.id) return null; // "[afgeschermd]" of los tekst: telt niet
  const m = index && index[domein];
  return (m && m.get(String(v.id))) || null;
}

/* Wie is eigenaar? Een tekst (meerdere mensen met ", " ertussen), of "" voor
 * onverdeeld. o = {namen, index? of bundle?, agentMens?(agentWaarde) → naam}. */
function eigenaarVan(rij, o) {
  const ctx = o || {};
  const namen = ctx.namen;
  const eigen = vjMensenIn(vjTekst(rij, "Eigenaar"), namen);
  if (eigen.length) return eigen.join(", ");
  const index = ctx.index || (ctx.bundle ? eigenaarIndex(ctx.bundle) : null);
  if (index) {
    const uit = (r) => (r ? vjMensenIn(getField(r, "Eigenaar"), namen) : []);
    for (const [veld, domein] of [["Project", "projecten"], ["Deal", "sales_funnel"], ["Organisatie", "organisaties"]]) {
      const l = uit(vjRelatieRij(rij, veld, index, domein));
      if (l.length) return l.join(", ");
    }
    const cp = vjRelatieRij(rij, "Contactpersoon", index, "contactpersonen");
    const l = uit(cp ? vjRelatieRij(cp, "Organisatie", index, "organisaties") : null);
    if (l.length) return l.join(", ");
  }
  if (typeof ctx.agentMens === "function") {
    const agent = vjTekst(rij, "Agent");
    const l = agent ? vjMensenIn(ctx.agentMens(agent), namen) : [];
    if (l.length) return l.join(", ");
  }
  return "";
}

/* Hoort `ik` bij deze eigenaar(s)? */
function isEigenaar(wie, ik) {
  if (!wie || !ik) return false;
  return String(wie).split(",").some(n => naamGelijk(n.trim(), ik));
}

/* Mag een rij überhaupt bij een mens horen? Een agent als Eigenaar is "je
 * team is aan zet", behalve bij een Voorstel: daar beslist een mens. */
function vjBijAgent(rij, namen) {
  const eigenaar = vjTekst(rij, "Eigenaar");
  return !!eigenaar && vjIsAgent(eigenaar, namen) && vjTekst(rij, "Status") !== VJ_VOORSTEL;
}

function vanMij(rij, ik, namen, keten) {
  if (vjBijAgent(rij, namen)) return false;
  if (!ik) return true; // onbekend wie je bent: niets verstoppen
  const wie = eigenaarVan(rij, Object.assign({}, keten, { namen }));
  if (!wie) return true; // onverdeeld: voor iedereen
  return isEigenaar(wie, ik);
}

/* Sinds wanneer ligt het er? Voor "Wacht" de wektijd; anders de stempel van
 * de instantie (f46: rijVanEntry bewaart die), en zonder stempel de deadline. */
function sindsVan(rij) {
  if (vjTekst(rij, "Status") === VJ_WACHT && getField(rij, "Wachten tot")) return parseDateField(getField(rij, "Wachten tot"));
  const st = rij && rij.__stempels;
  return parseDateField((st && (st.bijgewerkt || st.aangemaakt)) || getField(rij, "Deadline"));
}

function vjTijd(d) { return d ? d.getTime() : Number.MAX_SAFE_INTEGER; }

/* De volgorde: te laat eerst (vroegste deadline boven), dan wat vandaag of
 * morgen af moet, dan Hoog, dan de rest — binnen elke groep het oudste boven.
 * Bij meer dan tien is het een stille berg, en dan gaat het oudste voor. */
function sorteerVoorJou(lijst, namen, nu) {
  const morgen = new Date(vjVandaag(nu).getTime() + 86400000);
  const rang = (rij) => {
    const deadline = vjDag(getField(rij, "Deadline"));
    if (isTeLaat(rij, namen, nu)) return [0, vjTijd(deadline)];
    if (deadline && deadline <= morgen) return [1, vjTijd(deadline)];
    if (vjTekst(rij, "Prioriteit") === "Hoog") return [2, vjTijd(sindsVan(rij))];
    return [3, vjTijd(sindsVan(rij))];
  };
  const kopie = lijst.slice();
  if (kopie.length > VJ_STILLE_BERG) return kopie.sort((a, b) => vjTijd(sindsVan(a)) - vjTijd(sindsVan(b)));
  return kopie.sort((a, b) => { const x = rang(a), y = rang(b); return x[0] - y[0] || x[1] - y[1]; });
}

/* Dé functie. Geeft de rijen die op jou wachten, in werkvolgorde — of null
 * als het niet te bepalen is (geen acties, of geen agentlijst). */
function aanJouZet(bundle, schema, opties) {
  const o = opties || {};
  const acties = rows(bundle, "acties");
  if (!acties) return null;
  const namen = agentNamen(schema);
  if (!namen) return null;
  const nu = o.nu || new Date();
  const keten = { index: eigenaarIndex(bundle), agentMens: o.agentMens };
  return sorteerVoorJou(acties.filter(r => hoortBijMens(r, namen, nu) && vanMij(r, o.ik, namen, keten)), namen, nu);
}

/* De andere banen van Acties rekenen met dezelfde bouwstenen, zodat een rij
 * nooit in twee banen tegelijk staat of in geen enkele verdwijnt. Een
 * collega is eigenaar via de keten (f62), niet alleen via het veld zelf. */
function bijCollegas(bundle, schema, opties) {
  const o = opties || {};
  const acties = rows(bundle, "acties");
  const namen = agentNamen(schema);
  if (!acties || !namen || !o.ik) return [];
  const keten = { namen, index: eigenaarIndex(bundle), agentMens: o.agentMens };
  return acties.filter(r => {
    if (vjTekst(r, "Status") === VJ_KLAAR || vjBijAgent(r, namen)) return false;
    const wie = eigenaarVan(r, keten);
    return !!wie && !isEigenaar(wie, o.ik);
  });
}

function bijTeam(bundle, schema, opties) {
  const o = opties || {};
  const acties = rows(bundle, "acties");
  const namen = agentNamen(schema);
  if (!acties || !namen) return [];
  const nu = o.nu || new Date();
  return acties.filter(r => soortVan(r, namen, nu) === "team");
}

function kloptNiet(bundle, schema, opties) {
  const o = opties || {};
  const acties = rows(bundle, "acties");
  const namen = agentNamen(schema);
  if (!acties || !namen) return [];
  const nu = o.nu || new Date();
  return acties.filter(r => soortVan(r, namen, nu) === "klopt-niet");
}

/* ── f48: de banen van Acties ──────────────────────────────────────────
 *
 * Elke actie staat in precies één baan — nooit in twee, nooit in geen. De
 * volgorde van de regels hieronder is de voorrang:
 *   afgerond   Status Klaar
 *   klopt-niet niemand is echt aan zet (soortVan)
 *   wacht      een wektijd in de toekomst ("Later"), of Wacht die nog loopt
 *   jij        precies de werkbak van Voor jou (hoortBijMens + vanMij)
 *   team       een agent is aan zet
 *   zonder     niemands naam, en het wacht (nog) niet op een mens
 *   jij-later  je eigen taken zonder haast ("Later op je lijst")
 *   collega    op naam van een collega
 * Weet het dashboard niet wie je bent, dan is alles van een mens "jij" of
 * "jij-later" — zelfde regel als aanJouZet: niets verstoppen. */
const BANEN = ["jij", "jij-later", "team", "wacht", "afgerond", "collega", "zonder", "klopt-niet"];

function baanVan(rij, o) {
  const status = vjTekst(rij, "Status");
  if (status === VJ_KLAAR) return "afgerond";
  const soort = soortVan(rij, o.namen, o.nu);
  if (soort === "klopt-niet") return "klopt-niet";
  if (soort === "wacht" || (status !== VJ_WACHT && wachtInToekomst(rij, o.nu))) return "wacht";
  if (hoortBijMens(rij, o.namen, o.nu) && vanMij(rij, o.ik, o.namen, o)) return "jij";
  if (soort === "team") return "team";
  // f62: van wie het is, volgt de eigenaarsketen (project, deal, organisatie).
  const wie = eigenaarVan(rij, o);
  if (!wie) return "zonder";
  if (!o.ik || isEigenaar(wie, o.ik)) return "jij-later";
  return "collega";
}

/* Alle banen in één keer, elk in werkvolgorde. Null zonder acties of zonder
 * agentlijst (zelfde regel als aanJouZet). */
function banenVan(bundle, schema, opties) {
  const o = opties || {};
  const acties = rows(bundle, "acties");
  if (!acties) return null;
  const namen = agentNamen(schema);
  if (!namen) return null;
  const nu = o.nu || new Date();
  const ctx = { ik: o.ik, namen, nu, index: eigenaarIndex(bundle), agentMens: o.agentMens };
  const banen = {};
  for (const b of BANEN) banen[b] = [];
  for (const r of acties) banen[baanVan(r, ctx)].push(r);
  banen.jij = sorteerVoorJou(banen.jij, namen, nu);
  const opDatum = (veld, richting) => (a, b) => richting * (vjTijd(vjDag(getField(a, veld))) - vjTijd(vjDag(getField(b, veld))));
  banen["jij-later"].sort(opDatum("Deadline", 1));
  banen.wacht.sort(opDatum("Wachten tot", 1));
  // Afgerond: nieuwste boven. Zonder datum onderaan.
  banen.afgerond.sort((a, b) => {
    const x = vjDag(getField(a, "Afgerond op")), y = vjDag(getField(b, "Afgerond op"));
    return (y ? y.getTime() : 0) - (x ? x.getTime() : 0);
  });
  return banen;
}

/* ── f47: afhandelen ────────────────────────────────────────────────────
 *
 * Welke knoppen horen bij een item, en wat schrijft elke knop? Alles hier is
 * puur: een patch en een zin voor de meldingsregel. Het item-blad (en straks
 * de kaarten in Voor jou) voeren het uit via PATCH, met ongedaan maken.
 *
 * i25 loopt hier dwars doorheen en is daarom per knop uitgeschreven:
 * - een mens die afrondt laat "Afgerond door" leeg (dat is de markering voor
 *   werk dat een agent zelf afrondde);
 * - "Nee, niet doen" zet Gecorrigeerd níet: afwijzen is geen correctie van
 *   het werk. De reden gaat in Correctie als "Niet doen: …", en isNietDoen()
 *   houdt het buiten opbrengst en tijdwinst;
 * - "Toch weer openen" laat Afgerond door en Afgerond op staan: juist daaraan
 *   ziet de correctievrij-meting dat een autonoom afgeronde actie heropend is. */

const OPMERKING_KOP = /^— Opmerking van[^\n]*—\n\n/;

function vjIsoDag(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function vjDatumKort(d) {
  const dag = d instanceof Date ? d : vjDag(d);
  return dag ? dag.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }) : "";
}

/* De weergavenaam van een agent, of null als de waarde geen agent is. */
function agentWeergaveNaam(schema, waarde) {
  const n = normAgentNaam(waarde);
  if (!n) return null;
  const lijst = (schema && schema.agents) || [];
  const a = lijst.find(x => normAgentNaam(x.displayName) === n || normAgentNaam(x.slug) === n || normAgentNaam(x.naam) === n);
  return a ? (a.displayName || a.naam) : null;
}

/* Welke specialist hoort bij dit item? Wie het uitvoert (Agent), anders wie
 * het klaarzette, anders de eigenaar — zolang dat een agent is. */
function specialistVanRij(rij, schema) {
  for (const veld of ["Agent", "Aangemaakt door", "Eigenaar"]) {
    const naam = agentWeergaveNaam(schema, vjTekst(rij, veld));
    if (naam) return naam;
  }
  return null;
}

/* Morgen (of de eerstvolgende werkdag), vrijdag, maandag, over een week. */
function datumKeuzes(nu) {
  const vandaag = vjVandaag(nu);
  const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const volgende = (dagNr) => { let d = plus(vandaag, 1); while (d.getDay() !== dagNr) d = plus(d, 1); return d; };
  let werkdag = plus(vandaag, 1);
  while (werkdag.getDay() === 0 || werkdag.getDay() === 6) werkdag = plus(werkdag, 1);
  const morgenLabel = werkdag.getTime() === plus(vandaag, 1).getTime()
    ? "Morgen" : werkdag.toLocaleDateString("nl-NL", { weekday: "long" }).replace(/^./, c => c.toUpperCase());
  const lijst = [[morgenLabel, werkdag], ["Vrijdag", volgende(5)], ["Maandag", volgende(1)], ["Over een week", plus(vandaag, 7)]];
  const gezien = new Set();
  return lijst.filter(([, d]) => { const k = vjIsoDag(d); if (gezien.has(k)) return false; gezien.add(k); return true; })
    .map(([label, d]) => ({ label, datum: vjIsoDag(d) }));
}

function afgerondPatch(rij, nu) {
  const patch = { Status: VJ_KLAAR, "Afgerond op": vjIsoDag(vjVandaag(nu)) };
  if (vjTekst(rij, "Afgerond door")) patch["Afgerond door"] = null; // i25: een mens rondt af
  if (getField(rij, "Wachten tot")) patch["Wachten tot"] = null;
  return patch;
}

/* ── i90/i91: de Toelichting als logboek ────────────────────────────────
 *
 * In de werkruimte staat alles wat bij een actie gebeurt in de Toelichting.
 * Je team zet zijn resultaat eronder, onder een vaste kop ("## Resultaat —
 * 2026-10-12 — Dealmaker", werkronde.md), en een mens zet er een regel met
 * een datum onder. Het nieuwste staat dus onderaan.
 *
 * toelichtingStukken() knipt zo'n tekst in stukken die elk met een datum
 * beginnen; wat ervóór staat, is de beschrijving. Een stuk begint bij:
 * - een kop (#) met een datum erin;
 * - een regel die met een datum begint, eventueel na een woord als "Update"
 *   of een weekdag. Zonder jaartal of maandnaam moet er een leesteken achter
 *   de datum staan ("12-10: belde"), zodat "3-4 weken" geen stuk begint;
 * - nooit bij een datum die nog moet komen: een logboek kijkt terug, een
 *   planning ("14-11: oplevering") vooruit.
 * Heeft de tekst zulke koppen, dan begint een gewone regel alleen een stuk na
 * een witregel. Een tijdlijn ín een resultaat blijft zo bij dat resultaat. */
const VJ_MAANDEN = { jan: 0, januari: 0, feb: 1, febr: 1, februari: 1, mrt: 2, maart: 2, apr: 3, april: 3, mei: 4,
  jun: 5, juni: 5, jul: 6, juli: 6, aug: 7, augustus: 7, sep: 8, sept: 8, september: 8, okt: 9, oktober: 9,
  nov: 10, november: 10, dec: 11, december: 11 };
const VJ_KOP = /^\s{0,3}#{1,6}\s/;
// Wat vóór de datum mag staan: opsommingstekens en haken, een logwoord, een weekdag.
const VJ_VOORLOOP = new RegExp("^[\\s>*_\\-–—•·\\[(]*"
  + "(?:(?:update|notitie|opmerking|stand|status|voortgang|log|verslag|gesprek|contact|afgerond|gedaan|nb)\\b\\.?:?\\s*(?:(?:van|op|per)\\s+)?[(\\[]?)?"
  + "(?:(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)\\.?,?\\s+)?", "i");

/* Een datum vooraan in s: {j, mnd, d, n (lengte), sterk (met jaartal of maandnaam)}. */
function vjDatumVooraan(s) {
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(s))) return { j: +m[1], mnd: +m[2] - 1, d: +m[3], n: m[0].length, sterk: true };
  if ((m = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})(?!\d)/.exec(s))) return { j: m[4].length === 2 ? 2000 + +m[4] : +m[4], mnd: +m[3] - 1, d: +m[1], n: m[0].length, sterk: true };
  if ((m = /^(\d{1,2})[-/](\d{1,2})(?![\d/-])/.exec(s))) return { j: null, mnd: +m[2] - 1, d: +m[1], n: m[0].length, sterk: false };
  m = /^(\d{1,2})\s+([a-z]+)\.?(?:\s+(\d{4}))?(?![\da-z])/i.exec(s);
  if (m && Object.prototype.hasOwnProperty.call(VJ_MAANDEN, m[2].toLowerCase())) return { j: m[3] ? +m[3] : null, mnd: VJ_MAANDEN[m[2].toLowerCase()], d: +m[1], n: m[0].length, sterk: true };
  return null;
}
/* De dag die erbij hoort, of null: bestaat niet, of ligt na morgen. Zonder
 * jaartal geldt dit jaar; in januari en februari is "28-12" vorig jaar. */
function vjLogDag(v, nu) {
  const vandaag = vjVandaag(nu); const morgen = new Date(vandaag.getFullYear(), vandaag.getMonth(), vandaag.getDate() + 1);
  let j = v.j;
  if (j === null) { j = vandaag.getFullYear(); if (new Date(j, v.mnd, v.d) > morgen && vandaag.getMonth() <= 1 && v.mnd >= 10) j -= 1; }
  const dag = new Date(j, v.mnd, v.d);
  if (dag.getMonth() !== v.mnd || dag.getDate() !== v.d) return null;
  return dag > morgen ? null : dag;
}
/* De datum waarmee deze regel een stuk begint, of null. */
function vjStukDatum(regel, nu) {
  if (VJ_KOP.test(regel)) {
    for (let i = 0; i < regel.length; i++) {
      if (!/\d/.test(regel[i]) || (i > 0 && /\d/.test(regel[i - 1]))) continue;
      const v = vjDatumVooraan(regel.slice(i));
      if (v) return vjLogDag(v, nu);
    }
    return null;
  }
  const rest = regel.slice(VJ_VOORLOOP.exec(regel)[0].length);
  const v = vjDatumVooraan(rest); if (!v) return null;
  const na = rest.slice(v.n);
  const ok = v.sterk ? /^(?:$|[\s:.,;)\]*_\-–—·|])/.test(na)
    : /^(?:\s*(?:$|[:.,;)\]*_·|]|[-–—](?:\s|$))|\s+\d{1,2}[:.]\d{2})/.test(na);
  return ok ? vjLogDag(v, nu) : null;
}
function toelichtingStukken(tekst, nu) {
  const regels = String(tekst || "").replace(/\r\n?/g, "\n").split("\n");
  const metKoppen = regels.some(r => VJ_KOP.test(r) && vjStukDatum(r, nu));
  const begin = [];
  regels.forEach((r, i) => {
    if (metKoppen && !VJ_KOP.test(r) && i > 0 && regels[i - 1].trim() !== "") return;
    const datum = vjStukDatum(r, nu);
    if (datum) begin.push({ i, datum });
  });
  const deel = (van, tot) => regels.slice(van, tot).join("\n").replace(/\s+$/, "");
  const stukken = begin.map((b, n) => ({
    tekst: deel(b.i, n + 1 < begin.length ? begin[n + 1].i : regels.length),
    datum: b.datum, naWitregel: b.i > 0 && regels[b.i - 1].trim() === "",
  }));
  return {
    intro: deel(0, begin.length ? begin[0].i : regels.length), stukken,
    aflopend: stukken.length >= 2 && stukken[0].datum > stukken[stukken.length - 1].datum,
  };
}
/* De tekst met de stukken in de gevraagde volgorde. De beschrijving blijft
 * bovenaan en de opgeslagen tekst verandert niet; minder dan twee stukken
 * geeft de tekst zoals hij is. */
function toelichtingInVolgorde(tekst, nieuwsteEerst, nu) {
  const { intro, stukken, aflopend } = toelichtingStukken(tekst, nu);
  if (stukken.length < 2) return String(tekst || "");
  const lijst = aflopend === !!nieuwsteEerst ? stukken : stukken.slice().reverse();
  const delen = lijst.map(s => s.tekst).join(stukken.slice(1).some(s => s.naWitregel) ? "\n\n" : "\n");
  return intro.trim() ? intro + (stukken[0].naWitregel ? "\n\n" : "\n") + delen : delen;
}
/* i91: wat je bij Klaar opschrijft, als regel voor onderaan de Toelichting:
 * datum en naam vooraan, zodat toelichtingStukken() hem als stuk herkent. */
function afsluitRegel(tekst, c) {
  const t = String(tekst || "").trim().replace(/\n\s*\n+/g, "\n");
  if (!t) return "";
  const d = vjVandaag(c.nu);
  const datum = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  return `${datum}${c.ik ? " · " + c.ik : ""}: ${t}`;
}

/* De acties. Elke functie krijgt de rij en c = {ik, schema, nu, tekst, datum,
 * specialist} en geeft {patch, melding}. */
const AFHANDEL = {
  goedkeuren: (rij, c) => ({ patch: afgerondPatch(rij, c.nu), melding: "Goedgekeurd." }),
  klaar: (rij, c) => {
    const patch = afgerondPatch(rij, c.nu);
    const regel = afsluitRegel(c.tekst, c); const oud = vjTekst(rij, "Toelichting");
    if (regel) patch.Toelichting = oud ? `${oud}\n\n${regel}` : regel;
    return { patch, melding: regel ? "Afgerond, met je notitie." : "Afgerond." };
  },
  gezien: (rij, c) => ({ patch: afgerondPatch(rij, c.nu), melding: "Gezien." }),
  terug: (rij, c) => {
    const sp = c.specialist || specialistVanRij(rij, c.schema);
    const oud = vjTekst(rij, "Toelichting").replace(OPMERKING_KOP, "");
    const kop = `— Opmerking van ${c.ik || "je opdrachtgever"} (mens), ${vjDatumKort(vjVandaag(c.nu))}: ${c.tekst} —`;
    return {
      patch: { Status: VJ_OPEN, Eigenaar: sp, Agent: sp, Gecorrigeerd: true, Correctie: c.tekst, Toelichting: oud ? `${kop}\n\n${oud}` : kop },
      melding: `Teruggestuurd naar ${sp}. Die pakt het op bij het volgende werkmoment.`,
    };
  },
  ja: (rij, c) => {
    const sp = c.specialist || specialistVanRij(rij, c.schema);
    if (!sp) return { patch: { Status: VJ_OPEN, Eigenaar: c.ik || null }, melding: "Akkoord. Het staat nu op je lijst." };
    return { patch: { Status: VJ_OPEN, Eigenaar: sp, Agent: sp }, melding: `Akkoord. ${sp} gaat ermee aan de slag bij het volgende werkmoment.` };
  },
  nee: (rij, c) => ({
    patch: Object.assign(afgerondPatch(rij, c.nu), { Correctie: "Niet doen" + (c.tekst ? ": " + c.tekst : "") }),
    melding: c.tekst ? "Niet gedaan. Je team weet waarom." : "Niet gedaan.",
  }),
  zelf: (rij, c) => ({
    patch: Object.assign(afgerondPatch(rij, c.nu), { Gecorrigeerd: true, Correctie: c.tekst || "Zelf aangepast" }),
    melding: "Afgerond, met jouw aanpassing.",
  }),
  later: (rij, c) => {
    const patch = { "Wachten tot": c.datum };
    const eigenaar = vjTekst(rij, "Eigenaar");
    if ((!eigenaar || agentWeergaveNaam(c.schema, eigenaar)) && vjTekst(rij, "Status") !== VJ_VOORSTEL && c.ik) patch.Eigenaar = c.ik;
    return { patch, melding: `Uit je lijst tot ${vjDatumKort(c.datum)}.` };
  },
  nieuweDatum: (rij, c) => ({ patch: { Deadline: c.datum }, melding: `Nieuwe datum: ${vjDatumKort(c.datum)}.` }),
  zelfOppakken: (rij, c) => {
    const patch = { Eigenaar: c.ik, Status: VJ_OPEN, Deadline: c.datum };
    if (vjTekst(rij, "Type") === "Alert") patch.Type = "Taak";
    return { patch, melding: `Op je eigen lijst gezet, voor ${vjDatumKort(c.datum)}.` };
  },
  geefAan: (rij, c) => {
    const patch = { Status: VJ_OPEN, Eigenaar: c.specialist, Agent: c.specialist };
    if (getField(rij, "Wachten tot")) patch["Wachten tot"] = null;
    return { patch, melding: `Doorgegeven aan ${c.specialist}. Die pakt het op bij het volgende werkmoment.` };
  },
  tochZelf: (rij, c) => ({ patch: { Eigenaar: c.ik, Status: VJ_OPEN }, melding: "Je doet dit zelf. Het staat op je lijst." }),
  nuOppakken: (rij, c) => {
    const bijAgent = agentWeergaveNaam(c.schema, vjTekst(rij, "Eigenaar"));
    return {
      patch: { Status: VJ_OPEN, "Wachten tot": null },
      melding: bijAgent ? `${bijAgent} pakt dit op bij het volgende werkmoment.` : "Weer op je lijst.",
    };
  },
  heropen: (rij, c) => ({ patch: { Status: VJ_OPEN, Eigenaar: c.ik }, melding: "Weer open, op je lijst." }),
  zetBijMij: (rij, c) => {
    const patch = { Eigenaar: c.ik };
    if (!SOORT_PER_STATUS[vjTekst(rij, "Status")]) patch.Status = VJ_OPEN;
    return { patch, melding: "Staat nu bij jou." };
  },
};

/* Welke acties hebben een naam nodig, een tekst, een datum of een specialist?
 * Het blad vraagt die eerst, in de pagina zelf. */
const AFHANDEL_VRAAGT = {
  terug: { tekst: "verplicht", label: "Wat moet er anders?", plaats: "Bijvoorbeeld: korter, en noem de offerte van vorige week." },
  nee: { tekst: "mag-leeg", label: "Waarom niet? (mag leeg blijven)", plaats: "Je team leest dit terug." },
  zelf: { tekst: "mag-leeg", label: "Wat heb je aangepast? (mag leeg blijven)", plaats: "Bijvoorbeeld: toon wat formeler gemaakt." },
  opvolgen: { tekst: "verplicht", label: "Wat moet je team doen?", specialist: true },
  later: { datum: true },
  nieuweDatum: { datum: true },
  zelfOppakken: { datum: true, vandaag: true },
  geefAan: { specialist: true },
};
const AFHANDEL_MET_NAAM = ["terug", "later", "zelfOppakken", "tochZelf", "heropen", "zetBijMij", "ja"];

function afhandelPatch(f, rij, c) {
  const regel = AFHANDEL[f];
  if (!regel) throw new Error("Onbekende afhandeling: " + f);
  return regel(rij, Object.assign({ nu: new Date() }, c));
}

/* De knoppen per soort: één hoofdknop, een paar andere, en soms een regel
 * die zegt waar het ligt. Zonder specialist valt "terug" weg — terugsturen
 * naar niemand bestaat niet. */
function afhandelKnoppen(rij, schema, nu) {
  const namen = agentNamen(schema);
  const soort = soortVan(rij, namen, nu);
  const sp = specialistVanRij(rij, schema);
  const k = (f, label, stijl) => ({ f, label, stijl: stijl || "" });
  switch (soort) {
    case "check": return {
      soort, hoofd: k("goedkeuren", "Goedkeuren", "prim"),
      rest: [sp ? k("terug", `Terug naar ${sp}`, "team") : null, k("zelf", "Zelf aangepast"), k("later", "Later")].filter(Boolean),
      regel: "Je team verstuurt niets zelf. Moet dit naar buiten, kopieer het dan en verstuur het zelf.",
    };
    case "voorstel": return {
      soort, hoofd: k("ja", sp ? "Ja, doe maar" : "Ja, ik pak het op", "prim"),
      rest: [k("nee", "Nee, niet doen"), k("later", "Later")],
      regel: sp ? `Bij "ja" gaat ${sp} ermee aan de slag bij het volgende werkmoment.` : "",
    };
    case "signaal": return {
      soort, hoofd: k("opvolgen", "Laat je team opvolgen", "teamvol"),
      rest: [k("zelfOppakken", "Ik pak het zelf op"), k("gezien", "Gezien, niets doen"), k("later", "Later")], regel: "",
    };
    case "taak": case "weer": return {
      soort, hoofd: k("klaar", "Klaar", "prim"),
      rest: [k("nieuweDatum", "Nieuwe datum"), k("geefAan", "Geef aan je team", "team"), k("later", "Later")], regel: "",
    };
    case "team": return {
      soort, hoofd: null, rest: [k("tochZelf", "Toch zelf doen")],
      regel: `${agentWeergaveNaam(schema, vjTekst(rij, "Eigenaar")) || "Je team"} ${vjTekst(rij, "Status") === VJ_BEZIG ? "werkt hier nu aan" : "pakt dit op bij het volgende werkmoment"}.`,
    };
    case "wacht": return {
      soort, hoofd: k("nuOppakken", "Nu oppakken", "prim"), rest: [k("later", "Datum verzetten")],
      regel: `Wacht tot ${vjDatumKort(getField(rij, "Wachten tot"))}.`,
    };
    case "klaar": {
      const door = agentWeergaveNaam(schema, vjTekst(rij, "Afgerond door"));
      const op = vjDatumKort(getField(rij, "Afgerond op"));
      return { soort, hoofd: null, rest: [k("heropen", "Toch weer openen")],
        regel: `Afgerond${op ? " op " + op : ""}${door ? " door " + door : ""}.` };
    }
    default: return {
      soort: "klopt-niet", hoofd: k("zetBijMij", "Zet bij mij", "prim"), rest: [],
      regel: "Dit item heeft geen duidelijke eigenaar of status. Zet het bij jou, dan kun je het afhandelen.",
    };
  }
}

/* s64 nafix (besluit 26-11) — schreef een medewerker of viewer de bronrij,
 * of is de herkomst onbekend (stempel `geschreven_door`, alleen met
 * AFSCHERMING=aan), dan neemt "opvolgen" de titel niet over als opdracht:
 * die tekst zou anders met het gezag van de eigenaar bij de specialist
 * belanden. De nieuwe actie verwijst dan met een neutrale tekst naar de
 * bovenliggende actie; de agent leest daar in een sessie zelf de herkomst.
 * Voor het werkmoment is besluit A (26-11, avond) genomen: de werkronde geeft
 * de bovenliggende rij met haar `geschreven_door` mee. Dat hoort bij
 * agent-architecture #284 (core/served/werkronde.md), niet bij dit dashboard.
 * Tot die werkronde live is, krijgt de specialist op het werkmoment alleen
 * de neutrale zin.
 *
 * Besluit C2 (26-11, avond): fail-closed. Alleen precies "eigenaar",
 * "beheerder" en "sleutel" tellen als hogere herkomst. Elke andere waarde van
 * een stempel dat er wel is (hoofdletters, spaties, null, een onbekende
 * tekst, een getal) telt als lagere rol. Ontbreekt het stempel helemaal
 * (modus uit), of is het eigenaar, beheerder of sleutel, dan is alles
 * precies als vóór s64. */
const SCHRIJVER_HOGER = ["eigenaar", "beheerder", "sleutel"];
const OPVOLG_NEUTRAAL = "Pak de volgende stap op bij de bovenliggende actie.";
/* Draagt `houder` het stempel `sleutel` (een eigen sleutel, ook met waarde
 * null), en is dat niet precies een van de drie hogere waarden? Ontbreekt
 * het stempel, dan false: dat is de modus uit. */
function stempelVanLagereRol(houder, sleutel) {
  if (!houder || typeof houder !== "object" || !Object.prototype.hasOwnProperty.call(houder, sleutel)) return false;
  return SCHRIJVER_HOGER.indexOf(houder[sleutel]) === -1;
}
function opvolgZonderTitel(rij) {
  return stempelVanLagereRol(rij && rij.__stempels, "door");
}
/* Het voorstel in het tekstvak (en de opdracht als je niets typt). */
function opvolgVoorstel(rij, titel) {
  return opvolgZonderTitel(rij) ? OPVOLG_NEUTRAAL : "Pak de volgende stap op: " + titel;
}

/* "Laat je team opvolgen": een subactie voor de specialist, met de
 * verbanden van het origineel, en het origineel zelf op Klaar. Besluit C3
 * (26-11, avond): ook bij een bronrij van een lagere rol gaan Organisatie,
 * Deal, Project en Contactpersoon mee. Dat zijn koppelingen, geen opdracht;
 * alleen de titel en de tekst blijven weg (zie opvolgVoorstel). */
function opvolgActie(rij, c) {
  const data = {
    Actie: c.tekst.length > 120 ? c.tekst.slice(0, 117) + "…" : c.tekst,
    Status: VJ_OPEN, Type: "Taak", Eigenaar: c.specialist, Agent: c.specialist,
    Toelichting: c.tekst, "Bovenliggende actie": rij.__entryId,
  };
  for (const veld of ["Organisatie", "Deal", "Project", "Contactpersoon"]) {
    const w = getField(rij, veld);
    if (w && (typeof w !== "object" || w.id)) data[veld] = w;
  }
  return { data, ouder: afgerondPatch(rij, c.nu), melding: `Doorgegeven aan ${c.specialist}. Die pakt het op bij het volgende werkmoment.` };
}

if (typeof module !== "undefined") {
  module.exports = {
    aanJouZet, hoortBijMens, vanMij, soortVan, isTeLaat, sindsVan, sorteerVoorJou, naamGelijk,
    bijCollegas, bijTeam, kloptNiet, SOORT_PER_STATUS, SOORT_LABEL, VJ_STILLE_BERG,
    BANEN, baanVan, banenVan,
    wachtInToekomst, agentWeergaveNaam, specialistVanRij, datumKeuzes, afhandelPatch, afhandelKnoppen,
    opvolgActie, opvolgVoorstel, opvolgZonderTitel, stempelVanLagereRol, SCHRIJVER_HOGER, OPVOLG_NEUTRAAL, vjIsoDag, vjDatumKort, AFHANDEL, AFHANDEL_VRAAGT, AFHANDEL_MET_NAAM, OPMERKING_KOP,
    toelichtingStukken, toelichtingInVolgorde, afsluitRegel,
  };
}
