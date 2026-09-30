/* Wiring: daglink -> werkruimte laden -> berekenen -> tonen, de
 * periodeschakelaar en de hash-router tussen de vier tabs (Vandaag · Team ·
 * Data · Prestaties) en de detailpagina's. Schrijft nooit iets terug behalve,
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

/* Alleen nog leesbaar in de herkomst-uitklap op de Prestaties-tab — dit is
 * systeeminfo, geen antwoord op "wat moet ik nu doen?". */
function leesLaatstGebruikt() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { route, label, when } = JSON.parse(raw);
    // p10: dezelfde route, twee ingangen (daglink of inloggen) — het label
    // noemt de bron, niet de ingang.
    const routeLabel = { werkruimte: "Werkruimte (live)" }[route] || route;
    return `${routeLabel} — ${label} (${new Date(when).toLocaleString("nl-NL")})`;
  } catch (e) { return null; }
}

async function handleBundle(bundle, route, label, { behoudRoute = false, naarRoute = null } = {}) {
  currentBundle = bundle;
  rememberChoice(route, label);
  // Bij een nieuw geladen bundel begin je op de Vandaag-tab. Maar een bundel
  // die opnieuw is opgehaald ná een schrijfactie is geen nieuw begin: dan sta
  // je middenin het bedienen van een rij, en terugspringen naar Vandaag kost
  // je in één klap je domein, je zoekterm, je bord- of tabelweergave en je
  // plek in de lijst. Dat overkwam alleen wie kon schrijven — en dus precies
  // de klant die de bediening voor het eerst gebruikte.
  // f44: kwam je binnen via een deeplink en moest je eerst inloggen, dan hoor
  // je daarna op díé plek uit te komen — niet op Vandaag, waar je opnieuw moet
  // gaan zoeken naar wat je al gevonden had.
  if (naarRoute) window.location.hash = naarRoute;
  else if (!behoudRoute) window.location.hash = "";
  renderAll();
}

/* i81: één rij bijwerken na een schrijfactie, zonder de bundel opnieuw op te
 * halen. Elke klik haalde eerst de héle werkruimte opnieuw op (tientallen
 * verzoeken), liet zolang de laadtekst zien en sprong daarna naar boven — wie
 * tien acties afhandelde, zocht tien keer zijn plek terug.
 *
 * `wijziging` is { entry } (het antwoord op PATCH/POST: de rij zoals de
 * instantie hem opsloeg) of { weg: entryId } (na DELETE). `focus` is optioneel
 * de selector van wat na het tekenen de focus hoort te krijgen. Daarna rekent
 * renderAll alles opnieuw uit, zodat tellers, Vandaag en de Data-tab dezelfde
 * rijen tonen. Geeft false als er niets bij te werken viel; de aanroeper valt
 * dan terug op herladen. */
let volgendeFocus = null;

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
  volgendeFocus = w.focus || null;
  renderAll();
  return true;
}

/* De teamfeed als tweede bron voor "gebruik per agent". Puur tellen: geen
 * markeerOpenLussen (dat is presentatie), alleen agentSlug + tijd. Zie
 * kiesAgentGebruik() in zones.js voor waarom deze terugval bestaat. */
function feedItemsVoorTelling(bundle, schema, agentLookup) {
  const feed = bundle && bundle.teamfeed;
  if (!feed || !Array.isArray(feed.entries) || !feed.entries.length) return [];
  return normaliseerFeed(feed.entries, schema, agentLookup);
}

