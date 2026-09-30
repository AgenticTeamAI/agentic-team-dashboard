/* f51 — vaste taken in Team: aan/uit, ritme, weekoverzicht.
 *
 * Een ritmetaak heet naar de klant een "vaste taak": werk dat je team steeds
 * opnieuw voor je doet, zonder dat je het hoeft te vragen. Barts klacht was
 * dat ze niet aanstonden en dat alles om 07:00 leek te gebeuren; de
 * teammeeting van 29-09 vroeg om een aantal per dag en per maand. Hier zie je
 * ze, zet je ze aan of uit en kies je het ritme — met een PATCH op de rij,
 * zonder reconnect, met ongedaan maken.
 *
 * Wat het werkmoment met die rijen doet, staat in core/served/werkronde.md en
 * is hier nagebouwd, niet verzonnen:
 * - een taak is aan de beurt volgens zijn Ritme en Laatst gedraaid;
 * - per werkmoment pakt het team er hooguit één, de laagste Volgorde eerst.
 * Hoe vaak het werkmoment draait, kan het dashboard niet zien. Het oordeelt
 * daarom alleen "kwam N werkdagen niet aan de beurt" — te laat volgens de
 * eigen regel van de taak — en gokt nooit een frequentie.
 *
 * Volgorde en Instructie blijven buiten bereik: Volgorde slepen breekt de
 * elk-uur-regel en maakt uithongering erger, en de Instructie hoort bij de
 * hersync van de template. */

const RITME_KLANTTAAL = {
  "elk-uur": "Elk uur",
  "elke-2-uur": "Om de 2 uur",
  "elke-4-uur": "Om de 4 uur",
  "dagelijks": "Elke dag",
  "wekelijks-ma": "Elke maandag",
  "wekelijks-di": "Elke dinsdag",
  "wekelijks-wo": "Elke woensdag",
  "wekelijks-do": "Elke donderdag",
  "wekelijks-vr": "Elke vrijdag",
  "maandelijks": "Elke 1e van de maand",
};
const WEEKDAGEN = [["ma", 1, "maandag"], ["di", 2, "dinsdag"], ["wo", 3, "woensdag"], ["do", 4, "donderdag"], ["vr", 5, "vrijdag"]];
const VAAK = ["elk-uur", "elke-2-uur", "elke-4-uur"];

function vtTekst(rij, veld) {
  const v = getField(rij, veld);
  return v === undefined || v === null ? "" : String(v).trim();
}
function vtActief(rij) { const v = getField(rij, "Actief"); return v === true || v === "true" || v === "__YES__"; }
function vtLaatst(rij) { return parseDateField(getField(rij, "Laatst gedraaid")); }

/* De ritmes die de registry kent, in klanttaal. Kent de registry een ritme
 * niet (vandaag: geen donderdag), dan staat hij uitgegrijsd in de lijst met
 * "kan nog niet" — zo zie je dat het een beperking is, geen vergeten optie. */
function ritmeKeuzes(schema) {
  const dom = schema && schema.datadomeinen && schema.datadomeinen.ritmetaken;
  const veld = dom && (dom.velden || []).find(v => v.naam === "Ritme");
  const kent = (veld && veld.opties) || Object.keys(RITME_KLANTTAAL);
  return Object.keys(RITME_KLANTTAAL).map(r => ({ waarde: r, label: RITME_KLANTTAAL[r], kan: kent.indexOf(r) !== -1 }))
    .concat(kent.filter(r => !RITME_KLANTTAAL[r]).map(r => ({ waarde: r, label: r, kan: true })));
}

/* Werkdagen (ma–vr) ná `van`, tot en met `tot`. */
function werkdagenNa(van, tot) {
  if (!van || !tot) return 0;
  let n = 0;
  const d = new Date(van.getFullYear(), van.getMonth(), van.getDate() + 1);
  const eind = new Date(tot.getFullYear(), tot.getMonth(), tot.getDate());
  while (d <= eind) { const w = d.getDay(); if (w >= 1 && w <= 5) n++; d.setDate(d.getDate() + 1); }
  return n;
}

function vtWanneer(d, nu) {
  if (!d) return "";
  const dag = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const vandaag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  const verschil = Math.round((vandaag - dag) / 86400000);
  const uur = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (verschil === 0) return d.getHours() < 6 ? `vannacht ${uur}` : `vandaag ${uur}`;
  if (verschil === 1) return `gisteren ${uur}`;
  return vjDatumKort(d);
}

