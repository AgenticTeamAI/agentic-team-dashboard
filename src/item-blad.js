/* f47 — het item-blad: één actie, met een eigen adres (#/acties/<id>).
 *
 * Eerst stond een actie als detailkaart bóven de lijst, met een formulier van
 * twintig velden eronder en een statuskiezer die je moest kennen. Janine:
 * "ik kan klikken maar hij doet niks". Het blad zet voorop wat je team maakte
 * en geeft de knoppen die de uitkomst noemen — goedkeuren, terugsturen met een
 * opmerking, ja/nee, laat je team opvolgen, later. De velden zelf staan achter
 * "Alle gegevens"; bewerken kan daar nog steeds, via de Gegevens-tab.
 *
 * Wat elke knop schrijft, staat in voor-jou.js (AFHANDEL) en is daar getest.
 * Hier woont alleen het tonen en het uitvoeren: PATCH (of POST voor een
 * opvolging), de rij ter plekke bijwerken (i81) en ongedaan maken.
 *
 * Op de daglink en bij een extern systeem is het blad alleen-lezen, met een
 * knop om in te loggen: je komt daarna precies hier terug (f44-deeplink). */

const BEURT_TEKST = {
  check: "● jij bent aan zet", voorstel: "● jij bent aan zet", signaal: "● jij bent aan zet",
  taak: "● jij bent aan zet", weer: "● jij bent aan zet", team: "◐ je team is aan zet",
  wacht: "○ wacht", klaar: "✓ afgerond", "klopt-niet": "? niemand aan zet",
};

function itemHerkomstHtml(rij, schema) {
  const door = agentWeergaveNaam(schema, getField(rij, "Aangemaakt door"));
  const stempel = rij.__stempels && rij.__stempels.aangemaakt;
  const wanneer = stempel ? vjDatumKort(parseDateField(stempel)) : "";
  if (door) return `${esc(door)} zette dit klaar${wanneer ? ", " + esc(wanneer) : ""}.`;
  const mens = dataCelTekst(getField(rij, "Aangemaakt door"));
  if (mens) return `${esc(mens)} zette dit op de lijst${wanneer ? ", " + esc(wanneer) : ""}.`;
  return wanneer ? `Op de lijst sinds ${esc(wanneer)}.` : "";
}

function itemHoortBijHtml(ctx, rij) {
  const delen = [];
  for (const veld of ["Organisatie", "Deal", "Project", "Contactpersoon"]) {
    const w = getField(rij, veld);
    const lijst = Array.isArray(w) ? w : (w ? [w] : []);
    for (const v of lijst) {
      const titel = v && typeof v === "object" ? v.titel : v;
      if (titel) delen.push(`<span class="relatie-pil">${esc(String(titel))}</span>`);
    }
  }
  return delen.length ? `<p class="blad-hoortbij">Hoort bij: ${delen.join(" ")}</p>` : "";
}

function itemVeldenHtml(ctx, key, rij) {
  const domein = ctx.schema.datadomeinen[key];
  const regels = dataVelden(domein)
    .filter(v => dataCelTekst(getField(rij, v.naam)) !== "")
    .map(v => `<dt>${esc(v.naam)}</dt><dd>${dataCelHtml(getField(rij, v.naam), v)}</dd>`).join("");
  return `<dl class="blad-velden">${regels}</dl>`;
}

/* `opties.kop` vervangt de terugregel bovenaan (de ronde zet daar zijn eigen
 * voortgang en knoppen neer). */
