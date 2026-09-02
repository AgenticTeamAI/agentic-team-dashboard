/* f25 — Data-tab: een alleen-lezen blik op de werkdata die al in de bundel
 * zit. Geen nieuwe fetch, geen nieuw endpoint, geen nieuwe scope: dit toont
 * uitsluitend `bundle.domains`, dat werkruimte-loader.js sowieso al ophaalt,
 * met de veldnamen uit het registryschema.
 *
 * Dit is NIET f23. f23 (entries aanmaken/wijzigen/verwijderen vanuit de
 * browser) is bewust geparkeerd tot p10/OAuth: de daglink heeft scope "lees"
 * en dat is precies de eigenschap die hem veilig maakt om in een chat te
 * delen. Hier wordt niets geschreven.
 *
 * f23/f29 fase A: verwijzingen (veldtype "relatie", f28) zijn klikbaar —
 * de link springt naar het doeldomein met de titel als zoekterm, zodat de
 * gekoppelde rij direct in beeld staat. Nog steeds alleen-lezen.
 *
 * Alle waarden komen uit de werkruimte van de klant en zijn dus vreemde
 * invoer: elke cel, elke kolomkop en elke domeinnaam gaat door esc(). */

const DATA_MAX_RIJEN = 200;
const DATA_MAX_KOLOMMEN = 6;

// Domeinen die per opzet nooit als rijen in de bundel zitten. We laten ze
// niet stil weg — een leeg lijstje zonder uitleg leest als "er is niets",
// terwijl het "dit haalt dit dashboard niet op" is.
const DATA_NIET_IN_BUNDEL = {
  logboek: "werkgeheugen van je agents — bewust niet in het dashboard",
  bedrijfscontext: "geen rijen maar losse onderdelen — zie Contextgezondheid",
  teamfeed: "staat op de Team-tab",
  dashboard_metrics: "de cijfers zelf, geen werkdata",
  bronkoppeling: "instelling: welk domein in welk systeem woont",
};

let dataZoek = "";  // alleen deze sessie, alleen in het geheugen van de pagina
let dataWeergave = "tabel";  // f33: 'tabel' of 'bord' — alleen voor domeinen met een Status

function dataVelden(domein) {
  return Array.isArray(domein && domein.velden) ? domein.velden : [];
}

function dataDatumVeld(domein) {
  const v = dataVelden(domein).find(f => f.type === "datum");
  return v ? v.naam : null;
}

/* Een cel kan een string, getal, checkbox, een lijst (multi_select) of sinds
 * f28 een verwijzing zijn. Alles wordt tekst; leeg blijft leeg (nooit
 * "undefined" op het scherm). */
function dataCelTekst(waarde) {
  if (waarde === null || waarde === undefined || waarde === "") return "";
  if (Array.isArray(waarde)) return waarde.map(dataCelTekst).filter(Boolean).join(", ");
  if (typeof waarde === "boolean") return waarde ? "ja" : "nee";
  if (typeof waarde === "object") {
    // f28: een verwijzing is {id, titel}. Zonder deze tak viel hij in de
    // objectregel hieronder en bleef de cel leeg — een lege cel leest als
    // "niet ingevuld", terwijl er wel degelijk een koppeling staat.
    if (typeof waarde.titel === "string") return waarde.titel;
    return "";
  }
  return String(waarde);
}

/* f23/f29 fase A — een relatiecel wordt een sprong naar het doeldomein.
 * De opgeslagen vorm is {id, titel} (of een lijst daarvan, bij meervoud);
 * de titel is server-side gezet en dus betrouwbaar genoeg als zoekterm.
 * Zonder titel (of naar een domein dat niet in de bundel zit) blijft het
 * gewoon tekst — een dode link is erger dan geen link. */
function dataCelHtml(waarde, veld) {
  if (veld && veld.type === "relatie" && veld.naar) {
    const lijst = Array.isArray(waarde) ? waarde : (waarde === null || waarde === undefined || waarde === "" ? [] : [waarde]);
    const stukken = lijst.map(w => {
      const titel = w && typeof w === "object" && typeof w.titel === "string" ? w.titel : "";
      // f33: bij een polymorfe verwijzing (naar "*") staat het doeldomein in de
      // waarde. Zonder deze tak werd de link "#/data/*" — dood, en dood is
      // erger dan geen link.
      const doel = veld.naar === "*" ? (w && typeof w === "object" ? w.domein : "") : veld.naar;
      if (!titel || !doel || (doel in DATA_NIET_IN_BUNDEL)) return esc(dataCelTekst(w));
      const id = w && typeof w === "object" && typeof w.id === "string" ? w.id : "";
      return `<a href="#/data/${esc(doel)}" class="relatie-link" data-relatie-zoek="${esc(titel)}"` +
        (id ? ` data-open-rij="${esc(doel)}|${esc(id)}"` : "") + `>${esc(titel)}</a>`;
    }).filter(Boolean);
    if (stukken.length) return stukken.join(", ");
  }
  return esc(dataCelTekst(waarde));
}

/* ── f33 fase A: één rij openklappen ─────────────────────────────────
 *
 * De tabel toont zes kolommen; een rij heeft er vaak twintig. Wat er dan
 * werkelijk over een organisatie, deal of actie bekend is, was nergens te
 * zien — en de verbanden al helemaal niet: verwijzingen wijzen één kant op,
 * terwijl je bij een organisatie juist wil weten wélke acties eraan hangen.
 *
 * Alles hier komt uit de al geladen bundel. Geen fetch, geen scope, geen
 * nieuw endpoint — en dus werkt het ook op de daglink, alleen-lezen. */