/* Hoe staat deze taak ervoor, volgens zijn eigen ritme? */
function taakStatus(rij, nu) {
  if (!vtActief(rij)) return { k: "uit", tekst: "staat uit" };
  const l = vtLaatst(rij);
  if (!l) return { k: "onbekend", tekst: "nog niet gedraaid" };
  const ritme = vtTekst(rij, "Ritme");
  if (ritme === "dagelijks" || VAAK.indexOf(ritme) !== -1) {
    const n = werkdagenNa(l, nu);
    return n >= 2
      ? { k: "achter", n, tekst: `kwam ${n} werkdagen niet aan de beurt` }
      : { k: "ok", tekst: `laatst ${vtWanneer(l, nu)}` };
  }
  const week = WEEKDAGEN.find(([kort]) => ritme === "wekelijks-" + kort);
  if (week) {
    // De laatste keer dat die dag was (vandaag telt mee).
    const dag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
    while (dag.getDay() !== week[1]) dag.setDate(dag.getDate() - 1);
    // Aan de beurt vanaf 21:00 de avond ervoor (werkronde.md).
    const vanaf = new Date(dag.getTime() - 3 * 3600000);
    if (l >= vanaf) return { k: "ok", tekst: `laatst ${vtWanneer(l, nu)}` };
    const n = werkdagenNa(dag, nu);
    return n >= 1
      ? { k: "achter", n, tekst: `kwam ${n === 1 ? "1 werkdag" : n + " werkdagen"} niet aan de beurt` }
      : { k: "wacht", tekst: `vandaag nog niet · laatst ${vjDatumKort(l)}` };
  }
  if (ritme === "maandelijks") {
    const eerste = new Date(nu.getFullYear(), nu.getMonth(), 1);
    if (l >= new Date(eerste.getTime() - 3 * 3600000)) return { k: "ok", tekst: `laatst ${vjDatumKort(l)}` };
    const n = werkdagenNa(eerste, nu);
    return n >= 2 ? { k: "achter", n, tekst: "kwam deze maand nog niet aan de beurt" } : { k: "wacht", tekst: "deze maand nog niet" };
  }
  return { k: "onbekend", tekst: `laatst ${vjDatumKort(l)}` };
}

/* Hoeveel vaste taken staan er per werkdag, en hoeveel per maand? */
function weekTelling(rijen, nu) {
  const dagen = WEEKDAGEN.map(([kort, nr, lang]) => ({ kort, nr, lang, taken: [] }));
  const vaak = [], maand = [];
  for (const r of rijen.filter(vtActief)) {
    const ritme = vtTekst(r, "Ritme");
    if (ritme === "dagelijks") dagen.forEach(d => d.taken.push(r));
    else if (ritme.indexOf("wekelijks-") === 0) { const d = dagen.find(x => "wekelijks-" + x.kort === ritme); if (d) d.taken.push(r); }
    else if (ritme === "maandelijks") maand.push(r);
    else if (VAAK.indexOf(ritme) !== -1) vaak.push(r);
  }
  let perMaand = maand.length, werkdagen = 0;
  const d = new Date(nu.getFullYear(), nu.getMonth(), 1);
  while (d.getMonth() === nu.getMonth()) {
    const w = d.getDay();
    if (w >= 1 && w <= 5) { werkdagen++; perMaand += dagen[w - 1].taken.length; }
    d.setDate(d.getDate() + 1);
  }
  const max = Math.max(0, ...dagen.map(x => x.taken.length));
  const drukste = max >= 2 ? dagen.filter(x => x.taken.length === max) : [];
  return { dagen, vaak, maand, perMaand, werkdagen, max, drukste };
}

function vtLijstZin(woorden) {
  return woorden.length < 2 ? woorden.join("") : woorden.slice(0, -1).join(", ") + " en " + woorden[woorden.length - 1];
}

function vtAgent(ctx, rij) {
  const naam = agentWeergaveNaam(ctx.schema, getField(rij, "Agent"));
  const a = naam && (ctx.schema.agents || []).find(x => (x.displayName || x.naam) === naam);
  return { naam: naam || dataCelTekst(getField(rij, "Agent")), emoji: (a && a.emoji) || "" };
}

function vtKopieerHtml(zin) {
  return `<div class="vt-kopieer"><code>${esc(zin)}</code>
    <button type="button" class="knop-mini bedien-knop" data-vt-kopieer="${esc(zin)}">Kopieer</button></div>`;
}

