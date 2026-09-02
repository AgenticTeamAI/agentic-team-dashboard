/* f34 fase 0 — "Jouw modules": read-only overzicht van de licentiemodules.
 *
 * De site rekent, dit dashboard toont: het overzicht (actief/prijs/agents/
 * datadomeinen + maandbedrag) komt kant-en-klaar van de site-API en wordt
 * hier nooit nagerekend — bedragen op twee plekken drijven uit elkaar.
 * Alleen bereikbaar met een ingelogde p10-sessie (de daglink kan dit niet:
 * de site kent alleen de dashboard-audience van het OAuth-token), en alleen
 * voor licenties in de fase-0-allowlist van de site. In alle andere gevallen
 * antwoordt de site niet-200 en blijven tegel én detailpagina gewoon weg —
 * afwezig is geen fout.
 *
 * Schakelen kan hier nog niet; de "wijzigen?"-knop stuurt een verzoek dat
 * bij support landt (fase 1 vervangt dit door de echte schakelketen). */

const MODULES_SITE_ORIGIN = "https://www.agentic-team.ai";

let moduleOverzicht = null; // laatste geslaagde site-antwoord
let moduleOverzichtVoorToken = null; // token waarvoor (al) geladen is/wordt

function moduleOverzichtBeschikbaar() {
  return moduleOverzicht !== null;
}

/* Eén poging per token: een 404 (geen allowlist) of 401 (verlopen) hoeft
 * niet elke render opnieuw geprobeerd — na een login/refresh wijzigt het
 * token en laden we vanzelf opnieuw. */
async function laadModuleOverzicht(bron) {
  if (!bron || !bron.oauth || !bron.token) {
    moduleOverzicht = null;
    return null;
  }
  if (moduleOverzichtVoorToken === bron.token) return moduleOverzicht;
  moduleOverzichtVoorToken = bron.token;
  moduleOverzicht = null;
  try {
    const res = await fetch(`${MODULES_SITE_ORIGIN}/api/dashboard/modules`, {
      headers: { Authorization: `Bearer ${bron.token}` },
    });
    if (res.ok) moduleOverzicht = await res.json();
  } catch (e) { /* site onbereikbaar — dan geen tegel, geen foutbanner */ }
  return moduleOverzicht;
}

/* Compact paneel op de Vandaag-tab; doorklik naar de detailpagina. */
function renderModulesPanel(sectieEl) {
  if (!sectieEl) return;
  if (!moduleOverzichtBeschikbaar()) {
    sectieEl.style.display = "none";
    return;
  }
  const o = moduleOverzicht;
  const actief = o.modules.filter((m) => m.actief);
  sectieEl.style.display = "";
  sectieEl.querySelector("#panel-modules-body").innerHTML = `
    <p class="modules-samenvatting">${esc(o.pakket)} — <strong>€ ${nlGetal(o.maandbedragExclBtw)}/mnd</strong> excl. btw</p>
    <p class="footnote">${actief.map((m) => esc(m.naam)).join(" · ")}</p>
    <a class="detail-link" data-goto="modules">Bekijk je modules →</a>`;
}

function moduleKaartHtml(m) {
  return `<div class="card${m.actief ? "" : " signaal-grijs"}">
    <div class="kop">${esc(m.naam)} ${m.actief ? "✓ actief" : "— niet actief"}</div>
    <div class="getal">€ ${nlGetal(m.prijs)}/mnd</div>
    <div class="detail">${esc(m.belofte)}${m.altijdInbegrepen ? " (altijd inbegrepen)" : ""}<br>
      <strong>Agents:</strong> ${m.agents.map((a) => esc(a.naam)).join(", ") || "—"}<br>
      <strong>Datadomeinen:</strong> ${m.datadomeinen.map(esc).join(", ") || "—"}</div>
  </div>`;
}

function renderDetailModules(el) {
  if (!moduleOverzichtBeschikbaar()) {
    el.innerHTML = `<p>Je moduleoverzicht is niet beschikbaar. Log opnieuw in en probeer het nog eens.</p>`;
    return;
  }
  const o = moduleOverzicht;
  el.innerHTML = `
    <p>Je pakket: <strong>${esc(o.pakket)}</strong> — <strong>€ ${nlGetal(o.maandbedragExclBtw)}/mnd</strong> excl. ${esc(String(o.btwPercentage))}% btw. Een jaarcontract geeft ${esc(String(o.jaarGratisMaanden))} maanden gratis.</p>
    <div class="grid-9">${o.modules.map(moduleKaartHtml).join("")}</div>
    <div class="modules-verzoek">
      <h3>Iets wijzigen?</h3>
      <p class="footnote">Zelf bij- en afschakelen komt eraan. Tot die tijd: beschrijf hieronder wat je
      wilt (bv. "Sales erbij" of "Backoffice eraf per volgende maand") — wij regelen het en je krijgt
      een bevestiging per mail.</p>
      <textarea id="modules-wens" maxlength="500" rows="3" placeholder="Wat wil je wijzigen?"></textarea>
      <button type="button" id="modules-verzoek-knop">Verstuur wijzigingsverzoek</button>
      <p class="footnote" id="modules-verzoek-status" role="status"></p>
    </div>
    <p class="footnote">Bedragen en samenstelling komen live van agentic-team.ai — dit dashboard rekent
    er zelf niet aan. Klopt er iets niet, mail support@agentic-team.ai.</p>`;

  el.querySelector("#modules-verzoek-knop").addEventListener("click", () => {
    void verstuurModuleVerzoek(el);
  });
}

async function verstuurModuleVerzoek(el) {
  const veld = el.querySelector("#modules-wens");
  const knop = el.querySelector("#modules-verzoek-knop");
  const status = el.querySelector("#modules-verzoek-status");
  const wens = (veld.value || "").trim();
  if (!wens) {
    status.textContent = "Beschrijf eerst kort wat je wilt wijzigen.";
    return;
  }
  knop.disabled = true;
  status.textContent = "Versturen…";
  try {
    const res = await fetch(`${MODULES_SITE_ORIGIN}/api/dashboard/modules/verzoek`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${huidigeBron && huidigeBron.token ? huidigeBron.token : ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ wens }),
    });
    if (res.ok) {
      veld.value = "";
      status.textContent = "Verzonden — we nemen het op en je hoort van ons.";
    } else {
      const fout = await res.json().catch(() => null);
      status.textContent = (fout && fout.fout) || "Versturen lukte niet. Probeer het later nog eens.";
      knop.disabled = false;
    }
  } catch (e) {
    status.textContent = "Versturen lukte niet. Probeer het later nog eens.";
    knop.disabled = false;
  }
}
