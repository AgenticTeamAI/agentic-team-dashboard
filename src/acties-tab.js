/* f48 — de Acties-tab: wie is aan zet?
 *
 * Acties zaten tussen zevenentwintig domeinen in de Data-tab, als tabel of
 * statusbord. Maar de vraag die een klant stelt is niet "welke status", het is
 * "ligt dit bij mij of bij mijn team?". Daarom vier banen — Jij · Je team ·
 * Wacht · Afgerond — met daaronder wat bij een collega ligt, wat van niemand
 * is, en wat niet helemaal klopt. De indeling komt uit baanVan() (voor-jou.js):
 * elke actie staat in precies één baan, en de baan Jij is exact de werkbak van
 * Voor jou, met dezelfde nummers.
 *
 * Elke rij opent het item-blad (#/acties/<id>). Zoeken gaat ook door wat je
 * team schreef (de Toelichting); de chip "Klaargezet door je team" is het
 * archief van alles wat een agent voor je klaarzette (f44, terugvindbaar). De
 * gewone tabel met alle velden en het statusbord staan nog steeds onder
 * Gegevens › Acties.
 *
 * Op de telefoon zie je één baan tegelijk, met een keuze erboven; op een breed
 * scherm staan ze naast elkaar.
 *
 * Verplaatsen: slepen naar een andere baan, of "Verplaats" op de rij (voor
 * toetsenbord en telefoon — slepen alleen is geen bediening). Naar Je team
 * vraagt "aan wie?", naar Wacht "tot wanneer?"; naar Jij en Afgerond gebeurt
 * het meteen, met ongedaan maken. De patches zijn die van de afhandelknoppen
 * (AFHANDEL), zodat i25 hier precies zo geldt: afronden laat Afgerond door
 * leeg, heropenen laat Afgerond op staan. */

let actiesZoek = "";
let actiesArchief = false;
let actiesBaan = "jij";

const BAAN_KOP = {
  jij: { teken: "●", titel: "Jij", leeg: "Niets dat op jou wacht." },
  team: { teken: "◐", titel: "Je team", leeg: "Je team heeft nu niets onder handen." },
  wacht: { teken: "○", titel: "Wacht", leeg: "Er wacht niets." },
  afgerond: { teken: "✓", titel: "Afgerond", leeg: "Nog niets afgerond." },
};
const AFGEROND_TONEN = 15;
const VERPLAATS_BANEN = ["jij", "team", "wacht", "afgerond"];
const VERPLAATS_LABEL = { jij: "Naar mij", team: "Naar je team", wacht: "Laten wachten", afgerond: "Afgerond" };

/* Wat er verandert als je een actie naar een baan verplaatst. `c` zoals bij
 * AFHANDEL: {ik, schema, nu, specialist, datum}. null = kan zo niet. */
function verplaatsPatch(rij, van, naar, c) {
  if (naar === "afgerond") return AFHANDEL.klaar(rij, c);
  if (naar === "team") return c.specialist ? AFHANDEL.geefAan(rij, c) : null;
  if (naar === "jij") {
    if (!c.ik) return null;
    if (van === "afgerond") return AFHANDEL.heropen(rij, c);
    const patch = { Eigenaar: c.ik, Status: VJ_OPEN };
    if (getField(rij, "Wachten tot")) patch["Wachten tot"] = null;
    return { patch, melding: "Staat nu bij jou." };
  }
  if (naar === "wacht") {
    return { patch: { Status: VJ_WACHT, "Wachten tot": c.datum || null },
      melding: c.datum ? `Wacht tot ${vjDatumKort(c.datum)}. Daarna komt het vanzelf terug.` : "Wacht, zonder datum." };
  }
  return null;
}

