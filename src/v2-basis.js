/* Dashboard v2 — basis: tijd, kleine hulpfuncties, de toestand van het scherm
 * en de vertaling van je werkruimte naar wat de schermen tonen.
 *
 * De schermen komen uit het goedgekeurde klikbare ontwerp. Daar rekenden ze
 * met nepdata in eigen vorm; hier krijgen ze dezelfde vorm, maar dan
 * afgeleid van de echte rijen (`a.rij` blijft er altijd aan hangen). Wat iets
 * ís — aan jou, bij je team, te laat — beslist voor-jou.js; deze laag vertaalt
 * alleen. */

const P = V2_PROD;
let NU = new Date();
let CTX = null; // de context van app.js; null zolang er geen werkruimte is

const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const DAGEN_LANG = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function dt(v) { if (!v) return null; if (v instanceof Date) return v; return parseDateField(v); }
function p2(n) { return String(n).padStart(2, "0"); }
function isoDag(d) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; }
function dagStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function zelfdeDag(a, b) { return !!a && !!b && dagStart(a).getTime() === dagStart(b).getTime(); }
function plusDagen(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function hhmm(d) { return p2(d.getHours()) + ":" + p2(d.getMinutes()); }
function datumKort(d) { d = dt(d); return d ? DAGEN[d.getDay()] + " " + d.getDate() + " " + MAANDEN[d.getMonth()] : ""; }
function heeftTijd(v) { return typeof v === "string" ? /T\d|\s\d{1,2}:\d{2}/.test(v) : v instanceof Date; }
function wanneer(v) {
  const d = dt(v); if (!d) return "";
  if (!heeftTijd(v)) {
    if (zelfdeDag(d, NU)) return "vandaag";
    if (zelfdeDag(d, plusDagen(NU, -1))) return "gisteren";
    return datumKort(d);
  }
  if (zelfdeDag(d, NU)) return (d.getHours() < 6 ? "vannacht " : "vandaag ") + hhmm(d);
  if (zelfdeDag(d, plusDagen(NU, -1))) return "gisteren " + hhmm(d);
  return datumKort(d);
}
function dagenTussen(a, b) { const x = dt(a), y = dt(b); if (!x || !y) return 0; return Math.round((dagStart(y) - dagStart(x)) / 86400000); }
function telwoord(n, enk, mv) { return n + " " + (n === 1 ? enk : mv); }
function lijstZin(l) { return l.length < 2 ? l.join("") : l.slice(0, -1).join(", ") + " en " + l[l.length - 1]; }
function euro(n) { return "€ " + Number(n || 0).toLocaleString("nl-NL"); }
function voornaam(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }
function initialen(n) { return String(n || "?").split(/\s+/).filter(w => w && w !== "&").slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?"; }
function tekstVan(rij, veld) { const v = getField(rij, veld); return v === undefined || v === null ? "" : (typeof v === "object" ? dataCelTekst(v) : String(v).trim()); }
const ic = (n, c) => `<svg class="ic ${c || ""}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

/* ── Toestand van het scherm ─────────────────────────────────────────
 * Alleen in het geheugen van deze pagina: geen opslag, geen telemetrie. */
const S = {
  route: "/", hist: [], data: null,
  nummers: {}, volgNr: 1, nummerBundel: null,
  sessie: { afgehandeld: [] },
  ui: {
    acties: { weergave: "lijst", van: "mij", toon: "open", zoek: "", baan: "jij" },
    team: { filter: null }, hulp: { zoek: "", open: {}, vb: "stil", stap: -1 },
    gegevens: { zoek: "", filter: "" }, bewerk: null, toevoegen: null,
    dismissed: {}, meerOpen: {}, det: {}, openCollega: false, stappenDoel: null,
  },
  sheet: null, toast: null, ronde: null, drag: null, terugNaar: null, thema: null,
  focusNa: null, scrollDoel: null, sheetOpener: null, vorigSheetType: null,
  laatsteSleutel: null, scrollMap: {}, vorigeRoute: null,
  leeg: null, // {titel, tekst, login} zolang er geen werkruimte is
};

/* ── Toegang ─────────────────────────────────────────────────────────── */
function bron() { return CTX && CTX.bron; }
function ingelogd() { return !!(bron() && bron().oauth); }
function magSchrijven(domein) { return !!(CTX && magDomeinBewerken(CTX, domein).ok); }
function kanSchrijven() { return magSchrijven("acties"); }
function kanInloggen() { return typeof oauthMogelijk === "function" && oauthMogelijk(); }
/* Werkdata in Notion (of een ander systeem), per domein. De acties-ervaring
 * (Voor jou, Acties) gaat alleen op "Notion" als de ACTIES elders wonen, of
 * als er op de metricsroute geen acties-rijen zijn. Wonen alleen de vaste
 * taken elders, dan blijft de rest gewoon de werkruimte. Eén verdwaalde rij
 * in de werkruimte (bv. een welkomstpakket-actie) verandert daar niets aan:
 * dezelfde regel als werkdataDomeinen in de loader. */
function woontElders(domein) { return !!CTX && bronVan(CTX, domein).toestand === "elders"; }
function isNotion() {
  if (!CTX) return false;
  if (woontElders("acties")) return true;
  return CTX.bundle && CTX.bundle.kind === "metrics" && !rows(CTX.bundle, "acties");
}
function takenElders() { return !!CTX && (woontElders("ritmetaken") || (CTX.bundle && CTX.bundle.kind === "metrics" && !dataRijenVan(CTX, "ritmetaken"))); }
/* De werkbak uit de dagstart (metrics v3), ook als er verdwaalde acties-rijen zijn. */
function werkbakUitDagstart() { const w = CTX && CTX.metricsWerk; return w && Array.isArray(w.voorJou) ? w.voorJou : null; }
function naamElders(domein) { const b = CTX ? bronVan(CTX, domein) : null; return (b && b.toestand === "elders" && b.naam) || "je eigen systeem"; }
function toegang() { if (!CTX) return "geen"; if (isNotion()) return "notion"; return ingelogd() ? "ingelogd" : "daglink"; }
function jij() { return (ingelogd() && (mijnNaam(bron()) || S.naamGeheugen)) || ""; }
function isBeheerder() { return (typeof moduleOverzichtBeschikbaar === "function" && moduleOverzichtBeschikbaar()) || (typeof teamBeheerMogelijk === "function" && teamBeheerMogelijk()); }
function bedrijf() { return (CTX && CTX.bundle && CTX.bundle.klant) || ""; }

/* ── Je team: de specialisten uit de registry ─────────────────────────── */
const AGENT_KORT = {
  orchestrator: "Coördinator", "management-assistent": "Assistent", "quality-control": "Kwaliteit",
  "pipeline-manager": "Pipeline", "outreach-specialist": "Outreach", "content-strateeg": "Content",
  informatiemanager: "Informatie", "customer-success-manager": "Klantsucces", "seo-geo-specialist": "Vindbaarheid",
  "delivery-architect": "Delivery", "product-designer": "Product",
};
let AGENTS = {};
function bouwAgents(schema) {
  const uit = {};
  const modules = (schema && schema.modules) || {};
  for (const a of (schema && schema.agents) || []) {
    if (!a || !a.slug) continue;
    const d = String(a.description || "");
    const punt = d.indexOf(". ");
    const zin = punt === -1 ? d : d.slice(0, punt + 1);
    uit[a.slug] = {
      naam: a.displayName || a.slug, kort: AGENT_KORT[a.slug] || a.displayName || a.slug,
      em: a.emoji || "", rol: zin, module: (modules[a.module] && modules[a.module].naam) || a.module || "",
    };
  }
  return uit;
}
let NAMEN = { schema: null, set: null };
function namen() { const sc = CTX && CTX.schema; if (NAMEN.schema !== sc) NAMEN = { schema: sc, set: agentNamen(sc) }; return NAMEN.set; }
function isAgentSlug(s) { return !!(s && AGENTS[s]); }
let SLUG_INDEX = new Map(); let SLUG_CACHE = new Map();
function slugVanNaam(n) {
  if (!n) return null;
  const k = String(n);
  if (SLUG_CACHE.has(k)) return SLUG_CACHE.get(k);
  const slug = SLUG_INDEX.get(normAgentNaam(k)) || null;
  SLUG_CACHE.set(k, slug);
  return slug;
}
function isAgentNaam(n) { return !!slugVanNaam(n); }
function naamGelijk(a, b) { return P.naamGelijk(a, b); }
/* 'de Dealmaker', maar 'De Stem' (zonder dubbel lidwoord). Zonder specialist: 'je team'. */
function deNaam(slug, hoofd) {
  const a = AGENTS[slug];
  if (!a) return hoofd ? "Je team" : "je team";
  if (/^De /.test(a.naam)) return a.naam;
  return (hoofd ? "De " : "de ") + a.naam;
}
function mensKort(n) { return initialen(n).slice(0, 2); }

/* ── Mensen: wie in je werkdata staat, plus jij ──────────────────────── */
function mensen() {
  const gezien = new Map();
  const zet = (n) => { const s = String(n || "").trim(); if (!s || isAgentNaam(s)) return; const k = s.toLowerCase(); if (!gezien.has(k)) gezien.set(k, s); };
  if (jij()) zet(jij());
  for (const a of (S.data && S.data.acties) || []) { zet(a.eigenaar); if (!isAgentSlug(a.door)) zet(a.door); }
  const team = typeof teamLijst !== "undefined" && Array.isArray(teamLijst) ? teamLijst : [];
  for (const r of team) zet(r && r.naam);
  return [...gezien.values()].slice(0, 30);
}

/* ── Van rij naar scherm ─────────────────────────────────────────────── */
const RELATIE_VELDEN = ["Organisatie", "Deal", "Project", "Contactpersoon", "Interactie"];
function relatiesVan(rij, domein) {
  const dom = CTX.schema.datadomeinen[domein];
  const uit = [];
  for (const veld of (dom && dom.velden) || []) {
    if (veld.type !== "relatie" || veld.naam === "Bovenliggende actie") continue;
    const w = getField(rij, veld.naam);
    const lijst = Array.isArray(w) ? w : (w ? [w] : []);
    for (const v of lijst) {
      const doel = veld.naar === "*" ? (v && v.domein) : veld.naar;
      const id = v && typeof v === "object" ? v.id : null;
      const titel = (id && doel && rpHuidigeTitel(doel, id)) || (v && typeof v === "object" ? v.titel : String(v || ""));
      if (titel) uit.push({ veld: veld.naam, domein: doel || null, id: id || null, titel: String(titel) });
    }
  }
  return uit;
}
function relatieId(w) { const v = Array.isArray(w) ? w[0] : w; return v && typeof v === "object" ? (v.id || null) : (v || null); }

const OPMERKING_RE = /^— Opmerking van [^\n]*?: ([\s\S]*?) —\n?\n?/;
/* Gaat dit werk naar buiten? Alleen als het eruitziet als een bericht: de
 * eerste regel is "Onderwerp: …" (een mail), of een specialist voor
 * zichtbaarheid zette een post klaar. Twijfel = gewoon "Goedkeuren". */
function kanaalVan(rij, werk, door) {
  const agent = slugVanNaam(tekstVan(rij, "Agent")) || (isAgentSlug(door) ? door : null);
  const eerste = String(werk || "").split("\n").find(r => r.trim()) || "";
  if (/^\s*onderwerp\s*:/i.test(eerste)) return "mail";
  if ((agent === "content-strateeg" || agent === "de-stem") && /linkedin|\bpost\b/i.test(tekstVan(rij, "Actie"))) return "post";
  return null;
}

function actieVan(rij) {
  const st = rij.__stempels || {};
  const doorTekst = tekstVan(rij, "Aangemaakt door");
  const door = slugVanNaam(doorTekst) || doorTekst;
  const afDoor = tekstVan(rij, "Afgerond door");
  const eigenaar = tekstVan(rij, "Eigenaar");
  const status = tekstVan(rij, "Status");
  const toel = tekstVan(rij, "Toelichting");
  const m = OPMERKING_RE.exec(toel);
  const schoon = toel.replace(OPMERKING_KOP, "").replace(OPMERKING_RE, "");
  const a = {
    id: rij.__entryId, rij,
    titel: tekstVan(rij, "Actie") || "(zonder titel)",
    status, eigenaar, door,
    agent: slugVanNaam(tekstVan(rij, "Agent")),
    type: tekstVan(rij, "Type"), prio: tekstVan(rij, "Prioriteit"),
    deadline: getField(rij, "Deadline") || null,
    aangemaakt: st.aangemaakt || null, bijgewerkt: st.bijgewerkt || null,
    wachtenTot: getField(rij, "Wachten tot") || null,
    afgerondOp: getField(rij, "Afgerond op") || null,
    afgerondDoor: slugVanNaam(afDoor) || afDoor,
    correctie: tekstVan(rij, "Correctie"),
    gecorrigeerd: getField(rij, "Gecorrigeerd") === true,
    bronLink: tekstVan(rij, "Bron (link)"),
    hoort: relatiesVan(rij, "acties"),
    onder: relatieId(getField(rij, "Bovenliggende actie")),
    teruggestuurd: m ? m[1].trim() : null,
    werk: schoon, opdracht: null, kanaal: null, opmerkingen: [],
  };
  a.bezigSinds = status === "Bezig" ? a.bijgewerkt : null;
  // Een opdracht van een mens die nog bij je team ligt: de tekst ís de opdracht,
  // er is nog geen werk. Daarna (Wacht op review, Klaar) is het werk van je team.
  const ag = werkAgent(a);
  if (!isAgentSlug(a.door) && ag && (status === "Open" || status === "Bezig") && isAgentNaam(eigenaar)) {
    a.opdracht = schoon ? { van: a.door || "", op: a.aangemaakt, tekst: schoon } : null;
    a.werk = "";
  }
  a.kanaal = status === "Wacht op review" ? kanaalVan(rij, a.werk, a.door) : null;
  return a;
}
/* Wanneer werd dit afgerond? "Afgerond op" is een datum zonder tijd; de
 * stempel van de instantie heeft wel een tijd. Zonder beide: onbekend. */
function afgerondMoment(a) {
  const op = dt(a.afgerondOp); const bij = dt(a.bijgewerkt);
  if (op && heeftTijd(a.afgerondOp)) return op;
  if (bij && (!op || zelfdeDag(bij, op))) return bij;
  return op || bij || null;
}
function werkAgent(a) { return isAgentSlug(a.agent) ? a.agent : (isAgentSlug(a.door) ? a.door : slugVanNaam(a.eigenaar)); }

function opmerkingenBij(id) {
  if (typeof notitiesBij !== "function") return [];
  return notitiesBij(CTX, "acties", id).map(n => ({
    id: n.__entryId, van: tekstVan(n, "Auteur") || "iemand", op: getField(n, "Datum") || (n.__stempels && n.__stempels.aangemaakt),
    tekst: tekstVan(n, "Notitie") || tekstVan(n, "Onderwerp"),
  })).reverse();
}

function taakVan(rij) {
  const uitWerkruimte = (dataRijenVan(CTX, "ritmetaken") || []).includes(rij);
  return {
    id: rij.__entryId, rij, url: rij.__url || null, alleenLezen: !uitWerkruimte,
    naam: tekstVan(rij, "Taak") || "(zonder naam)",
    agent: slugVanNaam(tekstVan(rij, "Agent")),
    ritme: tekstVan(rij, "Ritme"),
    actief: vtActief(rij),
    laatst: getField(rij, "Laatst gedraaid") || null,
    template: tekstVan(rij, "Bron-template"),
    instructie: tekstVan(rij, "Instructie"),
  };
}

function feedVan() {
  const feed = CTX.bundle && CTX.bundle.teamfeed;
  if (!feed || !Array.isArray(feed.entries)) return [];
  return normaliseerFeed(feed.entries, CTX.schema, CTX.agentLookup || buildAgentLookup())
    .map(f => ({ t: f.tijd, ag: f.agentSlug && AGENTS[f.agentSlug] ? f.agentSlug : null, naam: f.agentNaam, em: f.agentEmoji, soort: f.soort, tekst: f.bericht || f.actie || "", link: f.link || null }))
    .filter(f => f.tekst);
}

function bouwData() {
  AGENTS = bouwAgents(CTX.schema);
  SLUG_INDEX = new Map(); SLUG_CACHE = new Map();
  for (const [slug, a] of Object.entries(AGENTS)) { SLUG_INDEX.set(normAgentNaam(slug), slug); SLUG_INDEX.set(normAgentNaam(a.naam), slug); }
  const acties = (rows(CTX.bundle, "acties") || []).map(actieVan);
  const ids = new Set(acties.map(a => a.id));
  const perId = new Map(acties.map(a => [a.id, a]));
  for (const a of acties) a.opmerkingen = opmerkingenBij(a.id);
  const taken = (vtTaakRijen(CTX) || []).map(taakVan);
  return { acties, ids, perId, taken, feed: feedVan() };
}