let dataDetail = null;  // { domein, entryId }
function zetDataDetail(domein, entryId) { dataDetail = domein && entryId ? { domein, entryId } : null; }
function wisDataDetail() { dataDetail = null; }

/* Wijst deze celwaarde naar (domein, id)? Dekt de enkelvoudige en meervoudige
 * vorm, en de polymorfe vorm die het doeldomein zelf meedraagt. */
function verwijstNaar(waarde, veld, domein, entryId) {
  const lijst = Array.isArray(waarde) ? waarde : [waarde];
  return lijst.some(w => {
    if (!w || typeof w !== "object" || w.id !== entryId) return false;
    return veld.naar === "*" ? w.domein === domein : veld.naar === domein;
  });
}

/* Welke rijen in de hele bundel wijzen naar deze rij? Gegroepeerd per
 * domein+veld, zodat "Acties · Organisatie (3)" leesbaar blijft. */
function terugverwijzingen(ctx, domein, entryId) {
  const uit = [];
  for (const [slug, dom] of Object.entries(ctx.schema.datadomeinen || {})) {
    const rijen = dataRijenVan(ctx, slug);
    if (!rijen || !rijen.length) continue;
    for (const veld of dataVelden(dom)) {
      if (veld.type !== "relatie") continue;
      const treffers = rijen.filter(r => verwijstNaar(getField(r, veld.naam), veld, domein, entryId));
      if (treffers.length) uit.push({ slug, dom, veld, treffers });
    }
  }
  return uit;
}

function detailTitel(domein, rij) {
  const titelVeld = dataVelden(domein).find(v => v.type === "titel");
  return (titelVeld && dataCelTekst(getField(rij, titelVeld.naam))) || "(zonder titel)";
}

function dataDetailHtml(ctx, key, rij) {
  const domein = ctx.schema.datadomeinen[key];
  const velden = dataVelden(domein);
  const gevuld = velden.filter(v => dataCelTekst(getField(rij, v.naam)) !== "");
  const leeg = velden.filter(v => dataCelTekst(getField(rij, v.naam)) === "").map(v => v.naam);
  const regels = gevuld.map(v =>
    `<div class="detail-regel"><span class="detail-veld">${esc(v.naam)}</span>
      <span class="detail-waarde">${dataCelHtml(getField(rij, v.naam), v)}</span></div>`).join("");

  const terug = terugverwijzingen(ctx, key, rij.__entryId);
  const terugHtml = terug.length
    ? terug.map(t => {
        const items = t.treffers.slice(0, 25).map(r => {
          const titel = detailTitel(t.dom, r);
          return `<li><a href="#/data/${esc(t.slug)}" class="relatie-link" data-relatie-zoek="${esc(titel)}"` +
            (r.__entryId ? ` data-open-rij="${esc(t.slug)}|${esc(r.__entryId)}"` : "") + `>${esc(titel)}</a></li>`;
        }).join("");
        const rest = t.treffers.length > 25 ? `<li class="footnote">… en nog ${t.treffers.length - 25}</li>` : "";
        return `<div class="detail-terug"><p><strong>${esc(t.dom.emoji || "🗂️")} ${esc(t.dom.naam || t.slug)}</strong>
          <span class="footnote">via ${esc(t.veld.naam)} · ${t.treffers.length}</span></p><ul>${items}${rest}</ul></div>`;
      }).join("")
    : `<p class="footnote">Niets in je werkruimte verwijst naar deze rij.</p>`;

  const bewerk = magDomeinBewerken(ctx, key);
  const knoppen = bewerk.ok && rij.__entryId
    ? `<button type="button" class="knop" data-bewerk-rij="${esc(rij.__entryId)}">✏️ Bewerken</button>
       <button type="button" class="knop knop-secundair" data-verwijder-rij="${esc(rij.__entryId)}">🗑 Verwijderen</button>`
    : "";

  return `<div class="detail-kaart" data-detail-kaart data-detail-id="${esc(rij.__entryId || "")}">
    <div class="detail-kop">
      <p><strong>${esc(domein.emoji || "🗂️")} ${esc(detailTitel(domein, rij))}</strong></p>
      <button type="button" class="filter-wis" data-detail-sluit aria-label="Sluiten">✕</button>
    </div>
    ${bedienHtml(ctx, key, domein, rij)}
    ${regels}
    ${leeg.length ? `<p class="footnote">Niet ingevuld: ${esc(leeg.join(", "))}.</p>` : ""}
    ${notitiedraadHtml(ctx, key, rij)}
    <p class="detail-kop-terug"><strong>Wat hieraan hangt</strong></p>
    ${terugHtml}
    <div class="bewerk-knoppen">${knoppen}</div>
    <p class="bewerk-fout" data-snel-fout role="alert"></p>
  </div>`;
}

/* ── f33 fase F: bedienen zonder formulier ────────────────────────────
 *
 * Status wisselen en toewijzen zijn de twee dingen die je op een dag tien keer
 * doet; daar hoort geen formulier met twintig velden bij. Beide schrijven via
 * PATCH, zodat velden die dit dashboard niet kent blijven staan.
 *
 * Alleen zichtbaar in een schrijfsessie op een werkruimte-domein — op de
 * daglink en bij een extern CRM blijft alles lezen, net als de rest. */