// Bouwt eenmalig de interne metricsvorm (zie metrics.js) voor de huidige
// bundel/periode, en pakt hem uit tot het platte ctx-object dat de
// renderlaag verwacht. Dit is de ENIGE plek die weet welke route de data
// heeft geleverd — render.js/homepage.js zien daarna alleen nog z1..z5,
// activiteit, adopt, tijdwinst, agentUsage, ongeacht herkomst.
function buildContext() {
  const bundle = currentBundle;
  const schema = getSchema();
  const agentLookup = buildAgentLookup();
  const today = new Date();

  if (bundle.kind === "metrics") {
    const result = parseNotionMetricsFile(bundle.metricsRaw, schema, today, currentMinutenPerActie);
    if (!result.ok) {
      // Nooit tekenen op een versie/vorm die dit dashboard niet herkent —
      // zie ONTWERP-wekelijkse-dashboardbijwerking.md, "Openstaand".
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
      // Twee soorten waarschuwingen, bewust apart gehouden. Over de bundel
      // zelf (verouderd, onleesbaar, onbekend domein) moet je vandaag iets
      // doen; over losse velden die niet gelezen konden worden meestal niet.
      // `waarschuwingen` blijft de volledige lijst (bundel eerst), zodat
      // niets verdwijnt; de splitsing bepaalt de volgorde, de toon van de
      // samenvatting en welke regels in de herkomst-uitklap thuishoren.
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
    // f44: hier en niet in metrics.js, anders dan de twee andere toevoegingen
    // aan de aandachtlijst. parseNotionMetricsFile() krijgt bewust géén bundel
    // mee — "geen rij komt ooit in het geheugen" is het ontwerpprincipe van de
    // metricsroute. buildContext is de enige plek die beide routes ziet én de
    // rijen in handen heeft, dus dit is één aanroep in plaats van twee.
    z1: voegTeamOogstToeAanAandacht(m.z1, bundle, schema),
    z2: m.z2, z3: m.z3, z4: m.z4, z5: m.z5,
    activiteit: m.activiteit, adopt: m.adopt, tijdwinst: m.tijdwinst,
    agentUsage: kiesAgentGebruik(m.agentUsage, feedItemsVoorTelling(bundle, schema, agentLookup), schema, today, m.periodDays, bundle.activaties),
    sporenTotaal: m.sporenTotaal, metricsMeta: m.meta, correctievrij: m.correctievrij,
    // Op de rijenroute zijn alle waarschuwingen loaderwaarschuwingen: ze gaan
    // over de bundel, niet over losse velden. Zie de metricsroute hierboven.
    bundelWaarschuwingen: (m.waarschuwingen || []).slice(),
    veldWaarschuwingen: [],
    waarschuwingen: m.waarschuwingen,
    minutenPerActie: currentMinutenPerActie,
    intern: bundle.intern === true,
    // f23 fase D: bewerken kan alleen met een ingelogde sessie waarvan het
    // token dashboard:schrijf draagt; na een geslaagde write herlaadt de
    // bundel zodat de tabel de waarheid van de instantie toont.
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
    // f46/f48: na het kiezen van je naam telt "per persoon" opnieuw.
    hertekenAlles: () => renderAll(),
  };
}

/* b62: wie ben je? Met een ingelogde sessie één keer bij het laden (zie de
 * uitleg bij haalNaamvoorstel). Alleen een GEKOZEN naam telt: die bewaart
 * haalNaamvoorstel als kopie, en dan tellen Voor jou en Acties per persoon.
 * Een afleiding uit je adres blijft een voorzet in de naamvraag. */
let naamBijLadenGedaan = null;
function naamBijLaden(ctx) {
  const bron = ctx.bron;
  if (!bron || !bron.oauth || mijnNaam(bron)) return;
  if (naamBijLadenGedaan === bron.token) return;
  naamBijLadenGedaan = bron.token;
  void haalNaamvoorstel(bron).then((r) => {
    if (r && r.gezet && mijnNaam(bron)) renderAll();
  }).catch(() => { /* geen naam: dan telt alles, met "Zeg wie je bent" */ });
}

/* b62: één eerlijke regel bovenaan over wat je hier kunt.
 * - Daglink: je kijkt mee; inloggen brengt je terug op precies deze plek
 *   (de bedoelde route reist mee in de PKCE-record, f44).
 * - Acties die in Notion (of een ander systeem) wonen: afhandelen doe je daar
 *   of via Claude; hier staan de cijfers.
 * Ingelogd met je werkruimte: geen balk. */
function toegangsBalkHtml(ctx) {
  const bron = ctx.bron;
  if (bron && !bron.oauth && oauthMogelijk()) {
    return `<span>Je kijkt mee met je daglink: alleen lezen.</span>
      <button type="button" class="knop blad-knop blad-knop-prim" data-login>Inloggen om af te handelen</button>
      <span class="footnote">Je komt daarna precies hier terug.</span>`;
  }
  const acties = bronVan(ctx, "acties");
  if (acties && acties.toestand === "elders") {
    return `<span>Je acties staan in ${esc(acties.naam)}. Afhandelen doe je daar, of via Claude; hier zie je wat je team doet en oplevert.</span>`;
  }
  return "";
}

const TAB_CONTAINERS = { vandaag: "tab-vandaag", acties: "tab-acties", team: "tab-team", data: "tab-data", prestaties: "tab-prestaties", ronde: "tab-ronde", "vaste-taken": "tab-vaste-taken", klaar: "tab-vaste-taken", hulp: "tab-hulp", opdracht: "tab-acties" };

/* De Team- en Data-tab hangen hun eigen click/input-listener aan hun
 * container (feedfilter, zoekveld). Die containers blijven bij navigatie
 * bestaan, dus vervangen we ze door een lege kopie: zo begint elke render
 * met precies nul listeners in plaats van er eentje bij. */
function versContainer(id) {
  const oud = document.getElementById(id);
  const nieuw = oud.cloneNode(false);
  oud.parentNode.replaceChild(nieuw, oud);
  return nieuw;
}

function verbergAlles() {
  for (const id of Object.values(TAB_CONTAINERS)) document.getElementById(id).style.display = "none";
  document.getElementById("detail-view").style.display = "none";
}

function renderAll() {
  const bundle = currentBundle;
  const emptyStateEl = document.getElementById("empty-state");
  const versionErrorEl = document.getElementById("version-error");
  const tabbarEl = document.getElementById("tabbar");
  const periodSelect = document.getElementById("period-select");

  if (!bundle) {
    emptyStateEl.style.display = "";
    tabbarEl.style.display = "none";
    verbergAlles();
    versionErrorEl.style.display = "none";
    document.getElementById("kop-acties").style.display = "none";
    document.getElementById("toegang-balk").hidden = true;
    if (hulpDoel(window.location.hash) || hulpInLegeStaat) toonHulp(hulpDoel(window.location.hash));
    return;
  }
  emptyStateEl.style.display = "none";

  const ctx = buildContext();

  if (ctx.versionError) {
    // Geen dashboard tekenen op een bestand dat dit dashboard niet herkent
    // — wel duidelijk zeggen wat er aan de hand is en wat je eraan kunt
    // doen. Stil een verkeerde grafiek tekenen is erger dan niets tekenen.
    verbergAlles();
    tabbarEl.style.display = "none";
    versionErrorEl.style.display = "";
    renderVersionError(versionErrorEl, ctx.versionError, bundle);
    document.getElementById("warnings-box").style.display = "none";
    return;
  }
  versionErrorEl.style.display = "none";
  window.__dashboardCtx = ctx; // alleen al-berekende resultaten, geen nieuwe databron
  tabbarEl.style.display = "";

  // Periode is bij een kant-en-klaar metricsbestand vastgelegd door wie het
  // genereerde (de Coördinator) — die keuze kan dit dashboard niet
  // herberekenen zonder de rijen te zien. De schakelaar gaat daarom uit en
  // toont waarom.
  if (bundle.kind === "metrics") {
    periodSelect.disabled = true;
    periodSelect.title = `Periode vastgelegd in het metricsbestand (${ctx.periodWeeks} weken) — bij deze route niet aanpasbaar zonder een nieuwe export.`;
  } else {
    periodSelect.disabled = false;
    periodSelect.title = "";
    periodSelect.value = String(currentPeriodWeeks);
  }

  // ── Tab 1 · Vandaag ──
  renderStatusregel(document.getElementById("statusregel"), ctx);
  renderPrivacyBlok(document.getElementById("privacy-blok"));
  // b62: wat kun je hier — meekijken, afhandelen, of woont het elders?
  const balk = document.getElementById("toegang-balk");
  if (balk) { balk.innerHTML = toegangsBalkHtml(ctx); balk.hidden = !balk.innerHTML.trim(); }

  // f46: de werkbak Voor jou. Staat hij er, dan zit "je team zette N ding(en)
  // voor je klaar" er al volledig in — die melding hoort dan niet nóg eens in
  // het aandachtspaneel. De rest van de meldingen blijft staan.
  renderVoorJou(document.getElementById("panel-voor-jou"), ctx);
  const voorJouActief = voorJouAantal(ctx) !== null;
  const aandacht = voorJouActief ? (ctx.z1 || []).filter(it => it.type !== TEAM_OOGST_TYPE) : ctx.z1;
  document.getElementById("panel-aandacht").style.display = voorJouActief && !aandacht.length ? "none" : "";
  renderAandachtTop5(document.getElementById("panel-aandacht-body"), aandacht);
  renderFeedPanel(document.getElementById("panel-feed-body"), ctx);
  renderOpbrengstKpis(document.getElementById("opbrengst-grid"), ctx);

  // f34 fase 0: het modulepaneel tekent direct wat er (voor dit token) al
  // geladen is, en haalt het overzicht anders eenmalig op — verschijnt het
  // alsnog, dan tekenen paneel én detail-nav bij. Geen overzicht = geen paneel.
  // Altijd bijtekenen, ook als er niets kwam: wie in hetzelfde tabblad van een
  // ingelogde sessie naar een daglink wisselt, hield anders de moduletegel (met
  // bedragen) van daarnet in beeld. Zelfde patroon als het teampaneel hieronder.
  const hadModuleOverzicht = moduleOverzichtBeschikbaar();
  renderModulesPanel(document.getElementById("panel-modules"));
  void laadModuleOverzicht(huidigeBron).then((overzicht) => {
    renderModulesPanel(document.getElementById("panel-modules"));
    if (overzicht || hadModuleOverzicht) route();
  });

  // i77: het namenpaneel verschijnt alleen voor de beheerder van deze licentie
  // — de site geeft anders 404 en laadTeam levert null. Zelfde patroon als het
  // modulepaneel: eerst tekenen wat er is, dan eenmalig ophalen en bijtekenen.
  // Altijd bijtekenen, ook als er niets kwam: wie in hetzelfde tabblad van een
  // ingelogde sessie naar een daglink wisselt, houdt anders het beheerpaneel
  // van daarnet in beeld. laadTeam geeft bij hetzelfde token zijn cache terug.
  renderTeamPanel(document.getElementById("panel-team-namen"));
  void laadTeam(huidigeBron).then(() => {
    renderTeamPanel(document.getElementById("panel-team-namen"));
  });

  naamBijLaden(ctx);

  // ── Tab 4 · Prestaties ──
  renderPrestatieKpis(document.getElementById("kpi-grid"), ctx);
  renderAdoptieSubscores(document.getElementById("panel-adoptie-body"), ctx.adopt);
  renderActiviteitPanel(document.getElementById("panel-activiteit-body"), ctx.activiteit, ctx.periodWeeks);
  renderGebruikPanel(document.getElementById("panel-gebruik-body"), ctx.agentUsage, ctx);
  renderHerkomst(document.getElementById("herkomst-body"), ctx);

  renderWaarschuwingen(document.getElementById("warnings-box"), ctx);

  // i71: pas zichtbaar zodra er iets te verversen valt.
  document.getElementById("kop-acties").style.display = "";
  const nu = new Date();
  document.getElementById("kop-tijd").textContent =
    `geladen om ${String(nu.getHours()).padStart(2, "0")}:${String(nu.getMinutes()).padStart(2, "0")}`;

  route();
}

function renderDetail(key) {
  const ctx = window.__dashboardCtx;
  if (!ctx) return;

  // f4: doorklik per agent — key "agent/<slug>", geen vast DETAIL_VOLGORDE-item
  if (key.indexOf("agent/") === 0) {
    const slug = key.slice("agent/".length);
    const agent = ctx.schema.agents.find(a => a.slug === slug);
    document.title = `${agent ? agent.displayName : "Agent"} — Agentic Team Dashboard`;
    renderDetailNav(document.getElementById("detail-nav"), "gebruik", ctx.intern);
    const body = document.getElementById("detail-body");
    body.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.innerHTML = detailSectionHtml(agent ? agent.displayName : "Onbekende agent", agent ? agent.emoji : "👤", "Wat deed deze agent, en waar komt dat uit de data vandaan?", "detail-inner");
    body.appendChild(wrap.firstElementChild);
    renderDetailAgent(document.getElementById("detail-inner"), slug, ctx);
    return;
  }

  const meta = DETAIL_VOLGORDE.find(d => d.key === key);
  document.title = `${meta ? meta.titel : "Detail"} — Agentic Team Dashboard`;
  renderDetailNav(document.getElementById("detail-nav"), key, ctx.intern);
  const body = document.getElementById("detail-body");
  body.innerHTML = "";

  const secties = {
    feed: () => [detailSectionHtml("Teamfeed", "📣", "Wat doet mijn team, zonder dat ik erom hoef te vragen?", "detail-inner"), () => renderDetailFeed(document.getElementById("detail-inner"), ctx)],
    aandacht: () => [detailSectionHtml("Aandacht", "🎯", "Waar besteed ik vandaag mijn halfuur aan?", "detail-inner"), () => renderZone1(document.getElementById("detail-inner"), ctx.z1)],
    context: () => [detailSectionHtml("Contextgezondheid", "🧭", "Moet ik mijn bedrijfscontext bijwerken voordat ik het team weer aan het werk zet?", "detail-inner"), () => renderZone2(document.getElementById("detail-inner"), ctx.z2, ctx.today)],
    gebruik: () => [detailSectionHtml("Gebruik per agent", "👥", "Welke agent laat ik links liggen, en waarom?", "detail-inner"), () => renderDetailGebruik(document.getElementById("detail-inner"), ctx.z3, ctx.schema, ctx.today, ctx.periodDays, ctx.agentUsage, ctx)],
    opbrengst: () => [detailSectionHtml("Opbrengst", "💰", "Levert dit team genoeg op om het te blijven betalen?", "detail-inner"), () => renderZone4(document.getElementById("detail-inner"), ctx.z4, ctx.periodDays)],
    leren: () => [detailSectionHtml("Leren", "💡", "Wat weet dit team nu dat het vorige maand niet wist?", "detail-inner"), () => renderZone5(document.getElementById("detail-inner"), ctx.z5, ctx.periodDays)],
    adoptiescore: () => [detailSectionHtml("Ritme van je team — herkomst", "📊", "Klopt het ritme, en kan ik het zelf narekenen?", "detail-inner"), () => renderDetailAdoptiescore(document.getElementById("detail-inner"), ctx.adopt, ctx.periodWeeks)],
    tijdwinst: () => [detailSectionHtml("Geschatte tijdwinst — aanname", "⏱️", "Hoe komt dit dashboard aan het tijdwinst-getal, en wat is de aanname?", "detail-inner"), () => renderDetailTijdwinst(document.getElementById("detail-inner"), ctx.tijdwinst)],
    // f34 fase 0: alleen zodra de site het moduleoverzicht leverde (ingelogde
    // sessie + allowlist) én alleen voor de licentiebeheerder — zelfde patroon
    // als de interne tegel hieronder.
    ...(moduleOverzichtBeschikbaar() ? { modules: () => [detailSectionHtml("Jouw modules", "🧩", "Welke modules heb ik nu, en wat kosten ze per maand?", "detail-inner"), () => renderDetailModules(document.getElementById("detail-inner"))] } : {}),
    // Interne tegel: alleen met ctx.intern (werkruimte met DASHBOARD_INTERN=1).
    ...(ctx.intern ? { correctievrij: () => [detailSectionHtml("Correctievrij — de f19-gate", "🛡️", "Kan het team autonoom afronden zonder dat ik moet ingrijpen?", "detail-inner"), () => renderDetailCorrectievrij(document.getElementById("detail-inner"), ctx.correctievrij)] } : {}),
    activiteit: () => [detailSectionHtml("Activiteit per week", "📈", "Is er ritme, of zijn er gaten?", "detail-inner"), () => renderDetailActiviteit(document.getElementById("detail-inner"), ctx.activiteit, ctx.periodWeeks)],
  };

  const maker = secties[key];
  if (!maker) { body.innerHTML = `<p>Onbekende detailpagina.</p>`; return; }
  const [html, fill] = maker();
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  body.appendChild(wrap.firstElementChild);
  fill();
}

const TAB_TITELS = {
  vandaag: "Agentic Team Dashboard",
  acties: "Acties — Agentic Team Dashboard",
  ronde: "Eén voor één — Agentic Team Dashboard",
  "vaste-taken": "Vaste taken — Agentic Team Dashboard",
  klaar: "Is je team klaar? — Agentic Team Dashboard",
  hulp: "Hulp — Agentic Team Dashboard",
  opdracht: "Opdracht geven — Agentic Team Dashboard",
  team: "Je team — Agentic Team Dashboard",
  data: "Je gegevens — Agentic Team Dashboard",
  prestaties: "Prestaties — Agentic Team Dashboard",
};

/* i81: wordt dezelfde weergave opnieuw getekend (na een schrijfactie, of
 * omdat het moduleoverzicht binnenkwam), dan blijft de pagina staan waar hij
 * stond en houdt de bediening die je gebruikte de focus. Alleen een ándere
 * weergave begint bovenaan. */
let vorigeWeergave = null;

function blijfOfNaarBoven(zelfde, scrollY, focus) {
  if (!zelfde) { window.scrollTo(0, 0); return; }
  if (focus) {
    try {
      const doel = document.querySelector(focus);
      if (doel && doel.focus) doel.focus({ preventScroll: true });
    } catch (e) { /* ongeldige selector: dan geen focus, geen fout */ }
  }
  if (typeof scrollY === "number" && window.scrollY !== scrollY) window.scrollTo(0, scrollY);
}

/* f53: de Hulp heeft geen bundel nodig. Zonder bundel staat hij onder de lege
 * staat (inloggen + privacyregel blijven erboven); met bundel is het gewoon
 * een weergave, zonder actieve tab. */
let hulpInLegeStaat = false;

function toonHulp(doel) {
  const heeft = !!currentBundle && document.getElementById("version-error").style.display === "none";
  const ctx = heeft ? window.__dashboardCtx : null;
  const sleutel = `hulp|${(doel && doel.sectie) || ""}`;
  const zelfde = sleutel === vorigeWeergave;
  vorigeWeergave = sleutel;
  verbergAlles();
  if (heeft) renderTabbar(document.getElementById("tabbar"), "hulp", ctx);
  document.getElementById("tab-hulp").style.display = "";
  document.title = TAB_TITELS.hulp;
  if (zelfde) return; // bv. het moduleoverzicht kwam binnen: niets opnieuw openklappen
  renderHulp(versContainer("tab-hulp-body"), ctx, { sectie: doel ? doel.sectie : null });
}

function route() {
  const bundle = currentBundle;
  const hulp = hulpDoel(window.location.hash);
  const kopHulp = document.querySelector(".kop-hulp");
  if (kopHulp) { if (hulp) kopHulp.setAttribute("aria-current", "page"); else kopHulp.removeAttribute("aria-current"); }
  if (hulp) { toonHulp(hulp); return; }
  if (!bundle) {
    // Weg uit de Hulp zonder bundel: terug naar de lege staat (met de Hulp
    // eronder, als die de lege staat is).
    document.getElementById("tab-hulp").style.display = "none";
    vorigeWeergave = null;
    if (hulpInLegeStaat) toonHulp(null);
    return;
  }
  // s31: niets tekenen op een bestand dat dit dashboard niet herkent. Zonder
  // deze guard toont een hashchange (bv. het leegmaken van het fragment na het
  // laden van een daglink) alsnog de lege pagina náást de versiefout.
  if (document.getElementById("version-error").style.display !== "none") {
    verbergAlles();
    return;
  }
  const ctx = window.__dashboardCtx;
  let view = bepaalActieveView();
  // Is de Data-tab er niet (een metricsbestand zonder relatiekaarten), dan mag
  // een onthouden of getypte #/data-link niet op een lege tab uitkomen.
  if (view.tab === "data" && !dataTabBeschikbaar(ctx)) view = { soort: "tab", tab: "vandaag" };
  const sleutel = [view.soort, view.tab, view.key || "", view.domein || "", view.id || ""].join("|");
  const zelfde = sleutel === vorigeWeergave;
  vorigeWeergave = sleutel;
  const scrollY = window.scrollY;
  const focus = zelfde ? (volgendeFocus || focusSelector(document.activeElement)) : null;
  volgendeFocus = null;
  verbergAlles();
  renderTabbar(document.getElementById("tabbar"), view.tab, ctx);

  if (view.soort === "detail") {
    document.getElementById("detail-view").style.display = "";
    renderDetail(view.key);
    blijfOfNaarBoven(zelfde, scrollY, focus);
    return;
  }

  document.getElementById(TAB_CONTAINERS[view.tab]).style.display = "";
  document.title = TAB_TITELS[view.tab] || TAB_TITELS.vandaag;

  if (view.soort === "rij") {
    renderRijPagina(versContainer("tab-data-body"), view.domein, view.id, ctx);
    blijfOfNaarBoven(zelfde, scrollY, focus);
    if (!zelfde) { const t = document.querySelector("#tab-data-body .rp-titel"); if (t) t.focus({ preventScroll: true }); }
    return;
  }
  if (view.soort === "data") {
    renderDataDomein(versContainer("tab-data-body"), view.domein, ctx);
    blijfOfNaarBoven(zelfde, scrollY, focus);
    return;
  }
  if (view.soort === "item") {
    renderItemBlad(versContainer("tab-acties-body"), view.domein, view.id, ctx);
    blijfOfNaarBoven(zelfde, scrollY, focus);
    // Een nieuw blad: de focus op de titel, zodat een schermlezer weet waar je bent.
    if (!zelfde) { const t = document.querySelector(".blad-titel"); if (t) t.focus({ preventScroll: true }); }
    return;
  }
  // f48: Team heeft twee delen, "Wat ze deden" en "Resultaat" (het oude Prestaties).
  const deel = view.tab === "klaar" ? "vaste-taken" : view.tab;
  for (const a of document.querySelectorAll("[data-team-deel]")) {
    const hier = a.getAttribute("data-team-deel") === deel;
    a.classList.toggle("actief", hier);
    if (hier) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  if (view.tab === "acties") renderActiesTab(versContainer("tab-acties-body"), ctx);
  if (view.tab === "opdracht") {
    renderOpdracht(versContainer("tab-acties-body"), ctx, opdrachtDoel(window.location.hash));
    if (!zelfde) { const t = document.querySelector("#tab-acties-body .opdracht-titel"); if (t) t.focus({ preventScroll: true }); }
  }
  if (view.tab === "vaste-taken") renderVasteTaken(versContainer("tab-vaste-taken-body"), ctx);
  if (view.tab === "klaar") {
    renderKlaar(versContainer("tab-vaste-taken-body"), ctx);
    if (!zelfde) { const k = document.querySelector("#tab-vaste-taken-body .kc-kop"); if (k) k.focus({ preventScroll: true }); }
  }
  if (view.tab === "ronde") {
    renderRonde(versContainer("tab-ronde-body"), ctx);
    if (!zelfde) { const t = document.querySelector("#tab-ronde-body .blad-titel"); if (t) t.focus({ preventScroll: true }); }
  }
  if (view.tab === "team") renderDetailFeed(versContainer("tab-team-body"), ctx);
  if (view.tab === "data") { resetDataZoek(); wisDataVoorselectie(); renderDataOverzicht(versContainer("tab-data-body"), ctx); }
  // Een tab begon nooit bovenaan; die blijft staan, alleen de focus komt terug.
  if (zelfde) blijfOfNaarBoven(true, null, focus);
}

/* f30 — de download. De knop staat op de Data-tab en wordt bij elke render
 * opnieuw getekend, dus geen directe listener maar delegatie, net als de rest.
 * De statusregel is er niet voor de sier: een volle werkruimte kan tientallen
 * megabytes zijn en dan gebeurt er even niets zichtbaars. */
async function startExport(formaat, knop) {
  const status = document.getElementById("export-status");
  const knoppen = Array.from(document.querySelectorAll("[data-export]"));
  const zeg = (tekst) => { if (status) status.textContent = tekst; };
  // Zonder bron valt er niets op te halen. Dat kan alleen in de seconden
  // tussen tabwissel en geladen bundel, maar een knop die dan níets doet is
  // erger dan een knop die zegt waarom — dat leest als kapot.
  if (!huidigeBron) { zeg("Je werkruimte is nog niet geladen. Probeer het zo nog eens."); return; }
  knoppen.forEach((k) => { k.disabled = true; });
  zeg("Je export wordt klaargemaakt…");
  try {
    await downloadExport(huidigeBron, formaat);
    zeg("Klaar — je download staat in je downloadmap.");
  } catch (err) {
    console.error(err);
    zeg(err.message || "Het downloaden is niet gelukt.");
  } finally {
    knoppen.forEach((k) => { k.disabled = false; });
    if (knop) knop.focus();
  }
}

function wireNavigatie() {
  document.body.addEventListener("click", (e) => {
    if (e.target.closest("[data-stop-nav]")) return; // bv. het minuten-invoerveld
    const exportEl = e.target.closest("[data-export]");
    if (exportEl) {
      startExport(exportEl.getAttribute("data-export"), exportEl);
      return;
    }
    // Klikproef-ronde 2: een alert draagt zijn rijen als voorselectie mee, en
    // een naam-link elders zet de zoekterm — de href doet daarna de navigatie.
    const filterEl = e.target.closest("[data-filter-domein]");
    if (filterEl) {
      zetDataVoorselectie(
        filterEl.getAttribute("data-filter-domein"),
        filterEl.getAttribute("data-filter-label") || "",
        (filterEl.getAttribute("data-filter-ids") || "").split(","),
      );
      return;
    }
    // f46/f47: "Inloggen en afhandelen" op het blad en in Voor jou. Eén plek,
    // zodat een knop die op twee plekken staat nooit twee keer inlogt.
    if (e.target.closest("[data-login]")) {
      startOauthLogin().catch((err) => {
        console.error(err);
        meld((err && err.message) || "Inloggen kon niet starten.", { fout: true });
      });
      return;
    }
    // f47: "Bewerken in Gegevens" vanaf het blad — de detailkaart staat dan open.
    const detailOpen = e.target.closest("[data-detail-open]");
    if (detailOpen) {
      const ruw = detailOpen.getAttribute("data-detail-open") || "";
      const scheiding = ruw.indexOf("|");
      if (scheiding !== -1) { resetDataZoek(); zetDataDetail(ruw.slice(0, scheiding), ruw.slice(scheiding + 1)); }
      return;
    }
    const zoekEl = e.target.closest("[data-relatie-zoek]");
    if (zoekEl) { zetDataZoek(zoekEl.getAttribute("data-relatie-zoek") || ""); return; }
    const domeinEl = e.target.closest("[data-data-domein]");
    if (domeinEl) { window.location.hash = `#/data/${domeinEl.getAttribute("data-data-domein")}`; return; }
    const gotoEl = e.target.closest("[data-goto]");
    if (gotoEl) window.location.hash = `#/detail/${gotoEl.getAttribute("data-goto")}`;
  });
  document.body.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = e.target;
    if (!t.classList) return;
    if (t.hasAttribute && t.hasAttribute("data-data-domein")) {
      e.preventDefault();
      window.location.hash = `#/data/${t.getAttribute("data-data-domein")}`;
      return;
    }
    if (t.classList.contains("kpi-tile")) {
      e.preventDefault();
      const gotoEl = t.closest("[data-goto]");
      if (gotoEl) window.location.hash = `#/detail/${gotoEl.getAttribute("data-goto")}`;
    }
  });
  window.addEventListener("hashchange", () => {
    // Een daglink aanklikken terwijl deze pagina al openstaat wijzigt alleen
    // het #fragment — de browser herlaadt dan niet. Zonder dit pad zou een
    // verse daglink op een open tabblad stilletjes niets doen.
    const daglink = parseDaglinkFragment(window.location.hash);
    if (daglink) {
      try { sessionStorage.setItem(DAGLINK_SS_KEY, JSON.stringify(daglink)); } catch (e) { /* privémodus */ }
      history.replaceState(null, "", window.location.pathname + window.location.search);
      laadWerkruimte(daglink);
      return;
    }
    route();
  });
}

