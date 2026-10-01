/* Dashboard v2 — Gegevens: overzicht → lijst → één rij als pagina.
 *
 * Het ontwerp werkte Organisaties uit; hier krijgt elk soort gegevens die
 * opbouw. Welke velden er zijn, komt uit de registry; wat eraan hangt, uit de
 * relatievelden. Wijzigen gaat per veld (PATCH, de rest blijft staan), met
 * ongedaan maken. Acties en vaste taken hebben hun eigen plek (Acties, Team). */

const DOMEIN_KLANTTAAL = {
  organisaties: ["Organisaties", "organisatie"], contactpersonen: ["Contactpersonen", "contactpersoon"],
  interacties: ["Gesprekken", "gesprek"], sales_funnel: ["Deals", "deal"], projecten: ["Projecten", "project"],
  offertes: ["Offertes", "offerte"], tijdregistratie: ["Uren", "uurregel"], notities: ["Notities", "notitie"],
  product_catalogus: ["Producten en diensten", "product"], content_kalender: ["Contentkalender", "contentitem"],
  lessen_inzichten: ["Lessen en inzichten", "les"], klantsucces: ["Klantsucces", "klantsuccesregel"],
  klantbewijs: ["Klantbewijs", "klantbewijs"], dagverslagen: ["Dagverslagen", "dagverslag"],
  contracten: ["Contracten", "contract"], besluiten: ["Besluiten", "besluit"], toolstack: ["Tools", "tool"],
  financieel_overzicht: ["Financieel overzicht", "regel"], productbacklog: ["Productbacklog", "backlogitem"],
  delivery_rugzak: ["Delivery-rugzak", "item"], autoriteit: ["Autoriteit", "item"],
  seo_vraagonderzoek: ["Zoekvragen", "zoekvraag"], vindbaarheid_audit: ["Vindbaarheid", "meting"], geo_metingen: ["AI-vindbaarheid", "meting"],
  pipeline_weekreview: ["Pipeline-weekreviews", "weekreview"], acties: ["Acties", "actie"], ritmetaken: ["Vaste taken", "vaste taak"],
};
const GEGEVENS_GROEPEN = [
  ["Klanten en relaties", ["organisaties", "contactpersonen", "interacties", "klantsucces", "klantbewijs"]],
  ["Verkoop", ["sales_funnel", "offertes", "product_catalogus", "pipeline_weekreview"]],
  ["Levering", ["projecten", "tijdregistratie", "delivery_rugzak"]],
  ["Zichtbaarheid", ["content_kalender", "autoriteit", "seo_vraagonderzoek", "vindbaarheid_audit", "geo_metingen"]],
  ["Bedrijfsvoering", ["financieel_overzicht", "contracten", "toolstack", "besluiten"]],
  ["Wat je team onthoudt", ["notities", "lessen_inzichten", "dagverslagen", "productbacklog"]],
];
const EIGEN_PLEK = ["acties", "ritmetaken"];
function domeinLabel(k) { const d = CTX && CTX.schema.datadomeinen[k]; return (DOMEIN_KLANTTAAL[k] || [])[0] || (d && d.naam) || k; }
function domeinEnkel(k) { return (DOMEIN_KLANTTAAL[k] || [])[1] || domeinLabel(k).toLowerCase(); }
function domeinVan(k) { return CTX && CTX.schema.datadomeinen[k]; }
function rijenVan(k) { return dataRijenVan(CTX, k) || []; }
function rijVan(k, id) { return rijenVan(k).find(r => r.__entryId === id) || null; }
function rijTitel(k, id) { const d = domeinVan(k); const r = d && rijVan(k, id); return r ? detailTitel(d, r) : null; }
function browsbaar(k) { return !!domeinVan(k) && !(k in DATA_NIET_IN_BUNDEL); }