function bedienHtml(ctx, key, domein, rij) {
  const bewerk = magDomeinBewerken(ctx, key);
  if (!bewerk.ok || !rij.__entryId) return "";
  const statusVeld = statusVeldVan(domein);
  const velden = dataVelden(domein);
  const eigenaarVeld = velden.find(v => v.naam === "Eigenaar");
  const agentVeld = velden.find(v => v.naam === "Agent" && v.type === "select");
  if (!statusVeld && !eigenaarVeld && !agentVeld) return "";

  const huidig = statusVeld ? dataCelTekst(getField(rij, statusVeld.naam)) : "";
  const naam = mijnNaam(ctx.bron);
  const agenten = (ctx.schema.agents || []).map(a => a.displayName || a.naam || a.slug).filter(Boolean);

  return `<div class="bedien-balk">
    ${statusVeld ? `<label class="bedien-veld"><span>Status</span>
      <select data-snel-status>
        <option value=""></option>
        ${statusVeld.opties.map(o => `<option value="${esc(o)}"${o === huidig ? " selected" : ""}>${esc(o)}</option>`).join("")}
      </select></label>` : ""}
    ${eigenaarVeld ? `<button type="button" class="knop-mini bedien-knop" data-snel-mij title="Aan mijzelf toewijzen">🙋 Aan mij</button>` : ""}
    ${eigenaarVeld ? `<label class="bedien-veld"><span>Eigenaar</span>
      <input type="text" data-snel-eigenaar value="${esc(dataCelTekst(getField(rij, "Eigenaar")))}" placeholder="naam"></label>` : ""}
    ${agentVeld && agenten.length ? `<label class="bedien-veld"><span>Agent</span>
      <select data-snel-agent><option value=""></option>
        ${agenten.map(a => `<option value="${esc(a)}"${a === dataCelTekst(getField(rij, "Agent")) ? " selected" : ""}>${esc(a)}</option>`).join("")}
      </select></label>` : ""}
    ${naam ? `<span class="footnote">Je werkt als ${esc(naam)} · <button type="button" class="filter-wis" data-naam-wijzig>wijzig</button></span>` : ""}
  </div>`;
}

/* ── f33 fase E: de notitiedraad ──────────────────────────────────────
 *
 * Meerdere notities per entiteit, met datum en auteur, nieuwste boven. Een
 * notitie is een eigen rij in het domein 'notities' met een polymorfe
 * verwijzing naar de rij die je bekijkt — daarom werkt hetzelfde blok onder
 * élke entiteit, zonder per domein een veld toe te voegen.
 *
 * Draait de werkruimte nog een registry zonder 'notities', dan is dit blok er
 * simpelweg niet; dat is geen fout, alleen een oudere instantie. */
function notitieVeldVan(ctx) {
  const dom = ctx.schema.datadomeinen.notities;
  if (!dom) return null;
  // De instantie moet het domein ook kennen. Weet het dashboard dat niet
  // (oudere bundel zonder deze lijst), dan geldt het oude gedrag.
  const bekend = ctx.bundle && ctx.bundle.instantieDomeinen;
  if (Array.isArray(bekend) && bekend.indexOf("notities") === -1) return null;
  const veld = dataVelden(dom).find(v => v.type === "relatie" && v.naar === "*");
  return veld ? { dom, veld } : null;
}

function notitiesBij(ctx, key, entryId) {
  const info = notitieVeldVan(ctx);
  if (!info || !entryId) return [];
  return (dataRijenVan(ctx, "notities") || [])
    .filter(r => verwijstNaar(getField(r, info.veld.naam), info.veld, key, entryId))
    .sort((a, b) => String(getField(b, "Datum") || "").localeCompare(String(getField(a, "Datum") || "")));
}

function notitiedraadHtml(ctx, key, rij) {
  const info = notitieVeldVan(ctx);
  if (!info || key === "notities") return "";
  const bewerk = magDomeinBewerken(ctx, "notities");
  const eigenBewerk = magDomeinBewerken(ctx, key);
  const lijst = notitiesBij(ctx, key, rij.__entryId);
  const items = lijst.map(n => {
    const wie = dataCelTekst(getField(n, "Auteur"));
    const wanneer = dataCelTekst(getField(n, "Datum"));
    const soort = dataCelTekst(getField(n, "Soort"));
    return `<li class="notitie">
      <p class="notitie-kop"><strong>${esc(dataCelTekst(getField(n, "Onderwerp")) || "Notitie")}</strong>
        <span class="footnote">${esc([wie, soort, wanneer].filter(Boolean).join(" · "))}</span></p>
      <p class="notitie-tekst">${esc(dataCelTekst(getField(n, "Notitie")))}</p>
    </li>`;
  }).join("");

  // Bij een domein dat elders woont hoort de notitie daar ook te staan; dat
  // zeggen we, in plaats van stil geen knop te tonen.
  const uitleg = !eigenBewerk.ok && eigenBewerk.reden
    ? `<p class="footnote">${esc(eigenBewerk.reden)} Notities horen dan bij die rij, in dat systeem.</p>`
    : "";

  const formulier = bewerk.ok && rij.__entryId
    ? `<form class="notitie-nieuw" data-notitie-form>
        <input type="text" data-notitie-onderwerp placeholder="Onderwerp" maxlength="120">
        <textarea data-notitie-tekst rows="2" placeholder="Wat is er gebeurd of afgesproken?"></textarea>
        <button type="submit" class="knop">Notitie toevoegen</button>
      </form>`
    : uitleg;

  return `<p class="detail-kop-terug"><strong>Notities</strong> <span class="footnote">${lijst.length}</span></p>
    ${lijst.length ? `<ul class="notitie-lijst">${items}</ul>` : `<p class="footnote">Nog geen notities bij deze rij.</p>`}
    ${formulier}`;
}

