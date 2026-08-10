/* Rendering — vertaalt de pure zone-berekeningen (zones.js) naar DOM.
 * Bewust gescheiden van de berekening zelf, zodat de logica zonder browser
 * te testen is (zie test-scripts in scripts/). */

function esc(s) {
  const div = document.createElement("div");
  div.textContent = String(s ?? "");
  return div.innerHTML;
}

function fmtDate(dt) {
  if (!dt || isNaN(dt.getTime())) return "onbekend";
  return dt.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function relAge(dt, today) {
  if (!dt || isNaN(dt.getTime())) return "";
  const days = daysBetween(today, dt);
  if (days === 0) return "vandaag";
  if (days > 0) return `${days} dag${days === 1 ? "" : "en"} geleden`;
  return `over ${Math.abs(days)} dag${Math.abs(days) === 1 ? "" : "en"}`;
}

const SIGNAAL_ICOON = { rood: "🚨", oranje: "⚠️", groen: "✅", grijs: "❔" };
const SIGNAAL_LABEL = { rood: "Aandacht nu", oranje: "Binnenkort aandacht", groen: "Op koers", grijs: "Onbekend / verouderd" };

function badgeHtml(signaal) {
  return `<span class="badge ${signaal}">${SIGNAAL_ICOON[signaal] || ""} ${SIGNAAL_LABEL[signaal] || signaal}</span>`;
}

function stempelHtml(staleAt, today) {
  if (!staleAt) return `<div class="stempel">Geen tijdstempel bekend</div>`;
  const stale = isStale(staleAt, today);
  return `<div class="stempel${stale ? " timestamp stale" : " timestamp"}">Stand van ${fmtDate(staleAt)} (${relAge(staleAt, today)})${stale ? " — verouderd" : ""}</div>`;
}

// ── Zone 1 ────────────────────────────────────────────────────────────
function renderZone1(el, items) {
  if (!items.length) {
    el.innerHTML = `<p style="font-size:1rem;color:var(--white);margin:0.5rem 0;">✅ Niets vraagt vandaag om aandacht in de aangesloten domeinen.</p>
      <p class="footnote">Deze zone is een samenvatting van rood/grijs/oranje uit de andere vier zones — geen eigen databron.</p>`;
    return;
  }
  const lis = items.map(it => {
    let detail = "";
    if (it.rows && it.rows.length) {
      const names = it.rows.slice(0, 4).map(r => esc(getField(r, "Actie") || getField(r, "Deal Naam") || getField(r, "Klantnaam") || getField(r, "Actie") || "")).filter(Boolean);
      if (names.length) detail = `<div class="detail" style="margin-top:0.25rem;">${names.join(" · ")}${it.rows.length > 4 ? " …" : ""}</div>`;
    }
    if (it.domeinen) {
      detail = `<div class="detail" style="margin-top:0.25rem;">${it.domeinen.join(", ")}</div>`;
    }
    return `<li class="${it.ernst}"><span class="signaal-icoon">${SIGNAAL_ICOON[it.ernst]}</span><div><strong>${esc(it.label)}</strong>${detail}</div></li>`;
  }).join("");
  el.innerHTML = `<ul class="attention-list">${lis}</ul>
    <p class="footnote">Deze zone is een samenvatting van rood/grijs/oranje uit de andere vier zones — geen eigen databron. Volgorde: rood, dan grijs, dan oranje.</p>`;
}

// ── Zone 2 ────────────────────────────────────────────────────────────
function renderZone2(el, z2, today) {
  const cardClass = `signaal-${z2.signaal}`;
  let extra = "";
  if (z2.bron) extra += `<div class="detail">Bron: ${esc(z2.bron)}</div>`;
  if (z2.open && z2.open.length) extra += `<div class="detail">Nog open: ${esc(z2.open.join(", "))}</div>`;
  el.innerHTML = `
    <div class="card ${cardClass}" style="max-width:640px;">
      <div class="kop">Bedrijfscontext</div>
      ${badgeHtml(z2.signaal)}
      <div class="detail" style="margin-top:0.5rem;">${esc(z2.tekst)}</div>
      ${extra}
      ${z2.staleAt ? stempelHtml(z2.staleAt, today) : ""}
    </div>
    <p class="footnote">Herkomst: het (nog niet in de registry gestandaardiseerde) bedrijfscontext-onderdeel van de bundel — zie S17/BESLUIT-s17-bron-van-waarheid-bedrijfscontext.md. Ontbreekt dit onderdeel volledig uit de bundel, dan tonen we "onbekend" en niet "rood": we weten dan niet of het een ontbrekende context is of een bundel die dit onderdeel nog niet meeneemt.</p>`;
}

// ── Zone 3 ────────────────────────────────────────────────────────────
function renderZone3(el, z3, schema, today, periodDays) {
  if (z3.geenEnkeleBron) {
    el.innerHTML = `<div class="card signaal-grijs"><div class="kop">Geen sporen</div><div class="detail">Geen Acties- of Lessen &amp; Inzichten-domein aanwezig in deze bundel — dit dashboard kan niets over gebruik zeggen.</div></div>`;
    return;
  }
  const blocks = Object.entries(z3.perModule).map(([modKey, agents]) => {
    const modNaam = (schema.modules[modKey] && schema.modules[modKey].naam) || modKey;
    const rows = agents.map(a => {
      const spoor = a.geenSpoor
        ? `<span class="spoor geen">geen spoor gevonden</span>`
        : `<span class="spoor actief">laatst ${fmtDate(a.laatst)} (${relAge(a.laatst, today)}) · ${a.aantalPeriode}× in ${periodDays}d · ${a.aantalTotaal}× totaal in bundel</span>`;
      return `<div class="agent-row"><span class="emoji">${a.emoji}</span><span class="naam">${esc(a.displayName)}</span>${spoor}</div>`;
    }).join("");
    return `<div class="module-block"><h3>${esc(modNaam)}</h3>${rows}</div>`;
  }).join("");
  el.innerHTML = blocks + `
    <p class="footnote">Sporen komen uit Acties (veld Agent, tijdstip bij gebrek aan beter via Deadline) en Lessen &amp; Inzichten (veld Agent, veld Datum). Dagverslagen heeft in de huidige registry geen Agent-veld en is daarom niet gebruikt. "Geen spoor gevonden" ≠ "0 keer gebruikt": een agent die wél draaide maar niets wegschreef, is hiermee niet te onderscheiden van een agent die stilstond.</p>
    <p class="footnote warn">Dit dashboard kan niet zien welke modules je hebt aangeschaft. Toont een module hieronder nergens een spoor, kan dat betekenen dat hij niet gebruikt wordt — of dat je hem niet hebt. Vergelijk desgewenst met je factuur.</p>`;
}

// ── Zone 4 ────────────────────────────────────────────────────────────
function renderZone4(el, z4, periodDays) {
  const cards = [];
  if (z4.acties) {
    cards.push(card("Acties", `${z4.acties.afgerond} / ${z4.acties.totaal}`, "afgerond / totaal in de bundel", z4.acties.opmerking));
  }
  if (z4.salesFunnel) {
    const faseTekst = Object.entries(z4.salesFunnel.perFase).map(([f, n]) => `${f}: ${n}`).join(" · ");
    cards.push(card("Sales Funnel", `€ ${z4.salesFunnel.totaalVerwachteOmzet.toLocaleString("nl-NL")}`, faseTekst, z4.salesFunnel.opmerking));
  }
  if (z4.content) {
    cards.push(card("Content Kalender", `${z4.content.gepubliceerd}`, `gepubliceerd · ${z4.content.geplandInPeriode} gepland binnen ${periodDays}d · ${z4.content.totaal} totaal`, ""));
  }
  if (z4.klantsucces) {
    cards.push(card("Klantsucces", `${z4.klantsucces.inOnboarding}`, `in onboarding, van ${z4.klantsucces.totaal} klant(en)`, ""));
  }
  if (z4.backlog) {
    cards.push(card("Productbacklog", `${z4.backlog.besloten}`, `besloten (Besluit ingevuld) · ${z4.backlog.done} status Done · ${z4.backlog.totaal} totaal`, ""));
  }
  if (!cards.length) {
    el.innerHTML = `<div class="card signaal-grijs"><div class="kop">Geen domeinen</div><div class="detail">Geen van de opbrengst-domeinen (Acties, Sales Funnel, Content Kalender, Klantsucces, Productbacklog) is aanwezig in deze bundel.</div></div>`;
    return;
  }
  el.innerHTML = `<div class="grid-9">${cards.join("")}</div>
    <p class="footnote">Deze bundel is een momentopname, geen gebeurtenislog: waar geen bruikbaar datumveld bestaat, tonen we de huidige stand in plaats van een trend — dat staat per kaart aangegeven. Geen omzet-attributie: dit dashboard verbindt geen agent aan een gewonnen deal.</p>`;

  function card(kop, getal, detail, opm) {
    return `<div class="card"><div class="kop">${esc(kop)}</div><div class="getal">${getal}</div><div class="detail">${esc(detail)}</div>${opm ? `<div class="footnote" style="margin-top:0.4rem;">${esc(opm)}</div>` : ""}</div>`;
  }
}

// ── Zone 5 ────────────────────────────────────────────────────────────
function renderZone5(el, z5, periodDays) {
  if (!z5.aanwezig) {
    el.innerHTML = `<div class="card signaal-grijs"><div class="kop">Geen domein</div><div class="detail">Lessen &amp; Inzichten staat niet in deze bundel — geen uitspraak mogelijk over wat het team heeft geleerd.</div></div>`;
    return;
  }
  if (z5.leeg) {
    el.innerHTML = `<div class="card signaal-oranje"><div class="kop">Geen lessen vastgelegd</div><div class="getal">0</div><div class="detail">Dit is een bevinding, geen leeg paneel: de leerloop draait niet.</div></div>`;
    return;
  }
  const catRows = Object.entries(z5.perCategorie).sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `<div class="agent-row"><span class="naam" style="flex-basis:230px;">${esc(c)}</span><span class="spoor actief">${n}</span></div>`).join("");
  el.innerHTML = `
    <div class="grid-9">
      <div class="card"><div class="kop">Totaal lessen</div><div class="getal">${z5.totaal}</div><div class="detail">in de bundel</div></div>
      <div class="card signaal-oranje"><div class="kop">Nog open</div><div class="getal">${z5.open}</div><div class="detail">nog te verwerken</div></div>
      <div class="card"><div class="kop">Binnen periode</div><div class="getal">${z5.inPeriode}</div><div class="detail">laatste ${periodDays} dagen</div></div>
    </div>
    <div style="margin-top:1rem;">${catRows}</div>
    <p class="footnote">Herkomst: domein Lessen &amp; Inzichten, velden Categorie, Status en Datum.</p>`;
}

if (typeof module !== "undefined") {
  module.exports = { renderZone1, renderZone2, renderZone3, renderZone4, renderZone5, fmtDate, relAge, badgeHtml, esc };
}