function itemBladHtml(ctx, key, rij, opties) {
  const o = opties || {};
  const schema = ctx.schema;
  const nu = ctx.today || new Date();
  const knoppen = afhandelKnoppen(rij, schema, nu);
  const titel = detailTitel(ctx.schema.datadomeinen[key], rij);
  const toelichting = dataCelTekst(getField(rij, "Toelichting"));
  const werk = toelichting.replace(OPMERKING_KOP, "");
  // Teruggestuurd: je eigen opmerking staat als citaat bovenaan de Toelichting.
  // Die hoort niet in "wat je team maakte", maar je wilt hem wel terugzien.
  const opmerking = (toelichting.match(OPMERKING_KOP) || [""])[0].replace(/^— |—\n\n$|\s*—\s*$/g, "").trim();
  const vanTeam = !!agentWeergaveNaam(schema, getField(rij, "Aangemaakt door"));
  const namen = agentNamen(schema);
  const teLaat = namen && isTeLaat(rij, namen, nu);
  const bewerk = magDomeinBewerken(ctx, key);
  const subs = subacties(ctx, key, rij.__entryId);
  const notities = notitiesBij(ctx, key, rij.__entryId);

  const knop = (k) => `<button type="button" class="knop blad-knop ${k.stijl ? "blad-knop-" + k.stijl : ""}" data-afhandel="${esc(k.f)}">${esc(k.label)}</button>`;
  let balk;
  if (bewerk.ok) {
    balk = `${knoppen.regel ? `<p class="blad-regel">${esc(knoppen.regel)}</p>` : ""}
      ${knoppen.hoofd ? knop(knoppen.hoofd) : ""}
      ${knoppen.rest.length ? `<div class="blad-knoprij">${knoppen.rest.map(knop).join("")}</div>` : ""}
      <div data-vraag-slot></div>
      <div data-naam-slot="blad"></div>
      <p class="bewerk-fout" data-blad-fout></p>`;
  } else if (bewerk.reden) {
    balk = `<p class="blad-regel">${esc(bewerk.reden)}</p>`;
  } else {
    const kanInloggen = typeof oauthMogelijk === "function" && oauthMogelijk();
    balk = `<p class="blad-regel">${knoppen.regel ? esc(knoppen.regel) + " " : ""}Je kijkt mee. Om dit af te handelen log je in met je licentie; je komt daarna precies hier terug.</p>
      ${kanInloggen ? `<button type="button" class="knop blad-knop blad-knop-prim" data-login>Inloggen en afhandelen</button>` : ""}`;
  }

  return `<article class="blad" data-blad data-blad-id="${esc(rij.__entryId)}">
    ${o.kop || `<a class="detail-link" href="#/acties">← Alle acties</a>`}
    <h2 class="blad-titel" tabindex="-1">${esc(titel)}</h2>
    <p class="blad-meta"><span class="soort-pil">${esc(SOORT_LABEL[knoppen.soort] || "")}</span>
      <span class="beurt beurt-${esc(knoppen.soort)}">${esc(BEURT_TEKST[knoppen.soort] || "")}</span>
      ${teLaat ? `<span class="pil-laat">te laat</span>` : ""}</p>
    ${itemHerkomstHtml(rij, schema) ? `<p class="blad-herkomst">${itemHerkomstHtml(rij, schema)}</p>` : ""}
    ${itemHoortBijHtml(ctx, rij)}
    ${opmerking && knoppen.soort === "team" ? `<p class="blad-citaat">${esc(opmerking)}</p>` : ""}
    ${werk ? `<section class="papier" aria-label="${vanTeam ? "Wat je team maakte" : "Toelichting"}">
      <div class="papier-kop"><h3>${vanTeam ? "Wat je team maakte" : "Toelichting"}</h3>
        <button type="button" class="knop-mini bedien-knop" data-kopieer>Kopieer alles</button></div>
      <div class="prosa" data-werk>${langeTekstHtml(werk, { regeleinden: true })}</div>
    </section>` : ""}
    <div class="beslisbalk">${balk}</div>
    <details class="blad-uitklap"><summary>Notities (${notities.length})</summary>
      ${notities.length ? `<ul class="notitie-lijst">${notities.map(n => `<li class="notitie"><p class="notitie-kop"><strong>${esc(dataCelTekst(getField(n, "Onderwerp")) || "Notitie")}</strong>
        <span class="footnote">${esc([dataCelTekst(getField(n, "Auteur")), dataCelTekst(getField(n, "Datum"))].filter(Boolean).join(" · "))}</span></p>
        <div class="notitie-tekst prosa">${langeTekstHtml(dataCelTekst(getField(n, "Notitie")))}</div></li>`).join("")}</ul>` : `<p class="footnote">Nog geen notities.</p>`}
      <p class="footnote">Notities zijn voor jou en je collega's; je team leest ze niet. Wil je dat je team iets anders doet, gebruik dan de knoppen hierboven.</p>
    </details>
    <details class="blad-uitklap"><summary>Wat hieraan hangt (${subs.length})</summary>
      ${subs.length ? `<ul class="blad-subs">${subs.map(r => `<li><a href="#/acties/${encodeURIComponent(r.__entryId)}">${esc(detailTitel(ctx.schema.datadomeinen[key], r))}</a>
        <span class="footnote">${esc(SOORT_LABEL[soortVan(r, namen, nu)] || "")}</span></li>`).join("")}</ul>` : `<p class="footnote">Nog niets.</p>`}
    </details>
    <details class="blad-uitklap"><summary>Alle gegevens</summary>
      ${itemVeldenHtml(ctx, key, rij)}
      <p><a class="detail-link" href="#/data/${esc(key)}" data-detail-open="${esc(key)}|${esc(rij.__entryId)}">Bewerken in Gegevens →</a></p>
    </details>
  </article>`;
}

