/* f34 — "Jouw modules": overzicht (fase 0) + schakelen en opzeggen (fase 1).
 *
 * De site rekent, dit dashboard toont: overzicht, voorstellen (nieuw
 * maandbedrag, ingangsmoment, btw) en uitkomsten komen allemaal kant-en-klaar
 * van de site-API en worden hier nooit nagerekend — bedragen op twee plekken
 * drijven uit elkaar. Alleen bereikbaar met een ingelogde p10-sessie (de
 * daglink kan dit niet) en een licentie in de allowlist van de site; in alle
 * andere gevallen antwoordt de site niet-200 en blijven tegel én detailpagina
 * gewoon weg — afwezig is geen fout.
 *
 * Schakelen/opzeggen verschijnt alleen als de site `magSchakelen: true`
 * meegeeft (schakel-vlag aan én dit is de seat van het aankoopadres); de
 * server handhaaft dat zelf opnieuw per request. Zonder die vlag valt de
 * pagina terug op fase 0: een wijzigingsverzoek dat bij support landt.
 *
 * Alle site-verkeer loopt door één fetch-plek (modulesFetch) — de
 * telemetrie-guard telt aanroepen met naam, en dit houdt de inventaris op
 * precies vier: lezen, schrijven, token-uitwisseling, modules-API. */

const MODULES_SITE_ORIGIN = "https://www.agentic-team.ai";

let moduleOverzicht = null; // laatste geslaagde site-antwoord
let moduleOverzichtVoorToken = null; // token waarvoor (al) geladen is/wordt

function moduleOverzichtBeschikbaar() {
  return moduleOverzicht !== null;
}

/* De enige plek die de site aanroept: GET zonder body, POST mét. Geeft
 * {status, body} terug en gooit alleen op netwerkfouten. */
