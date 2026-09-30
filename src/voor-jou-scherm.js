/* f46 deel 2 — de tab Voor jou.
 *
 * "De klanten moeten ervaren hoe het team ze helpt." Bovenaan staat daarom
 * eerst wat je team deed (de verhaalkop), en dan wat er op jou wacht: een
 * genummerde werkbak die je met één tik afhandelt. Wat er in de werkbak staat
 * komt uit aanJouZet() (voor-jou.js) — dezelfde functie als de badge op de
 * tab, zodat die twee nooit verschillend tellen. De knoppen zijn die van het
 * item-blad (voerAfhandelingUit); wat een vraag nodig heeft (een opmerking, een
 * dag) opent het blad.
 *
 * De verhaalkop gaat over "sinds gisteren", niet over "sinds je laatste
 * bezoek": dat zou het onthouden tijdstip van je vorige bezoek hergebruiken,
 * en dat is een eigen juridisch restpunt (i87).
 *
 * Nummers blijven staan tot je ververst: wie in de chat "nummer 3" hoort, moet
 * op het scherm hetzelfde nummer 3 vinden, ook nadat je 1 en 2 afhandelde. */

let vjNummering = { bundle: null, map: new Map(), volgende: 1 };

function vjGenummerd(bundle, lijst) {
  if (vjNummering.bundle !== bundle) vjNummering = { bundle, map: new Map(), volgende: 1 };
  for (const r of lijst) {
    if (r.__entryId && !vjNummering.map.has(r.__entryId)) vjNummering.map.set(r.__entryId, vjNummering.volgende++);
  }
  return lijst.slice().sort((a, b) => (vjNummering.map.get(a.__entryId) || 0) - (vjNummering.map.get(b.__entryId) || 0));
}

function _resetVoorJouNummers() { vjNummering = { bundle: null, map: new Map(), volgende: 1 }; }

/* Wie ben ik, voor "per persoon"? Alleen een gekozen naam; op de daglink of
 * zonder naam is dat onbekend, en dan verstopt aanJouZet niets. */
function vjIk(ctx) {
  return (ctx.bron && ctx.bron.oauth && mijnNaam(ctx.bron)) || undefined;
}

function voorJouLijst(ctx) {
  // b62: ook op de metricsroute, zolang de acties-rijen er zijn.
  if (!ctx || !ctx.bundle || !rows(ctx.bundle, "acties")) return null;
  return aanJouZet(ctx.bundle, ctx.schema, { ik: vjIk(ctx), nu: ctx.today || new Date() });
}

function vjTelwoord(n, enkel, meer) { return `${n} ${n === 1 ? enkel : meer}`; }

function vjVerhaal(ctx, lijst) {
  const acties = rows(ctx.bundle, "acties") || [];
  const namen = agentNamen(ctx.schema);
  if (!namen) return null;
  const nu = ctx.today || new Date();
  const van = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - 1);
  const sinds = (v) => { const d = parseDateField(v); return !!d && d >= van; };
  const stempel = (r, k) => r.__stempels && r.__stempels[k];
  const zelf = acties.filter(r => getField(r, "Status") === "Klaar"
    && isAgentNaam(getField(r, "Afgerond door"), namen) && sinds(getField(r, "Afgerond op")));
  const klaar = lijst.filter(r => isAgentNaam(getField(r, "Aangemaakt door"), namen) && sinds(stempel(r, "aangemaakt")));
  const begon = acties.filter(r => getField(r, "Status") === "Bezig"
    && isAgentNaam(getField(r, "Eigenaar"), namen) && sinds(stempel(r, "bijgewerkt")));
  const wie = new Set();
  for (const r of zelf) wie.add(agentWeergaveNaam(ctx.schema, getField(r, "Afgerond door")));
  for (const r of klaar) wie.add(agentWeergaveNaam(ctx.schema, getField(r, "Aangemaakt door")));
  for (const r of begon) wie.add(agentWeergaveNaam(ctx.schema, getField(r, "Eigenaar")));
  wie.delete(null);

  const delen = [];
  if (zelf.length) delen.push(`rondde ${vjTelwoord(zelf.length, "ding", "dingen")} zelf af`);
  if (klaar.length) delen.push(`zette er ${klaar.length} voor je klaar`);
  if (begon.length) delen.push(`begon aan ${begon.length}`);
  const zin = delen.length
    ? "Sinds gisteren " + delen[0].replace(/^(\S+)/, "$1 je team")
      + (delen.length > 1 ? (delen.length > 2 ? ", " + delen.slice(1, -1).join(", ") : "") + " en " + delen[delen.length - 1] : "") + "."
    : "Sinds gisteren zette je team niets nieuws voor je klaar.";
  return { zin, wie: Array.from(wie) };
}

