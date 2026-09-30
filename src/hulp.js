/* f53 — Hulp in het dashboard (#/hulp, #/hulp/<sectie>).
 *
 * "Blijkbaar is het toch nog te lastig": de handleiding woont in het
 * dashboard zelf. Werkt zonder login en zonder data — daarom leunt niets hier
 * op de bundel, behalve twee extra's als die er wél is (de klaar-check en
 * links naar je eigen schermen). Is er geen bundel, dan is dit de lege staat.
 *
 * Bronnen: Yorams uitleg over ritme, werkrondes en ketens (artifacts in de
 * backlog bij f53), klantgids-werkrondes.md, core/served/werkronde.md, de
 * orchestrator-prompt (Activeren) en core/agents.json (chains). Alleen wat nu
 * echt zo werkt: geen knoppen, sneltoetsen of nummering die er (nog) niet zijn.
 * Klanttaal: vaste taak, werkmoment, klaar om te checken. */

const HULP_VOORBEELDEN = {
  notes: {
    tab: "Gespreksnotities worden acties", soort: "Zo kun je je team gebruiken",
    titel: "Van gespreksnotities naar een lijst die zichzelf afwerkt",
    lede: "Je komt uit een klantgesprek met een pagina aantekeningen. In plaats van zelf een lijstje te maken, geef je de notities aan je team.",
    stappen: [
      ["Na het gesprek", "Jij plakt je notities in Claude", "“Maak hier acties van en koppel ze aan de deal.”", "jij"],
      ["Direct", "Elke afspraak wordt een actie", "Met een eigenaar en een deadline. Werk voor jou komt op jouw naam, werk voor een specialist bij je team.", "team"],
      ["Volgende werkmoment", "De Dealmaker pakt zijn deel op", "Hij zet je notities om in een diagnose en een eerlijke inschatting, bij de deal.", "team"],
      ["Volgende werkmoment", "De Outreach Specialist schrijft de follow-up", "Een conceptmail die laat zien dat je goed geluisterd hebt. Hij verstuurt niets.", "team"],
      ["Na de controle", "De mail staat klaar om te checken", "Quality Control keek feiten en toon na. De mail gaat naar buiten, dus hij wacht op jou.", "jij"],
      ["Als jij kijkt", "Hij staat bij Voor jou", "Je past één zin aan, verstuurt de mail zelf en drukt op Goedkeuren.", "klaar"],
    ],
  },
  stil: {
    tab: "Een deal die stilvalt", soort: "Vaste taak · elke week",
    titel: "Je team ziet wat jij mist",
    lede: "Een deal staat al weken in dezelfde fase en niemand heeft het gemerkt. De vaste taak van de Pipeline Manager wel.",
    stappen: [
      ["Werkmoment", "De Pipeline Manager doet zijn vaste taak", "Hij vindt een deal die lang stilstaat, zonder recent contact.", "team"],
      ["Werkmoment", "Hij zet een signaal voor je klaar", "Op jouw naam, met één zin waarom het belangrijk is.", "jij"],
      ["Als jij kijkt", "Het staat bij Voor jou", "Met de knoppen Laat je team opvolgen, Ik pak het zelf op en Gezien, niets doen.", "jij"],
      ["Als jij kiest", "Laat je team opvolgen", "Er komt een actie bij je team: de volgende stap voor deze deal.", "team"],
      ["Volgende werkmoment", "Het concept staat klaar om te checken", "Nagekeken en op jouw naam, omdat het een bericht aan een klant is.", "jij"],
      ["Als jij wilt", "Jij verstuurt", "De deal beweegt weer.", "klaar"],
    ],
  },
  fact: {
    tab: "Facturen op vrijdag", soort: "Vaste taak · elke vrijdag",
    titel: "De facturatie ligt klaar voordat je eraan denkt",
    lede: "Elke vrijdag loopt Administratie je openstaande facturen na. Jij hoeft alleen nog te kijken en te versturen.",
    stappen: [
      ["Vrijdag, vroeg", "Administratie doet zijn vaste taak", "Hij kijkt welke facturen openstaan en welke over de termijn zijn.", "team"],
      ["Vrijdag, vroeg", "Herinneringen staan klaar", "Als concept, bij de juiste klant. Er wordt niets verstuurd.", "team"],
      ["Vrijdag, ochtend", "Klaar om te checken bij Voor jou", "De concepten om te versturen, plus de vragen die alleen jij kunt beantwoorden.", "jij"],
      ["Als het jou uitkomt", "Jij verstuurt", "Een factuur of herinnering versturen blijft altijd jouw knop.", "klaar"],
    ],
  },
};
const HULP_PIL = { jij: ["hulp-pil jij", "Jij aan zet"], team: ["hulp-pil team", "Je team"], klaar: ["hulp-pil klaar", "Afgerond"] };
let hulpVoorbeeld = "notes";
let hulpStap = -1;