/* f25 · mobiel: de kop klapt in zodra je gaat scrollen, zodat het scherm van
 * de inhoud is en niet van de merknaam. Puur cosmetisch — geen state. */
function wireKopInklappen() {
  let ingeklapt = false;
  const zet = () => {
    const moet = (window.scrollY || window.pageYOffset || 0) > 40;
    if (moet === ingeklapt) return;
    ingeklapt = moet;
    document.body.classList.toggle("kop-klein", moet);
  };
  window.addEventListener("scroll", zet, { passive: true });
  zet();
}

function wireInputs() {
  document.getElementById("period-select").addEventListener("change", (e) => {
    currentPeriodWeeks = parseInt(e.target.value, 10);
    if (currentBundle) renderAll();
  });

  document.getElementById("btn-ververs").addEventListener("click", () => {
    // behoudRoute, net als na een schrijfactie: verversen is geen nieuw begin.
    // Zonder deze vlag maakt handleBundle() de hash leeg en sta je ineens op
    // Vandaag terwijl je op de Data-tab naar iets stond te kijken.
    if (huidigeBron) laadWerkruimte(huidigeBron, { behoudRoute: true });
  });

  document.body.addEventListener("change", (e) => {
    if (e.target.id === "input-minuten") {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v > 0) {
        currentMinutenPerActie = v;
        rememberMinuten(v);
        if (currentBundle) renderAll();
      }
    }
  });
}