function vjSindsTekst(rij, namen, nu) {
  if (isTeLaat(rij, namen, nu)) {
    const dl = parseDateField(getField(rij, "Deadline"));
    const dagen = dl ? Math.max(1, Math.round((new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()) - new Date(dl.getFullYear(), dl.getMonth(), dl.getDate())) / 86400000)) : 0;
    return { tekst: dagen ? `${dagen} ${dagen === 1 ? "dag" : "dgn"} te laat` : "te laat", laat: true };
  }
  if (soortVan(rij, namen, nu) === "weer") return { tekst: "weer aan de beurt", laat: false };
  const s = sindsVan(rij);
  return { tekst: s ? "sinds " + vjDatumKort(s) : "", laat: false };
}

function vjVoorproef(rij) {
  const tekst = dataCelTekst(getField(rij, "Toelichting")).replace(OPMERKING_KOP, "").replace(/\s+/g, " ").trim();
  return tekst.length > 160 ? tekst.slice(0, 157) + "…" : tekst;
}

function vjKaartHtml(ctx, rij, nr, kanAfhandelen) {
  const nu = ctx.today || new Date();
  const namen = agentNamen(ctx.schema);
  const k = afhandelKnoppen(rij, ctx.schema, nu);
  const id = rij.__entryId;
  const href = `#/acties/${encodeURIComponent(id)}`;
  const titel = detailTitel(ctx.schema.datadomeinen.acties, rij);
  const sinds = vjSindsTekst(rij, namen, nu);
  const van = agentWeergaveNaam(ctx.schema, getField(rij, "Aangemaakt door"));
  const voorproef = vjVoorproef(rij);
  let hoofd = "";
  if (kanAfhandelen && k.hoofd) {
    hoofd = AFHANDEL_VRAAGT[k.hoofd.f]
      ? `<a class="knop blad-knop blad-knop-${esc(k.hoofd.stijl)}" href="${href}">${esc(k.hoofd.label)}</a>`
      : `<button type="button" class="knop blad-knop blad-knop-${esc(k.hoofd.stijl)}" data-vj-afhandel="${esc(k.hoofd.f)}">${esc(k.hoofd.label)}</button>`;
  }
  return `<li class="vj-kaart" data-vj-id="${esc(id)}">
    <span class="vj-nr" aria-hidden="true">${nr}</span>
    <div class="vj-inhoud">
      <a class="vj-titel" href="${href}"><span class="visueel-verborgen">Nummer ${nr}: </span>${esc(titel)}</a>
      <p class="vj-meta"><span class="soort-pil">${esc(SOORT_LABEL[k.soort] || "")}</span>
        ${sinds.tekst ? `<span class="${sinds.laat ? "pil-laat" : "vj-sinds"}">${esc(sinds.tekst)}</span>` : ""}
        ${van ? `<span class="vj-van">van ${esc(van)}</span>` : ""}</p>
      ${voorproef ? `<p class="vj-voorproef">${esc(voorproef)}</p>` : ""}
      <div class="vj-knoppen">${hoofd}<a class="knop blad-knop" href="${href}">Bekijk</a></div>
      <div data-naam-slot="kaart"></div>
      <p class="bewerk-fout" data-kaart-fout></p>
    </div>
  </li>`;
}

