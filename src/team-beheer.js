/* i77 — wie werkt er mee, en onder welke naam.
 *
 * De weergavenaam stond tot nu toe per browser in localStorage. Dat werkte voor
 * één persoon op één apparaat en verder nergens: een tweede laptop vroeg het
 * opnieuw, en bij meerdere mensen op één licentie kon niemand corrigeren dat
 * dezelfde persoon in drie spellingen in dezelfde kolom stond. Sinds i77 hoort
 * de naam bij de seat en staat hij bij de licentie; dit paneel is de plek waar
 * de beheerder hem ziet en rechtzet.
 *
 * Dat is geen cosmetiek: `Eigenaar` is een gedeelde kolom in de werkdata, en het
 * statuscontract van de werkronde leunt erop ("Wacht op review is altijd een
 * mens"). Drie spellingen van één persoon maken filters, de dagstart en de
 * correctievrij-meting onbetrouwbaar.
 *
 * Daarnaast nodigt de beheerder hier mensen uit en haalt hij ze weg. De site doet
 * het echte werk — de uitnodigingsmail met weigerlink (art. 14 AVG) en het
 * afsluiten van sessies — via dezelfde code als de MCP-tools; dit paneel stuurt
 * alleen een adres of een seat en toont wat terugkomt.
 *
 * Alle site-verkeer loopt door modulesFetch — de enige aanroepplek naar het
 * eigen domein. Zo blijft de telemetrie-inventaris op precies vier fetches.
 */

let teamLijst = null; // laatste geslaagde antwoord; null = niet (voor ons) beschikbaar
let teamVoorToken = null;
let teamBevestigSeat = null; // seat waarvan de verwijderbevestiging openstaat

/* Alleen voor tests: deze cache leeft per paginalading, wat in een browser
 * precies goed is. Een testbestand draait alle gevallen in één context, dus
 * daar moet hij tussendoor leeg. Zelfde patroon als _resetNaamvoorstel. */
function _resetTeam() {
  teamLijst = null;
  teamVoorToken = null;
  teamBevestigSeat = null;
}

async function laadTeam(bron) {
  // Daglinksessie: geen ingelogde seat, dus geen beheerderschap — en het
  // daglink-token hoort onze server sowieso nooit te bereiken. Zelfde poort als
  // het modulepaneel.
  if (!bron || !bron.oauth || !bron.token) {
    teamLijst = null;
    return null;
  }
  const token = bron.token;
  if (teamVoorToken === token) return teamLijst;
  teamVoorToken = token;
  try {
    const uit = await modulesFetch("/api/dashboard/team", undefined, token);
    // 404 = geen beheerder, of deze licentie doet niet mee. Afwezig is geen
    // fout: het paneel blijft dan gewoon weg.
    teamLijst = uit && uit.status === 200 && uit.body && Array.isArray(uit.body.team)
      ? uit.body.team
      : null;
  } catch (e) {
    teamLijst = null;
  }
  return teamLijst;
}

/* Kan de site uitnodigen en verwijderen? Een site van vóór die routes zet geen
 * `eigenaar` op de rijen; dan tonen we alleen de namen, zoals voorheen, in
 * plaats van knoppen die op een 404 stuklopen. Een lege lijst zegt niets over
 * de site — en juist dan wil de beheerder iemand kunnen uitnodigen (het
 * aankoopadres zelf staat er meestal niet op). */
function teamBeheerMogelijk() {
  return Array.isArray(teamLijst)
    && (teamLijst.length === 0 || teamLijst.some((r) => r && typeof r.eigenaar === "boolean"));
}

function teamActieHtml(r) {
  if (r.eigenaar === true) return `<span class="footnote">eigenaar</span>`;
  // Onbekend of dit de eigenaar is (oude site): liever geen knop dan een die
  // de server toch weigert.
  if (r.eigenaar !== false) return "";
  if (teamBevestigSeat === r.seat) {
    // Eerst de uitleg, dan de knoppen: zo staat "Ja, verwijderen" niet op de
    // plek waar net "Verwijderen" stond, en doet een dubbelklik niets onomkeerbaars.
    return `<div class="team-bevestig" role="group" aria-label="Verwijderen van ${esc(r.adres)} bevestigen">
      <span>${esc(r.adres)} kan daarna niet meer inloggen, en lopende sessies worden afgesloten.</span>
      <button type="button" class="team-verwijder" data-team-verwijder-ja="${esc(r.seat)}">Ja, verwijderen</button>
      <button type="button" class="knop-secundair" data-team-verwijder-nee="${esc(r.seat)}">Annuleren</button>
    </div>`;
  }
  return `<button type="button" class="team-verwijder" data-team-verwijder="${esc(r.seat)}"
      aria-label="${esc(r.adres)} verwijderen">Verwijderen</button>`;
}