function itemVraagHtml(f, rij, ctx) {
  const vraag = AFHANDEL_VRAAGT[f] || {};
  const nu = ctx.today || new Date();
  const delen = [];
  if (vraag.specialist) {
    const standaard = specialistVanRij(rij, ctx.schema);
    const opties = agentOpties(ctx.schema);
    delen.push(`<label class="bedien-veld"><span>Wie van je team?</span>
      <select data-vraag-specialist>${opties.map(a => `<option value="${esc(a)}"${a === standaard ? " selected" : ""}>${esc(a)}</option>`).join("")}</select></label>`);
  }
  if (vraag.tekst) {
    const voorstel = f === "opvolgen" ? `Pak de volgende stap op: ${detailTitel(ctx.schema.datadomeinen.acties, rij)}` : "";
    delen.push(`<label class="bedien-veld blad-vraag-tekst"><span>${esc(vraag.label)}</span>
      <textarea data-vraag-tekst rows="3" placeholder="${esc(vraag.plaats || "")}">${esc(voorstel)}</textarea></label>`);
  }
  if (vraag.datum) {
    const keuzes = (vraag.vandaag ? [{ label: "Vandaag", datum: vjIsoDag(nu) }] : []).concat(datumKeuzes(nu));
    delen.push(`<div class="blad-datums" role="group" aria-label="Kies een dag">${keuzes.map(k =>
      `<button type="button" class="knop-mini bedien-knop" data-vraag-datum="${esc(k.datum)}">${esc(k.label)} <span class="footnote">${esc(vjDatumKort(k.datum))}</span></button>`).join("")}
      <label class="bedien-veld"><span>Andere dag</span><input type="date" data-vraag-eigen-datum min="${esc(vjIsoDag(nu))}"></label></div>`);
  }
  const knopLabel = { terug: "Terugsturen", nee: "Nee, niet doen", zelf: "Afronden", opvolgen: "Laat opvolgen", geefAan: "Doorgeven" }[f];
  return `<div class="naam-vraag blad-vraag" data-vraag="${esc(f)}" role="group">
    ${delen.join("")}
    ${knopLabel ? `<button type="button" class="knop" data-vraag-ok>${esc(knopLabel)}</button>` : ""}
    <button type="button" class="knop knop-secundair" data-vraag-niet>Annuleren</button>
    <p class="bewerk-fout" data-vraag-fout></p>
  </div>`;
}