function vjOnderregelsHtml(ctx) {
  const o = { ik: vjIk(ctx), nu: ctx.today || new Date() };
  const team = bijTeam(ctx.bundle, ctx.schema, o);
  const bezig = team.filter(r => getField(r, "Status") === "Bezig").length;
  const collegas = bijCollegas(ctx.bundle, ctx.schema, o).length;
  const regels = [];
  if (team.length) {
    const delen = [bezig ? `${bezig} bezig` : "", team.length - bezig ? `${team.length - bezig} bij het volgende werkmoment` : ""].filter(Boolean);
    regels.push(`<a class="vj-onder" href="#/acties">◐ Bij je team: ${esc(delen.join(" · "))} →</a>`);
  }
  if (collegas) regels.push(`<a class="vj-onder" href="#/acties">Bij collega's: ${collegas} →</a>`);
  return regels.length ? `<div class="vj-onderregels">${regels.join("")}</div>` : "";
}

function renderVoorJou(paneel, ctx) {
  if (!paneel) return;
  const body = paneel.querySelector("#panel-voor-jou-body") || paneel;
  const lijst = voorJouLijst(ctx);
  if (!lijst) {
    // f54: Notion-klanten krijgen de werkbak uit hun dagstart, alleen lezen.
    const uitDagstart = typeof metricsVoorJou === "function" ? metricsVoorJou(ctx) : null;
    if (uitDagstart) { paneel.style.display = ""; body.innerHTML = notionVoorJouHtml(ctx, uitDagstart); return; }
    paneel.style.display = "none"; body.innerHTML = ""; return;
  }
  paneel.style.display = "";
  const genummerd = vjGenummerd(ctx.bundle, lijst);
  const kanAfhandelen = magDomeinBewerken(ctx, "acties").ok;
  const verhaal = vjVerhaal(ctx, lijst);
  const nu = ctx.today || new Date();
  const oudste = lijst.reduce((min, r) => { const s = sindsVan(r); return s && (!min || s < min) ? s : min; }, null);
  const oudsteDagen = oudste ? Math.floor((nu - oudste) / 86400000) : 0;
  // Op de daglink staat de inlogknop in de balk bovenaan (b62), niet ook nog hier.
  const inlogRegel = "";

  body.innerHTML = `
    ${typeof stilKaartHtml === "function" ? stilKaartHtml(ctx) : ""}
    ${verhaal ? `<div class="vj-verhaal"><p class="vj-verhaal-zin">${esc(verhaal.zin)}</p>
      ${verhaal.wie.length ? `<p class="footnote">${esc(verhaal.wie.join(" · "))} · <a href="#/team">Wat deden ze? →</a></p>` : ""}</div>` : ""}
    <div class="vj-kop"><h2>Voor jou <span class="vj-teller">${lijst.length}</span></h2>
      ${vjIk(ctx) ? `<span class="footnote">als ${esc(vjIk(ctx))} · <button type="button" class="filter-wis" data-vj-naam-wijzig>wijzig</button></span>` : ""}
      ${oudsteDagen >= 1 ? `<span class="footnote">oudste ligt er ${oudsteDagen} ${oudsteDagen === 1 ? "dag" : "dagen"}</span>` : ""}
      ${typeof hoeWerktDitHtml === "function" ? hoeWerktDitHtml("voor-jou") : ""}</div>
    ${inlogRegel}
    ${vjNaamRegelHtml(ctx)}
    ${lijst.length >= 2 ? `<a class="knop blad-knop vj-ronde-start" href="#/ronde">Loop ze één voor één door ›</a>` : ""}
    ${lijst.length
      ? `<ol class="vj-lijst">${genummerd.map(r => vjKaartHtml(ctx, r, vjNummering.map.get(r.__entryId), kanAfhandelen)).join("")}</ol>`
      : `<p class="vj-leeg">Niets voor jou op dit moment. Je team werkt door; wat het voor je klaarzet, verschijnt hier.</p>`}
    ${typeof opdrachtKnopHtml === "function" ? `<p class="vj-opdracht">${opdrachtKnopHtml(ctx)}</p>` : ""}
    ${vjOnderregelsHtml(ctx)}`;

  wireVjNaam(body, ctx);
  // Eén handler per paneel, vervangen bij elke render (renderAll tekent dit
  // paneel na elke schrijfactie opnieuw).
  body.onclick = (e) => {
    const knop = e.target.closest && e.target.closest("[data-vj-afhandel]");
    if (!knop) return;
    const kaart = knop.closest("[data-vj-id]");
    const id = kaart.getAttribute("data-vj-id");
    const rij = (dataRijenVan(ctx, "acties") || []).find(r => r.__entryId === id);
    if (!rij) return;
    // Na afloop de focus op de volgende kaart, zodat je met het toetsenbord
    // gewoon doorwerkt; zonder volgende op de kop.
    const volgende = kaart.nextElementSibling && kaart.nextElementSibling.getAttribute("data-vj-id");
    voerAfhandelingUit(ctx, "acties", rij, knop.getAttribute("data-vj-afhandel"), {}, {
      naamSlot: kaart.querySelector("[data-naam-slot]"),
      foutEl: kaart.querySelector("[data-kaart-fout]"),
      bezig: kaart,
      knoppen: Array.from(kaart.querySelectorAll("button")),
      focus: volgende ? `[data-vj-id="${cssWaarde(volgende)}"] .vj-titel` : ".vj-kop h2",
    });
  };
}

