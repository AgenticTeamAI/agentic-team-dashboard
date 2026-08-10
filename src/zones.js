/* Berekent de vijf zones uit één bundle (zie bundle-loaders.js). Puur —
 * geen DOM. "Vandaag" is injecteerbaar zodat dit reproduceerbaar te testen
 * is; in de app zelf is dat gewoon new Date(). */

const STALE_DAYS = 30; // drempel "verouderd" — zie ontwerp §12 (dertig dagen als standaard ritme)
const CONTEXT_ROOD_DAYS = 180;
const CONTEXT_ORANJE_DAYS = 90;

function daysBetween(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function parseDateField(v) {
  if (!v) return null;
  const dt = new Date(v);
  return isNaN(dt.getTime()) ? null : dt;
}

function isStale(staleAt, today, thresholdDays = STALE_DAYS) {
  if (!staleAt) return true;
  return daysBetween(today, staleAt) > thresholdDays;
}

function domain(bundle, key) {
  return bundle.domains[key];
}
function rows(bundle, key) {
  const dom = domain(bundle, key);
  return dom ? dom.rows : null; // null = domein ontbreekt (i.p.v. lege array)
}

// ── Zone 2 — Contextgezondheid ─────────────────────────────────────────
// Beslissing: moet ik mijn bedrijfscontext bijwerken voordat ik het team
// weer aan het werk zet?
function computeZone2(bundle, today) {
  const ctx = bundle.bedrijfscontext;
  if (ctx === "niet-ondersteund-door-bundel" || ctx === null) {
    return {
      signaal: "grijs",
      reden: "onbekend-niet-in-bundel",
      tekst: "Geen bedrijfscontext-gegevens gevonden in deze bundel. Dit onderdeel van de registry is nog niet uitgewerkt (zie S17/f13) — dit dashboard kan daarom niet zien of jouw team je bedrijf nog kent.",
      staleAt: null,
    };
  }
  const bron = ctx.Bron || ctx.bron;
  const staleAt = ctx.staleAt || null;
  const open = ctx.Placeholders_open || ctx.placeholders_open || [];
  const kopieDatum = parseDateField(ctx.Projectkennis_kopie_laatst_bijgewerkt || ctx.projectkennis_kopie_laatst_bijgewerkt);

  if (!bron) {
    return { signaal: "rood", reden: "context-ontbreekt", tekst: "Er is een bedrijfscontext-sectie in de bundel, maar zonder bron ingevuld — het team weet niet waar je bedrijfscontext staat.", staleAt };
  }

  const ageDays = staleAt ? daysBetween(today, staleAt) : null;
  const kopieOuderDanBron = kopieDatum && staleAt && kopieDatum < staleAt;

  let signaal = "groen";
  const redenen = [];
  if (ageDays === null) { signaal = "grijs"; redenen.push("geen datum van laatste update bekend"); }
  else if (ageDays > CONTEXT_ROOD_DAYS) { signaal = "rood"; redenen.push(`niet bijgewerkt sinds ${ageDays} dagen`); }
  else if (ageDays > CONTEXT_ORANJE_DAYS) { signaal = signaal === "groen" ? "oranje" : signaal; redenen.push(`niet bijgewerkt sinds ${ageDays} dagen`); }

  if (open.length > 0) { signaal = signaal === "rood" ? "rood" : "oranje"; redenen.push(`${open.length} placeholder(s) nog niet ingevuld: ${open.join(", ")}`); }
  if (kopieOuderDanBron) { signaal = signaal === "rood" ? "rood" : "oranje"; redenen.push("de kopie in projectkennis is ouder dan de bron"); }

  return {
    signaal,
    reden: redenen.join("; ") || "bron aanwezig en actueel",
    tekst: redenen.length ? redenen.join("; ") : "Bedrijfscontext aanwezig en actueel.",
    staleAt,
    bron,
    open,
  };
}

// ── Zone 3 — Gebruik ────────────────────────────────────────────────────
// Beslissing: welke agent laat ik links liggen, en waarom?
// Sporen: Acties.Agent (proxy-datum: Deadline, want er is geen aanmaakdatum
// in dit domein) en Lessen & Inzichten.Agent (datum: Datum). Dagverslagen
// heeft in de huidige registry GEEN Agent-veld (alleen "Persoon", een mens)
// en wordt daarom bewust NIET gebruikt als gebruikersspoor — zie README.
function computeZone3(bundle, agentLookup, schema, today, periodDays) {
  const traces = {}; // slug -> { laatst: Date|null, aantalPeriode: 0, aantalTotaal: 0 }
  for (const agent of schema.agents) traces[agent.slug] = { laatst: null, aantalPeriode: 0, aantalTotaal: 0 };

  const actiesDomain = domain(bundle, "acties");
  const lessenDomain = domain(bundle, "lessen_inzichten");
  const bronnenAanwezig = { acties: !!actiesDomain, lessen: !!lessenDomain, dagverslagen: !!domain(bundle, "dagverslagen") };

  function registreer(slugRaw, datumRaw) {
    const slug = matchAgentValue(slugRaw, agentLookup);
    if (!slug || !traces[slug]) return;
    const dt = parseDateField(datumRaw);
    traces[slug].aantalTotaal++;
    if (dt && (!traces[slug].laatst || dt > traces[slug].laatst)) traces[slug].laatst = dt;
    if (dt && daysBetween(today, dt) <= periodDays && daysBetween(today, dt) >= 0) traces[slug].aantalPeriode++;
  }

  if (actiesDomain) {
    for (const row of actiesDomain.rows) registreer(getField(row, "Agent"), getField(row, "Deadline"));
  }
  if (lessenDomain) {
    for (const row of lessenDomain.rows) registreer(getField(row, "Agent"), getField(row, "Datum"));
  }

  const perModule = {};
  for (const agent of schema.agents) {
    const mod = agent.module;
    if (!perModule[mod]) perModule[mod] = [];
    const t = traces[agent.slug];
    perModule[mod].push({
      slug: agent.slug, displayName: agent.displayName, emoji: agent.emoji,
      geenSpoor: t.aantalTotaal === 0,
      laatst: t.laatst, aantalPeriode: t.aantalPeriode, aantalTotaal: t.aantalTotaal,
    });
  }

  return { perModule, bronnenAanwezig, geenEnkeleBron: !bronnenAanwezig.acties && !bronnenAanwezig.lessen };
}

// ── Zone 4 — Opbrengst ──────────────────────────────────────────────────
// Beslissing: levert dit team genoeg op om het te blijven betalen?
// Let op: de bundel is een momentopname, geen gebeurtenislog. "Trend" kan
// dus alleen komen uit datumvelden BINNEN de bundel (bv. Publicatiedatum),
// nooit uit vergelijking met een vorige keer openen (dat zou een cache
// vereisen, en dat mag dit dashboard niet hebben). Waar geen datumveld
// bestaat, tonen we de huidige stand — expliciet gelabeld als zodanig.
function computeZone4(bundle, today, periodDays) {
  const out = {};

  const acties = rows(bundle, "acties");
  if (acties) {
    out.acties = {
      totaal: acties.length,
      afgerond: acties.filter(r => getField(r, "Status") === "Klaar").length,
      opmerking: "Totaal = alle acties in de bundel (geen aanmaakdatum beschikbaar in dit domein om op periode te filteren).",
    };
  }

  const sf = rows(bundle, "sales_funnel");
  if (sf) {
    const perFase = {};
    for (const r of sf) {
      const fase = getField(r, "Fase") || "Onbekend";
      perFase[fase] = (perFase[fase] || 0) + 1;
    }
    out.salesFunnel = {
      perFase,
      totaalVerwachteOmzet: sf.reduce((s, r) => s + (Number(getField(r, "Verwachte Omzet")) || 0), 0),
      opmerking: "Huidige verdeling — de bundel bevat geen wijzigingsgeschiedenis, dus geen trend van deals die van fase wisselden.",
    };
  }

  const ck = rows(bundle, "content_kalender");
  if (ck) {
    const inPeriode = ck.filter(r => {
      const dt = parseDateField(getField(r, "Publicatiedatum"));
      return dt && Math.abs(daysBetween(today, dt)) <= periodDays;
    });
    out.content = {
      gepubliceerd: ck.filter(r => getField(r, "Status") === "Gepubliceerd").length,
      geplandInPeriode: inPeriode.filter(r => ["Gepland", "Gepubliceerd"].includes(getField(r, "Status"))).length,
      totaal: ck.length,
    };
  }

  const ks = rows(bundle, "klantsucces");
  if (ks) {
    out.klantsucces = { inOnboarding: ks.filter(r => getField(r, "Fase") === "Onboarding").length, totaal: ks.length };
  }

  const backlog = rows(bundle, "productbacklog");
  if (backlog) {
    out.backlog = {
      besloten: backlog.filter(r => (getField(r, "Besluit") || "").trim() !== "").length,
      done: backlog.filter(r => getField(r, "Status") === "Done").length,
      totaal: backlog.length,
    };
  }

  return out;
}

// ── Zone 5 — Leren ──────────────────────────────────────────────────────
// Beslissing: wat weet dit team nu dat het vorige maand niet wist?
function computeZone5(bundle, today, periodDays) {
  const lessen = rows(bundle, "lessen_inzichten");
  if (lessen === null) return { aanwezig: false };
  if (lessen.length === 0) return { aanwezig: true, leeg: true };

  const perCategorie = {};
  let open = 0;
  for (const r of lessen) {
    const cat = getField(r, "Categorie") || "Onbekend";
    perCategorie[cat] = (perCategorie[cat] || 0) + 1;
    if (getField(r, "Status") === "Open") open++;
  }
  const inPeriode = lessen.filter(r => {
    const dt = parseDateField(getField(r, "Datum"));
    return dt && daysBetween(today, dt) >= 0 && daysBetween(today, dt) <= periodDays;
  }).length;

  return { aanwezig: true, leeg: false, totaal: lessen.length, perCategorie, open, inPeriode };
}

// ── Zone 1 — Aandacht ────────────────────────────────────────────────────
// Beslissing: waar besteed ik vandaag mijn halfuur aan?
// Verzamelt uitsluitend wat al uit de andere zones/domeinen komt — geen
// nieuwe databron.
function computeZone1(bundle, agentLookup, today) {
  const items = [];

  const acties = rows(bundle, "acties");
  if (acties) {
    const qcOpen = acties.filter(r => matchAgentValue(getField(r, "Agent"), agentLookup) === "quality-control" && getField(r, "Status") !== "Klaar");
    if (qcOpen.length) items.push({ type: "qc", ernst: "rood", label: `${qcOpen.length} QC-bevinding(en) die een menselijke blik vragen`, rows: qcOpen });

    const overDeadline = acties.filter(r => {
      const dt = parseDateField(getField(r, "Deadline"));
      return dt && daysBetween(today, dt) < 0 && getField(r, "Status") !== "Klaar";
    });
    if (overDeadline.length) items.push({ type: "acties-deadline", ernst: "rood", label: `${overDeadline.length} actie(s) over de deadline`, rows: overDeadline });
  }

  const ks = rows(bundle, "klantsucces");
  if (ks) {
    const risico = ks.filter(r => ["Oranje", "Rood"].includes(getField(r, "Health")));
    if (risico.length) items.push({ type: "klantsucces", ernst: risico.some(r => getField(r, "Health") === "Rood") ? "rood" : "oranje", label: `${risico.length} klant(en) op oranje of rood in Klantsucces`, rows: risico });
  }

  const sf = rows(bundle, "sales_funnel");
  if (sf) {
    const stil = sf.filter(r => {
      const dt = parseDateField(getField(r, "Volgende Actie Deadline"));
      const status = getField(r, "Opvolg Status");
      return dt && daysBetween(today, dt) < 0 && !["Gewonnen", "Verloren"].includes(status);
    });
    if (stil.length) items.push({ type: "deals-stil", ernst: "oranje", label: `${stil.length} deal(s) met een verlopen vervolgactie`, rows: stil });
  }

  const verouderdeDomeinen = Object.entries(bundle.domains)
    .filter(([, d]) => isStale(d.staleAt, today))
    .map(([key]) => key);
  if (verouderdeDomeinen.length) {
    items.push({ type: "verouderd", ernst: "grijs", label: `${verouderdeDomeinen.length} domein(en) met data ouder dan ${STALE_DAYS} dagen`, domeinen: verouderdeDomeinen });
  }

  const order = { rood: 0, grijs: 1, oranje: 2, groen: 3 };
  items.sort((a, b) => order[a.ernst] - order[b.ernst]);
  return items;
}

if (typeof module !== "undefined") {
  module.exports = {
    STALE_DAYS, CONTEXT_ROOD_DAYS, CONTEXT_ORANJE_DAYS,
    daysBetween, parseDateField, isStale,
    computeZone1, computeZone2, computeZone3, computeZone4, computeZone5,
  };
}
