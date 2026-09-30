/* f49 — één rij als pagina (#/data/<domein>/<id>), te beginnen bij organisaties.
 *
 * Gegevens één niveau dieper: alles over deze organisatie op één plek. De
 * velden komen uit de registry, en wat eraan hangt uit de verwijzingen in de
 * bundel (terugverwijzingen) — niets is per domein hardgecodeerd, dus
 * contactpersonen, deals en projecten krijgen vanzelf dezelfde opbouw.
 *
 * Rechten (besluit 30-09): wie ingelogd is, mag toevoegen, wijzigen en
 * verwijderen. Op de daglink of bij een extern CRM: alleen lezen, met uitleg.
 *
 * Naamswijziging: koppelingen lopen via het id. Een verwijzing draagt ook de
 * titel van toen hij gelegd werd; dataCelHtml toont daarom de naam van de rij
 * zoals hij nú heet, als die rij geladen is. Zo verhuist de naam mee. */

/* Waar kun je vanaf deze rij iets aan toevoegen? Elk domein met een
 * verwijzing naar dit domein (niet polymorf), dat je mag bewerken. Acties gaan
 * via de opdracht (f50), notities via hun eigen draad. */
function rpToevoegDomeinen(ctx, key) {
  const uit = [];
  const bekend = ctx.bundle && ctx.bundle.instantieDomeinen;
  for (const [slug, dom] of Object.entries(ctx.schema.datadomeinen || {})) {
    if (slug === "acties" || slug === "notities" || slug === key) continue;
    if (Array.isArray(bekend) && bekend.indexOf(slug) === -1) continue;
    if (!Array.isArray(bekend) && !(ctx.bundle.domains && ctx.bundle.domains[slug])) continue;
    const veld = dataVelden(dom).find(v => v.type === "relatie" && v.naar === key && !v.meervoud);
    const titelVeld = dataVelden(dom).find(v => v.type === "titel");
    if (!veld || !titelVeld || !magDomeinBewerken(ctx, slug).ok) continue;
    uit.push({ slug, dom, veld, titelVeld });
  }
  return uit;
}

function rpChips(domein, rij) {
  return dataVelden(domein).filter(v => v.type === "select" && dataCelTekst(getField(rij, v.naam)))
    .slice(0, 3).map(v => `<span class="rp-chip" title="${esc(v.naam)}">${esc(dataCelTekst(getField(rij, v.naam)))}</span>`).join("");
}

function rpVeldenHtml(ctx, key, domein, rij, kan) {
  const kort = [], lang = [];
  for (const v of dataVelden(domein)) {
    const tekst = dataCelTekst(getField(rij, v.naam));
    const wijzig = kan ? `<button type="button" class="filter-wis rp-wijzig" data-rp-wijzig="${esc(v.naam)}" aria-label="${esc(v.naam)} wijzigen">wijzig</button>` : "";
    if (tekst && isLangeTekst(v, tekst)) {
      lang.push(`<div class="detail-lang" data-rp-veld="${esc(v.naam)}"><p class="detail-veld detail-lang-kop">${esc(v.naam)} ${wijzig}</p>
        <div class="prosa">${langeTekstHtml(tekst)}</div><div data-rp-slot></div></div>`);
    } else {
      kort.push(`<div class="detail-regel" data-rp-veld="${esc(v.naam)}"><span class="detail-veld">${esc(v.naam)}</span>
        <span class="detail-waarde">${tekst ? dataCelHtml(getField(rij, v.naam), v) : `<span class="rp-leeg">—</span>`} ${wijzig}</span><div data-rp-slot></div></div>`);
    }
  }
  return `<section class="rp-vak"><h3>Gegevens</h3>${kort.join("")}${lang.join("")}</section>`;
}