/* Weet het dashboard niet wie je bent, dan telt alles van een mens mee —
 * ook wat op naam van een collega staat. Werken er meerdere mensen aan de
 * acties, dan zeggen we dat, met een knop om je naam te kiezen. Bewust pas
 * op een klik: de naam opzoeken bij de site gebeurt alleen als jij erom vraagt
 * (i77 — wie nooit iets doet, laat ons nooit een adres opzoeken). */
function vjNaamRegelHtml(ctx) {
  if (vjIk(ctx) || !magDomeinBewerken(ctx, "acties").ok) return "";
  const namen = agentNamen(ctx.schema);
  const mensen = new Set();
  for (const r of rows(ctx.bundle, "acties") || []) {
    const e = dataCelTekst(getField(r, "Eigenaar")).trim();
    if (e && !isAgentNaam(e, namen) && getField(r, "Status") !== "Klaar") mensen.add(normAgentNaam(e));
  }
  if (mensen.size < 2) return "";
  return `<p class="vj-inlog">Werk je met meer mensen aan deze acties?
      <button type="button" class="knop blad-knop" data-vj-naam>Zeg wie je bent</button>
      dan zie je hier alleen wat van jou is.</p>
    <div data-naam-slot="vj"></div>`;
}

function wireVjNaam(el, ctx) {
  const wijzig = el.querySelector("[data-vj-naam-wijzig]");
  if (wijzig) {
    wijzig.addEventListener("click", () => {
      let slot = el.querySelector('[data-naam-slot="vj"]');
      if (!slot) { slot = document.createElement("div"); slot.setAttribute("data-naam-slot", "vj"); wijzig.closest(".vj-kop").after(slot); }
      vraagNaamIn(slot, ctx.bron).then((naam) => {
        if (!naam) { wijzig.focus(); return; }
        meld(`Je werkt nu als ${naam}.`);
        if (ctx.hertekenAlles) ctx.hertekenAlles();
      });
    });
  }
  const knop = el.querySelector("[data-vj-naam]");
  if (!knop) return;
  knop.addEventListener("click", () => {
    vraagNaamIn(el.querySelector('[data-naam-slot="vj"]'), ctx.bron).then((naam) => {
      if (!naam) { knop.focus(); return; }
      meld(`Je werkt nu als ${naam}.`);
      if (ctx.hertekenAlles) ctx.hertekenAlles();
    });
  });
}