/* Opent iemand deze pagina via een daglink (of herlaadt hij binnen dezelfde
 * sessie), dan laden we de werkruimte-bundel vanzelf — er valt niets te
 * kiezen, de link wijst al naar zijn eigen instantie. Zonder (of met een
 * verlopen) daglink blijft de lege staat staan met de uitleg. */
function toonLegeStaat(titel, tekst, { login = null } = {}) {
  document.getElementById("empty-state-titel").textContent = titel;
  document.getElementById("empty-state-tekst").textContent = tekst;
  // `login: null` = laat staan wat er stond; true/false zet hem expliciet.
  if (login !== null) {
    toonLoginknop(login);
    // f53: een eindtoestand (met inlogknop) krijgt de Hulp eronder; tijdens
    // laden of doorsturen niet, anders flitst hij even in beeld.
    hulpInLegeStaat = login;
    if (!currentBundle) route();
  }
}

/* p10: de loginknop is er alleen op een build met OAUTH_DASHBOARD aan én op
 * een echte http(s)-pagina. Via file:// blijft hij weg — die pagina hoort nul
 * netwerkverkeer te doen, en een redirect naar dashboard.agentic-team.ai zou
 * daar sowieso niet terugkomen. */
function toonLoginknop(aan) {
  document.getElementById("empty-state-acties").style.display = aan && oauthMogelijk() ? "" : "none";
}

