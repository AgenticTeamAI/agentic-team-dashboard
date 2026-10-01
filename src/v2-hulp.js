/* Dashboard v2 — Hulp (#/hulp, #/hulp/<sectie>). Werkt zonder login en
 * zonder data; zonder werkruimte is dit de lege staat, met inloggen bovenaan.
 * Alleen wat echt zo werkt. Klanttaal: vaste taak, werkmoment, klaar om te
 * checken. Yorams uitleg (ritme, werkrondes, ketens) in de opbouw van het
 * ontwerp. */

const VOORBEELDEN = {
  stil: { tab: "Een deal die stilvalt", soort: "Vaste taak · elke week", titel: "Je team ziet wat jij mist",
    lede: "Een deal staat al weken in dezelfde fase en niemand heeft het gemerkt. De vaste taak van de Pipeline Manager wel.",
    stappen: [["Werkmoment", "De Pipeline Manager doet zijn vaste taak", "Hij vindt een deal die lang stilstaat, zonder recent contact.", "team"],
      ["Werkmoment", "Hij zet een signaal voor je klaar", "Op jouw naam, met één zin waarom het belangrijk is.", "jij"],
      ["Als jij kijkt", "Het staat bij Voor jou", "Met de knoppen Laat je team opvolgen, Ik pak het zelf op en Gezien, niets doen.", "jij"],
      ["Als jij kiest", "Laat je team opvolgen", "Er komt een actie bij je team: de volgende stap voor deze deal.", "team"],
      ["Volgende werkmoment", "Het concept staat klaar om te checken", "Nagekeken en op jouw naam, omdat het een bericht aan een klant is.", "jij"],
      ["Als jij wilt", "Jij verstuurt", "De deal beweegt weer.", "klaar"]] },
  notes: { tab: "Gespreksnotities worden acties", soort: "Zo kun je je team gebruiken", titel: "Van gespreksnotities naar een lijst die zichzelf afwerkt",
    lede: "Je komt uit een klantgesprek met een pagina aantekeningen. In plaats van zelf een lijstje te maken, geef je de notities aan je team.",
    stappen: [["Na het gesprek", "Jij plakt je notities in Claude", "“Maak hier acties van en koppel ze aan de deal.”", "jij"],
      ["Direct", "Elke afspraak wordt een actie", "Met een eigenaar en een deadline. Werk voor jou komt op jouw naam, werk voor een specialist bij je team.", "team"],
      ["Volgende werkmoment", "De Dealmaker pakt zijn deel op", "Hij zet je notities om in een diagnose en een eerlijke inschatting, bij de deal.", "team"],
      ["Volgende werkmoment", "De Outreach Specialist schrijft de follow-up", "Een conceptmail die laat zien dat je goed geluisterd hebt. Hij verstuurt niets.", "team"],
      ["Na de controle", "De mail staat klaar om te checken", "Quality Control keek feiten en toon na. De mail gaat naar buiten, dus hij wacht op jou.", "jij"],
      ["Als jij kijkt", "Hij staat bij Voor jou", "Je past één zin aan, verstuurt de mail zelf en drukt op de knop.", "klaar"]] },
  fact: { tab: "Facturen op vrijdag", soort: "Vaste taak · elke vrijdag", titel: "De facturatie ligt klaar voordat je eraan denkt",
    lede: "Elke vrijdag loopt Administratie je openstaande facturen na. Jij hoeft alleen nog te kijken en te versturen.",
    stappen: [["Vrijdag, vroeg", "Administratie doet zijn vaste taak", "Hij kijkt welke facturen openstaan en welke over de termijn zijn.", "team"],
      ["Vrijdag, vroeg", "Herinneringen staan klaar", "Als concept, bij de juiste klant. Er wordt niets verstuurd.", "team"],
      ["Vrijdag, ochtend", "Klaar om te checken bij Voor jou", "De concepten om te versturen, plus de vragen die alleen jij kunt beantwoorden.", "jij"],
      ["Als het jou uitkomt", "Jij verstuurt", "Een factuur of herinnering versturen blijft altijd jouw knop.", "klaar"]] },
};
const PIL_VB = { jij: ["pil jij", "Jij aan zet"], team: ["pil team", "Je team"], klaar: ["pil ok", "Afgerond"] };
function vbHtml() {
  const k = VOORBEELDEN[S.ui.hulp.vb] ? S.ui.hulp.vb : "stil"; const v = VOORBEELDEN[k]; const pos = S.ui.hulp.stap; const n = v.stappen.length;
  return `<div class="keuzes" role="group" aria-label="Voorbeeld">${Object.entries(VOORBEELDEN).map(([key, x]) => `<button class="keuze" data-act="vb" data-v="${key}" aria-pressed="${key === k}">${esc(x.tab)}</button>`).join("")}</div>
    <div class="kol" style="gap:6px"><span class="klein kleur-jij" style="font-weight:700">${esc(v.soort)}</span><h3>${esc(v.titel)}</h3><p class="stil">${esc(v.lede)}</p></div>
    <ol class="tijdlijn">${v.stappen.map((s, i) => `<li class="${pos < 0 ? "" : i === pos ? "cur" : i > pos ? "dim" : ""}"><span class="wn">${esc(s[0])}</span><div class="wt"><b>${esc(s[1])}</b><span>${esc(s[2])}</span><br><span class="${PIL_VB[s[3]][0]}">${PIL_VB[s[3]][1]}</span></div></li>`).join("")}</ol>
    <div class="rijtje"><button class="knop" data-act="vb-stap">${pos < 0 ? "Loop het stap voor stap door" : pos < n - 1 ? "Volgende stap" : "Opnieuw"}</button>${pos >= 0 ? '<button class="knop stil" data-act="vb-alles">Toon alles</button>' : ""}<span class="mono klein stil" aria-live="polite">${pos < 0 ? n + " stappen" : "stap " + (pos + 1) + " van " + n}</span></div>`;
}
function naar(label, r) {
  if (!CTX) return kanInloggen() ? `<button class="knop" style="align-self:flex-start" data-act="login">Log in om dit te zien</button>` : "";
  return `<button class="knop" style="align-self:flex-start" data-act="go" data-r="${r}">${esc(label)} ${ic("chev", "klein")}</button>`;
}
const KETENS = [
  { naam: "Van onderzoek naar getekende deal", stappen: ["researcher", "pipeline-manager", "outreach-specialist", "dealmaker", "delivery-architect"] },
  { naam: "Van idee naar publicatie", stappen: ["marktmaker", "seo-geo-specialist", "de-stem", "content-strateeg"],
    poorten: { "seo-geo-specialist": "jij kiest het idee", "de-stem": "jij keurt de hoek goed", "content-strateeg": "jij keurt de versie goed die Quality Control zag" }, slot: "Jij publiceert" },
  { naam: "Van deal naar tevreden klant", stappen: ["dealmaker", "delivery-architect", "customer-success-manager"] },
];
function ketenHtml(k) {
  const schema = (CTX && CTX.schema) || (typeof AGENTIC_TEAM_SCHEMA !== "undefined" ? AGENTIC_TEAM_SCHEMA : null);
  const naam = (slug) => { const a = schema && schema.agents.find(x => x.slug === slug); return a ? a.displayName : slug; };
  const delen = [];
  k.stappen.forEach((s, i) => {
    if (i) delen.push('<span class="pijltje" aria-hidden="true">›</span>');
    delen.push(`<span class="station">${esc(naam(s))}</span>`);
    if (k.poorten && k.poorten[s]) delen.push(`<span class="ruit" role="img" aria-label="${esc(k.poorten[s])}" title="${esc(k.poorten[s])}"></span>`);
  });
  if (k.slot) delen.push(`<span class="pijltje" aria-hidden="true">›</span><span class="station jijst">${esc(k.slot)}</span>`);
  return `<div><b class="klein">${esc(k.naam)}</b><div class="keten">${delen.join("")}</div></div>`;
}
function hulpSecties() {
  const k = kopieerBlok;
  return [
    ["in-een-minuut", "Je team in één minuut", () => `
      <p>Je team bestaat uit specialisten, elk met een eigen vak: van je deals tot je facturen. Ze werken op twee manieren.</p>
      <ul><li><b>Als je het vraagt.</b> Je praat gewoon met Claude. Past je vraag bij een vakgebied, dan pakt de juiste specialist hem op en zegt hij wie hij is. Je hoeft zelf niemand te kiezen.</li>
      <li><b>Vanzelf, op vaste momenten.</b> Terwijl jij iets anders doet, loopt je team het open werk en je vaste taken langs. Dat heet je werkmoment.</li></ul>
      <p>Wat naar buiten gaat, zoals een mail, een post of een factuur, komt altijd eerst bij jou. Je team verstuurt, publiceert of betaalt nooit zelf.</p>
      ${CTX ? `<div class="chiprij">${teamLeden().slice(0, 12).map(s => agChip(s)).join("")}</div>` : ""}
      <h4 class="vakkop">Waarom dit helpt</h4><ul><li>Het werk loopt door als jij er niet bent. Jij beslist, je zoekt niet meer.</li><li>Eén lijst in plaats van tien chats.</li><li>Niets gaat naar buiten zonder jou.</li></ul>
      ${naar("Naar Voor jou", "/")}`],
    ["voor-jou", "Voor jou: goedkeuren, aanpassen, terugsturen", () => `
      <p>Bij <b>Voor jou</b> staat alles wat op jouw beslissing wacht, genummerd. Het nummer blijft staan tot je ververst. Elke knop zegt wat er gebeurt:</p>
      <ul><li><b>Goedgekeurd, ik verstuur hem zelf</b> (of <b>ik plaats hem zelf</b>): voor mails en posts. Kopieer de tekst, verstuur of plaats hem zelf en druk dan op de knop.</li>
      <li><b>Goedkeuren</b>: voor werk dat binnen blijft, zoals een opzet of een overzicht.</li>
      <li><b>Terug naar …</b>: je schrijft in één zin wat anders moet. De specialist pakt het bij het volgende werkmoment opnieuw op, met jouw opmerking erbij.</li>
      <li><b>Zelf aangepast</b> (onder Meer): je paste het zelf aan en rondt af. Eén zin over wat je veranderde, helpt je team.</li>
      <li><b>Ja, doe maar</b> of <b>Nee, niet doen</b>: voor voorstellen. Bij ja gaat de specialist aan de slag.</li>
      <li><b>Laat je team opvolgen</b>: bij een signaal pakt je team de volgende stap op. Of kies <b>Ik pak het zelf op</b> of <b>Gezien, niets doen</b>.</li>
      <li><b>Later</b>: het verdwijnt uit je lijst tot de dag die jij kiest.</li></ul>
      <p>Vergist? Na elke knop kun je het ongedaan maken, ook later nog onder ‘Vandaag afgehandeld’. Veel tegelijk? Kies <b>Loop ze één voor één door</b>.</p>
      <p class="klein stil">Op een computer: 1 t/m 9 opent dat nummer, G keurt goed of zegt ja, T stuurt terug, J en K gaan naar het volgende of vorige item, Ctrl/Cmd+Z maakt ongedaan, Esc sluit.</p>${naar("Naar Voor jou", "/")}`],
    ["wie-aan-zet", "Wie is aan zet?", () => `
      <p>Elk item zegt wie aan zet is. Dezelfde kleuren zie je overal: <b class="kleur-jij">oranje</b> ben jij, <b class="kleur-team">teal</b> is je team.</p>
      <div class="banenuitleg">
       <div class="bu j"><span class="vorm" aria-hidden="true">●</span><div><b>Jij</b> · klaar om te checken, voorstel, signaal of taak voor jou<small>In Claude of Notion: Wacht op review · Voorstel · Open op jouw naam</small></div></div>
       <div class="bu t"><span class="vorm" aria-hidden="true">◐</span><div><b>Je team</b> · staat klaar voor het volgende werkmoment, of een specialist werkt eraan<small>In Claude of Notion: Open of Bezig, met een specialist als eigenaar</small></div></div>
       <div class="bu"><span class="vorm" aria-hidden="true">○</span><div><b>Wacht</b> · op iets of iemand, soms tot een datum; daarna komt het vanzelf terug<small>In Claude of Notion: Wacht</small></div></div>
       <div class="bu"><span class="vorm" aria-hidden="true">✓</span><div><b>Afgerond</b><small>In Claude of Notion: Klaar</small></div></div></div>
      <p>Iets naar een andere baan? Sleep het erheen op het bord, of kies <b>Verplaats</b>. Naar je team vraagt het aan wie, naar Wacht tot wanneer.</p>
      <p class="contextregel"><b>De vaste regel:</b> een mail, bericht, publicatie of iets anders wat niet terug te draaien is, doet je team nooit zelf. Het komt als ‘klaar om te checken’ of als voorstel bij jou.</p>${naar("Bekijk wat nu aan jou is", "/acties")}`],
    ["vanzelf-werken", "Je werkmoment: zo werkt je team vanzelf", () => `
      <p>Je team werkt vanzelf op het moment dat jij in Claude plant: je <b>werkmoment</b>. Dat regel je één keer, in twee minuten.</p>
      <ol class="stappen"><li><div><b>Zeg in Claude tegen je team:</b>${k("Zet mijn ritmetaken aan.")}<span class="klein stil">Je team zet dan de vaste taken klaar die bij jouw modules horen. Staan ze er al, sla deze stap dan over.</span></div></li>
      <li><div><b>Je team stelt een geplande taak voor. Druk op Schedule.</b><span class="klein">Zie je die knop niet? Ga in Claude naar <b>Scheduled › New task</b>: elke dag, buiten werktijd (bijvoorbeeld 02:00), met deze opdracht:</span>${k(WERKMOMENT_OPDRACHT)}</div></li>
      <li><div><b>Klaar.</b><span>Na de eerste nacht staat bij Voor jou wat je team deed.</span></div></li></ol>
      <h4 class="vakkop">Zo loopt één werkmoment</h4>
      <ol class="stappen"><li><div><b>Het werkmoment begint</b><span class="stil">Bijvoorbeeld elke nacht, of om de paar uur.</span></div></li><li><div><b>Is er werk?</b><span class="stil">Open werk voor een specialist, en vaste taken die aan de beurt zijn. Niets? Dan stopt het meteen.</span></div></li>
      <li><div><b>Een specialist pakt het op</b><span class="stil">Het gaat naar ‘bezig’, zodat niets dubbel gebeurt.</span></div></li><li><div><b>Quality Control kijkt het na</b></div></li><li><div><b>Afgerond, of naar jou</b><span class="stil">Werk dat binnen blijft, rondt je team zelf af. Wat naar buiten gaat, komt bij jou.</span></div></li></ol>
      <p>Per werkmoment doet je team hooguit 3 open acties en 1 vaste taak.</p>
      <p class="contextregel"><b>Let op:</b> zonder werkmoment doet je team niets vanzelf, en je krijgt daar geen melding van. Daarom zie je bij Voor jou een waarschuwing als we je team een tijd niet zagen werken.</p>${naar("Is je team klaar?", "/team/klaar")}`],
    ["vaste-taken", "Je vaste taken en je week", () => `
      <p>Een vaste taak is werk dat je team steeds opnieuw voor je doet, zonder dat je het hoeft te vragen. Elke taak heeft één specialist en één ritme.</p>
      <p>Ritmes: elk uur, om de 2 of 4 uur, elke dag, elke maandag, dinsdag, woensdag of vrijdag, en elke 1e van de maand. Op donderdag kan nog geen wekelijkse taak.</p>
      <p>Een taak draait nooit vaker dan je werkmoment. Werkt je team één keer per nacht, dan doet het die nacht één vaste taak. Staan er op één dag drie, dan schuiven er twee door. Laat je team dan vaker werken, zet een taak op een rustiger dag, of zet er tijdelijk een uit.</p>
      <p>Iets dat steeds terugkomt? Zeg het tegen je team:</p>${k("Maak hier een ritmetaak van: elke vrijdag mijn week samenvatten.")}
      <p class="contextregel"><b>Advies:</b> laat je team ’s nachts werken, dan staat het werk klaar als jij begint.</p>${naar("Naar je vaste taken", "/team/vaste-taken")}`],
    ["voorbeelden", "Drie voorbeelden, stap voor stap", () => vbHtml()],
    ["grote-klussen", "Grote klussen: specialisten na elkaar", () => `
      <p>Soms is iets te groot voor één specialist, zoals van marktonderzoek naar een getekende deal. Dan zet de Coördinator specialisten na elkaar in, met een nette overdracht tussen elke stap. Een ruitje <span class="ruit" aria-hidden="true"></span> is een moment waarop jij beslist.</p>
      <div class="kol" style="gap:10px">${KETENS.map(ketenHtml).join("")}</div>
      <p class="klein stil">Niet elke specialist zit in elk pakket. Een keten met een stap buiten jouw modules kan je team niet draaien.</p>
      <p>Elke stap geeft hetzelfde door: het <b>resultaat</b>, de <b>beslissingen en aannames</b>, de <b>open vragen</b> en de <b>aanbevolen vervolgstap</b>. Quality Control controleert feiten, cijfers en alles richting een klant. Hooguit drie specialisten werken tegelijk.</p>
      <p class="klein">Zo start je er een:</p>${k("Draai de commerciële keten voor installatiebedrijven in Utrecht.")}`],
    ["opdracht", "Je team een opdracht geven", () => `
      <p>Kies <b>Opdracht geven</b>: het vraagt alleen wat er moet gebeuren, wie het oppakt en voor wanneer. Bij het volgende werkmoment pakt de specialist het op; het resultaat zie je bij Voor jou.</p>
      <p>Of zeg het in Claude:</p>${k("Zet een actie klaar voor de Researcher: zoek tien installatiebedrijven in Utrecht die groeien.")}
      <p class="contextregel"><b>Vuistregel:</b> schrijf wat je een nieuwe collega zou appen. Tijdens het werkmoment kan je team niets navragen: er zit niemand aan het toetsenbord.</p>
      <p>Staat er al een taak op jouw naam die je team kan doen? Kies bij het item <b>Geef aan je team</b>.</p>${naar("Naar Acties", "/acties")}`],
    ["daglink", "Daglink of inloggen?", () => `
      <div class="tabel2" role="table" aria-label="Daglink of inloggen"><div class="h" role="columnheader"></div><div class="h" role="columnheader">Daglink</div><div class="h" role="columnheader">Inloggen</div>
       <div class="h" role="rowheader">Waar</div><div>De link in je dagstart</div><div>dashboard.agentic-team.ai</div>
       <div class="h" role="rowheader">Hoe lang</div><div>24 uur</div><div>Tot je dit tabblad sluit</div>
       <div class="h" role="rowheader">Kijken</div><div>Ja</div><div>Ja</div>
       <div class="h" role="rowheader">Afhandelen</div><div>Nee</div><div>Ja</div>
       <div class="h" role="rowheader">Vaste taken aanpassen</div><div>Nee</div><div>Ja</div>
       <div class="h" role="rowheader">Collega's uitnodigen</div><div>Nee</div><div>De beheerder</div></div>
      <p>Je logt in met het e-mailadres waarop je bent uitgenodigd, of met Google of Microsoft. Na het inloggen kom je terug op de pagina waar je was.</p>`],
    ["zeggen", "Wat je tegen je team kunt zeggen", () => `
      <p class="klein stil">Kopieer een zin en plak hem in Claude.</p>
      <b class="klein">Je dag beginnen</b>${k("Start mijn dag.")}
      <b class="klein">Vaste taken aanzetten</b>${k("Zet mijn ritmetaken aan.")}
      <b class="klein">Een vaste taak erbij</b>${k("Maak hier een ritmetaak van: elke vrijdag mijn week samenvatten.")}
      <b class="klein">Een specialist inzetten</b>${k("Laat de Dealmaker mijn gesprek met De Vries voorbereiden.")}
      <b class="klein">Wie zit er in mijn team?</b>${k("Welke agents heb ik?")}
      <b class="klein">Hulp</b>${k("Help me mijn team gebruiken.")}`],
    ["werkt-niet", "Het werkt niet zoals je verwacht", () => `
      <div class="kol" style="gap:10px">
      <div><b>Mijn team deed vannacht niets.</b><p class="stil">Kijk bij ‘Is je team klaar?’. Meestal staat het werkmoment in Claude niet (meer) aan, bijvoorbeeld na opnieuw koppelen of op een andere computer.</p></div>
      <div><b>Mijn team zegt dat de werkronde voor mijn licentie nog niet aanstaat.</b><p class="stil">Die zetten wij per team aan. Mail <span class="mono" style="user-select:all">support@agentic-team.ai</span>, dan regelen we het.</p></div>
      <div><b>Ik kan niet op de knoppen drukken.</b><p class="stil">Je kijkt met je daglink: die is alleen om te lezen. Log in met je e-mailadres; je komt terug waar je was.</p></div>
      <div><b>Een actie staat bij een collega.</b><p class="stil">Onder Acties staat ‘Bij collega's’. Open het item en kies bij Alle gegevens op wiens naam het staat.</p></div>
      <div><b>Mijn team reageert niet in Claude, of ik zie geen tools meer.</b><p class="stil">Begin een nieuw gesprek. Helpt dat niet, koppel je team dan opnieuw in Claude (Instellingen › Connectors).</p></div>
      <div><b>Mijn collega is uitgenodigd, maar komt er niet in.</b><p class="stil">Laat je collega inloggen met precies het adres waarop die is uitgenodigd. Sommige mailscanners klikken links al aan; stuur dan een nieuwe uitnodiging.</p></div></div>
      ${naar("Is je team klaar?", "/team/klaar")}`],
    ["gegevens", "Je gegevens: klanten, deals en contactpersonen", () => `
      <p>Onder <b>Gegevens</b> staat alles wat je team over je bedrijf bijhoudt: organisaties, contactpersonen, deals, projecten, gesprekken en notities.</p>
      <ul><li><b>Doorklikken:</b> open een organisatie en je ziet alles op één plek: wat er loopt, wie je er kent, wat je team voor ze deed en wat er nog op je wacht.</li>
      <li><b>Aanpassen:</b> druk bij een veld op ‘wijzig’. Je past één veld tegelijk aan; de rest blijft staan. Vergist? Maak het ongedaan.</li>
      <li><b>Toevoegen:</b> een nieuwe organisatie, contactpersoon, deal of notitie. Of laat je team de gegevens aanvullen, met bron.</li>
      <li><b>Verwijderen:</b> onder Meer. Wat eraan hangt, zoals acties en contactpersonen, blijft bestaan. Verwijderen kun je niet ongedaan maken.</li></ul>
      <p class="klein stil">Welke velden er zijn, hangt af van je modules. Staan je gegevens in Notion of een CRM, dan pas je ze daar aan.</p>${naar("Naar je gegevens", "/gegevens")}`],
    ["notion", "Je werkdata staat in Notion", () => `
      <p>Werk je met je eigen Notion of een CRM, dan staan je acties en vaste taken daar. Het dashboard leest ze niet rechtstreeks.</p>
      <ul><li><b>Hier zie je</b> wat je team deed (uit je teamfeed) en wat je dagstart samenvatte, met per item een link naar Notion.</li>
      <li><b>In Notion doe je</b> het afhandelen, goedkeuren en je vaste taken aanpassen. Of vraag het je team in Claude.</li></ul>`],
    ["privacy", "Wat ziet dit dashboard?", () => PRIVACY_UITKLAP_ALINEAS.map(a => `<p>${esc(a)}</p>`).join("")],
    ["woorden", "Woorden die je in Claude of Notion ziet", () => `
      <dl class="woorden"><dt>Werkmoment</dt><dd>werkronde, of de geplande taak in Claude</dd><dt>Vaste taak</dt><dd>ritmetaak</dd><dt>Klaar om te checken</dt><dd>Wacht op review</dd><dt>Bij je team</dt><dd>Open of Bezig, met een specialist als eigenaar</dd><dt>Afgerond</dt><dd>Klaar</dd><dt>Specialist</dt><dd>agent</dd><dt>Dagstart</dt><dd>wat je team doet als je zegt ‘Start mijn dag’</dd><dt>Coördinator</dt><dd>de specialist die je dag plant en grote klussen regisseert</dd><dt>Daglink</dt><dd>de link naar dit dashboard in je dagstart, 24 uur geldig</dd></dl>`],
  ];
}
function htmlTekst(h) { return String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase(); }
const HULPPLAAT = `<svg class="hulpplaat" viewBox="0 0 520 110" role="img" aria-label="Jij vraagt, je team werkt, jij beslist">
  <rect class="kj" x="4" y="14" width="148" height="80" rx="12"/><text x="78" y="46" text-anchor="middle" font-weight="700" font-size="15">Jij vraagt</text><text class="sub" x="78" y="68" text-anchor="middle">in Claude, of hier</text>
  <path class="pijl" d="M158 54h20"/><path class="pijlkop" d="M178 49l8 5-8 5z"/>
  <rect class="kt" x="186" y="14" width="148" height="80" rx="12"/><text x="260" y="46" text-anchor="middle" font-weight="700" font-size="15">Je team werkt</text><text class="sub" x="260" y="68" text-anchor="middle">op je werkmoment</text>
  <path class="pijl" d="M340 54h20"/><path class="pijlkop" d="M360 49l8 5-8 5z"/>
  <rect class="kj" x="368" y="14" width="148" height="80" rx="12"/><text x="442" y="46" text-anchor="middle" font-weight="700" font-size="15">Jij beslist</text><text class="sub" x="442" y="68" text-anchor="middle">hier, bij Voor jou</text></svg>`;
