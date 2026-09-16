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
let teamBezigSeat = null; // seat waarvan de verwijdering nu onderweg is

/* Alleen voor tests: deze cache leeft per paginalading, wat in een browser
 * precies goed is. Een testbestand draait alle gevallen in één context, dus
 * daar moet hij tussendoor leeg. Zelfde patroon als _resetNaamvoorstel. */
function _resetTeam() {
  teamLijst = null;
  teamVoorToken = null;
  teamBevestigSeat = null;
  teamBezigSeat = null;
}

async function laadTeam(bron) {
  // Daglinksessie: geen ingelogde seat, dus geen beheerderschap — en het
  // daglink-token hoort onze server sowieso nooit te bereiken. Zelfde poort als
  // het modulepaneel.
  if (!bron || !bron.oauth || !bron.token) {
    teamLijst = null;
    // Ook de token-cache weg: wie daarna terugwisselt naar dezelfde ingelogde
    // sessie, moet het team opnieuw krijgen en niet de null van de daglink.
    teamVoorToken = null;
    teamBevestigSeat = null;
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

/* Het token voor een schrijfactie — alleen uit een ingelogde sessie. Wisselt
 * iemand in hetzelfde tabblad naar een daglink terwijl dit paneel nog
 * openstaat, dan krijgt modulesFetch anders stilzwijgend het daglink-token mee
 * naar onze server. Daarom geven we het token expliciet mee, en is er geen
 * ingelogde sessie meer, dan gaat er niets weg. */
function teamSessieToken() {
  const bron = typeof huidigeBron === "undefined" ? null : huidigeBron;
  return bron && bron.oauth && bron.token ? bron.token : null;
}

/* Geen ingelogde sessie meer: paneel dicht in plaats van een knop die niets doet. */
function teamSluitZonderSessie(sectieEl) {
  teamLijst = null;
  teamBevestigSeat = null;
  renderTeamPanel(sectieEl);
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
  // "licentiehouder" en niet "eigenaar": `Eigenaar` is in de uitleg erboven de
  // werkdatakolom, en daar kan iedereen op deze lijst in staan.
  if (r.eigenaar === true) {
    return `<span class="footnote" title="De eigenaar van de licentie kun je niet verwijderen.">licentiehouder</span>`;
  }
  // Onbekend of dit de eigenaar is (oude site): liever geen knop dan een die
  // de server toch weigert.
  if (r.eigenaar !== false) return "";
  // Eén verwijdering tegelijk. De knoppen gaan uit in de html zelf, niet op de
  // elementen: een hertekening tijdens de aanvraag (Ververs, periodekeuze) zou
  // anders een actieve "Ja, verwijderen" terugzetten en een tweede POST mogelijk
  // maken — waarvan de 404 dan het geslaagde verwijderen overschrijft.
  const uit = teamBezigSeat !== null ? " disabled" : "";
  if (teamBevestigSeat === r.seat) {
    // Eerst de uitleg, dan de knoppen: zo staat "Ja, verwijderen" niet op de
    // plek waar net "Verwijderen" stond, en doet een dubbelklik niets onomkeerbaars.
    return `<div class="team-bevestig" role="group" aria-label="Verwijderen van ${esc(r.adres)} bevestigen">
      <span>${esc(r.adres)} kan daarna niet meer inloggen. Een sessie die nog open staat, stopt binnen een uur.</span>
      <button type="button" class="team-verwijder" data-team-verwijder-ja="${esc(r.seat)}"${uit}>Ja, verwijderen</button>
      <button type="button" class="knop-secundair" data-team-verwijder-nee="${esc(r.seat)}"${uit}>Annuleren</button>
    </div>`;
  }
  return `<button type="button" class="team-verwijder" data-team-verwijder="${esc(r.seat)}"
      aria-label="${esc(r.adres)} verwijderen"${uit}>Verwijderen</button>`;
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
    // Het aankoopadres staat meestal niet op de uitnodigingenlijst, maar logt
    // wel in — "er staat niemand op" zou dus niet kloppen met de vraag erboven.
    return `<p class="footnote">Je hebt nog niemand uitgenodigd. Zelf log je in met het aankoopadres; nodig hierboven je collega's uit.</p>`;
  }
  return `<p class="footnote">De naam komt in <strong>Eigenaar</strong> en <strong>Afgerond door</strong>
      te staan. Pas hem aan en klik ernaast om op te slaan.</p>
    <div class="tabel-scroll">
      <table class="detail-table team-tabel">
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
      <p class="footnote team-melding" data-team-melding aria-live="polite"></p>
      <p class="footnote warn team-melding" data-team-let-op aria-live="polite"></p>
      <p class="bewerk-fout team-melding" data-team-fout role="alert"></p>
      <div data-team-lijst></div>`;
  }
  body.querySelector("[data-team-lijst]").innerHTML = teamTabelHtml(beheer);
  wireTeamPanel(sectieEl);
}

