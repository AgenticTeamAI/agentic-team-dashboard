/* Strikte normalisatie van een dashboard_metrics-payload (b32 / AT-003).
 *
 * Alles wat uit een metricsbestand of uit de werkruimte-entry komt is
 * onbetrouwbare invoer: een agent onder prompt-injection, of wie dan ook met
 * schrijfrecht op het domein, kan er willekeurige tekst in zetten. Deze
 * module bouwt een NIEUW object met uitsluitend de velden die het dashboard
 * kent, elk in het verwachte type en met een maximale lengte. Onbekende
 * velden vallen weg; verkeerde types worden een veilige default (0, "",
 * null). De renderlaag escapet daarbovenop nog steeds alles (defense in
 * depth) — maar zelfs zonder esc() kan hier geen markup meer doorheen.
 *
 * Dezelfde regels staan server-side in agentic-team-werkruimte
 * (src/domeinen/metrics.ts), die de entry al genormaliseerd opslaat. Houd
 * beide bestanden gelijk (backlog s31: driftgate).
 */

const METRICS_MAX = {
  tekstKort: 120,
  tekst: 300,
  lijst: 50,
  sleutel: 60,
  buckets: 60,
  weken: 104,
};

const ERNST_TOEGESTAAN = ["rood", "oranje", "groen", "grijs"];
const AANDACHT_TYPES = ["verouderd", "deadline", "context", "leeg", "overig"];

function saneerGetal(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function saneerGetalOfNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function saneerTekst(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function saneerTekstOfNull(v, max) {
  return typeof v === "string" && v.length ? v.slice(0, max) : null;
}

function saneerDatum(v) {
  // Alleen JJJJ-MM-DD of een ISO-tijdstempel; alles anders → null.
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(v)) return null;
  return Number.isNaN(Date.parse(v)) ? null : v;
}

function saneerHttpsUrl(v) {
  if (typeof v !== "string" || v.length > 500) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.href : null;
  } catch (e) { return null; }
}

