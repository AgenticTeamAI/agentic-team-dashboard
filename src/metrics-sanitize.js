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

/* Coercie in plaats van nullen (review b32): de Coördinator (een LLM) stelt
 * het bestand zelf samen en schrijft getallen soms als string. Wat niet te
 * coerceren is wordt 0/null én een regel in `waarschuwingen`, zodat een
 * afwijkend bestand zichtbaar is in plaats van een plausibel nul-dashboard. */
function maakContext() {
  return { waarschuwingen: [] };
}
function waarschuw(ctx, pad, waarde) {
  if (ctx.waarschuwingen.length < METRICS_MAX.lijst) {
    ctx.waarschuwingen.push(`Metricsbestand: veld "${pad}" had een onbruikbare waarde (${typeof waarde}) en is genegeerd.`);
  }
}

function naarGetal(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && v.length <= 40) {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function saneerGetal(v, ctx, pad) {
  const n = naarGetal(v);
  if (n === null && v !== undefined && v !== null) waarschuw(ctx, pad, v);
  return n === null ? 0 : n;
}
function saneerGetalOfNull(v, ctx, pad) {
  const n = naarGetal(v);
  if (n === null && v !== undefined && v !== null) waarschuw(ctx, pad, v);
  return n;
}

function saneerTekst(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function saneerTekstOfNull(v, max) {
  return typeof v === "string" && v.length ? v.slice(0, max) : null;
}

const DATUM_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
function saneerDatum(v, ctx, pad) {
  // Alleen JJJJ-MM-DD of een ISO-tijdstempel (offset met of zonder dubbele punt).
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !DATUM_RE.test(v)) { waarschuw(ctx, pad, v); return null; }
  const normaal = v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  if (Number.isNaN(Date.parse(normaal))) { waarschuw(ctx, pad, v); return null; }
  return v;
}

function saneerHttpsUrl(v) {
  if (typeof v !== "string" || v.length > 500) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.href : null;
  } catch (e) { return null; }
}

// Korte code-achtige waarde (aandacht.type): alleen letters/cijfers/-/_.
function saneerCode(v, fallback) {
  return typeof v === "string" && /^[a-z0-9_-]{1,40}$/i.test(v) ? v.toLowerCase() : fallback;
}

