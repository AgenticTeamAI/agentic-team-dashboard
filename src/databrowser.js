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

// ── Overzicht (#/data) ────────────────────────────────────────────────
function renderDataOverzicht(el, ctx) {
  if (ctx.bundle && ctx.bundle.kind === "metrics") { el.innerHTML = dataMetricsUitleg(); return; }

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

  el.innerHTML = `${rijen}
    <p class="footnote">Dit is wat er nú in je werkruimte staat, opgehaald met je daglink. Alleen lezen: dit
    dashboard kan niets aanmaken, wijzigen of verwijderen. Wil je iets veranderen, doe dat in het systeem waar
    het domein woont.</p>
    ${nietOpgehaald ? `<p class="footnote">Niet opgehaald: ${nietOpgehaald}.</p>` : ""}`;
}

// ── Eén domein (#/data/<domein>) ──────────────────────────────────────
function renderDataDomein(el, key, ctx) {
  const domein = ctx.schema.datadomeinen[key];
  if (!domein) { el.innerHTML = `<p>Onbekend domein.</p><a class="detail-link" href="#/data">← Alle gegevens</a>`; return; }
  if (ctx.bundle && ctx.bundle.kind === "metrics") {
    el.innerHTML = dataMetricsUitleg() + `<a class="detail-link" href="#/data">← Alle gegevens</a>`;
    return;
  }

  const rows = dataRijenVan(ctx, key);
  const kop = `<p><strong>${esc(domein.emoji || "🗂️")} ${esc(domein.naam || key)}</strong></p>`;
  if (!rows || !rows.length) {
    el.innerHTML = `${kop}<div class="grijs-blok"><div class="grijs-tekst">Geen rijen in deze bundel. Dat kan
      betekenen dat dit domein leeg is, of dat je werkdata voor dit domein in een ander systeem woont.</div></div>
      <a class="detail-link" href="#/data">← Alle gegevens</a>`;
    return;
  }

  const velden = dataVelden(domein).slice(0, DATA_MAX_KOLOMMEN);
  const datumVeld = dataDatumVeld(domein);

  function zichtbareRijen() {
    const q = dataZoek.trim().toLowerCase();
    let uit = rows;
    if (q) {
      uit = rows.filter(r => velden.some(v => dataCelTekst(getField(r, v.naam)).toLowerCase().includes(q)));
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
      return `<p class="footnote">Geen rij in dit domein bevat "${esc(dataZoek)}".</p>`;
    }
    const koppen = velden.map(v => `<th>${esc(v.naam)}</th>`).join("");
    const body = zicht.slice(0, DATA_MAX_RIJEN).map(r =>
      `<tr>${velden.map(v => `<td>${esc(dataCelTekst(getField(r, v.naam)))}</td>`).join("")}</tr>`).join("");
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

  el.innerHTML = `${kop}
    <div class="data-toolbar">
      <input type="search" id="data-zoek" placeholder="Zoeken in dit domein…" value="${esc(dataZoek)}" aria-label="Zoeken in dit domein">
      <span class="data-telling" data-data-telling>${tellingHtml()}</span>
    </div>
    <div data-data-tabel>${tabelHtml()}</div>
    <p class="footnote">Eerste ${velden.length} velden uit het registryschema${datumVeld ? `, nieuwste ${esc(datumVeld)} boven` : ""}.
    Alleen lezen — dit dashboard schrijft nooit terug. Herkomst: ${esc((ctx.bundle.domains[key] || {}).herkomstLabel || "je werkruimte")}.</p>
    <a class="detail-link" href="#/data">← Alle gegevens</a>`;

  const invoer = el.querySelector("#data-zoek");
  if (invoer) {
    invoer.addEventListener("input", () => {
      dataZoek = invoer.value;
      el.querySelector("[data-data-tabel]").innerHTML = tabelHtml();
      el.querySelector("[data-data-telling]").textContent = tellingHtml();
    });
  }
}

function resetDataZoek() { dataZoek = ""; }

if (typeof module !== "undefined") {
  module.exports = {
    renderDataOverzicht, renderDataDomein, dataCelTekst, dataBrowsbareDomeinen,
    resetDataZoek, DATA_MAX_RIJEN, DATA_NIET_IN_BUNDEL,
  };
}
