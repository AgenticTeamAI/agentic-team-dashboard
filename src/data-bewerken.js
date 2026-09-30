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
 * delta. Voor "Aan mij" is een naam genoeg die de gebruiker
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

/* De kopie in deze browser. Sinds i77 is dit een terugval, geen bron: de naam
 * hoort bij je seat en staat bij je licentie. */
function bewaarKopie(bron, naam) {
  try {
    const schoon = String(naam || "").trim().slice(0, 80);
    if (schoon) window.localStorage.setItem(naamSleutel(bron), schoon);
    else window.localStorage.removeItem(naamSleutel(bron));
    return schoon;
  } catch (e) { return ""; }
}

function zetMijnNaam(bron, naam) {
  const schoon = bewaarKopie(bron, naam);
  // Naar de server, zodat je andere apparaten hem ook kennen en de beheerder
  // hem kan zien. Mislukt dat, dan blijft de kopie hierboven staan en probeert
  // de volgende sessie het opnieuw — geen reden om de gebruiker op te houden.
  try {
    void modulesFetch("/api/dashboard/wie-ben-ik", { naam: schoon }, bron && bron.token)
      .catch(() => {});
  } catch (e) { /* modulesFetch niet beschikbaar: kopie volstaat */ }
  naamvoorstelSeat = tokenSeat(bron && bron.token);
  naamvoorstelBelofte = Promise.resolve({ voorstel: schoon, gezet: !!schoon });
  return schoon;
}

/* i77: wat stellen we voor als naam?
 *
 * De prompt vroeg om een naam terwijl je net was ingelogd, en dat is een vraag
 * die onze kant niet kán beantwoorden uit het token: `sub` is
 * `licentie#seathash` en het inlogscherm heeft maar één veld (e-mail). De site
 * kan het wél: die kent de adressen van deze licentie en kan uitrekenen welk
 * adres bij jouw seat hoort. `/api/dashboard/wie-ben-ik` geeft daarvan het deel
 * vóór de @ terug, of null.
 *
 * Drie dingen die hier bewust zo zijn:
 * - het loopt door `modulesFetch`, de enige plek die de site aanroept, zodat de
 *   inventaris van de telemetriecontrole op vier aanroepen blijft staan;
 * - het gebeurt pas bij de eerste schrijfactie zonder opgeslagen naam, niet bij
 *   het laden — wie nooit schrijft, laat ons nooit een adres opzoeken;
 * - het antwoord is een suggestie in een prompt, geen stille invulling. Een
 *   persoonsgegeven in de werkdata van de klant hoort langs de gebruiker.
 *
 * Mislukt de aanroep (offline, geen sessie, licentie buiten de allowlist), dan
 * is het voorstel leeg en verandert er niets aan het oude gedrag. */
let naamvoorstelSeat = null;
let naamvoorstelBelofte = null;

/* Alleen voor tests: de cache hierboven leeft per paginalading, en dat is in
 * een browser precies goed. Een testbestand draait alle gevallen in één context,
 * dus daar moet hij tussendoor leeg — zonder dit haalt de ene test het antwoord
 * van de vorige op. Zelfde patroon als _resetSleutelCache in de site. */
function _resetNaamvoorstel() {
  naamvoorstelSeat = null;
  naamvoorstelBelofte = null;
}

/* Geeft {voorstel, gezet}.
 *
 * `gezet` betekent: iemand heeft deze naam gekózen — jij eerder in deze browser,
 * jij op een ander apparaat, of je beheerder. Alleen dán mag hij zonder vragen
 * de werkdata in. Is hij false, dan is `voorstel` een afleiding uit je adres
 * (het deel vóór de @) en hoort hij alleen de prompt voor te vullen.
 *
 * Vlak dat onderscheid niet weg tot één string: dan is een afleiding niet meer
 * van een keuze te onderscheiden, en schrijft het dashboard stilletjes
 * `jan.jansen` in de gedeelde kolom `Eigenaar` van de klant. */
