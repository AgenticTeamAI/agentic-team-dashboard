/* f50 — Opdracht geven in drie vragen (#/opdracht, #/opdracht/<specialist>).
 *
 * Vervangt voor acties het formulier van 21 velden: wat, wie, wanneer, en
 * optioneel waar het bij hoort. De rest zijn vaste waarden, zodat een
 * werkmoment de opdracht ook echt oppakt: werkronde.md stap 0 zoekt Status
 * Open met een agent als Eigenaar — en Eigenaar + Agent gaan altijd samen
 * (b61). Aangemaakt door is jouw naam, nooit een agent: anders telt het
 * verhaal "je team zette klaar" jouw opdracht mee.
 *
 * Alleen specialisten die al in dit team voorkomen (in je acties, vaste taken,
 * teamfeed of activatietelling), plus de Management Assistent. Een specialist
 * buiten je licentie zou de opdracht nooit oppakken, en het dashboard kent je
 * licentie verder niet. */

const OPDRACHT_NOOIT = ["orchestrator", "quality-control", "gids"];
const OPDRACHT_ALTIJD = ["management-assistent"];
const OPDRACHT_TITEL_MAX = 120;

/* {slug, naam, n} — vaakst gezien eerst. */
function beschikbareSpecialisten(ctx) {
  const schema = ctx.schema;
  const tel = new Map();
  const zag = (agent, n = 1) => { if (agent && OPDRACHT_NOOIT.indexOf(agent.slug) === -1) tel.set(agent.slug, (tel.get(agent.slug) || 0) + n); };
  const opNaam = (w) => { const naam = agentWeergaveNaam(schema, w); return naam ? schema.agents.find(a => a.displayName === naam) : null; };
  for (const r of rows(ctx.bundle, "acties") || []) {
    for (const veld of ["Agent", "Eigenaar", "Aangemaakt door", "Afgerond door"]) zag(opNaam(getField(r, veld)));
  }
  for (const t of dataRijenVan(ctx, "ritmetaken") || []) zag(opNaam(getField(t, "Agent")));
  const feed = ctx.bundle && ctx.bundle.teamfeed;
  for (const e of (feed && Array.isArray(feed.entries) ? feed.entries : [])) {
    const slug = String((e && e.data && getField(e.data, "Agent")) || "");
    zag(schema.agents.find(a => a.slug === slug) || opNaam(slug));
  }
  const act = ctx.bundle && ctx.bundle.activaties;
  for (const w of (act && Array.isArray(act.weken) ? act.weken : [])) {
    for (const [slug, n] of Object.entries(w.per_agent || {})) zag(schema.agents.find(a => a.slug === slug), Number(n) || 0);
  }
  for (const slug of OPDRACHT_ALTIJD) if (!tel.has(slug)) tel.set(slug, 0);
  return [...tel.entries()]
    .map(([slug, n]) => { const a = schema.agents.find(x => x.slug === slug); return a ? { slug, naam: a.displayName, emoji: a.emoji || "", n } : null; })
    .filter(Boolean)
    .sort((a, b) => b.n - a.n || a.naam.localeCompare(b.naam, "nl"));
}

/* Collega's: wie al eigenaar is van een actie, zonder agents en zonder jou. */
function opdrachtCollegas(ctx, ik) {
  const namen = agentNamen(ctx.schema);
  const gezien = new Map();
  for (const r of rows(ctx.bundle, "acties") || []) {
    const e = String(getField(r, "Eigenaar") || "").trim();
    if (!e || (namen && isAgentNaam(e, namen)) || (ik && naamGelijk(e, ik))) continue;
    const k = e.toLowerCase();
    if (!gezien.has(k)) gezien.set(k, e);
  }
  return [...gezien.values()].sort((a, b) => a.localeCompare(b, "nl")).slice(0, 20);
}