function teamRijHtml(r, beheer) {
  const wachtNog = !r.aanvaardOp;
  return `<tr>
    <td><input class="team-naam" type="text" maxlength="80" value="${esc(r.naam || "")}"
        data-team-seat="${esc(r.seat)}" aria-label="Weergavenaam van ${esc(r.adres)}"></td>
    <td class="footnote">${esc(r.adres)}</td>
    <td class="footnote">${wachtNog ? "uitgenodigd, nog niet ingelogd" : "actief"}</td>
    ${beheer ? `<td class="team-actie">${teamActieHtml(r)}</td>` : ""}
  </tr>`;
}

function teamTabelHtml(beheer) {
  if (!teamLijst.length) {
    return `<p class="footnote">Er staat nog niemand op de lijst. Nodig hierboven iemand uit.</p>`;
  }
  return `<p class="footnote">De naam komt in <strong>Eigenaar</strong> en <strong>Afgerond door</strong>
      te staan. Pas hem aan en klik ernaast om op te slaan.</p>
    <div class="tabel-scroll">
      <table class="data-tabel">
        <thead><tr><th>Naam</th><th>E-mailadres</th><th>Status</th>${beheer ? "<th>Toegang</th>" : ""}</tr></thead>
        <tbody>${teamLijst.map((r) => teamRijHtml(r, beheer)).join("")}</tbody>
      </table>
    </div>`;
}

function teamUitnodigHtml() {
  return `<form class="team-uitnodigen" data-team-uitnodigen novalidate>
      <label for="team-uitnodig-adres">Iemand uitnodigen</label>
      <div class="team-uitnodigen-rij">
        <input id="team-uitnodig-adres" type="email" autocomplete="off" maxlength="254"
          placeholder="naam@bedrijf.nl" data-team-uitnodig-adres>
        <button type="submit">Uitnodigen</button>
      </div>
      <p class="footnote">Diegene krijgt een mail met uitleg en kan daarna inloggen met dit adres.</p>
    </form>`;
}

function renderTeamPanel(sectieEl) {
  if (!sectieEl) return;
  const beheer = teamBeheerMogelijk();
  if (!teamLijst || (!teamLijst.length && !beheer)) {
    sectieEl.style.display = "none";
    return;
  }
  sectieEl.style.display = "";
  const body = sectieEl.querySelector("#panel-team-namen-body");
  // Het geraamte (formulier, meldingen) blijft staan bij een hertekening; alleen
  // de lijst wordt vervangen. Anders verdwijnt een half getypt adres of de
  // melding "uitnodiging verstuurd" zodra het dashboard opnieuw tekent.
  if (!body.querySelector("[data-team-lijst]") || body.dataset.teamBeheer !== String(beheer)) {
    body.dataset.teamBeheer = String(beheer);
    body.innerHTML = `
      ${beheer ? teamUitnodigHtml() : ""}
      <p class="footnote" data-team-melding aria-live="polite"></p>
      <p class="bewerk-fout" data-team-fout role="alert"></p>
      <div data-team-lijst></div>`;
  }
  body.querySelector("[data-team-lijst]").innerHTML = teamTabelHtml(beheer);
  wireTeamPanel(sectieEl);
}

function teamMeld(sectieEl, tekst) {
  const melding = sectieEl.querySelector("[data-team-melding]");
  const fout = sectieEl.querySelector("[data-team-fout]");
  if (melding) melding.textContent = tekst || "";
  if (fout) fout.textContent = "";
}

function teamFout(sectieEl, tekst) {
  const melding = sectieEl.querySelector("[data-team-melding]");
  const fout = sectieEl.querySelector("[data-team-fout]");
  if (melding) melding.textContent = "";
  if (fout) fout.textContent = tekst || "";
}

function teamFoutTekst(uit, standaard) {
  return (uit && uit.body && typeof uit.body.fout === "string" && uit.body.fout) || standaard;
}

async function nodigTeamlidUit(sectieEl, form) {
  const veld = form.querySelector("[data-team-uitnodig-adres]");
  const knop = form.querySelector('button[type="submit"]');
  const adres = (veld.value || "").trim();
  if (!adres) {
    teamFout(sectieEl, "Vul eerst een e-mailadres in.");
    veld.focus();
    return;
  }
  teamMeld(sectieEl, "Uitnodigen…");
  veld.disabled = true;
  if (knop) knop.disabled = true;
  try {
    const uit = await modulesFetch("/api/dashboard/team/uitnodigen", { adres });
    if (uit && uit.status === 200 && uit.body && Array.isArray(uit.body.team)) {
      teamLijst = uit.body.team;
      const u = uit.body.uitgenodigd || {};
      let tekst;
      if (!u.nieuw) tekst = `${adres} stond al op de lijst — er is geen nieuwe mail verstuurd.`;
      else if (u.mailVerstuurd) tekst = `Uitnodiging verstuurd naar ${adres}.`;
      else tekst = `${adres} staat op de lijst, maar de uitnodigingsmail kwam niet weg. Laat het diegene zelf even weten.`;
      if (typeof uit.body.letOp === "string" && uit.body.letOp) tekst += ` Let op: ${uit.body.letOp}`;
      veld.value = "";
      renderTeamPanel(sectieEl);
      teamMeld(sectieEl, tekst);
    } else {
      teamFout(sectieEl, teamFoutTekst(uit, "Uitnodigen lukte niet. Probeer het zo opnieuw."));
    }
  } catch (err) {
    teamFout(sectieEl, "Uitnodigen lukte niet — geen verbinding.");
  } finally {
    veld.disabled = false;
    if (knop) knop.disabled = false;
  }
}

