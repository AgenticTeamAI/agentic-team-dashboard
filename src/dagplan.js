/* f62 — het persoonlijke dagplan uit de dagstart ("Jouw dag").
 *
 * "Start mijn dag" is voor wie het vraagt. De Coördinator schrijft per mens
 * één entry in het werkruimte-domein `dagplannen` (registry 1.94.0), met
 * entry_id "dagplan-<naam>" en in Inhoud een JSON-string (contract v1). Het
 * domein is gedeeld zoals het logboek (rechtengroep werkgeheugen): geen seat,
 * geen afscherming per rij. Wie ingelogd is, ziet hier zijn eigen plan; van
 * collega's alleen tellingen, en die staan al zo in het plan.
 *
 * Alles hieronder is onbetrouwbare invoer (een agent onder prompt-injection,
 * of wie er maar mag schrijven): zelfde regels als metrics-sanitize.js. Een
 * NIEUW object met alleen de bekende velden, elk in het verwachte type en
 * begrensd; onbekende velden vallen weg; nooit een uitzondering. De
 * schermlaag escapet daarbovenop alles.
 *
 * De items onder ter_goedkeuring hebben precies de vorm en betekenis van het
 * voor_jou-blok van metrics v3, dus die gaan door saneerVoorJouBlok. */

const DAGPLAN_DOMEIN = "dagplannen";
const DAGPLAN_VERSIE = 1;
const DAGPLAN_MAX = {
  bytes: 64 * 1024,
  naam: 80, context: 200, titel: 120, toelichting: 300,
  acuut: 10, agenda: 30, agents: 15, later: 10, collegas: 20, samen: 5, met: 10,
  telling: 99999,
};

function dpIsObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

/* Platte tekst: geen stuurtekens, witruimte samengevouwen, begrensd. */
function dpTekst(v, max) {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}
function dpTekstOfNull(v, max) { const t = dpTekst(v, max); return t || null; }