/* ── f46: één voor één ─────────────────────────────────────────────────
 *
 * "Loop ze één voor één door": het item-blad van elk stuk in de werkbak,
 * in dezelfde volgorde en met dezelfde nummers. Handel je er een af, dan
 * verdwijnt het uit de werkbak (aanJouZet) en staat vanzelf het volgende er;
 * de ronde zelf onthoudt alleen welke stukken erin zaten, waar je bent en wat
 * je oversloeg. Aan het eind een slotkaart: wat je deed, en wat nu bij je team
 * ligt. De ronde leeft per bundel, net als de nummers: Ververs begint opnieuw. */
let vjRonde = null;

function _resetRonde() { vjRonde = null; }

function rondeVoor(ctx) {
  const lijst = voorJouLijst(ctx);
  if (!lijst) return null;
  if (!vjRonde || vjRonde.bundle !== ctx.bundle) {
    vjRonde = { bundle: ctx.bundle, ids: vjGenummerd(ctx.bundle, lijst).map(r => r.__entryId), pos: 0, over: new Set() };
  }
  const nog = new Set(lijst.map(r => r.__entryId));
  let i = vjRonde.pos;
  while (i < vjRonde.ids.length && (!nog.has(vjRonde.ids[i]) || vjRonde.over.has(vjRonde.ids[i]))) i++;
  vjRonde.pos = i;
  const afgehandeld = vjRonde.ids.filter(id => !nog.has(id)).length;
  return { ronde: vjRonde, huidig: vjRonde.ids[i] || null, nog, afgehandeld, totaal: vjRonde.ids.length };
}

function rondeKopHtml(nr, positie, totaal, heeftVorige) {
  return `<div class="ronde-kop">
      <span class="ronde-voortgang">Nr ${nr} · ${positie} van ${totaal}</span>
      <span class="ronde-knoppen">
        <button type="button" class="knop-mini bedien-knop" data-ronde="vorige" aria-keyshortcuts="K"${heeftVorige ? "" : " disabled"}>‹ Vorige</button>
        <button type="button" class="knop-mini bedien-knop" data-ronde="over" aria-keyshortcuts="J">Sla over ›</button>
        <a class="knop-mini bedien-knop" href="#/" data-ronde="stop" aria-keyshortcuts="Escape">Stoppen</a>
      </span>
    </div>`;
}

function renderRonde(buiten, ctx) {
  // Elke tekening in een vers vak: zo nemen de klik-handlers van het vorige
  // blad niet mee naar het volgende (anders deed een knop het twee keer).
  const el = document.createElement("div");
  buiten.replaceChildren(el);
  const opnieuw = () => {
    renderRonde(buiten, ctx);
    const t = buiten.querySelector(".blad-titel"); if (t) t.focus();
  };
  const stand = rondeVoor(ctx);
  if (!stand) { el.innerHTML = `<p>Er is niets om door te lopen.</p><a class="detail-link" href="#/">← Voor jou</a>`; return; }
  const { ronde, huidig, totaal, afgehandeld } = stand;
  if (!huidig) {
    const over = ronde.over.size;
    const team = bijTeam(ctx.bundle, ctx.schema, { nu: ctx.today || new Date() }).length;
    el.innerHTML = `<div class="blad ronde-slot">
      <h2 class="blad-titel" tabindex="-1">Klaar voor nu</h2>
      <p>Je handelde er ${afgehandeld} af${over ? `, ${over} sloeg je over` : ""}.</p>
      ${team ? `<p class="footnote">Bij je team: ${team}. Wat het oppakt, zie je terug in Voor jou.</p>` : ""}
      <p><a class="knop blad-knop blad-knop-prim" href="#/">Terug naar Voor jou</a>
        ${over ? `<button type="button" class="knop blad-knop" data-ronde="opnieuw">Loop de overgeslagen nog eens door</button>` : ""}</p>
    </div>`;
    el.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest('[data-ronde="opnieuw"]')) {
        ronde.over.clear();
        ronde.pos = 0;
        opnieuw();
      }
    });
    return;
  }
  const rij = (dataRijenVan(ctx, "acties") || []).find(r => r.__entryId === huidig);
  const nr = vjNummering.map.get(huidig);
  const heeftVorige = ronde.ids.slice(0, ronde.pos).some(id => stand.nog.has(id));
  el.innerHTML = itemBladHtml(ctx, "acties", rij, { kop: rondeKopHtml(nr, ronde.pos + 1, totaal, heeftVorige) });
  wireItemBlad(el, "acties", rij, ctx);
  el.addEventListener("click", (e) => {
    const knop = e.target.closest && e.target.closest("[data-ronde]");
    if (!knop) return;
    const wat = knop.getAttribute("data-ronde");
    if (wat === "over") { ronde.over.add(huidig); ronde.pos += 1; }
    else if (wat === "vorige") {
      // Terug naar het vorige stuk dat nog openstaat, ook als je het oversloeg.
      let i = ronde.pos - 1;
      while (i >= 0 && !stand.nog.has(ronde.ids[i])) i--;
      if (i < 0) return;
      ronde.over.delete(ronde.ids[i]);
      ronde.pos = i;
    } else return;
    opnieuw();
  });
}

