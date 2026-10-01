/* Wiring: daglink of inloggen -> werkruimte laden -> berekenen -> tonen.
 *
 * Tonen doet de schermlaag van dashboard v2 (src/v2-*.js, via window.V2);
 * dit bestand bepaalt alleen wélke werkruimte, met welke rechten, en rekent
 * de context uit die de schermen lezen. Schrijft nooit iets terug behalve,
 * optioneel en lokaal, wanneer je de laatste keer laadde en welke
 * minuten-per-actie-instelling je koos (geen bundelinhoud) — zie
 * rememberChoice()/rememberMinuten(). */

const LS_KEY = "agentic-team-dashboard:laatst-gebruikt";
const LS_MINUTEN_KEY = "agentic-team-dashboard:minuten-per-actie";

let currentBundle = null;
let currentPeriodWeeks = 12;
let currentMinutenPerActie = 25;

function rememberChoice(route, label) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ route, label, when: new Date().toISOString() }));
  } catch (e) { /* privémodus of quota — dan onthouden we het gewoon niet */ }
}

function rememberMinuten(v) {
  try { localStorage.setItem(LS_MINUTEN_KEY, String(v)); } catch (e) { /* zie hierboven */ }
}

function restoreMinuten() {
  try {
    const raw = localStorage.getItem(LS_MINUTEN_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) currentMinutenPerActie = n;
    }
  } catch (e) { /* zie hierboven */ }
}

async function handleBundle(bundle, route, label, { behoudRoute = false, naarRoute = null } = {}) {
  currentBundle = bundle;
  rememberChoice(route, label);
  // Een nieuw geladen werkruimte begint op Voor jou. Na verversen of een
  // schrijfactie blijf je waar je was (behoudRoute); na inloggen kom je uit
  // waar je naartoe wilde (f44, naarRoute).
  if (naarRoute) window.location.hash = naarRoute;
  else if (!behoudRoute && window.location.hash && window.location.hash !== "#/") {
    // Een route die al in de adresbalk stond (een deeplink) blijft staan.
    if (!bedoeldeRoute(window.location.hash)) window.location.hash = "#/";
  }
  renderAll();
}

/* i81: één rij bijwerken na een schrijfactie, zonder de bundel opnieuw op te
 * halen. `wijziging` is { entry } (het antwoord op PATCH/POST: de rij zoals de
 * instantie hem opsloeg) of { weg: entryId } (na DELETE). Daarna rekent
 * renderAll alles opnieuw uit, zodat tellers, Voor jou en Gegevens dezelfde
 * rijen tonen. Geeft false als er niets bij te werken viel; de aanroeper valt
 * dan terug op herladen. */