async function verwijderTeamlid(sectieEl, knop, seat) {
  const rij = (teamLijst || []).find((r) => r && r.seat === seat);
  const adres = rij ? rij.adres : "Dit teamlid";
  const groep = knop.closest(".team-bevestig");
  const knoppen = groep ? Array.from(groep.querySelectorAll("button")) : [knop];
  for (const k of knoppen) k.disabled = true;
  teamMeld(sectieEl, "Verwijderen…");
  try {
    const uit = await modulesFetch("/api/dashboard/team/verwijderen", { seat });
    if (uit && uit.status === 200 && uit.body && Array.isArray(uit.body.team)) {
      teamLijst = uit.body.team;
      teamBevestigSeat = null;
      renderTeamPanel(sectieEl);
      teamMeld(sectieEl, `${adres} is verwijderd en kan niet meer inloggen.`);
      return;
    }
    teamFout(sectieEl, teamFoutTekst(uit, "Verwijderen lukte niet. Probeer het zo opnieuw."));
  } catch (err) {
    teamFout(sectieEl, "Verwijderen lukte niet — geen verbinding.");
  }
  for (const k of knoppen) k.disabled = false;
}

/* Knop bij een seat terugvinden zonder de seat in een selector te plakken: hij
 * komt van de site, en een aanhalingsteken erin breekt anders de selector. */
function teamKnopVoor(sectieEl, attr, seat) {
  return Array.from(sectieEl.querySelectorAll(`[${attr}]`)).find((k) => k.getAttribute(attr) === seat) || null;
}

/* Eén keer binden, niet per hertekening. De listeners hangen aan de vaste
 * <section> — die blijft bestaan terwijl alleen het lichaam wordt vervangen —
 * dus zonder deze vlag stapelt elke render een extra listener op en stuurt één
 * naamwijziging, uitnodiging of verwijdering er net zoveel identieke POSTs uit. */
function wireTeamPanel(sectieEl) {
  if (sectieEl.dataset.bedraad === "1") return;
  sectieEl.dataset.bedraad = "1";
  sectieEl.addEventListener("change", async (e) => {
    const melding = sectieEl.querySelector("[data-team-melding]");
    const veld = e.target.closest && e.target.closest("[data-team-seat]");
    if (!veld) return;
    const seat = veld.getAttribute("data-team-seat");
    const naam = veld.value.trim().slice(0, 80);
    veld.disabled = true;
    try {
      const uit = await modulesFetch("/api/dashboard/team", { seat, naam });
      if (uit && uit.status === 200 && uit.body && Array.isArray(uit.body.team)) {
        teamLijst = uit.body.team;
        if (melding) melding.textContent = "Opgeslagen.";
      } else if (melding) {
        melding.textContent = "Niet opgeslagen — probeer het opnieuw.";
      }
    } catch (err) {
      if (melding) melding.textContent = "Niet opgeslagen — geen verbinding.";
    } finally {
      veld.disabled = false;
    }
  });

  sectieEl.addEventListener("submit", (e) => {
    const form = e.target.closest && e.target.closest("[data-team-uitnodigen]");
    if (!form) return;
    e.preventDefault();
    void nodigTeamlidUit(sectieEl, form);
  });

  sectieEl.addEventListener("click", (e) => {
    const doel = e.target;
    if (!doel || !doel.closest) return;

    // Stap 1: nog niets versturen, alleen de bevestiging openen. Focus op
    // Annuleren — de veilige keuze voor wie met Enter doorklikt.
    const vraag = doel.closest("[data-team-verwijder]");
    if (vraag) {
      teamBevestigSeat = vraag.getAttribute("data-team-verwijder");
      teamMeld(sectieEl, "");
      renderTeamPanel(sectieEl);
      const annuleer = teamKnopVoor(sectieEl, "data-team-verwijder-nee", teamBevestigSeat);
      if (annuleer) annuleer.focus();
      return;
    }

    const nee = doel.closest("[data-team-verwijder-nee]");
    if (nee) {
      const seat = nee.getAttribute("data-team-verwijder-nee");
      teamBevestigSeat = null;
      renderTeamPanel(sectieEl);
      const terug = teamKnopVoor(sectieEl, "data-team-verwijder", seat);
      if (terug) terug.focus();
      return;
    }

    // Stap 2: pas hier gaat er iets naar de site.
    const ja = doel.closest("[data-team-verwijder-ja]");
    if (ja && !ja.disabled) {
      void verwijderTeamlid(sectieEl, ja, ja.getAttribute("data-team-verwijder-ja"));
    }
  });
}
