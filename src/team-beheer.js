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
 * Alle site-verkeer loopt door modulesFetch — de enige aanroepplek naar het
 * eigen domein. Zo blijft de telemetrie-inventaris op precies vier fetches.
 */

let teamLijst = null; // laatste geslaagde antwoord; null = niet (voor ons) beschikbaar
let teamVoorToken = null;

/* Alleen voor tests: deze cache leeft per paginalading, wat in een browser
 * precies goed is. Een testbestand draait alle gevallen in één context, dus
 * daar moet hij tussendoor leeg. Zelfde patroon als _resetNaamvoorstel. */
function _resetTeam() {
  teamLijst = null;
  teamVoorToken = null;
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

function teamRijHtml(r) {
  const wachtNog = !r.aanvaardOp;
  return `<tr>
    <td><input class="team-naam" type="text" maxlength="80" value="${esc(r.naam || "")}"
        data-team-seat="${esc(r.seat)}" aria-label="Weergavenaam van ${esc(r.adres)}"></td>
    <td class="footnote">${esc(r.adres)}</td>
    <td class="footnote">${wachtNog ? "uitgenodigd, nog niet ingelogd" : "actief"}</td>
  </tr>`;
}

function renderTeamPanel(sectieEl) {
  if (!sectieEl) return;
  if (!teamLijst || !teamLijst.length) {
    sectieEl.style.display = "none";
    return;
  }
  sectieEl.style.display = "";
  sectieEl.querySelector("#panel-team-namen-body").innerHTML = `
    <p class="footnote">Deze naam komt in <strong>Eigenaar</strong> en <strong>Afgerond door</strong>
      te staan. Pas hem aan en klik ernaast om op te slaan.</p>
    <div class="tabel-scroll">
      <table class="data-tabel">
        <thead><tr><th>Naam</th><th>E-mailadres</th><th>Status</th></tr></thead>
        <tbody>${teamLijst.map(teamRijHtml).join("")}</tbody>
      </table>
    </div>
    <p class="footnote" data-team-melding aria-live="polite"></p>`;
  wireTeamPanel(sectieEl);
}

/* Eén keer binden, niet per hertekening. De listener hangt aan de vaste
 * <section> — die blijft bestaan terwijl alleen het lichaam wordt vervangen —
 * dus zonder deze vlag stapelt elke render een extra listener op en stuurt één
 * naamwijziging er net zoveel identieke POSTs uit. */
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
}