async function kopieerTekst(tekst) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(tekst); return true; }
  } catch (e) { /* valt terug op de oude weg */ }
  const vak = document.createElement("textarea");
  vak.value = tekst;
  vak.setAttribute("readonly", "");
  vak.style.position = "fixed";
  vak.style.opacity = "0";
  document.body.appendChild(vak);
  vak.select();
  let gelukt = false;
  try { gelukt = document.execCommand("copy"); } catch (e) { gelukt = false; }
  vak.remove();
  return gelukt;
}

function renderItemBlad(el, key, id, ctx) {
  const rijen = dataRijenVan(ctx, key) || [];
  const rij = rijen.find(r => r.__entryId === id);
  if (!rij) {
    el.innerHTML = `<div class="blad"><a class="detail-link" href="#/acties">← Alle acties</a>
      <h2 class="blad-titel">Dit item is er niet (meer)</h2>
      <p>Misschien is het verwijderd, of hoort de link bij een andere werkruimte.</p></div>`;
    return;
  }
  el.innerHTML = itemBladHtml(ctx, key, rij);
  document.title = `${detailTitel(ctx.schema.datadomeinen[key], rij)} — Agentic Team Dashboard`;
  wireItemBlad(el, key, rij, ctx);
}

/* Eén afhandeling uitvoeren: naam vragen als dat moet, PATCH (of voor een
 * opvolging POST + PATCH), de rij ter plekke bijwerken en de meldingsregel
 * met ongedaan maken. Gedeeld door het blad en de kaarten in Voor jou (f46),
 * zodat een knop overal precies hetzelfde doet.
 *
 * `plek` zegt waar het in de pagina gebeurt: {naamSlot, foutEl, bezig (het
 * element dat aria-busy krijgt), knoppen (die uit gaan zolang het loopt),
 * focus (selector voor na afloop)}. */
async function voerAfhandelingUit(ctx, key, rij, f, invoer, plek) {
  const i = invoer || {};
  const p = plek || {};
  const zetFout = (t) => { if (p.foutEl) p.foutEl.textContent = t || ""; };
  zetFout("");
  const metNaam = AFHANDEL_MET_NAAM.indexOf(f) !== -1;
  const ik = metNaam
    ? await naamVoorSchrijfactieIn(p.naamSlot, ctx.bron, { overslaan: f === "terug" || f === "ja" })
    : (mijnNaam(ctx.bron) || null);
  if (metNaam && !ik && f !== "terug" && f !== "ja") return false;
  const c = { ik, schema: ctx.schema, nu: ctx.today || new Date(), tekst: i.tekst, datum: i.datum, specialist: i.specialist };
  const knoppen = p.knoppen || [];
  knoppen.forEach((b) => { b.disabled = true; });
  if (p.bezig) p.bezig.setAttribute("aria-busy", "true");
  try {
    if (f === "opvolgen") {
      const plan = opvolgActie(rij, c);
      const nieuw = await schrijfWerkruimte(ctx.bron, "POST", "/dashboard/entries", { domein: key, data: plan.data });
      const nieuwId = nieuw && nieuw.entry && nieuw.entry.entryId;
      const vorige = vorigeWaarden(rij, plan.ouder);
      const antwoord = await snelWijzig(ctx, key, rij.__entryId, plan.ouder);
      if (nieuwId && ctx.werkBij) ctx.werkBij(key, { entry: nieuw.entry });
      await verwerkAntwoord(ctx, key, antwoord, { focus: p.focus });
      meld(plan.melding, { actie: { label: "Ongedaan maken", doe: async () => {
        if (nieuwId) {
          await schrijfWerkruimte(ctx.bron, "DELETE", "/dashboard/entries/" + encodeURIComponent(key) + "/" + encodeURIComponent(nieuwId));
          if (ctx.werkBij) ctx.werkBij(key, { weg: nieuwId });
        }
        await verwerkAntwoord(ctx, key, await snelWijzig(ctx, key, rij.__entryId, vorige));
        meld("Teruggezet.");
      } } });
      return true;
    }
    const { patch, melding } = afhandelPatch(f, rij, c);
    const vorige = vorigeWaarden(rij, patch);
    const antwoord = await snelWijzig(ctx, key, rij.__entryId, patch);
    await verwerkAntwoord(ctx, key, antwoord, { focus: p.focus });
    meld(melding, { actie: ongedaanPatch(ctx, key, rij.__entryId, vorige) });
    return true;
  } catch (e) {
    knoppen.forEach((b) => { b.disabled = false; });
    if (p.bezig) p.bezig.removeAttribute("aria-busy");
    const tekst = (e && e.message) || "Dat is niet gelukt.";
    zetFout(tekst + " Probeer het opnieuw.");
    meld("Niet gelukt: " + tekst, { fout: true });
    return false;
  }
}