/* Wat er weggeschreven wordt. `wie` is {agent: naam} of {mens: naam}. */
function opdrachtData({ wat, uitleg, wie, deadline, hoortBij, ik, nu }) {
  const tekst = String(wat || "").trim();
  const eersteRegel = tekst.split("\n")[0].trim();
  const titel = eersteRegel.length > OPDRACHT_TITEL_MAX ? eersteRegel.slice(0, OPDRACHT_TITEL_MAX - 1) + "…" : eersteRegel;
  const toelichting = [tekst, String(uitleg || "").trim()].filter(Boolean).join("\n\n");
  const data = { Actie: titel.charAt(0).toUpperCase() + titel.slice(1), Status: VJ_OPEN, Type: "Taak", Prioriteit: "Normaal" };
  if (toelichting && toelichting !== titel) data.Toelichting = toelichting;
  if (wie.agent) { data.Eigenaar = wie.agent; data.Agent = wie.agent; } else if (wie.mens) data.Eigenaar = wie.mens;
  if (ik) data["Aangemaakt door"] = ik;
  if (deadline) {
    data.Deadline = deadline;
    // Het werkmoment pakt Hoog eerst. Moet het binnen twee werkdagen af, dan gaat het voor.
    if (wie.agent && werkdagenNa(nu, parseDateField(deadline)) <= 2) data.Prioriteit = "Hoog";
  }
  if (hoortBij) data.Organisatie = hoortBij;
  return data;
}

/* De regel onder "wie": wat er nu gaat gebeuren — eerlijk, ook als het blijft liggen. */
function opdrachtVerwachting(ctx, wie) {
  if (wie.mens) {
    const ik = vjIk(ctx);
    return { k: "mens", tekst: ik && naamGelijk(wie.mens, ik) ? "Het komt op je eigen lijst." : `Het komt op de lijst van ${wie.mens}.` };
  }
  if (!wie.agent) return null;
  const kc = klaarCheck(ctx);
  if (kc.stil) return { k: "let", klaar: true, tekst: `Let op: je team werkt nu niet vanzelf. Dit blijft liggen tot je team weer werkt.` };
  if (kc.wachten) return { k: "let", tekst: `Je werkmoment is net aangezet. Na de eerste nacht pakt ${wie.agent} dit op.` };
  const sporen = werkmomentSporen(ctx);
  const laatst = sporen.length ? new Date(Math.max(...sporen)) : null;
  const nu = ctx.today || new Date();
  const namen = agentNamen(ctx.schema);
  const klaar = (rows(ctx.bundle, "acties") || []).filter(r => vjTekst(r, "Status") === VJ_OPEN && namen && isAgentNaam(getField(r, "Eigenaar"), namen) && !wachtInToekomst(r, nu)).length;
  const rij = klaar >= 3 ? ` Er staan al ${klaar} opdrachten klaar; je team doet er 3 per werkmoment, Hoog eerst.` : "";
  return { k: "ok", tekst: `${wie.agent} pakt dit op bij het volgende werkmoment${laatst ? ` (laatst: ${vtWanneer(laatst, nu)})` : ""}. Het resultaat zie je bij Voor jou.${rij}` };
}

function opdrachtDoel(hash) {
  const m = /^#\/opdracht(?:\/([a-z-]+))?\/?$/.exec(String(hash || ""));
  return m ? { voor: m[1] || null } : null;
}

function opdrachtKnopHtml(ctx, { tekst = "Geef je team een opdracht", voor = null } = {}) {
  if (!ctx || !rows(ctx.bundle, "acties") || !magDomeinBewerken(ctx, "acties").ok) return "";
  return `<a class="knop blad-knop blad-knop-teamvol opdracht-knop" href="#/opdracht${voor ? "/" + voor : ""}">＋ ${esc(tekst)}</a>`;
}

/* Het concept blijft staan zolang dit tabblad open is: wie even wegklikt, is
 * zijn tekst niet kwijt. Alleen in het geheugen, geen opslag. */
let opdrachtStaat = null;

/* Een opdracht vooraf invullen en erheen gaan (f49: "Laat je team de gegevens
 * aanvullen", "Opdracht voor je team" op een organisatiepagina). */
