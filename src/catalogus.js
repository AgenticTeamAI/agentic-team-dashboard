/* f55 — "Beschikbaar voor jouw team": de vaste taken die bij je modules horen,
 * met "Zet aan".
 *
 * De werkruimte-instantie kent de templates van je licentie (dezelfde bron als
 * get_werkronde en ritmetaak_herstel) en levert ze via
 *   GET  /dashboard/ritmetaken/catalogus   (lezen, ook met de daglink)
 *   POST /dashboard/ritmetaken/activeer    { sleutel }  (schrijven)
 * Aanzetten maakt de rij precies zoals de Coördinator dat doet, met de juiste
 * instructie; staat hij er al, dan gaat alleen Actief aan. Geen dubbele taken.
 *
 * Eén keer ophalen per sessie, bij het openen van Vaste taken — geen polling.
 * Kent de instantie de route (nog) niet, dan verschijnt het blok gewoon niet. */

let vtCatalogus = { sleutel: null, belofte: null, data: null };

function laadCatalogus(ctx) {
  const bron = ctx && ctx.bron;
  if (!bron || !bron.instantieUrl || typeof fetchWerkruimte !== "function") return Promise.resolve(null);
  const sleutel = bron.instantieUrl;
  if (vtCatalogus.sleutel === sleutel) return vtCatalogus.belofte || Promise.resolve(vtCatalogus.data);
  vtCatalogus = { sleutel, data: null, belofte: null };
  vtCatalogus.belofte = fetchWerkruimte(bron, "/dashboard/ritmetaken/catalogus")
    .then((b) => { vtCatalogus.data = b && Array.isArray(b.templates) ? b.templates : null; return vtCatalogus.data; })
    .catch(() => { vtCatalogus.data = null; return null; })
    .finally(() => { vtCatalogus.belofte = null; });
  return vtCatalogus.belofte;
}

function _resetCatalogus() { vtCatalogus = { sleutel: null, belofte: null, data: null }; }

function catalogusHtml(ctx, templates) {
  const kan = magDomeinBewerken(ctx, "ritmetaken").ok;
  const open = templates.filter(t => t && t.sleutel && !t.actief);
  if (!open.length) {
    return templates.length ? `<section class="vt-vak vt-catalogus"><h2>Beschikbaar voor jouw team</h2>
      <p class="footnote">Alle vaste taken die bij jouw modules horen, staan aan.</p></section>` : "";
  }
  const rij = (t) => {
    const wie = t.specialist && (t.specialist.naam || t.specialist.slug);
    const meta = [wie, t.ritme_advies ? ritmeLabelVan(t.ritme_advies) : ""].filter(Boolean).join(" · ");
    const knop = kan
      ? `<button type="button" class="knop-mini bedien-knop vt-zet-aan" data-vt-zet-aan="${esc(t.sleutel)}">${t.bestaat ? "Zet weer aan" : "Zet aan"}</button>`
      : "";
    return `<li class="vt-catalogus-rij" data-vt-sleutel="${esc(t.sleutel)}"><div>
      <p class="vt-titel">${esc(t.klantnaam || t.sleutel)}</p>
      ${t.beschrijving ? `<p class="footnote">${esc(t.beschrijving)}</p>` : ""}
      ${meta ? `<p class="vt-meta">${esc(meta)}</p>` : ""}</div>${knop}</li>`;
  };
  return `<section class="vt-vak vt-catalogus"><h2>Beschikbaar voor jouw team</h2>
    <p class="footnote">Vaste taken die bij jouw modules horen en nog niet aanstaan.${kan ? " Aanzetten kan hier; je team pakt ze op bij het volgende werkmoment." : " Aanzetten kan na inloggen."}</p>
    <ul class="vt-catalogus-lijst">${open.map(rij).join("")}</ul></section>`;
}

function ritmeLabelVan(ritme) {
  if (typeof ritmeLabel === "function") return ritmeLabel(ritme);
  return (typeof RITME_KLANTTAAL !== "undefined" && RITME_KLANTTAAL[ritme]) || ritme;
}

/* Tekent het blok in `slot` zodra de catalogus er is, en handelt "Zet aan" af. */
function wireCatalogus(slot, ctx) {
  if (!slot) return;
  laadCatalogus(ctx).then((templates) => {
    if (!templates || !slot.isConnected) return;
    slot.innerHTML = catalogusHtml(ctx, templates);
  });
  slot.addEventListener("click", async (e) => {
    const knop = e.target.closest && e.target.closest("[data-vt-zet-aan]");
    if (!knop) return;
    const sleutel = knop.getAttribute("data-vt-zet-aan");
    const t = (vtCatalogus.data || []).find(x => x.sleutel === sleutel);
    if (!t) return;
    knop.disabled = true;
    const li = knop.closest("li");
    if (li) li.setAttribute("aria-busy", "true");
    try {
      const antwoord = await schrijfWerkruimte(ctx.bron, "POST", "/dashboard/ritmetaken/activeer", { sleutel });
      const id = antwoord && antwoord.entry && antwoord.entry.entryId;
      const wasEr = !!t.bestaat;
      t.bestaat = true; t.actief = true;
      await verwerkAntwoord(ctx, "ritmetaken", antwoord, { focus: "[data-vt-zet-aan], .vt-catalogus h2" });
      const naam = t.klantnaam || sleutel;
      const ritme = t.ritme_advies ? ritmeLabelVan(t.ritme_advies).toLowerCase() : "";
      meld(`‘${naam}’ staat aan${ritme ? `, ${ritme}` : ""}. Je team pakt hem op bij het volgende werkmoment.`, id ? {
        actie: wasEr
          ? ongedaanPatch(ctx, "ritmetaken", id, { Actief: false })
          : { label: "Ongedaan maken", doe: async () => {
            await ongedaanNieuw(ctx, "ritmetaken", id).doe();
            t.bestaat = false; t.actief = false;
          } },
      } : {});
    } catch (fout) {
      knop.disabled = false;
      if (li) li.removeAttribute("aria-busy");
      meld("Aanzetten lukte niet: " + ((fout && fout.message) || "probeer het opnieuw."), { fout: true });
    }
  });
}

if (typeof module !== "undefined") {
  module.exports = { laadCatalogus, catalogusHtml, wireCatalogus, _resetCatalogus };
}