/* De lijst die je kunt openen: alle datadomeinen uit de registry, behalve de
 * domeinen die per opzet niet als rijen worden opgehaald. */
function dataBrowsbareDomeinen(schema) {
  return Object.keys(schema.datadomeinen)
    .filter(k => !(k in DATA_NIET_IN_BUNDEL))
    .map(k => ({ key: k, ...schema.datadomeinen[k] }));
}

function dataRijenVan(ctx, key) {
  const dom = ctx.bundle && ctx.bundle.domains ? ctx.bundle.domains[key] : null;
  return dom && Array.isArray(dom.rows) ? dom.rows : null;
}

/* Metricsbestand: de Coördinator levert dan alleen totalen aan, geen rijen.
 * Zelfde eerlijke uitleg als op de agentdetailpagina — nooit een lege tabel
 * die suggereert dat de werkruimte leeg is. */
function dataMetricsUitleg() {
  return `<div class="grijs-blok">
    <div class="grijs-kop">❔ Deze bundel draagt geen rijen</div>
    <div class="grijs-tekst">Je dashboard leest vandaag een kant-en-klaar metricsbestand: dat bevat de tellingen,
    niet de onderliggende regels. Wil je hier je acties, deals en lessen doorbladeren, dan moeten de werkdata-rijen
    in je werkruimte staan in plaats van alleen een dagelijks metricsbestand. Vraag je Coördinator waar je werkdata
    woont — dat staat in de bronkoppeling.</div>
  </div>`;
}

/* f29 (metricscontract v2): ook zonder rijen zijn de verbánden te tonen —
 * de Coördinator telt ze bij de bron en levert ze als aggregaten aan.
 * `key` = alleen de kaarten waar dit domein aan meedoet; null = allemaal. */
function dataRelatieKaarten(ctx, key) {
  const rels = Array.isArray(ctx.relaties) ? ctx.relaties : [];
  const items = key ? rels.filter(r => r.van === key || r.naar === key) : rels;
  if (!items.length) return "";
  const naam = slug => {
    const d = ctx.schema.datadomeinen[slug];
    return d ? `${d.emoji ? d.emoji + " " : ""}${d.naam || slug}` : slug;
  };
  const kaarten = items.map(r => {
    const totaal = Number(r.totaal) || 0;
    const gekoppeld = Number(r.gekoppeld) || 0;
    const doelen = Number(r.doelen) || 0;
    const top = Array.isArray(r.top) && r.top.length
      ? `<div class="relatie-top">Meest gekoppeld: ${r.top.map(t => `${esc(t.titel)} (${Number(t.aantal) || 0})`).join(" · ")}</div>`
      : "";
    return `<div class="relatie-kaart">
      <div class="relatie-kop">${esc(naam(r.van))} <span class="relatie-pijl">→</span> ${esc(naam(r.naar))}</div>
      <div class="relatie-tekst">${gekoppeld} van de ${totaal} ${esc(String(r.veld || "").toLowerCase() || "rijen")}-verwijzingen gevuld${doelen ? `, naar ${doelen} verschillende` : ""}.</div>
      ${top}
    </div>`;
  }).join("");
  return `<div class="relatie-blok">
    <p><strong>🔗 Verbanden</strong></p>
    <p class="footnote">Geteld bij de bron door je Coördinator — de onderliggende rijen wonen in je eigen werkdata-systeem.</p>
    ${kaarten}
  </div>`;
}

// ── Overzicht (#/data) ────────────────────────────────────────────────
function renderDataOverzicht(el, ctx) {
  if (ctx.bundle && ctx.bundle.kind === "metrics") { el.innerHTML = dataMetricsUitleg() + dataRelatieKaarten(ctx, null); return; }

  const domeinen = dataBrowsbareDomeinen(ctx.schema);
  const rijen = domeinen.map(d => {
    const rows = dataRijenVan(ctx, d.key);
    const aantal = rows ? rows.length : 0;
    const leeg = aantal === 0;
    const spoor = leeg
      ? `<span class="spoor geen">geen rijen in deze bundel</span>`
      : `<span class="spoor actief">${aantal} ${aantal === 1 ? "rij" : "rijen"}</span>`;
    const attrs = leeg ? "" : ` data-data-domein="${esc(d.key)}" role="link" tabindex="0"`;
    return `<div class="agent-row${leeg ? "" : " klikbaar"}"${attrs}>
      <span class="emoji">${esc(d.emoji || "🗂️")}</span>
      <span class="naam">${esc(d.naam || d.key)}</span>
      ${spoor}${leeg ? "" : `<span class="pijl">→</span>`}
    </div>`;
  }).join("");

  const nietOpgehaald = Object.entries(DATA_NIET_IN_BUNDEL)
    .filter(([k]) => ctx.schema.datadomeinen[k])
    .map(([k, waarom]) => `${esc(ctx.schema.datadomeinen[k].naam || k)} (${esc(waarom)})`)
    .join(" · ");

  const leesregel = ctx.kanSchrijven
    ? `Dit is wat er nú in je werkruimte staat. Je bent ingelogd: open een domein om rijen toe te voegen,
    te bewerken of te verwijderen. Domeinen die in een ander systeem wonen blijven daar — en bewerk je daar.`
    : `Dit is wat er nú in je werkruimte staat, opgehaald met je daglink. Alleen lezen: dit
    dashboard kan niets aanmaken, wijzigen of verwijderen. Wil je iets veranderen, doe dat in het systeem waar
    het domein woont.`;
  el.innerHTML = `${rijen}
    <p class="footnote">${leesregel}</p>
    ${nietOpgehaald ? `<p class="footnote">Niet opgehaald: ${nietOpgehaald}.</p>` : ""}
    ${exportBlok()}`;
}

