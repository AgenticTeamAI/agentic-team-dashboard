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
  rollenInfo = null;
  rollenVoorToken = null;
  rolVoorstelSeat = null;
  rolBezigSeat = null;
  rolKeuzeWaarde = null;
  rollenGeneratie++;
  kanaalLeeg();
}

/* f60 — rollen per teamlid (contract p10 §2b, het rollenregister van s57).
 *
 * De rollen staan niet op de site maar in de eigen werkruimte-instantie
 * (`_systeem~rollen`), en daar handhaaft de instantie ze ook: wie wat mag zetten,
 * beslist `Rollenregister.zet`, nooit dit paneel. Dit paneel leest
 * `GET /dashboard/rollen`, toont per teamlid de rol en stuurt een wijziging als
 * `PUT /dashboard/rollen` met `{seat, rol}` — pas na een zichtbare bevestiging
 * (voorstel → bevestig, zoals bij verwijderen en bij modules).
 *
 * Wat het paneel niet doet: zelf rechten afleiden. Welke knop er staat, volgt
 * dezelfde regels als de instantie (de eigenaar en jijzelf hebben geen knop, een
 * beheerder krijgt geen knop bij een andere beheerder en kan geen beheerder
 * aanwijzen), maar dat is alleen om geen knop te tonen die toch geweigerd wordt.
 * De weigering van de instantie is wat telt, en die tekst tonen we letterlijk.
 *
 * Geen register (Obeya, een instantie zonder eigenaarbron, een image van vóór
 * s57) of een daglink: dan antwoordt de instantie 404 of 403, blijft
 * `rollenInfo` null, en is het paneel precies wat het was — geen kolom, geen
 * regel. De rol-aanvraag loopt over schrijfWerkruimte: geen nieuwe fetch-plek
 * (test/geen-telemetrie.test.js telt ze). */
let rollenInfo = null; // {jij:{seat,rol}, beheer, eigenaar, standaard, toewijsbaar, rollen} of null
let rollenVoorToken = null;
let rolVoorstelSeat = null; // seat waarvan het rolvoorstel openstaat
let rolBezigSeat = null; // seat waarvan de rolwijziging nu onderweg is
let rolKeuzeWaarde = null; // wat er in de open selector gekozen is (blijft staan bij hertekenen)
let rollenGeneratie = 0; // elk laadRollen telt op; een laat antwoord van een oudere aanvraag telt niet

const ROL_LABEL = { eigenaar: "Eigenaar", beheerder: "Beheerder", medewerker: "Medewerker", viewer: "Viewer" };
const SEAT_VORM = /^[0-9a-f]{64}$/;
/* Eigen sleutels alleen: `"constructor" in ROL_LABEL` is ook waar. */
const isRol = (r) => typeof r === "string" && Object.prototype.hasOwnProperty.call(ROL_LABEL, r);

/* Alleen wat we kennen komt binnen: een onbekende rol of een rij zonder seat
 * valt weg in plaats van als tekst in een knop of selector te belanden. */
function saneerRollen(b) {
  if (!b || typeof b !== "object" || !b.jij || typeof b.jij !== "object") return null;
  const jij = b.jij;
  if (typeof jij.seat !== "string" || !SEAT_VORM.test(jij.seat) || !(isRol(jij.rol))) return null;
  const uit = { jij: { seat: jij.seat, rol: jij.rol }, beheer: false };
  // De lijst krijgen alleen eigenaar en beheerder (§2b); zonder lijst geen beheer.
  if (!Array.isArray(b.rollen) || typeof b.eigenaar !== "string" || !SEAT_VORM.test(b.eigenaar)) return uit;
  const toewijsbaar = Array.isArray(b.toewijsbaar)
    ? b.toewijsbaar.filter((r) => isRol(r) && r !== "eigenaar")
    : [];
  const standaard = isRol(b.standaard) && b.standaard !== "eigenaar" ? b.standaard : null;
  if (!toewijsbaar.length || !standaard) return uit;
  uit.beheer = true;
  uit.eigenaar = b.eigenaar;
  uit.standaard = standaard;
  uit.toewijsbaar = toewijsbaar;
  uit.rollen = b.rollen
    .filter((r) => r && typeof r.seat === "string" && SEAT_VORM.test(r.seat) && isRol(r.rol) && r.rol !== "eigenaar")
    .map((r) => ({ seat: r.seat, rol: r.rol }));
  return uit;
}

