/* f23 fase D — bewerken in de Data-tab.
 *
 * Registry-gedreven: het formulier wordt volledig uit het schema opgebouwd
 * (veldtypen, selectopties, verwijzingen), en de instantie valideert met
 * exact dezelfde regels via werkruimte.schrijf — dit formulier is gemak,
 * geen grens. Knoppen bestaan alleen bij een ingelogde sessie waarvan het
 * token `dashboard:schrijf` draagt; op de daglink en bij een domein dat
 * volgens de bronkoppeling extern woont blijft alles lezen, met uitleg.
 * Verwijderen vraagt altijd een expliciete bevestiging (i38-lijn).
 */

/* Scope uit het access-token, client-side alleen om knoppen te tonen — de
 * instantie handhaaft de scope zelf (403 bij een te oud token). */
function tokenScopes(token) {
  try {
    const stuk = String(token).split(".")[1];
    const p = JSON.parse(atob(stuk.replace(/-/g, "+").replace(/_/g, "/")));
    return String(p.scope || "").split(/\s+/).filter(Boolean);
  } catch (e) { return []; }
}

/* f33: wie ben ik? Het access-token draagt bewust geen naam — `sub` is
 * `licentie#seathash`, en een naamclaim erbij is een wijziging van het
 * normatieve claimcontract (§3, byte-voor-byte getest) plus een juridische
 * delta. Voor "Aan mij" en "Afgerond door" is een naam genoeg die de gebruiker
 * zelf eenmalig opgeeft; hij staat alleen in deze browser, gekoppeld aan de
 * seat waarmee je bent ingelogd, en gaat nooit ergens anders heen dan als
 * gewone veldwaarde in je eigen werkruimte. */