/* Twee of drie korte kenmerken onder de naam: keuzes, een plaats, een datum. */
function rijMeta(k, r) {
  const uit = [];
  for (const v of dataVelden(domeinVan(k))) {
    if (uit.length >= 3) break;
    if (v.type === "titel" || v.type === "relatie" || v.type === "checkbox" || v.type === "url") continue;
    const t = dataCelTekst(getField(r, v.naam));
    if (!t || t.length > 40 || t.indexOf("\n") !== -1) continue;
    if (v.type === "select" || v.type === "datum" || /plaats|functie|type|status|fase/i.test(v.naam)) uit.push(v.type === "datum" ? datumKort(t) : t);
  }
  return uit.join(" · ");
}
/* Acties die via een relatieveld aan deze rij hangen. */
function actiesBij(k, id) { return S.data.acties.filter(a => a.hoort.some(h => h.domein === k && h.id === id)); }
function dealsBij(orgId) {
  const d = domeinVan("sales_funnel"); if (!d) return [];
  const veld = dataVelden(d).find(v => v.naam === "Organisatie" && v.type === "relatie");
  if (!veld) return [];
  return rijenVan("sales_funnel").filter(r => verwijstNaar(getField(r, "Organisatie"), veld, "organisaties", orgId));
}
function dealLoopt(r) { const s = dataCelTekst(getField(r, "Opvolg Status")); return !/gewonnen|verloren/i.test(s); }
function dealWaarde(r) { return Number(getField(r, "Verwachte Omzet")) || 0; }

function renderGegevens() {
  const p = parts();
  if (toegang() === "notion" && !p[1]) {
    const naam = bronVan(CTX, "organisaties").naam || bronVan(CTX, "acties").naam || "Notion";
    return `<div class="inhoud">${renderBalk()}<h2 class="titel">Gegevens</h2><section class="vak" style="display:flex;flex-direction:column;gap:8px"><p><b>Je klanten, deals en contactpersonen staan in ${esc(naam)}.</b> Daar bekijk en wijzig je ze.${rijenVan("organisaties").length ? " Wat er ook in je werkruimte staat, zie je hieronder." : ""}</p>${hoe("notion")}</section>${groepenHtml()}</div>`;
  }
  if (p[1] && p[2]) return renderRijPagina2(p[1], decodeURIComponent(p[2]));
  if (p[1]) return renderLijst(p[1]);
  return `<div class="inhoud">${renderBalk()}<h2 class="titel">Gegevens</h2><p class="stil klein">Alles wat in je werkruimte staat. Acties vind je onder <button class="link" data-act="go" data-r="/acties">Acties</button>, je vaste taken onder <button class="link" data-act="go" data-r="/team/vaste-taken">Team</button>.</p>
    ${groepenHtml()}
    <section class="vak" style="display:flex;flex-direction:column;gap:8px"><h2 class="vakkop">Alles meenemen</h2><p class="klein">Download je hele werkruimte als bestand. Dat is van jou; je kunt het altijd ophalen.</p><div class="rijtje"><button class="knop" data-act="export" data-v="markdown">${ic("pijl-op", "klein")}Als Markdown</button><button class="knop" data-act="export" data-v="json">Als JSON</button></div></section></div>`;
}
function groepenHtml() {
  const alle = Object.keys(CTX.schema.datadomeinen).filter(k => browsbaar(k) && !EIGEN_PLEK.includes(k));
  const ingedeeld = new Set(GEGEVENS_GROEPEN.flatMap(g => g[1]));
  const groepen = GEGEVENS_GROEPEN.map(([n, l]) => [n, l.filter(k => alle.includes(k))]).concat([["Overig", alle.filter(k => !ingedeeld.has(k))]]).filter(g => g[1].length);
  return `<div class="groepen">${groepen.map(([g, l]) => `<section class="vak" style="display:flex;flex-direction:column;gap:6px"><h2 class="vakkop">${esc(g)}</h2>${l.map(k => {
    const n = rijenVan(k).length; const b = bronVan(CTX, k);
    if (!n && b.toestand === "elders") return `<div class="regel uitgegrijsd" style="min-height:44px;padding:8px 12px"><span>${esc(domeinLabel(k))}</span><span class="klein stil">staat in ${esc(b.naam)}</span></div>`;
    return `<button class="regel ${n ? "" : "uitgegrijsd"}" style="min-height:44px;padding:8px 12px" data-act="go" data-r="/gegevens/${k}"><span>${esc(domeinLabel(k))}</span><span class="rijtje"><span class="mono stil">${n || "nog leeg"}</span>${ic("chev")}</span></button>`;
  }).join("")}</section>`).join("")}</div>`;
}

