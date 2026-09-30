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

/* Koppeltabel status → soort. Elke status uit de registry staat hier; een
 * nieuwe status in de registry maakt test/f46-aan-jou.test.js rood in plaats
 * van dat hij stil als "klopt niet" in beeld komt. */
const SOORT_PER_STATUS = {
  [VJ_KLAAR]: () => "klaar",
  [VJ_VOORSTEL]: () => "voorstel",
  // Wacht op review op naam van een agent is volgens het statuscontract een
  // fout-toestand: niemand is dan aan zet.
  [VJ_REVIEW]: (rij, namen) => (vjMensOfLeeg(vjTekst(rij, "Eigenaar"), namen) ? "check" : "klopt-niet"),
  [VJ_WACHT]: (rij, namen, nu) => {
    if (!vjVerlopen(rij, nu)) return "wacht";
    return vjIsAgent(vjTekst(rij, "Eigenaar"), namen) ? "team" : "weer";
  },
  [VJ_OPEN]: (rij, namen) => {
    if (vjIsAgent(vjTekst(rij, "Eigenaar"), namen)) return "team";
    return vjTekst(rij, "Type") === "Alert" ? "signaal" : "taak";
  },
  [VJ_BEZIG]: (rij, namen) => (vjIsAgent(vjTekst(rij, "Eigenaar"), namen) ? "team" : "taak"),
};

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

function hoortBijMens(rij, namen, nu) {
  const status = vjTekst(rij, "Status");
  const eigenaar = vjTekst(rij, "Eigenaar");
  if (status === VJ_KLAAR) return false;
  if (status === VJ_REVIEW) return vjMensOfLeeg(eigenaar, namen);
  if (status === VJ_VOORSTEL) return true;
  if (status === VJ_WACHT) return vjVerlopen(rij, nu) && vjMensOfLeeg(eigenaar, namen);
  if (status === VJ_OPEN || status === VJ_BEZIG) {
    if (!vjMensOfLeeg(eigenaar, namen)) return false;
    return vjIsAgent(vjTekst(rij, "Aangemaakt door"), namen) || isTeLaat(rij, namen, nu);
  }
  return false;
}

function vanMij(rij, ik, namen) {
  const eigenaar = vjTekst(rij, "Eigenaar");
  if (!eigenaar) return true; // voor iedereen
  if (vjIsAgent(eigenaar, namen)) return vjTekst(rij, "Status") === VJ_VOORSTEL;
  if (!ik) return true; // onbekend wie je bent: niets verstoppen
  return naamGelijk(eigenaar, ik);
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
  return sorteerVoorJou(acties.filter(r => hoortBijMens(r, namen, nu) && vanMij(r, o.ik, namen)), namen, nu);
}

/* De andere banen van Acties rekenen met dezelfde bouwstenen, zodat een rij
 * nooit in twee banen tegelijk staat of in geen enkele verdwijnt. */
function bijCollegas(bundle, schema, opties) {
  const o = opties || {};
  const acties = rows(bundle, "acties");
  const namen = agentNamen(schema);
  if (!acties || !namen || !o.ik) return [];
  return acties.filter(r => {
    const eigenaar = vjTekst(r, "Eigenaar");
    return vjTekst(r, "Status") !== VJ_KLAAR && eigenaar && !vjIsAgent(eigenaar, namen) && !naamGelijk(eigenaar, o.ik);
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

if (typeof module !== "undefined") {
  module.exports = {
    aanJouZet, hoortBijMens, vanMij, soortVan, isTeLaat, sindsVan, sorteerVoorJou, naamGelijk,
    bijCollegas, bijTeam, kloptNiet, SOORT_PER_STATUS, SOORT_LABEL, VJ_STILLE_BERG,
  };
}
