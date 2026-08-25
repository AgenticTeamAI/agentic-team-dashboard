/* f22 — Teamfeed: wat het agent-team doet, nieuwste boven.
 *
 * Bron is het domein `teamfeed` in de werkruimte van de klant (één entry per
 * post_activity-aanroep), live opgehaald via de daglink door
 * werkruimte-loader.js (bundle.teamfeed). Dit bestand doet alleen
 * normaliseren + renderen; het schrijft nooit iets. Berichten zijn tekst
 * van LLM-agents: alles gaat door esc(), en van de feed-markdown worden
 * uitsluitend **vet** en `- `-regels omgezet. */

const FEED_SOORTEN = {
  rondestart:      { icoon: "🏁", label: "werkronde gestart" },
  overdracht:      { icoon: "🤝", label: "overdracht" },
  qc_goedgekeurd:  { icoon: "🛡️", label: "QC: goedgekeurd" },
  qc_review_nodig: { icoon: "🛡️", label: "QC: menselijke blik nodig" },
  voorstel:        { icoon: "💡", label: "voorstel" },
  afgerond:        { icoon: "✅", label: "afgerond" },
  update:          { icoon: "💬", label: "update" },
};
const FEED_OPEN_LUS_MS = 90 * 60 * 1000;
const FEED_INVOUW_TEKENS = 450;
const FEED_STROOK_MAX = 5;
const FEED_FILTER_KEY = "agentic-team-dashboard:feed-filter";