function taakRijHtml(ctx, rij, kan) {
  const nu = ctx.today || new Date();
  const status = taakStatus(rij, nu);
  const agent = vtAgent(ctx, rij);
  const titel = vtTekst(rij, "Taak") || "(zonder naam)";
  const id = rij.__entryId;
  const ritme = vtTekst(rij, "Ritme");
  const keuzes = ritmeKeuzes(ctx.schema);
  const opties = keuzes.map(k => `<option value="${esc(k.waarde)}"${k.waarde === ritme ? " selected" : ""}${k.kan ? "" : " disabled"}>${esc(k.label)}${k.kan ? "" : " (kan nog niet)"}</option>`).join("")
    + (ritme && !keuzes.some(k => k.waarde === ritme) ? `<option value="${esc(ritme)}" selected>${esc(ritme)}</option>` : "");
  const aan = vtActief(rij);
  return `<li class="vt-taak${aan ? "" : " vt-uit"}" data-vt-id="${esc(id)}">
    <label class="vt-schakel"><input type="checkbox" role="switch" data-vt-actief${aan ? " checked" : ""}${kan ? "" : " disabled"}
      aria-label="${esc(titel)} ${aan ? "staat aan" : "staat uit"}"><span aria-hidden="true"></span></label>
    <div class="vt-inhoud">
      <p class="vt-titel">${esc(titel)}</p>
      <p class="vt-meta">${agent.emoji ? `<span aria-hidden="true">${esc(agent.emoji)}</span> ` : ""}${esc(agent.naam)}
        <span class="vt-status vt-status-${status.k}">${status.k === "achter" ? "~ " : ""}${esc(status.tekst)}</span></p>
    </div>
    <label class="bedien-veld vt-ritme"><span class="visueel-verborgen">Ritme van ${esc(titel)}</span>
      <select data-vt-ritme${kan && aan ? "" : " disabled"}>${opties}</select></label>
  </li>`;
}

function weekHtml(ctx, w) {
  const donderdagKan = ritmeKeuzes(ctx.schema).some(k => k.waarde === "wekelijks-do" && k.kan);
  const dagen = w.dagen.map(d => `<div class="vt-dag${w.drukste.indexOf(d) !== -1 ? " vt-druk" : ""}">
      <span class="vt-dagnaam">${d.kort}</span><span class="vt-aantal">${d.taken.length}</span>
      <span class="vt-dagtaken">${d.taken.map(t => esc(vtTekst(t, "Taak"))).join("<br>")}</span>
      ${d.kort === "do" && !donderdagKan ? `<span class="vt-noot">geen wekelijkse</span>` : ""}
    </div>`).join("");
  const n = w.max;
  return `<div class="vt-week" role="list" aria-label="Vaste taken per werkdag">${dagen}</div>
    <p class="footnote">Per maand komen er ongeveer <strong>${w.perMaand}</strong> vaste taken aan de beurt${w.vaak.length ? `, plus ${w.vaak.length === 1 ? "1 taak die" : w.vaak.length + " taken die"} zo vaak ${w.vaak.length === 1 ? "draait" : "draaien"} als je team werkt` : ""}.
      Met één werkmoment per nacht doet je team er hooguit ${w.werkdagen} per maand.${donderdagKan ? "" : " Een wekelijkse taak kan nog niet op donderdag."}</p>
    ${w.drukste.length ? `<div class="vt-drukte"><strong>Op ${vtLijstZin(w.drukste.map(d => d.lang))} staan ${n} vaste taken.</strong>
      Je team doet er één per werkmoment. Werkt je team één keer per nacht, dan schuiven er ${n - 1} door.
      <details class="blad-uitklap"><summary>Wat kan ik doen?</summary><ul>
        <li>Laat je team vaker werken, bijvoorbeeld elke 4 uur (zie "Is je team klaar?").</li>
        <li>Zet een taak op een rustiger dag.</li>
        <li>Zet een taak tijdelijk uit.</li></ul></details></div>` : ""}`;
}

