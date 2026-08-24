/* De interne metricsvorm — dit is de enige vorm die de renderlaag (render.js,
 * homepage.js) ooit ziet. Er zijn twee manieren om hem te vullen:
 *
 *   1. buildMetricsFromRowsBundle(bundle, ...)  — Excel-route en data/*.json-route:
 *      rekent de vijf zones, de adoptiescore, de weekreeks, de tijdwinst en de
 *      agent-ranglijst uit de rijen in de bundle, met de bestaande zones.js-
 *      functies. Dit ís de bestaande rij-berekening; hij verandert niet, hij
 *      krijgt alleen een naam en een vaste uitvoervorm.
 *
 *   2. parseNotionMetricsFile(raw, ...)         — Notion-route: leest een al
 *      kant-en-klaar metricsbestand (zie ONTWERP-wekelijkse-dashboardbijwerking.md)
 *      en zet het om in DEZELFDE vorm, zonder ooit een rij te zien.
 *
 * Beide leveren een object met exact dezelfde velden: z1..z5, activiteit,
 * adopt, tijdwinst, agentUsage, sporenTotaal, meta. app.js->buildContext()
 * kiest welke van de twee draait; render.js/homepage.js weten niet welke het
 * was.
 *
 * Versiecontrole: het metricsbestand draagt "versie" (geheel getal). Deze
 * module herkent alleen METRICS_VERSION. Bij een andere versie wordt er
 * NIETS berekend of getekend — parseNotionMetricsFile geeft een ok:false
 * terug met de reden, en de aanroeper (app.js) moet dat als een aparte
 * toestand tonen (geen dashboard, wel een duidelijke melding). Stil een
 * verkeerde grafiek tekenen is erger dan niets tekenen.
 */

const METRICS_VERSION = 1;

// ── Route 1 & 2: rijen → metrics (bestaande berekening, nu met een naam) ──
function buildMetricsFromRowsBundle(bundle, schema, agentLookup, today, periodWeeks, minutenPerActie) {
  const periodDays = periodWeeks * 7;

  const z1ruw = computeZone1(bundle, agentLookup, today);
  const z2 = computeZone2(bundle, today);
  const z1 = voegContextToeAanAandacht(z1ruw, z2);
  const z3 = computeZone3(bundle, agentLookup, schema, today, periodDays);
  const z4 = computeZone4(bundle, today, periodDays);
  const z5 = computeZone5(bundle, today, periodDays);

  const activiteit = computeActiviteitPerWeek(bundle, today, periodWeeks);
  const adopt = computeAdoptiescore(bundle, schema, today, periodWeeks);
  const tijdwinst = computeTijdwinst(bundle, minutenPerActie);
  const agentUsage = computeAgentGebruikRanking(bundle, agentLookup, schema, today, periodDays);
  const sporenTotaal = activiteit.buckets.reduce((s, b) => s + b.totaal, 0);

  return {
    versie: METRICS_VERSION,
    bron: bundle.source,
    z1, z2, z3, z4, z5, activiteit, adopt, tijdwinst, agentUsage, sporenTotaal,
    periodWeeks, periodDays,
    meta: {
      bronLabel: bundle.sourceLabel,
      gegenereerdOp: null, // rij-routes hebben geen apart "gegenereerd_op" — het IS het moment van inlezen
      door: null,
      periode: null, // geen vaste periode in het bestand — de gebruiker kiest hem met de schakelaar
      domeinenGevonden: Object.keys(bundle.domains).length,
    },
    waarschuwingen: bundle.waarschuwingen,
    rawActies: null, // alleen relevant voor de metrics-route (live herrekenen van tijdwinst)
  };
}