function rpSectiesHtml(ctx, key, rij) {
  const terug = terugverwijzingen(ctx, key, rij.__entryId).filter(t => t.slug !== "notities");
  // Acties bovenaan: daar staat wat je team voor deze rij deed of nog doet.
  terug.sort((a, b) => (a.slug === "acties" ? -1 : 0) - (b.slug === "acties" ? -1 : 0));
  if (!terug.length) return `<section class="rp-vak"><h3>Wat hieraan hangt</h3><p class="footnote">Nog niets in je werkruimte verwijst naar deze rij.</p></section>`;
  return terug.map(t => {
    const actie = t.slug === "acties";
    const rijen = actie
      ? t.treffers.slice().sort((a, b) => (vjTekst(a, "Status") === VJ_KLAAR) - (vjTekst(b, "Status") === VJ_KLAAR))
      : t.treffers;
    const sub = (r) => {
      if (actie) return [vjTekst(r, "Status"), dataCelTekst(getField(r, "Eigenaar"))].filter(Boolean).join(" · ");
      const s = dataVelden(t.dom).find(v => v.type === "select" && dataCelTekst(getField(r, v.naam)));
      const d = dataDatumVeld(t.dom);
      return [s ? dataCelTekst(getField(r, s.naam)) : "", d ? dataCelTekst(getField(r, d)) : ""].filter(Boolean).join(" · ");
    };
    const items = rijen.slice(0, 25).map(r => `<li>${r.__entryId ? `<a href="${rijPaginaPad(t.slug, r.__entryId)}">${esc(detailTitel(t.dom, r))}</a>` : esc(detailTitel(t.dom, r))}
      ${sub(r) ? `<span class="footnote">${esc(sub(r))}</span>` : ""}</li>`).join("");
    const rest = rijen.length > 25 ? `<li class="footnote">… en nog ${rijen.length - 25}</li>` : "";
    const kop = actie ? "Acties en werk van je team" : (t.dom.naam || t.slug);
    return `<section class="rp-vak"><h3>${esc(t.dom.emoji || "🗂️")} ${esc(kop)} <span class="footnote">${t.treffers.length}${t.veld.naam !== "Organisatie" ? ` · via ${esc(t.veld.naam)}` : ""}</span></h3>
      <ul class="rp-lijst">${items}${rest}</ul></section>`;
  }).join("");
}

function rpToevoegHtml(ctx, key, rij) {
  const doelen = rpToevoegDomeinen(ctx, key);
  const opdracht = key === "organisaties" && typeof opdrachtKnopHtml === "function" && opdrachtKnopHtml(ctx)
    ? `<button type="button" class="knop" data-rp-opdracht>＋ Opdracht voor je team</button>` : "";
  if (!doelen.length && !opdracht) return "";
  return `<section class="rp-vak rp-toevoegen"><h3>Toevoegen</h3>
    ${doelen.length ? `<form class="rp-toevoeg" data-rp-toevoeg>
      <label><span class="sr-only">Wat voeg je toe?</span><select data-rp-toevoeg-domein>${doelen.map(d => `<option value="${esc(d.slug)}">${esc(d.dom.emoji || "")} ${esc(d.dom.naam || d.slug)}</option>`).join("")}</select></label>
      <label class="rp-toevoeg-naam"><span class="sr-only">Naam</span><input type="text" data-rp-toevoeg-naam maxlength="200" placeholder="Naam"></label>
      <button type="submit" class="knop">Toevoegen</button>
      <p class="bewerk-fout" data-rp-toevoeg-fout role="alert"></p></form>
      <p class="footnote">Het komt meteen bij ${esc(detailTitel(ctx.schema.datadomeinen[key], rij))} te staan; de rest vul je daarna in op zijn eigen pagina.</p>` : ""}
    ${opdracht}</section>`;
}

/* "Laat je team de gegevens aanvullen": een opdracht voor de Researcher, met
 * de lege velden erin en de eis dat elk gegeven een bron krijgt. Alleen als de
 * Researcher in dit team voorkomt. */
function rpAanvullenHtml(ctx, key, domein, rij) {
  if (key !== "organisaties" || typeof beschikbareSpecialisten !== "function" || !opdrachtKnopHtml(ctx)) return "";
  if (!beschikbareSpecialisten(ctx).some(s => s.slug === "researcher")) return "";
  const leeg = dataVelden(domein).filter(v => !dataCelTekst(getField(rij, v.naam)) && v.type !== "relatie").map(v => v.naam);
  if (!leeg.length) return "";
  return `<button type="button" class="knop knop-secundair" data-rp-aanvullen>Laat je team de gegevens aanvullen</button>`;
}