function feedDagKey(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Entries uit /dashboard/entries?domein=teamfeed → platte feeditems, nieuwste
 * eerst. Onbekende soort → update; onbekende agent → 🤖 + de ruwe waarde. */
function normaliseerFeed(entries, schema, agentLookup) {
  const items = [];
  for (const e of (entries || [])) {
    if (!e || typeof e !== "object" || !e.data || typeof e.data !== "object") continue;
    const tijd = new Date(e.aangemaakt || e.bijgewerkt || NaN);
    if (isNaN(tijd.getTime())) continue;
    const soortRaw = String(getField(e.data, "Soort") || "").toLowerCase();
    const soort = FEED_SOORTEN[soortRaw] ? soortRaw : "update";
    const agentRaw = String(getField(e.data, "Agent") || "");
    const slug = matchAgentValue(agentRaw, agentLookup);
    const agent = slug ? schema.agents.find(a => a.slug === slug) : null;
    const bericht = String(getField(e.data, "Bericht") || "").slice(0, 1200);
    const actieRaw = String(getField(e.data, "Actie") || "").slice(0, 80);
    const actie = actieRaw && actieRaw !== FEED_SOORTEN[soort].label ? actieRaw : "";
    items.push({
      id: String(e.entryId || ""),
      tijd,
      dag: feedDagKey(tijd),
      agentSlug: slug,
      agentNaam: agent ? agent.displayName : (agentRaw || "onbekende agent"),
      agentEmoji: agent ? agent.emoji : "🤖",
      soort,
      actie,
      bericht,
      link: saneerHttpsUrl(getField(e.data, "Link")),
      openLus: false,
    });
  }
  items.sort((a, b) => b.tijd.getTime() - a.tijd.getTime());
  return items;
}

/* Vangnet open lussen — puur presentatie: een rondestart van dezelfde agent
 * zonder latere afronding, ouder dan 90 minuten, tonen we als "afgerond —
 * geen samenvatting". Er wordt niets geschreven. */
function markeerOpenLussen(items, now) {
  const nu = now ? now.getTime() : Date.now();
  for (const it of items) {
    if (it.soort !== "rondestart") continue;
    const t0 = it.tijd.getTime();
    // Alleen een afronding van de rónde sluit de lus — een "Dagstart
    // afgerond" van dezelfde Coördinator later die ochtend niet.
    const afgesloten = items.some(o => o.soort === "afgerond" && o.agentSlug === it.agentSlug
      && (!o.actie || /werkronde/i.test(o.actie))
      && o.tijd.getTime() > t0 && o.tijd.getTime() - t0 < 4 * 60 * 60 * 1000);
    it.openLus = !afgesloten && (nu - t0) > FEED_OPEN_LUS_MS;
  }
  return items;
}

function feedInline(tekst) {
  return esc(tekst).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

/* Feed-markdown (conventie uit post_activity): kernzin, **vette** kopregels,
 * `- `-items. Meer niet. Lange berichten worden ingevouwen. */
function feedTekstHtml(bericht) {
  const regels = String(bericht || "").split(/\r?\n/);
  let html = "", lijst = [];
  const flush = () => { if (lijst.length) { html += `<ul>${lijst.map(l => `<li>${feedInline(l)}</li>`).join("")}</ul>`; lijst = []; } };
  for (const r of regels) {
    if (/^\s*-\s+/.test(r)) { lijst.push(r.replace(/^\s*-\s+/, "")); continue; }
    flush();
    const t = r.trim();
    if (!t) continue;
    if (/^\*\*[^*]+\*\*:?$/.test(t)) html += `<p class="feed-kop">${esc(t.replace(/\*\*/g, ""))}</p>`;
    else html += `<p>${feedInline(t)}</p>`;
  }
  flush();
  if (bericht && bericht.length > FEED_INVOUW_TEKENS) {
    const eerste = regels.find(r => r.trim() && !/^\s*-\s+/.test(r)) || "";
    const kort = feedInline(eerste.slice(0, 220).replace(/\*\*/g, "")) + "…";
    return `<p>${kort}</p><details><summary>meer</summary>${html}</details>`;
  }
  return html || `<p class="footnote">(leeg bericht)</p>`;
}

function feedTijd(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function feedDagLabel(key, today) {
  const d = new Date(key + "T12:00:00");
  const t = new Date(feedDagKey(today) + "T12:00:00");
  const diff = Math.round((t.getTime() - d.getTime()) / 864e5);
  const rel = diff === 0 ? "Vandaag" : diff === 1 ? "Gisteren" : `${diff} dagen geleden`;
  const dagen = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const mnd = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  return { rel, dat: `${dagen[d.getDay()]} ${d.getDate()} ${mnd[d.getMonth()]}` };
}

function feedRijHtml(it) {
  const so = FEED_SOORTEN[it.soort];
  const agentHtml = it.agentSlug
    ? `<a class="agent" href="#/detail/agent/${esc(it.agentSlug)}">${it.agentEmoji} ${esc(it.agentNaam)}</a>`
    : `<span class="agent">${it.agentEmoji} ${esc(it.agentNaam)}</span>`;
  const actieHtml = it.actie
    ? `<span class="sep">·</span><span class="actie">${esc(it.actie)}</span><span class="label">${esc(so.label)}</span>`
    : `<span class="sep">·</span><span class="actie">${esc(so.label)}</span>`;
  const bericht = it.openLus ? "<p>afgerond — geen samenvatting</p>" : feedTekstHtml(it.bericht);
  const icoon = it.openLus ? "⏱" : so.icoon;
  const title = it.openLus ? ` title="Gestart om ${feedTijd(it.tijd)}, geen afronding gemeld"` : "";
  const link = it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">🔗 bron</a>` : "";
  return `<li class="feed-rij${it.openLus ? " open-lus" : ""}" data-soort="${it.soort}"${title}>
    <span class="icoon" aria-hidden="true">${icoon}</span>
    <span class="tijd">${feedTijd(it.tijd)}</span>
    <div><div class="kop">${agentHtml}${actieHtml}</div><div class="bericht">${bericht}</div></div>
    <span class="link">${link}</span></li>`;
}

/* Wat de feed kan tonen hangt af van de route: alleen een daglink levert
 * hem. Geeft null als er items zijn, anders de degradatie-html. */
function feedDegradatieHtml(ctx) {
  const bundle = ctx.bundle || {};
  if (bundle.source !== "werkruimte") {
    return `<div class="grijs-blok"><div class="grijs-tekst">De teamfeed is alleen beschikbaar via de <strong>daglink van je Coördinator</strong> — zonder daglink is er geen live activiteit.</div></div>`;
  }
  if (!bundle.teamfeed) {
    return `<div class="grijs-blok"><div class="grijs-tekst">Je werkruimte kent de teamfeed nog niet. Vraag je Coördinator om de <strong>werkruimte-update</strong>; daarna verschijnt hier wat het team doet.</div></div>`;
  }
  return null;
}

function feedItemsUit(ctx) {
  const bundle = ctx.bundle || {};
  if (!bundle.teamfeed || !Array.isArray(bundle.teamfeed.entries)) return [];
  return markeerOpenLussen(normaliseerFeed(bundle.teamfeed.entries, ctx.schema, ctx.agentLookup), ctx.today);
}

// ── Homepage-strook ───────────────────────────────────────────────────
function renderFeedPanel(el, ctx) {
  const kopEl = el.parentElement ? el.parentElement.querySelector("[data-feed-kop]") : null;
  const degradatie = feedDegradatieHtml(ctx);
  if (degradatie) { el.innerHTML = degradatie; if (kopEl) kopEl.textContent = "Vandaag in het team"; return; }
  const items = feedItemsUit(ctx);
  if (!items.length) {
    if (kopEl) kopEl.textContent = "Vandaag in het team";
    el.innerHTML = `<p class="aandacht-leeg">Nog geen teamactiviteit.</p><p class="footnote">De feed vult zich zodra je werkronde of dagstart draait.</p>`;
    return;
  }
  const vandaag = feedDagKey(ctx.today);
  if (kopEl) kopEl.textContent = items[0].dag === vandaag ? "Vandaag in het team" : "Laatste activiteit in het team";
  el.innerHTML = `<ul class="feed">${items.slice(0, FEED_STROOK_MAX).map(feedRijHtml).join("")}</ul>
    <a class="detail-link" data-goto="feed">Alle ${items.length} berichten →</a>`;
}

// ── Detail-tab ────────────────────────────────────────────────────────
function leesFeedFilter() {
  try { return sessionStorage.getItem(FEED_FILTER_KEY) || "alle"; } catch (e) { return "alle"; }
}
function bewaarFeedFilter(v) {
  try { sessionStorage.setItem(FEED_FILTER_KEY, v); } catch (e) { /* privé-venster: geen state */ }
}

function renderDetailFeed(el, ctx) {
  const degradatie = feedDegradatieHtml(ctx);
  if (degradatie) { el.innerHTML = degradatie; return; }
  const items = feedItemsUit(ctx);
  let filter = leesFeedFilter();
  const telling = {};
  for (const it of items) { const k = it.agentSlug || "?"; telling[k] = (telling[k] || 0) + 1; }
  if (filter !== "alle" && !telling[filter]) filter = "alle";

  function pillen() {
    const slugs = Object.keys(telling).sort((a, b) => telling[b] - telling[a]);
    const pil = (key, tekst, n) => `<button type="button" class="feed-pil${filter === key ? " actief" : ""}" data-feed-filter="${esc(key)}" aria-pressed="${filter === key}">${tekst}<span class="n">${n}</span></button>`;
    return `<span class="lbl">Agent:</span>` + pil("alle", "Alle", items.length) + slugs.map(s => {
      const it = items.find(i => (i.agentSlug || "?") === s);
      return pil(s, `${it.agentEmoji} ${esc(it.agentNaam)}`, telling[s]);
    }).join("");
  }
  function lijst() {
    const zicht = items.filter(it => filter === "alle" || (it.agentSlug || "?") === filter);
    if (!items.length) return `<p class="aandacht-leeg">Nog geen teamactiviteit.</p><p class="footnote">De feed vult zich zodra je werkronde of dagstart draait.</p>`;
    if (!zicht.length) return `<p class="footnote">Geen berichten van deze agent in de laatste 30 dagen.</p>`;
    const perDag = {};
    for (const it of zicht) perDag[it.dag] = (perDag[it.dag] || 0) + 1;
    let html = "", vorige = null;
    for (const it of zicht) {
      if (it.dag !== vorige) {
        if (vorige) html += "</ul>";
        const l = feedDagLabel(it.dag, ctx.today);
        html += `<div class="feed-dag"><h3>${l.rel}</h3><span class="rel">· ${l.dat}</span><span class="lijn"></span><span class="n">${perDag[it.dag]}</span></div><ul class="feed">`;
        vorige = it.dag;
      }
      html += feedRijHtml(it);
    }
    return html + (vorige ? "</ul>" : "");
  }

  el.innerHTML = `
    <p class="footnote" style="margin-top:0">Wat je agent-team doet, nieuwste boven — laatste 30 dagen, ${items.length} berichten. Signalering, geen archief: het resultaat zelf staat bij de actie.</p>
    <div class="feed-filter" data-feed-pillen>${pillen()}</div>
    <div data-feed-lijst>${lijst()}</div>
    <div class="grijs-blok" style="margin-top:1.2rem"><div class="grijs-tekst">ℹ️ Deze feed leest live uit je eigen werkruimte via de daglink. Er wordt niets opgeslagen of naar ons verstuurd. Een <strong>werkronde gestart</strong> zonder afronding binnen 90 minuten tonen we als "afgerond — geen samenvatting".</div></div>`;

  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-feed-filter]");
    if (!b) return;
    filter = b.getAttribute("data-feed-filter");
    bewaarFeedFilter(filter);
    el.querySelector("[data-feed-pillen]").innerHTML = pillen();
    el.querySelector("[data-feed-lijst]").innerHTML = lijst();
  });
}

if (typeof module !== "undefined") {
  module.exports = { normaliseerFeed, markeerOpenLussen, feedTekstHtml, renderFeedPanel, renderDetailFeed, FEED_SOORTEN };
}