// ── Route 3: kant-en-klaar metricsbestand → metrics ────────────────────
// `raw` is de al-geparste JSON van het bestand. Retourneert altijd
// { ok, ...}. Bij ok:false NOOIT een metrics-object teruggeven — de
// aanroeper mag dan niets tekenen.
function parseNotionMetricsFile(rawOnbetrouwbaar, schema, today, minutenPerActie) {
  // b32: eerst normaliseren — vanaf hier bevat `raw` uitsluitend bekende
  // velden in het verwachte type (zie metrics-sanitize.js).
  const raw = saneerMetricsPayload(rawOnbetrouwbaar, schema);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, kind: "leeg-of-onherkenbaar", tekst: "Dit bestand is leeg of geen geldig metricsbestand (geen JSON-object met een \"versie\"-veld)." };
  }
  const heeftKenmerk = ("versie" in raw) || ("type" in raw);
  if (!heeftKenmerk) {
    return { ok: false, kind: "leeg-of-onherkenbaar", tekst: "Dit bestand heeft geen \"versie\"- of \"type\"-veld en wordt daarom niet als metricsbestand herkend. Is dit een leeg bestand, of een export in het oude rijenformaat?" };
  }
  if (raw.versie !== METRICS_VERSION) {
    return {
      ok: false,
      kind: "onbekende-versie",
      versieGevonden: raw.versie ?? null,
      versieVerwacht: METRICS_VERSION,
      tekst: raw.versie == null
        ? `Dit metricsbestand heeft geen herkenbaar versienummer. Dit dashboard herkent versie ${METRICS_VERSION}.`
        : raw.versie > METRICS_VERSION
          ? `Dit metricsbestand is versie ${raw.versie} — nieuwer dan wat dit dashboard herkent (versie ${METRICS_VERSION}). Werk het dashboard bij naar de laatste release, of vraag om een export in het oudere formaat.`
          : `Dit metricsbestand is versie ${raw.versie} — ouder dan wat dit dashboard verwacht (versie ${METRICS_VERSION}). Vraag de Coördinator om een nieuwe export, of gebruik een oudere release van dit dashboard.`,
    };
  }

  const domeinenBlock = raw.domeinen || null;
  const weekreeksBlock = raw.weekreeks || null;
  const agentsBlock = raw.agents || null;
  const actiesBlock = raw.acties || null;

  const activiteit = buildActiviteitFromMetrics(weekreeksBlock, (raw.periode && raw.periode.weken) || 12);
  const z1 = buildZone1FromMetricsAandacht(raw.aandacht, domeinenBlock, today);
  const z2 = computeZone2({ bedrijfscontext: raw.bedrijfscontext ? mapBedrijfscontextBlock(raw.bedrijfscontext) : "niet-ondersteund-door-bundel" }, today);
  const z1Compleet = voegContextToeAanAandacht(z1, z2);
  const z3 = buildZone3FromMetrics(agentsBlock, schema);
  const z4 = buildZone4FromMetrics(raw);
  const z5 = buildZone5FromMetrics(raw.lessen);
  const adopt = buildAdoptFromMetrics(raw, activiteit, schema);
  const tijdwinst = buildTijdwinstFromMetrics(actiesBlock, minutenPerActie);
  const agentUsage = buildAgentUsageFromMetrics(agentsBlock, schema);
  const sporenTotaal = activiteit.buckets.reduce((s, b) => s + b.totaal, 0);

  const domeinenGevonden = domeinenBlock ? Object.keys(domeinenBlock).length : 0;

  return {
    ok: true,
    metrics: {
      versie: METRICS_VERSION,
      bron: "notion",
      z1: z1Compleet, z2, z3, z4, z5, activiteit, adopt, tijdwinst, agentUsage, sporenTotaal,
      periodWeeks: raw.periode ? raw.periode.weken : activiteit.weeks,
      periodDays: (raw.periode ? raw.periode.weken : activiteit.weeks) * 7,
      meta: {
        bronLabel: raw.bron_label || "Notion-export (metricsbestand)",
        gegenereerdOp: raw.gegenereerd_op ? parseDateField(raw.gegenereerd_op) : null,
        door: raw.door || null,
        periode: raw.periode || null,
        domeinenGevonden,
      },
      waarschuwingen: Array.isArray(raw.waarschuwingen) ? raw.waarschuwingen : [],
      rawActies: actiesBlock,
    },
  };
}

