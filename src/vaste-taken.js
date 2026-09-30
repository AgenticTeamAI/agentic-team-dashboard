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
        <li>Laat je team vaker werken, bijvoorbeeld elke 4 uur. <a href="#/klaar">Zo doe je dat →</a></li>
        <li>Zet een taak op een rustiger dag.</li>
        <li>Zet een taak tijdelijk uit.</li></ul></details></div>` : ""}`;
}

function vasteTakenHtml(ctx) {
  const bron = bronVan(ctx, "ritmetaken");
  const rijen = dataRijenVan(ctx, "ritmetaken");
  if (bron.toestand === "elders" || (!rijen && ctx.bundle && ctx.bundle.kind === "metrics")) {
    const waar = bron.toestand === "elders" ? bron.naam : "Notion";
    return `${typeof hoeWerktDitHtml === "function" ? hoeWerktDitHtml("vaste-taken") : ""}
    <section class="vt-vak"><h2>Je vaste taken staan in ${esc(waar)}</h2>
      <p>Aanpassen doe je daar, of vraag het je team in Claude. Bijvoorbeeld:</p>
      ${vtKopieerHtml("Laat mijn ritmetaken zien en zet de facturentaak op woensdag.")}</section>`;
  }
  const alle = rijen || [];
  if (!alle.length) {
    return `${typeof hoeWerktDitHtml === "function" ? hoeWerktDitHtml("vaste-taken") : ""}
    <section class="vt-vak"><h2>Je team heeft nog geen vaste taken</h2>
      <p>Een vaste taak is werk dat je team steeds opnieuw voor je doet, zonder dat je het hoeft te vragen. Je zet ze aan in Claude:</p>
      ${vtKopieerHtml("Zet mijn ritmetaken aan.")}
      <p class="footnote">Je team zet dan de vaste taken klaar die bij jouw modules horen, en stelt een werkmoment voor.</p></section>`;
  }
  const kan = magDomeinBewerken(ctx, "ritmetaken").ok;
  const opVolgorde = (a, b) => (Number(getField(a, "Volgorde")) || 0) - (Number(getField(b, "Volgorde")) || 0);
  const aan = alle.filter(vtActief).sort(opVolgorde);
  const uit = alle.filter(r => !vtActief(r)).sort(opVolgorde);
  const w = weekTelling(alle, ctx.today || new Date());
  return `${klaarRegelHtml(ctx)}
    ${typeof hoeWerktDitHtml === "function" ? hoeWerktDitHtml("vaste-taken") : ""}
    <section class="vt-vak"><h2>Wanneer werkt je team · werkdagen</h2>${weekHtml(ctx, w)}</section>
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

/* ── f52: "Is je team klaar?" ─────────────────────────────────────────
 *
 * Zes regels uit echte gegevens. De belangrijkste is "Je team werkt vanzelf":
 * een register zonder geplande taak doet niets, en dat is precies de fout die
 * niemand opmerkt omdat er geen melding bij hoort (orchestrator-prompt, stap 4).
 * Het dashboard ziet de geplande taak zelf niet. Het ziet alleen de sporen die
 * een werkmoment achterlaat: Laatst gedraaid op een vaste taak, een actie die
 * een agent zelf afrondde, een actie die een agent 's nachts klaarzette. Wat
 * overdag op verzoek ontstond, telt niet — dat bewijst niets over vanzelf.
 *
 * Een werkmoment zonder werk laat geen spoor na (werkronde.md: "rond de sessie
 * direct af", en de feed zwijgt). Rood is dus alleen terecht als er werk aan
 * de beurt wás: een taak die achterloopt op zijn eigen ritme, of een die nog
 * nooit draaide. Na het aanzetten staat hij 36 uur op "nog even wachten": de
 * eerste nacht moet nog komen. Hoe vaak het werkmoment draait, raadt hij niet.
 * Notion-klanten: daar zien we alleen de teamfeed, en die zwijgt ook bij een
 * lege ronde — dus hooguit "let op", nooit rood. */
const WERKMOMENT_OPDRACHT = "Haal via de Agentic Team-connector met get_werkronde het actuele werkronde-playbook op en voer het exact uit.";
const WACHT_NA_AANZETTEN_MS = 36 * 3600000;
const DAGNAMEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

/* "sinds maandag" binnen een week, daarna de datum: "sinds maandag" van drie weken terug leest als eergisteren. */
function kcSinds(d, nu) { return nu - d < 6 * 86400000 ? DAGNAMEN[d.getDay()] : vjDatumKort(d); }

function kcStempel(r, k) { return parseDateField(r && r.__stempels && r.__stempels[k]); }

function werkmomentSporen(ctx) {
  const namen = agentNamen(ctx.schema);
  const sporen = [];
  for (const t of (dataRijenVan(ctx, "ritmetaken") || []).filter(vtActief)) { const l = vtLaatst(t); if (l) sporen.push(l); }
  for (const a of rows(ctx.bundle, "acties") || []) {
    if (namen && isAgentNaam(getField(a, "Afgerond door"), namen)) { const d = parseDateField(getField(a, "Afgerond op")); if (d) sporen.push(d); }
    if (namen && isAgentNaam(getField(a, "Aangemaakt door"), namen)) { const d = kcStempel(a, "aangemaakt"); if (d && d.getHours() < 6) sporen.push(d); }
  }
  return sporen.concat(feedSporen(ctx) || []);
}

/* Uit de teamfeed telt alleen wat een werkronde post: de start en het slot
 * (op elk uur, want een werkmoment kan ook overdag lopen), en alles wat
 * 's nachts verscheen. Een voorstel van 14:00 kwam uit een gesprek. */
function feedSporen(ctx) {
  const feed = ctx.bundle && ctx.bundle.teamfeed;
  if (!feed || !Array.isArray(feed.entries)) return null;
  const sporen = [];
  for (const e of feed.entries) {
    const d = e && parseDateField(e.aangemaakt || e.bijgewerkt);
    if (!d) continue;
    const soort = String(getField(e.data || {}, "Soort") || "").toLowerCase();
    if (soort === "rondestart" || soort === "afgerond" || d.getHours() < 6) sporen.push(d);
  }
  return sporen;
}

function kcActivatiesDezeWeek(ctx) {
  const a = ctx.bundle && ctx.bundle.activaties;
  if (!a || !Array.isArray(a.weken) || !a.weken.length) return null;
  const nu = ctx.today || new Date();
  const ma = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - ((nu.getDay() + 6) % 7));
  const sleutel = vjIsoDag(ma);
  const week = a.weken.find(w => w.week_start === sleutel);
  return week ? Object.values(week.per_agent || {}).reduce((s, n) => s + n, 0) : 0;
}

function kcNotion(ctx) {
  if (bronVan(ctx, "ritmetaken").toestand === "elders" || bronVan(ctx, "acties").toestand === "elders") return true;
  return !!(ctx.bundle && ctx.bundle.kind === "metrics" && !rows(ctx.bundle, "acties"));
}

function klaarCheck(ctx) {
  const nu = ctx.today || new Date();
  const r = [];
  const notion = kcNotion(ctx);
  const act = kcActivatiesDezeWeek(ctx);
  r.push(act === null
    ? { id: "verbonden", k: "onbekend", titel: "Verbonden met Claude", tekst: "Hoe vaak je je team iets vroeg, telt je werkruimte nog niet." }
    : { id: "verbonden", k: act > 0 ? "ok" : "let", titel: "Verbonden met Claude",
      tekst: act > 0 ? `Je vroeg je team deze week ${act} keer iets.` : "Je vroeg je team deze week nog niets." });

  if (notion) {
    const fs = feedSporen(ctx);
    const lp = fs && fs.length ? new Date(Math.max(...fs)) : null;
    const nf = lp ? werkdagenNa(lp, nu) : 99;
    r.push({ id: "aan", k: "onbekend", titel: "Vaste taken staan aan", tekst: "Je vaste taken staan in Notion; dat kunnen we hier niet controleren." });
    r.push(!fs ? { id: "werkt", k: "onbekend", titel: "Je team werkt vanzelf", tekst: "Dat zien we aan je teamfeed, en die kent je werkruimte nog niet." }
      : nf <= 1 ? { id: "werkt", k: "ok", titel: "Je team werkt vanzelf", tekst: `Laatst in je teamfeed: ${vtWanneer(lp, nu)}.` }
        : nf < 5 ? { id: "werkt", k: "onbekend", titel: "Je team werkt vanzelf", tekst: `Laatst in je teamfeed: ${vtWanneer(lp, nu)}. Een werkmoment zonder werk meldt niets, dus dat kan kloppen.` }
          : { id: "werkt", k: "let", titel: "Werkt je team nog vanzelf?", actie: "start",
            tekst: `${lp ? `Je team meldde sinds ${kcSinds(lp, nu)} niets meer in je teamfeed.` : "Je team meldde nog niets in je teamfeed."} Kijk of je werkmoment in Claude nog aanstaat.` });
    r.push({ id: "beurt", k: "onbekend", titel: "Alle vaste taken komen aan de beurt", tekst: "Je vaste taken staan in Notion; dat kunnen we hier niet controleren." });
    r.push({ id: "wacht", k: "onbekend", titel: "Niets ligt te lang op je te wachten", tekst: "Je acties staan in Notion." });
    r.push({ id: "afhandelen", k: "onbekend", telt: false, titel: "Afhandelen doe je in Notion", tekst: "Hier zie je wat je team deed." });
  } else {
    const taken = dataRijenVan(ctx, "ritmetaken") || [];
    const actief = taken.filter(vtActief);
    const uit = taken.length - actief.length;
    r.push(actief.length
      ? { id: "aan", k: "ok", titel: "Vaste taken staan aan", tekst: `${actief.length === 1 ? "1 taak" : actief.length + " taken"} aan${uit ? `, ${uit} uit` : ""}.` }
      : { id: "aan", k: "nee", titel: "Vaste taken staan aan", actie: "start",
        tekst: "Er staan nog geen vaste taken aan. Zonder vaste taken doet je team alleen iets als je het vraagt." });
    const sporen = werkmomentSporen(ctx);
    const recent = sporen.length ? new Date(Math.max(...sporen)) : null;
    // Was er werk aan de beurt dat bleef liggen? Alleen dán is stilte een fout.
    const bleefLiggen = actief.some(t => { const k = taakStatus(t, nu).k; return k === "achter" || k === "onbekend"; });
    const aanGezet = actief.map(t => kcStempel(t, "aangemaakt")).filter(Boolean);
    const laatstAan = aanGezet.length ? new Date(Math.max(...aanGezet)) : null;
    let werktNee = false, wachten = false;
    if (!actief.length) {
      werktNee = true;
      r.push({ id: "werkt", k: "nee", titel: "Je team werkt vanzelf", actie: "start", tekst: "We zagen je team nog niet vanzelf werken." });
    } else if ((!recent || (laatstAan && recent < laatstAan)) && laatstAan && nu - laatstAan < WACHT_NA_AANZETTEN_MS) {
      wachten = true;
      r.push({ id: "werkt", k: "onbekend", titel: "Je team werkt vanzelf", tekst: "Nog even wachten: na de eerste nacht weten we of je team vanzelf werkt." });
    } else if (recent && werkdagenNa(recent, nu) <= 1) {
      r.push({ id: "werkt", k: "ok", titel: "Je team werkt vanzelf", tekst: `Laatst: ${vtWanneer(recent, nu)}.` });
    } else if (recent && !bleefLiggen) {
      r.push({ id: "werkt", k: "ok", titel: "Je team werkt vanzelf", tekst: `Laatst: ${vtWanneer(recent, nu)}. Sindsdien kwam er geen vaste taak aan de beurt.` });
    } else {
      werktNee = true;
      r.push({ id: "werkt", k: "nee", titel: "Je team werkt vanzelf", actie: "start",
        tekst: `${recent ? `We zagen je team sinds ${kcSinds(recent, nu)} niet meer vanzelf werken.` : "We zagen je team nog niet vanzelf werken."} Zonder werkmoment doet je team niets vanzelf, en je krijgt daar geen melding van.` });
    }
    const achter = actief.filter(t => taakStatus(t, nu).k === "achter");
    r.push(!actief.length ? { id: "beurt", k: "onbekend", titel: "Alle vaste taken komen aan de beurt", tekst: "Nog geen vaste taken." }
      : werktNee ? { id: "beurt", k: "onbekend", titel: "Alle vaste taken komen aan de beurt", tekst: "Eerst moet je team weer vanzelf werken." }
        : wachten ? { id: "beurt", k: "onbekend", titel: "Alle vaste taken komen aan de beurt", tekst: "Dat zie je na de eerste werkdag." }
        : achter.length ? { id: "beurt", k: "let", titel: "Niet alles komt aan de beurt", actie: "vaker",
          tekst: achter.map(t => `‘${vtTekst(t, "Taak")}’ ${taakStatus(t, nu).tekst}`).join(". ") + ". Je team doet één vaste taak per werkmoment." }
          : { id: "beurt", k: "ok", titel: "Alle vaste taken komen aan de beurt", tekst: "Geen enkele taak loopt achter op zijn eigen ritme." });
    const lijst = voorJouLijst(ctx) || [];
    const oudste = lijst.reduce((m, x) => { const s = sindsVan(x); return s && (!m || s < m) ? s : m; }, null);
    const wd = oudste ? werkdagenNa(oudste, nu) : 0;
    const kd = oudste ? Math.floor((nu - oudste) / 86400000) : 0;
    r.push(wd < 5
      ? { id: "wacht", k: "ok", titel: "Niets ligt te lang op je te wachten",
        tekst: !oudste ? "Er wacht niets op je." : kd === 0 ? "Er wacht niets langer dan vandaag." : `Het oudste wacht ${kd === 1 ? "1 dag" : kd + " dagen"}.` }
      : { id: "wacht", k: "let", titel: "Er ligt werk te lang op je te wachten", actie: "ronde",
        tekst: `Het oudste wacht al ${kd} dagen. Het staat bovenaan in Voor jou.` });
    // Geen oordeel over je team, dus telt niet mee — en alleen in beeld als er iets te doen is.
    if (!magDomeinBewerken(ctx, "acties").ok) {
      r.push({ id: "afhandelen", k: "let", telt: false, titel: "Je kijkt alleen mee", actie: "login", tekst: "Met je daglink kun je lezen, niet afhandelen." });
    }
  }
  const geteld = r.filter(x => x.telt !== false && x.k !== "onbekend");
  const ok = geteld.filter(x => x.k === "ok").length;
  const stil = r.some(x => (x.id === "aan" || x.id === "werkt") && x.k === "nee");
  return { regels: r, ok, totaal: geteld.length, onbekend: r.filter(x => x.telt !== false && x.k === "onbekend").length, stil, notion,
    wachten: !notion && r.some(x => x.id === "werkt" && x.k === "onbekend") };
}

function klaarSamenvatting(kc) {
  const letop = kc.totaal - kc.ok;
  if (kc.notion) return { kop: `Is je team klaar? ${kc.ok} van ${kc.totaal} te controleren`, sub: `${kc.onbekend} punten staan in Notion en kunnen we hier niet zien.` };
  if (!letop && kc.wachten) return { kop: "Is je team klaar? Bijna — nog even wachten", sub: "Na de eerste nacht weten we of je team vanzelf werkt." };
  if (!letop) return { kop: "Is je team klaar? Ja, alles in orde", sub: "Je team werkt vanzelf." };
  return { kop: `Is je team klaar? ${kc.ok} van ${kc.totaal} · ${letop} ${letop === 1 ? "punt vraagt" : "punten vragen"} aandacht`, sub: "Kijk wat er nodig is." };
}

const KC_VORM = { ok: ["✓", "in orde"], let: ["~", "let op"], nee: ["✗", "niet in orde"], onbekend: ["?", "onbekend"] };
const KC_ACTIE = {
  start: ["Zo regel je het in 2 minuten", "#/klaar"],
  vaker: ["Laat je team vaker werken", "#/klaar"],
  ronde: ["Loop ze één voor één door", "#/ronde"],
};

function klaarRegelsHtml(kc) {
  return `<ul class="kc-regels">${kc.regels.map(r => {
    const [vorm, label] = KC_VORM[r.k];
    const actie = r.actie === "login" ? `<button type="button" class="knop-mini bedien-knop" data-login>Inloggen</button>`
      : KC_ACTIE[r.actie] ? `<a class="kc-actie" href="${KC_ACTIE[r.actie][1]}">${KC_ACTIE[r.actie][0]} →</a>` : "";
    return `<li class="kc-regel kc-${r.k}"><span class="kc-vorm" aria-label="${label}">${vorm}</span>
      <div><strong>${esc(r.titel)}</strong><p>${esc(r.tekst)}</p>${actie}</div></li>`;
  }).join("")}</ul>`;
}

function stappenbladHtml(ctx, vaker, { volledig = false } = {}) {
  const naam = `Werkmoment — ${(ctx.bundle && ctx.bundle.klant) || "je bedrijf"}`;
  if (vaker) {
    return `<section class="vt-vak kc-stappen" id="stappen"><h2>Laat je team vaker werken</h2>
      <p>Je werkmoment bestaat al. Zet het vaker aan, dan komen al je vaste taken aan de beurt.</p>
      <ol class="kc-stappenlijst">
        <li><strong>Open in Claude: Scheduled.</strong> Zoek je werkmoment: de taak met get_werkronde in de opdracht.</li>
        <li><strong>Zet "Wanneer" op elke 4 uur.</strong> Je team doet dan tot zes vaste taken per dag in plaats van één. Een werkmoment zonder werk stopt meteen en kost vrijwel niets.</li>
        <li><strong>Klaar.</strong> Morgen zie je hier dat alle taken aan de beurt kwamen.</li>
      </ol></section>`;
  }
  const velden = `<dl class="kc-velden"><dt>Naam</dt><dd>${vtKopieerHtml(naam)}</dd>
          <dt>Wanneer</dt><dd>elke dag, buiten werktijd (bijvoorbeeld 02:00)</dd>
          <dt>Opdracht</dt><dd>${vtKopieerHtml(WERKMOMENT_OPDRACHT)}</dd></dl>
        <span class="footnote">Zet de Agentic Team-connector aan, en die van je werkdata als die ergens anders staat.</span>`;
  const klaar = `<li><strong>Klaar.</strong> Morgenochtend staat bij Voor jou wat je team deed, en wordt deze check vanzelf groen.</li>`;
  // Staan de vaste taken al aan, dan ontbreekt alleen het werkmoment. "Zet mijn
  // ritmetaken aan" maakt de starter-set opnieuw aan (orchestrator-prompt,
  // Activeren stap 3) — dan heb je elke taak dubbel.
  // De Hulp toont altijd de hele installatie (volledig): daar leest ook wie nog niets heeft.
  if (!volledig && dataRijenVan(ctx, "ritmetaken") && dataRijenVan(ctx, "ritmetaken").some(vtActief)) {
    return `<section class="vt-vak kc-stappen" id="stappen"><h2>Zet je werkmoment (weer) aan</h2>
      <p>Je vaste taken staan klaar. Wat ontbreekt, is het moment waarop je team ze oppakt.</p>
      <ol class="kc-stappenlijst">
        <li><strong>Open in Claude: Scheduled.</strong>
          <span class="footnote">Staat daar al een taak met get_werkronde in de opdracht? Kijk of hij aanstaat. Zo niet, kies New task en vul in:</span>
          ${velden}</li>
        ${klaar}
      </ol></section>`;
  }
  return `<section class="vt-vak kc-stappen" id="stappen"><h2>Laat je team vanzelf werken</h2>
    <ol class="kc-stappenlijst">
      <li><strong>Zeg in Claude tegen je team:</strong>${vtKopieerHtml("Zet mijn ritmetaken aan.")}
        <span class="footnote">Je team zet dan de vaste taken klaar die bij jouw modules horen.</span></li>
      <li><strong>Je team stelt een geplande taak voor. Druk op Schedule.</strong>
        <span class="footnote">Zie je die knop niet? Ga in Claude naar Scheduled › New task en vul in:</span>
        ${velden}</li>
      ${klaar}
    </ol></section>`;
}

function renderKlaar(el, ctx) {
  const kc = klaarCheck(ctx);
  const s = klaarSamenvatting(kc);
  const vaker = kc.regels.some(r => r.actie === "vaker");
  el.innerHTML = `<section class="vt-vak"><h2 class="kc-kop" tabindex="-1">${esc(s.kop)}</h2><p class="footnote">${esc(s.sub)}</p>
      ${typeof hoeWerktDitHtml === "function" ? hoeWerktDitHtml("vanzelf-werken", "Hoe werkt je werkmoment?") : ""}
      ${klaarRegelsHtml(kc)}</section>
    ${kc.stil || !vaker ? stappenbladHtml(ctx, false) : ""}
    ${vaker ? stappenbladHtml(ctx, true) : ""}
    <p><a class="detail-link" href="#/vaste-taken">← Je vaste taken</a></p>`;
  el.onclick = async (e) => {
    // Op deze pagina staat het stappenblad er al: dan erheen, niet "opnieuw openen".
    const naar = e.target.closest && e.target.closest('a.kc-actie[href="#/klaar"]');
    if (naar) {
      e.preventDefault();
      const kop = el.querySelector(".kc-stappen h2");
      if (kop) { kop.setAttribute("tabindex", "-1"); kop.scrollIntoView({ block: "start", behavior: "smooth" }); kop.focus({ preventScroll: true }); }
      return;
    }
    const k = e.target.closest && e.target.closest("[data-vt-kopieer]");
    if (!k) return;
    const gelukt = await kopieerTekst(k.getAttribute("data-vt-kopieer"));
    meld(gelukt ? "Gekopieerd. Plak het in Claude." : "Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.");
  };
}

/* De samenvattingsregel bovenaan Vaste taken: één tik naar de hele check. */
function klaarRegelHtml(ctx) {
  const kc = klaarCheck(ctx);
  const s = klaarSamenvatting(kc);
  const toon = kc.stil ? "nee" : kc.ok === kc.totaal ? "ok" : "let";
  return `<a class="kc-samenvatting kc-${toon}" href="#/klaar"><strong>${esc(s.kop)}</strong><span>${esc(s.sub)}</span></a>`;
}

/* Voor jou: staat je team stil, dan is dat het eerste wat je hoort te zien. */
function stilKaartHtml(ctx) {
  const kc = klaarCheck(ctx);
  if (!kc.stil) return "";
  const regel = kc.regels.find(r => (r.id === "werkt" || r.id === "aan") && r.k === "nee");
  return `<div class="vj-stil" role="status"><strong>Je team staat stil.</strong> ${esc(regel ? regel.tekst : "")}
    <a class="kc-actie" href="#/klaar">Zo regel je het in 2 minuten →</a></div>`;
}

if (typeof module !== "undefined") {
  module.exports = { renderVasteTaken, vasteTakenHtml, taakStatus, weekTelling, werkdagenNa, ritmeKeuzes, RITME_KLANTTAAL,
    klaarCheck, klaarSamenvatting, renderKlaar, klaarRegelHtml, stilKaartHtml, werkmomentSporen, WERKMOMENT_OPDRACHT };
}