function hulpVoorbeeldHtml() {
  const v = HULP_VOORBEELDEN[hulpVoorbeeld];
  const n = v.stappen.length;
  const pos = hulpStap;
  const tab = (k, x) => `<button type="button" class="hulp-keuze" data-hulp-vb="${k}" aria-pressed="${k === hulpVoorbeeld}">${esc(x.tab)}</button>`;
  const stap = (s, i) => `<li class="${pos < 0 ? "" : i === pos ? "nu" : i > pos ? "later" : ""}"><span class="hulp-wanneer">${esc(s[0])}</span>
    <div><strong>${esc(s[1])}</strong><span>${esc(s[2])}</span><span class="${HULP_PIL[s[3]][0]}">${HULP_PIL[s[3]][1]}</span></div></li>`;
  return `<div class="hulp-keuzes" role="group" aria-label="Voorbeeld">${Object.entries(HULP_VOORBEELDEN).map(([k, x]) => tab(k, x)).join("")}</div>
    <p class="hulp-soort">${esc(v.soort)}</p><h3>${esc(v.titel)}</h3><p>${esc(v.lede)}</p>
    <p class="hulp-rij"><button type="button" class="knop-mini bedien-knop" data-hulp-stap>${pos < 0 ? "Loop het stap voor stap door" : pos < n - 1 ? "Volgende stap" : "Opnieuw"}</button>
    ${pos >= 0 ? `<button type="button" class="knop-mini" data-hulp-alles>Toon alles</button>` : ""}
    <span class="footnote" aria-live="polite">${pos < 0 ? `${n} stappen` : `stap ${pos + 1} van ${n}`}</span></p>
    <ol class="hulp-tijdlijn">${v.stappen.map(stap).join("")}</ol>`;
}

/* De ketens komen uit core/agents.json (chains) — niet in het dashboardschema,
 * dus hier overgenomen. De namen komen wél uit het schema. */
const HULP_KETENS = [
  { naam: "Van onderzoek naar getekende deal", stappen: ["researcher", "pipeline-manager", "outreach-specialist", "dealmaker", "delivery-architect"] },
  { naam: "Van idee naar publicatie", stappen: ["marktmaker", "seo-geo-specialist", "de-stem", "content-strateeg"],
    poorten: { "seo-geo-specialist": "jij kiest het idee", "de-stem": "jij keurt de hoek goed", "content-strateeg": "jij keurt de versie goed die Quality Control zag" },
    slot: "Jij publiceert" },
  { naam: "Van deal naar tevreden klant", stappen: ["dealmaker", "delivery-architect", "customer-success-manager"] },
];

function hulpKetenHtml(schema, k) {
  const naam = (slug) => { const a = schema && schema.agents.find(x => x.slug === slug); return a ? a.displayName : slug; };
  const delen = [];
  k.stappen.forEach((s, i) => {
    if (i) delen.push(`<span class="hulp-pijl" aria-hidden="true">›</span>`);
    delen.push(`<span class="hulp-station">${esc(naam(s))}</span>`);
    if (k.poorten && k.poorten[s]) delen.push(`<span class="hulp-ruit" role="img" aria-label="${esc(k.poorten[s])}" title="${esc(k.poorten[s])}"></span>`);
  });
  if (k.slot) delen.push(`<span class="hulp-pijl" aria-hidden="true">›</span><span class="hulp-station jij">${esc(k.slot)}</span>`);
  return `<div><strong class="hulp-klein">${esc(k.naam)}</strong><div class="hulp-keten">${delen.join("")}</div></div>`;
}

/* Een knop naar je eigen scherm — alleen als er iets te zien is. Zonder data
 * is dat inloggen (als dat kan), anders niets. */