function werkRijBij(key, wijziging) {
  const bundle = currentBundle;
  const w = wijziging || {};
  if (!bundle || !bundle.domains || !key) return false;
  let dom = bundle.domains[key];
  if (w.weg) {
    if (!dom || !Array.isArray(dom.rows)) return false;
    dom.rows = dom.rows.filter(r => r.__entryId !== w.weg);
  } else if (w.entry && w.entry.entryId) {
    // Een domein dat bij het laden leeg was, staat niet in de bundel.
    if (!dom || !Array.isArray(dom.rows)) {
      dom = bundle.domains[key] = { aanwezig: true, rows: [], staleAt: null,
        herkomstLabel: `werkruimte — ${key} (0 entries, live opgehaald)` };
    }
    const rij = rijVanEntry(w.entry);
    const plek = dom.rows.findIndex(r => r.__entryId === rij.__entryId);
    dom.rows = plek === -1 ? [rij].concat(dom.rows) : dom.rows.map((r, i) => (i === plek ? rij : r));
    const dt = w.entry.bijgewerkt ? new Date(w.entry.bijgewerkt) : null;
    if (dt && !isNaN(dt.getTime()) && (!dom.staleAt || dt > dom.staleAt)) dom.staleAt = dt;
  } else {
    return false;
  }
  if (typeof dom.herkomstLabel === "string") {
    dom.herkomstLabel = dom.herkomstLabel.replace(/\(\d+ entries/, `(${dom.rows.length} entries`);
  }
  renderAll();
  return true;
}

/* De teamfeed als tweede bron voor "gebruik per agent". Puur tellen. */
function feedItemsVoorTelling(bundle, schema, agentLookup) {
  const feed = bundle && bundle.teamfeed;
  if (!feed || !Array.isArray(feed.entries) || !feed.entries.length) return [];
  return normaliseerFeed(feed.entries, schema, agentLookup);
}

// Bouwt eenmalig de interne metricsvorm (zie metrics.js) voor de huidige
// bundel/periode, en pakt hem uit tot het platte ctx-object dat de
// schermen lezen. Dit is de ENIGE plek die weet welke route de data heeft
// geleverd — de schermen zien daarna rijen, of de werkbak uit de dagstart.
function buildContext() {
  const bundle = currentBundle;
  const schema = getSchema();
  const agentLookup = buildAgentLookup();
  const today = new Date();

  if (bundle.kind === "metrics") {
    const result = parseNotionMetricsFile(bundle.metricsRaw, schema, today, currentMinutenPerActie);
    if (!result.ok) {
      // Nooit tekenen op een versie/vorm die dit dashboard niet herkent.
      return { versionError: result, bundle };
    }
    const m = result.metrics;
    return {
      bundle, schema, agentLookup, today,
      periodWeeks: m.periodWeeks, periodDays: m.periodDays,
      z1: voegTeamOogstToeAanAandacht(m.z1, bundle, schema),
      z2: m.z2, z3: m.z3, z4: m.z4, z5: m.z5,
      activiteit: m.activiteit, adopt: m.adopt, tijdwinst: m.tijdwinst,
      agentUsage: kiesAgentGebruik(m.agentUsage, feedItemsVoorTelling(bundle, schema, agentLookup), schema, today, m.periodDays, bundle.activaties),
      sporenTotaal: m.sporenTotaal, metricsMeta: m.meta, correctievrij: m.correctievrij,
      relaties: m.relaties || null,
      metricsWerk: m.werk || null,
      minutenPerActie: currentMinutenPerActie,
      intern: bundle.intern === true,
      bundelWaarschuwingen: (bundle.waarschuwingen || []).slice(),
      veldWaarschuwingen: (m.waarschuwingen || []).slice(),
      waarschuwingen: (bundle.waarschuwingen || []).concat(m.waarschuwingen || []),
      // b62: ook naast een metricsbestand komen de rijen uit je werkruimte, en
      // wie ingelogd is mag die bijwerken (per domein, zie magDomeinBewerken).
      ...schrijfHaken(),
    };
  }

  const periodWeeks = currentPeriodWeeks;
  const m = buildMetricsFromRowsBundle(bundle, schema, agentLookup, today, periodWeeks, currentMinutenPerActie);
  return {
    bundle, schema, agentLookup, today, periodWeeks: m.periodWeeks, periodDays: m.periodDays,
    z1: voegTeamOogstToeAanAandacht(m.z1, bundle, schema),
    z2: m.z2, z3: m.z3, z4: m.z4, z5: m.z5,
    activiteit: m.activiteit, adopt: m.adopt, tijdwinst: m.tijdwinst,
    agentUsage: kiesAgentGebruik(m.agentUsage, feedItemsVoorTelling(bundle, schema, agentLookup), schema, today, m.periodDays, bundle.activaties),
    sporenTotaal: m.sporenTotaal, metricsMeta: m.meta, correctievrij: m.correctievrij,
    bundelWaarschuwingen: (m.waarschuwingen || []).slice(),
    veldWaarschuwingen: [],
    waarschuwingen: m.waarschuwingen,
    minutenPerActie: currentMinutenPerActie,
    intern: bundle.intern === true,
    ...schrijfHaken(),
  };
}

/* Wat een scherm nodig heeft om te schrijven: de bron, of die mag schrijven,
 * en de drie manieren om daarna bij te tekenen. Op beide routes hetzelfde. */
function schrijfHaken() {
  return {
    bron: huidigeBron,
    kanSchrijven: bronKanSchrijven(huidigeBron),
    // Na een schrijfactie blijf je waar je was — zie handleBundle().
    herlaad: () => laadWerkruimte(huidigeBron, { behoudRoute: true }),
    // i81: normaal hoeft dat niet eens: de instantie stuurt de opgeslagen rij
    // terug, en die vervangt de rij hier ter plekke.
    werkBij: (key, wijziging) => werkRijBij(key, wijziging),
    hertekenAlles: () => renderAll(),
  };
}

/* b62: wie ben je? Met een ingelogde sessie één keer bij het laden. Alleen een
 * GEKOZEN naam telt: dan tellen Voor jou en Acties per persoon. */
let naamBijLadenGedaan = null;
function naamBijLaden(ctx) {
  const bron = ctx.bron;
  if (!bron || !bron.oauth || mijnNaam(bron)) return;
  if (naamBijLadenGedaan === bron.token) return;
  naamBijLadenGedaan = bron.token;
  void haalNaamvoorstel(bron).then((r) => {
    if (r && r.gezet && mijnNaam(bron)) renderAll();
  }).catch(() => { /* geen naam: dan telt alles, en vraagt de eerste knop erom */ });
}

/* Modules en teamleden (Beheer, en wie er in je team zit): eenmalig ophalen
 * voor dit token; komt er iets binnen, dan opnieuw tekenen. */
function laadBeheer() {
  const hadModules = moduleOverzichtBeschikbaar();
  void laadModuleOverzicht(huidigeBron).then((overzicht) => { if (overzicht || hadModules) route(); });
  void laadTeam(huidigeBron).then((t) => { if (t) route(); });
}

function renderAll() {
  const bundle = currentBundle;
  if (!bundle) { window.__dashboardCtx = undefined; return; }
  const ctx = buildContext();
  if (ctx.versionError) {
    // Geen dashboard tekenen op een bestand dat dit dashboard niet herkent —
    // wel duidelijk zeggen wat er aan de hand is en wat je eraan kunt doen.
    window.__dashboardCtx = undefined;
    const fout = ctx.versionError;
    V2.versieFout({
      titel: "Deze cijfers kan dit dashboard nog niet lezen",
      tekst: fout && fout.tekst ? String(fout.tekst) : "Het metricsbestand heeft een vorm die dit dashboard niet kent. Vraag je Coördinator om een nieuwe dagstart.",
    });
    return;
  }
  window.__dashboardCtx = ctx; // alleen al-berekende resultaten, geen nieuwe databron
  naamBijLaden(ctx);
  V2.toon(ctx);
}

/* Teken opnieuw zonder iets opnieuw uit te rekenen (bv. het moduleoverzicht
 * kwam binnen). Oudere modules roepen deze naam aan. */
function route() { V2.render(); }

/* f30 — de download. Een volle werkruimte kan tientallen megabytes zijn; de
 * melding zegt dus eerst dat er iets gebeurt. */
async function startExport(formaat) {
  if (!huidigeBron) { meld("Je werkruimte is nog niet geladen. Probeer het zo nog eens."); return; }
  meld("Je export wordt klaargemaakt…");
  try {
    await downloadExport(huidigeBron, formaat);
    meld("Klaar — je download staat in je downloadmap.");
  } catch (err) {
    console.error(err);
    meld(err.message || "Het downloaden is niet gelukt.", { fout: true });
  }
}

/* Uitloggen: de sessie weg. Staat er nog een daglink in dit tabblad, dan kijk
 * je daarmee verder mee; anders terug naar het begin. */
function uitloggen() {
  vergeetOauthSessie();
  resetOauthVernieuwing();
  naamBijLadenGedaan = null;
  // Meteen weg: de bundel, de bron en wat de site over de licentie vertelde.
  // Anders blijven de schrijfknoppen en Beheer even werken met de oude sessie.
  currentBundle = null;
  huidigeBron = null;
  window.__dashboardCtx = undefined;
  void laadModuleOverzicht(null);
  void laadTeam(null);
  const daglink = restoreDaglink();
  if (daglink) { laadWerkruimte(daglink, { behoudRoute: true }); return; }
  toonLegeStaat("Je bent uitgelogd", "Log opnieuw in, of open je dashboard via de daglink in je dagstart.", { login: true });
}

function startLogin() {
  startOauthLogin().catch((err) => {
    console.error(err);
    meld((err && err.message) || "Inloggen kon niet starten.", { fout: true });
  });
}

function wireNavigatie() {
  window.addEventListener("hashchange", () => {
    // Een daglink aanklikken terwijl deze pagina al openstaat wijzigt alleen
    // het #fragment — de browser herlaadt dan niet. Zonder dit pad zou een
    // verse daglink op een open tabblad stilletjes niets doen.
    const daglink = parseDaglinkFragment(window.location.hash);
    if (daglink) {
      try { sessionStorage.setItem(DAGLINK_SS_KEY, JSON.stringify(daglink)); } catch (e) { /* privémodus */ }
      history.replaceState(null, "", window.location.pathname + window.location.search + "#/");
      laadWerkruimte(daglink);
      return;
    }
    V2.hashGewijzigd();
  });
}

/* Zolang er geen werkruimte is: wat er aan de hand is, met inloggen erbij als
 * dat kan. Daaronder staat de Hulp — die werkt zonder login en zonder data. */
let eindToestand = false; // er staat al een melding met inlogknop (bv. een mislukte login)
function toonLegeStaat(titel, tekst, { login = null } = {}) {
  if (currentBundle) return;
  eindToestand = login === true;
  V2.leeg({ titel, tekst, bezig: login === false, fout: /niet|verlopen|onvolledig/i.test(titel) && login === true });
}

/* f30: de exportknop heeft dezelfde bron nodig als de bundel. Bewaren in
 * plaats van opnieuw afleiden — bij OAuth is dit object gedeeld en draagt het
 * een eventueel vernieuwd token. */
let huidigeBron = null;

async function laadWerkruimte(bron, { behoudRoute = false, naarRoute = null } = {}) {
  huidigeBron = bron;
  if (!currentBundle || !behoudRoute) {
    currentBundle = null;
    toonLegeStaat("Je team wordt geladen…", "Live uit je werkruimte.", { login: false });
  }
  try {
    const bundle = await loadWerkruimteBundle(bron);
    await handleBundle(bundle, "werkruimte", bundle.sourceLabel, { behoudRoute, naarRoute });
    laadBeheer();
    return true;
  } catch (err) {
    console.error(err);
    // Verversen of herladen na een schrijfactie dat mislukt: de werkruimte die
    // je zag blijft staan, met een melding. Alleen een sessie die op is, gaat
    // terug naar inloggen.
    if (behoudRoute && currentBundle && !err.oauthVerlopen && !err.daglinkVerlopen) {
      V2.meld(err.message + " Wat je ziet, is de stand van daarvoor.", { fout: true });
      return false;
    }
    currentBundle = null;
    if (err.oauthVerlopen) {
      // De sessie is op; opnieuw inloggen is de enige uitweg, dus staat de
      // knop er meteen bij in plaats van een doodlopende melding.
      vergeetOauthSessie();
      resetOauthVernieuwing();
      toonLegeStaat("Kon je werkruimte niet laden", err.message, { login: true });
      return;
    }
    if (err.daglinkVerlopen) {
      vergeetDaglink();
      const extra = /verlopen/i.test(err.message) ? " Daglinks zijn 24 uur geldig." : "";
      toonLegeStaat("Deze daglink werkt niet meer", err.message + extra, { login: true });
      return;
    }
    const heeftAdvies = /Coördinator/.test(err.message);
    toonLegeStaat("Kon je werkruimte niet laden",
      heeftAdvies ? err.message : err.message + " Vraag je Coördinator om een nieuwe daglink.",
      { login: true });
  }
}

/* p10: de terugkomst van het consentscherm. Staat er een `code` in het
 * fragment, dan wisselen we die in vóórdat we een bron kiezen — de adresbalk
 * is daarna leeg en de sessie staat in sessionStorage. */
async function verwerkOauthRedirect() {
  const redirect = parseOauthRedirect(window.location.hash);
  if (!redirect) return null;
  toonLegeStaat("Je wordt ingelogd…", "", { login: false });
  try {
    const sessie = await voltooiOauthLogin(redirect);
    resetOauthVernieuwing();
    return oauthBron(sessie);
  } catch (err) {
    console.error(err);
    toonLegeStaat("Inloggen is niet gelukt", err.message, { login: true });
    return null;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  restoreMinuten();
  V2.start({
    login: startLogin,
    uitloggen,
    ververs: () => (huidigeBron ? laadWerkruimte(huidigeBron, { behoudRoute: true }) : Promise.resolve(false)),
    exporteer: (formaat) => startExport(formaat),
    // De rekenhulp op Resultaat: hoeveel minuten scheelt één stuk werk je?
    minuten: (v) => { if (v > 0) { currentMinutenPerActie = v; rememberMinuten(v); if (currentBundle) renderAll(); } },
  });
  wireNavigatie();
  const uitRedirect = await verwerkOauthRedirect();
  const bron = uitRedirect || restoreBron();
  // Alleen ná een geslaagde login is er een bedoelde route om naar terug te
  // keren; bij een gewone daglink staat de route al in de adresbalk.
  let naarRoute = uitRedirect ? neemBedoeldeRoute() : null;
  if (!naarRoute && bron && bedoeldeRoute(window.location.hash)) naarRoute = window.location.hash;
  // f48: de kale link uit het slotbericht van de werkronde wees naar de
  // actietabel. Wat daar op je wachtte, staat nu in Voor jou.
  if (naarRoute === "#/data/acties") naarRoute = "#/";
  if (bron) { laadWerkruimte(bron, { naarRoute }); return; }
  // Een eindtoestand (een mislukte login bv.) blijft staan, met de Hulp eronder.
  if (eindToestand) return;
  // f53: de Hulp werkt zonder login — daar hoort geen inlogpoort voor.
  const deeplink = bedoeldeRoute(window.location.hash) && !/^#\/?$/.test(window.location.hash);
  if (!hulpDoel(window.location.hash) && deeplink && oauthMogelijk()) {
    toonLegeStaat("Log in om deze pagina te openen",
      "Deze link wijst naar een pagina in je eigen dashboard. Log in met je licentie — je komt daarna precies op die pagina uit.",
      { login: true });
    return;
  }
  // Er stond wél iets achter het #-teken, maar er kwam geen bruikbare bron uit.
  if (hashLijktOpDaglink(window.location.hash)) {
    toonLegeStaat("Deze link is onvolledig",
      "Er staat wel iets achter het #-teken van deze link, maar geen bruikbaar daglink-token — meestal is de link afgekapt bij het kopiëren of doorsturen. Vraag je Coördinator om een nieuwe.",
      { login: true });
    return;
  }
  // Geen link en geen sessie: de Hulp is de lege staat, met inloggen bovenaan.
  toonLegeStaat(oauthMogelijk() ? "Log in om je team te zien" : "Open je dashboard via de daglink in je dagstart",
    oauthMogelijk() ? "Of open dit dashboard via de daglink in je dagstart. Hieronder lees je hoe je team werkt." : "Vraag je Coördinator om een daglink. Hieronder lees je hoe je team werkt.",
    { login: true });
});