function mapBedrijfscontextBlock(b) {
  return {
    Bron: b.bron,
    Placeholders_open: b.placeholders_open || [],
    Projectkennis_kopie_laatst_bijgewerkt: b.projectkennis_kopie_laatst_bijgewerkt,
    staleAt: b.laatst_bijgewerkt ? new Date(b.laatst_bijgewerkt) : null,
  };
}

// ── Zone 1 uit een kant-en-klare aandachtlijst + het domeinen-blok ──────
// De Coördinator levert de inhoudelijke aandachtpunten al af (max. vijf,
// zie ontwerp); dit dashboard voegt uitsluitend de "verouderde domeinen"-
// regel toe, op dezelfde manier (STALE_DAYS) als bij de andere twee routes
// — dat is de enige aandacht-regel die het dashboard zelf mag toepassen
// zonder rijen te zien.
function buildZone1FromMetricsAandacht(aandachtRaw, domeinenBlock, today) {
  const items = (Array.isArray(aandachtRaw) ? aandachtRaw : []).map(it => ({
    type: it.type || "overig",
    ernst: it.ernst,
    label: it.label,
    link: it.link || null,
    rows: null,
  }));
  if (domeinenBlock) {
    const verouderd = Object.entries(domeinenBlock)
      .filter(([, d]) => isStale(d && d.laatst_bijgewerkt ? parseDateField(d.laatst_bijgewerkt) : null, today))
      .map(([k]) => k);
    if (verouderd.length) {
      items.push({ type: "verouderd", ernst: "grijs", label: `${verouderd.length} domein(en) met data ouder dan ${STALE_DAYS} dagen`, domeinen: verouderd, rows: null });
    }
  }
  const order = { rood: 0, grijs: 1, oranje: 2, groen: 3 };
  items.sort((a, b) => (order[a.ernst] ?? 9) - (order[b.ernst] ?? 9));
  return items;
}

// ── Zone 3 / gebruik-ranglijst uit het agents-blok ──────────────────────
function buildZone3FromMetrics(agentsBlock, schema) {
  const perModule = {};
  for (const agent of schema.agents) {
    const mod = agent.module;
    if (!perModule[mod]) perModule[mod] = [];
    const t = agentsBlock && agentsBlock.per_agent ? agentsBlock.per_agent[agent.slug] : null;
    perModule[mod].push({
      slug: agent.slug, displayName: agent.displayName, emoji: agent.emoji,
      geenSpoor: !t || !(t.aantal_totaal > 0),
      laatst: t && t.laatst ? parseDateField(t.laatst) : null,
      aantalPeriode: t ? (t.aantal_periode || 0) : 0,
      aantalTotaal: t ? (t.aantal_totaal || 0) : 0,
    });
  }
  const bronnenAanwezig = { metrics: !!agentsBlock };
  return { perModule, bronnenAanwezig, geenEnkeleBron: !agentsBlock };
}

function buildAgentUsageFromMetrics(agentsBlock, schema) {
  if (!agentsBlock) {
    return { status: "geen-bron", reden: "Dit metricsbestand bevat geen agents-blok — gebruik per agent is niet af te leiden. Bron ontbreekt." };
  }
  if (agentsBlock.veld_aanwezig === false) {
    return { status: "geen-veld", reden: "Het metricsbestand meldt dat het veld Agent niet gevuld voorkomt in de brondata. Gebruik per agent is daardoor niet af te leiden. Zodra dit veld gevuld is, verschijnt de ranglijst vanzelf." };
  }
  const perAgent = agentsBlock.per_agent || {};
  const ranking = schema.agents
    .map(a => {
      const t = perAgent[a.slug] || {};
      return { slug: a.slug, label: a.displayName, emoji: a.emoji, module: a.module, value: t.aantal_periode || 0, totaal: t.aantal_totaal || 0 };
    })
    .sort((a, b) => b.value - a.value || b.totaal - a.totaal);
  return { status: "ok", ranking };
}