async function laadRollen(bron) {
  // Daglink: geen persoon, dus geen rol (de instantie zegt 403). Zelfde poort
  // als laadTeam; het daglink-token gaat hier dus ook niet de deur uit.
  if (!bron || !bron.oauth || !bron.token || !bron.instantieUrl || typeof schrijfWerkruimte !== "function") {
    rollenInfo = null;
    rollenVoorToken = null;
    rolVoorstelSeat = null;
    rolKeuzeWaarde = null;
    rollenGeneratie++;
    kanaalLeeg();
    return null;
  }
  if (rollenVoorToken === bron.token) return rollenInfo;
  rollenVoorToken = bron.token;
  const generatie = ++rollenGeneratie;
  let info = null;
  try {
    info = saneerRollen(await schrijfWerkruimte(bron, "GET", "/dashboard/rollen"));
  } catch (e) {
    // 404 = geen register op deze instantie; 403/503 = nu geen rol te lezen.
    // Afwezig is geen fout: het paneel blijft dan wat het was.
    info = null;
  }
  // Intussen uitgelogd, naar een daglink of naar een andere sessie gewisseld:
  // dan hoort dit antwoord bij niemand meer en laat het de nieuwe stand staan.
  if (generatie !== rollenGeneratie) return rollenInfo;
  rollenInfo = info;
  // schrijfWerkruimte kan het token onderweg vernieuwen (401 → refresh); de
  // cache hoort bij het token dat nu geldt, anders vraagt elke render opnieuw.
  rollenVoorToken = bron.token;
  return rollenInfo;
}

function rollenBeheer() {
  return !!(rollenInfo && rollenInfo.beheer);
}

/* De rol van een seat zoals de instantie hem ziet: het aankoopadres is altijd
 * eigenaar, een seat zonder rij heeft de standaardrol. */
function rolVanSeat(seat) {
  if (!rollenBeheer()) return null;
  if (seat === rollenInfo.eigenaar) return "eigenaar";
  const rij = rollenInfo.rollen.find((r) => r.seat === seat);
  return rij ? rij.rol : rollenInfo.standaard;
}

/* Welke rollen jij deze seat kunt geven (leeg = geen knop). Spiegelt de toetsen
 * 3–6 van §2b; de instantie toetst ze zelf opnieuw. */
function rolKeuzesVoor(seat) {
  if (!rollenBeheer() || !SEAT_VORM.test(seat || "")) return [];
  const ik = rollenInfo.jij;
  if (ik.rol !== "eigenaar" && ik.rol !== "beheerder") return [];
  if (seat === ik.seat || seat === rollenInfo.eigenaar) return [];
  const huidig = rolVanSeat(seat);
  if (ik.rol === "beheerder" && huidig === "beheerder") return [];
  return rollenInfo.toewijsbaar.filter((r) => r !== huidig && !(ik.rol === "beheerder" && r === "beheerder"));
}

function rolCelHtml(r) {
  const seat = r.seat;
  if (r.eigenaar === true || seat === rollenInfo.eigenaar) {
    return `<span title="Het aankoopadres van de licentie is altijd eigenaar.">${ROL_LABEL.eigenaar}</span>`;
  }
  const huidig = rolVanSeat(seat);
  const label = ROL_LABEL[huidig] + (seat === rollenInfo.jij.seat ? " (jij)" : "");
  const keuzes = rolKeuzesVoor(seat);
  if (!keuzes.length) return esc(label);
  const uit = rolBezigSeat !== null || teamBezigSeat !== null ? " disabled" : "";
  if (rolVoorstelSeat === seat) {
    // De selector begint op de huidige rol, niet op de eerste uit `toewijsbaar`:
    // die levert de instantie als ['beheerder', …], en wie dan meteen op
    // Bevestigen klikt, maakt iemand per ongeluk beheerder. Zolang de huidige
    // rol gekozen staat, doet Bevestigen niets (de knop staat uit).
    const gekozen = keuzes.includes(rolKeuzeWaarde) ? rolKeuzeWaarde : huidig;
    const opties = rollenInfo.toewijsbaar.filter((k) => k === huidig || keuzes.includes(k));
    if (!opties.includes(huidig)) opties.unshift(huidig);
    const bevestigUit = uit || (gekozen === huidig ? " disabled" : "");
    return `<div class="team-bevestig" role="group" aria-label="Rol van ${esc(r.adres)} wijzigen">
      <label class="bedien-veld"><span>Nieuwe rol voor ${esc(r.adres)}</span>
        <select data-rol-keuze="${esc(seat)}"${uit}>${opties.map((k) => `<option value="${k}"${k === gekozen ? " selected" : ""}>${ROL_LABEL[k]}</option>`).join("")}</select></label>
      <span>Nu: ${esc(ROL_LABEL[huidig])}. Kies een andere rol en bevestig om de rol te wijzigen.</span>
      <button type="button" data-rol-bevestig="${esc(seat)}"${bevestigUit}>Bevestigen</button>
      <button type="button" class="knop-secundair" data-rol-annuleer="${esc(seat)}"${uit}>Annuleren</button>
    </div>`;
  }
  return `${esc(label)} <button type="button" class="knop-secundair" data-rol-wijzig="${esc(seat)}"
      aria-label="Rol van ${esc(r.adres)} wijzigen"${uit}>Wijzigen</button>`;
}