function tokenSeat(token) {
  try {
    const p = JSON.parse(atob(String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return String(p.sub || "");
  } catch (e) { return ""; }
}

/* Zelfde naamruimte als de rest, zodat de opslagcontrole in
 * test/geen-telemetrie.test.js hem ziet: alles wat blijvend in de browser
 * staat hoort in de privacytekst genoemd te worden. Per seat, want op een
 * gedeelde computer is de vorige gebruiker niet jij. */
const LS_NAAM_KEY = "agentic-team-dashboard:naam";
function naamSleutel(bron) { return LS_NAAM_KEY + ":" + tokenSeat(bron && bron.token); }

function mijnNaam(bron) {
  try { return window.localStorage.getItem(naamSleutel(bron)) || ""; } catch (e) { return ""; }
}

function zetMijnNaam(bron, naam) {
  try {
    const schoon = String(naam || "").trim().slice(0, 80);
    if (schoon) window.localStorage.setItem(naamSleutel(bron), schoon);
    else window.localStorage.removeItem(naamSleutel(bron));
    return schoon;
  } catch (e) { return ""; }
}

/* f33: één veld wijzigen zonder het formulier — de kanbansleep en de
 * toewijsknoppen. PATCH mengt bij de instantie over de bestaande rij heen, dus
 * velden die dit dashboard niet kent blijven staan. Met PUT zouden die stil
 * verdwijnen; daarom is dit bewust een andere methode en geen "PUT met alles
 * wat we toevallig hebben". */
function snelWijzig(ctx, key, entryId, patch) {
  return schrijfWerkruimte(ctx.bron, "PATCH",
    "/dashboard/entries/" + encodeURIComponent(key) + "/" + encodeURIComponent(entryId), { data: patch });
}

/* De statusconventie van het team, in code. Een mens die een actie op Klaar
 * zet in het dashboard hoort dezelfde velden achter te laten als een agent
 * die dat doet — anders meet i25 (correctievrij werk) scheef. "Wacht op
 * review" vult bewust niets in: dat is per statuscontract een mens, en die
 * heeft nog niets afgerond. */
function statusPatch(domein, status, naam) {
  const velden = (domein.velden || []).map(v => v.naam);
  const patch = { Status: status };
  if (status === "Klaar") {
    if (velden.indexOf("Afgerond door") !== -1) patch["Afgerond door"] = naam || "dashboard";
    if (velden.indexOf("Afgerond op") !== -1) patch["Afgerond op"] = new Date().toISOString().slice(0, 10);
  }
  return patch;
}

function bronKanSchrijven(bron) {
  return !!(bron && bron.oauth && tokenScopes(bron.token).indexOf("dashboard:schrijf") !== -1);
}

/* Mag dít domein hier bewerkt worden? Nee is altijd mét reden, zodat de UI
 * kan uitleggen in plaats van stil een knop weg te laten. */
function magDomeinBewerken(ctx, key) {
  if (!ctx.kanSchrijven) return { ok: false, reden: null }; // daglink of oude sessie: gewoon stil lezen
  if (!ctx.bundle || ctx.bundle.kind !== "rows") return { ok: false, reden: null };
  if (DATA_NIET_IN_BUNDEL[key]) return { ok: false, reden: null };
  const systeem = ctx.bundle.systeemPerDomein ? ctx.bundle.systeemPerDomein[key] : null;
  if (systeem && systeem !== "werkruimte" && systeem !== "geen") {
    return { ok: false, reden: `Dit domein woont volgens je bronkoppeling in ${systeem} — bewerken doe je daar.` };
  }
  return { ok: true, reden: null };
}

/* Grote-tekst-heuristiek: het schema kent geen "lang tekstveld", maar deze
 * canonieke velden zijn in de praktijk alinea's. */
const TEXTAREA_VELDEN = ["Resultaat", "Inhoud", "Notitie", "Vervolg", "Omschrijving", "Samenvatting"];

function veldInvoerHtml(veld, waarde, ctx) {
  const naam = esc(veld.naam);
  const w = waarde === undefined || waarde === null ? "" : waarde;
  switch (veld.type) {
    case "select": {
      const opties = (veld.opties || []).map(o =>
        `<option value="${esc(o)}"${o === w ? " selected" : ""}>${esc(o)}</option>`).join("");
      return `<select name="${naam}" data-veldtype="select"><option value=""></option>${opties}</select>`;
    }
    case "multi_select": {
      const gekozen = Array.isArray(w) ? w : [];
      const opties = (veld.opties || []).map(o =>
        `<option value="${esc(o)}"${gekozen.indexOf(o) !== -1 ? " selected" : ""}>${esc(o)}</option>`).join("");
      return `<select name="${naam}" data-veldtype="multi_select" multiple size="${Math.min((veld.opties || []).length || 3, 5)}">${opties}</select>`;
    }
    case "datum":
      return `<input type="date" name="${naam}" data-veldtype="datum" value="${esc(String(w).slice(0, 10))}">`;
    case "getal":
      return `<input type="number" step="any" name="${naam}" data-veldtype="getal" value="${esc(String(w))}">`;
    case "checkbox":
      return `<label class="bewerk-checkbox"><input type="checkbox" name="${naam}" data-veldtype="checkbox"${w === true ? " checked" : ""}> ja</label>`;
    case "url":
      return `<input type="url" name="${naam}" data-veldtype="url" value="${esc(String(w))}" placeholder="https://…">`;
    case "email":
      return `<input type="email" name="${naam}" data-veldtype="email" value="${esc(String(w))}">`;
    case "mensen": {
      const tekst = Array.isArray(w) ? w.join(", ") : String(w);
      return `<input type="text" name="${naam}" data-veldtype="mensen" value="${esc(tekst)}" placeholder="namen, gescheiden door komma's">`;
    }
    case "relatie": {
      // Kiezen uit de al geladen rijen van het doeldomein; de waarde is het
      // entryId (de instantie schrijft {id, titel} zelf, f28). Zonder geladen
      // doelrijen valt het veld terug op een titel-invoer — de instantie
      // zoekt dan op titel.
      const doel = ctx.bundle.domains[veld.naar];
      const doelDomein = ctx.schema.datadomeinen[veld.naar];
      const rijen = doel && Array.isArray(doel.rows) ? doel.rows : [];
      const titelVeld = doelDomein && doelDomein.velden && doelDomein.velden.length ? doelDomein.velden[0].naam : null;
      const gekozenIds = (Array.isArray(w) ? w : (w ? [w] : []))
        .map(v => (v && typeof v === "object" ? v.id : v)).filter(Boolean);
      if (!rijen.length || !titelVeld) {
        const tekst = (Array.isArray(w) ? w : (w ? [w] : []))
          .map(v => (v && typeof v === "object" ? v.titel : v)).filter(Boolean).join(", ");
        return `<input type="text" name="${naam}" data-veldtype="relatie-titel" data-meervoud="${veld.meervoud ? "1" : ""}" value="${esc(tekst)}" placeholder="titel van de ${esc(veld.naar)}-rij">`;
      }
      const opties = rijen.filter(r => r.__entryId).map(r => {
        const titel = dataCelTekst(getField(r, titelVeld)) || r.__entryId;
        return `<option value="${esc(r.__entryId)}"${gekozenIds.indexOf(r.__entryId) !== -1 ? " selected" : ""}>${esc(titel)}</option>`;
      }).join("");
      return veld.meervoud
        ? `<select name="${naam}" data-veldtype="relatie" data-meervoud="1" multiple size="${Math.min(rijen.length, 5)}">${opties}</select>`
        : `<select name="${naam}" data-veldtype="relatie"><option value=""></option>${opties}</select>`;
    }
    default: { // titel, tekst
      if (veld.type === "tekst" && TEXTAREA_VELDEN.indexOf(veld.naam) !== -1) {
        return `<textarea name="${naam}" data-veldtype="tekst" rows="3">${esc(String(w))}</textarea>`;
      }
      return `<input type="text" name="${naam}" data-veldtype="${esc(veld.type)}" value="${esc(String(w))}">`;
    }
  }
}

function dataFormulierHtml(domein, ctx, bestaande, entryId) {
  const rijen = (domein.velden || []).map(v =>
    `<label class="bewerk-veld"><span class="bewerk-label">${esc(v.naam)}</span>${veldInvoerHtml(v, bestaande ? getField(bestaande, v.naam) : undefined, ctx)}</label>`).join("");
  return `<form class="bewerk-formulier" data-bewerk-formulier data-entry-id="${esc(entryId || "")}">
    <p><strong>${entryId ? "Rij bewerken" : "Nieuwe rij"}</strong></p>
    ${rijen}
    <p class="bewerk-fout" data-bewerk-fout role="alert"></p>
    <div class="bewerk-knoppen">
      <button type="submit" class="knop">${entryId ? "Opslaan" : "Toevoegen"}</button>
      <button type="button" class="knop knop-secundair" data-bewerk-annuleer>Annuleren</button>
    </div>
  </form>`;
}

/* Formulier → het data-object dat werkruimte.schrijf verwacht. Lege waarden
 * blijven weg (een leeg veld is "niet ingevuld", geen lege string opslaan). */
function leesFormulier(formEl) {
  const data = {};
  for (const el of formEl.querySelectorAll("[data-veldtype]")) {
    const naam = el.getAttribute("name");
    const type = el.getAttribute("data-veldtype");
    if (type === "checkbox") { data[naam] = el.checked; continue; }
    if (type === "multi_select" || (type === "relatie" && el.getAttribute("data-meervoud"))) {
      const gekozen = Array.from(el.selectedOptions || []).map(o => o.value).filter(Boolean);
      if (gekozen.length) data[naam] = gekozen;
      continue;
    }
    const waarde = String(el.value || "").trim();
    if (!waarde) continue;
    if (type === "getal") { data[naam] = Number(waarde.replace(",", ".")); continue; }
    if (type === "mensen") { data[naam] = waarde.split(",").map(s => s.trim()).filter(Boolean); continue; }
    if (type === "relatie-titel" && el.getAttribute("data-meervoud")) {
      data[naam] = waarde.split(",").map(s => s.trim()).filter(Boolean);
      continue;
    }
    data[naam] = waarde;
  }
  return data;
}

async function verstuurEntry(ctx, key, entryId, data) {
  if (entryId) {
    return schrijfWerkruimte(ctx.bron, "PUT",
      "/dashboard/entries/" + encodeURIComponent(key) + "/" + encodeURIComponent(entryId), { data });
  }
  return schrijfWerkruimte(ctx.bron, "POST", "/dashboard/entries", { domein: key, data });
}

function verwijderEntry(ctx, key, entryId) {
  return schrijfWerkruimte(ctx.bron, "DELETE",
    "/dashboard/entries/" + encodeURIComponent(key) + "/" + encodeURIComponent(entryId));
}

/* Hangt de bewerk-interactie aan een gerenderd domein. `herteken` is de
 * verversing na een geslaagde write (app.js herlaadt de bundel). */
function wireDataBewerken(el, key, ctx, herteken) {
  const domein = ctx.schema.datadomeinen[key];
  const paneel = el.querySelector("[data-bewerk-paneel]");
  if (!paneel || !domein) return;

  function toonFormulier(bestaande, entryId) {
    paneel.innerHTML = dataFormulierHtml(domein, ctx, bestaande, entryId);
    const form = paneel.querySelector("[data-bewerk-formulier]");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const foutEl = form.querySelector("[data-bewerk-fout]");
      const knop = form.querySelector('button[type="submit"]');
      knop.disabled = true;
      foutEl.textContent = "";
      try {
        await verstuurEntry(ctx, key, entryId, leesFormulier(form));
        paneel.innerHTML = "";
        await herteken();
      } catch (fout) {
        foutEl.textContent = fout.message || "Het opslaan is niet gelukt.";
        knop.disabled = false;
      }
    });
    form.querySelector("[data-bewerk-annuleer]").addEventListener("click", () => { paneel.innerHTML = ""; });
    const eerste = form.querySelector("input, select, textarea");
    if (eerste) eerste.focus();
  }

  el.addEventListener("click", async (e) => {
    const nieuw = e.target.closest && e.target.closest("[data-bewerk-nieuw]");
    if (nieuw) { toonFormulier(null, null); return; }
    const bewerk = e.target.closest && e.target.closest("[data-bewerk-rij]");
    if (bewerk) {
      const id = bewerk.getAttribute("data-bewerk-rij");
      const rij = (dataRijenVan(ctx, key) || []).find(r => r.__entryId === id);
      toonFormulier(rij || null, id);
      return;
    }
    const weg = e.target.closest && e.target.closest("[data-verwijder-rij]");
    if (weg) {
      const id = weg.getAttribute("data-verwijder-rij");
      // i38-lijn: een destructieve actie bevestigt een mens expliciet.
      if (!window.confirm("Deze rij definitief verwijderen? Dit is niet ongedaan te maken.")) return;
      weg.disabled = true;
      try {
        await verwijderEntry(ctx, key, id);
        await herteken();
      } catch (fout) {
        weg.disabled = false;
        window.alert(fout.message || "Het verwijderen is niet gelukt.");
      }
    }
  });
}

if (typeof module !== "undefined") {
  module.exports = {
    bronKanSchrijven, magDomeinBewerken, dataFormulierHtml, leesFormulier,
    veldInvoerHtml, wireDataBewerken, tokenScopes,
    mijnNaam, zetMijnNaam, snelWijzig, statusPatch, tokenSeat,
  };
}