function hulpNaar(ctx, label, route) {
  if (ctx) return `<p><a class="detail-link" href="${route}">${esc(label)} →</a></p>`;
  return typeof oauthMogelijk === "function" && oauthMogelijk()
    ? `<p><button type="button" class="knop-mini bedien-knop" data-login>Log in om dit te zien</button></p>` : "";
}

function hulpSecties(ctx) {
  const schema = (ctx && ctx.schema) || (typeof AGENTIC_TEAM_SCHEMA !== "undefined" ? AGENTIC_TEAM_SCHEMA : null);
  const k = vtKopieerHtml;
  return [
    ["in-een-minuut", "Je team in één minuut", () => `
      <p>Je team bestaat uit specialisten, elk met een eigen vak: van je deals tot je facturen. Ze werken op twee manieren.</p>
      <ul><li><strong>Als je het vraagt.</strong> Je praat gewoon met Claude. Past je vraag bij een vakgebied, dan pakt de juiste specialist hem op en zegt hij wie hij is. Je hoeft zelf niemand te kiezen.</li>
      <li><strong>Vanzelf, op vaste momenten.</strong> Terwijl jij iets anders doet, loopt je team het open werk en je vaste taken langs. Dat heet je werkmoment.</li></ul>
      <p>Wat naar buiten gaat, zoals een mail, een post of een factuur, komt altijd eerst bij jou. Je team verstuurt, publiceert of betaalt nooit zelf.</p>
      ${hulpNaar(ctx, "Naar Voor jou", "#/")}`],
    ["voor-jou", "Voor jou: goedkeuren, terugsturen, later", () => `
      <p>Bij <strong>Voor jou</strong> staat alles wat op jouw beslissing wacht, genummerd. Het nummer blijft staan tot je ververst. Elke knop zegt wat er gebeurt:</p>
      <ul><li><strong>Goedkeuren</strong>: het werk klopt. Moet het naar buiten, zoals een mail, kopieer het dan en verstuur het zelf.</li>
      <li><strong>Terug naar …</strong>: je schrijft in één zin wat anders moet. De specialist pakt het bij het volgende werkmoment opnieuw op, met jouw opmerking erbij.</li>
      <li><strong>Zelf aangepast</strong>: je paste het zelf aan en rondt af. Eén zin over wat je veranderde, helpt je team.</li>
      <li><strong>Ja, doe maar</strong> of <strong>Nee, niet doen</strong>: voor voorstellen. Bij ja gaat de specialist aan de slag.</li>
      <li><strong>Laat je team opvolgen</strong>: bij een signaal pakt je team de volgende stap op. Of kies <strong>Ik pak het zelf op</strong> of <strong>Gezien, niets doen</strong>.</li>
      <li><strong>Later</strong>: het verdwijnt uit je lijst tot de dag die jij kiest.</li></ul>
      <p>Vergist? Na elke knop kun je het ongedaan maken in de melding onderaan. Veel tegelijk? Kies <strong>Loop ze één voor één door</strong>.</p>
      <p class="footnote">Op een computer: 1 t/m 9 opent dat nummer. Eén voor één: J en K bladeren, G keurt goed of zegt ja, Esc stopt.</p>
      ${hulpNaar(ctx, "Naar Voor jou", "#/")}`],
    ["wie-aan-zet", "Wie is aan zet?", () => `
      <p>Elk item zegt wie aan zet is. Dezelfde kleuren zie je overal: <strong class="hulp-jij">oranje</strong> ben jij, <strong class="hulp-team">teal</strong> is je team.</p>
      <dl class="hulp-banen">
        <dt class="jij">● Jij</dt><dd>Klaar om te checken, een voorstel, een signaal of een taak voor jou.<small>In Claude of Notion: Wacht op review, Voorstel, of Open op jouw naam.</small></dd>
        <dt class="team">◐ Je team</dt><dd>Staat klaar voor het volgende werkmoment, of een specialist werkt eraan.<small>In Claude of Notion: Open of Bezig, met een specialist als eigenaar.</small></dd>
        <dt>○ Wacht</dt><dd>Op iets of iemand, soms tot een datum. Daarna komt het vanzelf terug.<small>In Claude of Notion: Wacht.</small></dd>
        <dt>✓ Afgerond</dt><dd><small>In Claude of Notion: Klaar.</small></dd></dl>
      <p>Iets naar een andere baan? Sleep het erheen, of kies <strong>Verplaats</strong> op de rij. Naar je team vraagt het aan wie, naar Wacht tot wanneer.</p>
      <p class="hulp-regel"><strong>De vaste regel:</strong> een mail, bericht, publicatie of iets anders wat niet terug te draaien is, doet je team nooit zelf. Het komt als ‘klaar om te checken’ of als voorstel bij jou.</p>
      ${hulpNaar(ctx, "Naar Acties", "#/acties")}`],
    ["vanzelf-werken", "Je werkmoment: zo werkt je team vanzelf", () => `
      <p>Je team werkt vanzelf op het moment dat jij in Claude plant: je <strong>werkmoment</strong>. Dat regel je één keer, in twee minuten.</p>
      ${stappenbladHtml(ctx || {}, false, { volledig: true })}
      <h3>Zo loopt één werkmoment</h3>
      <ol class="hulp-stappen"><li><strong>Het werkmoment begint.</strong> Bijvoorbeeld elke nacht, of om de paar uur.</li>
      <li><strong>Is er werk?</strong> Open werk voor een specialist, en vaste taken die aan de beurt zijn. Niets? Dan stopt het meteen.</li>
      <li><strong>Een specialist pakt het op.</strong> Het gaat naar ‘bezig’, zodat niets dubbel gebeurt.</li>
      <li><strong>Quality Control kijkt het na.</strong></li>
      <li><strong>Afgerond, of naar jou.</strong> Werk dat binnen blijft, rondt je team zelf af. Wat naar buiten gaat, komt bij jou.</li></ol>
      <p>Per werkmoment doet je team hooguit 3 open acties en 1 vaste taak.</p>
      <p class="hulp-regel"><strong>Let op:</strong> zonder werkmoment doet je team niets vanzelf, en je krijgt daar geen melding van. Daarom zie je bij Voor jou een waarschuwing als we je team een tijd niet zagen werken.</p>
      ${hulpNaar(ctx, "Is je team klaar?", "#/klaar")}`],
    ["vaste-taken", "Je vaste taken en je week", () => `
      <p>Een vaste taak is werk dat je team steeds opnieuw voor je doet, zonder dat je het hoeft te vragen. Elke taak heeft één specialist en één ritme.</p>
      <p>Ritmes: elk uur, om de 2 of 4 uur, elke dag, elke maandag, dinsdag, woensdag of vrijdag, en elke 1e van de maand. Op donderdag kan nog geen wekelijkse taak.</p>
      <p>Een taak draait nooit vaker dan je werkmoment. Werkt je team één keer per nacht, dan doet het die nacht één vaste taak. Staan er op één dag drie, dan schuiven er twee door. Laat je team dan vaker werken, zet een taak op een rustiger dag, of zet er tijdelijk een uit.</p>
      <p>Iets dat steeds terugkomt? Zeg het tegen je team:</p>${k("Maak hier een ritmetaak van: elke vrijdag mijn week samenvatten.")}
      <p class="hulp-regel"><strong>Advies:</strong> laat je team ’s nachts werken, dan staat het werk klaar als jij begint.</p>
      ${hulpNaar(ctx, "Naar je vaste taken", "#/vaste-taken")}`],
    ["voorbeelden", "Drie voorbeelden, stap voor stap", () => `<div data-hulp-vb-blok>${hulpVoorbeeldHtml()}</div>`],
    ["grote-klussen", "Grote klussen: specialisten na elkaar", () => `
      <p>Soms is iets te groot voor één specialist, zoals van marktonderzoek naar een getekende deal. Dan zet de Coördinator specialisten na elkaar in, met een nette overdracht tussen elke stap. Een ruitje <span class="hulp-ruit" aria-hidden="true"></span> is een moment waarop jij beslist.</p>
      <div class="hulp-ketens">${HULP_KETENS.map(x => hulpKetenHtml(schema, x)).join("")}</div>
      <p class="footnote">Niet elke specialist zit in elk pakket. Een keten met een stap buiten jouw modules kan je team niet draaien.</p>
      <p>Elke stap geeft hetzelfde door: het <strong>resultaat</strong>, de <strong>beslissingen en aannames</strong>, de <strong>open vragen</strong> en de <strong>aanbevolen vervolgstap</strong>. Quality Control controleert feiten, cijfers en alles richting een klant. Hooguit drie specialisten werken tegelijk.</p>
      <p>Zo start je er een:</p>${k("Draai de commerciële keten voor installatiebedrijven in Utrecht.")}`],
    ["opdracht", "Je team een opdracht geven", () => `
      <p>Zeg in Claude wat er moet gebeuren en voor wie:</p>${k("Zet een actie klaar voor de Researcher: zoek tien installatiebedrijven in Utrecht die groeien.")}
      <p>Je team zet er een actie van klaar. Bij het volgende werkmoment pakt de specialist hem op.</p>
      <p class="hulp-regel"><strong>Vuistregel:</strong> schrijf wat je een nieuwe collega zou appen. Tijdens het werkmoment kan je team niets navragen: er zit niemand aan het toetsenbord.</p>
      <p>Of doe het hier: <strong>Geef je team een opdracht</strong> vraagt alleen wat, wie en wanneer. Staat er al een taak op jouw naam die je team kan doen? Kies bij het item <strong>Geef aan je team</strong>.</p>
      ${hulpNaar(ctx, "Geef je team een opdracht", "#/opdracht")}`],
    ["daglink", "Daglink of inloggen?", () => `
      <table class="hulp-tabel"><thead><tr><th></th><th scope="col">Daglink</th><th scope="col">Inloggen</th></tr></thead><tbody>
        <tr><th scope="row">Waar</th><td>De link in je dagstart</td><td>dashboard.agentic-team.ai</td></tr>
        <tr><th scope="row">Hoe lang</th><td>24 uur</td><td>Tot je dit tabblad sluit</td></tr>
        <tr><th scope="row">Kijken</th><td>Ja</td><td>Ja</td></tr>
        <tr><th scope="row">Afhandelen</th><td>Nee</td><td>Ja</td></tr>
        <tr><th scope="row">Vaste taken aanpassen</th><td>Nee</td><td>Ja</td></tr>
        <tr><th scope="row">Collega's uitnodigen</th><td>Nee</td><td>De beheerder</td></tr></tbody></table>
      <p>Je logt in met het e-mailadres waarop je bent uitgenodigd, of met Google of Microsoft. Na het inloggen kom je terug op de pagina waar je was.</p>`],
    ["zeggen", "Wat je tegen je team kunt zeggen", () => `
      <p class="footnote">Kopieer een zin en plak hem in Claude.</p>
      <p class="hulp-klein">Je dag beginnen</p>${k("Start mijn dag.")}
      <p class="hulp-klein">Vaste taken aanzetten</p>${k("Zet mijn ritmetaken aan.")}
      <p class="hulp-klein">Een specialist inzetten</p>${k("Laat de Dealmaker mijn gesprek met De Vries voorbereiden.")}
      <p class="hulp-klein">Wie zit er in mijn team?</p>${k("Welke agents heb ik?")}
      <p class="hulp-klein">Hulp</p>${k("Help me mijn team gebruiken.")}`],
    ["werkt-niet", "Het werkt niet zoals je verwacht", () => `
      <dl class="hulp-vragen">
        <dt>Mijn team deed vannacht niets.</dt><dd>Kijk bij ‘Is je team klaar?’. Meestal staat het werkmoment in Claude niet (meer) aan, bijvoorbeeld na opnieuw koppelen of op een andere computer.</dd>
        <dt>Mijn team zegt dat de werkronde voor mijn licentie nog niet aanstaat.</dt><dd>Die zetten wij per team aan. Mail <span class="hulp-adres">support@agentic-team.ai</span>, dan regelen we het.</dd>
        <dt>Ik kan niet op de knoppen drukken.</dt><dd>Je kijkt met je daglink: die is alleen om te lezen. Log in met je e-mailadres; je komt terug waar je was.</dd>
        <dt>Een actie staat bij een collega.</dt><dd>Onder Acties staat ‘Bij collega's’. Wil je hem zelf doen, kies dan ‘Zet bij mij’.</dd>
        <dt>Mijn team reageert niet in Claude, of ik zie geen tools meer.</dt><dd>Begin een nieuw gesprek. Helpt dat niet, koppel je team dan opnieuw in Claude (Instellingen › Connectors).</dd>
        <dt>Mijn collega is uitgenodigd, maar komt er niet in.</dt><dd>Laat je collega inloggen met precies het adres waarop die is uitgenodigd. Sommige mailscanners klikken links al aan; stuur dan een nieuwe uitnodiging.</dd></dl>
      ${hulpNaar(ctx, "Is je team klaar?", "#/klaar")}`],
    ["gegevens", "Je gegevens: klanten, deals en contactpersonen", () => `
      <p>Onder <strong>Gegevens</strong> staat alles wat je team over je bedrijf bijhoudt: organisaties, contactpersonen, deals, projecten, gesprekken en notities.</p>
      <ul><li><strong>Bekijken:</strong> kies een soort en open een rij om alles te zien.</li>
      <li><strong>Aanpassen:</strong> alleen wat je verandert, wordt opgeslagen; de rest blijft staan. Vergist? Maak het ongedaan.</li>
      <li><strong>Toevoegen en verwijderen</strong> kan ook, als je bent ingelogd. Verwijderen kun je niet ongedaan maken.</li></ul>
      <p class="footnote">Welke gegevens er zijn, hangt af van je modules. Staan ze in Notion of een CRM, dan pas je ze daar aan.</p>
      ${hulpNaar(ctx, "Naar je gegevens", "#/data")}`],
    ["notion", "Je werkdata staat in Notion", () => `
      <p>Werk je met je eigen Notion of een CRM, dan staan je acties en vaste taken daar.</p>
      <ul><li><strong>Hier zie je</strong> wat je team deed (uit je teamfeed) en wat je dagstart samenvatte.</li>
      <li><strong>In Notion doe je</strong> het afhandelen, goedkeuren en je vaste taken aanpassen. Of vraag het je team in Claude.</li></ul>`],
    ["woorden", "Woorden die je in Claude of Notion ziet", () => `
      <dl class="hulp-woorden"><dt>Werkmoment</dt><dd>werkronde, of de geplande taak in Claude</dd><dt>Vaste taak</dt><dd>ritmetaak</dd>
      <dt>Klaar om te checken</dt><dd>Wacht op review</dd><dt>Bij je team</dt><dd>Open of Bezig, met een specialist als eigenaar</dd>
      <dt>Afgerond</dt><dd>Klaar</dd><dt>Specialist</dt><dd>agent</dd><dt>Dagstart</dt><dd>wat je team doet als je zegt ‘Start mijn dag’</dd>
      <dt>Coördinator</dt><dd>de specialist die je dag plant en grote klussen regisseert</dd><dt>Daglink</dt><dd>de link naar dit dashboard in je dagstart, 24 uur geldig</dd></dl>`],
  ];
}

