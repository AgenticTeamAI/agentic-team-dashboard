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
  if (hoortBijMens(rij, o.namen, o.nu) && vanMij(rij, o.ik, o.namen)) return "jij";
  if (soort === "team") return "team";
  const eigenaar = vjTekst(rij, "Eigenaar");
  if (!eigenaar) return "zonder";
  if (!o.ik || naamGelijk(eigenaar, o.ik)) return "jij-later";
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
  const ctx = { ik: o.ik, namen, nu };
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

/* De acties. Elke functie krijgt de rij en c = {ik, schema, nu, tekst, datum,
 * specialist} en geeft {patch, melding}. */
const AFHANDEL = {
  goedkeuren: (rij, c) => ({ patch: afgerondPatch(rij, c.nu), melding: "Goedgekeurd." }),
  klaar: (rij, c) => ({ patch: afgerondPatch(rij, c.nu), melding: "Afgerond." }),
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

/* "Laat je team opvolgen": een subactie voor de specialist, met de
 * verbanden van het origineel, en het origineel zelf op Klaar. */
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
    opvolgActie, vjIsoDag, vjDatumKort, AFHANDEL, AFHANDEL_VRAAGT, AFHANDEL_MET_NAAM, OPMERKING_KOP,
  };
}