/* ---------- De lijst ---------- */
function filterVeld(k) {
  const v = dataVelden(domeinVan(k)).find(x => x.type === "select" && (x.opties || []).length);
  if (!v) return null;
  const tel = {};
  for (const r of rijenVan(k)) { const w = dataCelTekst(getField(r, v.naam)); if (w) tel[w] = (tel[w] || 0) + 1; }
  const top = Object.keys(tel).sort((a, b) => tel[b] - tel[a]).slice(0, 4);
  return top.length >= 2 ? { veld: v.naam, waarden: top } : null;
}
function renderLijst(k) {
  const d = domeinVan(k);
  if (!d || !browsbaar(k)) return `<div class="inhoud"><button class="link" data-act="go" data-r="/gegevens">${ic("links", "klein")} Gegevens</button><section class="leeg"><h3>Dit soort gegevens kennen we niet</h3><p class="stil">Misschien hoort de link bij een andere werkruimte.</p></section></div>`;
  const g = S.ui.gegevens; const z = (g.zoek || "").trim().toLowerCase(); const fv = filterVeld(k); const f = g.filter && fv && fv.waarden.includes(g.filter) ? g.filter : "";
  const lijst = rijenVan(k).filter(r => (!f || dataCelTekst(getField(r, fv.veld)) === f) && (!z || (detailTitel(d, r) + " " + rijMeta(k, r)).toLowerCase().includes(z)))
    .sort((a, b) => detailTitel(d, a).localeCompare(detailTitel(d, b), "nl"));
  const kan = magSchrijven(k); const b = bronVan(CTX, k);
  const rijen = lijst.slice(0, 300).map(r => {
    const id = r.__entryId; const acts = actiesBij(k, id); const aanJou = acts.filter(a => hoortBijMens(a) && vanMij(a)).length;
    const deals = k === "organisaties" ? dealsBij(id).filter(dealLoopt) : [];
    const som = deals.reduce((s, x) => s + dealWaarde(x), 0);
    return `<button class="regel orgrij" data-act="go" data-r="/gegevens/${k}/${esc(encodeURIComponent(id))}"><span class="orglogo klein" aria-hidden="true">${esc(initialen(detailTitel(d, r)))}</span>
      <span class="rl"><b>${esc(detailTitel(d, r))}</b><span>${esc(rijMeta(k, r))}</span></span>
      <span class="rechts">${aanJou ? `<span class="pil jij">● ${aanJou} wacht op jou</span>` : ""}${deals.length ? `<span class="klein stil">${telwoord(deals.length, "deal", "deals")}${som ? " · " + euro(som) : ""}</span>` : ""}</span>${ic("chev")}</button>`;
  }).join("");
  return `<div class="inhoud">${renderBalk()}<button class="link" data-act="go" data-r="/gegevens">${ic("links", "klein")} Gegevens</button>
    <div class="tussen"><h2 class="titel">${esc(domeinLabel(k))}</h2>${kan ? `<button class="knop" data-act="sheet" data-type="nieuw" data-k="${k}">${ic("plus", "klein")}Nieuwe ${esc(domeinEnkel(k))}</button>` : ""}</div>
    <p class="klein stil">${b.toestand === "elders" ? "Woont in " + esc(b.naam) + "; hier staan alleen de losse rijen uit je werkruimte" : "Woont in je werkruimte"} · ${telwoord(rijenVan(k).length, domeinEnkel(k), domeinLabel(k).toLowerCase())}</p>
    ${rijenVan(k).length > 6 ? `<div class="zoek">${ic("zoek")}<input type="search" id="gegevens-zoek" data-input="gzoek" placeholder="Zoek in ${esc(domeinLabel(k).toLowerCase())}" value="${esc(g.zoek || "")}" aria-label="Zoek in ${esc(domeinLabel(k).toLowerCase())}"></div>` : ""}
    ${fv ? `<div class="seg" role="group" aria-label="${esc(fv.veld)}"><button data-act="gf" data-v="" aria-pressed="${!f}">Alle</button>${fv.waarden.map(w => `<button data-act="gf" data-v="${esc(w)}" aria-pressed="${f === w}">${esc(w)}</button>`).join("")}</div>` : ""}
    <div class="kol" style="gap:8px">${rijen || `<p class="bordleeg">${z || f ? "Niets gevonden" + (z ? " voor ‘" + esc(z) + "’" : "") + "." : "Nog niets. " + (kan ? "Voeg de eerste toe, of vraag je team in Claude." : "Je team vult dit aan als het voor je werkt.")}</p>`}
    ${lijst.length > 300 ? `<p class="klein stil">De eerste 300 van ${lijst.length}. Zoek om de rest te vinden.</p>` : ""}</div></div>`;
}