const HULP_PLAAT = `<svg class="hulp-plaat" viewBox="0 0 520 110" role="img" aria-label="Jij vraagt, je team werkt, jij beslist">
  <rect class="kj" x="4" y="14" width="148" height="80" rx="12"/><text x="78" y="48" text-anchor="middle" font-weight="700" font-size="15">Jij vraagt</text><text class="sub" x="78" y="70" text-anchor="middle">in Claude</text>
  <path class="pijl" d="M158 54h20"/><path class="pijlkop" d="M178 49l8 5-8 5z"/>
  <rect class="kt" x="186" y="14" width="148" height="80" rx="12"/><text x="260" y="48" text-anchor="middle" font-weight="700" font-size="15">Je team werkt</text><text class="sub" x="260" y="70" text-anchor="middle">op je werkmoment</text>
  <path class="pijl" d="M340 54h20"/><path class="pijlkop" d="M360 49l8 5-8 5z"/>
  <rect class="kj" x="368" y="14" width="148" height="80" rx="12"/><text x="442" y="48" text-anchor="middle" font-weight="700" font-size="15">Jij beslist</text><text class="sub" x="442" y="70" text-anchor="middle">hier, bij Voor jou</text></svg>`;

/* #/hulp → { sectie: null }, #/hulp/daglink → { sectie: "daglink" }, anders null. */
function hulpDoel(hash) {
  const m = /^#\/hulp(?:\/([a-z-]+))?\/?$/.exec(String(hash || ""));
  return m ? { sectie: m[1] || null } : null;
}