function haalNaamvoorstel(bron) {
  const lokaalNu = mijnNaam(bron);
  // Daglinksessie: geen ingelogde seat en geen licentie-token. Niets naar de
  // site sturen — het daglink-token hoort onze server nooit te bereiken.
  if (!bron || !bron.oauth || !bron.token || !tokenSeat(bron.token)) {
    return Promise.resolve({ voorstel: lokaalNu || "", gezet: !!lokaalNu });
  }
  const seat = tokenSeat(bron.token);
  if (naamvoorstelSeat !== seat) {
    naamvoorstelSeat = seat;
    naamvoorstelBelofte = (async () => {
      const lokaal = mijnNaam(bron);
      try {
        const uit = await modulesFetch("/api/dashboard/wie-ben-ik", undefined, bron.token);
        const ok = uit && uit.status === 200 && uit.body;
        const voorstel = ok && typeof uit.body.voorstel === "string" ? uit.body.voorstel : "";
        if (ok && uit.body.gezet) {
          // De server heeft een gekozen naam; die wint, ook als deze browser
          // iets anders onthield. Anders zou een correctie door de beheerder
          // nooit aankomen — en dat is precies waarvoor het beheerpaneel er is.
          bewaarKopie(bron, voorstel);
          return { voorstel, gezet: true };
        }
        if (lokaal) {
          // Overgang naar i77: de server kent nog geen gekozen naam, deze
          // browser wel. Til hem één keer omhoog in plaats van hem te
          // overschrijven met het deel vóór de @ van het adres.
          void modulesFetch("/api/dashboard/wie-ben-ik", { naam: lokaal }, bron.token)
            .catch(() => {});
          return { voorstel: lokaal, gezet: true };
        }
        return { voorstel, gezet: false };
      } catch (e) {
        // Offline of geen sessie: de kopie in deze browser is de terugval.
        return { voorstel: lokaal || "", gezet: !!lokaal };
      }
    })();
  }
  return naamvoorstelBelofte;
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

/* De statusconventie van het team, in code. Wie hier op Klaar klikt is een
 * mens, en die laat andere sporen achter dan een agent: "Afgerond op" is de
 * gewone afrondingsdatum en hoort er altijd op, "Afgerond door" is de
 * i25-autonomiemarkering en blijft dus leeg — anders telt handwerk mee in de
 * noemer van het correctievrij-percentage (b52 filtert daar wel op agentnaam,
 * maar een mens die toevallig zo heet zou er alsnog in vallen). "Wacht op
 * review" vult bewust niets in: dat is per statuscontract een mens, en die
 * heeft nog niets afgerond. */
function statusPatch(domein, status) {
  const velden = (domein.velden || []).map(v => v.naam);
  const patch = { Status: status };
  if (status === "Klaar" && velden.indexOf("Afgerond op") !== -1) {
    patch["Afgerond op"] = new Date().toISOString().slice(0, 10);
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
  // i72: één afleiding voor "waar woont dit" — bronVan() in databrowser.js.
  // Daarvóór stond hier een eigen vergelijking op de ruwe klantwaarde, en die
  // liep op twee punten uit de pas met de instantie die de schrijfactie
  // uiteindelijk beoordeelt (werkruimte.ts:213-217): geen trim/lowercase, dus
  // "Werkruimte" met een hoofdletter blokkeerde ten onrechte; en geen
  // uitzondering voor de domeinen die per definitie hier wonen, dus een
  // bronkoppeling-rij voor `notities` zou het notitieformulier hebben
  // dichtgezet. Dat de gebruiker iets anders te zien krijgt dan de server doet,
  // is erger dan allebei de fouten apart.
  const bron = bronVan(ctx, key);
  if (bron.toestand === "elders") {
    return { ok: false, reden: `Dit soort gegevens woont in ${bron.naam} — bijwerken doe je daar.` };
  }
  return { ok: true, reden: null };
}

/* Grote-tekst-heuristiek: het schema kent geen "lang tekstveld", maar deze
 * canonieke velden zijn in de praktijk alinea's. b60: Toelichting, Instructie
 * en Correctie stonden er niet bij — juist de velden waarin een agent zijn hele
 * werkstuk zet. In een invoer van één regel viel dat plat tot één lange zin, en
 * wie hem opsloeg, sloeg de regeleinden kapot mee op. Staat er al tekst met
 * regeleinden of van enige lengte, dan krijgt elk tekstveld een tekstvak. */
const TEXTAREA_VELDEN = ["Resultaat", "Inhoud", "Notitie", "Notities", "Vervolg", "Omschrijving", "Samenvatting",
  "Toelichting", "Instructie", "Correctie", "Beschrijving"];
const TEXTAREA_VANAF = 90;

function wordtTekstvak(veld, tekst) {
  if (veld.type !== "tekst") return false;
  return TEXTAREA_VELDEN.indexOf(veld.naam) !== -1 || tekst.indexOf("\n") !== -1 || tekst.length > TEXTAREA_VANAF;
}

/* b60: de keuzes van een selectveld. De registry kent twee soorten die niet in
 * `opties` staan: `agent_options` (de instantie valideert tegen de agentnamen
 * uit dezelfde registry, displayName vóór naam — bak-registry.mjs) en
 * `segment_options` (klantspecifiek, vrije tekst). Zonder deze afleiding was
 * de Agent-lijst leeg, en een leeg gekozen veld werd bij opslaan gewist. */
function agentOpties(schema) {
  return ((schema && schema.agents) || []).map(a => a.displayName || a.naam).filter(Boolean);
}

function veldOpties(veld, ctx) {
  if (veld.opties && veld.opties.length) return veld.opties;
  if (veld.opties_dynamisch === "agent_options") return agentOpties(ctx && ctx.schema);
  return null; // vrije tekst
}

function veldInvoerHtml(veld, waarde, ctx) {
  const naam = esc(veld.naam);
  const w = waarde === undefined || waarde === null ? "" : waarde;
  switch (veld.type) {
    case "select": {
      const lijst = veldOpties(veld, ctx);
      if (!lijst) {
        return `<input type="text" name="${naam}" data-veldtype="select" value="${esc(String(w))}">`;
      }
      // Een opgeslagen waarde die (nog) niet in de lijst staat, blijft zichtbaar
      // en gekozen. Anders toont het formulier leeg wat niet leeg is.
      const extra = w && lijst.indexOf(w) === -1
        ? `<option value="${esc(String(w))}" selected>${esc(String(w))}</option>` : "";
      const opties = lijst.map(o =>
        `<option value="${esc(o)}"${o === w ? " selected" : ""}>${esc(o)}</option>`).join("");
      return `<select name="${naam}" data-veldtype="select"><option value=""></option>${extra}${opties}</select>`;
    }
    case "multi_select": {
      const gekozen = Array.isArray(w) ? w : [];
      const lijst = veldOpties(veld, ctx) || [];
      const extra = gekozen.filter(o => lijst.indexOf(o) === -1);
      const opties = extra.concat(lijst).map(o =>
        `<option value="${esc(o)}"${gekozen.indexOf(o) !== -1 ? " selected" : ""}>${esc(o)}</option>`).join("");
      return `<select name="${naam}" data-veldtype="multi_select" multiple size="${Math.min(lijst.length + extra.length || 3, 5)}">${opties}</select>`;
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
      const tekst = String(w);
      if (wordtTekstvak(veld, tekst)) {
        const regels = Math.min(14, Math.max(3, tekst.split("\n").length + Math.floor(tekst.length / 80)));
        return `<textarea name="${naam}" data-veldtype="tekst" rows="${regels}">${esc(tekst)}</textarea>`;
      }
      return `<input type="text" name="${naam}" data-veldtype="${esc(veld.type)}" value="${esc(tekst)}">`;
    }
  }
}

function dataFormulierHtml(domein, ctx, bestaande, entryId) {
  const rijen = (domein.velden || []).map(v =>
    `<label class="bewerk-veld"><span class="bewerk-label">${esc(v.naam)}</span>${veldInvoerHtml(v, bestaande ? getField(bestaande, v.naam) : undefined, ctx)}</label>`).join("");
  return `<form class="bewerk-formulier" data-bewerk-formulier data-entry-id="${esc(entryId || "")}">
    <p><strong>${entryId && bestaande ? `Bewerken: ${esc(detailTitel(domein, bestaande))}` : `Nieuw in ${esc(domein.naam || "")}`}</strong></p>
    ${entryId ? `<p class="footnote">Alleen wat je verandert wordt opgeslagen; de rest blijft zoals het was.</p>` : ""}
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

/* ── b60: alleen versturen wat je veranderde ─────────────────────────
 *
 * Het formulier deed een PUT met wat erin stond, en PUT vervangt de hele rij.
 * Alles wat het formulier niet kon tonen ging daarmee verloren: een Agent die
 * niet in de (lege) keuzelijst stond, de tijd achter een datum, velden die dit
 * dashboard niet kent, de regeleinden in een Toelichting. Nu legt het
 * formulier bij het openen vast wat het toont, en gaat bij opslaan alleen het
 * verschil als PATCH naar de instantie. Wat je niet aanraakte, raakt het
 * dashboard ook niet aan — hoe het formulier het ook weergaf.
 *
 * Een veld dat je leegmaakte, gaat als `null`: bij PATCH betekent dat "weg"
 * (werkruimte.mengData). */
function wijzigingenVan(voor, na) {
  const patch = {};
  const namen = new Set(Object.keys(voor || {}).concat(Object.keys(na || {})));
  for (const naam of namen) {
    const oud = voor ? voor[naam] : undefined;
    const nieuw = na ? na[naam] : undefined;
    if (JSON.stringify(oud) === JSON.stringify(nieuw)) continue;
    patch[naam] = nieuw === undefined ? null : nieuw;
  }
  return patch;
}

/* Klaar via het formulier laat dezelfde sporen na als Klaar via de kiezer
 * (statusPatch). Wat je zelf in het formulier invulde, wint. */
function formulierPatch(domein, voor, na) {
  const patch = wijzigingenVan(voor, na);
  if (typeof patch.Status === "string" && patch.Status) {
    const extra = statusPatch(domein, patch.Status);
    for (const k of Object.keys(extra)) {
      if (!(k in patch) && !(na && na[k])) patch[k] = extra[k];
    }
  }
  return patch;
}

/* De waarden van vóór een PATCH, zodat "Ongedaan maken" precies die velden
 * terugzet. Wat er niet stond, gaat terug als `null` (weer weg). */
function vorigeWaarden(rij, patch) {
  const terug = {};
  for (const k of Object.keys(patch || {})) {
    const oud = rij ? rij[k] : undefined;
    terug[k] = oud === undefined || oud === "" ? null : oud;
  }
  return terug;
}

function entryPad(key, entryId) {
  return "/dashboard/entries/" + encodeURIComponent(key) + "/" + encodeURIComponent(entryId);
}

function verwijderEntry(ctx, key, entryId) {
  return schrijfWerkruimte(ctx.bron, "DELETE", entryPad(key, entryId));
}

/* ── i81: het antwoord verwerken zonder alles opnieuw te laden ─────────
 *
 * De instantie stuurt bij PATCH en POST de rij terug zoals hij hem opsloeg
 * ({entry}). Die vervangt de rij in de geladen bundel; de pagina blijft staan
 * waar je was. Het dashboard verzint dus nog steeds niet zelf hoe de rij
 * eruitziet — het neemt over wat de instantie zegt. Geen entry in het
 * antwoord, of een context zonder werkBij (tests, oudere aanroepers)? Dan de
 * oude weg: de hele bundel opnieuw ophalen. */
function verwerkAntwoord(ctx, key, antwoord, opties) {
  const o = opties || {};
  const entry = antwoord && antwoord.entry;
  if (ctx.werkBij && (o.weg || (entry && entry.entryId))) {
    const bijgewerkt = ctx.werkBij(key, o.weg ? { weg: o.weg, focus: o.focus } : { entry, focus: o.focus });
    if (bijgewerkt !== false) return Promise.resolve(bijgewerkt);
  }
  return Promise.resolve(ctx.herlaad ? ctx.herlaad() : undefined);
}

/* ── i81: één meldingsregel, met ongedaan maken ────────────────────────
 *
 * Vervangt window.alert/confirm/prompt: die blokkeren de pagina, zijn op een
 * telefoon nauwelijks te lezen en de in-app browser van de Claude-app toont ze
 * soms niet eens. De regel staat vast onderin (#melding in shell.html) en is
 * een live-regio, zodat een schermlezer hem voorleest zonder dat de focus
 * verspringt. Blijft staan zolang je muis of focus erop staat. */
let meldingKlok = null;

function meld(tekst, opties) {
  const o = opties || {};
  const vak = typeof document !== "undefined" ? document.getElementById("melding") : null;
  if (!vak) return;
  clearTimeout(meldingKlok);
  vak.className = "melding" + (o.fout ? " melding-fout" : "");
  vak.innerHTML = `<span class="melding-tekst">${esc(tekst)}</span>`
    + (o.actie ? `<button type="button" class="melding-knop" data-melding-actie>${esc(o.actie.label)}</button>` : "")
    + `<button type="button" class="melding-sluit" data-melding-sluit aria-label="Melding sluiten">✕</button>`;
  vak.hidden = false;
  // Ruimte onder de pagina zolang de melding er staat, zodat hij nooit de
  // laatste knoppen afdekt: je kunt er altijd onderuit scrollen.
  document.body.classList.add("met-melding");
  const duur = o.actie ? 10000 : 5000;
  const verberg = () => { vak.hidden = true; vak.innerHTML = ""; document.body.classList.remove("met-melding"); };
  const start = () => { clearTimeout(meldingKlok); meldingKlok = setTimeout(verberg, duur); };
  vak.onmouseenter = () => clearTimeout(meldingKlok);
  vak.onmouseleave = start;
  vak.onfocusin = () => clearTimeout(meldingKlok);
  vak.onfocusout = (e) => { if (!vak.contains(e.relatedTarget)) start(); };
  vak.onclick = (e) => {
    if (e.target.closest("[data-melding-sluit]")) { verberg(); return; }
    const knop = e.target.closest("[data-melding-actie]");
    if (!knop || !o.actie) return;
    knop.disabled = true;
    knop.setAttribute("aria-busy", "true");
    Promise.resolve().then(o.actie.doe).catch((f) => {
      meld((f && f.message) || "Dat is niet gelukt.", { fout: true });
    });
  };
  start();
}

/* "Ongedaan maken" na een PATCH: dezelfde velden terug naar hun oude waarde. */
function ongedaanPatch(ctx, key, entryId, vorige) {
  return {
    label: "Ongedaan maken",
    doe: async () => {
      const antwoord = await snelWijzig(ctx, key, entryId, vorige);
      await verwerkAntwoord(ctx, key, antwoord);
      meld("Teruggezet.");
    },
  };
}

/* "Ongedaan maken" na een nieuwe rij: die rij weer weghalen. */
function ongedaanNieuw(ctx, key, entryId) {
  return {
    label: "Ongedaan maken",
    doe: async () => {
      await verwijderEntry(ctx, key, entryId);
      await verwerkAntwoord(ctx, key, null, { weg: entryId });
      meld("Weer weggehaald.");
    },
  };
}

/* Een korte zin over wat je net wijzigde, voor in de meldingsregel. */
function wijzigingTekst(patch) {
  const p = patch || {};
  if (typeof p.Status === "string" && p.Status) return `Status is nu ${p.Status}.`;
  const namen = Object.keys(p);
  if (namen.length === 1) {
    const w = p[namen[0]];
    if (w === null) return `${namen[0]} gewist.`;
    if (typeof w === "string" && w.length <= 40) return `${namen[0]} is nu ${w}.`;
    return `${namen[0]} opgeslagen.`;
  }
  return "Opgeslagen.";
}

function verwijderBevestigingHtml(titel) {
  return `<div class="bewerk-formulier verwijder-bevestiging" data-verwijder-bevestiging role="group" aria-label="Verwijderen bevestigen">
    <p><strong>‘${esc(titel)}’ verwijderen?</strong></p>
    <p class="footnote">Dit haalt hem definitief uit je werkruimte. Dat kun je niet ongedaan maken.</p>
    <p class="bewerk-fout" data-bewerk-fout role="alert"></p>
    <div class="bewerk-knoppen">
      <button type="button" class="knop knop-gevaar" data-verwijder-ja>Ja, verwijderen</button>
      <button type="button" class="knop knop-secundair" data-bewerk-annuleer>Nee, laten staan</button>
    </div>
  </div>`;
}

/* Hangt de bewerk-interactie aan een gerenderd domein. `herteken` is de
 * terugval als de instantie geen rij terugstuurt (app.js herlaadt dan de
 * bundel); normaal werkt ctx.werkBij de rij ter plekke bij. */
function wireDataBewerken(el, key, ctx, herteken) {
  const domein = ctx.schema.datadomeinen[key];
  const paneel = el.querySelector("[data-bewerk-paneel]");
  if (!paneel || !domein) return;
  const ctxMetTerugval = Object.assign({}, ctx, { herlaad: herteken });

  function rijMetId(id) {
    return (dataRijenVan(ctx, key) || []).find(r => r.__entryId === id) || null;
  }

  /* Opent het vanuit de detailkaart, dan verschijnt het formulier ín die
   * kaart, onder de knop waarop je klikte — niet onderaan de pagina, een
   * tabel verderop. */
  let open = paneel;
  function paneelVoor(opener) {
    const kaart = opener && opener.closest && opener.closest("[data-detail-kaart]");
    const inKaart = kaart && kaart.querySelector("[data-kaart-paneel]");
    for (const p of [paneel, inKaart]) if (p) p.innerHTML = "";
    open = inKaart || paneel;
    return open;
  }

  function sluitPaneel(terugNaar) {
    open.innerHTML = "";
    if (terugNaar && terugNaar.focus) terugNaar.focus();
  }

  function toonFormulier(bestaande, entryId, opener) {
    const paneel = paneelVoor(opener);
    paneel.innerHTML = dataFormulierHtml(domein, ctx, bestaande, entryId);
    const form = paneel.querySelector("[data-bewerk-formulier]");
    // Wat het formulier nu toont, gelezen op precies dezelfde manier als
    // straks bij opslaan. Het verschil daartussen is wat jij veranderde.
    const voor = entryId ? leesFormulier(form) : null;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const foutEl = form.querySelector("[data-bewerk-fout]");
      const knop = form.querySelector('button[type="submit"]');
      const knopTekst = knop.textContent;
      const na = leesFormulier(form);
      foutEl.textContent = "";
      if (entryId) {
        const patch = formulierPatch(domein, voor, na);
        if (!Object.keys(patch).length) { sluitPaneel(opener); meld("Niets gewijzigd."); return; }
        const vorige = vorigeWaarden(bestaande, patch);
        knop.disabled = true; knop.textContent = "Opslaan…"; form.setAttribute("aria-busy", "true");
        try {
          const antwoord = await snelWijzig(ctx, key, entryId, patch);
          paneel.innerHTML = "";
          await verwerkAntwoord(ctxMetTerugval, key, antwoord, { focus: `[data-bewerk-rij="${cssWaarde(entryId)}"]` });
          meld(wijzigingTekst(patch), { actie: ongedaanPatch(ctxMetTerugval, key, entryId, vorige) });
        } catch (fout) {
          foutEl.textContent = (fout.message || "Het opslaan is niet gelukt.") + " Je invoer staat er nog; probeer het opnieuw.";
          knop.disabled = false; knop.textContent = knopTekst; form.removeAttribute("aria-busy");
        }
        return;
      }
      const extra = typeof na.Status === "string" && na.Status ? statusPatch(domein, na.Status) : {};
      for (const k of Object.keys(extra)) if (!(k in na)) na[k] = extra[k];
      knop.disabled = true; knop.textContent = "Toevoegen…"; form.setAttribute("aria-busy", "true");
      try {
        const antwoord = await schrijfWerkruimte(ctx.bron, "POST", "/dashboard/entries", { domein: key, data: na });
        paneel.innerHTML = "";
        const nieuwId = antwoord && antwoord.entry && antwoord.entry.entryId;
        await verwerkAntwoord(ctxMetTerugval, key, antwoord);
        meld("Toegevoegd.", nieuwId ? { actie: ongedaanNieuw(ctxMetTerugval, key, nieuwId) } : {});
      } catch (fout) {
        foutEl.textContent = (fout.message || "Het toevoegen is niet gelukt.") + " Je invoer staat er nog; probeer het opnieuw.";
        knop.disabled = false; knop.textContent = knopTekst; form.removeAttribute("aria-busy");
      }
    });
    form.addEventListener("keydown", (e) => { if (e.key === "Escape") sluitPaneel(opener); });
    form.querySelector("[data-bewerk-annuleer]").addEventListener("click", () => sluitPaneel(opener));
    const eerste = form.querySelector("input, select, textarea");
    if (eerste) eerste.focus();
  }

  /* i38-lijn: een destructieve actie bevestigt een mens expliciet. Niet meer
   * met window.confirm, maar in de pagina zelf: de knop die het doet noemt
   * wat er gebeurt, en de veilige keuze krijgt de focus. */
  function toonVerwijderen(id, opener) {
    const paneel = paneelVoor(opener);
    const rij = rijMetId(id);
    paneel.innerHTML = verwijderBevestigingHtml(rij ? detailTitel(domein, rij) : "Dit item");
    const vak = paneel.querySelector("[data-verwijder-bevestiging]");
    const nee = vak.querySelector("[data-bewerk-annuleer]");
    const ja = vak.querySelector("[data-verwijder-ja]");
    nee.addEventListener("click", () => sluitPaneel(opener));
    vak.addEventListener("keydown", (e) => { if (e.key === "Escape") sluitPaneel(opener); });
    ja.addEventListener("click", async () => {
      const foutEl = vak.querySelector("[data-bewerk-fout]");
      foutEl.textContent = "";
      ja.disabled = true; ja.textContent = "Verwijderen…"; vak.setAttribute("aria-busy", "true");
      try {
        await verwijderEntry(ctx, key, id);
        paneel.innerHTML = "";
        if (typeof dataDetail !== "undefined" && dataDetail && dataDetail.entryId === id) wisDataDetail();
        await verwerkAntwoord(ctxMetTerugval, key, null, { weg: id });
        meld("Verwijderd.");
      } catch (fout) {
        foutEl.textContent = (fout.message || "Het verwijderen is niet gelukt.") + " Probeer het opnieuw.";
        ja.disabled = false; ja.textContent = "Ja, verwijderen"; vak.removeAttribute("aria-busy");
      }
    });
    if (vak.scrollIntoView) vak.scrollIntoView({ block: "nearest" });
    nee.focus();
  }

  el.addEventListener("click", (e) => {
    const nieuw = e.target.closest && e.target.closest("[data-bewerk-nieuw]");
    if (nieuw) { toonFormulier(null, null, nieuw); return; }
    const bewerk = e.target.closest && e.target.closest("[data-bewerk-rij]");
    if (bewerk) {
      const id = bewerk.getAttribute("data-bewerk-rij");
      toonFormulier(rijMetId(id), id, bewerk);
      return;
    }
    const weg = e.target.closest && e.target.closest("[data-verwijder-rij]");
    if (weg) toonVerwijderen(weg.getAttribute("data-verwijder-rij"), weg);
  });
}

/* Waarde veilig in een CSS-attribuutselector. */
function cssWaarde(v) {
  return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ");
}

/* i81: hetzelfde element terugvinden nadat de pagina opnieuw is getekend. Een
 * bediening draagt zijn betekenis in data-attributen (data-snel-status,
 * data-bord-status="<id>", data-bewerk-rij="<id>"); die vormen samen de
 * selector. Zonder data-attributen is er niets betrouwbaars om op terug te
 * vallen, en dan geen selector — beter geen focus dan de verkeerde. */
function focusSelector(elem) {
  if (!elem || !elem.attributes || !elem.tagName) return null;
  const delen = [];
  for (const a of Array.from(elem.attributes)) {
    if (a.name.indexOf("data-") === 0) delen.push(`[${a.name}="${cssWaarde(a.value)}"]`);
  }
  if (!delen.length && elem.id) delen.push(`[id="${cssWaarde(elem.id)}"]`);
  return delen.length ? elem.tagName.toLowerCase() + delen.join("") : null;
}

if (typeof module !== "undefined") {
  module.exports = {
    bronKanSchrijven, magDomeinBewerken, dataFormulierHtml, leesFormulier,
    veldInvoerHtml, wireDataBewerken, tokenScopes,
    mijnNaam, zetMijnNaam, snelWijzig, statusPatch, tokenSeat,
    agentOpties, veldOpties, wijzigingenVan, formulierPatch, vorigeWaarden, verwerkAntwoord,
    meld, ongedaanPatch, wijzigingTekst, cssWaarde, focusSelector,
  };
}