/* De vervolgvraag, onder de rij. Zonder `naar`: eerst kiezen waarheen. */
function verplaatsPaneelHtml(ctx, rij, van, naar) {
  const annuleer = `<button type="button" class="knop-mini" data-verplaats-annuleer>Annuleren</button>`;
  if (!naar) {
    return `<div class="verplaats-paneel" role="group" aria-label="Verplaats naar"><p class="footnote">Verplaats naar:</p>
      <div class="verplaats-keuzes">${VERPLAATS_BANEN.filter(b => b !== van).map(b =>
        `<button type="button" class="knop-mini bedien-knop" data-verplaats-naar="${b}">${esc(VERPLAATS_LABEL[b])}</button>`).join("")}${annuleer}</div></div>`;
  }
  if (naar === "team") {
    const sp = typeof beschikbareSpecialisten === "function" ? beschikbareSpecialisten(ctx) : [];
    // De drie die het vaakst werken als knop, de rest in een lijst: een smalle baan is geen menu.
    const rest = sp.slice(3);
    return `<div class="verplaats-paneel" role="group" aria-label="Aan wie?"><p class="footnote">Naar je team: aan wie?</p>
      <div class="verplaats-keuzes">${sp.slice(0, 3).map(s => `<button type="button" class="knop-mini bedien-knop" data-verplaats-specialist="${esc(s.naam)}">${esc(s.naam)}</button>`).join("")}
      ${rest.length ? `<select data-verplaats-ander aria-label="Iemand anders"><option value="">Iemand anders…</option>${rest.map(s => `<option value="${esc(s.naam)}">${esc(s.naam)}</option>`).join("")}</select>` : ""}${annuleer}</div></div>`;
  }
  if (naar === "wacht") {
    return `<div class="verplaats-paneel" role="group" aria-label="Tot wanneer?"><p class="footnote">Laten wachten: tot wanneer? Daarna komt het vanzelf terug.</p>
      <div class="verplaats-keuzes">${datumKeuzes(ctx.today || new Date()).map(d => `<button type="button" class="knop-mini bedien-knop" data-verplaats-datum="${d.datum}">${esc(d.label)}</button>`).join("")}
      <button type="button" class="knop-mini bedien-knop" data-verplaats-datum="">Zonder datum</button>${annuleer}</div></div>`;
  }
  return "";
}

function actiesTabBeschikbaar(ctx) {
  return !!(ctx && ctx.bundle && rows(ctx.bundle, "acties"));
}

function actieZoekTekst(rij) {
  return ["Actie", "Toelichting", "Eigenaar", "Agent", "Aangemaakt door", "Correctie"]
    .map(v => dataCelTekst(getField(rij, v))).join(" ").toLowerCase();
}

function actiesFilter(ctx) {
  const q = actiesZoek.trim().toLowerCase();
  return (rij) => {
    if (actiesArchief && !agentWeergaveNaam(ctx.schema, getField(rij, "Aangemaakt door"))) return false;
    return !q || actieZoekTekst(rij).includes(q);
  };
}

function baanRijHtml(ctx, rij, nr, baan) {
  const nu = ctx.today || new Date();
  const namen = agentNamen(ctx.schema);
  const soort = soortVan(rij, namen, nu);
  const titel = detailTitel(ctx.schema.datadomeinen.acties, rij);
  const eigenaar = dataCelTekst(getField(rij, "Eigenaar"));
  const meta = [];
  meta.push(`<span class="soort-pil">${esc(SOORT_LABEL[soort] || "")}</span>`);
  if (isTeLaat(rij, namen, nu)) meta.push(`<span class="pil-laat">te laat</span>`);
  if (soort === "wacht" || (getField(rij, "Wachten tot") && wachtInToekomst(rij, nu))) {
    meta.push(`<span>tot ${esc(vjDatumKort(getField(rij, "Wachten tot")))}</span>`);
  } else if (soort === "klaar") {
    const op = getField(rij, "Afgerond op");
    if (op) meta.push(`<span>${esc(vjDatumKort(op))}</span>`);
    if (isNietDoen(rij)) meta.push(`<span>niet gedaan</span>`);
  } else if (getField(rij, "Deadline")) {
    meta.push(`<span>deadline ${esc(vjDatumKort(getField(rij, "Deadline")))}</span>`);
  }
  if (eigenaar) meta.push(`<span class="baan-wie">${esc(eigenaar)}</span>`);
  const kan = baan && rij.__entryId && magDomeinBewerken(ctx, "acties").ok;
  return `<li class="baan-rij${soort === "team" ? " baan-rij-team" : ""}"${kan ? ` draggable="true" data-sleep-actie="${esc(rij.__entryId)}" data-van-baan="${baan}"` : ""}>
    ${nr ? `<span class="vj-nr" aria-hidden="true">${nr}</span>` : ""}
    <div class="baan-rij-inhoud"><a class="baan-titel" href="#/acties/${encodeURIComponent(rij.__entryId)}">${nr ? `<span class="visueel-verborgen">Nummer ${nr}: </span>` : ""}${esc(titel)}</a>
    <p class="baan-meta">${meta.join("")}${kan ? `<button type="button" class="knop-mini verplaats-knop" data-verplaats="${esc(rij.__entryId)}" aria-label="Verplaats ${esc(titel)}">Verplaats</button>` : ""}</p>
    <div data-verplaats-slot></div></div>
  </li>`;
}