function startOpdracht({ wat = "", uitleg = "", voor = null, hoortBij = "" } = {}, ctx) {
  const agent = voor && ctx ? ctx.schema.agents.find(a => a.slug === voor) : null;
  opdrachtStaat = { wat, uitleg, wie: agent ? { agent: agent.displayName } : {}, deadline: "", hoortBij, voorSlug: agent ? voor : null };
  window.location.hash = agent ? `#/opdracht/${voor}` : "#/opdracht";
}

function renderOpdracht(el, ctx, doel) {
  const bewerk = magDomeinBewerken(ctx, "acties");
  const kop = `<p><a class="detail-link" href="#/acties">← Acties</a></p><h2 class="opdracht-titel" tabindex="-1">Geef je team een opdracht</h2>`;
  if (!rows(ctx.bundle, "acties") || !bewerk.ok) {
    // Elders (Notion), of meekijken met de daglink: dan zeggen we waarom, en
    // wat wél kan. Het formulier tekenen zou een knop geven die niets doet.
    const waarom = !rows(ctx.bundle, "acties") ? "Je acties staan niet in je werkruimte."
      : bewerk.reden || "Met je daglink kun je meekijken, niet doorgeven.";
    const login = !bewerk.reden && rows(ctx.bundle, "acties") && typeof oauthMogelijk === "function" && oauthMogelijk()
      ? `<p><button type="button" class="knop blad-knop blad-knop-prim" data-login>Log in om door te geven</button></p>` : "";
    el.innerHTML = `${kop}<p>${esc(waarom)}</p>${login}<p>Of zeg het in Claude, bijvoorbeeld:</p>
      ${vtKopieerHtml("Zet een actie klaar voor de Researcher: zoek tien installatiebedrijven in Utrecht die groeien.")}`;
    return wireOpdrachtKopieer(el);
  }
  const specialisten = beschikbareSpecialisten(ctx);
  const voor = doel && doel.voor ? specialisten.find(s => s.slug === doel.voor) : null;
  if (!opdrachtStaat || (voor && opdrachtStaat.voorSlug !== voor.slug)) {
    opdrachtStaat = { wat: "", uitleg: "", wie: voor ? { agent: voor.naam } : {}, deadline: "", hoortBij: "", voorSlug: voor ? voor.slug : null };
  }
  const s = opdrachtStaat;
  const ik = vjIk(ctx);
  const top = specialisten.slice(0, 3);
  const rest = specialisten.slice(3);
  const collegas = opdrachtCollegas(ctx, ik);
  const nu = ctx.today || new Date();
  const orgs = dataRijenVan(ctx, "organisaties") || [];
  const orgTitelVeld = ctx.schema.datadomeinen.organisaties && ctx.schema.datadomeinen.organisaties.velden[0].naam;
  const gekozenAgent = (naam) => s.wie.agent && naamGelijk(s.wie.agent, naam);
  const knopWie = (label, waarde, soort, gekozen) =>
    `<button type="button" class="opdracht-keuze${soort === "mens" ? " mens" : ""}" data-opdracht-wie="${soort}:${esc(waarde)}" aria-pressed="${gekozen}">${label}</button>`;
  const ikKnop = ik ? knopWie("Ikzelf", ik, "mens", !!s.wie.mens && naamGelijk(s.wie.mens, ik)) : "";
  const anders = [...rest.map(x => [`agent:${x.naam}`, x.naam, gekozenAgent(x.naam)]), ...collegas.map(c => [`mens:${c}`, c, !!s.wie.mens && naamGelijk(s.wie.mens, c)])];
  const datum = [{ label: "Geen haast", datum: "" }].concat(datumKeuzes(nu).slice(0, 3));
  const eigenDatum = s.deadline && !datum.some(d => d.datum === s.deadline);
  const ontvanger = s.wie.agent ? `Geef aan ${s.wie.agent}` : s.wie.mens ? (ik && naamGelijk(s.wie.mens, ik) ? "Zet op mijn lijst" : `Zet bij ${s.wie.mens}`) : "Kies eerst wie het oppakt";
  const v = opdrachtVerwachting(ctx, s.wie);
  el.innerHTML = `${kop}
    <form class="opdracht" data-opdracht novalidate>
      <label class="opdracht-veld"><span>Wat moet er gebeuren?</span>
        <textarea data-opdracht-wat rows="3" maxlength="4000" placeholder="Bijvoorbeeld: zoek tien installatiebedrijven in Utrecht die groeien">${esc(s.wat)}</textarea></label>
      <fieldset class="opdracht-groep"><legend>Wie pakt het op?</legend>
        <div class="opdracht-keuzes">${top.map(x => knopWie(`${x.emoji ? `<span aria-hidden="true">${esc(x.emoji)}</span> ` : ""}${esc(x.naam)}`, x.naam, "agent", gekozenAgent(x.naam))).join("")}${ikKnop}
        ${anders.length ? `<select data-opdracht-anders aria-label="Iemand anders"><option value="">Iemand anders…</option>${anders.map(([w, l, g]) => `<option value="${esc(w)}"${g ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}</div>
        ${v ? `<p class="opdracht-verwachting ${v.k}" data-opdracht-verwachting>${esc(v.tekst)}${v.klaar ? ` <a href="#/klaar">Zo regel je dat →</a>` : ""}</p>` : ""}
      </fieldset>
      <fieldset class="opdracht-groep"><legend>Voor wanneer?</legend>
        <div class="opdracht-keuzes">${datum.map(d => `<button type="button" class="opdracht-keuze datum" data-opdracht-datum="${d.datum}" aria-pressed="${s.deadline === d.datum}">${esc(d.label)}</button>`).join("")}
        <label class="opdracht-datum"><span class="sr-only">Andere datum</span><input type="date" data-opdracht-eigen-datum value="${eigenDatum ? esc(s.deadline) : ""}"></label></div>
      </fieldset>
      ${orgs.length && orgTitelVeld ? `<label class="opdracht-veld"><span>Hoort bij <small>(mag leeg)</small></span>
        <select data-opdracht-hoort><option value="">Niets</option>${orgs.filter(o => o.__entryId).map(o => `<option value="${esc(o.__entryId)}"${s.hoortBij === o.__entryId ? " selected" : ""}>${esc(dataCelTekst(getField(o, orgTitelVeld)) || o.__entryId)}</option>`).join("")}</select></label>` : ""}
      <details class="opdracht-meer"${s.uitleg ? " open" : ""}><summary>Meer uitleg voor je team</summary>
        <label class="opdracht-veld"><span class="sr-only">Uitleg voor je team</span><textarea data-opdracht-uitleg rows="4" maxlength="4000">${esc(s.uitleg)}</textarea></label>
        <p class="footnote">Schrijf wat je een nieuwe collega zou appen. Tijdens het werkmoment kan je team niets navragen.</p></details>
      <div data-naam-slot="opdracht"></div>
      <p class="opdracht-fout" data-opdracht-fout role="alert"></p>
      <button type="submit" class="knop blad-knop ${s.wie.mens ? "blad-knop-prim" : "blad-knop-teamvol"}" data-opdracht-ok${s.wie.agent || s.wie.mens ? "" : " disabled"}>${esc(ontvanger)}</button>
    </form>`;
  wireOpdracht(el, ctx, doel);
}

function wireOpdrachtKopieer(el) {
  el.onclick = async (e) => {
    const k = e.target.closest && e.target.closest("[data-vt-kopieer]");
    if (!k) return;
    const gelukt = await kopieerTekst(k.getAttribute("data-vt-kopieer"));
    meld(gelukt ? "Gekopieerd. Plak het in Claude." : "Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.");
  };
}

function wireOpdracht(el, ctx, doel) {
  const s = opdrachtStaat;
  const form = el.querySelector("[data-opdracht]");
  const opnieuw = (focus) => { renderOpdracht(el, ctx, doel); if (focus) { const f = el.querySelector(focus); if (f) f.focus(); } };
  form.querySelector("[data-opdracht-wat]").addEventListener("input", (e) => { s.wat = e.target.value; });
  const uitleg = form.querySelector("[data-opdracht-uitleg]");
  if (uitleg) uitleg.addEventListener("input", (e) => { s.uitleg = e.target.value; });
  const zetWie = (waarde) => {
    const i = waarde.indexOf(":");
    const soort = waarde.slice(0, i); const naam = waarde.slice(i + 1);
    s.wie = soort === "agent" ? { agent: naam } : soort === "mens" ? { mens: naam } : {};
  };
  form.addEventListener("click", (e) => {
    const wie = e.target.closest("[data-opdracht-wie]");
    if (wie) { zetWie(wie.getAttribute("data-opdracht-wie")); return opnieuw(`[data-opdracht-wie="${cssWaarde(wie.getAttribute("data-opdracht-wie"))}"]`); }
    const d = e.target.closest("[data-opdracht-datum]");
    if (d) { s.deadline = d.getAttribute("data-opdracht-datum"); return opnieuw(`[data-opdracht-datum="${cssWaarde(s.deadline)}"]`); }
  });
  const anders = form.querySelector("[data-opdracht-anders]");
  if (anders) anders.addEventListener("change", () => { if (anders.value) { zetWie(anders.value); opnieuw("[data-opdracht-anders]"); } });
  const eigen = form.querySelector("[data-opdracht-eigen-datum]");
  eigen.addEventListener("change", () => { s.deadline = eigen.value || ""; opnieuw("[data-opdracht-eigen-datum]"); });
  const hoort = form.querySelector("[data-opdracht-hoort]");
  if (hoort) hoort.addEventListener("change", () => { s.hoortBij = hoort.value; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fout = form.querySelector("[data-opdracht-fout]");
    const knop = form.querySelector("[data-opdracht-ok]");
    fout.textContent = "";
    if (!s.wat.trim()) { fout.textContent = "Schrijf eerst wat er moet gebeuren."; form.querySelector("[data-opdracht-wat]").focus(); return; }
    if (!s.wie.agent && !s.wie.mens) { fout.textContent = "Kies eerst wie het oppakt."; return; }
    // Aangemaakt door is jouw naam; wil je die niet geven, dan blijft het veld leeg.
    const ik = await naamVoorSchrijfactieIn(form.querySelector('[data-naam-slot="opdracht"]'), ctx.bron, { overslaan: true });
    const nu = ctx.today || new Date();
    const data = opdrachtData({ wat: s.wat, uitleg: s.uitleg, wie: s.wie, deadline: s.deadline, hoortBij: s.hoortBij, ik, nu });
    knop.disabled = true; form.setAttribute("aria-busy", "true");
    try {
      const antwoord = await schrijfWerkruimte(ctx.bron, "POST", "/dashboard/entries", { domein: "acties", data });
      const nieuwId = antwoord && antwoord.entry && antwoord.entry.entryId;
      if (nieuwId && ctx.werkBij) ctx.werkBij("acties", { entry: antwoord.entry });
      const melding = s.wie.agent
        ? (klaarCheck(ctx).stil ? `Doorgegeven aan ${s.wie.agent}. Het blijft liggen tot je team weer vanzelf werkt.` : `Doorgegeven aan ${s.wie.agent}. Die pakt het op bij het volgende werkmoment.`)
        : ik && naamGelijk(s.wie.mens, ik) ? "Op je eigen lijst gezet." : `Bij ${s.wie.mens} gezet.`;
      opdrachtStaat = null;
      window.location.hash = "#/acties";
      meld(melding, nieuwId ? { actie: ongedaanNieuw(ctx, "acties", nieuwId) } : {});
    } catch (err) {
      knop.disabled = false; form.removeAttribute("aria-busy");
      const t = (err && err.message) || "Dat is niet gelukt.";
      fout.textContent = t + " Je tekst staat er nog; probeer het opnieuw.";
    }
  });
}

if (typeof module !== "undefined") {
  module.exports = { renderOpdracht, opdrachtData, opdrachtDoel, opdrachtVerwachting, beschikbareSpecialisten, opdrachtCollegas, opdrachtKnopHtml, startOpdracht };
}