/* Eén regel boven de lijst: wat ben jij hier. Leeg zonder register. */
function rolRegelHtml() {
  if (!rollenInfo) return "";
  // Eerlijk over wat een rol vandaag doet (contract §2b: een rol bepaalt nog
  // alleen wie er rollen zet), zonder iets te beloven over wat komt.
  return `<p class="footnote" data-team-jouw-rol>Je rol: <strong>${ROL_LABEL[rollenInfo.jij.rol]}</strong>.
    Een rol bepaalt nu alleen wie er rollen mag wijzigen; wat iemand in je werkruimte kan lezen of bijwerken, verandert er nog niet door.</p>`;
}

async function wijzigRol(sectieEl, seat, rol) {
  if (rolBezigSeat !== null || teamBezigSeat !== null) return;
  if (!rolKeuzesVoor(seat).includes(rol)) return;
  const bron = typeof huidigeBron === "undefined" ? null : huidigeBron;
  if (!bron || !bron.oauth || !bron.token) {
    teamSluitZonderSessie(sectieEl);
    return;
  }
  const rij = (teamLijst || []).find((r) => r && r.seat === seat);
  const wie = rij ? rij.adres : "Dit teamlid";
  rolBezigSeat = seat;
  renderTeamPanel(sectieEl); // knoppen uit tijdens de aanvraag
  teamMeld(sectieEl, "Rol wijzigen…");
  let gelukt = false;
  let fout = null;
  let nieuw = rol;
  let opnieuwLezen = false;
  try {
    // Terug naar de standaardrol is `null` (§2b): de rij verdwijnt, zodat de
    // seat de standaard volgt als die later anders wordt (werkhypothese §14 #52).
    const naarStandaard = rol === rollenInfo.standaard;
    const uit = await schrijfWerkruimte(bron, "PUT", "/dashboard/rollen", { seat, rol: naarStandaard ? null : rol });
    if (uit && uit.seat === seat && isRol(uit.rol) && rollenInfo && rollenInfo.beheer) {
      nieuw = uit.rol;
      rollenInfo.rollen = rollenInfo.rollen.filter((r) => r.seat !== seat)
        .concat(naarStandaard ? [] : [{ seat, rol: nieuw }]);
      rolVoorstelSeat = null;
      rolKeuzeWaarde = null;
      gelukt = true;
    } else {
      fout = "De rol is niet gewijzigd. Probeer het zo opnieuw.";
    }
  } catch (err) {
    // De instantie zegt zelf waarom (eigen_rol, eigenaar_vast, alleen_eigenaar, …).
    fout = err && err.status === 404
      // Het register staat intussen niet meer aan op deze werkruimte.
      ? "Rollen zijn op deze werkruimte nu niet te wijzigen."
      : (err && err.message) || "De rol is niet gewijzigd. Probeer het zo opnieuw.";
    // Een weigering betekent meestal dat de rollen intussen anders liggen
    // (iemand anders wijzigde iets): lees ze opnieuw, zodat de knoppen weer
    // kloppen met wat de instantie toestaat.
    opnieuwLezen = err && (err.status === 403 || err.status === 409);
  } finally {
    rolBezigSeat = null;
  }
  if (opnieuwLezen && teamSessieToken()) {
    rollenVoorToken = null;
    await laadRollen(huidigeBron);
    if (!rolKeuzesVoor(seat).length) { rolVoorstelSeat = null; rolKeuzeWaarde = null; }
  }
  if (!teamSessieToken()) {
    teamSluitZonderSessie(sectieEl);
    return;
  }
  renderTeamPanel(sectieEl);
  if (gelukt) {
    teamMeld(sectieEl, `${wie} heeft nu de rol ${ROL_LABEL[nieuw]}.`);
    const terug = teamKnopVoor(sectieEl, "data-rol-wijzig", seat);
    if (terug) terug.focus();
  } else {
    teamFout(sectieEl, fout);
    const annuleer = teamKnopVoor(sectieEl, "data-rol-annuleer", seat);
    if (annuleer) annuleer.focus();
  }
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
  rollenInfo = null;
  rollenVoorToken = null;
  rolVoorstelSeat = null;
  kanaalLeeg();
  renderTeamPanel(sectieEl);
  // s65: het teamkanaal hoort bij dezelfde ingelogde sessie; dicht met de rest.
  const kanaalEl = document.getElementById("beheer-teamkanaal");
  if (kanaalEl) renderTeamkanaal(kanaalEl);
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
  const uit = teamBezigSeat !== null || rolBezigSeat !== null ? " disabled" : "";
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

/* De rolcel staat op dezelfde regel als de statuscel: zonder register is de
 * interpolatie leeg, en dan is de rij byte voor byte die van vóór f60 (geen
 * extra regelovergang; test/f60-rollen-beheren.test.js vergelijkt met main). */
function teamRijHtml(r, beheer) {
  const wachtNog = !r.aanvaardOp;
  return `<tr>
    <td><input class="team-naam" type="text" maxlength="80" value="${esc(r.naam || "")}"
        data-team-seat="${esc(r.seat)}" aria-label="Weergavenaam van ${esc(r.adres)}"></td>
    <td class="footnote">${esc(r.adres)}</td>
    <td class="footnote">${wachtNog ? "uitgenodigd, nog niet ingelogd" : "actief"}</td>${rollenBeheer() ? `<td class="team-rol">${rolCelHtml(r)}</td>` : ""}
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
        <thead><tr><th>Naam</th><th>E-mailadres</th><th>Status</th>${rollenBeheer() ? "<th>Rol</th>" : ""}${beheer ? "<th>Toegang</th>" : ""}</tr></thead>
        <tbody>${teamLijst.map((r) => teamRijHtml(r, beheer)).join("")}</tbody>
      </table>
    </div>`;
}

/* Dashboard v2 (besluit 30-09): uitnodigen vraagt ook de naam. Die wordt de
 * naam van je collega in de werkdata (Eigenaar) en in "Voor jou", op elk
 * apparaat en hoe hij ook inlogt — één bron, gekozen door een mens. */
function teamUitnodigHtml() {
  return `<form class="team-uitnodigen" data-team-uitnodigen novalidate>
      <p class="team-uitnodigen-kop"><strong>Iemand uitnodigen</strong></p>
      <div class="team-uitnodigen-rij">
        <label class="bedien-veld"><span>Naam</span>
          <input id="team-uitnodig-naam" type="text" autocomplete="off" maxlength="80"
            placeholder="Voornaam Achternaam" data-team-uitnodig-naam></label>
        <label class="bedien-veld"><span>E-mailadres</span>
          <input id="team-uitnodig-adres" type="email" autocomplete="off" maxlength="254"
            placeholder="naam@bedrijf.nl" data-team-uitnodig-adres></label>
        <button type="submit">Uitnodigen</button>
      </div>
      <p class="footnote">Diegene krijgt een mail met uitleg en kan daarna inloggen met dit adres. De naam zie je terug bij wat je collega oppakt.</p>
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
  body.querySelector("[data-team-lijst]").innerHTML = rolRegelHtml() + teamTabelHtml(beheer);
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
  const naamVeld = form.querySelector("[data-team-uitnodig-naam]");
  const veld = form.querySelector("[data-team-uitnodig-adres]");
  const knop = form.querySelector('button[type="submit"]');
  const naam = naamVeld ? (naamVeld.value || "").trim() : "";
  const adres = (veld.value || "").trim();
  if (naamVeld && !naam) {
    teamFout(sectieEl, "Vul eerst de naam in waaronder je collega werkt.");
    naamVeld.focus();
    return;
  }
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
  if (naamVeld) naamVeld.disabled = true;
  if (knop) knop.disabled = true;
  const wie = naam ? `${naam} (${adres})` : adres;
  try {
    const uit = await modulesFetch("/api/dashboard/team/uitnodigen", { adres, naam }, token);
    if (uit && uit.status === 200 && uit.body && Array.isArray(uit.body.team)) {
      // Intussen naar een daglink gewisseld? Dan hoort het paneel niet terug.
      if (!teamSessieToken()) {
        teamSluitZonderSessie(sectieEl);
        return;
      }
      teamLijst = uit.body.team;
      const u = uit.body.uitgenodigd || {};
      let tekst;
      if (!u.nieuw) tekst = `${wie} stond al op de lijst — er is geen nieuwe mail verstuurd.`;
      else if (u.mailVerstuurd) tekst = `Uitnodiging verstuurd naar ${wie}.`;
      else tekst = `${wie} staat op de lijst, maar de uitnodigingsmail kwam niet weg. Laat het diegene zelf even weten.`;
      const letOp = typeof uit.body.letOp === "string" ? uit.body.letOp : "";
      veld.value = "";
      if (naamVeld) naamVeld.value = "";
      renderTeamPanel(sectieEl);
      teamMeld(sectieEl, tekst, letOp);
    } else if (uit && uit.status === 404 && !(uit.body && typeof uit.body.fout === "string")) {
      // Een site van vóór deze route kent hem niet (een kale 404, geen
      // fout-veld). Het dashboard kan eerder live staan dan de site, en bij een
      // lege lijst toont het het formulier al — zeg dan wat wél kan.
      teamFout(sectieEl, "Uitnodigen kan hier nog niet. Vraag je team in je AI-assistent om iemand uit te nodigen.");
    } else {
      teamFout(sectieEl, teamFoutTekst(uit, "Uitnodigen lukte niet. Probeer het zo opnieuw."));
    }
  } catch (err) {
    teamFout(sectieEl, "Uitnodigen lukte niet — geen verbinding.");
  } finally {
    veld.disabled = false;
    if (naamVeld) naamVeld.disabled = false;
    if (knop) knop.disabled = false;
    // Een uitgeschakeld veld verliest in de browser zijn focus, die dan op
    // <body> belandt. Terug naar het formulier: bij een fout wil je verbeteren,
    // na succes meteen de volgende uitnodigen (dan begint het bij de naam).
    const terug = naamVeld && !naamVeld.value ? naamVeld : veld;
    if (terug.isConnected && sectieEl.style.display !== "none") terug.focus();
  }
}

async function verwijderTeamlid(sectieEl, seat) {
  if (teamBezigSeat !== null || rolBezigSeat !== null) return;
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
    // f60: de keuze in een open rolvoorstel onthouden, zodat een hertekening
    // (een fout, een ander paneel dat binnenkomt) hem niet terugzet.
    const rolKeuze = e.target.closest && e.target.closest("[data-rol-keuze]");
    if (rolKeuze) {
      rolKeuzeWaarde = rolKeuze.value;
      // Bevestigen gaat pas aan als er een andere rol dan de huidige gekozen is.
      // Direct op de knop, geen hertekening: die zou de focus uit de selector halen.
      const seat = rolKeuze.getAttribute("data-rol-keuze");
      const bevestig = teamKnopVoor(sectieEl, "data-rol-bevestig", seat);
      if (bevestig && rolBezigSeat === null && teamBezigSeat === null) {
        bevestig.disabled = !rolKeuzesVoor(seat).includes(rolKeuze.value);
      }
      return;
    }
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

    // f60: een rol wijzigen, ook in twee stappen. Eerst het voorstel (een keuze
    // en een bevestigknop), pas bij Bevestigen een PUT naar de instantie.
    const rolKnop = doel.closest("[data-rol-wijzig], [data-rol-annuleer], [data-rol-bevestig]");
    if (rolKnop) {
      if (rolBezigSeat !== null || teamBezigSeat !== null || rolKnop.disabled) return;
      if (rolKnop.hasAttribute("data-rol-wijzig")) {
        rolVoorstelSeat = rolKnop.getAttribute("data-rol-wijzig");
        rolKeuzeWaarde = null;
        teamMeld(sectieEl, "");
        renderTeamPanel(sectieEl);
        const keuze = teamKnopVoor(sectieEl, "data-rol-keuze", rolVoorstelSeat);
        if (keuze) keuze.focus();
        return;
      }
      if (rolKnop.hasAttribute("data-rol-annuleer")) {
        const seat = rolKnop.getAttribute("data-rol-annuleer");
        rolVoorstelSeat = null;
        rolKeuzeWaarde = null;
        renderTeamPanel(sectieEl);
        const terug = teamKnopVoor(sectieEl, "data-rol-wijzig", seat);
        if (terug) terug.focus();
        return;
      }
      const seat = rolKnop.getAttribute("data-rol-bevestig");
      const keuze = teamKnopVoor(sectieEl, "data-rol-keuze", seat);
      if (keuze) void wijzigRol(sectieEl, seat, keuze.value);
      return;
    }

    // Stap 1: nog niets versturen, alleen de bevestiging openen. Focus op
    // Annuleren — de veilige keuze voor wie met Enter doorklikt.
    const vraag = doel.closest("[data-team-verwijder]");
    // Loopt er al een verwijdering, dan doen de knoppen niets — ook niet als
    // een klik een knop bereikt die net nog actief getekend stond.
    const verwijderKnop = vraag || doel.closest("[data-team-verwijder-nee], [data-team-verwijder-ja]");
    if (verwijderKnop && (teamBezigSeat !== null || rolBezigSeat !== null || verwijderKnop.disabled)) return;
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

/* s65 — wat er per agent naar het teamkanaal gaat (besluit Tijmen 26-11-2026).
 *
 * Het teamkanaal is het eigen Slack-, Teams- of Discordkanaal van de klant
 * (teamfeed-webhook, f26). Zo'n kanaal kent geen rollen: wie erin zit, leest
 * alles wat erheen gaat. Daarom gaat met AFSCHERMING=aan standaard alleen een
 * post door die elke rol in de werkruimte mag lezen; met de modus uit gaat
 * alles. De eigenaar, en alleen de eigenaar, zet hier per agent aan of uit wat
 * er naar het kanaal gaat. Geen filter per soort.
 *
 * Wie wat mag, beslist de instantie (`GET`/`PUT /dashboard/teamkanaal`,
 * werkruimte #261), nooit dit blok. Het dashboard vraagt de instelling alleen
 * op als de instantie zelf zei dat jij de eigenaar bent (`rollenInfo.jij.rol`,
 * f60), en alleen vanuit een ingelogde sessie: een daglink, een beheerder, een
 * medewerker of een viewer stuurt geen verzoek en ziet niets. Geen eigenaar
 * bekend (rollen op zonder_eigenaar), Obeya of een instantie van vóór s65: de
 * instantie zegt 404, en Beheer is byte voor byte wat het was
 * (test/s65-teamkanaal.test.js vergelijkt met een opname van vóór s65).
 *
 * Het verkeer loopt over schrijfWerkruimte: geen nieuwe fetch-plek
 * (test/geen-telemetrie.test.js telt ze). */
let kanaalInfo = null; // {ingesteld, soort, afscherming, agents:[…]} of null
let kanaalVoorToken = null;
let kanaalGeneratie = 0; // elk laadTeamkanaal telt op; een laat antwoord van een oudere aanvraag telt niet
let kanaalBezig = null; // slug waarvan de wijziging nu onderweg is
let kanaalMelding = null; // {tekst, fout} onder de lijst; blijft staan bij hertekenen

const KANAAL_SOORT = { slack: "Slack", teams: "Teams", discord: "Discord" };
const KANAAL_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

function kanaalLeeg() {
  kanaalInfo = null;
  kanaalVoorToken = null;
  kanaalBezig = null;
  kanaalMelding = null;
  kanaalGeneratie++;
}

/* Alleen wat we kennen komt binnen. De naam en het emoji gaan door esc; de
 * slug moet de vorm van een registry-slug hebben, want hij gaat terug in een
 * PUT. Een antwoord dat er niet op lijkt, telt als geen instelling. */
function saneerKanaal(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const k = b.kanaal;
  if (!k || typeof k !== "object" || typeof k.ingesteld !== "boolean") return null;
  if (b.afscherming !== "aan" && b.afscherming !== "uit") return null;
  if (!Array.isArray(b.agents)) return null;
  const soort = k.ingesteld && typeof k.soort === "string" && Object.prototype.hasOwnProperty.call(KANAAL_SOORT, k.soort) ? k.soort : null;
  const gezien = new Set();
  const agents = [];
  for (const a of b.agents) {
    if (!a || typeof a !== "object" || typeof a.slug !== "string" || !KANAAL_SLUG.test(a.slug) || gezien.has(a.slug)) continue;
    if (typeof a.standaard !== "boolean") continue;
    gezien.add(a.slug);
    const keuze = a.keuze === true || a.keuze === false ? a.keuze : null;
    const naam = typeof a.naam === "string" && a.naam.trim() ? a.naam.trim().slice(0, 80) : a.slug;
    const emoji = typeof a.emoji === "string" ? Array.from(a.emoji).slice(0, 8).join("") : ""; // tekens, geen halve surrogaten
    agents.push({ slug: a.slug, naam, emoji, keuze, standaard: a.standaard, effectief: typeof a.effectief === "boolean" ? a.effectief : keuze === null ? a.standaard : keuze });
  }
  return { ingesteld: k.ingesteld, soort, afscherming: b.afscherming, agents };
}

function isEigenaarVolgensInstantie() {
  return !!(rollenInfo && rollenInfo.jij && rollenInfo.jij.rol === "eigenaar");
}

/* Na laadRollen: alleen de eigenaar vraagt de instelling op. */
async function laadTeamkanaal(bron) {
  if (!bron || !bron.oauth || !bron.token || !bron.instantieUrl || typeof schrijfWerkruimte !== "function" || !isEigenaarVolgensInstantie()) {
    kanaalLeeg();
    return null;
  }
  if (kanaalVoorToken === bron.token) return kanaalInfo;
  kanaalVoorToken = bron.token;
  const generatie = ++kanaalGeneratie;
  let info = null;
  try {
    info = saneerKanaal(await schrijfWerkruimte(bron, "GET", "/dashboard/teamkanaal"));
  } catch (e) {
    // 404 = geen eigenaar bekend, Obeya of een instantie van vóór s65; 403/503 =
    // nu niet te lezen. Afwezig is geen fout: Beheer blijft dan wat het was.
    info = null;
  }
  if (generatie !== kanaalGeneratie) return kanaalInfo;
  kanaalInfo = info;
  kanaalVoorToken = bron.token; // schrijfWerkruimte kan het token onderweg vernieuwen
  return kanaalInfo;
}

/* Staat het blok in beeld? Alleen met een instelling, als eigenaar, in een ingelogde sessie. */
function teamkanaalZichtbaar() {
  return !!(kanaalInfo && isEigenaarVolgensInstantie() && teamSessieToken());
}

/* De lege sectie voor Beheer; vulBeheer vult hem. Leeg zonder instelling, zodat
 * Beheer voor ieder ander byte voor byte gelijk blijft. */
function teamkanaalSectieHtml() {
  if (!teamkanaalZichtbaar()) return "";
  return `
    <section class="vak beheer" id="beheer-teamkanaal"><h3>Teamkanaal</h3><div id="beheer-teamkanaal-body"></div></section>`;
}

const aanUit = (b) => (b ? "aan" : "uit");

function kanaalUitlegHtml(info) {
  const soort = info.soort ? ` (${KANAAL_SOORT[info.soort]})` : "";
  const standaard = info.afscherming === "aan"
    ? "Daarom gaat een agent waarvan niet iedereen in je team het werk mag lezen, standaard niet door."
    : "Je werkruimte schermt niets af, dus standaard gaat alles door.";
  return `<p class="footnote">Je agents melden in je teamkanaal${soort} wat ze doen. Het kanaal kent geen rollen: iedereen die erin zit, leest alles wat erheen gaat. ${standaard}</p>
      <p class="footnote">Zet per agent aan of uit wat er naar het kanaal gaat. In je werkruimte blijft alles staan, ook wat niet doorgaat.</p>`;
}

function kanaalAgentHtml(a, uit, magSchrijven) {
  const dis = uit || !magSchrijven ? " disabled" : "";
  const regel = a.keuze === null
    ? `<span>Volgt de standaard: ${aanUit(a.standaard)}</span>`
    : `<span>Jouw keuze · standaard: ${aanUit(a.standaard)}</span><button type="button" class="link" data-kanaal-standaard="${esc(a.slug)}"${dis}>Terug naar de standaard</button>`;
  return `<div class="taak${a.effectief ? "" : " uit"}"><button type="button" class="schakel" role="switch" id="kanaal-${esc(a.slug)}" aria-checked="${a.effectief}"
        aria-label="${esc(a.naam)} naar het teamkanaal" data-kanaal-agent="${esc(a.slug)}"${dis}></button>
      <div class="kol" style="gap:3px"><span class="tnaam">${a.emoji ? `<span aria-hidden="true">${esc(a.emoji)}</span> ` : ""}${esc(a.naam)}</span>
        <div class="tregel">${regel}</div></div></div>`;
}

function kanaalMeldingHtml() {
  const m = kanaalMelding;
  return `<p class="footnote team-melding" data-kanaal-melding aria-live="polite">${m && !m.fout ? esc(m.tekst) : ""}</p>
      <p class="bewerk-fout team-melding" data-kanaal-fout role="alert">${m && m.fout ? esc(m.tekst) : ""}</p>`;
}

function renderTeamkanaal(sectieEl) {
  if (!sectieEl) return;
  const body = sectieEl.querySelector("#beheer-teamkanaal-body");
  if (!teamkanaalZichtbaar()) {
    // Intussen geen eigenaar meer, of de route is weg: zeg waarom, zonder schakelaars.
    if (kanaalMelding && kanaalMelding.fout && teamSessieToken() && body) {
      body.innerHTML = kanaalMeldingHtml();
      return;
    }
    sectieEl.style.display = "none";
    if (body) body.innerHTML = "";
    return;
  }
  sectieEl.style.display = "";
  const info = kanaalInfo;
  if (!info.ingesteld) {
    body.innerHTML = `<p class="footnote" data-kanaal-geen>Er is geen teamkanaal gekoppeld. Koppel je een kanaal in Slack, Teams of Discord, dan stel je hier per agent in wat erheen gaat.</p>`;
    return;
  }
  const bron = typeof huidigeBron === "undefined" ? null : huidigeBron;
  const magSchrijven = typeof bronKanSchrijven === "function" ? bronKanSchrijven(bron) : true;
  const uit = kanaalBezig !== null;
  body.innerHTML = `${kanaalUitlegHtml(info)}
      ${magSchrijven ? "" : `<p class="footnote warn" data-kanaal-alleen-lezen>Je sessie mag alleen lezen. Log opnieuw in om dit aan te passen.</p>`}
      <div class="kanaal-agents" data-kanaal-lijst>${info.agents.map((a) => kanaalAgentHtml(a, uit, magSchrijven)).join("")}</div>
      ${kanaalMeldingHtml()}`;
  wireTeamkanaal(sectieEl);
}

/* De sectie die nu in beeld is. Beheer kan tijdens een aanvraag opnieuw
 * getekend zijn (een toast die verloopt, laadTeam of laadModuleOverzicht die
 * binnenkomt, heen en terug); dan hangt de sectie van de klik los en hoort het
 * antwoord in de nieuwe. */
function kanaalSectieNu(sectieEl) {
  return sectieEl && sectieEl.isConnected ? sectieEl : document.getElementById("beheer-teamkanaal");
}

/* Geen ingelogde sessie meer: "Wie werkt er mee" en dit blok dicht, zoals f60.
 * teamSluitZonderSessie wil de sectie van het teampaneel, niet die van het kanaal. */
function kanaalSluitZonderSessie() {
  teamSluitZonderSessie(document.getElementById("panel-team-namen"));
}

/* `waarde` is true (naar het kanaal), false (niet) of null (terug naar de standaard). */
async function zetKanaal(sectieEl, slug, waarde) {
  if (kanaalBezig !== null || !teamkanaalZichtbaar()) return;
  const agent = kanaalInfo.agents.find((a) => a.slug === slug);
  if (!agent || (waarde !== true && waarde !== false && waarde !== null)) return;
  const bron = typeof huidigeBron === "undefined" ? null : huidigeBron;
  if (!bron || !bron.oauth || !bron.token) {
    kanaalSluitZonderSessie();
    return;
  }
  kanaalBezig = slug;
  kanaalMelding = { tekst: "Opslaan…", fout: false };
  renderTeamkanaal(sectieEl); // schakelaars uit tijdens de aanvraag
  let melding;
  let opnieuwLezen = false;
  try {
    const nieuw = saneerKanaal(await schrijfWerkruimte(bron, "PUT", "/dashboard/teamkanaal", { agents: { [slug]: waarde } }));
    const na = nieuw && nieuw.agents.find((a) => a.slug === slug);
    if (na) {
      kanaalInfo = nieuw;
      melding = {
        fout: false,
        tekst: waarde === null
          ? `${na.naam} volgt weer de standaard: ${na.effectief ? "gaat naar het kanaal" : "gaat niet naar het kanaal"}.`
          : na.effectief ? `${na.naam} gaat nu naar het teamkanaal.` : `${na.naam} gaat nu niet meer naar het teamkanaal.`,
      };
    } else {
      melding = { fout: true, tekst: "Je werkruimte gaf een onverwacht antwoord. Ververs de pagina om te zien wat er nu staat." };
    }
  } catch (err) {
    // De instantie zegt zelf waarom (alleen_eigenaar, ongeldige_agent, een
    // storing, een verlopen sessie); die tekst tonen we letterlijk.
    melding = {
      fout: true,
      tekst: err && err.status === 404
        // De route is er niet meer: geen eigenaar meer bekend, of een andere instantie.
        ? "Het teamkanaal is op deze werkruimte nu niet in te stellen."
        : (err && err.message) || "Niet opgeslagen. Probeer het zo opnieuw.",
    };
    // 403 of 404: je bent intussen geen eigenaar meer, of de instelling bestaat
    // hier niet meer. Lees opnieuw, zodat er geen schakelaar blijft staan die
    // toch geweigerd wordt.
    opnieuwLezen = !!err && (err.status === 403 || err.status === 404);
  } finally {
    kanaalBezig = null;
  }
  if (opnieuwLezen && teamSessieToken()) {
    rollenVoorToken = null;
    await laadRollen(huidigeBron);
    kanaalVoorToken = null;
    await laadTeamkanaal(huidigeBron);
  }
  if (!teamSessieToken()) {
    kanaalSluitZonderSessie();
    return;
  }
  kanaalMelding = melding;
  const el = kanaalSectieNu(sectieEl);
  if (!el) return; // Beheer is niet meer in beeld; de melding staat bij de volgende keer klaar
  renderTeamkanaal(el);
  const terug = teamKnopVoor(el, "data-kanaal-agent", slug);
  if (terug) terug.focus();
}

/* Eén keer binden per sectie (Beheer tekent de sectie bij elke render opnieuw). */
function wireTeamkanaal(sectieEl) {
  if (sectieEl.dataset.bedraad === "1") return;
  sectieEl.dataset.bedraad = "1";
  sectieEl.addEventListener("click", (e) => {
    const doel = e.target;
    if (!doel || !doel.closest) return;
    const knop = doel.closest("[data-kanaal-agent], [data-kanaal-standaard]");
    if (!knop || knop.disabled || kanaalBezig !== null || !kanaalInfo) return;
    if (knop.hasAttribute("data-kanaal-standaard")) {
      void zetKanaal(sectieEl, knop.getAttribute("data-kanaal-standaard"), null);
      return;
    }
    const slug = knop.getAttribute("data-kanaal-agent");
    const agent = kanaalInfo.agents.find((a) => a.slug === slug);
    if (agent) void zetKanaal(sectieEl, slug, !agent.effectief);
  });
}