/* Een "Hoe werkt dit?"-link voor bovenaan een scherm. */
function hoeWerktDitHtml(sectie, tekst = "Hoe werkt dit?") {
  return `<a class="hoe-werkt-dit" href="#/hulp/${sectie}"><span aria-hidden="true">?</span> ${esc(tekst)}</a>`;
}

function hulpZoekTekst(el) { return (el.textContent || "").replace(/\s+/g, " ").toLowerCase(); }

/* ctx mag null zijn: dan is dit de lege staat (geen daglink, geen login). */
function renderHulp(el, ctx, { sectie = null } = {}) {
  const secties = hulpSecties(ctx);
  const klaar = ctx && typeof klaarRegelHtml === "function" && ctx.bundle ? klaarRegelHtml(ctx) : "";
  el.innerHTML = `<div class="hulp">
    <h2 class="hulp-titel" tabindex="-1">Hoe werkt je team?</h2>
    <label class="hulp-zoek"><span class="sr-only">Zoek in de hulp</span>
      <input type="search" data-hulp-zoek placeholder="Zoek in de hulp, bijvoorbeeld ‘daglink’" autocomplete="off"></label>
    ${klaar}
    <section class="hulp-plaat-vak" data-hulp-intro>${HULP_PLAAT}</section>
    ${secties.map(([id, titel, html]) => `<details class="hulp-sectie" id="hulp-${id}" data-hulp-sectie="${id}"${id === sectie ? " open" : ""}>
      <summary>${esc(titel)}</summary><div class="hulp-binnen">${html()}</div></details>`).join("")}
    <p class="hulp-niets" data-hulp-niets hidden>Niets gevonden. Probeer een ander woord.</p>
    <p class="hulp-slot">Kom je er niet uit? Zeg in Claude: <strong>‘Help me mijn team gebruiken.’</strong> Of mail <span class="hulp-adres">support@agentic-team.ai</span>.</p>
  </div>`;

  // Zoeken filtert ter plekke: de open/dicht-stand van wat je al las blijft staan.
  const zoek = el.querySelector("[data-hulp-zoek]");
  zoek.addEventListener("input", () => {
    const z = zoek.value.trim().toLowerCase();
    let raak = 0;
    for (const d of el.querySelectorAll("[data-hulp-sectie]")) {
      const past = !z || hulpZoekTekst(d).includes(z);
      d.hidden = !past;
      if (past) raak++;
      if (z && past) d.open = true;
    }
    for (const x of el.querySelectorAll("[data-hulp-intro], .kc-samenvatting")) x.hidden = !!z;
    el.querySelector("[data-hulp-niets]").hidden = raak > 0;
  });

  el.onclick = async (e) => {
    const t = e.target.closest ? e.target : null;
    if (!t) return;
    const vb = t.closest("[data-hulp-vb]");
    const stap = t.closest("[data-hulp-stap]");
    const alles = t.closest("[data-hulp-alles]");
    if (vb || stap || alles) {
      if (vb) { hulpVoorbeeld = vb.getAttribute("data-hulp-vb"); hulpStap = -1; }
      if (stap) { const n = HULP_VOORBEELDEN[hulpVoorbeeld].stappen.length; hulpStap = hulpStap < n - 1 ? hulpStap + 1 : 0; }
      if (alles) hulpStap = -1;
      const blok = el.querySelector("[data-hulp-vb-blok]");
      blok.innerHTML = hulpVoorbeeldHtml();
      const terug = blok.querySelector(vb ? `[data-hulp-vb="${hulpVoorbeeld}"]` : "[data-hulp-stap]");
      if (terug) terug.focus({ preventScroll: true });
      // De knoppen plakken bovenaan; de stap die nu aan de beurt is, komt in beeld.
      const nu = blok.querySelector("li.nu");
      if (nu && nu.scrollIntoView) nu.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    const k = t.closest("[data-vt-kopieer]");
    if (k) {
      const gelukt = await kopieerTekst(k.getAttribute("data-vt-kopieer"));
      meld(gelukt ? "Gekopieerd. Plak het in Claude." : "Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.");
    }
  };

  if (sectie) {
    const doel = el.querySelector(`#hulp-${sectie}`);
    if (doel) {
      const kop = doel.querySelector("summary");
      if (doel.scrollIntoView) doel.scrollIntoView({ block: "start" });
      if (kop) kop.focus({ preventScroll: true });
      return;
    }
  }
  const titel = el.querySelector(".hulp-titel");
  if (titel) titel.focus({ preventScroll: true });
}

if (typeof module !== "undefined") {
  module.exports = { renderHulp, hulpDoel, hulpSecties, hoeWerktDitHtml, HULP_KETENS };
}