/* f30 — je hele werkruimte meenemen, wanneer je maar wilt.
 *
 * De export is een recht dat je op elk moment kunt uitoefenen, geen
 * noodprocedure bij vertrek. Daarom staat hij hier gewoon onderaan je
 * gegevens, en niet weggestopt bij "opzeggen".
 *
 * Dit haalt méér op dan de tabellen erboven: die tonen alleen wat in de bundel
 * zit, de export bevat alles wat er in je werkruimte staat. Dat verschil hoort
 * er expliciet bij te staan, anders lijkt de knop overbodig.
 */
function exportBlok() {
  return `<div class="export-blok">
    <p class="footnote"><strong>Alles meenemen.</strong> Een volledige export van je werkruimte —
    ook de domeinen die hierboven niet worden opgehaald. Van jou, wanneer je maar wilt.</p>
    <div class="export-knoppen">
      <button type="button" class="knop" data-export="markdown">Download als Markdown</button>
      <button type="button" class="knop" data-export="json">Download als JSON</button>
    </div>
    <p class="footnote" id="export-status" role="status" aria-live="polite"></p>
  </div>`;
}

/* ── f33 fase B: het bord ─────────────────────────────────────────────
 *
 * Acties met een status zijn werk, en werk kijk je liever in kolommen aan dan
 * in een tabel: je ziet in één blik waar het stilstaat. "Wacht op review" is
 * daarbij de belangrijkste kolom — dat is de stapel waar een mens aan zet is,
 * en precies de lus die dit dashboard hoort te sluiten.
 *
 * Generiek op het eerste select-veld dat 'Status' heet, dus hetzelfde scherm
 * werkt later voor content_kalender en productbacklog. Kolommen komen uit het
 * registryschema — nooit hardcoden, anders loopt het bord stil uit de pas met
 * de statussen die de agents schrijven. */
function statusVeldVan(domein) {
  return dataVelden(domein).find(v => v.type === "select" && v.naam === "Status"
    && Array.isArray(v.opties) && v.opties.length) || null;
}

const BORD_AANDACHT = "Wacht op review";

function bordKaartHtml(ctx, key, domein, rij) {
  const titel = detailTitel(domein, rij);
  const velden = dataVelden(domein);
  const toon = ["Eigenaar", "Agent", "Deadline", "Prioriteit"]
    .map(naam => ({ naam, veld: velden.find(v => v.naam === naam) }))
    .filter(x => x.veld && dataCelTekst(getField(rij, x.naam)) !== "")
    .map(x => `<span class="bord-meta">${dataCelHtml(getField(rij, x.naam), x.veld)}</span>`)
    .join("");
  const kinderen = subacties(ctx, key, rij.__entryId);
  return `<article class="bord-kaart"${rij.__entryId ? ` data-open-rij="${esc(key)}|${esc(rij.__entryId)}"` : ""} tabindex="0">
    <p class="bord-titel">${esc(titel)}</p>
    ${toon ? `<p class="bord-regels">${toon}</p>` : ""}
    ${kinderen.length ? `<p class="footnote">↳ ${kinderen.length} ${kinderen.length === 1 ? "subactie" : "subacties"}</p>` : ""}
  </article>`;
}

/* f33: kinderen van een rij via een self-relatie ('Bovenliggende actie').
 * Alleen tellen — de lijst zelf staat in de detailkaart bij de
 * terugverwijzingen, en twee plekken met dezelfde lijst is ruis. */
function subacties(ctx, key, entryId) {
  if (!entryId) return [];
  const domein = ctx.schema.datadomeinen[key];
  const zelf = dataVelden(domein).filter(v => v.type === "relatie" && v.naar === key);
  if (!zelf.length) return [];
  return (dataRijenVan(ctx, key) || []).filter(r =>
    zelf.some(v => verwijstNaar(getField(r, v.naam), v, key, entryId)));
}

function bordHtml(ctx, key, domein, rijen) {
  const statusVeld = statusVeldVan(domein);
  if (!statusVeld) return "";
  const kolommen = statusVeld.opties.slice();
  const zonder = rijen.filter(r => kolommen.indexOf(dataCelTekst(getField(r, statusVeld.naam))) === -1);
  const kolomHtml = kolommen.map(status => {
    const inKolom = rijen.filter(r => dataCelTekst(getField(r, statusVeld.naam)) === status);
    const kaarten = inKolom.map(r => bordKaartHtml(ctx, key, domein, r)).join("")
      || `<p class="footnote">Leeg.</p>`;
    return `<section class="bord-kolom${status === BORD_AANDACHT ? " bord-kolom-aandacht" : ""}" data-bord-kolom="${esc(status)}">
      <h3>${esc(status)} <span class="bord-telling">${inKolom.length}</span></h3>
      ${kaarten}
    </section>`;
  }).join("");
  // Een rij met een lege of onbekende status hoort niet stil te verdwijnen:
  // dat is precies het werk dat niemand meer ziet.
  const restHtml = zonder.length
    ? `<section class="bord-kolom bord-kolom-rest"><h3>Zonder status <span class="bord-telling">${zonder.length}</span></h3>
       ${zonder.map(r => bordKaartHtml(ctx, key, domein, r)).join("")}</section>`
    : "";
  return `<div class="bord-scroll"><div class="bord">${kolomHtml}${restHtml}</div></div>`;
}