/* f30: de exportknop heeft dezelfde bron nodig als de bundel. Bewaren in
 * plaats van opnieuw afleiden — bij OAuth is dit object gedeeld en draagt het
 * een eventueel vernieuwd token. */
let huidigeBron = null;

async function laadWerkruimte(bron, { behoudRoute = false, naarRoute = null } = {}) {
  huidigeBron = bron;
  toonLegeStaat("Live gegevens uit je werkruimte worden opgehaald…", "", { login: false });
  try {
    const bundle = await loadWerkruimteBundle(bron);
    await handleBundle(bundle, "werkruimte", bundle.sourceLabel, { behoudRoute, naarRoute });
  } catch (err) {
    console.error(err);
    if (err.oauthVerlopen) {
      // De sessie is op; opnieuw inloggen is de enige uitweg, dus staat de
      // knop er meteen bij in plaats van een doodlopende melding.
      vergeetOauthSessie();
      resetOauthVernieuwing();
      toonLegeStaat("Kon je werkruimte niet laden", err.message, { login: true });
      return;
    }
    if (err.daglinkVerlopen) {
      // De instantie zegt zelf al wat er mis is (verlopen of ingetrokken); die
      // tekst overschrijven zou hem onnauwkeuriger maken. Alleen bij "verlopen"
      // hoort de geldigheidsduur erbij — dat is de vraag die er meteen op volgt.
      vergeetDaglink();
      const extra = /verlopen/i.test(err.message) ? " Daglinks zijn 24 uur geldig." : "";
      toonLegeStaat("Deze daglink werkt niet meer", err.message + extra, { login: true });
      return;
    }
    // Noemt de melding zelf al wat je moet doen (bv. de tijdslimiet-tekst), dan
    // niet nóg een keer om een nieuwe daglink vragen.
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

function wireLoginknop() {
  document.getElementById("btn-oauth-login").addEventListener("click", () => {
    toonLegeStaat("Je wordt doorgestuurd naar agentic-team.ai…", "", { login: false });
    startOauthLogin().catch((err) => {
      console.error(err);
      toonLegeStaat("Inloggen kon niet starten", err.message || String(err), { login: true });
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  restoreMinuten();
  wireInputs();
  wireNavigatie();
  wireKopInklappen();
  wireLoginknop();
  zetSneltoetsenAan();
  document.getElementById("empty-state-privacy").textContent = PRIVACY_LEGE_STAAT;
  renderAll();
  toonLoginknop(true);
  const uitRedirect = await verwerkOauthRedirect();
  const bron = uitRedirect || restoreBron();
  // Alleen ná een geslaagde login is er een bedoelde route om naar terug te
  // keren; bij een gewone daglink staat de route al in de adresbalk.
  let naarRoute = uitRedirect ? neemBedoeldeRoute() : null;
  // Met een lopende sessie of bewaarde daglink blijft de pagina in de
  // adresbalk staan (herladen op #/hulp of #/klaar). Een verse daglink staat
  // zelf in het fragment en is geen route.
  if (!naarRoute && bron && bedoeldeRoute(window.location.hash)) naarRoute = window.location.hash;
  // f48: de kale link uit het slotbericht van de werkronde wees naar de
  // actietabel. Wat daar op je wachtte, staat nu in Voor jou.
  if (naarRoute === "#/data/acties") naarRoute = "#/";
  if (bron) { laadWerkruimte(bron, { naarRoute }); return; }
  // f44: je kunt hier ook binnenkomen via een gewone deeplink uit een bericht
  // van je team — een URL zonder token, die je met je eigen licentie opent.
  // "Geen daglink gevonden" leest dan als een storing, terwijl de knop om in te
  // loggen er gewoon naast staat. Zeg dus wat er moet gebeuren, niet wat er
  // ontbreekt. Kan er niet ingelogd worden, dan blijft de daglink-uitleg staan:
  // dan is dat wél het enige juiste antwoord.
  // f53: de Hulp werkt zonder login — daar hoort geen inlogpoort voor.
  if (!hulpDoel(window.location.hash) && bedoeldeRoute(window.location.hash) && oauthMogelijk()) {
    toonLegeStaat("Log in om deze pagina te openen",
      "Deze link wijst naar een pagina in je eigen dashboard. Log in met je licentie — je komt daarna precies op die pagina uit.",
      { login: true });
    return;
  }
  // Er stond wél iets achter het #-teken, maar er kwam geen bruikbare bron uit.
  // "Geen daglink gevonden" is dan het verkeerde antwoord: er wás een link.
  if (hashLijktOpDaglink(window.location.hash)) {
    toonLegeStaat("Deze link is onvolledig",
      "Er staat wel iets achter het #-teken van deze link, maar geen bruikbaar daglink-token — meestal is de link afgekapt bij het kopiëren of doorsturen. Vraag je Coördinator om een nieuwe.",
      { login: true });
    return;
  }
  // f53: geen link en geen sessie. Dan is de Hulp de lege staat: inloggen
  // bovenaan, daaronder hoe je team werkt. Kan er niet ingelogd worden, dan
  // blijft de daglink-uitleg de kop. Staat er al een eindtoestand (een
  // mislukte login bv.), dan blijft die melding staan, met de Hulp eronder.
  if (hulpInLegeStaat) return;
  if (oauthMogelijk()) {
    toonLegeStaat("Log in om je team te zien",
      "Of open dit dashboard via de daglink in je dagstart. Hieronder lees je hoe je team werkt.",
      { login: true });
  } else {
    hulpInLegeStaat = true;
    route();
  }
});