async function modulesFetch(pad, body, tokenOverride) {
  const token = tokenOverride !== undefined
    ? tokenOverride
    : (huidigeBron && huidigeBron.token ? huidigeBron.token : "");
  const res = await fetch(`${MODULES_SITE_ORIGIN}${pad}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* leeg of geen JSON — status zegt genoeg */ }
  return { status: res.status, ok: res.ok, body: json };
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
    const uit = await modulesFetch("/api/dashboard/modules", undefined, bron.token);
    if (uit.ok) moduleOverzicht = uit.body;
  } catch (e) { /* site onbereikbaar — dan geen tegel, geen foutbanner */ }
  return moduleOverzicht;
}

/* Na een geslaagde wijziging/opzegging: overzicht opnieuw ophalen en de
 * openstaande views bijtekenen. */
async function verversModuleOverzicht() {
  moduleOverzichtVoorToken = null;
  await laadModuleOverzicht(huidigeBron);
  const paneel = document.getElementById("panel-modules");
  if (paneel) renderModulesPanel(paneel);
  route();
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

/* ── Fase 1 · schakelen ────────────────────────────────────────────── */

function schakelBlokHtml(o) {
  const keuzes = o.modules
    .filter((m) => !m.altijdInbegrepen)
    .map((m) => `<label class="modules-keuze"><input type="checkbox" data-module-keuze value="${esc(m.key)}"${m.actief ? " checked" : ""}> ${esc(m.naam)} (€ ${nlGetal(m.prijs)}/mnd)</label>`)
    .join("");
  return `<div class="modules-verzoek" id="modules-schakelblok">
    <h3>Samenstelling wijzigen</h3>
    <p class="footnote">Core is altijd inbegrepen. Bijschakelen werkt per direct; afschakelen sluit de module per
    direct af zonder creditering — het nieuwe bedrag geldt vanaf je eerstvolgende factuur.</p>
    ${keuzes}
    <button type="button" id="modules-bereken-knop">Bereken nieuw maandbedrag</button>
    <div id="modules-voorstel"></div>
    <p class="footnote" id="modules-schakel-status" role="status"></p>
  </div>
  <div class="modules-verzoek" id="modules-opzegblok">
    <h3>Opzeggen</h3>
    <p class="footnote">Helemaal stoppen? Je team blijft werken tot het einde van je betaalde termijn; er wordt
    niets gecrediteerd.</p>
    <button type="button" id="modules-opzeg-knop">Abonnement opzeggen</button>
    <div id="modules-opzeg-voorstel"></div>
    <p class="footnote" id="modules-opzeg-status" role="status"></p>
  </div>`;
}

function gekozenModules(el) {
  return Array.from(el.querySelectorAll("[data-module-keuze]:checked")).map((c) => c.value);
}

async function berekenWijziging(el) {
  const status = el.querySelector("#modules-schakel-status");
  const doel = el.querySelector("#modules-voorstel");
  doel.innerHTML = "";
  status.textContent = "Berekenen…";
  try {
    const uit = await modulesFetch("/api/dashboard/modules/wijzig", { modules: gekozenModules(el) });
    if (!uit.ok) {
      status.textContent = (uit.body && uit.body.fout) || "Berekenen lukte niet. Probeer het later nog eens.";
      return;
    }
    status.textContent = "";
    const v = uit.body.voorstel;
    doel.innerHTML = `<div class="grijs-blok">
      <div class="grijs-kop">Je nieuwe samenstelling</div>
      <div class="grijs-tekst">Van € ${nlGetal(v.maandbedragOud)}/mnd naar <strong>€ ${nlGetal(v.maandbedragNieuw)}/mnd</strong>
      excl. ${esc(String(v.btwPercentage))}% btw. Het nieuwe bedrag geldt vanaf je eerstvolgende
      ${v.termijn === "jaar" ? "jaarfactuur" : "factuur"} (${esc(v.ingangsdatum)}); je toegang wijzigt per direct
      en er wordt niets gecrediteerd.</div>
      <button type="button" id="modules-bevestig-knop">Bevestig wijziging</button>
    </div>`;
    doel.querySelector("#modules-bevestig-knop").addEventListener("click", () => {
      void bevestigWijziging(el);
    });
  } catch (e) {
    status.textContent = "Berekenen lukte niet. Probeer het later nog eens.";
  }
}

async function bevestigWijziging(el) {
  const status = el.querySelector("#modules-schakel-status");
  const knop = el.querySelector("#modules-bevestig-knop");
  if (knop) knop.disabled = true;
  status.textContent = "Doorvoeren…";
  try {
    const uit = await modulesFetch("/api/dashboard/modules/wijzig", { modules: gekozenModules(el), bevestigd: true });
    if (!uit.ok) {
      const fout = (uit.body && uit.body.fout) || "Doorvoeren lukte niet. Probeer het later nog eens.";
      const link = uit.body && uit.body.machtigingUrl
        ? ` <a href="${esc(uit.body.machtigingUrl)}" target="_blank" rel="noopener">Geef je machtiging af →</a>`
        : "";
      status.innerHTML = `${esc(fout)}${link}`;
      if (knop) knop.disabled = false;
      return;
    }
    status.textContent = "Gelukt — je samenstelling is aangepast. Je krijgt een bevestiging per mail.";
    await verversModuleOverzicht();
  } catch (e) {
    status.textContent = "Doorvoeren lukte niet. Probeer het later nog eens.";
    if (knop) knop.disabled = false;
  }
}

async function startOpzeggen(el) {
  const status = el.querySelector("#modules-opzeg-status");
  const doel = el.querySelector("#modules-opzeg-voorstel");
  doel.innerHTML = "";
  status.textContent = "Ophalen…";
  try {
    const uit = await modulesFetch("/api/dashboard/modules/opzeggen", {});
    if (!uit.ok) {
      status.textContent = (uit.body && uit.body.fout) || "Ophalen lukte niet. Probeer het later nog eens.";
      return;
    }
    status.textContent = "";
    const proef = uit.body.proef === true;
    doel.innerHTML = `<div class="grijs-blok">
      <div class="grijs-kop">${proef ? "Kosteloos opzeggen (proefperiode)" : "Opzeggen per einde termijn"}</div>
      <div class="grijs-tekst">${proef
        ? "Je zit nog in de proefperiode: er wordt niets gefactureerd en er volgt geen incasso."
        : "Er volgt geen nieuwe factuur; wat al gefactureerd is wordt niet gecrediteerd."}
      Je team blijft werken tot ${esc(uit.body.eindeToegang)}.</div>
      <button type="button" id="modules-opzeg-bevestig">Bevestig opzegging</button>
    </div>`;
    doel.querySelector("#modules-opzeg-bevestig").addEventListener("click", () => {
      void bevestigOpzeggen(el);
    });
  } catch (e) {
    status.textContent = "Ophalen lukte niet. Probeer het later nog eens.";
  }
}

async function bevestigOpzeggen(el) {
  const status = el.querySelector("#modules-opzeg-status");
  const knop = el.querySelector("#modules-opzeg-bevestig");
  if (knop) knop.disabled = true;
  status.textContent = "Opzeggen…";
  try {
    const uit = await modulesFetch("/api/dashboard/modules/opzeggen", { bevestigd: true });
    if (!uit.ok) {
      status.textContent = (uit.body && uit.body.fout) || "Opzeggen lukte niet. Probeer het later nog eens.";
      if (knop) knop.disabled = false;
      return;
    }
    status.textContent = `Opgezegd. Je team blijft werken tot ${uit.body.eindeToegang}. Je krijgt een bevestiging per mail.`;
    const doel = el.querySelector("#modules-opzeg-voorstel");
    if (doel) doel.innerHTML = "";
  } catch (e) {
    status.textContent = "Opzeggen lukte niet. Probeer het later nog eens.";
    if (knop) knop.disabled = false;
  }
}

/* ── Fase 0 · wijzigingsverzoek (fallback zonder magSchakelen) ─────── */

function verzoekBlokHtml() {
  return `<div class="modules-verzoek">
    <h3>Iets wijzigen?</h3>
    <p class="footnote">Zelf bij- en afschakelen komt eraan. Tot die tijd: beschrijf hieronder wat je
    wilt (bv. "Sales erbij" of "Backoffice eraf per volgende maand") — wij regelen het en je krijgt
    een bevestiging per mail.</p>
    <textarea id="modules-wens" maxlength="500" rows="3" placeholder="Wat wil je wijzigen?"></textarea>
    <button type="button" id="modules-verzoek-knop">Verstuur wijzigingsverzoek</button>
    <p class="footnote" id="modules-verzoek-status" role="status"></p>
  </div>`;
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
    const uit = await modulesFetch("/api/dashboard/modules/verzoek", { wens });
    if (uit.ok) {
      veld.value = "";
      status.textContent = "Verzonden — we nemen het op en je hoort van ons.";
    } else {
      status.textContent = (uit.body && uit.body.fout) || "Versturen lukte niet. Probeer het later nog eens.";
      knop.disabled = false;
    }
  } catch (e) {
    status.textContent = "Versturen lukte niet. Probeer het later nog eens.";
    knop.disabled = false;
  }
}

/* ── Detailpagina ──────────────────────────────────────────────────── */

function renderDetailModules(el) {
  if (!moduleOverzichtBeschikbaar()) {
    el.innerHTML = `<p>Je moduleoverzicht is niet beschikbaar. Log opnieuw in en probeer het nog eens.</p>`;
    return;
  }
  const o = moduleOverzicht;
  el.innerHTML = `
    <p>Je pakket: <strong>${esc(o.pakket)}</strong> — <strong>€ ${nlGetal(o.maandbedragExclBtw)}/mnd</strong> excl. ${esc(String(o.btwPercentage))}% btw. Een jaarcontract geeft ${esc(String(o.jaarGratisMaanden))} maanden gratis.</p>
    <div class="grid-9">${o.modules.map(moduleKaartHtml).join("")}</div>
    ${o.magSchakelen === true ? schakelBlokHtml(o) : verzoekBlokHtml()}
    <p class="footnote">Bedragen en samenstelling komen live van agentic-team.ai — dit dashboard rekent
    er zelf niet aan. Klopt er iets niet, mail support@agentic-team.ai.</p>`;

  if (o.magSchakelen === true) {
    el.querySelector("#modules-bereken-knop").addEventListener("click", () => {
      void berekenWijziging(el);
    });
    el.querySelector("#modules-opzeg-knop").addEventListener("click", () => {
      void startOpzeggen(el);
    });
  } else {
    el.querySelector("#modules-verzoek-knop").addEventListener("click", () => {
      void verstuurModuleVerzoek(el);
    });
  }
}