function renderRijPagina(el, key, id, ctx) {
  const domein = ctx.schema.datadomeinen[key];
  const terugLink = `<p><a class="detail-link" href="#/data/${esc(key)}">← ${esc((domein && domein.naam) || "Gegevens")}</a></p>`;
  const rij = domein ? (dataRijenVan(ctx, key) || []).find(r => r.__entryId === id) : null;
  if (!domein || !rij) {
    el.innerHTML = `${terugLink}<h2 class="rp-titel" tabindex="-1">Niet gevonden</h2><p>Deze rij staat niet (meer) in je werkruimte.</p>`;
    return;
  }
  const bewerk = magDomeinBewerken(ctx, key);
  const titel = detailTitel(domein, rij);
  document.title = `${titel} — Agentic Team Dashboard`;
  el.innerHTML = `${terugLink}
    <div class="rp-kop"><h2 class="rp-titel" tabindex="-1">${esc(domein.emoji || "🗂️")} ${esc(titel)}</h2><div class="rp-chips">${rpChips(domein, rij)}</div></div>
    ${bewerk.reden ? `<p class="footnote">${esc(bewerk.reden)}</p>` : ""}
    <div class="rp-acties">${rpAanvullenHtml(ctx, key, domein, rij)}
      ${bewerk.ok ? `<button type="button" class="knop knop-secundair" data-rp-verwijder>🗑 Verwijderen</button>` : ""}</div>
    <div data-rp-bevestig></div>
    <div class="rp-raster">
      <div class="rp-links">${rpVeldenHtml(ctx, key, domein, rij, bewerk.ok)}</div>
      <div class="rp-rechts">${rpSectiesHtml(ctx, key, rij)}
        <section class="rp-vak">${notitiedraadHtml(ctx, key, rij) || ""}</section>
        ${rpToevoegHtml(ctx, key, rij)}</div>
    </div>`;
  wireRijPagina(el, key, rij, ctx);
}