function saneerSleutel(k) {
  // Sleutels van per_fase/per_categorie: platte tekst, begrensd.
  return typeof k === "string" ? k.slice(0, METRICS_MAX.sleutel) : null;
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/* Object met tellingen: { sleutel: getal } — alleen string-sleutels, alleen getallen. */
function saneerTellingen(v, ctx, pad) {
  const uit = {};
  if (!isObject(v)) return uit;
  for (const [k, n] of Object.entries(v).slice(0, METRICS_MAX.lijst)) {
    const sleutel = saneerSleutel(k);
    if (sleutel === null || sleutel === "") continue;
    uit[sleutel] = saneerGetal(n, ctx, `${pad}.${sleutel}`);
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
  const agents = schema && Array.isArray(schema.agents) ? schema.agents : [];
  const ctx = maakContext();

  const uit = {};
  if ("versie" in raw) uit.versie = saneerGetalOfNull(raw.versie, ctx, "versie");
  if ("type" in raw) uit.type = saneerTekst(raw.type, METRICS_MAX.tekstKort);
  uit.gegenereerd_op = saneerDatum(raw.gegenereerd_op, ctx, "gegenereerd_op");
  uit.bron_label = saneerTekstOfNull(raw.bron_label, METRICS_MAX.tekstKort);
  uit.door = saneerTekstOfNull(raw.door, METRICS_MAX.tekstKort);
  uit.minuten_per_actie = saneerGetalOfNull(raw.minuten_per_actie, ctx, "minuten_per_actie");

  if (isObject(raw.periode)) {
    const weken = saneerGetalOfNull(raw.periode.weken, ctx, "periode.weken");
    uit.periode = {
      weken: weken !== null && weken >= 1 && weken <= METRICS_MAX.weken ? Math.round(weken) : null,
      van: saneerDatum(raw.periode.van, ctx, "periode.van"),
      tot: saneerDatum(raw.periode.tot, ctx, "periode.tot"),
    };
    if (uit.periode.weken === null) { waarschuw(ctx, "periode.weken", raw.periode.weken); uit.periode = null; }
  }

  if (Array.isArray(raw.aandacht)) {
    uit.aandacht = raw.aandacht.filter(isObject).slice(0, METRICS_MAX.lijst).map((it, i) => {
      if (typeof it.ernst === "string" && !ERNST_TOEGESTAAN.includes(it.ernst)) waarschuw(ctx, `aandacht[${i}].ernst`, it.ernst);
      return {
        type: saneerCode(it.type, "overig"),
        ernst: ERNST_TOEGESTAAN.includes(it.ernst) ? it.ernst : "grijs",
        label: saneerTekst(it.label, METRICS_MAX.tekst),
        link: saneerHttpsUrl(it.link),
      };
    });
  }

  if (isObject(raw.domeinen)) {
    uit.domeinen = {};
    for (const slug of domeinSlugs) {
      const d = raw.domeinen[slug];
      if (!isObject(d)) continue;
      uit.domeinen[slug] = {
        laatst_bijgewerkt: saneerDatum(d.laatst_bijgewerkt, ctx, `domeinen.${slug}.laatst_bijgewerkt`),
        rijen: saneerGetal(d.rijen, ctx, `domeinen.${slug}.rijen`),
      };
    }
    const onbekend = Object.keys(raw.domeinen).filter(k => !domeinSlugs.includes(k));
    if (onbekend.length) waarschuw(ctx, `domeinen (${onbekend.length} onbekende sleutel(s))`, onbekend[0]);
  }

  if (isObject(raw.acties)) {
    uit.acties = {
      totaal: saneerGetal(raw.acties.totaal, ctx, "acties.totaal"),
      afgerond: saneerGetal(raw.acties.afgerond, ctx, "acties.afgerond"),
      verstreken: saneerGetal(raw.acties.verstreken, ctx, "acties.verstreken"),
      klaar_verstreken: saneerGetal(raw.acties.klaar_verstreken, ctx, "acties.klaar_verstreken"),
      opmerking: saneerTekstOfNull(raw.acties.opmerking, METRICS_MAX.tekst),
    };
  }
  if (isObject(raw.sales_funnel)) {
    uit.sales_funnel = {
      per_fase: saneerTellingen(raw.sales_funnel.per_fase, ctx, "sales_funnel.per_fase"),
      verwachte_omzet_totaal: saneerGetal(raw.sales_funnel.verwachte_omzet_totaal, ctx, "sales_funnel.verwachte_omzet_totaal"),
      opmerking: saneerTekstOfNull(raw.sales_funnel.opmerking, METRICS_MAX.tekst),
    };
  }
  if (isObject(raw.content)) {
    uit.content = {
      gepubliceerd: saneerGetal(raw.content.gepubliceerd, ctx, "content.gepubliceerd"),
      gepland_in_periode: saneerGetal(raw.content.gepland_in_periode, ctx, "content.gepland_in_periode"),
      totaal: saneerGetal(raw.content.totaal, ctx, "content.totaal"),
    };
  }
  if (isObject(raw.klantsucces)) {
    uit.klantsucces = {
      in_onboarding: saneerGetal(raw.klantsucces.in_onboarding, ctx, "klantsucces.in_onboarding"),
      totaal: saneerGetal(raw.klantsucces.totaal, ctx, "klantsucces.totaal"),
    };
  }
  if (isObject(raw.backlog)) {
    uit.backlog = {
      besloten: saneerGetal(raw.backlog.besloten, ctx, "backlog.besloten"),
      done: saneerGetal(raw.backlog.done, ctx, "backlog.done"),
      totaal: saneerGetal(raw.backlog.totaal, ctx, "backlog.totaal"),
    };
  }
  if (isObject(raw.lessen)) {
    uit.lessen = {
      totaal: saneerGetal(raw.lessen.totaal, ctx, "lessen.totaal"),
      open: saneerGetal(raw.lessen.open, ctx, "lessen.open"),
      in_periode: saneerGetal(raw.lessen.in_periode, ctx, "lessen.in_periode"),
      per_categorie: saneerTellingen(raw.lessen.per_categorie, ctx, "lessen.per_categorie"),
    };
  }

  if (isObject(raw.weekreeks)) {
    const buckets = Array.isArray(raw.weekreeks.buckets) ? raw.weekreeks.buckets.filter(isObject).slice(0, METRICS_MAX.buckets) : [];
    uit.weekreeks = {
      bronnen: saneerTekstLijst(raw.weekreeks.bronnen, METRICS_MAX.sleutel),
      buckets: buckets.map((b, i) => {
        const w = isObject(b.waarden) ? b.waarden : {};
        const pad = `weekreeks.buckets[${i}]`;
        return {
          week_start: saneerDatum(b.week_start, ctx, `${pad}.week_start`),
          label: saneerTekstOfNull(b.label, METRICS_MAX.sleutel),
          totaal: saneerGetalOfNull(b.totaal, ctx, `${pad}.totaal`),
          waarden: {
            interacties: saneerGetal(w.interacties, ctx, `${pad}.interacties`),
            dagverslagen: saneerGetal(w.dagverslagen, ctx, `${pad}.dagverslagen`),
            lessen_inzichten: saneerGetal(w.lessen_inzichten, ctx, `${pad}.lessen_inzichten`),
            content_kalender: saneerGetal(w.content_kalender, ctx, `${pad}.content_kalender`),
          },
        };
      }),
    };
  }

  if (isObject(raw.agents)) {
    const perAgent = {};
    if (isObject(raw.agents.per_agent)) {
      for (const [sleutel, t] of Object.entries(raw.agents.per_agent).slice(0, METRICS_MAX.lijst)) {
        if (!isObject(t)) continue;
        // Sleutel mag slug óf weergavenaam zijn (de producer schrijft beide).
        const agent = agentVoorSleutel(agents, sleutel);
        if (!agent) { waarschuw(ctx, `agents.per_agent.${String(sleutel).slice(0, 40)}`, "onbekende agent"); continue; }
        perAgent[agent.slug] = {
          aantal_periode: saneerGetal(t.aantal_periode, ctx, `agents.${agent.slug}.aantal_periode`),
          aantal_totaal: saneerGetal(t.aantal_totaal, ctx, `agents.${agent.slug}.aantal_totaal`),
          laatst: saneerDatum(t.laatst, ctx, `agents.${agent.slug}.laatst`),
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
      projectkennis_kopie_laatst_bijgewerkt: saneerDatum(b.projectkennis_kopie_laatst_bijgewerkt, ctx, "bedrijfscontext.projectkennis_kopie_laatst_bijgewerkt"),
      laatst_bijgewerkt: saneerDatum(b.laatst_bijgewerkt, ctx, "bedrijfscontext.laatst_bijgewerkt"),
    };
  }

  uit.waarschuwingen = saneerTekstLijst(raw.waarschuwingen, METRICS_MAX.tekst).concat(ctx.waarschuwingen).slice(0, METRICS_MAX.lijst);
  return uit;
}

function agentVoorSleutel(agents, sleutel) {
  const s = String(sleutel).trim().toLowerCase();
  if (!s) return null;
  return agents.find(a => a.slug === s || String(a.displayName || "").toLowerCase() === s) || null;
}

if (typeof module !== "undefined") {
  module.exports = { saneerMetricsPayload, METRICS_MAX, ERNST_TOEGESTAAN };
}