/* ── f46: sneltoetsen op een toetsenbord ────────────────────────────────
 * Nooit terwijl je typt, en nooit met Ctrl/Cmd/Alt erbij (die zijn van de
 * browser). Op Voor jou opent 1–9 dat nummer; in de ronde bladeren J/K (of de
 * pijltjes), doet G de hoofdknop en stopt Esc. Op een los blad gaat Esc terug
 * naar Acties. Alleen toetsen die nu ergens heen kunnen, doen iets. */
function vjToetsIsTypen(doel) {
  if (!doel || !doel.tagName) return false;
  const t = doel.tagName.toLowerCase();
  return t === "input" || t === "textarea" || t === "select" || doel.isContentEditable;
}

function vjSneltoets(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || vjToetsIsTypen(e.target)) return;
  const hash = window.location.hash || "";
  const klik = (sel) => { const k = document.querySelector(sel); if (k) { e.preventDefault(); k.click(); } return !!k; };
  if (hash === "#/ronde") {
    if (e.key === "j" || e.key === "ArrowRight") return void klik('[data-ronde="over"]');
    if (e.key === "k" || e.key === "ArrowLeft") return void klik('[data-ronde="vorige"]');
    if (e.key === "g") return void klik("[data-afhandel].blad-knop-prim, [data-afhandel].blad-knop-teamvol");
    if (e.key === "Escape") { e.preventDefault(); window.location.hash = "#/"; }
    return;
  }
  if (/^#\/acties\/./.test(hash)) {
    if (e.key === "Escape" && !document.querySelector("[data-vraag], .naam-vraag")) { e.preventDefault(); window.location.hash = "#/acties"; }
    return;
  }
  if ((hash === "" || hash === "#" || hash === "#/") && /^[1-9]$/.test(e.key)) {
    const nr = Number(e.key);
    for (const [id, n] of vjNummering.map) {
      if (n === nr && document.querySelector(`[data-vj-id="${cssWaarde(id)}"]`)) {
        e.preventDefault();
        window.location.hash = `#/acties/${encodeURIComponent(id)}`;
        return;
      }
    }
  }
}

let vjToetsenAan = false;
function zetSneltoetsenAan() {
  if (vjToetsenAan || typeof document === "undefined") return;
  vjToetsenAan = true;
  document.addEventListener("keydown", vjSneltoets);
}

/* Voor de badge op de tab: hetzelfde getal als de kop van de werkbak. */
function voorJouAantal(ctx) {
  const lijst = voorJouLijst(ctx);
  if (lijst) return lijst.length;
  const uitDagstart = typeof metricsVoorJou === "function" ? metricsVoorJou(ctx) : null;
  return uitDagstart ? uitDagstart.length : null;
}

if (typeof module !== "undefined") {
  module.exports = { renderVoorJou, voorJouLijst, voorJouAantal, vjVerhaal, vjGenummerd, _resetVoorJouNummers,
    renderRonde, rondeVoor, _resetRonde, vjSneltoets, zetSneltoetsenAan };
}