function wireRijPagina(el, key, rij, ctx) {
  const domein = ctx.schema.datadomeinen[key];
  const titel = detailTitel(domein, rij);

  el.addEventListener("click", async (e) => {
    const t = e.target;
    const wijzig = t.closest && t.closest("[data-rp-wijzig]");
    if (wijzig) {
      const naam = wijzig.getAttribute("data-rp-wijzig");
      const veld = dataVelden(domein).find(v => v.naam === naam);
      const slot = wijzig.closest("[data-rp-veld]").querySelector("[data-rp-slot]");
      for (const s of el.querySelectorAll("[data-rp-slot]")) s.innerHTML = "";
      slot.innerHTML = `<form class="bewerk-formulier rp-veldform" data-rp-veldform>
        <label class="bewerk-veld"><span class="sr-only">${esc(naam)}</span>${veldInvoerHtml(veld, getField(rij, naam), ctx)}</label>
        <p class="bewerk-fout" data-bewerk-fout role="alert"></p>
        <div class="bewerk-knoppen"><button type="submit" class="knop">Opslaan</button>
          <button type="button" class="knop knop-secundair" data-rp-annuleer>Annuleren</button></div></form>`;
      const form = slot.querySelector("form");
      const voor = leesFormulier(form);
      const invoer = form.querySelector("[data-veldtype]");
      if (invoer) invoer.focus();
      form.addEventListener("keydown", (k) => { if (k.key === "Escape") { slot.innerHTML = ""; wijzig.focus(); } });
      form.addEventListener("submit", async (s) => {
        s.preventDefault();
        const patch = formulierPatch(domein, voor, leesFormulier(form));
        if (!Object.keys(patch).length) { slot.innerHTML = ""; meld("Niets gewijzigd."); wijzig.focus(); return; }
        const knop = form.querySelector('button[type="submit"]');
        knop.disabled = true; form.setAttribute("aria-busy", "true");
        try {
          const vorige = vorigeWaarden(rij, patch);
          const antwoord = await snelWijzig(ctx, key, rij.__entryId, patch);
          await verwerkAntwoord(ctx, key, antwoord, { focus: `[data-rp-wijzig="${cssWaarde(naam)}"]` });
          meld(wijzigingTekst(patch), { actie: ongedaanPatch(ctx, key, rij.__entryId, vorige) });
        } catch (fout) {
          form.querySelector("[data-bewerk-fout]").textContent = ((fout && fout.message) || "Het opslaan is niet gelukt.") + " Probeer het opnieuw.";
          knop.disabled = false; form.removeAttribute("aria-busy");
        }
      });
      return;
    }
    if (t.closest && t.closest("[data-rp-annuleer]")) { t.closest("[data-rp-slot]").innerHTML = ""; return; }

    if (t.closest && t.closest("[data-rp-verwijder]")) {
      const vak = el.querySelector("[data-rp-bevestig]");
      const aantal = terugverwijzingen(ctx, key, rij.__entryId).reduce((n, x) => n + x.treffers.length, 0);
      vak.innerHTML = verwijderBevestigingHtml(titel)
        + (aantal ? `<p class="footnote">Wat eraan hangt (${aantal}), blijft bestaan; de koppeling ernaar verdwijnt.</p>` : "");
      vak.querySelector("[data-verwijder-ja]").focus();
      return;
    }
    if (t.closest && t.closest("[data-bewerk-annuleer]")) { el.querySelector("[data-rp-bevestig]").innerHTML = ""; return; }
    const ja = t.closest && t.closest("[data-verwijder-ja]");
    if (ja) {
      ja.disabled = true;
      try {
        await verwijderEntry(ctx, key, rij.__entryId);
        window.location.hash = `#/data/${key}`;
        if (ctx.werkBij) ctx.werkBij(key, { weg: rij.__entryId });
        meld(`‘${titel}’ is verwijderd.`);
      } catch (fout) {
        ja.disabled = false;
        const f = el.querySelector("[data-rp-bevestig] [data-bewerk-fout]");
        if (f) f.textContent = ((fout && fout.message) || "Verwijderen is niet gelukt.") + " Probeer het opnieuw.";
      }
      return;
    }

    if (t.closest && t.closest("[data-rp-aanvullen]")) {
      const leeg = dataVelden(domein).filter(v => !dataCelTekst(getField(rij, v.naam)) && v.type !== "relatie").map(v => v.naam);
      startOpdracht({ voor: "researcher", hoortBij: key === "organisaties" ? rij.__entryId : "",
        wat: `Vul de gegevens van ${titel} aan: ${leeg.join(", ")}.`,
        uitleg: "Zet bij elk gegeven waar je het vond (de bron). Vind je iets niet, laat het veld dan leeg en zeg dat." }, ctx);
      return;
    }
    if (t.closest && t.closest("[data-rp-opdracht]")) { startOpdracht({ hoortBij: rij.__entryId }, ctx); }
  });

  el.addEventListener("submit", async (e) => {
    const toevoeg = e.target.closest && e.target.closest("[data-rp-toevoeg]");
    const notitie = e.target.closest && e.target.closest("[data-notitie-form]");
    if (!toevoeg && !notitie) return;
    e.preventDefault();
    if (toevoeg) {
      const doel = rpToevoegDomeinen(ctx, key).find(d => d.slug === toevoeg.querySelector("[data-rp-toevoeg-domein]").value);
      const naam = toevoeg.querySelector("[data-rp-toevoeg-naam]").value.trim();
      const fout = toevoeg.querySelector("[data-rp-toevoeg-fout]");
      if (!doel) return;
      if (!naam) { fout.textContent = "Geef het eerst een naam."; toevoeg.querySelector("[data-rp-toevoeg-naam]").focus(); return; }
      const knop = toevoeg.querySelector('button[type="submit"]');
      knop.disabled = true;
      try {
        const antwoord = await schrijfWerkruimte(ctx.bron, "POST", "/dashboard/entries", { domein: doel.slug, data: { [doel.titelVeld.naam]: naam, [doel.veld.naam]: rij.__entryId } });
        const nieuwId = antwoord && antwoord.entry && antwoord.entry.entryId;
        await verwerkAntwoord(ctx, doel.slug, antwoord, { focus: "[data-rp-toevoeg-naam]" });
        meld(`${naam} toegevoegd aan ${doel.dom.naam || doel.slug}.`, nieuwId ? { actie: ongedaanNieuw(ctx, doel.slug, nieuwId) } : {});
      } catch (err) {
        knop.disabled = false;
        fout.textContent = ((err && err.message) || "Toevoegen is niet gelukt.") + " Je invoer staat er nog; probeer het opnieuw.";
      }
      return;
    }
    // Notitie: dezelfde vorm als in de detailkaart (databrowser.js).
    const onderwerp = notitie.querySelector("[data-notitie-onderwerp]").value.trim();
    const tekst = notitie.querySelector("[data-notitie-tekst]").value.trim();
    if (!onderwerp && !tekst) return;
    const info = notitieVeldVan(ctx);
    const knop = notitie.querySelector("[data-notitie-knop]");
    const naam = await naamVoorSchrijfactieIn(notitie.querySelector('[data-naam-slot="notitie"]'), ctx.bron, { overslaan: true });
    const data = { Onderwerp: onderwerp || tekst.slice(0, 60), Datum: new Date().toISOString().slice(0, 10), Soort: "Mens", [info.veld.naam]: { domein: key, id: rij.__entryId } };
    if (tekst) data.Notitie = tekst;
    if (naam) data.Auteur = naam;
    knop.disabled = true;
    try {
      const antwoord = await schrijfWerkruimte(ctx.bron, "POST", "/dashboard/entries", { domein: "notities", data });
      await verwerkAntwoord(ctx, "notities", antwoord, { focus: "[data-notitie-onderwerp]" });
      meld("Notitie toegevoegd.");
    } catch (err) {
      knop.disabled = false;
      const f = notitie.querySelector("[data-notitie-fout]");
      if (f) f.textContent = ((err && err.message) || "Toevoegen is niet gelukt.") + " Je tekst staat er nog; probeer het opnieuw.";
    }
  });
}

if (typeof module !== "undefined") {
  module.exports = { renderRijPagina, rpToevoegDomeinen };
}