function wireItemBlad(el, key, rij, ctx) {
  function voerUit(f, invoer) {
    return voerAfhandelingUit(ctx, key, rij, f, invoer, {
      naamSlot: el.querySelector('[data-naam-slot="blad"]'),
      foutEl: el.querySelector("[data-vraag-fout]") || el.querySelector("[data-blad-fout]"),
      bezig: el.querySelector("[data-blad]"),
      knoppen: Array.from(el.querySelectorAll("[data-afhandel], [data-vraag-ok]")),
      focus: ".blad-titel",
    });
  }

  function toonVraag(f) {
    const slot = el.querySelector("[data-vraag-slot]");
    if (!slot) return;
    slot.innerHTML = itemVraagHtml(f, rij, ctx);
    const vak = slot.querySelector("[data-vraag]");
    const eerste = vak.querySelector("textarea, select, [data-vraag-datum]");
    if (eerste) eerste.focus();
    const sluit = () => { slot.innerHTML = ""; const k = el.querySelector(`[data-afhandel="${f}"]`); if (k) k.focus(); };
    vak.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); sluit(); } });
    vak.addEventListener("click", (e) => {
      if (e.target.closest("[data-vraag-niet]")) { sluit(); return; }
      const dag = e.target.closest("[data-vraag-datum]");
      if (dag) { voerUit(f, { datum: dag.getAttribute("data-vraag-datum") }); return; }
      if (!e.target.closest("[data-vraag-ok]")) return;
      const tekstVak = vak.querySelector("[data-vraag-tekst]");
      const tekst = tekstVak ? tekstVak.value.trim() : "";
      const regel = AFHANDEL_VRAAGT[f] || {};
      if (regel.tekst === "verplicht" && !tekst) {
        vak.querySelector("[data-vraag-fout]").textContent = "Schrijf in een paar woorden wat er moet gebeuren.";
        tekstVak.focus();
        return;
      }
      const sp = vak.querySelector("[data-vraag-specialist]");
      voerUit(f, { tekst, specialist: sp ? sp.value : undefined });
    });
    const eigen = vak.querySelector("[data-vraag-eigen-datum]");
    if (eigen) eigen.addEventListener("change", () => { if (eigen.value) voerUit(f, { datum: eigen.value }); });
  }

  el.addEventListener("click", async (e) => {
    const knop = e.target.closest && e.target.closest("[data-afhandel]");
    if (knop) {
      const f = knop.getAttribute("data-afhandel");
      if (AFHANDEL_VRAAGT[f]) toonVraag(f);
      else voerUit(f);
      return;
    }
    if (e.target.closest && e.target.closest("[data-kopieer]")) {
      const werk = dataCelTekst(getField(rij, "Toelichting")).replace(OPMERKING_KOP, "");
      meld((await kopieerTekst(werk)) ? "Gekopieerd." : "Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.", {});
      return;
    }
  });
}

if (typeof module !== "undefined") {
  module.exports = { renderItemBlad, itemBladHtml, itemVraagHtml, kopieerTekst, voerAfhandelingUit, BEURT_TEKST };
}