/* JJJJ-MM-DD, en dan ook een echte dag (rondreis: geen 31 februari). */
function dpDag(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/* HH:MM (lokale tijd, Europe/Amsterdam). "9:05" wordt "09:05". */
function dpTijd(v) {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const u = Number(m[1]), mi = Number(m[2]);
  return u <= 23 && mi <= 59 ? String(u).padStart(2, "0") + ":" + m[2] : null;
}

/* Een ISO-tijdstempel (met offset), zoals saneerDatum in metrics-sanitize.js. */
function dpMoment(v) {
  if (typeof v !== "string" || v.length > 40) return null;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(v)) return null;
  return Number.isNaN(Date.parse(v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"))) ? null : v;
}

/* Een hele, niet-negatieve telling; onbruikbaar = 0. */
function dpTelling(v) {
  const n = naarGetal(v);
  return n === null || n < 0 ? 0 : Math.min(DAGPLAN_MAX.telling, Math.round(n));
}

function dpLijst(v, max) { return Array.isArray(v) ? v.slice(0, max).filter(dpIsObject) : []; }

/* entry_id volgens de afspraak: "dagplan-" + de naam in kleine letters,
 * zonder accenten, alles buiten [a-z0-9] als één "-", hooguit 40 tekens. */
function dagplanEntryId(persoon) {
  const slug = String(persoon || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return slug ? "dagplan-" + slug : null;
}

/* Inhoud (JSON-string of object) → gesaneerd dagplan, of null als het geen
 * dagplan v1 is. Gooit nooit. `schema` levert de agent-slugs. */
function saneerDagplan(raw, schema) {
  try {
    let o = raw;
    if (typeof raw === "string") {
      if (raw.length > DAGPLAN_MAX.bytes) return null;
      o = JSON.parse(raw);
    } else if (dpIsObject(raw) && JSON.stringify(raw).length > DAGPLAN_MAX.bytes) return null;
    if (!dpIsObject(o) || naarGetal(o.versie) !== DAGPLAN_VERSIE || o.type !== "dagplan") return null;

    const s = schema || (typeof AGENTIC_TEAM_SCHEMA !== "undefined" ? AGENTIC_TEAM_SCHEMA : null);
    const slugs = new Set(((s && s.agents) || []).map(a => a && a.slug).filter(Boolean));

    const agenda = dpLijst(o.agenda, DAGPLAN_MAX.agenda)
      .map(it => ({ start: dpTijd(it.start), eind: dpTijd(it.eind), titel: dpTekst(it.titel, DAGPLAN_MAX.titel) || "Bezet" }))
      .filter(it => it.start)
      .sort((a, b) => a.start.localeCompare(b.start));

    const tg = dpIsObject(o.ter_goedkeuring) ? o.ter_goedkeuring : {};
    const blok = saneerVoorJouBlok({ items: Array.isArray(tg.items) ? tg.items : [] }, maakContext());
    const items = blok ? blok.items : [];

    return {
      versie: DAGPLAN_VERSIE,
      type: "dagplan",
      datum: dpDag(o.datum),
      gegenereerd_op: dpMoment(o.gegenereerd_op),
      voor: dpTekst(o.voor, DAGPLAN_MAX.naam),
      context: dpTekstOfNull(o.context, DAGPLAN_MAX.context),
      acuut: dpLijst(o.acuut, DAGPLAN_MAX.acuut)
        .map(it => ({ titel: dpTekst(it.titel, DAGPLAN_MAX.titel), toelichting: dpTekstOfNull(it.toelichting, DAGPLAN_MAX.toelichting) }))
        .filter(it => it.titel),
      agenda,
      agents_vandaag: dpLijst(o.agents_vandaag, DAGPLAN_MAX.agents)
        .map(it => ({ agent: typeof it.agent === "string" ? it.agent.trim().toLowerCase() : "", taak: dpTekst(it.taak, DAGPLAN_MAX.titel) }))
        .filter(it => slugs.has(it.agent)),
      later: dpLijst(o.later, DAGPLAN_MAX.later)
        .map(it => ({ titel: dpTekst(it.titel, DAGPLAN_MAX.titel) }))
        .filter(it => it.titel),
      ter_goedkeuring: { totaal: Math.max(dpTelling(tg.totaal), items.length), items },
      collegas: dpLijst(o.collegas, DAGPLAN_MAX.collegas)
        .map(it => ({ naam: dpTekst(it.naam, DAGPLAN_MAX.naam), wachtend: dpTelling(it.wachtend) }))
        .filter(it => it.naam),
      onverdeeld: dpTelling(o.onverdeeld),
      samen: dpLijst(o.samen, DAGPLAN_MAX.samen)
        .map(it => ({
          titel: dpTekst(it.titel, DAGPLAN_MAX.titel),
          met: (Array.isArray(it.met) ? it.met : []).slice(0, DAGPLAN_MAX.met).map(n => dpTekst(n, DAGPLAN_MAX.naam)).filter(Boolean),
        }))
        .filter(it => it.titel),
    };
  } catch (e) {
    return null;
  }
}

/* De entries uit /dashboard/entries?domein=dagplannen → gesaneerde plannen.
 * Een entry zonder leesbaar plan valt weg. */
function dagplannenUitEntries(entries, schema) {
  const uit = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!dpIsObject(e) || !dpIsObject(e.data)) continue;
    const plan = saneerDagplan(e.data.Inhoud, schema);
    if (!plan) continue;
    uit.push({
      entryId: typeof e.entryId === "string" ? e.entryId.slice(0, 80) : "",
      persoon: dpTekst(e.data.Persoon, DAGPLAN_MAX.naam) || plan.voor,
      datum: dpDag(e.data.Datum) || plan.datum,
      bijgewerkt: dpMoment(e.bijgewerkt),
      plan,
    });
  }
  return uit;
}

function dpVoornaam(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }
function dpEenWoord(n) { return String(n || "").trim().split(/\s+/).length === 1; }

/* Het dagplan van `ik`: Persoon of voor is dezelfde naam (zoals naamGelijk).
 * Anders telt een voornaam, maar alleen als één van beide alleen een voornaam
 * is ("Tijmen" bij "Tijmen Kip") en er precies één zo'n persoon is. Van de
 * plannen van die persoon wint dat van vandaag, anders het nieuwste. */
function kiesDagplan(plannen, ik, vandaagIso) {
  const lijst = Array.isArray(plannen) ? plannen : [];
  if (!ik || !lijst.length) return null;
  const naamVan = (p) => [p.persoon, p.plan && p.plan.voor].filter(Boolean);
  let van = lijst.filter(p => naamVan(p).some(n => naamGelijk(n, ik)));
  if (!van.length) {
    const vn = dpVoornaam(ik);
    const past = (n) => naamGelijk(dpVoornaam(n), vn) && (dpEenWoord(n) || dpEenWoord(ik));
    const kandidaten = lijst.filter(p => naamVan(p).some(past));
    const personen = new Set(kandidaten.map(p => normAgentNaam(p.persoon).replace(/\s+/g, " ")));
    if (personen.size === 1) van = kandidaten;
  }
  if (!van.length) return null;
  const sleutel = (p) => [p.datum || "", (p.plan && p.plan.gegenereerd_op) || "", p.bijgewerkt || ""].join("|");
  const gesorteerd = van.slice().sort((a, b) => sleutel(b).localeCompare(sleutel(a)));
  const vandaag = vandaagIso ? gesorteerd.find(p => p.datum === vandaagIso) : null;
  const gekozen = vandaag || gesorteerd[0];
  return Object.assign({}, gekozen, { vandaag: !!vandaag });
}