/* veldInvoerHtml (data-bewerken.js) geeft het veld geen naam; die zetten we erop. */
function metNaam(html, naam, id) { return html.replace(/<(input|select|textarea)(?![^>]*aria-label)/, `<$1 aria-label="${esc(naam)}"${id ? ` id="${esc(id)}"` : ""}`); }

/* ---------- Eén rij als pagina ---------- */
function veldWaardeHtml(v, w) {
  const t = dataCelTekst(w);
  if (!t) return '<span class="stil">nog leeg</span>';
  if (v.type === "datum") return esc(datumKort(t) || t);
  if (v.type === "url" && /^https?:\/\//i.test(t)) return `<a class="link" href="${esc(t)}" target="_blank" rel="noopener noreferrer" style="min-height:0;font-weight:500">${esc(t.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`;
  if (v.type === "email") return `<span class="mono" style="user-select:all">${esc(t)}</span>`;
  if (v.type === "relatie") return relatiesVanVeld(v, w).map(relatieKnop).join(" ") || esc(t);
  if (v.type === "getal" && /omzet|bedrag|waarde|tarief|prijs/i.test(v.naam)) return esc(euro(w));
  return esc(t);
}
function relatiesVanVeld(v, w) {
  const lijst = Array.isArray(w) ? w : (w ? [w] : []);
  return lijst.map(x => {
    const doel = v.naar === "*" ? (x && x.domein) : v.naar; const id = x && typeof x === "object" ? x.id : null;
    return { domein: doel, id, titel: (id && doel && rijTitel(doel, id)) || (x && typeof x === "object" ? x.titel : String(x || "")) };
  }).filter(x => x.titel);
}
function veldRij(k, r, v) {
  const e = S.ui.bewerk; const bewerk = e && e.k === k && e.id === r.__entryId && e.veld === v.naam;
  const w = getField(r, v.naam); const t = dataCelTekst(w);
  const lang = t && isLangeTekst(v, t);
  if (bewerk) return `<dt><span>${esc(v.naam)}</span></dt><dd class="inline-edit"><form class="rijtje" style="flex:1;align-items:flex-start" data-v2-veldform>${metNaam(veldInvoerHtml(v, w, CTX), v.naam, "veld-invoer")}<span class="rijtje"><button class="knop prim klein-knop" type="submit">Opslaan</button><button class="knop stil klein-knop" type="button" data-act="veld-annuleer">Annuleer</button></span>${e.fout ? `<span class="fout" role="alert">${esc(e.fout)}</span>` : ""}</form></dd>`;
  const wijzig = magSchrijven(k) && v.type !== "relatie" ? ` <button class="hoe wijzig" data-act="veld-wijzig" data-k="${k}" data-id="${esc(r.__entryId)}" data-v="${esc(v.naam)}" aria-label="${esc(v.naam)} wijzigen">wijzig</button>` : "";
  return `<dt>${esc(v.naam)}</dt><dd class="${lang ? "lang" : ""}">${lang ? `<span style="flex:1 1 100%">${esc(t)}</span>` : veldWaardeHtml(v, w)}${wijzig}</dd>`;
}
function lijstjeRij(k, r) {
  const d = domeinVan(k); const meta = rijMeta(k, r);
  const waarde = k === "sales_funnel" && dealWaarde(r) ? `<span class="mono">${euro(dealWaarde(r))}</span>` : "";
  return `<a href="#/gegevens/${k}/${esc(encodeURIComponent(r.__entryId))}" data-act="go" data-r="/gegevens/${k}/${esc(encodeURIComponent(r.__entryId))}"><span><b>${esc(detailTitel(d, r))}</b>${meta ? `<br><span class="klein stil">${esc(meta)}</span>` : ""}</span>${waarde}</a>`;
}
function renderRijPagina2(k, id) {
  const d = domeinVan(k);
  const r = d && browsbaar(k) ? rijVan(k, id) : null;
  const terug = `<button class="link" data-act="go" data-r="/gegevens/${esc(k)}">${ic("links", "klein")} ${esc(domeinLabel(k))}</button>`;
  if (!r) return `<div class="inhoud">${terug}<section class="leeg"><h3 id="rij-titel" tabindex="-1">Niet gevonden</h3><p class="stil">Deze ${esc(domeinEnkel(k))} staat niet (meer) in je werkruimte. Misschien is hij net verwijderd.</p></section></div>`;
  const titel = detailTitel(d, r); const kan = magSchrijven(k);
  // Wat ingevuld is, plus de paar velden die je meteen wilt weten; de rest van
  // de lege velden staat ingeklapt, zodat de pagina over déze rij gaat.
  const kern = new Set(["titel"].concat(VELDEN_NIEUW[k] || []));
  const bewerktVeld = S.ui.bewerk && S.ui.bewerk.k === k && S.ui.bewerk.id === id ? S.ui.bewerk.veld : null;
  const toon = (v) => v.type === "titel" || kern.has(v.naam) || v.naam === bewerktVeld || dataCelTekst(getField(r, v.naam)) !== "";
  const zichtbaar = dataVelden(d).filter(toon); const verborgen = dataVelden(d).filter(v => !toon(v));
  const acts = actiesBij(k, id); const open = acts.filter(a => a.status !== "Klaar"); const af = acts.filter(a => a.status === "Klaar");
  const aanJou = open.filter(a => hoortBijMens(a) && vanMij(a)); const bijTeamL = open.filter(a => soortVan(a) === "team");
  const teamWerk = acts.filter(a => isAgentSlug(a.door) || isAgentSlug(a.afgerondDoor));
  const agentsDeden = [...new Set(teamWerk.map(a => werkAgent(a) || a.afgerondDoor).filter(isAgentSlug))];
  const werkZin = teamWerk.length ? `Je team deed ${telwoord(teamWerk.length, "ding", "dingen")} voor ${esc(titel)}: ${agentsDeden.slice(0, 3).map(s => "<b>" + esc(deNaam(s)) + "</b>").join(", ")}.` : `Je team deed nog niets voor ${esc(titel)}.`;
  const deals = k === "organisaties" ? dealsBij(id) : []; const lopend = deals.filter(dealLoopt);
  const eig = tekstVan(r, "Eigenaar");
  const terugv = terugverwijzingen(CTX, k, id).filter(t => t.slug !== "acties" && t.slug !== "notities");
  const perDomein = new Map();
  for (const t of terugv) { const l = perDomein.get(t.slug) || []; for (const x of t.treffers) if (!l.includes(x)) l.push(x); perDomein.set(t.slug, l); }
  const toevoegbaar = new Set(rpToevoegDomeinen(CTX, k).map(x => x.slug));
  const VOORRANG = ["sales_funnel", "projecten", "contactpersonen", "interacties", "offertes"];
  for (const s of toevoegbaar) if (!perDomein.has(s) && VOORRANG.includes(s)) perDomein.set(s, []);
  const volgorde = [...perDomein.entries()].sort((x, y) => (VOORRANG.indexOf(x[0]) + 1 || 99) - (VOORRANG.indexOf(y[0]) + 1 || 99));
  const notitieInfo = notitieVeldVan(CTX); const notities = notitieInfo ? notitiesBij(CTX, k, id) : [];
  const aanvullen = kan && k === "organisaties" && kanSchrijven() && beschikbareSpecialisten(CTX).some(s => s.slug === "researcher");
  const plus = (slug) => kan && toevoegbaar.has(slug) ? `<button class="knop klein-knop" data-act="sheet" data-type="nieuw" data-k="${slug}" data-ouder="${esc(k)}" data-id="${esc(id)}">${ic("plus", "klein")}${esc(domeinEnkel(slug).replace(/^./, c => c.toUpperCase()))}</button>` : "";
  const links = `
    <section class="vak" style="display:flex;flex-direction:column;gap:8px"><div class="tussen"><h2 class="vakkop">Gegevens</h2>${hoe("gegevens", "Waar komen deze velden vandaan?")}</div>
      <dl class="velden">${zichtbaar.map(v => veldRij(k, r, v)).join("")}</dl>
      ${verborgen.length ? `<details class="uitklap" ${det("lege-velden-" + id)}><summary>Nog lege velden (${verborgen.length})${ic("chev")}</summary><div class="binnen"><dl class="velden">${verborgen.map(v => veldRij(k, r, v)).join("")}</dl></div></details>` : ""}
      ${aanvullen ? `<button class="knop team klein-knop" style="align-self:flex-start" data-act="aanvullen" data-k="${k}" data-id="${esc(id)}">${ic("team", "klein")}Laat je team de gegevens aanvullen</button>` : ""}</section>
    ${rows(CTX.bundle, "acties") || acts.length ? `<section class="vak" style="display:flex;flex-direction:column;gap:8px"><div class="tussen"><h2 class="vakkop">Acties en werk van je team</h2>${kanSchrijven() && k === "organisaties" ? `<button class="knop teamvol klein-knop" data-act="sheet" data-type="opdracht" data-hoort="${esc(id)}">${ic("plus", "klein")}Opdracht over ${esc(titel.length <= 20 ? titel : titel.split(" ")[0])}</button>` : ""}</div>
      <p class="klein">${werkZin}</p>
      ${open.length ? open.map(rij).join("") : '<p class="bordleeg">Niets open.</p>'}
      ${af.length ? `<details class="uitklap" ${det("rij-af-" + id)}><summary>Afgerond (${af.length})${ic("chev")}</summary><div class="binnen">${af.map(rij).join("")}</div></details>` : ""}</section>` : ""}`;
  const rechts = volgorde.map(([slug, l]) => `
    <section class="vak" style="display:flex;flex-direction:column;gap:6px"><div class="tussen"><h2 class="vakkop">${esc(domeinLabel(slug))}</h2>${plus(slug)}</div>
      ${l.length ? `<div class="lijstje">${l.slice(0, 25).map(x => lijstjeRij(slug, x)).join("")}</div>${l.length > 25 ? `<p class="klein stil">… en nog ${l.length - 25}</p>` : ""}` : `<p class="bordleeg">Nog geen ${esc(domeinLabel(slug).toLowerCase())}.</p>`}
      ${slug === "interacties" ? '<p class="klein stil">Een gesprek komt erbij als je in Claude vertelt hoe het ging.</p>' : ""}</section>`).join("")
    + (notitieInfo ? `<section class="vak" style="display:flex;flex-direction:column;gap:6px"><div class="tussen"><h2 class="vakkop">Notities</h2>${magSchrijven("notities") ? `<button class="knop klein-knop" data-act="sheet" data-type="notitie" data-k="${esc(k)}" data-id="${esc(id)}">${ic("plus", "klein")}Notitie</button>` : ""}</div>
      ${notities.map(n => `<div class="opm"><small>${esc([tekstVan(n, "Auteur"), datumKort(getField(n, "Datum"))].filter(Boolean).join(" · "))}</small>${tekstVan(n, "Onderwerp") ? `<b>${esc(tekstVan(n, "Onderwerp"))}</b>` : ""}<p>${esc(tekstVan(n, "Notitie"))}</p></div>`).join("")}
      ${!notities.length ? '<p class="bordleeg">Nog geen notities.</p>' : ""}<p class="klein stil">Notities zijn voor jou en je collega's.</p></section>` : "");
  const samen = `<div class="chiprij">${aanJou.length ? `<button class="pil jij knoppil" data-act="open" data-id="${esc(aanJou[0].id)}">● ${aanJou.length} wacht op jou</button>` : ""}${bijTeamL.length ? `<span class="pil team">◐ ${bijTeamL.length} bij je team</span>` : ""}${lopend.length ? `<span class="pil">${telwoord(lopend.length, "deal loopt", "deals lopen")}${lopend.reduce((s, x) => s + dealWaarde(x), 0) ? " · " + euro(lopend.reduce((s, x) => s + dealWaarde(x), 0)) : ""}</span>` : ""}${eig && !isAgentNaam(eig) ? mensChip(eig) : ""}</div>`;
  const slot = toegang() === "daglink" ? `<div class="slotregel">${ic("slot", "klein")}<span>Wijzigen kan na inloggen.</span>${kanInloggen() ? `<button class="knop klein-knop" data-act="login">Inloggen</button>` : ""}</div>`
    : !kan && magDomeinBewerken(CTX, k).reden ? `<div class="slotregel">${ic("slot", "klein")}<span>${esc(magDomeinBewerken(CTX, k).reden)}</span></div>` : "";
  return `<div class="inhoud">${renderBalk()}${terug}
    <section class="orgkop"><span class="orglogo" aria-hidden="true">${esc(initialen(titel))}</span><div class="kol" style="gap:2px;flex:1;min-width:0"><h2 class="titel" id="rij-titel" tabindex="-1">${esc(titel)}</h2><p class="stil">${esc(rijMeta(k, r)) || esc(domeinEnkel(k))}</p></div>
      ${kan ? `<button class="knop stil" data-act="sheet" data-type="rij-meer" data-k="${esc(k)}" data-id="${esc(id)}">${ic("meer", "klein")}Meer</button>` : ""}</section>
    ${samen}${slot}
    <div class="twee"><div class="kol">${links}</div><div class="kol">${rechts}</div></div></div>`;
}

/* Bij "Nieuwe …": de naam plus de paar velden die je meteen wilt weten. */
const VELDEN_NIEUW = {
  organisaties: ["Fase", "Vestigingsplaats", "Website"], contactpersonen: ["Functie", "E-mail"], sales_funnel: ["Fase", "Verwachte Omzet"],
  projecten: ["Status", "Startdatum"], interacties: ["Type", "Datum"], offertes: ["Status", "Bedrag excl. BTW"], tijdregistratie: ["Datum", "Uren"],
};
function nieuwVelden(k) {
  const d = domeinVan(k); const vs = dataVelden(d);
  const titel = vs.find(v => v.type === "titel");
  const extra = (VELDEN_NIEUW[k] || []).map(n => vs.find(v => v.naam === n)).filter(Boolean);
  if (!extra.length) { const s = vs.find(v => v.type === "select" && (v.opties || []).length); if (s) extra.push(s); }
  return { titel, extra };
}