function teamZet(sectieEl, attr, tekst) {
  const el = sectieEl.querySelector(`[${attr}]`);
  if (el) el.textContent = tekst || "";
}

/* De plekkenwaarschuwing (letOp) krijgt een eigen, oranje regel: het is een
 * melding met licentiegevolgen, geen bijzin achter "uitnodiging verstuurd". */
function teamMeld(sectieEl, tekst, letOp) {
  teamZet(sectieEl, "data-team-melding", tekst);
  teamZet(sectieEl, "data-team-let-op", letOp);
  teamZet(sectieEl, "data-team-fout", "");
}

function teamFout(sectieEl, tekst) {
  teamZet(sectieEl, "data-team-melding", "");
  teamZet(sectieEl, "data-team-let-op", "");
  teamZet(sectieEl, "data-team-fout", tekst);
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
  const token = teamSessieToken();
  if (!token) {
    teamSluitZonderSessie(sectieEl);
    return;
  }
  teamMeld(sectieEl, "Uitnodigen…");
  veld.disabled = true;
  if (knop) knop.disabled = true;
  try {
    const uit = await modulesFetch("/api/dashboard/team/uitnodigen", { adres }, token);
    if (uit && uit.status === 200 && uit.body && Array.isArray(uit.body.team)) {
      // Intussen naar een daglink gewisseld? Dan hoort het paneel niet terug.
      if (!teamSessieToken()) {
        teamSluitZonderSessie(sectieEl);
        return;
      }
      teamLijst = uit.body.team;
      const u = uit.body.uitgenodigd || {};
      let tekst;
      if (!u.nieuw) tekst = `${adres} stond al op de lijst — er is geen nieuwe mail verstuurd.`;
      else if (u.mailVerstuurd) tekst = `Uitnodiging verstuurd naar ${adres}.`;
      else tekst = `${adres} staat op de lijst, maar de uitnodigingsmail kwam niet weg. Laat het diegene zelf even weten.`;
      const letOp = typeof uit.body.letOp === "string" ? uit.body.letOp : "";
      veld.value = "";
      renderTeamPanel(sectieEl);
      teamMeld(sectieEl, tekst, letOp);
    } else if (uit && uit.status === 404 && !(uit.body && typeof uit.body.fout === "string")) {
      // Een site van vóór deze route kent hem niet (een kale 404, geen
      // fout-veld). Het dashboard kan eerder live staan dan de site, en bij een
      // lege lijst toont het het formulier al — zeg dan wat wél kan.
      teamFout(sectieEl, "Uitnodigen kan hier nog niet. Vraag je team in Claude om iemand uit te nodigen.");
    } else {
      teamFout(sectieEl, teamFoutTekst(uit, "Uitnodigen lukte niet. Probeer het zo opnieuw."));
    }
  } catch (err) {
    teamFout(sectieEl, "Uitnodigen lukte niet — geen verbinding.");
  } finally {
    veld.disabled = false;
    if (knop) knop.disabled = false;
    // Een uitgeschakeld veld verliest in de browser zijn focus, die dan op
    // <body> belandt. Terug naar het veld: bij een fout wil je het adres
    // verbeteren, na succes meteen de volgende uitnodigen.
    if (veld.isConnected && sectieEl.style.display !== "none") veld.focus();
  }
}