// ── Zone 4 / opbrengst uit de losse blokken ─────────────────────────────
function buildZone4FromMetrics(raw) {
  const out = {};
  if (raw.acties) {
    out.acties = {
      totaal: raw.acties.totaal || 0,
      afgerond: raw.acties.afgerond || 0,
      opmerking: raw.acties.opmerking || "Aangeleverd als kant-en-klare telling door de Coördinator (Notion-route) — geen rijen ingelezen.",
    };
  }
  if (raw.sales_funnel) {
    out.salesFunnel = {
      perFase: raw.sales_funnel.per_fase || {},
      totaalVerwachteOmzet: raw.sales_funnel.verwachte_omzet_totaal || 0,
      opmerking: raw.sales_funnel.opmerking || "Aangeleverd als kant-en-klare telling door de Coördinator.",
    };
  }
  if (raw.content) {
    out.content = { gepubliceerd: raw.content.gepubliceerd || 0, geplandInPeriode: raw.content.gepland_in_periode || 0, totaal: raw.content.totaal || 0 };
  }
  if (raw.klantsucces) {
    out.klantsucces = { inOnboarding: raw.klantsucces.in_onboarding || 0, totaal: raw.klantsucces.totaal || 0 };
  }
  if (raw.backlog) {
    out.backlog = { besloten: raw.backlog.besloten || 0, done: raw.backlog.done || 0, totaal: raw.backlog.totaal || 0 };
  }
  return out;
}

// ── Zone 5 / leren uit het lessen-blok ──────────────────────────────────
function buildZone5FromMetrics(lessenBlock) {
  if (!lessenBlock) return { aanwezig: false };
  if (!lessenBlock.totaal) return { aanwezig: true, leeg: true };
  return {
    aanwezig: true, leeg: false,
    totaal: lessenBlock.totaal,
    perCategorie: lessenBlock.per_categorie || {},
    open: lessenBlock.open || 0,
    inPeriode: lessenBlock.in_periode || 0,
  };
}