// ── Eén domein (#/data/<domein>) ──────────────────────────────────────
function renderDataDomein(el, key, ctx) {
  const domein = ctx.schema.datadomeinen[key];
  if (!domein) { el.innerHTML = `<p>Onbekend domein.</p><a class="detail-link" href="#/data">← Alle gegevens</a>`; return; }
  if (ctx.bundle && ctx.bundle.kind === "metrics") {
    el.innerHTML = dataMetricsUitleg() + dataRelatieKaarten(ctx, key) + `<a class="detail-link" href="#/data">← Alle gegevens</a>`;
    return;
  }

  const rows = dataRijenVan(ctx, key);
  const kop = `<p><strong>${esc(domein.emoji || "🗂️")} ${esc(domein.naam || key)}</strong></p>`;
  // f23 fase D: bewerken alleen bij een schrijfsessie op een werkruimte-domein.
  const bewerk = magDomeinBewerken(ctx, key);
  const nieuwKnop = bewerk.ok ? `<button type="button" class="knop" data-bewerk-nieuw>➕ Nieuwe rij</button>` : "";
  const bewerkUitleg = bewerk.reden ? `<p class="footnote">${esc(bewerk.reden)}</p>` : "";
  if (!rows || !rows.length) {
    el.innerHTML = `${kop}<div class="grijs-blok"><div class="grijs-tekst">Geen rijen in deze bundel. Dat kan
      betekenen dat dit domein leeg is, of dat je werkdata voor dit domein in een ander systeem woont.</div></div>
      ${bewerkUitleg}${nieuwKnop}<div data-bewerk-paneel></div>
      <a class="detail-link" href="#/data">← Alle gegevens</a>`;
    if (bewerk.ok) wireDataBewerken(el, key, ctx, ctx.herlaad || (() => {}));
    return;
  }

  // Fase A: verwijzingsvelden horen altijd in beeld — dat is waar de
  // verbanden zitten — ook als ze buiten de eerste kolommen vallen. De
  // tabel scrolt horizontaal, dus extra kolommen kosten geen leesbaarheid.
  const basisVelden = dataVelden(domein).slice(0, DATA_MAX_KOLOMMEN);
  const relatieVelden = dataVelden(domein)
    .slice(DATA_MAX_KOLOMMEN)
    .filter(v => v.type === "relatie");
  const velden = basisVelden.concat(relatieVelden);
  const datumVeld = dataDatumVeld(domein);

  function zichtbareRijen() {
    const q = dataZoek.trim().toLowerCase();
    const vs = dataVoorselectie && dataVoorselectie.domein === key ? dataVoorselectie : null;
    let uit = vs ? rows.filter(r => vs.ids.indexOf(r.__entryId) !== -1) : rows;
    if (q) {
      // Bewust op `uit`, niet op `rows`: zoeken werkt bínnen de voorselectie.
      uit = uit.filter(r => velden.some(v => dataCelTekst(getField(r, v.naam)).toLowerCase().includes(q)));
    }
    if (datumVeld) {
      uit = uit.slice().sort((a, b) => {
        const da = parseDateField(getField(a, datumVeld));
        const db = parseDateField(getField(b, datumVeld));
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
      });
    }
    return uit;
  }

  function tabelHtml() {
    const zicht = zichtbareRijen();
    if (!zicht.length) {
      return `<p class="footnote">${dataZoek.trim() ? `Geen rij in dit domein bevat "${esc(dataZoek)}".` : "Geen rijen in deze selectie."}</p>`;
    }
    const koppen = velden.map(v => `<th>${esc(v.naam)}</th>`).join("")
      + (bewerk.ok ? `<th class="bewerk-kolom" aria-label="acties"></th>` : "");
    const body = zicht.slice(0, DATA_MAX_RIJEN).map(r => {
      // f33: de eerste cel (het titelveld) is de knop om de rij open te klappen.
      // Bewust geen extra kolom: dat verschuift de hele tabel voor iets wat de
      // titel zelf al aankondigt. Openklappen mag altijd — ook op de daglink,
      // want het is lezen.
      const cellen = velden.map((v, i) => {
        const cel = dataCelHtml(getField(r, v.naam), v);
        if (i !== 0 || !r.__entryId) return `<td>${cel}</td>`;
        return `<td><button type="button" class="rij-open-knop" data-open-rij="${esc(key)}|${esc(r.__entryId)}" title="Rij openen">${cel || "(zonder titel)"}</button></td>`;
      }).join("");
      const acties = bewerk.ok && r.__entryId
        ? `<td class="bewerk-kolom"><button type="button" class="knop-mini" data-bewerk-rij="${esc(r.__entryId)}" title="Bewerken">✏️</button><button type="button" class="knop-mini" data-verwijder-rij="${esc(r.__entryId)}" title="Verwijderen">🗑</button></td>`
        : (bewerk.ok ? `<td class="bewerk-kolom"></td>` : "");
      return `<tr${dataDetail && dataDetail.domein === key && dataDetail.entryId === r.__entryId ? ' class="rij-open"' : ""}>${cellen}${acties}</tr>`;
    }).join("");
    const rest = zicht.length > DATA_MAX_RIJEN
      ? `<p class="footnote">… en nog ${zicht.length - DATA_MAX_RIJEN} — zoek hierboven of open de bron zelf.</p>`
      : "";
    return `<div class="tabel-scroll"><table class="detail-table">
      <thead><tr>${koppen}</tr></thead><tbody>${body}</tbody></table></div>${rest}`;
  }

  function tellingHtml() {
    const zicht = zichtbareRijen().length;
    return zicht === rows.length
      ? `${rows.length} ${rows.length === 1 ? "rij" : "rijen"}`
      : `${zicht} van ${rows.length} rijen`;
  }

  const vs = dataVoorselectie && dataVoorselectie.domein === key ? dataVoorselectie : null;
  const statusVeld = statusVeldVan(domein);

  /* De detailkaart hoort bóven de lijst: je klikt een rij open en leest verder
   * op de plek waar je al keek. Staat de geopende rij niet (meer) in dit
   * domein, dan is er gewoon geen kaart — geen foutmelding voor iets wat de
   * gebruiker niet gedaan heeft. */
  function detailHtml() {
    if (!dataDetail || dataDetail.domein !== key) return "";
    const rij = rows.find(r => r.__entryId === dataDetail.entryId);
    return rij ? dataDetailHtml(ctx, key, rij) : "";
  }

  function inhoudHtml() {
    if (dataWeergave === "bord" && statusVeld) return bordHtml(ctx, key, domein, zichtbareRijen());
    return tabelHtml();
  }

  el.innerHTML = `${kop}
    <div class="data-toolbar">
      <input type="search" id="data-zoek" placeholder="Zoeken in dit domein…" value="${esc(dataZoek)}" aria-label="Zoeken in dit domein">
      ${vs ? `<span class="filter-chip">🔎 ${esc(vs.label)} <button type="button" class="filter-wis" data-filter-wis aria-label="Filter wissen">✕</button></span>` : ""}
      ${statusVeld ? `<span class="weergave-schakelaar" role="group" aria-label="Weergave">
        <button type="button" class="knop-mini${dataWeergave === "tabel" ? " actief" : ""}" data-weergave="tabel">Tabel</button>
        <button type="button" class="knop-mini${dataWeergave === "bord" ? " actief" : ""}" data-weergave="bord">Bord</button>
      </span>` : ""}
      <span class="data-telling" data-data-telling>${tellingHtml()}</span>
    </div>
    <div data-data-detail>${detailHtml()}</div>
    <div data-data-tabel>${inhoudHtml()}</div>
    <p class="footnote">Eerste ${basisVelden.length} velden${relatieVelden.length ? " plus de verwijzingen" : ""} uit het registryschema${datumVeld ? `, nieuwste ${esc(datumVeld)} boven` : ""}.
    ${bewerk.ok ? "Bewerken schrijft rechtstreeks naar je eigen werkruimte." : "Alleen lezen — dit dashboard schrijft nooit terug."} Herkomst: ${esc((ctx.bundle.domains[key] || {}).herkomstLabel || "je werkruimte")}.</p>
    ${bewerkUitleg}${nieuwKnop ? `<div class="data-toolbar">${nieuwKnop}</div>` : ""}<div data-bewerk-paneel></div>
    <a class="detail-link" href="#/data">← Alle gegevens</a>`;

  // Fase A: klik op een verwijzing → de zoekterm wordt de titel, en de
  // href (#/data/<doeldomein>) doet de navigatie. renderDataDomein van het
  // doeldomein leest dataZoek en toont zo direct de gekoppelde rij.
  function herteken() {
    el.querySelector("[data-data-detail]").innerHTML = detailHtml();
    el.querySelector("[data-data-tabel]").innerHTML = inhoudHtml();
    el.querySelector("[data-data-telling]").textContent = tellingHtml();
  }

  el.addEventListener("click", (e) => {
    // f33: een rij openen. Wijst het naar een ánder domein, dan doet de href
    // de navigatie en onthoudt de detailstand welke rij daar open moet.
    const openEl = e.target.closest && e.target.closest("[data-open-rij]");
    if (openEl) {
      const [dom, id] = (openEl.getAttribute("data-open-rij") || "").split("|");
      if (dom === key && dataDetail && dataDetail.entryId === id) wisDataDetail();
      else zetDataDetail(dom, id);
      if (dom === key) { e.preventDefault(); herteken(); return; }
    }
    const sluit = e.target.closest && e.target.closest("[data-detail-sluit]");
    if (sluit) { wisDataDetail(); herteken(); return; }
    const weergave = e.target.closest && e.target.closest("[data-weergave]");
    if (weergave) {
      // Bewust géén renderDataDomein(el, ...) hier: dat hangt een tweede
      // kliklistener aan hetzelfde element, en dan verwerken twee handlers
      // dezelfde klik — het bord opende een rij die daarna meteen weer
      // dichtklapte. Alleen de inhoud verversen is genoeg.
      dataWeergave = weergave.getAttribute("data-weergave") === "bord" ? "bord" : "tabel";
      for (const knop of el.querySelectorAll("[data-weergave]")) {
        knop.classList.toggle("actief", knop.getAttribute("data-weergave") === dataWeergave);
      }
      herteken();
      return;
    }
    if (bedienKlik(e)) return;
    const link = e.target.closest && e.target.closest("[data-relatie-zoek]");
    if (link) dataZoek = link.getAttribute("data-relatie-zoek") || "";
    const wisEl = e.target.closest && e.target.closest("[data-filter-wis]");
    if (wisEl) {
      wisDataVoorselectie();
      const chip = el.querySelector(".filter-chip");
      if (chip) chip.remove();
      herteken();
    }
  });

  /* f33 fase F — bedienen. Elke schrijfactie loopt via PATCH (of, voor een
   * notitie, POST) en daarna een herlaadde bundel: het dashboard verzint nooit
   * zelf hoe de rij er na afloop uitziet, want de instantie kan er meer mee
   * gedaan hebben (relatietitels verversen, velden normaliseren). */
  function foutmelder() { return el.querySelector("[data-snel-fout]"); }

  async function pasToe(actie) {
    const fout = foutmelder();
    if (fout) fout.textContent = "";
    try {
      await actie();
      await (ctx.herlaad ? ctx.herlaad() : Promise.resolve());
    } catch (f) {
      if (fout) fout.textContent = f.message || "Dat is niet gelukt.";
      else window.alert(f.message || "Dat is niet gelukt.");
    }
  }

  function huidigeRij() {
    if (!dataDetail || dataDetail.domein !== key) return null;
    return rows.find(r => r.__entryId === dataDetail.entryId) || null;
  }

  function vraagNaam() {
    const nu = mijnNaam(ctx.bron);
    const ingevuld = window.prompt("Onder welke naam werk je? Die komt in Eigenaar en Afgerond door te staan.", nu);
    if (ingevuld === null) return nu;
    return zetMijnNaam(ctx.bron, ingevuld);
  }

  function bedienKlik(e) {
    const rij = huidigeRij();
    const mij = e.target.closest && e.target.closest("[data-snel-mij]");
    if (mij && rij) {
      const naam = mijnNaam(ctx.bron) || vraagNaam();
      if (naam) pasToe(() => snelWijzig(ctx, key, rij.__entryId, { Eigenaar: naam })).then(herteken);
      return true;
    }
    const wijzig = e.target.closest && e.target.closest("[data-naam-wijzig]");
    if (wijzig) { vraagNaam(); herteken(); return true; }
    return false;
  }

  el.addEventListener("change", (e) => {
    const rij = huidigeRij();
    if (!rij) return;
    const status = e.target.closest && e.target.closest("[data-snel-status]");
    if (status) {
      const gekozen = status.value;
      if (!gekozen) return;
      pasToe(() => snelWijzig(ctx, key, rij.__entryId,
        statusPatch(domein, gekozen, mijnNaam(ctx.bron))));
      return;
    }
    const eigenaar = e.target.closest && e.target.closest("[data-snel-eigenaar]");
    if (eigenaar) { pasToe(() => snelWijzig(ctx, key, rij.__entryId, { Eigenaar: eigenaar.value.trim() || null })); return; }
    const agent = e.target.closest && e.target.closest("[data-snel-agent]");
    if (agent) pasToe(() => snelWijzig(ctx, key, rij.__entryId, { Agent: agent.value || null }));
  });

  el.addEventListener("submit", (e) => {
    const form = e.target.closest && e.target.closest("[data-notitie-form]");
    if (!form) return;
    e.preventDefault();
    const rij = huidigeRij();
    if (!rij) return;
    const onderwerp = form.querySelector("[data-notitie-onderwerp]").value.trim();
    const tekst = form.querySelector("[data-notitie-tekst]").value.trim();
    if (!onderwerp && !tekst) return;
    const naam = mijnNaam(ctx.bron) || vraagNaam();
    const info = notitieVeldVan(ctx);
    const data = {
      Onderwerp: onderwerp || tekst.slice(0, 60),
      Datum: new Date().toISOString().slice(0, 10),
      Soort: "Mens",
      [info.veld.naam]: { domein: key, id: rij.__entryId },
    };
    if (tekst) data.Notitie = tekst;
    if (naam) data.Auteur = naam;
    pasToe(() => schrijfWerkruimte(ctx.bron, "POST", "/dashboard/entries", { domein: "notities", data }));
  });

  // Een kaart is klikbaar, dus hij hoort ook met Enter/spatie te openen.
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const kaart = e.target.closest && e.target.closest(".bord-kaart[data-open-rij]");
    if (!kaart) return;
    e.preventDefault();
    kaart.click();
  });

  const invoer = el.querySelector("#data-zoek");
  if (invoer) {
    invoer.addEventListener("input", () => {
      dataZoek = invoer.value;
      herteken();
    });
  }

  // f23 fase D: nieuwe rij / bewerken / verwijderen — alleen in een schrijfsessie.
  if (bewerk.ok) wireDataBewerken(el, key, ctx, ctx.herlaad || (() => {}));
}