function renderHulp() {
  const p = parts(); const doel = p[1]; const z = S.ui.hulp.zoek.trim().toLowerCase();
  const secties = hulpSecties().map(([id, t, f]) => [id, t, f()]).filter(([, t, h]) => !z || (t + " " + htmlTekst(h)).toLowerCase().includes(z));
  const kc = CTX && toegang() !== "notion" && S.data ? klaarCheck() : null;
  const leeg = S.leeg;
  const kop = !CTX
    ? `<div class="balk ${leeg && leeg.fout ? "fout" : "geen"}" role="status"><div><b>${esc((leeg && leeg.titel) || "Open je dashboard via de link in je dagstart, of log in.")}</b>${leeg && leeg.tekst ? `<p style="margin-top:4px">${esc(leeg.tekst)}</p>` : ""}</div>
      ${leeg && leeg.bezig ? "" : `<div class="rijtje">${kanInloggen() ? `<button class="knop prim" data-act="login">Inloggen</button><span class="klein stil">Met je e-mailadres, Google of Microsoft.</span>` : `<span class="klein stil">Vraag je Coördinator in Claude om een daglink.</span>`}</div>`}
      <p class="klein stil">${esc(PRIVACY_LEGE_STAAT)}</p></div>`
    : `<button class="link" data-act="go" data-r="${S.hist.length ? "__terug" : "/"}">${ic("links", "klein")} Terug</button>`;
  const versie = document.querySelector('meta[name="at-schema"]');
  return `<div class="inhoud" style="max-width:820px">${kop}
    <div class="tussen"><h2 class="titel" tabindex="-1" id="hulp-titel">Hoe werkt je team?</h2></div>
    <div class="zoek">${ic("zoek")}<input type="search" id="hulp-zoek" data-input="hulpzoek" placeholder="Zoek in de hulp, bijvoorbeeld ‘daglink’" value="${esc(S.ui.hulp.zoek)}" aria-label="Zoek in de hulp"></div>
    ${kc && !z ? `<button class="regel" data-act="go" data-r="/team/klaar"><span class="rl"><b>Is je team klaar? ${kc.ok} van ${kc.totaal}</b><span>${kc.totaal - kc.ok ? "Bekijk wat er nodig is" : "Alles in orde"}</span></span>${ic("chev")}</button>` : ""}
    ${!z ? `<section class="vak" style="display:flex;flex-direction:column;gap:8px"><h2 class="vakkop">Zo werkt je team</h2>${HULPPLAAT}</section>` : ""}
    ${secties.map(([id, t, h]) => `<details class="hsec" id="h-${id}" ${S.ui.hulp.open[id] || z || doel === id ? "open" : ""} data-hsec="${id}"><summary>${esc(t)}${ic("chev")}</summary><div class="binnen">${h}</div></details>`).join("") || '<p class="stil">Niets gevonden. Probeer een ander woord.</p>'}
    <section class="vak"><p>Kom je er niet uit? Zeg in Claude: <b>‘Help me mijn team gebruiken.’</b> Of mail <span class="mono" style="user-select:all">support@agentic-team.ai</span>.</p></section>
    ${versie ? `<p class="klein stil">Teamdefinitie: schemaversie ${esc(versie.getAttribute("content"))}. Je connector kan een nieuwere versie draaien.</p>` : ""}</div>`;
}