function baanHtml(ctx, sleutel, lijst, extra) {
  const kop = BAAN_KOP[sleutel];
  const nummers = sleutel === "jij" && typeof vjGenummerd === "function";
  const volgorde = nummers ? vjGenummerd(ctx.bundle, lijst) : lijst;
  const tonen = sleutel === "afgerond" && !extra.alles ? volgorde.slice(0, AFGEROND_TONEN) : volgorde;
  const nr = (r) => (nummers && typeof vjNummering !== "undefined" ? vjNummering.map.get(r.__entryId) : null);
  return `<section class="baan baan-${sleutel}" data-baan="${sleutel}" aria-labelledby="baan-kop-${sleutel}">
    <h3 id="baan-kop-${sleutel}"><span aria-hidden="true">${kop.teken}</span> ${kop.titel} <span class="baan-telling">${lijst.length}</span></h3>
    ${tonen.length ? `<ol class="baan-lijst">${tonen.map(r => baanRijHtml(ctx, r, nr(r), sleutel)).join("")}</ol>` : `<p class="footnote">${kop.leeg}</p>`}
    ${sleutel === "afgerond" && volgorde.length > tonen.length ? `<button type="button" class="knop-mini bedien-knop" data-afgerond-alles>Toon alle ${volgorde.length}</button>` : ""}
    ${extra.onder || ""}
  </section>`;
}

function vakHtml(ctx, titel, lijst, uitleg, metKnop) {
  if (!lijst.length) return "";
  const rijen = lijst.map(r => {
    const rij = baanRijHtml(ctx, r, null);
    return metKnop ? rij.replace("</li>", `<button type="button" class="knop-mini bedien-knop" data-zet-bij-mij="${esc(r.__entryId)}">Zet bij mij</button></li>`) : rij;
  }).join("");
  return `<details class="blad-uitklap acties-vak"><summary>${esc(titel)} (${lijst.length})</summary>
    <p class="footnote">${esc(uitleg)}</p><ol class="baan-lijst">${rijen}</ol></details>`;
}

function actiesBanenHtml(ctx, opties) {
  const banen = banenVan(ctx.bundle, ctx.schema, { ik: vjIk(ctx), nu: ctx.today || new Date() });
  if (!banen) return `<p class="footnote">Je acties zijn hier niet te tonen: de agentlijst ontbreekt in deze versie.</p>`;
  const f = actiesFilter(ctx);
  const b = {};
  for (const k of BANEN) b[k] = banen[k].filter(f);
  const later = b["jij-later"].length
    ? `<details class="blad-uitklap baan-later"><summary>Later op je lijst (${b["jij-later"].length})</summary>
        <ol class="baan-lijst">${b["jij-later"].map(r => baanRijHtml(ctx, r, null, "jij")).join("")}</ol></details>` : "";
  const afgerondDezeWeek = (() => {
    const nu = ctx.today || new Date();
    const maandag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - ((nu.getDay() + 6) % 7));
    return b.afgerond.filter(r => { const d = parseDateField(getField(r, "Afgerond op")); return d && d >= maandag; }).length;
  })();
  const keuze = ["jij", "team", "wacht", "afgerond"].map(k =>
    `<button type="button" role="tab" aria-selected="${actiesBaan === k}" data-baan-kies="${k}">${BAAN_KOP[k].titel} <span class="baan-telling">${b[k].length}</span></button>`).join("");
  return `
    <div class="baan-keuze" role="tablist" aria-label="Kies een baan">${keuze}</div>
    <div class="banen" data-baan-actief="${actiesBaan}">
      ${baanHtml(ctx, "jij", b.jij, { onder: later })}
      ${baanHtml(ctx, "team", b.team, {})}
      ${baanHtml(ctx, "wacht", b.wacht, {})}
      ${baanHtml(ctx, "afgerond", b.afgerond, { alles: opties.alles,
        onder: afgerondDezeWeek ? `<p class="footnote">${afgerondDezeWeek} deze week</p>` : "" })}
    </div>
    <div class="acties-vakken">
      ${vakHtml(ctx, "Bij collega's", b.collega, "Op naam van een collega. Open er een om hem over te nemen of terug te geven.")}
      ${vakHtml(ctx, "Zonder eigenaar", b.zonder, "Van niemand. Geef het aan jezelf, een collega of je team via het blad.")}
      ${vakHtml(ctx, "Klopt niet helemaal", b["klopt-niet"], "Er is niemand echt aan zet, bijvoorbeeld een check op naam van een agent.", magDomeinBewerken(ctx, "acties").ok)}
    </div>`;
}