function vasteTakenHtml(ctx) {
  const bron = bronVan(ctx, "ritmetaken");
  const rijen = dataRijenVan(ctx, "ritmetaken");
  if (bron.toestand === "elders" || (!rijen && ctx.bundle && ctx.bundle.kind === "metrics")) {
    const waar = bron.toestand === "elders" ? bron.naam : "Notion";
    return `<section class="vt-vak"><h2>Je vaste taken staan in ${esc(waar)}</h2>
      <p>Aanpassen doe je daar, of vraag het je team in Claude. Bijvoorbeeld:</p>
      ${vtKopieerHtml("Laat mijn ritmetaken zien en zet de facturentaak op woensdag.")}</section>`;
  }
  const alle = rijen || [];
  if (!alle.length) {
    return `<section class="vt-vak"><h2>Je team heeft nog geen vaste taken</h2>
      <p>Een vaste taak is werk dat je team steeds opnieuw voor je doet, zonder dat je het hoeft te vragen. Je zet ze aan in Claude:</p>
      ${vtKopieerHtml("Zet mijn ritmetaken aan.")}
      <p class="footnote">Je team zet dan de vaste taken klaar die bij jouw modules horen, en stelt een werkmoment voor.</p></section>`;
  }
  const kan = magDomeinBewerken(ctx, "ritmetaken").ok;
  const opVolgorde = (a, b) => (Number(getField(a, "Volgorde")) || 0) - (Number(getField(b, "Volgorde")) || 0);
  const aan = alle.filter(vtActief).sort(opVolgorde);
  const uit = alle.filter(r => !vtActief(r)).sort(opVolgorde);
  const w = weekTelling(alle, ctx.today || new Date());
  return `<section class="vt-vak"><h2>Wanneer werkt je team · werkdagen</h2>${weekHtml(ctx, w)}</section>
    <section class="vt-vak"><h2>Je vaste taken · ${aan.length} aan</h2>
      <p class="footnote">Je team doet per werkmoment één vaste taak; staan er meer klaar, dan eerst de bovenste.${kan ? "" : " Aanpassen kan na inloggen."}</p>
      ${aan.length ? `<ol class="vt-lijst">${aan.map(r => taakRijHtml(ctx, r, kan)).join("")}</ol>` : `<p>Er staat nu geen enkele vaste taak aan.</p>`}
      ${uit.length ? `<details class="blad-uitklap"><summary>Uitgezet (${uit.length})</summary><ol class="vt-lijst">${uit.map(r => taakRijHtml(ctx, r, kan)).join("")}</ol></details>` : ""}
    </section>
    <section class="vt-vak"><h2>Meer vast werk?</h2><p>Zeg het tegen je team in Claude. Bijvoorbeeld:</p>
      ${vtKopieerHtml("Zet elke vrijdag een weekreflectie op.")}</section>`;
}

function vtMelding(titel, patch) {
  if ("Actief" in patch) {
    return patch.Actief ? `‘${titel}’ staat aan.` : `‘${titel}’ staat uit. Je team slaat hem over tot je hem weer aanzet.`;
  }
  return `‘${titel}’: ${(RITME_KLANTTAAL[patch.Ritme] || patch.Ritme || "").toLowerCase()}.`;
}

function renderVasteTaken(el, ctx) {
  el.innerHTML = vasteTakenHtml(ctx);
  const wijzig = (li, patch, bediening) => {
    const id = li.getAttribute("data-vt-id");
    const rij = (dataRijenVan(ctx, "ritmetaken") || []).find(r => r.__entryId === id);
    if (!rij) return;
    const vorige = vorigeWaarden(rij, patch);
    bediening.disabled = true;
    li.setAttribute("aria-busy", "true");
    snelWijzig(ctx, "ritmetaken", id, patch)
      .then((antwoord) => verwerkAntwoord(ctx, "ritmetaken", antwoord, {
        focus: `[data-vt-id="${cssWaarde(id)}"] ${bediening.hasAttribute("data-vt-actief") ? "[data-vt-actief]" : "[data-vt-ritme]"}`,
      }))
      .then(() => meld(vtMelding(vtTekst(rij, "Taak"), patch), { actie: ongedaanPatch(ctx, "ritmetaken", id, vorige) }))
      .catch((f) => {
        bediening.disabled = false;
        li.removeAttribute("aria-busy");
        renderVasteTaken(el, ctx); // terug naar wat er echt staat
        meld("Niet gelukt: " + ((f && f.message) || "probeer het opnieuw."), { fout: true });
      });
  };
  el.onchange = (e) => {
    const li = e.target.closest && e.target.closest("[data-vt-id]");
    if (!li) return;
    if (e.target.matches("[data-vt-actief]")) wijzig(li, { Actief: e.target.checked }, e.target);
    else if (e.target.matches("[data-vt-ritme]")) wijzig(li, { Ritme: e.target.value }, e.target);
  };
  el.onclick = async (e) => {
    const k = e.target.closest && e.target.closest("[data-vt-kopieer]");
    if (!k) return;
    const gelukt = await kopieerTekst(k.getAttribute("data-vt-kopieer"));
    meld(gelukt ? "Gekopieerd. Plak het in Claude." : "Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.");
  };
}

if (typeof module !== "undefined") {
  module.exports = { renderVasteTaken, vasteTakenHtml, taakStatus, weekTelling, werkdagenNa, ritmeKeuzes, RITME_KLANTTAAL };
}