async function verwijderTeamlid(sectieEl, seat) {
  if (teamBezigSeat !== null) return;
  const token = teamSessieToken();
  if (!token) {
    teamSluitZonderSessie(sectieEl);
    return;
  }
  const rij = (teamLijst || []).find((r) => r && r.seat === seat);
  const adres = rij ? rij.adres : "Dit teamlid";
  teamBezigSeat = seat;
  renderTeamPanel(sectieEl); // tekent de knoppen uitgeschakeld
  teamMeld(sectieEl, "Verwijderen…");
  let gelukt = false;
  try {
    const uit = await modulesFetch("/api/dashboard/team/verwijderen", { seat }, token);
    if (uit && uit.status === 200 && uit.body && Array.isArray(uit.body.team)) {
      teamLijst = uit.body.team;
      if (teamBevestigSeat === seat) teamBevestigSeat = null;
      gelukt = true;
    } else {
      teamFout(sectieEl, teamFoutTekst(uit, "Verwijderen lukte niet. Probeer het zo opnieuw."));
    }
  } catch (err) {
    teamFout(sectieEl, "Verwijderen lukte niet — geen verbinding.");
  } finally {
    teamBezigSeat = null;
  }
  // Intussen naar een daglink gewisseld? Dan hoort het paneel niet terug.
  if (!teamSessieToken()) {
    teamSluitZonderSessie(sectieEl);
    return;
  }
  renderTeamPanel(sectieEl);
  // De knop waar de focus stond is weg (vervangen of uitgeschakeld). Geef hem
  // een vaste plek in plaats van <body>: na succes het adresveld bovenaan, na
  // een fout de veilige keuze in de bevestiging die openblijft.
  if (gelukt) {
    teamMeld(sectieEl, `${adres} is verwijderd en kan niet meer inloggen.`);
    const veld = sectieEl.querySelector("[data-team-uitnodig-adres]");
    if (veld) veld.focus();
  } else {
    const annuleer = teamKnopVoor(sectieEl, "data-team-verwijder-nee", seat);
    if (annuleer) annuleer.focus();
  }
}

/* Knop of veld bij een seat terugvinden zonder de seat in een selector te plakken: hij
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
    const token = teamSessieToken();
    if (!token) {
      teamSluitZonderSessie(sectieEl);
      return;
    }
    veld.disabled = true;
    try {
      const uit = await modulesFetch("/api/dashboard/team", { seat, naam }, token);
      if (uit && uit.status === 200 && uit.body && Array.isArray(uit.body.team)) {
        teamLijst = uit.body.team;
        // Is de lijst tijdens het opslaan hertekend — bijvoorbeeld door een klik
        // op Verwijderen bij iemand anders — dan staat in het nieuwe veld nog de
        // oude naam, terwijl hieronder "Opgeslagen." verschijnt. Zet daar neer wat
        // de site opsloeg, tenzij iemand er alweer in typt.
        const nu = teamKnopVoor(sectieEl, "data-team-seat", seat);
        const opgeslagen = teamLijst.find((r) => r && r.seat === seat);
        if (nu && nu !== veld && opgeslagen && nu !== document.activeElement) nu.value = opgeslagen.naam || "";
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
    // Loopt er al een verwijdering, dan doen de knoppen niets — ook niet als
    // een klik een knop bereikt die net nog actief getekend stond.
    const verwijderKnop = vraag || doel.closest("[data-team-verwijder-nee], [data-team-verwijder-ja]");
    if (verwijderKnop && (teamBezigSeat !== null || verwijderKnop.disabled)) return;
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
    if (ja) void verwijderTeamlid(sectieEl, ja.getAttribute("data-team-verwijder-ja"));
  });
}
