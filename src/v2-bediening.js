/* Dashboard v2 — bladen, meldingen, tekenen en alle bediening.
 *
 * Elke knop schrijft via de geteste paden: afhandelPatch (voor-jou.js) voor
 * acties, toewijsPatch/verplaatsPatch voor wie en waar, opdrachtData voor een
 * opdracht. Het antwoord van de instantie vervangt de rij ter plekke (werkBij,
 * i81); de pagina blijft staan waar hij stond. Elke wijziging is ongedaan te
 * maken, behalve verwijderen — dat zegt het blad er ook bij. */

function cssEsc(s) { try { if (window.CSS && CSS.escape) return CSS.escape(s); } catch (e) { /* geen CSS-API */ } return String(s).replace(/["\\\]\[]/g, (c) => "\\" + c); }
function det(id) { return `id="${esc(id)}" ${S.ui.det[id] ? "open" : ""}`; }
function datumKeuzesV2() { return P.datumKeuzes(NU).map(x => [x.label, x.datum]); }
function specialistenVoor(doel) {
  return beschikbareSpecialisten(CTX).filter(x => isAgentSlug(x.slug) && x.slug !== "quality-control" && x.slug !== "orchestrator").map(x => x.slug);
}
function wieKeuzes(doel, a) {
  const alleenMensen = doel === "toewijzen" && a && ["check", "check-extern", "voorstel"].includes(soortVan(a));
  const specs = alleenMensen ? [] : specialistenVoor(doel);
  const ms = mensen();
  return `${alleenMensen ? '<p class="klein stil">Dit wacht op een beslissing van een mens. Wil je dat een specialist het aanpast, gebruik dan Terug.</p>' : ""}${specs.length ? '<p class="klein stil">Specialisten</p>' : ""}<div class="keuzes">${specs.map(s => `<button class="keuze" data-act="sh-kies" data-v="ag:${esc(s)}"><span aria-hidden="true">${esc(AGENTS[s].em)}</span> ${esc(AGENTS[s].naam)}</button>`).join("")}</div>
    ${doel === "ja" || doel === "sleep" ? "" : `<p class="klein stil">Mensen</p><div class="keuzes">${ms.length ? ms.map(n => `<button class="keuze mensk" data-act="sh-kies" data-v="mens:${esc(n)}">${esc(jij() && naamGelijk(n, jij()) ? "Ikzelf" : n)}</button>`).join("") : `<button class="keuze mensk" data-act="sh-kies" data-v="mens:">Ikzelf</button>`}</div>`}`;
}
function verwachtingRegel(ag) {
  const kc = klaarCheck(); if (!ag) return "";
  if (kc.stil) return `<p class="verwachting let">Let op: je team werkt nu niet vanzelf, dus dit blijft liggen tot je team weer werkt. <button class="hoe" data-act="go" data-r="/team/klaar">Zo regel je dat</button></p>`;
  return `<p class="verwachting">${esc(deNaam(ag, true))} pakt dit op ${esc(bijHetVolgende())}. Het resultaat zie je terug bij Voor jou.</p>`;
}

/* ---------- Bladen ---------- */
/* Feedback: het dashboard verstuurt zelf niets (geen telemetrie, geen extra
 * fetch). Het blad zet je tekst plus het scherm waar je was in je eigen
 * mailprogramma; jij ziet alles en verstuurt hem zelf. */
const FEEDBACK_ADRES = "support@agentic-team.ai";
const FEEDBACK_MAX = 4000;
function feedbackScherm() { return paginaTitel().replace(/^\(\d+\) /, "").replace(/ — Je team$/, "") + " (#" + (S.route || "/") + ")"; }
function feedbackDirect() { return ingelogd() && typeof V2_HAKEN.feedback === "function"; }
function feedbackTekst(tekst) {
  const wanneer = new Date(); const tw = (n) => String(n).padStart(2, "0");
  return [String(tekst || "").trim(), "", "—",
    "Scherm: " + feedbackScherm(),
    CTX && bedrijf() ? "Werkruimte: " + bedrijf() : null,
    "Moment: " + tw(wanneer.getDate()) + "-" + tw(wanneer.getMonth() + 1) + "-" + wanneer.getFullYear() + " " + tw(wanneer.getHours()) + ":" + tw(wanneer.getMinutes()),
  ].filter(r => r !== null).join("\n");
}
function feedbackMail(tekst) {
  return "mailto:" + FEEDBACK_ADRES + "?subject=" + encodeURIComponent("Feedback op het dashboard") + "&body=" + encodeURIComponent(feedbackTekst(tekst));
}
/* Versturen naar de site (die zet hem in de Notion-database Dashboard-feedback).
 * Lukt het niet, dan blijft je tekst staan en wordt het blad de mailroute. */
async function feedbackSturen(btn) {
  const sh = S.sheet; if (!sh || sh.type !== "feedback" || isBezig("feedback")) return;
  const tekst = (sh.tekst || "").trim();
  if (!tekst) { sh.fout = "Schrijf eerst je feedback."; S.focusNa = "#sh-tekst"; render(); return; }
  BEZIG.add("feedback"); zetBezig(btn);
  let uit = null;
  try { uit = await V2_HAKEN.feedback({ tekst, scherm: feedbackScherm() }); } catch (e) { uit = null; }
  finally { BEZIG.delete("feedback"); }
  if (S.sheet !== sh) return;
  if (uit && uit.ok) { S.sheet = null; toast("Dank je! Je feedback is binnen."); render(); return; }
  if (uit && uit.status === 400 && uit.body && uit.body.fout) sh.fout = uit.body.fout;
  else { sh.terugval = true; sh.fout = "Versturen lukte nu niet. Mail hem hieronder, dan komt hij ook aan."; }
  render();
}
function openMail(url) { if (V2_HAKEN.mail) { V2_HAKEN.mail(url); return; } try { window.location.href = url; } catch (e) { /* geen mailprogramma */ } }
function renderSheet() {
  const sh = S.sheet; if (!sh) return ""; const a = sh.id && !sh.k ? actie(sh.id) : null;
  const wrap = (titel, inner, cls) => `<div class="scrim ${cls || "klein"}" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-titel" data-stop>${isDesk() ? "" : '<span class="greep" aria-hidden="true"></span>'}<div class="tussen"><h3 id="sheet-titel" tabindex="-1">${esc(titel)}</h3><button class="ikknop" data-act="sh-dicht" aria-label="Sluiten">${ic("sluit")}</button></div>${inner}</div></div>`;
  const annuleer = `<button class="knop stil" data-act="sh-dicht">Annuleer</button>`;
  const fout = sh.fout ? `<p class="fout" role="alert">${esc(sh.fout)}</p>` : "";
  if (sh.type === "feedback") {
    const veld = `<p class="klein stil">Wat werkt niet, wat mis je, wat kan beter? Eén zin is genoeg.</p>
      <label class="lb" for="sh-tekst">Je feedback</label><textarea id="sh-tekst" data-sh="tekst" maxlength="${FEEDBACK_MAX}" placeholder="Bijvoorbeeld: ik zie niet waar mijn vaste taken staan.">${esc(sh.tekst || "")}</textarea>${fout}`;
    // Ingelogd: rechtstreeks naar ons (Notion). Met een daglink praat het
    // dashboard nooit met de site, dus dan — en als versturen mislukt — mail.
    if (feedbackDirect() && !sh.terugval) return wrap("Feedback geven", `${veld}
      <p class="verwachting">Je tekst gaat met het scherm waar je was en je naam naar het team achter Agentic Team. We lezen alles en gebruiken het om het dashboard beter te maken. Gegevens uit je werkruimte gaan niet mee.</p>
      <div class="rijtje">${knop(ic("bericht", "klein") + "Verstuur", "feedback-stuur", "", "prim")}${annuleer}</div>`);
    return wrap("Feedback geven", `${veld}
      <p class="verwachting">${sh.gemaild ? "Ging je mailprogramma open? Verstuur hem daar; dan kun je dit blad sluiten." : "Je mailprogramma opent met je tekst en het scherm waar je was. Jij verstuurt hem zelf."}${!sh.terugval && kanInloggen() && !ingelogd() ? " Log je in, dan kun je hem hier direct versturen." : ""}</p>
      <div class="rijtje">${knop(ic("bericht", "klein") + "Open in je mail", "feedback-mail", "", "prim")}${knop(ic("kopieer", "klein") + "Kopieer", "feedback-kopieer")}<button class="knop stil" data-act="sh-dicht">${sh.gemaild ? "Sluiten" : "Annuleer"}</button></div>
      <p class="klein stil">Gaat er geen mail open? Kopieer je tekst en mail hem naar <span class="mono" style="user-select:all;white-space:nowrap">${FEEDBACK_ADRES}</span>.</p>`);
  }
  const ag = a ? werkAgent(a) : null; const kc = klaarCheck();
  switch (sh.type) {
    case "terug": return wrap("Terug naar " + deNaam(ag), `<label class="lb" for="sh-tekst">Wat moet ${esc(deNaam(ag))} anders doen?</label><textarea id="sh-tekst" data-sh="tekst" placeholder="Bijvoorbeeld: korter, en noem de offerte van vorige week.">${esc(sh.tekst || "")}</textarea>
      <div class="keuzes">${["Korter", "Formeler", "Persoonlijker", "Andere insteek"].map(c => `<button class="keuze" data-act="sh-chip" data-t="${c}">${c}</button>`).join("")}</div>
      ${kc.stil ? '<p class="verwachting let">Let op: je team werkt nu niet vanzelf. De nieuwe versie komt pas als je team weer werkt.</p>' : `<p class="verwachting">Je team pakt dit op ${esc(bijHetVolgende())}. Daarna staat de nieuwe versie bij Voor jou.</p>`}${fout}
      <div class="rijtje">${knop(ic("terug", "klein") + "Terug naar " + esc(deNaam(ag)), "sh-ok", "", "team")}${annuleer}</div>`);
    case "nee": return wrap("Nee, niet doen", `<p><b>${esc(a.titel)}</b></p><label class="lb" for="sh-tekst">Waarom niet? <span class="stil klein">(mag leeg)</span></label><textarea id="sh-tekst" data-sh="tekst" placeholder="Bijvoorbeeld: de marge is nu te laag.">${esc(sh.tekst || "")}</textarea><p class="klein stil">Je team leert hiervan.</p>${fout}<div class="rijtje">${knop("Niet doen", "sh-ok", "", "prim")}${annuleer}</div>`);
    case "zelf": return wrap("Zelf aangepast", `<label class="lb" for="sh-tekst">Wat heb je veranderd?</label><input type="text" id="sh-tekst" data-sh="tekst" value="${esc(sh.tekst || "")}" placeholder="Bijvoorbeeld: andere aanhef, prijs erbij"><p class="klein stil">Eén zin helpt je team leren.</p>${fout}<div class="rijtje">${knop("Opslaan en afronden", "sh-ok", "", "prim")}${annuleer}</div>`);
    case "later": return wrap(soortVan(a) === "wacht" ? "Datum verzetten" : "Later", `<p class="klein stil">Uit je lijst tot:</p><div class="keuzes">${datumKeuzesV2().map(([l, d]) => `<button class="keuze" data-act="sh-kies" data-v="datum:${d}">${esc(l)} <span class="mono klein stil">${esc(datumKort(d))}</span></button>`).join("")}</div>
      <label class="lb" for="sh-datum">Of kies een datum</label><div class="rijtje"><input type="date" id="sh-datum" data-sh="datum" value="${esc(sh.datum || "")}" style="width:auto">${knop("Opslaan", "sh-ok", "", "prim")}</div>${fout}`);
    case "datum": return wrap("Nieuwe datum", `<div class="keuzes">${datumKeuzesV2().map(([l, d]) => `<button class="keuze" data-act="sh-kies" data-v="datum:${d}">${esc(l)} <span class="mono klein stil">${esc(datumKort(d))}</span></button>`).join("")}</div><label class="lb" for="sh-datum">Of kies een datum</label><div class="rijtje"><input type="date" id="sh-datum" data-sh="datum" value="${esc(sh.datum || "")}" style="width:auto">${knop("Opslaan", "sh-ok", "", "prim")}</div>${fout}`);
    case "zelfop": return wrap("Ik pak het zelf op", `<p class="klein stil">Het komt op je eigen lijst. Voor wanneer?</p><div class="keuzes">${[["Vandaag", isoDag(NU)]].concat(datumKeuzesV2()).map(([l, d]) => `<button class="keuze" data-act="sh-kies" data-v="datum:${d}">${esc(l)}</button>`).join("")}</div>${fout}`);
    case "wie": return wrap(sh.doel === "ja" ? "Wie pakt het op?" : sh.doel === "toewijzen" ? "Op wiens naam?" : "Geef aan je team", `${wieKeuzes(sh.doel, a)}${sh.doel === "toewijzen" ? '<p class="klein stil">Een specialist als eigenaar pakt het op bij het volgende werkmoment.</p>' : kc.stil ? '<p class="verwachting let">Let op: je team werkt nu niet vanzelf, dus dit blijft liggen tot je team weer werkt.</p>' : '<p class="klein stil">Een specialist pakt het op bij het volgende werkmoment. We zetten altijd goed wie er aan zet is, zodat je team het ook echt oppakt.</p>'}${fout}`);
    case "collega": return wrap("Aan een collega", `<div class="keuzes">${mensen().filter(n => !jij() || !naamGelijk(n, jij())).map(n => `<button class="keuze mensk" data-act="sh-kies" data-v="mens:${esc(n)}">${esc(n)}</button>`).join("") || '<p class="klein stil">Er staan nog geen collega\'s in je werkdata.</p>'}</div>${fout}`);
    case "prio": { const opts = ((CTX.schema.datadomeinen.acties.velden.find(v => v.naam === "Prioriteit") || {}).opties) || ["Hoog", "Normaal", "Laag"];
      return wrap("Belang", `<div class="keuzes">${opts.map(p => `<button class="keuze" data-act="sh-kies" data-v="prio:${esc(p)}" aria-pressed="${a.prio === p}">${esc(p)}</button>`).join("")}</div>${fout}`); }
    case "verwijder": return wrap("Verwijderen?", `<p>‘${esc(a.titel)}’ verdwijnt voorgoed, ook voor je collega's en je team. Dat kun je niet ongedaan maken.</p>${fout}<div class="rijtje">${knop("Verwijder", "sh-ok", "", "gevaar")}${annuleer}</div>`);
    case "opmerking": return wrap("Opmerking", `<p class="leeglabel">Voor jou en je collega's; je team leest opmerkingen niet.${["check", "check-extern"].includes(soortVan(a)) ? " Wil je dat je team iets anders doet? Gebruik Terug." : ""}</p><label class="sr" for="sh-tekst">Opmerking</label><textarea id="sh-tekst" data-sh="tekst">${esc(sh.tekst || "")}</textarea>${fout}<div class="rijtje">${knop("Plaats opmerking", "sh-ok", "", "prim")}${annuleer}</div>`);
    case "opvolgen": { const top = specialistenVoor("opvolgen").slice(0, 4); if (sh.ag && !top.includes(sh.ag)) top.push(sh.ag);
      return wrap("Laat je team opvolgen", `<label class="lb" for="sh-zin">Wat moet er gebeuren?</label><textarea id="sh-zin" data-sh="zin">${esc(sh.zin || "")}</textarea>
      <p class="klein stil">Door wie?</p><div class="keuzes">${top.map(s => `<button class="keuze" data-act="sh-set" data-k="ag" data-v="${esc(s)}" aria-pressed="${sh.ag === s}"><span aria-hidden="true">${esc(AGENTS[s].em)}</span> ${esc(AGENTS[s].naam)}</button>`).join("")}</div>
      ${verwachtingRegel(sh.ag)}${fout}<div class="rijtje">${knop("Geef aan " + esc(deNaam(sh.ag)), "sh-ok", sh.ag ? "" : "disabled", "teamvol")}${annuleer}</div>`); }
    case "meer": { const s = soortVan(a); const opts = [];
      if (["check", "check-extern"].includes(s)) opts.push(["Zelf aangepast", "zelf", "Je paste het zelf aan en rondt af"]);
      if (["check", "check-extern", "voorstel", "signaal", "taak", "weer"].includes(s)) opts.push(["Later", "later", "Uit je lijst tot een dag die jij kiest"]);
      opts.push(["Aan een collega", "collega", "Zet het op naam van een collega"]);
      opts.push(["Verwijderen", "verwijder", "Verdwijnt voorgoed"]);
      return wrap("Meer", `<div class="kol" style="gap:8px">${opts.map(([l, t, sub]) => `<button class="regel" data-act="sh-naar" data-type="${t}"><span class="rl"><b>${l}</b><span>${sub}</span></span>${ic("chev")}</button>`).join("")}</div>`); }
    case "stoppen": return wrap("Stoppen?", `<p>${esc(deNaam(ag, true))} is hier nog niet aan begonnen. Stop je het, dan doet je team dit niet meer.</p>${fout}<div class="rijtje">${knop("Stoppen", "sh-ok", "", "gevaar")}${annuleer}</div>`);
    case "verplaats": return wrap("Verplaats naar", `<div class="kol" style="gap:8px">${[["jij", "● Jij", "Je doet het zelf"], ["team", "◐ Je team", "Een specialist pakt het op"], ["wacht", "○ Wacht", "Tot een datum"], ["af", "✓ Afgerond", ""]].map(([k, l, s]) => k === sh.baan ? `<div class="regel uitgegrijsd"><span class="rl"><b>${l}</b><span>Staat hier nu</span></span></div>` : `<button class="regel" data-act="sh-kies" data-v="baan:${k}"><span class="rl"><b>${l}</b><span>${s}</span></span>${ic("chev")}</button>`).join("")}</div>`);
    case "afronden": { const s = soortVan(a); return wrap("Afronden", s === "voorstel" ? `<p class="klein stil">Een voorstel rond je af door te beslissen.</p><div class="rijtje">${knop("Ja, doe maar", "sh-kies", 'data-v="af:ja"', "prim")}${knop("Nee, niet doen", "sh-kies", 'data-v="af:nee"')}</div>` : `<p class="klein stil">Hoe ging het?</p><div class="rijtje">${knop("Goedgekeurd", "sh-kies", 'data-v="af:goed"', "prim")}${knop("Zelf aangepast", "sh-kies", 'data-v="af:zelf"')}</div>`); }
    case "naam": return wrap("Wie ben je?", `<p class="klein stil">Je naam komt bij wat je oppakt en afrondt, zodat je collega's en je team zien wie het deed. Eén keer invullen is genoeg.</p><label class="lb" for="sh-naam">Je naam</label><input type="text" id="sh-naam" data-sh="naam" maxlength="80" value="${esc(sh.naam || "")}" autocomplete="name">${fout}<div class="rijtje">${knop("Opslaan en doorgaan", "sh-ok", "", "prim")}${annuleer}</div>`);
    case "account": return wrap(jij() || "Je account", `<div class="kol" style="gap:8px">
      ${isBeheerder() ? `<button class="regel" data-act="go" data-r="/beheer"><span class="rl"><b>Beheer</b><span>Wie werkt er mee, en je modules</span></span>${ic("chev")}</button>` : ""}
      ${toegang() === "notion" ? "" : `<button class="regel" data-act="export" data-v="markdown"><span class="rl"><b>Exporteren</b><span>Je hele werkruimte als bestand (Markdown)</span></span>${ic("chev")}</button>`}
      <button class="regel" data-act="sh-naar" data-type="naam"><span class="rl"><b>Je naam</b><span>${jij() ? esc(jij()) : "Nog niet ingevuld"}</span></span>${ic("chev")}</button>
      <button class="regel" data-act="sh-naar" data-type="feedback"><span class="rl"><b>Feedback geven</b><span>Wat werkt niet, wat mis je?</span></span>${ic("chev")}</button>
      <button class="regel" data-act="uitloggen"><span class="rl"><b>Uitloggen</b><span>${toegang() === "notion" ? "Je werkdata blijft in je eigen systeem" : "Met een daglink kijk je daarna nog mee"}</span></span>${ic("chev")}</button></div>`);
    case "opdracht": {
      const kan = kanSchrijven(); const top = specialistenVoor("opdracht").slice(0, 3);
      if (sh.ag && !top.includes(sh.ag)) top.unshift(sh.ag);
      const ander = specialistenVoor("opdracht").filter(s => !top.includes(s));
      const col = mensen().filter(n => !jij() || !naamGelijk(n, jij()));
      const ontvanger = sh.ag ? "Geef aan " + deNaam(sh.ag) : sh.mens !== null && sh.mens !== undefined ? (!sh.mens || naamGelijk(sh.mens, jij()) ? "Zet op mijn lijst" : "Zet bij " + voornaam(sh.mens)) : "Kies eerst wie het oppakt";
      const orgs = rijenVan("organisaties").slice().sort((x, y) => detailTitel(domeinVan("organisaties"), x).localeCompare(detailTitel(domeinVan("organisaties"), y), "nl"));
      return wrap("Geef je team een opdracht", `
        <label class="lb" for="sh-wat">Wat moet er gebeuren?</label><textarea id="sh-wat" data-sh="wat" placeholder="Bijvoorbeeld: zoek 10 installatiebedrijven in Utrecht die groeien">${esc(sh.wat || "")}</textarea>
        <div role="group" aria-labelledby="lb-wie"><span class="lb" id="lb-wie">Wie pakt het op?</span><div class="keuzes">${top.map(s => `<button class="keuze" data-act="sh-set" data-k="ag" data-v="${esc(s)}" aria-pressed="${sh.ag === s}"><span aria-hidden="true">${esc(AGENTS[s].em)}</span> ${esc(AGENTS[s].naam)}</button>`).join("")}
          <button class="keuze mensk" data-act="sh-set" data-k="mens" data-v="${esc(jij())}" aria-pressed="${sh.mens !== null && sh.mens !== undefined && (!sh.mens || naamGelijk(sh.mens, jij()))}">Ikzelf</button>
          ${ander.length || col.length ? `<select class="veld" id="sh-ander" data-change="sh-ander" style="width:auto" aria-label="Iemand anders"><option value="">Iemand anders…</option>${ander.map(s => `<option value="ag:${esc(s)}" ${sh.ag === s ? "selected" : ""}>${esc(AGENTS[s].naam)}</option>`).join("")}${col.map(n => `<option value="mens:${esc(n)}" ${sh.mens === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>` : ""}</div></div>
        ${sh.ag ? verwachtingRegel(sh.ag) : sh.mens !== null && sh.mens !== undefined ? `<p class="verwachting mens-v">Het komt op de lijst van ${esc(!sh.mens || naamGelijk(sh.mens, jij()) ? "jou" : voornaam(sh.mens))}.</p>` : ""}
        <div role="group" aria-labelledby="lb-wanneer"><span class="lb" id="lb-wanneer">Voor wanneer?</span><div class="keuzes">${[["geen", "Geen haast"]].concat(datumKeuzesV2().slice(0, 2).map(([l, d]) => [d, l])).map(([v, l]) => `<button class="keuze mensk" data-act="sh-set" data-k="wanneer" data-v="${v}" aria-pressed="${sh.wanneer === v}">${esc(l)}</button>`).join("")}</div></div>
        ${orgs.length ? `<div><label class="lb" for="sh-hoort">Hoort bij <span class="stil klein">(mag leeg)</span></label><select class="veld" id="sh-hoort" data-change="sh-hoort"><option value="">Niets</option>${orgs.map(o => `<option value="${esc(o.__entryId)}" ${sh.hoort === o.__entryId ? "selected" : ""}>${esc(detailTitel(domeinVan("organisaties"), o))}</option>`).join("")}</select></div>` : ""}
        ${sh.onder && actie(sh.onder) ? `<p class="klein stil">Hoort onder: ${esc(actie(sh.onder).titel)}</p>` : ""}
        <details class="uitklap" ${det("opdracht-meer")}><summary>Meer: uitleg voor je team${ic("chev")}</summary><div class="binnen"><label class="lb" for="sh-uitleg">Uitleg voor je team</label><textarea id="sh-uitleg" data-sh="uitleg">${esc(sh.uitleg || "")}</textarea><p class="klein stil">Schrijf wat je een nieuwe collega zou appen: je team kan tijdens het werkmoment niets navragen.</p></div></details>
        ${fout}
        ${kan ? `<button class="knop ${sh.mens !== null && sh.mens !== undefined ? "prim" : "teamvol"} breed" data-act="sh-ok" ${sh.ag || (sh.mens !== null && sh.mens !== undefined) ? "" : "disabled"}>${esc(ontvanger)}</button>` : `${loginKnop("Log in om door te geven", "prim breed")}<p class="klein stil">Je tekst gaat verloren bij inloggen. Kopieer hem eerst.</p>`}`, "lade");
    }
    case "nieuw": {
      const { titel, extra } = nieuwVelden(sh.k); const ouder = sh.ouder ? rijTitel(sh.ouder, sh.id) : null;
      return wrap("Nieuwe " + domeinEnkel(sh.k), `<form class="kol" style="gap:10px" data-v2-nieuw>
        <div><label class="lb" for="sh-nieuw-titel">${esc(titel ? titel.naam : "Naam")}</label><input type="text" id="sh-nieuw-titel" name="${esc(titel ? titel.naam : "Naam")}" data-veldtype="titel" maxlength="200"></div>
        ${extra.length ? `<div class="twee-velden">${extra.map(v => `<div><span class="lb" aria-hidden="true">${esc(v.naam)} <span class="stil klein">(mag leeg)</span></span>${metNaam(veldInvoerHtml(v, undefined, CTX), v.naam)}</div>`).join("")}</div>` : ""}
        ${ouder ? `<p class="klein stil">Komt meteen bij ${esc(ouder)} te staan.</p>` : ""}<p class="klein stil">De rest vul je daarna aan, of laat je je team aanvullen.</p>${fout}
        <div class="rijtje"><button class="knop prim" type="submit">Opslaan</button>${annuleer}</div></form>`);
    }
    case "notitie": return wrap("Notitie", `<p class="leeglabel">Voor jou en je collega's.</p><label class="lb" for="sh-onderwerp">Onderwerp <span class="stil klein">(mag leeg)</span></label><input type="text" id="sh-onderwerp" data-sh="onderwerp" maxlength="120" value="${esc(sh.onderwerp || "")}"><label class="sr" for="sh-tekst">Notitie</label><textarea id="sh-tekst" data-sh="tekst" placeholder="Wat is er gebeurd of afgesproken?">${esc(sh.tekst || "")}</textarea>${fout}<div class="rijtje">${knop("Opslaan", "sh-ok", "", "prim")}${annuleer}</div>`);
    case "rij-meer": { const t = rijTitel(sh.k, sh.id) || ""; const aanv = sh.k === "organisaties" && kanSchrijven() && beschikbareSpecialisten(CTX).some(s => s.slug === "researcher");
      return wrap(t, `<div class="kol" style="gap:8px">${aanv ? `<button class="regel" data-act="aanvullen" data-k="${esc(sh.k)}" data-id="${esc(sh.id)}"><span class="rl"><b>Laat je team de gegevens aanvullen</b><span>De Researcher zoekt de lege velden op, met bron</span></span>${ic("chev")}</button>` : ""}
        <button class="regel" data-act="sh-naar" data-type="rij-verwijder"><span class="rl"><b>Verwijderen</b><span>Verdwijnt voorgoed; wat eraan hangt blijft bestaan</span></span>${ic("chev")}</button></div>`); }
    case "rij-verwijder": { const t = rijTitel(sh.k, sh.id) || "";
      const n = terugverwijzingen(CTX, sh.k, sh.id).reduce((s, x) => s + x.treffers.length, 0);
      return wrap("Verwijderen?", `<p>‘${esc(t)}’ verdwijnt voorgoed, ook voor je collega's en je team. Dat kun je niet ongedaan maken.</p>${n ? `<p class="klein">Wat eraan hangt (${n}), blijft bestaan, maar verliest de koppeling.</p>` : ""}${fout}<div class="rijtje">${knop("Verwijder", "sh-ok", "", "gevaar")}${annuleer}</div>`); }
  }
  return "";
}
function toastKnoppen(t) { return `${t.login ? `<button data-act="login">Inloggen</button>` : ""}${t.bekijk ? `<button data-act="toast-bekijk">Bekijk</button>` : ""}${t.undo && kanSchrijven() ? `<button data-act="undo">Ongedaan maken</button>` : ""}<button data-act="toast-dicht" aria-label="Melding sluiten">${ic("sluit", "klein")}</button>`; }
function renderToast(inline) {
  const t = S.toast; if (!t) return "";
  if (inline) return `<div class="toast-inline" data-toast><span>${ic("vink", "klein")} ${esc(t.tekst)}</span><span class="rijtje" style="gap:4px;flex-wrap:nowrap">${toastKnoppen(t)}</span></div>`;
  return `<div class="toast ${t.fout ? "fout" : ""}" data-toast><span>${esc(t.tekst)}</span><span class="rijtje" style="gap:4px;flex-wrap:nowrap">${toastKnoppen(t)}</span></div>`;
}
/* 8 seconden; pauzeert zolang je muis of focus erop staat. De tekst gaat ook
 * naar de vaste voorleesregel (#live). */
function toast(tekst, opts) {
  S.toast = Object.assign({ tekst, t: Date.now(), start: Date.now(), pauze: false }, opts || {});
  try { const live = document.getElementById("live"); if (live) { live.textContent = ""; setTimeout(() => { live.textContent = tekst; }, 30); } } catch (e) { /* geen voorleesregel */ }
  const t = S.toast.t; const duur = S.toast.fout ? 12000 : 8000;
  const check = () => {
    if (!S.toast || S.toast.t !== t) return; if (S.toast.pauze) { setTimeout(check, 500); return; }
    const rest = duur - (Date.now() - S.toast.start); if (rest <= 0) { S.toast = null; render(); } else setTimeout(check, rest);
  };
  setTimeout(check, duur);
}

/* ---------- Tekenen ---------- */
function ontcijfer(t) { try { return decodeURIComponent(t); } catch (e) { return t; } }
function itemRoute(r) { const p = (r || S.route).split("/").filter(Boolean); return ((p[0] === "voor-jou" && p[1] && p[1] !== "een-voor-een") || (p[0] === "acties" && p[1])) ? ontcijfer(p[1]) : null; }
function basisRoute() { const p = parts(); if (!itemRoute()) return S.route; if (isDesk() && p[0] === "voor-jou") return S.route; return S.terugNaar || (p[0] === "acties" ? "/acties" : "/"); }
function scrollSleutel() { const p = parts(); if (p[1] === "een-voor-een") return "/ronde/" + (S.ronde ? S.ronde.i : 0); if (isDesk() && p[0] === "voor-jou") return "/"; return basisRoute(); }
function inlineToastModus() { return !!S.toast && ((parts()[1] === "een-voor-een") || (!isDesk() && !!itemRoute())); }
function renderMain() {
  const p = parts(); const t = tabVan();
  if (p[0] === "voor-jou" && p[1] === "een-voor-een") return renderRonde();
  if (t === "voorjou") return renderVoorJou();
  if (t === "acties") return renderActies();
  if (t === "team") return renderTeam();
  if (t === "gegevens") return renderGegevens();
  if (t === "hulp") return renderHulp();
  if (t === "beheer") return renderBeheer();
  return renderVoorJou();
}
function nietGevondenBlad() {
  return `<div class="blad"><div class="blad-kop"><button class="link" data-act="sluit-blad">${ic("links", "klein")} Terug</button><button class="ikknop" data-act="sluit-blad" aria-label="Sluiten">${ic("sluit")}</button></div>
    <h2 class="titel" id="blad-titel" tabindex="-1">Dit item is er niet (meer)</h2><p class="stil">Misschien is het net afgehandeld of verwijderd, of hoort de link bij een andere werkruimte.</p></div>`;
}
function renderApp() {
  if (!CTX) return `<div class="app">${renderKop()}<main id="scroller">${S.versieFout ? versieFoutHtml() : renderHulp()}</main>${renderSheet()}${renderToast(false)}</div>`;
  const echte = S.route; const id = toegang() !== "notion" ? itemRoute() : null;
  const basis = basisRoute(); S.route = basis;
  const kop = renderKop(); const main = renderMain(); const tabbalk = renderTabbalk(); const t = tabVan();
  S.route = echte;
  const inline = inlineToastModus();
  let overlay = "";
  if (id && !(isDesk() && parts()[0] === "voor-jou" && actie(id))) {
    const a = actie(id);
    overlay = `<div class="scrim ${isDesk() ? "lade" : ""}" data-act="scrim-item" ${S.sheet ? "inert" : ""}><div class="sheet ${isDesk() ? "" : "vol"}" role="dialog" aria-modal="true" aria-labelledby="blad-titel" data-stop>${isDesk() ? "" : '<span class="greep" aria-hidden="true"></span>'}${inline ? renderToast(true) : ""}${a ? renderBlad(a, "sheet") : nietGevondenBlad()}</div></div>`;
  }
  const rondeInline = parts()[1] === "een-voor-een" && S.toast ? renderToast(true) : "";
  const fab = kanSchrijven() && !isDesk() && t === "voorjou" && parts()[1] !== "een-voor-een" && toegang() !== "notion"
    ? `<button class="fab" data-act="sheet" data-type="opdracht">${ic("plus")}Opdracht</button>` : "";
  const achtergrondInert = (overlay || S.sheet) ? "inert" : "";
  return `<div class="app ${fab ? "met-fab" : ""}"><div ${achtergrondInert}>${kop}<main id="scroller">${rondeInline ? `<div class="inhoud" style="padding-bottom:0">${rondeInline}</div>` : ""}${main}</main></div>
    <div class="vast" ${achtergrondInert}>${tabbalk}${fab}</div>${overlay}${renderSheet()}${!inline && !rondeInline ? renderToast(false) : ""}</div>`;
}
function versieFoutHtml() {
  const f = S.versieFout;
  return `<div class="inhoud" style="max-width:820px"><div class="balk fout" role="alert"><b>${esc(f.titel || "Deze gegevens kan dit dashboard niet lezen")}</b><p>${esc(f.tekst || "")}</p></div>${renderHulp()}</div>`;
}
function vindFocus(lijst) {
  for (const sel of String(lijst).split("|")) {
    let els = []; try { els = [...document.querySelectorAll(sel)]; } catch (e) { continue; }
    const ok = els.find(el => !el.closest("[inert]") && !el.closest("details:not([open]) > :not(summary)") && (el.getClientRects ? el.getClientRects().length || typeof window.matchMedia !== "function" : true)); if (ok) return ok;
  }
  return null;
}
function focusSleutel(el) {
  if (!el || !el.dataset) return null; if (el.id) return "#" + cssEsc(el.id); const d = el.dataset; if (!d.act) return null;
  return `[data-act="${d.act}"]` + ["id", "f", "type", "r", "v", "k", "t", "i", "doel"].filter(k => d[k] != null).map(k => `[data-${k}="${cssEsc(d[k])}"]`).join("");
}
function hadSheetVoor() { return !!document.querySelector('.scrim[data-act="scrim"]'); }
function render() {
  const root = document.getElementById("root"); if (!root) return;
  nieuweTekenbeurt();
  if (CTX && S.dataCtx !== CTX) { S.data = bouwData(); S.dataCtx = CTX; kcCache = null; }
  if (CTX && S.nummerBundel !== CTX.bundle) { S.nummerBundel = CTX.bundle; S.nummers = {}; S.volgNr = 1; telNummersOpnieuw(); }
  const ae = document.activeElement; const inRoot = ae && root.contains(ae);
  const sleutel = inRoot ? focusSleutel(ae) : null; let sel = null;
  if (inRoot && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) { try { sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) { /* geen selectie */ } }
  if (S.laatsteSleutel) S.scrollMap[S.laatsteSleutel] = window.scrollY || 0;
  const pk = document.getElementById("paneel-kolom"); const pkTop = pk ? pk.scrollTop : 0; const oudeRoute = S.vorigeRoute;
  if (S.sheet && !hadSheetVoor() && !S.sheetOpener && sleutel) S.sheetOpener = sleutel;
  const sheetEl = document.querySelector(".scrim .sheet"); const sheetTop = sheetEl ? sheetEl.scrollTop : 0; const hadSheet = !!document.querySelector('.scrim[data-act="scrim"]');
  const concept = bewaarFormulieren(root);
  if (CTX && parts()[1] === "een-voor-een" && !S.ronde) { const l = voorJouLijst(); S.ronde = { ids: l.map(a => a.id), i: 0, start: Date.now(), naarTeam: [] }; }
  root.innerHTML = renderApp();
  zetFormulierenTerug(root, concept);
  if (S.ui.bewerk && !S.ui.bewerk.voorGelezen) { const f = root.querySelector("[data-v2-veldform]"); if (f) { S.ui.bewerk.voor = leesFormulier(f); S.ui.bewerk.voorGelezen = true; } }
  document.body.style.overflow = document.querySelector(".scrim") ? "hidden" : "";
  markeerBezig();
  if (CTX && tabVan() === "beheer") {
    // De beheerpanelen komen uit oudere modules; een fout daarin mag de rest van het scherm niet breken.
    try { vulBeheer(); zetBeheerTerug(root, concept); } catch (e) { console.error(e); }
  }
  document.title = paginaTitel();
  const key = CTX ? scrollSleutel() : "hulp";
  if (S.scrollDoel) { const el = document.getElementById(S.scrollDoel); if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 70)); S.scrollDoel = null; }
  else if (S.laatsteSleutel === key || S.scrollMap[key] != null) window.scrollTo(0, S.scrollMap[key] || 0);
  else window.scrollTo(0, 0);
  const p = parts(); if (p[0] === "hulp" && p[1] && S.laatsteSleutel !== key) { const el = document.getElementById("h-" + p[1]); if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 70)); }
  const npk = document.getElementById("paneel-kolom"); if (npk && oudeRoute === S.route) npk.scrollTop = pkTop;
  const nsheet = document.querySelector(".scrim .sheet"); if (nsheet && sheetTop && hadSheet === !!document.querySelector('.scrim[data-act="scrim"]')) nsheet.scrollTop = sheetTop;
  S.laatsteSleutel = key; S.vorigeRoute = S.route;
  let doel = null; const nieuwType = S.sheet ? S.sheet.type : null; const sheetWissel = !!S.sheet && S.vorigSheetType && S.vorigSheetType !== nieuwType; S.vorigSheetType = nieuwType;
  if (S.focusNa) { doel = vindFocus(S.focusNa); S.focusNa = null; }
  else if (S.sheet && (!hadSheet || sheetWissel)) { doel = document.querySelector('.scrim[data-act="scrim"] [data-sh], .scrim[data-act="scrim"] form input') || document.getElementById("sheet-titel"); }
  else if (!S.sheet && hadSheet && S.sheetOpener) { doel = vindFocus(S.sheetOpener + "|#blad-titel|#scroller .titel"); S.sheetOpener = null; }
  else if (sleutel) { doel = vindFocus(sleutel); if (!doel && !document.querySelector(".ttab:focus, .dtab:focus")) doel = vindFocus("#blad-titel|#scroller .titel"); }
  if (doel && !doel.matches("a,button,input,textarea,select,summary,[tabindex]")) doel.setAttribute("tabindex", "-1");
  if (doel) { try { doel.focus({ preventScroll: true }); } catch (e) { /* niet focusbaar */ } if (sel && doel.setSelectionRange && sleutel && sleutel.startsWith("#")) { try { doel.setSelectionRange(sel[0], sel[1]); } catch (e) { /* type zonder selectie */ } } }
}
/* Een half ingevuld veld of formulier overleeft een hertekening (een melding
 * die verloopt, een rij die binnenkomt): de waarden gaan mee op naam. */
function bewaarFormulieren(root) {
  const uit = [];
  // Beheer: de bestaande panelen (uitnodigen, namen) hebben geen namen op hun
  // velden; op volgorde terugzetten is daar genoeg, de opbouw is vast.
  const beheer = [...root.querySelectorAll(".beheer input, .beheer textarea, .beheer select")];
  if (beheer.length) uit.push(["beheer", beheer.map(el => ({ type: el.type, w: el.type === "checkbox" || el.type === "radio" ? el.checked : el.value, focus: el === document.activeElement }))]);
  for (const f of root.querySelectorAll("[data-v2-veldform], [data-v2-nieuw]")) {
    const w = {};
    for (const el of f.querySelectorAll("[name]")) w[el.name] = el.type === "checkbox" ? el.checked : el.multiple ? [...el.selectedOptions].map(o => o.value) : el.value;
    uit.push([f.hasAttribute("data-v2-nieuw") ? "[data-v2-nieuw]" : "[data-v2-veldform]", w]);
  }
  return uit;
}
function zetBeheerTerug(root, concept) {
  const b = concept.find(c => c[0] === "beheer"); if (!b) return;
  const velden = [...root.querySelectorAll(".beheer input, .beheer textarea, .beheer select")];
  if (velden.length !== b[1].length) return;
  velden.forEach((el, i) => {
    const o = b[1][i]; if (o.type !== el.type) return;
    if (el.type === "checkbox" || el.type === "radio") el.checked = !!o.w; else el.value = o.w;
    if (o.focus) { try { el.focus({ preventScroll: true }); } catch (e) { /* niet focusbaar */ } }
  });
}
function zetFormulierenTerug(root, concept) {
  for (const [sel, w] of concept) {
    if (sel === "beheer") continue;
    const f = root.querySelector(sel); if (!f) continue;
    for (const el of f.querySelectorAll("[name]")) {
      if (!(el.name in w)) continue; const v = w[el.name];
      if (el.type === "checkbox") el.checked = !!v; else if (el.multiple) [...el.options].forEach(o => { o.selected = v.includes(o.value); }); else el.value = v;
    }
  }
}
function paginaTitel() {
  if (!CTX) return "Hulp — Je team";
  const t = tabVan(); const id = itemRoute(); const a = id && actie(id);
  if (a) return "Actie — Je team";
  const naam = { voorjou: "Voor jou", acties: "Acties", team: "Team", gegevens: "Gegevens", hulp: "Hulp", beheer: "Beheer" }[t] || "Je team";
  const n = aantalVoorJou();
  return (n && t === "voorjou" ? `(${n}) ` : "") + naam + " — Je team";
}

/* ---------- Navigatie ---------- */
function routeUitHash(h) {
  let r = String(h || "").replace(/^#/, "");
  if (!r.startsWith("/")) return "/";
  r = r.replace(/\/+$/, "") || "/";
  let m;
  if (r === "/data") return "/gegevens";
  if ((m = /^\/data\/([^/]+)(?:\/(.+))?$/.exec(r))) r = "/gegevens/" + m[1] + (m[2] ? "/" + m[2] : "");
  if ((m = /^\/gegevens\/acties(?:\/(.+))?$/.exec(r))) return m[1] ? "/acties/" + m[1] : "/";
  if (r === "/gegevens/ritmetaken" || r === "/vaste-taken") return "/team/vaste-taken";
  if (r === "/klaar") return "/team/klaar";
  if (r === "/ronde") return "/voor-jou/een-voor-een";
  if (r === "/hulp/notion") return "/hulp/eigen-systeem";
  if (r === "/prestaties" || r.startsWith("/detail")) return "/team/resultaat";
  if (/^\/opdracht(?:\/[a-z-]+)?$/.test(r)) return "/acties";
  return r;
}
/* #/opdracht[/specialist] opent één keer het opdrachtblad; daarna staat er
 * #/acties in de adresbalk, zodat het blad niet bij elke hertekening opnieuw opent. */
function opdrachtUitHash() {
  const m = /^#\/opdracht(?:\/([a-z-]+))?\/?$/.exec(String(window.location.hash || ""));
  if (!m) return;
  S.opdrachtVoor = { ag: m[1] || null };
  try { history.replaceState(null, "", window.location.pathname + window.location.search + "#/acties"); } catch (e) { /* geen history */ }
}
function zetHash(r) {
  try { if (window.location.hash !== "#" + r) window.location.hash = r; } catch (e) { /* geen location (tests) */ }
}
function go(r) {
  if (r === "__terug") { S.route = S.hist.pop() || "/"; } else { if (r !== S.route) S.hist.push(S.route); S.route = r; }
  if (!itemRoute()) S.terugNaar = null;
  S.sheet = null; S.ui.bewerk = null;
  if (S.route.startsWith("/gegevens/") && S.route.split("/").length === 3) { /* een andere lijst: zoeken begint leeg */ }
  if (itemRoute() && !(isDesk() && parts()[0] === "voor-jou")) S.focusNa = "#blad-titel";
  zetHash(S.route);
}
function openItem(id) {
  const t = tabVan(); const huidig = itemRoute();
  if (!huidig) S.terugNaar = (t === "voorjou") ? null : S.route;
  const doel = (t === "voorjou" && !S.terugNaar) ? "/voor-jou/" + id : "/acties/" + id;
  const bewaar = S.terugNaar; go(doel); S.terugNaar = bewaar;
  if (isDesk() && doel.startsWith("/voor-jou/")) S.focusNa = "#blad-titel";
}
function sluitBlad() { const naar = S.terugNaar || (parts()[0] === "acties" ? "/acties" : "/"); const id = itemRoute(); S.terugNaar = null; go(naar); if (id) S.focusNa = `[data-act="open"][data-id="${cssEsc(id)}"]`; }

/* ---------- Schrijven ---------- */
const WAT = { goedkeuren: "goedgekeurd", terug: "teruggestuurd", ja: "ja, doe maar", nee: "niet gedaan", zelf: "zelf aangepast", later: "later", gezien: "gezien", klaar: "afgerond",
  zelfOppakken: "zelf opgepakt", geefAan: "doorgegeven", aanCollega: "naar collega", nieuweDatum: "nieuwe datum", tochZelf: "zelf gedaan", nuOppakken: "opgepakt", heropen: "heropend",
  zetBijMij: "bij jou gezet", naarJij: "naar jou", opvolgen: "team volgt op", alleenEigenaar: "op andere naam", stoppen: "gestopt", prio: "belang", verwijder: "verwijderd" };
const NAAM_NODIG = ["later", "zelfOppakken", "tochZelf", "heropen", "zetBijMij", "naarJij"];
function pasToe(key, w) {
  if (!w) return;
  if (CTX && CTX.werkBij && (w.weg || (w.entry && w.entry.entryId))) { if (CTX.werkBij(key, w) !== false) return; }
  if (CTX && CTX.herlaad) CTX.herlaad();
}
function foutTekst(e) { return (e && e.message) || "Dat is niet gelukt."; }
/* Een mislukte schrijfactie. Is de sessie verlopen, dan staat inloggen er
 * meteen bij: je komt daarna terug op dezelfde plek. */
function meldFout(e) {
  if (e && (e.oauthVerlopen || e.daglinkVerlopen)) toast(foutTekst(e), { fout: true, login: kanInloggen() });
  else if (e && e.status === 403) toast("Je sessie mag hier alleen lezen. Log opnieuw in om af te handelen.", { fout: true, login: kanInloggen() });
  else toast("Niet gelukt: " + foutTekst(e) + " Probeer het opnieuw.", { fout: true });
}
function zetBezig(btn) { if (!btn) return; btn.setAttribute("aria-disabled", "true"); btn.classList.add("bezig"); if (!btn.querySelector(".draai")) btn.insertAdjacentHTML("afterbegin", '<span class="draai" aria-hidden="true"></span>'); }
const REDUCED = () => { try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return true; } };
function wegAnimatie(id) {
  return new Promise(res => {
    const kaart = document.querySelector(`[data-kaart="${cssEsc(id)}"]`);
    if (!kaart || REDUCED() || S.sheet) { res(); return; }
    kaart.classList.add("weg"); setTimeout(res, 180);
  });
}
function vraagNaam(daarna) {
  S.sheet = { type: "naam", naam: "", daarna };
  haalNaamvoorstel(bron()).then(r => { if (S.sheet && S.sheet.type === "naam" && !S.sheet.naam && r && r.voorstel) { S.sheet.naam = r.voorstel; render(); } }).catch(() => { /* geen voorstel */ });
  render();
}
function patchVoor(f, a, c, arg) {
  const dom = CTX.schema.datadomeinen.acties;
  if (f === "stoppen") { const ag = werkAgent(a); const p = afhandelPatch("nee", a.rij, Object.assign({}, c, { tekst: "gestopt" })); return { patch: p.patch, melding: "Gestopt." + (ag ? " " + deNaam(ag, true) + " doet dit niet meer." : "") }; }
  if (f === "aanCollega") return { patch: toewijsPatch(dom, a.rij, { soort: "mens", naam: arg }), melding: "Bij " + voornaam(arg) + " gezet." };
  if (f === "alleenEigenaar") {
    const s = slugVanNaam(arg); const keuze = { soort: s ? "specialist" : "mens", naam: s ? AGENTS[s].naam : arg };
    const patch = toewijsPatch(dom, a.rij, keuze); return { patch, melding: toewijsTekst(a.rij, patch, keuze, jij()) };
  }
  if (f === "prio") return { patch: { Prioriteit: arg }, melding: "Belang: " + String(arg).toLowerCase() + "." };
  if (f === "naarJij") return verplaatsPatch(a.rij, "wacht", "jij", c); // uit Wacht: wektijd eraf, op jouw naam
  const plan = afhandelPatch(f, a.rij, c);
  if (f === "goedkeuren" && a.kanaal) plan.melding = a.kanaal === "post" ? "Goedgekeurd. Plaatsen doe jij; je team publiceert niets." : "Goedgekeurd. Versturen doe jij; je team verstuurt niets.";
  // Zelfde zinnen als in het ontwerp: "de Dealmaker", "De Stem".
  const sp = slugVanNaam(plan.patch && plan.patch.Agent);
  if (sp && f === "terug") plan.melding = "Teruggestuurd naar " + deNaam(sp) + ". Die pakt het op bij het volgende werkmoment.";
  if (sp && (f === "ja" || f === "geefAan")) plan.melding = (f === "ja" ? "Akkoord. " : "Doorgegeven aan " + deNaam(sp) + ". ") + (f === "ja" ? deNaam(sp, true) + " gaat ermee aan de slag" : "Die pakt het op") + " bij het volgende werkmoment.";
  return plan;
}
/* Wat nu onderweg is naar de werkruimte. Zolang een item hierin staat, doen
 * zijn knoppen niets (ook niet na een hertekening of via een sneltoets). */
const BEZIG = new Set();
function isBezig(k) { return BEZIG.has(k); }
function markeerBezig() {
  for (const k of BEZIG) {
    const id = k.replace(/^[a-z]+:/, "");
    for (const el of document.querySelectorAll(`#root [data-id="${cssEsc(id)}"][data-act]:not([data-act="open"]), #root .scrim[data-act="scrim"] [data-act]:not([data-act="sh-dicht"])`)) {
      if (el.closest(".scrim") && !(S.sheet && S.sheet.id === id)) continue;
      el.setAttribute("aria-disabled", "true");
    }
  }
}
async function uitvoeren(id, f, arg, btn) {
  const a = actie(id); if (!a || !kanSchrijven()) return;
  if (isBezig("actie:" + id)) return;
  if (NAAM_NODIG.includes(f) && !jij()) { vraagNaam(() => uitvoeren(id, f, arg)); return; }
  BEZIG.add("actie:" + id);
  try { await uitvoerenBinnen(a, id, f, arg, btn); } finally { BEZIG.delete("actie:" + id); render(); }
}
async function uitvoerenBinnen(a, id, f, arg, btn) {
  const lijstVoor = voorJouLijst().map(x => x.id); const p = parts(); const routeVoor = S.route; const sheetVoor = S.sheet;
  const inRonde = !!(S.ronde && p[1] === "een-voor-een");
  const opts = typeof arg === "object" && arg ? arg : {};
  const spNaam = opts.ag && AGENTS[opts.ag] ? AGENTS[opts.ag].naam : null;
  const c = { ik: jij() || null, schema: CTX.schema, nu: NU, tekst: opts.tekst, datum: opts.datum, specialist: spNaam || undefined };
  zetBezig(btn);
  let melding = "", undo = null, nieuw = null; const toepassen = [];
  try {
    if (f === "opvolgen") {
      const plan = opvolgActie(a.rij, Object.assign({}, c, { tekst: opts.zin || opvolgZinVan(a), specialist: spNaam }));
      const res = await schrijfWerkruimte(CTX.bron, "POST", "/dashboard/entries", { domein: "acties", data: plan.data });
      nieuw = res && res.entry && res.entry.entryId;
      const vorige = vorigeWaarden(a.rij, plan.ouder);
      let ant;
      try { ant = await snelWijzig(CTX, "acties", id, plan.ouder); }
      catch (e2) {
        // De vervolgactie staat er al; laat hem zien en zeg wat er nog open staat.
        if (nieuw) pasToe("acties", { entry: res.entry });
        S.sheet = null;
        toast("Je team volgt het op, maar dit item zelf staat nog open: " + foutTekst(e2) + " Rond het zo zelf af.", { fout: true, bekijk: nieuw ? "/acties/" + nieuw : null,
          undo: nieuw ? async () => { await verwijderEntry(CTX, "acties", nieuw); pasToe("acties", { weg: nieuw }); } : null });
        render(); return;
      }
      if (nieuw) toepassen.push({ entry: res.entry });
      toepassen.push({ entry: ant && ant.entry });
      melding = spNaam ? "Doorgegeven aan " + deNaam(opts.ag) + ". Die pakt het op bij het volgende werkmoment." : plan.melding;
      undo = async () => {
        if (nieuw) { await verwijderEntry(CTX, "acties", nieuw); pasToe("acties", { weg: nieuw }); }
        const t = await snelWijzig(CTX, "acties", id, vorige); pasToe("acties", { entry: t && t.entry });
      };
    } else if (f === "verwijder") {
      await verwijderEntry(CTX, "acties", id);
      toepassen.push({ weg: id }); melding = "Verwijderd.";
    } else {
      const plan = patchVoor(f, a, c, typeof arg === "string" ? arg : opts.waarde);
      const vorige = vorigeWaarden(a.rij, plan.patch);
      const ant = await snelWijzig(CTX, "acties", id, plan.patch);
      toepassen.push({ entry: ant && ant.entry });
      melding = plan.melding;
      undo = async () => { const t = await snelWijzig(CTX, "acties", id, vorige); pasToe("acties", { entry: t && t.entry }); };
    }
  } catch (e) {
    meldFout(e); if (S.sheet && S.sheet === sheetVoor && S.sheet.id === id) S.sheet.fout = foutTekst(e); else if (S.sheet === sheetVoor) S.sheet = null; render(); return;
  }
  if (["ja", "geefAan", "terug", "opvolgen"].includes(f) && klaarCheck().stil) melding += " Dit ligt stil tot je team weer vanzelf werkt.";
  const regel = { id, titel: a.titel, wat: WAT[f] || f, undo, t: Date.now() };
  if (f !== "prio") S.sessie.afgehandeld.unshift(regel);
  const i = lijstVoor.indexOf(id);
  const volgende = i >= 0 ? (lijstVoor.slice(i + 1)[0] || lijstVoor.slice(0, i).reverse()[0] || null) : null;
  if (S.sheet === sheetVoor) S.sheet = null;
  const zelfdePlek = S.route === routeVoor;
  if (!zelfdePlek) { /* je klikte intussen verder: dan blijf je waar je bent */ }
  else if (inRonde && S.ronde) { S.ronde.i++; if (["terug", "ja", "geefAan", "opvolgen"].includes(f)) S.ronde.naarTeam.push(nieuw || id); S.focusNa = "#blad-titel"; }
  else if (f === "prio" || f === "alleenEigenaar" || f === "nieuweDatum") { /* het blad blijft open */ }
  else if (p[0] === "voor-jou" && p[1]) { S.route = volgende ? "/voor-jou/" + volgende : "/"; zetHash(S.route); S.focusNa = volgende ? "#blad-titel" : ".werkbak-kop h2, .leeg h3"; }
  else if (p[0] === "acties" && p[1]) { const naar = S.terugNaar || "/acties"; S.terugNaar = null; S.route = naar; zetHash(S.route); S.focusNa = `[data-act="open"][data-id="${cssEsc(id)}"]|#scroller .titel`; }
  else if (tabVan() === "voorjou" && volgende) S.focusNa = `[data-kaart="${cssEsc(volgende)}"] .item-open, button.compact[data-id="${cssEsc(volgende)}"]`;
  else if (tabVan() === "voorjou") S.focusNa = ".leeg h3, .werkbak-kop h2";
  if (zelfdePlek && tabVan() === "voorjou" && !inRonde) await wegAnimatie(id);
  toast(melding, {
    undo: undo ? async () => {
      await undo();
      if (itemRoute(routeVoor) && !inRonde) { S.route = routeVoor; zetHash(S.route); }
      if (inRonde && S.ronde) { const j = S.ronde.ids.indexOf(id); if (j >= 0) S.ronde.i = j; S.ronde.eind = null; }
      S.sessie.afgehandeld = S.sessie.afgehandeld.filter(x => x !== regel);
    } : null,
    bekijk: nieuw ? "/acties/" + nieuw : null,
  });
  for (const w of toepassen) pasToe("acties", w);
  const rest = aanJouZet().length;
  if (S.toast && f !== "prio") S.toast.tekst = melding + (rest ? " Nog " + rest + " voor jou." : " Niets meer voor jou.");
  render();
}
async function nieuweOpdracht(sh, btn) {
  const sleutelB = "opdracht"; if (isBezig(sleutelB)) return; BEZIG.add(sleutelB);
  try { return await nieuweOpdrachtBinnen(sh, btn); } finally { BEZIG.delete(sleutelB); }
}
async function nieuweOpdrachtBinnen(sh, btn) {
  const wat = (sh.wat || "").trim();
  if (!wat) { sh.fout = "Schrijf eerst wat er moet gebeuren."; S.focusNa = "#sh-wat"; render(); return; }
  const wie = sh.ag ? { agent: AGENTS[sh.ag].naam } : { mens: sh.mens || jij() };
  if (!sh.ag && !wie.mens) { vraagNaam(() => { S.sheet = sh; render(); }); return; }
  const data = opdrachtData({ wat, uitleg: sh.uitleg, wie, deadline: sh.wanneer && sh.wanneer !== "geen" ? sh.wanneer : null, hoortBij: sh.hoort || "", ik: jij() || null, nu: NU });
  if (sh.onder) data["Bovenliggende actie"] = sh.onder;
  zetBezig(btn);
  try {
    const res = await schrijfWerkruimte(CTX.bron, "POST", "/dashboard/entries", { domein: "acties", data });
    const nid = res && res.entry && res.entry.entryId;
    const tekst = sh.ag ? "Doorgegeven aan " + deNaam(sh.ag) + "." : (!sh.mens || naamGelijk(sh.mens, jij())) ? "Op je eigen lijst gezet." : "Bij " + voornaam(sh.mens) + " gezet.";
    if (S.sheet === sh) S.sheet = null;
    toast(tekst, { undo: nid ? async () => { await verwijderEntry(CTX, "acties", nid); pasToe("acties", { weg: nid }); } : null, bekijk: nid ? "/acties/" + nid : null });
    pasToe("acties", { entry: res && res.entry });
    render();
  } catch (e) { sh.fout = foutTekst(e) + " Je tekst staat er nog; probeer het opnieuw."; meldFout(e); render(); }
}
async function opmerkingPlaatsen(sh, btn) {
  const sleutelB = "opmerking:" + sh.id; if (isBezig(sleutelB)) return; BEZIG.add(sleutelB);
  try { return await opmerkingPlaatsenBinnen(sh, btn); } finally { BEZIG.delete(sleutelB); }
}
async function opmerkingPlaatsenBinnen(sh, btn) {
  const tekst = (sh.tekst || "").trim(); const a = actie(sh.id);
  if (!tekst) { S.focusNa = "#sh-tekst"; render(); return; }
  const info = notitieVeldVan(CTX); if (!info || !a) return;
  const data = { Onderwerp: ("Opmerking bij " + a.titel).slice(0, 120), Notitie: tekst, Datum: isoDag(NU), Soort: "Mens", [info.veld.naam]: { domein: "acties", id: a.id } };
  if (jij()) data.Auteur = jij();
  zetBezig(btn);
  try {
    const res = await schrijfWerkruimte(CTX.bron, "POST", "/dashboard/entries", { domein: "notities", data });
    const nid = res && res.entry && res.entry.entryId;
    if (S.sheet === sh) S.sheet = null; S.ui.det["u-" + a.id + "-opm"] = true;
    toast("Opmerking geplaatst.", { undo: nid ? async () => { await verwijderEntry(CTX, "notities", nid); pasToe("notities", { weg: nid }); } : null });
    pasToe("notities", { entry: res && res.entry }); render();
  } catch (e) { sh.fout = foutTekst(e) + " Probeer het opnieuw."; meldFout(e); render(); }
}
async function notitieOpslaan(sh, btn) {
  const sleutelB = "notitie:" + sh.id; if (isBezig(sleutelB)) return; BEZIG.add(sleutelB);
  try { return await notitieOpslaanBinnen(sh, btn); } finally { BEZIG.delete(sleutelB); }
}
async function notitieOpslaanBinnen(sh, btn) {
  const tekst = (sh.tekst || "").trim(); const onderwerp = (sh.onderwerp || "").trim();
  if (!tekst && !onderwerp) { sh.fout = "Schrijf eerst je notitie."; S.focusNa = "#sh-tekst"; render(); return; }
  const info = notitieVeldVan(CTX); if (!info) return;
  const data = { Onderwerp: onderwerp || tekst.slice(0, 60), Datum: isoDag(NU), Soort: "Mens", [info.veld.naam]: { domein: sh.k, id: sh.id } };
  if (tekst) data.Notitie = tekst; if (jij()) data.Auteur = jij();
  zetBezig(btn);
  try {
    const res = await schrijfWerkruimte(CTX.bron, "POST", "/dashboard/entries", { domein: "notities", data });
    const nid = res && res.entry && res.entry.entryId;
    if (S.sheet === sh) S.sheet = null;
    toast("Notitie geplaatst.", { undo: nid ? async () => { await verwijderEntry(CTX, "notities", nid); pasToe("notities", { weg: nid }); } : null });
    pasToe("notities", { entry: res && res.entry }); render();
  } catch (e) { sh.fout = foutTekst(e) + " Je tekst staat er nog; probeer het opnieuw."; meldFout(e); render(); }
}
async function nieuweRij(form, btn) {
  const sleutelB = "nieuw:" + (S.sheet && S.sheet.k); if (isBezig(sleutelB)) return; BEZIG.add(sleutelB);
  try { return await nieuweRijBinnen(form, btn); } finally { BEZIG.delete(sleutelB); }
}
async function nieuweRijBinnen(form, btn) {
  const sh = S.sheet; const k = sh.k; const d = domeinVan(k);
  const data = leesFormulier(form);
  const { titel } = nieuwVelden(k);
  if (!titel || !data[titel.naam]) { sh.fout = "Geef het eerst een naam."; S.focusNa = "#sh-nieuw-titel"; render(); return; }
  if (sh.ouder && sh.id) { const rel = rpToevoegDomeinen(CTX, sh.ouder).find(x => x.slug === k); if (rel) data[rel.veld.naam] = sh.id; }
  zetBezig(btn);
  try {
    const res = await schrijfWerkruimte(CTX.bron, "POST", "/dashboard/entries", { domein: k, data });
    const nid = res && res.entry && res.entry.entryId;
    const naam = data[titel.naam];
    if (S.sheet === sh) S.sheet = null;
    if (!sh.ouder && nid) { go("/gegevens/" + k + "/" + encodeURIComponent(nid)); S.focusNa = "#rij-titel"; }
    toast(naam + " is toegevoegd.", { undo: nid ? async () => { await verwijderEntry(CTX, k, nid); pasToe(k, { weg: nid }); if (itemOpGegevens(k, nid)) go("/gegevens/" + k); } : null });
    pasToe(k, { entry: res && res.entry }); render();
    void d;
  } catch (e) { sh.fout = foutTekst(e) + " Je invoer staat er nog; probeer het opnieuw."; meldFout(e); render(); }
}
function itemOpGegevens(k, id) { const p = parts(); return p[0] === "gegevens" && p[1] === k && ontcijfer(p[2] || "") === id; }
async function rijVerwijderen(sh, btn) {
  const sleutelB = "weg:" + sh.id; if (isBezig(sleutelB)) return; BEZIG.add(sleutelB);
  try { return await rijVerwijderenBinnen(sh, btn); } finally { BEZIG.delete(sleutelB); }
}
async function rijVerwijderenBinnen(sh, btn) {
  const t = rijTitel(sh.k, sh.id) || "";
  zetBezig(btn);
  try {
    await verwijderEntry(CTX, sh.k, sh.id);
    if (S.sheet === sh) S.sheet = null; go("/gegevens/" + sh.k); S.focusNa = "#scroller .titel";
    toast("‘" + t + "’ is verwijderd.");
    pasToe(sh.k, { weg: sh.id }); render();
  } catch (e) { sh.fout = foutTekst(e) + " Probeer het opnieuw."; meldFout(e); render(); }
}
async function veldOpslaan(form) {
  const sleutelB = "veld:" + (S.ui.bewerk && S.ui.bewerk.id); if (isBezig(sleutelB)) return; BEZIG.add(sleutelB);
  try { return await veldOpslaanBinnen(form); } finally { BEZIG.delete(sleutelB); }
}
async function veldOpslaanBinnen(form) {
  const e = S.ui.bewerk; if (!e) return;
  const d = domeinVan(e.k); const r = rijVan(e.k, e.id); if (!r) return;
  const patch = formulierPatch(d, e.voor, leesFormulier(form));
  if (!Object.keys(patch).length) { S.ui.bewerk = null; S.focusNa = `[data-act="veld-wijzig"][data-v="${cssEsc(e.veld)}"]`; toast("Niets gewijzigd."); render(); return; }
  const knopEl = form.querySelector('button[type="submit"]'); zetBezig(knopEl);
  try {
    const vorige = vorigeWaarden(r, patch);
    const ant = await snelWijzig(CTX, e.k, e.id, patch);
    S.ui.bewerk = null; S.focusNa = `[data-act="veld-wijzig"][data-v="${cssEsc(e.veld)}"]`;
    toast(e.veld + " bijgewerkt.", { undo: async () => { const t = await snelWijzig(CTX, e.k, e.id, vorige); pasToe(e.k, { entry: t && t.entry }); } });
    pasToe(e.k, { entry: ant && ant.entry }); render();
  } catch (err) { e.fout = foutTekst(err) + " Probeer het opnieuw."; meldFout(err); render(); }
}
async function taakSchrijf(t, patch, melding, undoPatch) {
  const sleutelB = "taak:" + t.id; if (isBezig(sleutelB)) return; BEZIG.add(sleutelB);
  try { return await taakSchrijfBinnen(t, patch, melding, undoPatch); } finally { BEZIG.delete(sleutelB); }
}
async function taakSchrijfBinnen(t, patch, melding, undoPatch) {
  try {
    const ant = await snelWijzig(CTX, "ritmetaken", t.id, patch);
    toast(melding, { undo: async () => { const x = await snelWijzig(CTX, "ritmetaken", t.id, undoPatch); pasToe("ritmetaken", { entry: x && x.entry }); } });
    pasToe("ritmetaken", { entry: ant && ant.entry }); render();
  } catch (e) { meldFout(e); render(); }
}
async function zetAan(sleutel, btn) {
  const sleutelB = "zetaan:" + sleutel; if (isBezig(sleutelB)) return; BEZIG.add(sleutelB);
  try { return await zetAanBinnen(sleutel, btn); } finally { BEZIG.delete(sleutelB); }
}
async function zetAanBinnen(sleutel, btn) {
  const t = (vtCatalogus.data || []).find(x => x.sleutel === sleutel); if (!t) return;
  zetBezig(btn);
  try {
    const ant = await schrijfWerkruimte(CTX.bron, "POST", "/dashboard/ritmetaken/activeer", { sleutel });
    const id = ant && ant.entry && ant.entry.entryId; const wasEr = !!t.bestaat;
    t.bestaat = true; t.actief = true;
    const naam = t.klantnaam || sleutel; const ritme = t.ritme_advies ? ritmeLabel(t.ritme_advies, CTX.schema).toLowerCase() : "";
    toast(`‘${naam}’ staat aan${ritme ? ", " + ritme : ""}. Je team pakt hem op bij het volgende werkmoment.`, {
      undo: id ? async () => {
        if (wasEr) { const x = await snelWijzig(CTX, "ritmetaken", id, { Actief: false }); pasToe("ritmetaken", { entry: x && x.entry }); }
        else { await verwijderEntry(CTX, "ritmetaken", id); pasToe("ritmetaken", { weg: id }); t.bestaat = false; }
        t.actief = false;
      } : null,
    });
    pasToe("ritmetaken", { entry: ant && ant.entry }); render();
  } catch (e) { meldFout(e); render(); }
}
async function kopieerNaar(t) {
  const ok = await kopieerTekst(t);
  toast(ok ? "Gekopieerd." : "Kopiëren lukte hier niet. Selecteer de tekst en kopieer hem zelf."); render();
}
function primair(a) {
  const s = soortVan(a);
  if (s === "check" || s === "check-extern") return () => uitvoeren(a.id, "goedkeuren");
  if (s === "voorstel") return () => { const ag = werkAgent(a); if (ag) uitvoeren(a.id, "ja", { ag }); else { S.sheet = { type: "wie", id: a.id, doel: "ja" }; render(); } };
  if (s === "signaal") return () => { S.sheet = { type: "opvolgen", id: a.id, zin: opvolgZinVan(a), ag: opvolgAgentVan(a) }; render(); };
  if (s === "taak" || s === "weer") return () => uitvoeren(a.id, "klaar");
  return null;
}
function huidigItem() {
  if (parts()[1] === "een-voor-een") return S.ronde ? actie(S.ronde.ids[S.ronde.i]) : null;
  const id = itemRoute(); if (id) return actie(id);
  if (isDesk() && tabVan() === "voorjou") { const l = voorJouLijst(); return l[0] || null; }
  return null;
}
function naarBaan(id, baan, btn) {
  const a = actie(id); if (!a) return; const s = soortVan(a);
  if (baan === "jij") {
    if (s === "klaar") uitvoeren(id, "heropen", null, btn);
    else if (s === "wacht" || (a.wachtenTot && dt(a.wachtenTot) > NU)) uitvoeren(id, "naarJij", null, btn);
    else uitvoeren(id, "tochZelf", null, btn);
  }
  else if (baan === "team") { if ((s === "check" || s === "check-extern") && werkAgent(a)) { S.sheet = { type: "terug", id, tekst: "" }; render(); } else { S.sheet = { type: "wie", id, doel: "sleep" }; render(); } }
  else if (baan === "wacht") { S.sheet = { type: "later", id }; render(); }
  else if (baan === "af") { if (["check", "check-extern", "voorstel"].includes(s)) S.sheet = { type: "afronden", id }; else if (s === "team") S.sheet = { type: "stoppen", id }; else { uitvoeren(id, "klaar", null, btn); return; } render(); }
}
function kiesInSheet(v, btn) {
  const sh = S.sheet; const k = v.slice(0, v.indexOf(":")), val = v.slice(v.indexOf(":") + 1); const id = sh.id;
  if (sh.type === "wie") {
    if (sh.doel === "toewijzen") {
      if (k !== "ag" && !val && !jij()) { vraagNaam(() => uitvoeren(id, "alleenEigenaar", jij())); return; }
      uitvoeren(id, "alleenEigenaar", k === "ag" ? AGENTS[val].naam : (val || jij()), btn); return;
    }
    if (k === "ag") { uitvoeren(id, sh.doel === "ja" ? "ja" : "geefAan", { ag: val }, btn); return; }
    if (!val || (jij() && naamGelijk(val, jij()))) uitvoeren(id, "tochZelf", null, btn); else uitvoeren(id, "aanCollega", val, btn);
    return;
  }
  if (sh.type === "collega") { uitvoeren(id, "aanCollega", val, btn); return; }
  if (sh.type === "later") { uitvoeren(id, "later", { datum: val }, btn); return; }
  if (sh.type === "datum") { uitvoeren(id, "nieuweDatum", { datum: val }, btn); return; }
  if (sh.type === "zelfop") { uitvoeren(id, "zelfOppakken", { datum: val }, btn); return; }
  if (sh.type === "prio") { uitvoeren(id, "prio", val, btn); return; }
  if (sh.type === "verplaats") { S.sheet = null; naarBaan(id, val, btn); return; }
  if (sh.type === "afronden") {
    if (val === "goed") uitvoeren(id, "goedkeuren", null, btn); else if (val === "zelf") { S.sheet = { type: "zelf", id, tekst: "" }; render(); }
    else if (val === "ja") { const a = actie(id); const ag = a && werkAgent(a); if (ag) uitvoeren(id, "ja", { ag }, btn); else { S.sheet = { type: "wie", id, doel: "ja" }; render(); } }
    else { S.sheet = { type: "nee", id, tekst: "" }; render(); }
  }
}
function bevestigSheet(btn) {
  const sh = S.sheet; const id = sh.id;
  switch (sh.type) {
    case "terug": if (!(sh.tekst || "").trim()) { sh.fout = "Schrijf in één zin wat anders moet."; S.focusNa = "#sh-tekst"; render(); return; } uitvoeren(id, "terug", { tekst: sh.tekst.trim() }, btn); return;
    case "nee": uitvoeren(id, "nee", { tekst: (sh.tekst || "").trim() }, btn); return;
    case "zelf": uitvoeren(id, "zelf", { tekst: (sh.tekst || "").trim() || "Zelf aangepast" }, btn); return;
    case "later": if (!sh.datum) { S.focusNa = "#sh-datum"; render(); return; } uitvoeren(id, "later", { datum: sh.datum }, btn); return;
    case "datum": if (!sh.datum) { S.focusNa = "#sh-datum"; render(); return; } uitvoeren(id, "nieuweDatum", { datum: sh.datum }, btn); return;
    case "stoppen": uitvoeren(id, "stoppen", null, btn); return;
    case "verwijder": uitvoeren(id, "verwijder", null, btn); return;
    case "opmerking": opmerkingPlaatsen(sh, btn); return;
    case "opvolgen": if (!sh.ag) return; uitvoeren(id, "opvolgen", { zin: (sh.zin || "").trim() || opvolgZinVan(actie(id)), ag: sh.ag }, btn); return;
    case "opdracht": nieuweOpdracht(sh, btn); return;
    case "notitie": notitieOpslaan(sh, btn); return;
    case "rij-verwijder": rijVerwijderen(sh, btn); return;
    case "naam": {
      const naam = (sh.naam || "").trim();
      if (!naam) { sh.fout = "Vul je naam in."; S.focusNa = "#sh-naam"; render(); return; }
      zetBezig(btn);
      S.naamGeheugen = naam;
      Promise.resolve(zetMijnNaam(bron(), naam)).catch(() => { /* de kopie in deze browser telt */ }).then(() => {
        const daarna = sh.daarna; S.sheet = null; kcCache = null; telNummersOpnieuw();
        toast("Je werkt nu als " + naam + ".");
        if (daarna) daarna(); else render();
      });
      return;
    }
  }
}
function startOpdrachtSheet(o) {
  S.sheet = Object.assign({ type: "opdracht", wat: "", ag: null, mens: null, wanneer: "geen", hoort: "", onder: null, uitleg: "" }, o || {});
}

/* ---------- Gebeurtenissen ---------- */
function opKlik(e) {
  const el = e.target.closest && e.target.closest("[data-act]"); if (!el || !document.getElementById("root").contains(el)) return;
  if (el.getAttribute("aria-disabled") === "true" || el.disabled) return;
  const act = el.dataset.act;
  if ((act === "scrim" || act === "scrim-item") && (e.target.closest("[data-stop]") || (S.drukStart && S.drukStart.closest && S.drukStart.closest("[data-stop]")))) return;
  const d = el.dataset;
  switch (act) {
    case "go": go(d.r); if (!el.closest(".tabbalk, .dtabs") && !itemRoute() && !S.focusNa) S.focusNa = "#scroller .titel|#scroller h2"; break;
    case "open": openItem(d.id); break;
    case "sluit-blad": sluitBlad(); break;
    case "stap": { const l = voorJouLijst(); const cur = huidigItem(); const i = cur ? l.findIndex(x => x.id === cur.id) : -1; const n = l[i + Number(d.d)]; if (n) { go("/voor-jou/" + n.id); S.focusNa = "#blad-titel"; } break; }
    case "doe": uitvoeren(d.id, d.f, null, el); return;
    case "ja": { const a = actie(d.id); const ag = a && werkAgent(a); if (ag) { uitvoeren(d.id, "ja", { ag }, el); return; } if (!jij()) { vraagNaam(() => { S.sheet = { type: "wie", id: d.id, doel: "ja" }; render(); }); return; } S.sheet = { type: "wie", id: d.id, doel: "ja" }; break; }
    case "sheet": {
      S.sheetOpener = focusSleutel(el);
      if (d.type === "opdracht") { startOpdrachtSheet({ ag: d.ag || null, hoort: d.hoort || "", onder: d.onder || null }); break; }
      const a = d.id && !d.k ? actie(d.id) : null;
      S.sheet = { type: d.type, id: d.id || null, k: d.k || null, ouder: d.ouder || null, doel: d.doel || null, tekst: "", datum: "", baan: d.baan || null };
      if (d.type === "opvolgen" && a) Object.assign(S.sheet, { zin: opvolgZinVan(a), ag: opvolgAgentVan(a) });
      if (d.type === "account") S.sheet.id = null;
      break;
    }
    case "sh-naar": { const oud = S.sheet || {}; S.sheet = { type: d.type, id: oud.id, k: oud.k, tekst: "", datum: "", naam: d.type === "naam" ? jij() : "" }; break; }
    case "sh-dicht": case "scrim": S.sheet = null; break;
    case "scrim-item": sluitBlad(); break;
    case "sh-chip": S.sheet.tekst = ((S.sheet.tekst || "").trim() + (S.sheet.tekst ? " " : "") + d.t + ".").trim(); S.sheet.fout = ""; S.focusNa = "#sh-tekst"; break;
    case "sh-set": S.sheet[d.k] = d.v; if (d.k === "ag") S.sheet.mens = null; if (d.k === "mens") S.sheet.ag = null; S.sheet.fout = ""; break;
    case "sh-kies": kiesInSheet(d.v, el); return;
    case "sh-ok": bevestigSheet(el); return;
    case "undo": if (kanSchrijven() && S.toast && S.toast.undo) { const u = S.toast.undo; S.toast = null; render(); Promise.resolve(u()).then(() => { toast("Ongedaan gemaakt."); render(); }, (f) => { meldFout(f); render(); }); } return;
    case "toast-dicht": S.toast = null; break;
    case "toast-bekijk": if (S.toast && S.toast.bekijk) { const b = S.toast.bekijk; S.toast = null; if (!itemRoute()) S.terugNaar = S.route; const keep = S.terugNaar; go(b); S.terugNaar = keep; } break;
    case "undo-lijst": { if (!kanSchrijven()) return; const x = S.sessie.afgehandeld[Number(d.i)]; if (x && x.undo) { const u = x.undo; x.undo = null; Promise.resolve(u()).then(() => { S.sessie.afgehandeld = S.sessie.afgehandeld.filter(y => y !== x); toast("Ongedaan gemaakt: " + x.titel + "."); render(); }, (f) => { x.undo = u; meldFout(f); render(); }); } return; }
    case "kopieer": { const a = actie(d.id); if (a) kopieerNaar(a.werk || ""); return; }
    case "kopieer-tekst": kopieerNaar(d.t); return;
    case "feedback-stuur": feedbackSturen(el); return;
    case "feedback-mail": if (!S.sheet) return; S.sheet.gemaild = true; render(); openMail(feedbackMail(S.sheet.tekst)); return;
    case "feedback-kopieer": if (!S.sheet) return; kopieerNaar(feedbackTekst(S.sheet.tekst)); return;
    case "login": if (V2_HAKEN.login) V2_HAKEN.login(); return;
    case "uitloggen": S.sheet = null; if (V2_HAKEN.uitloggen) V2_HAKEN.uitloggen(); return;
    case "export": S.sheet = null; render(); if (V2_HAKEN.exporteer) V2_HAKEN.exporteer(d.v || "markdown"); return;
    case "thema": wisselThema(); render(); return;
    case "ververs": if (V2_HAKEN.ververs) Promise.resolve(V2_HAKEN.ververs()).then((ok) => { if (ok) { toast("Ververst. De nummers zijn opnieuw geteld."); render(); } }); return;
    case "dismiss": S.ui.dismissed[d.k] = true; break;
    case "acties-baan": if (d.baan === "collega") { S.ui.openCollega = true; S.ui.acties.baan = "jij"; S.ui.acties.van = "mij"; } else S.ui.acties.baan = d.baan; S.ui.acties.toon = "open"; go("/acties"); break;
    case "av": S.ui.acties[d.k] = d.v; break;
    case "tf": S.ui.team.filter = d.v || null; break;
    case "gf": S.ui.gegevens.filter = d.v || ""; break;
    case "meer-werk": S.ui.meerOpen[d.id] = !S.ui.meerOpen[d.id]; break;
    case "naar-stappen": S.ui.stappenDoel = d.doel || "start"; if (S.route !== "/team/klaar") go("/team/klaar"); S.scrollDoel = "stappenblad"; break;
    case "ronde-start": { const l = voorJouLijst(); if (!l.length) return; S.ronde = { ids: l.map(a => a.id), i: 0, start: Date.now(), naarTeam: [] }; S.toast = null; go("/voor-jou/een-voor-een"); S.focusNa = "#blad-titel"; break; }
    case "ronde-stop": S.ronde = null; go("/"); break;
    case "ronde-over": if (S.ronde) S.ronde.i++; S.toast = null; S.focusNa = "#blad-titel"; break;
    case "ronde-opvolgen": { const a = actie(d.id); if (a) uitvoeren(d.id, "opvolgen", { zin: opvolgZinVan(a), ag: opvolgAgentVan(a) }, el); return; }
    case "taak-aan": { const t = S.data.taken.find(x => x.id === d.id); if (!t) return; const nieuw = !t.actief; if (!nieuw) S.ui.det["taken-uit"] = true; S.focusNa = `[data-act="taak-aan"][data-id="${cssEsc(t.id)}"]`; zetBezig(el);
      taakSchrijf(t, { Actief: nieuw }, nieuw ? `‘${t.naam}’ staat weer aan.` : `‘${t.naam}’ staat uit. Je team slaat hem over tot je hem weer aanzet.`, { Actief: t.actief }); return; }
    case "zet-aan": zetAan(d.k, el); return;
    case "veld-wijzig": { const r = rijVan(d.k, d.id); const v = dataVelden(domeinVan(d.k)).find(x => x.naam === d.v); if (!r || !v) return;
      S.ui.bewerk = { k: d.k, id: d.id, veld: d.v, voor: {}, fout: "" };
      S.ui.bewerk.voorWaarde = getField(r, d.v); S.focusNa = ".inline-edit [data-veldtype]"; break; }
    case "veld-annuleer": { const v = S.ui.bewerk && S.ui.bewerk.veld; S.ui.bewerk = null; if (v) S.focusNa = `[data-act="veld-wijzig"][data-v="${cssEsc(v)}"]`; break; }
    case "aanvullen": { const r = rijVan(d.k, d.id); const dom = domeinVan(d.k); if (!r) return; const titel = detailTitel(dom, r);
      const leeg = dataVelden(dom).filter(v => !dataCelTekst(getField(r, v.naam)) && v.type !== "relatie").map(v => v.naam);
      S.sheetOpener = focusSleutel(el);
      startOpdrachtSheet({ ag: "researcher", hoort: d.k === "organisaties" ? d.id : "", wat: `Vul de gegevens van ${titel} aan${leeg.length ? ": " + leeg.join(", ") : ""}.`, uitleg: "Zet bij elk gegeven waar je het vond (de bron). Vind je iets niet, laat het veld dan leeg en zeg dat." });
      break; }
    case "vb": S.ui.hulp.vb = d.v; S.ui.hulp.stap = -1; S.ui.hulp.open.voorbeelden = true; break;
    case "vb-stap": { const n = VOORBEELDEN[S.ui.hulp.vb].stappen.length; S.ui.hulp.stap = S.ui.hulp.stap < n - 1 ? S.ui.hulp.stap + 1 : 0; S.ui.hulp.open.voorbeelden = true; break; }
    case "vb-alles": S.ui.hulp.stap = -1; S.ui.hulp.open.voorbeelden = true; break;
    default: return;
  }
  e.preventDefault();
  render();
}
/* Zoeken tekent na een korte pauze in het typen, niet bij elke toets. */
let strakskKlok = null;
function straks() { clearTimeout(strakskKlok); strakskKlok = setTimeout(render, 120); }
function opInvoer(e) {
  const el = e.target; const d = el.dataset || {};
  if (d.input === "zoek") { S.ui.acties.zoek = el.value; straks(); }
  else if (d.input === "hulpzoek") { S.ui.hulp.zoek = el.value; straks(); }
  else if (d.input === "gzoek") { S.ui.gegevens.zoek = el.value; straks(); }
  else if (d.sh && S.sheet) { S.sheet[d.sh] = el.value; if (S.sheet.fout) { S.sheet.fout = ""; const f = document.querySelector(".sheet .fout"); if (f) f.remove(); } }
}
function opWijziging(e) {
  const el = e.target; const d = el.dataset || {}; if (!d.change) return;
  if (d.change === "van") { S.ui.acties.van = el.value; }
  else if (d.change === "ritme") { const t = S.data.taken.find(x => x.id === d.id); if (!t) return; const oud = t.ritme;
    taakSchrijf(t, { Ritme: el.value }, `‘${t.naam}’ draait nu ${ritmeLabel(el.value, CTX.schema).toLowerCase()}.`, { Ritme: oud || null }); return; }
  else if (d.change === "sh-ander" && S.sheet) { if (!el.value) return; const k = el.value.slice(0, el.value.indexOf(":")), v = el.value.slice(el.value.indexOf(":") + 1); if (k === "ag") { S.sheet.ag = v; S.sheet.mens = null; } else { S.sheet.mens = v; S.sheet.ag = null; } }
  else if (d.change === "sh-hoort" && S.sheet) { S.sheet.hoort = el.value; }
  else if (d.change === "minuten") { S.focusNa = "#minuten"; if (V2_HAKEN.minuten) V2_HAKEN.minuten(Number(el.value)); return; }
  else return;
  render();
}
function opVerzenden(e) {
  const f = e.target;
  if (f.matches && f.matches("[data-v2-veldform]")) { e.preventDefault(); veldOpslaan(f); return; }
  if (f.matches && f.matches("[data-v2-nieuw]")) { e.preventDefault(); nieuweRij(f, f.querySelector('button[type="submit"]')); }
}
function opToets(e) {
  if (e.key === "Escape" && S.ui.bewerk && !S.sheet) { const v = S.ui.bewerk.veld; S.ui.bewerk = null; S.focusNa = `[data-act="veld-wijzig"][data-v="${cssEsc(v)}"]`; render(); return; }
  if (e.key === "Escape") { if (S.sheet) { S.sheet = null; render(); e.preventDefault(); return; } if (itemRoute() && !(isDesk() && parts()[0] === "voor-jou")) { sluitBlad(); render(); } return; }
  const tag = (e.target.tagName || "").toLowerCase(); if (["input", "textarea", "select"].includes(tag) || e.target.isContentEditable) return;
  if (e.repeat) return;
  if (!CTX || S.sheet || toegang() === "notion") return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { if (kanSchrijven() && S.toast && S.toast.undo) { e.preventDefault(); const u = S.toast.undo; S.toast = null; render(); Promise.resolve(u()).then(() => { toast("Ongedaan gemaakt."); render(); }, (f) => { meldFout(f); render(); }); } return; }
  if (!isDesk() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest(".akop, .dtabs, .tabbalk")) return;
  // Alleen als je op een item staat (kaart, blad, één voor één) of nergens op:
  // dan schrijft een losse letter nooit per ongeluk vanaf een link of uitklap.
  const t = e.target; const opItem = t === document.body || t === document.documentElement || (t.closest && t.closest("[data-kaart], .blad, .ronde, #blad-titel"));
  if (!opItem) return;
  const inRonde = parts()[1] === "een-voor-een";
  if (/^[1-9]$/.test(e.key)) { if (inRonde || tabVan() !== "voorjou") return; const a = voorJouLijst().find(x => S.nummers[x.id] === Number(e.key)); if (a) { go("/voor-jou/" + a.id); S.focusNa = "#blad-titel"; render(); } return; }
  if (inRonde && e.key === "j") { if (S.ronde) { S.ronde.i++; S.toast = null; S.focusNa = "#blad-titel"; render(); } return; }
  if (inRonde && e.key === "k") return;
  const kaart = e.target.closest && e.target.closest("[data-kaart]");
  const cur = kaart ? actie(kaart.dataset.kaart) : huidigItem(); if (!cur) return;
  S.sheetOpener = focusSleutel(document.activeElement) || "#blad-titel";
  const toets = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (toets === "g" && kanSchrijven()) { const f = primair(cur); if (f) f(); }
  else if (toets === "t" && kanSchrijven() && ["check", "check-extern"].includes(soortVan(cur)) && werkAgent(cur)) { S.sheet = { type: "terug", id: cur.id, tekst: "" }; render(); }
  else if ((toets === "j" || toets === "k") && tabVan() === "voorjou") { const l = voorJouLijst(); const i = l.findIndex(x => x.id === cur.id); const n = l[i + (toets === "j" ? 1 : -1)]; if (n) { go("/voor-jou/" + n.id); S.focusNa = "#blad-titel"; render(); } }
}
function opToggle(e) { const el = e.target; if (!(el instanceof HTMLDetailsElement)) return; if (el.dataset.hsec) S.ui.hulp.open[el.dataset.hsec] = el.open; if (el.id) S.ui.det[el.id] = el.open; }
function toastPauze(aan) { return (e) => { if (S.toast && e.target.closest && e.target.closest("[data-toast]")) { if (aan) S.toast.pauze = true; else if (!(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("[data-toast]"))) { S.toast.pauze = false; S.toast.start = Math.max(S.toast.start, Date.now() - 5000); } } }; }
function opSleepStart(e) { const el = e.target.closest && e.target.closest("[data-drag]"); if (!el) return; S.drag = el.dataset.drag; const baan = el.closest("[data-drop]"); S.dragVan = baan ? baan.dataset.drop : null; try { e.dataTransfer.setData("text/plain", S.drag); e.dataTransfer.effectAllowed = "move"; } catch (x) { /* oude browser */ } }
function opSleepOver(e) { const c = e.target.closest && e.target.closest("[data-drop]"); if (c && S.drag && c.dataset.drop !== S.dragVan) { e.preventDefault(); c.classList.add("over"); } }
function opSleepUit(e) { const c = e.target.closest && e.target.closest("[data-drop]"); if (c && !c.contains(e.relatedTarget)) c.classList.remove("over"); }
function opLos(e) {
  const c = e.target.closest && e.target.closest("[data-drop]"); if (!c || !S.drag) return; e.preventDefault();
  const id = S.drag; const van = S.dragVan; S.drag = null; S.dragVan = null; c.classList.remove("over");
  if (c.dataset.drop === van) return; // op zijn eigen baan losgelaten: niets veranderen
  naarBaan(id, c.dataset.drop);
}
function opSleepEind() { S.drag = null; document.querySelectorAll(".over").forEach(x => x.classList.remove("over")); }

const V2_HAKEN = { login: null, uitloggen: null, ververs: null, exporteer: null, minuten: null };
let v2Bedraad = false;
function bedraad() {
  if (v2Bedraad) return; v2Bedraad = true;
  document.addEventListener("mousedown", (e) => { S.drukStart = e.target; }, true);
  document.addEventListener("click", opKlik);
  document.addEventListener("input", opInvoer);
  document.addEventListener("change", opWijziging);
  document.addEventListener("submit", opVerzenden);
  document.addEventListener("toggle", opToggle, true);
  document.addEventListener("keydown", opToets);
  // Volgt de kop de systeeminstelling, dan wisselt het icoon mee.
  try { const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)"); if (mq && mq.addEventListener) mq.addEventListener("change", () => { if (!S.thema) render(); }); } catch (e) { /* geen matchMedia */ }
  ["mouseover", "focusin"].forEach(ev => document.addEventListener(ev, toastPauze(true)));
  ["mouseout", "focusout"].forEach(ev => document.addEventListener(ev, toastPauze(false)));
  document.addEventListener("dragstart", opSleepStart);
  document.addEventListener("dragover", opSleepOver);
  document.addEventListener("dragleave", opSleepUit);
  document.addEventListener("drop", opLos);
  document.addEventListener("dragend", opSleepEind);
  try { const mq = window.matchMedia("(min-width: 900px)"); const wissel = () => render(); if (mq.addEventListener) mq.addEventListener("change", wissel); else if (mq.addListener) mq.addListener(wissel); } catch (e) { /* geen matchMedia */ }
}
