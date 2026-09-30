/* f54 — metrics v3: de werkbak en de vaste taken voor Notion-klanten.
 *
 * Staan je acties en vaste taken in Notion (of een ander CRM), dan ziet het
 * dashboard ze niet rechtstreeks. De dagstart schrijft ze daarom mee in het
 * metricsbestand: een voor_jou-blok (in de volgorde en nummering van "Ter
 * goedkeuring", dus nummer 3 is overal hetzelfde) en een ritmetaken-blok. Dat
 * is een momentopname van de dagstart: lezen, en afhandelen in Notion.
 *
 * Alleen als het werk níet in de werkruimte staat; zijn er rijen, dan winnen
 * die altijd (die zijn live). */

function metricsVoorJou(ctx) {
  if (!ctx || !ctx.bundle || rows(ctx.bundle, "acties")) return null;
  const w = ctx.metricsWerk;
  return w && Array.isArray(w.voorJou) ? w.voorJou : null;
}

/* De ritmetaken uit het metricsbestand, in de vorm van rijen — zodat de
 * week, de statusregels en de klaar-check er gewoon mee rekenen. */
function metricsRitmeRijen(ctx) {
  if (!ctx || !ctx.bundle || dataRijenVan(ctx, "ritmetaken")) return null;
  const w = ctx.metricsWerk;
  if (!w || !Array.isArray(w.ritmetaken)) return null;
  return w.ritmetaken.map((t, i) => ({
    __entryId: `metrics-${i}`, __url: t.url || null,
    Taak: t.taak, Agent: t.agent || "", Ritme: t.ritme, Actief: t.actief === true,
    "Laatst gedraaid": t.laatst_gedraaid || null, Volgorde: t.volgorde,
  }));
}

function notionVoorJouHtml(ctx, items) {
  const nu = ctx.today || new Date();
  const w = ctx.metricsWerk || {};
  const stand = w.gegenereerdOp ? vtWanneer(parseDateField(w.gegenereerdOp), nu) : null;
  const kaart = (it) => {
    const sinds = it.sinds ? parseDateField(it.sinds) : null;
    const dagen = sinds ? Math.floor((nu - sinds) / 86400000) : null;
    const meta = [`<span class="soort-pil">${esc(SOORT_LABEL[it.soort] || "")}</span>`];
    if (it.te_laat) meta.push(`<span class="pil-laat">te laat</span>`);
    if (it.specialist) meta.push(`<span>van ${esc(it.specialist)}</span>`);
    if (dagen !== null && dagen >= 1) meta.push(`<span>${dagen === 1 ? "1 dag" : dagen + " dagen"}</span>`);
    if (it.deadline) meta.push(`<span>deadline ${esc(vjDatumKort(it.deadline))}</span>`);
    return `<li class="vj-kaart"><span class="vj-nr" aria-hidden="true">${it.nr}</span>
      <div class="vj-kaart-inhoud"><p class="vj-titel"><span class="visueel-verborgen">Nummer ${it.nr}: </span>${esc(it.titel)}</p>
        <p class="baan-meta">${meta.join("")}</p>
        ${it.url ? `<p><a class="detail-link" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">Open in Notion ↗</a></p>` : ""}</div></li>`;
  };
  return `${typeof stilKaartHtml === "function" ? stilKaartHtml(ctx) : ""}
    <div class="vj-kop"><h2>Voor jou <span class="vj-teller">${items.length}</span></h2>
      ${stand ? `<span class="footnote">stand van je dagstart, ${esc(stand)}</span>` : ""}
      ${typeof hoeWerktDitHtml === "function" ? hoeWerktDitHtml("notion", "Waarom staat dit in Notion?") : ""}</div>
    <p class="footnote">Je acties staan in Notion: afhandelen doe je daar, of vraag het je team in Claude. De nummers zijn dezelfde als in je dagstart.</p>
    ${items.length ? `<ol class="vj-lijst notion-werkbak">${items.map(kaart).join("")}</ol>`
      : `<p class="vj-leeg">Niets voor jou in je dagstart van vanochtend.</p>`}`;
}

/* De vaste taken uit het metricsbestand, alleen lezen: dezelfde statusregels
 * als in de werkruimte, met een link naar Notion. */
function notionTakenHtml(ctx, rijen) {
  const nu = ctx.today || new Date();
  const rij = (t) => {
    const s = taakStatus(t, nu);
    return `<li class="vt-rij${t.Actief ? "" : " uit"}"><div class="vt-rij-kop"><span class="vt-titel">${esc(t.Taak)}</span>
      <span class="footnote">${esc([agentWeergaveNaam(ctx.schema, t.Agent) || t.Agent, RITME_KLANTTAAL[t.Ritme] || t.Ritme, t.Actief ? "" : "uit"].filter(Boolean).join(" · "))}</span></div>
      <p class="vt-status vt-${s.k}">${esc(s.tekst)}</p>
      ${t.__url ? `<a class="detail-link" href="${esc(t.__url)}" target="_blank" rel="noopener noreferrer">Open in Notion ↗</a>` : ""}</li>`;
  };
  return `<section class="vt-vak"><h2>Je vaste taken · ${rijen.filter(t => t.Actief).length} aan</h2>
    <p class="footnote">Stand van je dagstart. Aanpassen doe je in Notion, of zeg het je team in Claude.</p>
    <ul class="vt-lijst">${rijen.map(rij).join("")}</ul></section>`;
}

if (typeof module !== "undefined") {
  module.exports = { metricsVoorJou, metricsRitmeRijen, notionVoorJouHtml, notionTakenHtml };
}