function renderActiesTab(el, ctx) {
  if (!actiesTabBeschikbaar(ctx)) {
    el.innerHTML = `<p>Je acties wonen niet in je werkruimte, of er zijn er nog geen.</p>
      <a class="detail-link" href="#/data">Naar je gegevens →</a>`;
    return;
  }
  let alles = false;
  el.innerHTML = `<div class="acties-kop">
      <input type="search" data-acties-zoek placeholder="Zoek, ook in wat je team schreef" aria-label="Zoek in je acties" value="${esc(actiesZoek)}">
      <button type="button" class="status-chip van-team${actiesArchief ? " actief" : ""}" data-acties-archief aria-pressed="${actiesArchief}">🤝 Klaargezet door je team</button>
      ${typeof opdrachtKnopHtml === "function" ? opdrachtKnopHtml(ctx, { tekst: "Opdracht geven" }) : ""}
      <a class="detail-link" href="#/data/acties">Tabel en bord →</a>
      ${typeof hoeWerktDitHtml === "function" ? hoeWerktDitHtml("wie-aan-zet", "Wie is aan zet?") : ""}
    </div>
    ${typeof vjNaamRegelHtml === "function" ? vjNaamRegelHtml(ctx) : ""}
    <div data-acties-banen>${actiesBanenHtml(ctx, { alles })}</div>`;
  if (typeof wireVjNaam === "function") wireVjNaam(el, ctx);
  const banenEl = el.querySelector("[data-acties-banen]");
  const herteken = () => { banenEl.innerHTML = actiesBanenHtml(ctx, { alles }); };

  el.querySelector("[data-acties-zoek]").addEventListener("input", (e) => { actiesZoek = e.target.value; herteken(); });

  // ── Verplaatsen: slepen, of de knop op de rij ──
  let verplaatsen = null; // { id, van, naar, li }
  const rijMet = (id) => (dataRijenVan(ctx, "acties") || []).find(r => r.__entryId === id) || null;
  const toonPaneel = (li, id, van, naar) => {
    for (const s of el.querySelectorAll("[data-verplaats-slot]")) s.innerHTML = "";
    const rij = rijMet(id);
    if (!rij) return;
    verplaatsen = { id, van, naar, li };
    const slot = li.querySelector("[data-verplaats-slot]");
    slot.innerHTML = verplaatsPaneelHtml(ctx, rij, van, naar);
    const eerste = slot.querySelector("button");
    if (eerste) eerste.focus();
    if (slot.scrollIntoView) slot.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const voerUit = async (keuze) => {
    const v = verplaatsen;
    const rij = v && rijMet(v.id);
    if (!rij) return;
    const slot = v.li.querySelector("[data-verplaats-slot]");
    const ik = v.naar === "jij" ? await naamVoorSchrijfactieIn(slot, ctx.bron, {}) : (mijnNaam(ctx.bron) || null);
    const plan = verplaatsPatch(rij, v.van, v.naar, { ik, schema: ctx.schema, nu: ctx.today || new Date(), specialist: keuze.specialist, datum: keuze.datum });
    if (!plan) { slot.innerHTML = ""; return; }
    v.li.setAttribute("aria-busy", "true");
    try {
      const vorige = vorigeWaarden(rij, plan.patch);
      const antwoord = await snelWijzig(ctx, "acties", rij.__entryId, plan.patch);
      verplaatsen = null;
      await verwerkAntwoord(ctx, "acties", antwoord, { focus: "[data-acties-zoek]" });
      meld(plan.melding, { actie: ongedaanPatch(ctx, "acties", rij.__entryId, vorige) });
    } catch (fout) {
      v.li.removeAttribute("aria-busy");
      meld("Niet gelukt: " + ((fout && fout.message) || "probeer het opnieuw."), { fout: true });
    }
  };
  const naarBaan = (li, id, van, naar) => {
    if (!naar || naar === van) return;
    if (naar === "team" || naar === "wacht") { toonPaneel(li, id, van, naar); return; }
    verplaatsen = { id, van, naar, li };
    voerUit({});
  };
  function verplaatsKlik(e) {
    const t = e.target;
    const knop = t.closest("[data-verplaats]");
    if (knop) { const li = knop.closest("li"); toonPaneel(li, knop.getAttribute("data-verplaats"), li.getAttribute("data-van-baan"), null); return true; }
    if (t.closest("[data-verplaats-annuleer]")) {
      const li = verplaatsen && verplaatsen.li;
      t.closest("[data-verplaats-slot]").innerHTML = ""; verplaatsen = null;
      const terug = li && li.querySelector("[data-verplaats]");
      if (terug) terug.focus();
      return true;
    }
    const naar = t.closest("[data-verplaats-naar]");
    if (naar && verplaatsen) { naarBaan(verplaatsen.li, verplaatsen.id, verplaatsen.van, naar.getAttribute("data-verplaats-naar")); return true; }
    const sp = t.closest("[data-verplaats-specialist]");
    if (sp && verplaatsen) { voerUit({ specialist: sp.getAttribute("data-verplaats-specialist") }); return true; }
    const dat = t.closest("[data-verplaats-datum]");
    if (dat && verplaatsen) { voerUit({ datum: dat.getAttribute("data-verplaats-datum") || null }); return true; }
    return false;
  }
  let sleepLi = null;
  el.addEventListener("change", (e) => {
    const ander = e.target.closest && e.target.closest("[data-verplaats-ander]");
    if (ander && ander.value && verplaatsen) voerUit({ specialist: ander.value });
  });
  el.addEventListener("dragstart", (e) => {
    const li = e.target.closest && e.target.closest("[data-sleep-actie]");
    if (!li) return;
    sleepLi = li;
    li.classList.add("sleept");
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", li.getAttribute("data-sleep-actie")); }
  });
  el.addEventListener("dragend", () => {
    if (sleepLi) sleepLi.classList.remove("sleept");
    for (const b of el.querySelectorAll(".sleep-over")) b.classList.remove("sleep-over");
    sleepLi = null;
  });
  el.addEventListener("dragover", (e) => {
    const baan = e.target.closest && e.target.closest("section[data-baan]");
    if (!baan || !sleepLi || baan.getAttribute("data-baan") === sleepLi.getAttribute("data-van-baan")) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    baan.classList.add("sleep-over");
  });
  el.addEventListener("dragleave", (e) => {
    const baan = e.target.closest && e.target.closest("section[data-baan]");
    if (baan && !baan.contains(e.relatedTarget)) baan.classList.remove("sleep-over");
  });
  el.addEventListener("drop", (e) => {
    const baan = e.target.closest && e.target.closest("section[data-baan]");
    if (!baan || !sleepLi) return;
    e.preventDefault();
    baan.classList.remove("sleep-over");
    const li = sleepLi;
    sleepLi = null;
    li.classList.remove("sleept");
    naarBaan(li, li.getAttribute("data-sleep-actie"), li.getAttribute("data-van-baan"), baan.getAttribute("data-baan"));
  });
  el.addEventListener("click", (e) => {
    const archief = e.target.closest("[data-acties-archief]");
    if (archief) {
      actiesArchief = !actiesArchief;
      archief.classList.toggle("actief", actiesArchief);
      archief.setAttribute("aria-pressed", String(actiesArchief));
      herteken();
      return;
    }
    const kies = e.target.closest("[data-baan-kies]");
    if (kies) {
      actiesBaan = kies.getAttribute("data-baan-kies");
      herteken();
      const knop = el.querySelector(`[data-baan-kies="${actiesBaan}"]`);
      if (knop) knop.focus();
      return;
    }
    if (e.target.closest("[data-afgerond-alles]")) { alles = true; herteken(); return; }
    if (verplaatsKlik(e)) return;
    const zet = e.target.closest("[data-zet-bij-mij]");
    if (zet) {
      const rij = (dataRijenVan(ctx, "acties") || []).find(r => r.__entryId === zet.getAttribute("data-zet-bij-mij"));
      if (!rij) return;
      const li = zet.closest("li");
      let slot = li.querySelector("[data-naam-slot]");
      if (!slot) { slot = document.createElement("div"); slot.setAttribute("data-naam-slot", "vak"); li.appendChild(slot); }
      voerAfhandelingUit(ctx, "acties", rij, "zetBijMij", {}, { naamSlot: slot, bezig: li, knoppen: [zet], focus: "[data-acties-zoek]" });
    }
  });
}

function _resetActiesTab() { actiesZoek = ""; actiesArchief = false; actiesBaan = "jij"; }

if (typeof module !== "undefined") {
  module.exports = { renderActiesTab, actiesTabBeschikbaar, actiesBanenHtml, _resetActiesTab, verplaatsPatch };
}