function resetDataZoek() { dataZoek = ""; dataWeergave = "tabel"; wisDataDetail(); }
function zetDataZoek(waarde) { dataZoek = typeof waarde === "string" ? waarde : ""; }

/* Klikproef-ronde 2 (1 sep): een alert klikt door naar precies zíjn rijen.
 * De voorselectie is een set entry-ids met een label; hij geldt alleen voor
 * het domein waar hij bij hoort en verdwijnt via het ✕ of terug op het
 * overzicht. Zoeken werkt gewoon bínnen de voorselectie. */
let dataVoorselectie = null;
function zetDataVoorselectie(domein, label, ids) {
  const schoon = (Array.isArray(ids) ? ids : []).filter(i => typeof i === "string" && i);
  dataVoorselectie = schoon.length ? { domein, label: String(label || ""), ids: schoon } : null;
}
function wisDataVoorselectie() { dataVoorselectie = null; }

if (typeof module !== "undefined") {
  module.exports = {
    renderDataOverzicht, renderDataDomein, dataCelTekst, dataCelHtml, dataRelatieKaarten, dataBrowsbareDomeinen, exportBlok,
    resetDataZoek, zetDataZoek, zetDataVoorselectie, wisDataVoorselectie, DATA_MAX_RIJEN, DATA_NIET_IN_BUNDEL,
    zetDataDetail, wisDataDetail, terugverwijzingen, dataDetailHtml, bordHtml, statusVeldVan, subacties, verwijstNaar,
    notitiesBij, notitiedraadHtml, notitieVeldVan, bedienHtml,
  };
}