// ── Weekreeks uit het weekreeks-blok ────────────────────────────────────
function buildActiviteitFromMetrics(weekreeksBlock, weeksFallback) {
  if (!weekreeksBlock || !Array.isArray(weekreeksBlock.buckets) || !weekreeksBlock.buckets.length) {
    return { buckets: [], aanwezigeBronnen: [], geenEnkeleBron: true, weeks: weeksFallback, periodStart: null };
  }
  const aanwezigeBronnen = Array.isArray(weekreeksBlock.bronnen) ? weekreeksBlock.bronnen : [];
  const buckets = weekreeksBlock.buckets.map((b, i) => {
    const waarden = b.waarden || {};
    const values = {
      interacties: waarden.interacties || 0,
      dagverslagen: waarden.dagverslagen || 0,
      lessen_inzichten: waarden.lessen_inzichten || 0,
      content_kalender: waarden.content_kalender || 0,
    };
    const totaal = typeof b.totaal === "number" ? b.totaal : Object.values(values).reduce((s, v) => s + v, 0);
    const weekStart = parseDateField(b.week_start);
    return {
      index: i, values, totaal, leeg: totaal === 0,
      weekStart,
      label: b.label || (weekStart ? weekStart.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit" }) : "?"),
    };
  });
  return { buckets, aanwezigeBronnen, geenEnkeleBron: aanwezigeBronnen.length === 0, weeks: buckets.length, periodStart: buckets[0] ? buckets[0].weekStart : null };
}

// ── Adoptiescore uit domeinen/weekreeks/acties ──────────────────────────
// Ritme en breedte zijn hier client-side afgeleid (dezelfde formule als de
// andere twee routes, zie zones.js), omdat de bouwstenen ervoor
// (weekreeks, domeinen) toch al in het bestand staan. Opvolging kan alleen
// uit een expliciet aangeleverd acties.verstreken/klaar_verstreken komen —
// "verstreken deadline" is geen telling die uit de andere blokken is af te
// leiden zonder rijen te zien.
function buildAdoptFromMetrics(raw, activiteit, schema) {
  const weken = activiteit.weeks || (raw.periode && raw.periode.weken) || 12;

  let ritme;
  if (activiteit.geenEnkeleBron) {
    ritme = { berekenbaar: false, reden: "Geen weekreeks-blok (of een leeg blok) aanwezig in dit metricsbestand." };
  } else {
    const wekenMetSpoor = activiteit.buckets.filter(b => !b.leeg).length;
    ritme = {
      berekenbaar: true, waarde: (wekenMetSpoor / weken) * 100, wekenMetSpoor, weken,
      aanwezigeBronnen: activiteit.aanwezigeBronnen,
      ontbrekendeBronnen: RITME_BRONNEN.filter(b => !activiteit.aanwezigeBronnen.includes(b)),
    };
  }

  const domeinenSchema = Object.keys(schema.datadomeinen);
  let breedte;
  if (!raw.domeinen) {
    breedte = { berekenbaar: false, reden: "Geen domeinen-blok aanwezig in dit metricsbestand." };
  } else {
    const metInhoud = domeinenSchema.filter(k => raw.domeinen[k] && (raw.domeinen[k].rijen || 0) > 0);
    breedte = { berekenbaar: true, waarde: (metInhoud.length / domeinenSchema.length) * 100, metInhoud: metInhoud.length, totaalDomeinen: domeinenSchema.length, domeinenLijst: metInhoud };
  }

  let opvolging;
  const acties = raw.acties;
  if (!acties || !acties.verstreken) {
    opvolging = { berekenbaar: false, reden: !acties ? "Geen acties-blok aanwezig in dit metricsbestand." : "Geen enkele actie met een verstreken deadline in dit metricsbestand — er is geen noemer om op te rekenen." };
  } else {
    opvolging = { berekenbaar: true, waarde: ((acties.klaar_verstreken || 0) / acties.verstreken) * 100, klaar: acties.klaar_verstreken || 0, verstreken: acties.verstreken };
  }

  const componenten = [
    { key: "ritme", label: "Ritme", ...ritme },
    { key: "breedte", label: "Breedte", ...breedte },
    { key: "opvolging", label: "Opvolging", ...opvolging },
  ];
  const berekenbaar = componenten.filter(c => c.berekenbaar);
  const afgerond = berekenbaar.map(c => Math.round(c.waarde));
  const adoptiescore = afgerond.length ? Math.round(afgerond.reduce((s, v) => s + v, 0) / afgerond.length) : null;
  return { componenten, adoptiescore, aantalBerekenbaar: berekenbaar.length, aantalComponenten: componenten.length, weken };
}

// ── Tijdwinst uit het acties-blok — blijft live herrekenbaar ───────────
// Geen rijen nodig: totaal/afgerond volstaan, dus de minuten-per-actie-
// instelling in de UI blijft ook voor de metrics-route direct aanpasbaar.
function buildTijdwinstFromMetrics(actiesBlock, minutenPerActie) {
  if (!actiesBlock) return { berekenbaar: false, afgerond: 0, totaal: 0, minutenPerActie, minuten: 0, uren: 0 };
  const afgerond = actiesBlock.afgerond || 0;
  const minuten = afgerond * minutenPerActie;
  return { berekenbaar: true, afgerond, totaal: actiesBlock.totaal || 0, minutenPerActie, minuten, uren: minuten / 60 };
}

if (typeof module !== "undefined") {
  module.exports = {
    METRICS_VERSION,
    buildMetricsFromRowsBundle, parseNotionMetricsFile,
    buildZone1FromMetricsAandacht, buildZone3FromMetrics, buildAgentUsageFromMetrics,
    buildZone4FromMetrics, buildZone5FromMetrics, buildActiviteitFromMetrics,
    buildAdoptFromMetrics, buildTijdwinstFromMetrics, mapBedrijfscontextBlock,
  };
}