function saneerSleutel(k) {
  // Sleutels van per_fase/per_categorie: platte tekst, begrensd.
  return typeof k === "string" ? k.slice(0, METRICS_MAX.sleutel) : null;
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/* Object met tellingen: { sleutel: getal } — alleen string-sleutels, alleen getallen. */
function saneerTellingen(v) {
  const uit = {};
  if (!isObject(v)) return uit;
  for (const [k, n] of Object.entries(v).slice(0, METRICS_MAX.lijst)) {
    const sleutel = saneerSleutel(k);
    if (sleutel === null || sleutel === "") continue;
    uit[sleutel] = saneerGetal(n);
  }
  return uit;
}

function saneerTekstLijst(v, max) {
  return Array.isArray(v) ? v.filter(s => typeof s === "string").slice(0, METRICS_MAX.lijst).map(s => s.slice(0, max)) : [];
}

/* Hoofdingang. `schema` = window.AGENTIC_TEAM_SCHEMA (datadomeinen + agents);
 * domein- en agentsleutels die niet in het schema staan worden weggelaten.
 * Geeft altijd een object terug; de versiecontrole blijft in metrics.js. */
function saneerMetricsPayload(raw, schema) {
  if (!isObject(raw)) return null;
  const domeinSlugs = schema && schema.datadomeinen ? Object.keys(schema.datadomeinen) : [];
  const agentSlugs = schema && Array.isArray(schema.agents) ? schema.agents.map(a => a.slug) : [];

  const uit = {};
  if ("versie" in raw) uit.versie = saneerGetalOfNull(raw.versie);
  if ("type" in raw) uit.type = saneerTekst(raw.type, METRICS_MAX.tekstKort);
  uit.gegenereerd_op = saneerDatum(raw.gegenereerd_op);
  uit.bron_label = saneerTekstOfNull(raw.bron_label, METRICS_MAX.tekstKort);
  uit.door = saneerTekstOfNull(raw.door, METRICS_MAX.tekstKort);
  uit.waarschuwingen = saneerTekstLijst(raw.waarschuwingen, METRICS_MAX.tekst);

  if (isObject(raw.periode)) {
    const weken = saneerGetalOfNull(raw.periode.weken);
    uit.periode = { weken: weken && weken >= 1 && weken <= METRICS_MAX.weken ? Math.round(weken) : null };
    if (uit.periode.weken === null) uit.periode = null;
  }

  if (Array.isArray(raw.aandacht)) {
    uit.aandacht = raw.aandacht.filter(isObject).slice(0, METRICS_MAX.lijst).map(it => ({
      type: AANDACHT_TYPES.includes(it.type) ? it.type : "overig",
      ernst: ERNST_TOEGESTAAN.includes(it.ernst) ? it.ernst : "grijs",
      label: saneerTekst(it.label, METRICS_MAX.tekst),
      link: saneerHttpsUrl(it.link),
    }));
  }

  if (isObject(raw.domeinen)) {
    uit.domeinen = {};
    for (const slug of domeinSlugs) {
      const d = raw.domeinen[slug];
      if (!isObject(d)) continue;
      uit.domeinen[slug] = {
        laatst_bijgewerkt: saneerDatum(d.laatst_bijgewerkt),
        rijen: saneerGetal(d.rijen),
      };
    }
  }

  if (isObject(raw.acties)) {
    uit.acties = {
      totaal: saneerGetal(raw.acties.totaal),
      afgerond: saneerGetal(raw.acties.afgerond),
      verstreken: saneerGetal(raw.acties.verstreken),
      klaar_verstreken: saneerGetal(raw.acties.klaar_verstreken),
      opmerking: saneerTekstOfNull(raw.acties.opmerking, METRICS_MAX.tekst),
    };
  }
  if (isObject(raw.sales_funnel)) {
    uit.sales_funnel = {
      per_fase: saneerTellingen(raw.sales_funnel.per_fase),
      verwachte_omzet_totaal: saneerGetal(raw.sales_funnel.verwachte_omzet_totaal),
      opmerking: saneerTekstOfNull(raw.sales_funnel.opmerking, METRICS_MAX.tekst),
    };
  }
  if (isObject(raw.content)) {
    uit.content = {
      gepubliceerd: saneerGetal(raw.content.gepubliceerd),
      gepland_in_periode: saneerGetal(raw.content.gepland_in_periode),
      totaal: saneerGetal(raw.content.totaal),
    };
  }
  if (isObject(raw.klantsucces)) {
    uit.klantsucces = { in_onboarding: saneerGetal(raw.klantsucces.in_onboarding), totaal: saneerGetal(raw.klantsucces.totaal) };
  }
  if (isObject(raw.backlog)) {
    uit.backlog = { besloten: saneerGetal(raw.backlog.besloten), done: saneerGetal(raw.backlog.done), totaal: saneerGetal(raw.backlog.totaal) };
  }
  if (isObject(raw.lessen)) {
    uit.lessen = {
      totaal: saneerGetal(raw.lessen.totaal),
      open: saneerGetal(raw.lessen.open),
      in_periode: saneerGetal(raw.lessen.in_periode),
      per_categorie: saneerTellingen(raw.lessen.per_categorie),
    };
  }

  if (isObject(raw.weekreeks)) {
    const buckets = Array.isArray(raw.weekreeks.buckets) ? raw.weekreeks.buckets.filter(isObject).slice(0, METRICS_MAX.buckets) : [];
    uit.weekreeks = {
      bronnen: saneerTekstLijst(raw.weekreeks.bronnen, METRICS_MAX.sleutel),
      buckets: buckets.map(b => {
        const w = isObject(b.waarden) ? b.waarden : {};
        return {
          week_start: saneerDatum(b.week_start),
          label: saneerTekstOfNull(b.label, METRICS_MAX.sleutel),
          totaal: saneerGetalOfNull(b.totaal),
          waarden: {
            interacties: saneerGetal(w.interacties),
            dagverslagen: saneerGetal(w.dagverslagen),
            lessen_inzichten: saneerGetal(w.lessen_inzichten),
            content_kalender: saneerGetal(w.content_kalender),
          },
        };
      }),
    };
  }

  if (isObject(raw.agents)) {
    const perAgent = {};
    if (isObject(raw.agents.per_agent)) {
      for (const slug of agentSlugs) {
        const t = raw.agents.per_agent[slug];
        if (!isObject(t)) continue;
        perAgent[slug] = {
          aantal_periode: saneerGetal(t.aantal_periode),
          aantal_totaal: saneerGetal(t.aantal_totaal),
          laatst: saneerDatum(t.laatst),
        };
      }
    }
    uit.agents = { veld_aanwezig: raw.agents.veld_aanwezig === false ? false : true, per_agent: perAgent };
  }

  if (isObject(raw.bedrijfscontext)) {
    const b = raw.bedrijfscontext;
    uit.bedrijfscontext = {
      bron: saneerTekstOfNull(b.bron, METRICS_MAX.tekstKort),
      placeholders_open: saneerTekstLijst(b.placeholders_open, METRICS_MAX.tekstKort),
      projectkennis_kopie_laatst_bijgewerkt: saneerDatum(b.projectkennis_kopie_laatst_bijgewerkt),
      laatst_bijgewerkt: saneerDatum(b.laatst_bijgewerkt),
    };
  }

  return uit;
}

if (typeof module !== "undefined") {
  module.exports = { saneerMetricsPayload, METRICS_MAX, ERNST_TOEGESTAAN, AANDACHT_TYPES };
}
