# Agentic Team Dashboard

Eén gebouwd HTML-bestand (`dashboard.html`) dat laat zien hoe een
Agentic Team ervoor staat. Het staat als vaste pagina op
**dashboard.agentic-team.ai** (f15 — deze repo heeft een eigen
Vercel-project, zie §Eén bron hieronder). Het dashboard **bevat geen
data** — het leest, toont en rekent, en is nooit de bron van iets. Alle
gegevens komen live uit de eigen werkruimte-instantie van de klant (f18),
via een daglink van de Coördinator. **Dat is de enige route**: elke klant
heeft een werkruimte, dus er is geen bestandsupload, geen Excel-werkboek en
geen los offline-bestand (besluit 25-08-2026).

**De homepage is een dashboard, geen rapport.** Bovenaan vier KPI-tegels, een
gestapelde staafgrafiek van activiteit per week, drie balken die de
adoptiescore herleiden, een korte aandachtlijst (max. vijf) en een
gerangschikte staafgrafiek van gebruik per agent — allemaal getekend als
inline SVG, zonder Chart.js/D3/canvas-library. De tekst, de voetnoten en de
volledige zone-inhoud van de vorige opzet zijn niet weg: ze zitten achter de
doorklik. Klik op een tegel of een grafiek en je krijgt de uitgebreide,
herkomst-per-getal-versie op een detailpagina (client-side, `#/detail/...`),
met een link terug naar het dashboard.

Het onderliggende ontwerpdocument is intern en maakt geen deel uit van deze
repo.

## Snel starten

De Coördinator geeft je bij de dagstart een daglink naar
`dashboard.agentic-team.ai` die de pagina met je gegevens er al in opent.
Zonder (of met een verlopen) daglink toont de pagina alleen de uitleg om er
een te vragen.

Lokaal ontwikkelen zonder echte werkruimte: `node scripts/mock-instantie.mjs`
start een nep-instantie die de fictieve fixture uit `testdata/` serveert
(zie `testdata/README.md`) en drukt een daglink af waarmee je de lokaal
gebouwde `dashboard.html` opent.

## Wat er in deze repo staat

```
dashboard.html          → HET gebouwde artefact dat Vercel serveert.
src/                     → bronbestanden waaruit dashboard.html gebouwd wordt
  shell.html             → HTML-skelet met __PLACEHOLDERS__ (homepage + detail-view)
  styles.css              → huisstijl (zie §Vormgeving)
  schema-helpers.js       → matching van domeinen/agents op het schema
  werkruimte-loader.js    → de enige route: leest de interne bundelvorm live uit de
                             eigen werkruimte-instantie, via een daglink (zie §De
                             werkruimte-route)
  zones.js                → alle berekeningen (puur, geen DOM): de vijf zones, de
                             adoptiescore (ritme/breedte/opvolging), activiteit per
                             week, tijdwinst-som, gebruik-per-agent-ranglijst — dit
                             ís de rij-berekening die metrics.js verpakt
  metrics.js               → de interne metricsvorm (zie §De interne metricsvorm
                             hieronder): werkdata-rijen -> metrics (hergebruikt
                             zones.js) én kant-en-klaar metricsbestand uit het domein
                             dashboard_metrics -> metrics (inclusief de versiecontrole)
  render.js               → tekent de vijf zoneberekeningen naar DOM (nu: detail-inhoud),
                             plus de "onbekende versie"-melding
  charts.js                → inline-SVG-grafiekbouwers (gestapelde staaf, horizontale staaf) — puur, geen DOM
  homepage.js              → KPI-tegels, grafiekpanelen, adoptiescore-balken, detail-router
  app.js                  → wiring: daglink laden, periode (weken), minuten-per-actie,
                             hash-routering, en de keuze tussen rijen en metricsbestand
schema/
  schema.generated.js     → GEGENEREERD uit core/agents.json — nooit met de hand bewerken
scripts/
  extract-schema.py       → regenereert schema.generated.js uit een verse clone
  generate-testdata.py    → genereert de fixture testdata/data/ (rijen per domein)
  generate-testdata-metrics.py → genereert de fixture testdata/notion-metrics/ (metricsbestand v1)
  mock-instantie.mjs      → lokale nep-werkruimte die de fixture serveert (ontwikkelen zonder klant)
  build.py                → plakt src/ + schema/ samen tot dashboard.html
testdata/                → testfixture (rijen, metricsbestand, teamfeed) voor tests en mock — zie testdata/README.md
```

## De vier tabs: Vandaag · Team · Data · Prestaties (f25)

Sinds f25 (26-08-2026) is de pagina ingedeeld op **één vraag per zone**, in
dezelfde volgorde op desktop en mobiel. De aanleiding: de bovenkant gaf
antwoord op "hoe goed gebruik je ons product?" terwijl de gebruiker vraagt
"wat moet ik nu doen?".

| Tab | Route | Vraag | Inhoud |
|-----|-------|-------|--------|
| **Vandaag** | `#/` | wat moet ik nu doen? | statusregel · privacybelofte · Vraagt je aandacht (max 5) · feedstrook (3 berichten) · Opbrengst (acties afgerond + geschatte tijdwinst) |
| **Team** | `#/team` | wat deden ze? | de volledige teamfeed (f22) met agentfilter |
| **Data** | `#/data`, `#/data/<domein>` | wat staat er in mijn werkruimte? | alleen-lezen browser over de al opgehaalde bundel |
| **Prestaties** | `#/prestaties` | hoe staat mijn team ervoor? | Ritme van je team · subscores · activiteit per week · gebruik per agent · periodekiezer · herkomst-uitklap |

De detailroutes zijn **niet** gewijzigd: `#/detail/<key>` en
`#/detail/agent/<slug>` werken precies zoals ze werkten en blijven de
verdiepingslaag achter elke tegel en grafiek. `DETAIL_TAB` in `homepage.js`
bepaalt welke tab gemarkeerd blijft terwijl je een detailpagina open hebt.

Drie besluiten die je in de code terugziet:

- **"Adoptiescore" heet naar de klant toe "Ritme van je team"** en staat niet
  meer bovenaan: de score zegt iets over de gebruiker, niet over ons. De
  berekening is ongewijzigd — zelfde formules, zelfde narekenbare som.
- **Zakt het ritme onder de 70%, dan komt het wél omhoog** — als
  aandachtspunt in zone 1, want dan is het iets waar de gebruiker vandaag
  iets mee moet. Dat gebeurt in `voegRitmeToeAanAandacht()` (`zones.js`),
  aangeroepen op beide dataroutes in `metrics.js`, idempotent en nooit op een
  score die niet te berekenen is (`null` ≠ slecht).
- **De Data-tab is geen f23.** f23 (entries aanmaken/wijzigen/verwijderen) is
  geparkeerd tot p10/OAuth. De daglink heeft scope "lees" en dat is precies
  de eigenschap die hem veilig maakt om in een chat te delen. `databrowser.js`
  doet geen enkele extra fetch: het toont `bundle.domains`, dat de loader
  sowieso al ophaalt.

### Mobiel

Zes ingrepen, alle in `styles.css` onder `@media (max-width: 700px)`: de
tabbar plakt onderaan het scherm, KPI's staan 2×2 met de uitleg achter de tap
(elke tegel opent zijn eigen herkomstpagina), n.v.t.-tegels worden verborgen
(de reden staat in de herkomst-uitklap), grafieken en tabellen scrollen
horizontaal binnen hun eigen kader in plaats van onleesbaar te krimpen, de
kop klapt in bij scroll, en de uitlegtekst staat een stap verder naar achteren
dan de cijfers. De `min-width` op de SVG's is het punt van ingreep 4: zonder
die regel schaalt de hele grafiek mee omlaag en wordt de astekst ~4px.

## Geen telemetrie — harde voorwaarde, geen voorkeur

Dit dashboard belooft de bezoeker, **in de UI zelf op het moment dat de
belofte wordt gedaan**, dat zijn bedrijfsdata niet langs onze servers komt en
dat het dashboard zelf niets bewaart of verwerkt. Die tekst is woordelijk
goedgekeurd in de juridische toets van 26-08-2026 en staat op één plek:
`src/teksten.js` (`PRIVACY_REGEL` = de samenvatting, `PRIVACY_UITKLAP` = de
juridische tekst). Wijzig ze niet zonder een nieuwe toets.

Daaruit volgt: **geen analytics, geen foutrapportage, geen enkele meting die
naar ons gaat.** Zodra dat er wel is, is de tekst onjuist en moet hij mee
veranderen.

- `test/geen-telemetrie.test.js` bewaakt het gebouwde artefact: verboden
  patronen (sendBeacon, gtag, `_vercel/insights`, Sentry, PostHog, …), precies
  één `fetch` en die naar de eigen werkruimte, geen host buiten de
  allowlist, de CSP-grenzen, en of de goedgekeurde tekst er letterlijk in
  staat.
- **Vercel Web Analytics en Speed Insights staan uit** op zowel
  `agentic-team-dashboard` als `at-dashboard-staging`, en horen uit te
  blijven. Die zijn in het Vercel-dashboard aan te zetten **zonder
  codewijziging**; de hash-only `script-src` blokkeert het script dan wel,
  maar dat is een vangrail, niet de afspraak.
- Wat er wél lokaal in de browser wordt bewaard staat in de uitklaptekst en
  wordt door dezelfde test op vier sleutels vastgepind.

Wat de toets nadrukkelijk **niet** toestaat is een kale claim als "er gaat
niets naar agentic-team.ai": de pagina zelf komt van
`dashboard.agentic-team.ai`, met de gebruikelijke technische gegevens die
daarbij horen. Het onderscheid dat wél klopt — bedrijfsdata gaat alleen
browser ↔ eigen werkruimte-instantie, en het daglink-token staat achter het
`#` en bereikt nooit een server — moet in de tekst blijven staan.

## De panelen: KPI's, grafieken, ritme, tijdwinst

De panelen tonen, verdeeld over de Vandaag- en Prestaties-tab:

1. **KPI-tegels, gesplitst over twee tabs.** Op *Vandaag* staan de twee
   opbrengsttegels: acties afgerond (harde telling) en geschatte tijdwinst
   (zacht — de aanname staat erbij en de tegel is bewust lichter opgemaakt,
   zodat hij niet als meting leest). Op *Prestaties* staan ritme van je team,
   sporen in de gekozen periode en — alleen met `ctx.intern` — correctievrij.
   Elke tegel is klikbaar (`data-goto`) en springt naar zijn detailpagina.
2. **Vraagt je aandacht** — bovenaan de Vandaag-tab, want de aandachtszone
   hoort altijd te winnen van de scoreborden. Dezelfde berekening als zone 1,
   afgekapt tot vijf items, met een doorklik naar de volledige lijst.
3. **Activiteit per week** — gestapelde staafgrafiek (inline SVG, zie
   `charts.js`), standaard 12 weken. Series: Interacties·Datum,
   Dagverslagen·Dag, Lessen & Inzichten·Datum, Content Kalender·Publicatiedatum
   — elk uit hun eigen datumveld. Een week zonder spoor blijft staan als een
   gedimd, gestippeld streepje met het label "geen" — nooit weggelaten, want
   het gat is het signaal.
4. **Waar het ritme vandaan komt** — drie horizontale balken
   (Ritme/Breedte/Opvolging) met de subscores, plus één regel die de
   optelsom letterlijk uitschrijft. Die narekenregel blijft bewust bij het
   cijfer staan: dat is geen herkomst-voetnoot maar de belofte zelf.
5. **Gebruik per agent** — gerangschikte horizontale staafgrafiek. Ontbreekt
   het brongegeven (zie hieronder), dan een expliciet grijs blok met de
   reden, geen twintig balkjes op nul. Vanuit de detailpagina is elke agent
   **per agent doorklikbaar** (`#/detail/agent/<slug>`): kerncijfers
   (sporen in periode/totaal, laatste spoor) plus — bij werkdata-rijen — de
   onderliggende acties en lessen van die agent; een metricsbestand draagt
   alleen totalen en zegt dat er dan eerlijk bij.

Alle overige dataherkomst — bundelinfo, "niet in deze bundel"-waarschuwingen,
de reden achter elke n.v.t., de formules en de voorbehouden — staat gebundeld
in één uitklap **"Waar komen deze cijfers vandaan?"** onderaan de
Prestaties-tab (`renderHerkomst()`). Uit de tegels weg: daar woog de voetnoot
bijna even zwaar als het cijfer.

Geen cirkeldiagrammen. Statuskleuren (rood/oranje/groen) worden nergens voor
een grafiekserie gebruikt — series krijgen mint, licht mint en twee neutrale
tinten (zie `charts.js` → `CHART_SERIE_KLEUREN`).

Elke tegel/grafiek verhuist zijn tekstuele toelichting en herkomst-per-getal
naar een detailpagina achter een klikbare `#/detail/<sleutel>`-route
(client-side, geen server, geen paginaherlaad) — zie `homepage.js` →
`renderDetail*`/`app.js` → `renderDetail`. De vijf oorspronkelijke zones
(inclusief zone 2 Contextgezondheid, die niet meer los op de homepage staat)
zijn daar in volle, uitgeschreven vorm terug te vinden; er is niets
weggegooid, alleen verplaatst.

### De adoptiescore — exacte formule

Drie componenten, elk 0–100, over de gekozen periode (zie `zones.js` →
`computeRitme`/`computeBreedte`/`computeOpvolging`/`computeAdoptiescore`):

- **Ritme** = weken met minstens één spoor ÷ aantal weken in de periode. Een
  spoor is een rij met een (niet-toekomstige) datum in Dagverslagen, Lessen
  & Inzichten, Interacties of Content Kalender.
- **Breedte** = domeinen met minstens één rij ÷ 15 canonieke domeinen uit de
  registry. Dit component is **altijd** berekenbaar: een ontbrekend domein
  telt gewoon mee als "geen inhoud" voor dit specifieke component.
- **Opvolging** = acties met verstreken deadline én status "Klaar" ÷ acties
  met verstreken deadline.

De adoptiescore is het gemiddelde van de **afgeronde percentages** van de
componenten die berekenbaar zijn. Kan een component niet berekend worden
(bv. geen enkele actie met een verstreken deadline, of geen van de vier
ritme-brondomeinen aanwezig), dan telt hij **niet mee** in het gemiddelde en
toont de UI "niet te berekenen" — nooit een stille 0. Belangrijk detail: er
wordt gemiddeld over de *afgeronde* percentages (dezelfde getallen die op
het scherm staan), niet over de ruwe breuken — anders zou de zichtbare som
onder de balken niet kloppen met het getal in de KPI-tegel. Dat maakt de
adoptiescore letterlijk met de hand na te rekenen vanaf wat je ziet, wat de
eis was.

### De tijdwinst — een zichtbare som, geen meting

`computeTijdwinst()` telt uitsluitend: acties met status "Klaar" (totaal in
de bundel) × een minuten-per-actie-instelling die de gebruiker zelf verzet
(standaard 25, met een getalveld naast de KPI-tegel, onthouden in
`localStorage`). De UI toont de som letterlijk
(`29 afgeronde acties × 25 min = 725 min ≈ 12,1 uur`) en labelt het resultaat
als schatting op basis van de eigen aanname van de gebruiker — niet als
meting. Dit dashboard kan niet weten hoeveel tijd een actie kostte of zou
hebben gekost zonder het team; dat is met opzet niet verstopt.

### Gebruik per agent — eerlijk over een ontbrekend brongegeven

`computeAgentGebruikRanking()` controleert niet alleen of Acties/Lessen &
Inzichten aanwezig zijn, maar ook of het veld **Agent** daadwerkelijk gevuld
voorkomt in de data (niet: of het in het schema staat — een registryveld dat
in de praktijk leeg blijft is voor dit dashboard hetzelfde probleem). Blijkt
dat veld niet gevuld te zijn in geen enkele rij, dan toont de UI een
expliciet grijs blok met de reden, in plaats van twintig agents op "0". Dit
is bewust getest tegen een echte, niet-fictieve klantexport waarin het veld
Agent inderdaad niet voorkomt in Acties en Lessen & Inzichten (zie
§Getest hieronder) — die export zelf is nooit gecommit of gekopieerd.

## De interne metricsvorm en het metricsbestand (versie 1)

Aanleiding: de eerste echte Notion-export (zie
`ONTWERP-wekelijkse-dashboardbijwerking.md`, intern) kostte 55 minuten en
173.000 tokens, omdat elke rij van elk domein door het model ging om er een
paar honderd getallen uit te tellen. Dat is niet nodig — dit dashboard toont
tellingen en weekreeksen, geen rijen. De Notion-connector kan die tellingen
met een aggregatiequery aan de bron laten uitrekenen; alleen de uitkomst
komt terug.

**Eén interne vorm, twee manieren om hem te vullen** — beide uit de
werkruimte (zie `src/metrics.js` en `src/werkruimte-loader.js`):

| Werkdata staat in… | Hoe |
|---|---|
| de werkruimte zelf (rijen per domein) | `loadWerkruimteBundle()` haalt de rijen live op via de daglink; `buildMetricsFromRowsBundle()` rekent de metrics eruit — dit is precies `zones.js`, ongewijzigd, verpakt onder één naam |
| een extern systeem (Notion, eigen CRM) | de Coördinator schrijft bij de dagstart één al-berekend metricsbestand naar het domein `dashboard_metrics` (f24); `parseNotionMetricsFile()` leest dat — geen rij komt ooit in het geheugen |

`app.js` → `buildContext()` is de **enige** plek die weet welke van de twee
er draaide. Alles daarna (`render.js`, `homepage.js`) ziet uitsluitend het
platte resultaat: `z1..z5`, `activiteit`, `adopt`, `tijdwinst`,
`agentUsage`, `sporenTotaal`. Dat was ook al zo vóór deze wijziging (het was
gewoon de return van `buildContext()`); wat nieuw is, is dat dit stuk een
naam, een versienummer en een tweede vulmethode heeft gekregen.

### Het metricsbestand (versie 1)

```
{
  "type": "agentic-team-metrics", "versie": 1,
  "bron_label", "gegenereerd_op", "door",
  "periode": { "van", "tot", "weken" },
  "minuten_per_actie",
  "domeinen":   { "<domeinsleutel>": { "rijen", "laatst_bijgewerkt" } },
  "weekreeks":  { "bronnen": [...], "buckets": [{ "week_start", "label", "waarden": {...}, "totaal" }] },
  "agents":     { "veld_aanwezig", "per_agent": { "<slug>": { "aantal_periode", "aantal_totaal", "laatst" } } },
  "acties":     { "totaal", "afgerond", "verstreken", "klaar_verstreken", "opmerking" },
  "sales_funnel": { "per_fase": {...}, "verwachte_omzet_totaal", "opmerking" },
  "content":    { "gepubliceerd", "gepland_in_periode", "totaal" },
  "klantsucces":{ "in_onboarding", "totaal" },
  "backlog":    { "besloten", "done", "totaal" },
  "lessen":     { "totaal", "per_categorie": {...}, "open", "in_periode" },
  "bedrijfscontext": { "bron", "laatst_bijgewerkt", "placeholders_open": [...], "projectkennis_kopie_laatst_bijgewerkt" },
  "correctievrij": { "venster_dagen", "drempel_pct", "autonoom_afgerond", "gecorrigeerd", "heropend",
                     "weken": [{ "week_start", "autonoom_afgerond", "gecorrigeerd" }], "opmerking" },   // i25, optioneel
  "aandacht":   [ { "type", "ernst", "label", "link" } ],   // maximaal vijf, door de Coördinator samengesteld
  "waarschuwingen": [ "..." ]
}
```

Dit volgt het ontwerp-document letterlijk voor `periode`, `weekreeks`,
`agents`, `domeinen`, `aandacht`, `bedrijfscontext`, `gegenereerd_op`/`door`/
`versie`. Vier blokken zijn een **eigen toevoeging**, nodig omdat zone 4
(Opbrengst) en zone 5 (Leren) meer domeinen tonen dan het ontwerp-document
uitschreef: `sales_funnel`, `content`, `klantsucces`, `backlog`, `lessen`,
en binnen `acties` de velden `verstreken`/`klaar_verstreken` (nodig voor de
Opvolging-subscore van de adoptiescore — "hoeveel van de verlopen acties
zijn alsnog afgerond?"). Zonder die velden zou de metrics-route zone 4/5 en
een derde van de adoptiescore stil moeten weglaten. Ritme en Breedte worden
juist **niet** apart aangeleverd: die zijn client-side af te leiden uit
`weekreeks` resp. `domeinen`, met dezelfde formule als de andere twee
rijen (zie `buildAdoptFromMetrics()` in `metrics.js`) — minder velden om
mee te sturen, en de rekenregel blijft narekenbaar vanaf wat er in het
bestand staat.

#### correctievrij (i25)

Het blok `correctievrij` is de f9-succesmaat en de gate voor f19 fase 1+:
het aandeel acties dat een agent **autonoom** heeft afgerond (werkronde +
QC, daarna zelf op "Klaar" gezet) en dat daarna **niet door een mens is
gecorrigeerd**. Het domein Acties draagt hiervoor vanaf registry 1.34.0 de
velden `Afgerond door` (agentnaam, alleen gevuld bij autonome afronding),
`Afgerond op` (datum), `Gecorrigeerd` (checkbox, door een mens) en
`Correctie` (reden). Definitie, in beide routes identiek:

- `autonoom_afgerond` = acties met `Afgerond door` gevuld én `Afgerond op`
  binnen de laatste `venster_dagen` (28) tot en met vandaag;
- `heropend` = daarvan de acties met Status ≠ "Klaar";
- `gecorrigeerd` = daarvan de acties met `Gecorrigeerd` aangevinkt **óf**
  Status ≠ "Klaar" (heropend zit dus in gecorrigeerd). Een QC-afkeuring vóór
  de afronding telt niet — dat is het normale werkproces;
- percentage = (autonoom_afgerond − gecorrigeerd) / autonoom_afgerond × 100;
  `null` ("n.v.t.") als er geen autonoom afgeronde acties in het venster zijn;
- `weken` = de laatste vijf kalenderweken (maandag = `week_start`; vier
  afgesloten plus de lopende), oud → nieuw, elk met dezelfde twee tellingen;
- **gate**: de vier meest recente *afgesloten* weken (`week_start` + 7 dagen
  ≤ vandaag) hebben elk minstens één autonoom afgeronde actie én een
  weekpercentage ≥ `drempel_pct` (80). De KPI-tegel "Correctievrij (4 wk)"
  toont "Gate f19: gehaald ✓ (4/4 weken ≥ 80%)" of "nog niet — n/4 weken"
  met de reden op de detailpagina (bv. "week van 10-08 zat op 67%").

Het bestand draagt alleen de **tellingen**; percentage en gate rekent het
dashboard zelf uit, met precies dezelfde helper (`berekenCorrectievrij()` in
`zones.js`) als de rijenvariant (`computeCorrectievrij()`, die de tellingen uit
de Acties-rijen haalt). Een meegestuurd `percentage`-veld wordt door de
sanitizer weggelaten. Checkbox-waarden in rijen mogen `true`, `"true"`,
`"ja"`, `"x"`, `"__YES__"` of `1` zijn. Versie blijft 1: het blok is
additief en optioneel.

### Versiecontrole — nooit stil een verkeerd dashboard tekenen

`parseNotionMetricsFile()` herkent uitsluitend `"versie": 1`
(`METRICS_VERSION` in `metrics.js`). Bij een andere versie — ouder, nieuwer,
of geen versie te vinden — wordt er **niets berekend en niets getekend**:
geen homepage, geen detailpagina's, alleen een duidelijke melding
(`#version-error`, zie `renderVersionError()` in `render.js`) met wat er
gevonden is, wat dit dashboard verwacht, en wat je eraan kunt doen (bijwerken,
of een andere export vragen). Een bestand zonder `"versie"`- of `"type"`-
sleutel (bijvoorbeeld een leeg `{}`) krijgt dezelfde behandeling met een
eigen tekst
("niet herkend als metricsbestand"). Zie §Getest voor de drie geverifieerde
gevallen (geldig-met-gaten, onbekende versie, leeg bestand).

### Ontbrekende blokken — "bron ontbreekt", nooit nul

Elk blok is optioneel. Ontbreekt het, dan geldt dezelfde regel als bij
werkdata-rijen: het betreffende paneel toont waarom de brongegevens er
niet zijn, niet een verzonnen nul.

- Geen `agents`-blok → zone 3 (Gebruik) en de gebruik-per-agent-grafiek
  tonen "bron ontbreekt" (`agentUsage.status === "geen-bron"`), net als
  wanneer Acties/Lessen & Inzichten ontbreken in de werkruimte.
  `agents.veld_aanwezig: false` (blok wél aanwezig, maar het veld Agent
  staat nergens gevuld) geeft het aparte "geen-veld"-bericht — dezelfde
  twee toestanden als `computeAgentGebruikRanking()` al onderscheidde.
- Geen `weekreeks`-blok (of leeg) → activiteitengrafiek en de
  Ritme-subscore tonen "niet te berekenen"/"geen brondomeinen".
- Geen `domeinen`-blok → de Breedte-subscore toont "niet te berekenen";
  er is dan ook geen "verouderde domeinen"-regel mogelijk in zone 1.
- Geen `lessen`-blok → zone 5 toont "Lessen & Inzichten staat niet in deze
  bundel" (`z5.aanwezig === false`) — hetzelfde bericht als bij een
  ontbrekend domein in de werkruimte.
- Geen `bedrijfscontext`-blok → zone 2 toont dezelfde grijze
  "niet-ondersteund-door-bundel"-toestand als bij werkdata-rijen
  (`parseNotionMetricsFile()` roept hiervoor letterlijk dezelfde
  `computeZone2()` aan, met een tijdelijk object in plaats van rijen).
- Geen `acties`-blok → geen Opvolging-subscore, geen tijdwinst-KPI, geen
  Acties-kaart in zone 4.
- Geen `correctievrij`-blok → KPI-tegel toont n.v.t. met reden ("de
  Coördinator levert dit vanaf registry 1.34.0 aan bij de dagstart"); de
  detailpagina legt uit welke velden nodig zijn.

Een **leeg metricsbestand** (`{}`, geen `"versie"`, geen `"type"`) valt
onder §Versiecontrole hierboven, niet onder dit punt: dat bestand wordt
helemaal niet als metricsbestand herkend, dus wordt er niets getekend in
plaats van een dashboard vol "bron ontbreekt"-panelen.

### Periode en minuten-per-actie bij de metrics-route

De periodeschakelaar (8/12/24 weken) staat **uit** zodra de bundel uit een
metricsbestand kwam: de periode ligt vast in het bestand (`periode.weken`),
gekozen door wie de aggregatiequeries draaide, en dit dashboard kan dat niet
herberekenen zonder de rijen te zien. De schakelaar toont een `title` met
de reden. De minuten-per-actie-instelling blijft wél live aanpasbaar: de
tijdwinst-som heeft alleen `acties.afgerond` nodig (geen rijen), dus die kan
zonder nieuwe export herrekend worden.

## Het schema bijwerken

Het schema (de vijftien datadomeinen, hun veldnamen, en de agentlijst) staat
canoniek in `AgenticTeamAI/agent-architecture` → `core/agents.json` →
`datadomeinen`. Dit dashboard **typt dat nooit over** — het wordt afgeleid:

```bash
python3 scripts/sync-schema.py    # extraheert op origin/main van ../agent-architecture en zet de pin
python3 scripts/build.py          # bakt het nieuwe schema in dashboard.html
git add schema/ dashboard.html vercel.json agent-architecture.lock.json
```

`sync-schema.py` extraheert op een schone uitpak van precies één commit die
op `origin/main` van agent-architecture staat (niet op je werkkopie met
lokale wijzigingen), en schrijft die commit in `agent-architecture.lock.json`.
Welke build bij welke registry hoort staat dus in dat bestand, niet in deze
tekst — en de CI bewaakt het (zie §Tests en CI). Een token hoort alleen in de
clone-URL van agent-architecture, nooit in een bestand van deze repo.

## Tests en CI (s31)

De tests staan in `test/` en draaien met `npm test` (vitest; jsdom voor de
DOM-tests). Sinds s31 (25-08-2026) bewaakt `.github/workflows/ci.yml` bij
elke PR en push naar main:

- **test** — `test/integratie.test.js` draait de échte gebouwde
  `dashboard.html` in jsdom tegen een gestubde werkruimte-instantie (exact de
  vormen uit `scripts/mock-instantie.mjs`): werkdata-rijen, metricsbestand (vers /
  verouderd / onleesbaar / onbekende versie), teamfeed, onbekend domein, lege
  werkruimte, 401 en 500, interne tegels, hash-router en de periode- en
  minutenschakelaar. Daarnaast `test/xss.test.js` (b32),
  `test/correctievrij.test.js` (i25) en `test/kalenderdag.test.js` (b37).
- **build-drift** — `python3 scripts/build.py` moet `dashboard.html` en
  `vercel.json` (CSP-hashes) ongewijzigd laten; wie `src/` of `schema/`
  wijzigt zonder te herbouwen, faalt hier.
- **schema-drift** (ook dagelijks op schema, want deze drift ontstaat zonder
  commit in deze repo) — `schema/schema.generated.js` hoort bij de
  arch-commit in `agent-architecture.lock.json`, die commit moet op arch-main
  staan, en `core/agents.json` op main mag niet verder zijn dan de pin.
  Vereist het repo-secret `AGENT_ARCH_TOKEN` (read-only PAT op
  agent-architecture); ontbreekt het, dan faalt de job hard — een stil
  overgeslagen guard is een dode guard. Uit agent-architecture wordt geen
  code uitgevoerd, alleen `core/agents.json` gelezen.

## Bouwen

```bash
python3 scripts/build.py            # dashboard.html opnieuw genereren uit src/ + schema/
python3 scripts/build.py --noindex  # idem, met <meta name="robots" content="noindex"> (staging)
python3 scripts/generate-testdata.py          # testdata/data/ (fixture) opnieuw genereren
python3 scripts/generate-testdata-metrics.py  # testdata/notion-metrics/ (fixture) opnieuw genereren
```

Bewust **geen** npm/bundler-toolchain: `scripts/build.py` is een letterlijke
tekstsamenvoeging (shell + css + schema + js-modules, in vaste volgorde) —
dat is de hele build. Dat houdt de build netwerkloos en zonder toolchain:
Vercel draait exact hetzelfde script (zie §Eén bron).

Een nieuw bestand in `src/` moet op **drie** plekken worden aangemeld:
`JS_MODULES_IN_ORDER` in `scripts/build.py`, en de modulelijsten bovenin
`test/xss.test.js`, `test/correctievrij.test.js`, `test/kalenderdag.test.js` en
`test/f25-indeling.test.js` (die laden de src-modules zelf, in build-volgorde).

### Deploy: staging eerst

Geen git-integratie (Hobby-plan + privé-org-repo): handmatige CLI-deploys
vanaf een **schone clone**. Staging = Vercel-project `at-dashboard-staging`
(https://at-dashboard-staging.vercel.app), productie = `agentic-team-dashboard`
(dashboard.agentic-team.ai).

```bash
git clone -q --depth 1 <repo> deploy && cd deploy
rm -rf .git                                       # anders BLOCKED bij een niet-koppelbare commit-auteur
vercel link --yes --project at-dashboard-staging  # daarna pas: agentic-team-dashboard
vercel deploy --prod --yes --archive=tgz
```

`--prod` betekent hier "productie-alias binnen dát project"; zonder `--prod`
krijg je een preview-URL achter Vercel-SSO, waar een rooktest 401 op geeft.
Volgorde: PR → CI groen → staging-deploy + rooktest → akkoord → prod-deploy.
Prod-deploys alleen als een founder ze expliciet benoemt.

Staging staat op **noindex** via de omgevingsvariabele `DASHBOARD_NOINDEX=1`
op het staging-project; `vercel.json` geeft die door aan `build.py`. Het
gecommitte `dashboard.html` is bewust de variant *zonder* die meta — anders
faalt de CI-job `build-drift`.

## De vijf zones — herkomst en beslissing (nu: detailpagina's)

De vijf zones uit het ontwerp bestaan onveranderd — ze staan alleen niet
meer los naast elkaar op de homepage. Ze zijn de detailpagina's achter de
doorklik (`#/detail/aandacht`, `#/detail/context`, `#/detail/gebruik`,
`#/detail/opbrengst`, `#/detail/leren`), plus drie nieuwe detailpagina's
voor de dingen die uitsluitend op de homepage staan
(`#/detail/adoptiescore`, `#/detail/tijdwinst`, `#/detail/activiteit`).

| Zone | Beslissing die hij mogelijk maakt | Leest (domein → veld) |
|---|---|---|
| 1 · Aandacht | Waar besteed ik vandaag mijn halfuur aan? | Acties (Agent, Status, Deadline), Klantsucces (Health), Sales Funnel (Opvolg Status, Volgende Actie Deadline), de tijdstempel van elk domein, en (nieuw) zone 2 zelf wanneer die rood is |
| 2 · Contextgezondheid | Moet ik mijn bedrijfscontext bijwerken voordat ik het team weer aan het werk zet? | Het (nog niet in de registry gestandaardiseerde) bedrijfscontext-onderdeel van de bundel — zie §Bedrijfscontext hieronder |
| 3 · Gebruik | Welke agent laat ik links liggen, en waarom? | Acties (Agent, Deadline als proxy-tijdstip), Lessen & Inzichten (Agent, Datum) |
| 4 · Opbrengst | Levert dit team genoeg op om het te blijven betalen? | Acties (Status), Sales Funnel (Fase, Verwachte Omzet), Content Kalender (Status, Publicatiedatum), Klantsucces (Fase), Productbacklog (Besluit, Status) |
| 5 · Leren | Wat weet dit team nu dat het vorige maand niet wist? | Lessen & Inzichten (Categorie, Status, Datum) |

Elke kaart in de UI zelf toont ook zijn eigen footnote met de exacte
herkomst — dat hoeft niemand in deze README op te zoeken.

**Nieuw ten opzichte van de vorige versie:** zone 1 (Aandacht) nam zone 2's
rode signaal nog niet mee, terwijl het ontwerp dat wel voorschrijft ("alles
wat rood of grijs is uit de andere vier zones komt hier samen"). Dat is
gerepareerd via `voegContextToeAanAandacht()` in `zones.js` — puur
tekstueel samenvoegen van twee al-berekende resultaten, geen nieuwe
databron.

## Bedrijfscontext (zone 2) — een bewuste, gelabelde uitzondering

Zone 2 is expliciet vereist door het ontwerp, en de beslissing die hij
mogelijk maakt ("moet ik mijn context bijwerken?") is de belangrijkste van
de vijf. Maar **er bestaat nog geen domein "bedrijfscontext" in
`core/agents.json` → `datadomeinen`** — de S17-beslissing (bron van waarheid
= de databron, niet projectkennis) is genomen, maar de uitwerking (welk
formaat, wie beheert het — bij de Gids, backlogkaart f13) is nog niet
gebouwd.

Dit dashboard doet daarom het volgende, en dat is met opzet **anders dan een
letterlijke lezing van het ontwerp**:

- Is er een sectie/bestand met de naam `bedrijfscontext` in de bundel, dan
  wordt die gelezen (zie `rowsToBedrijfscontext`/`registerJsonDomain` in
  `src/werkruimte-loader.js`) en beoordeeld op: aanwezigheid van een bron,
  hoe lang geleden bijgewerkt, openstaande placeholders, en of een kopie in
  projectkennis ouder is dan de bron.
- **Ontbreekt** die sectie volledig uit de bundel, dan toont zone 2 een
  vierde, expliciet **niet-rode** toestand: "onbekend, dit onderdeel van de
  registry is nog niet uitgewerkt". Een letterlijke lezing van het ontwerp
  ("ontbreekt de context, dan is deze zone rood, niet grijs — we weten het
  wel") gaat ervan uit dat het dashboard kan zien dat de context *ontbreekt*.
  Zolang er geen gestandaardiseerd domein voor bestaat, kan dit dashboard
  dat onderscheid niet maken: een bundel zonder deze sectie kan een klant
  zonder context zijn, óf een klant wiens bundelformaat dit onderdeel nog
  niet meeneemt. Rood zou hier gokken zijn — en gokken is precies wat de
  eerlijkheidseis in het ontwerp verbiedt.
- Zodra f13/S17 een echt schema oplevert, hoort deze uitzondering te
  verdwijnen: voeg het domein toe aan `core/agents.json` → `datadomeinen`,
  regenereer `schema.generated.js`, en zone 2 kan het ontwerp weer
  letterlijk volgen (ontbreken = rood).

Het veldformaat dat dit dashboard nu leest (`Bron`, `Laatst_bijgewerkt`,
`Placeholders_ingevuld`, `Placeholders_open`,
`Projectkennis_kopie_laatst_bijgewerkt`) is dus **een voorstel, geen
vastgesteld schema** — zie ook de `_schema_opmerking`-sleutel die in de
testdata bij dit onderdeel staat.

## Wat ik bewust anders heb gedaan dan het ontwerp (en waarom)

1. **Bedrijfscontext-schema is provisorisch** — hierboven toegelicht. Enige
   manier om zone 2 wél te bouwen zonder een niet-bestaand registryveld te
   verzinnen en als vaststaand te presenteren.
2. **Het metricsbestand (versie 1) is vanuit de leeskant ontworpen.** De
   vorm in §De interne metricsvorm is hier bedacht; sinds f24 (24-08-2026)
   schrijft de Coördinator hem bij de dagstart naar `dashboard_metrics`.
   Wijzigt één van de twee kanten de vorm, meld dat dan en verhoog de
   versie — verander niet stilzwijgend één kant.
3. **Geen echte trend over tijd in zone 4/5, behalve waar een datumveld dat
   toelaat.** De bundel is een momentopname, geen gebeurtenislog, en dit
   dashboard mag niets cachen ("niets dat schrijft") — dus een trend over
   *meerdere keren openen* is uitgesloten. Waar een domein een bruikbaar
   datumveld heeft (Content Kalender → Publicatiedatum, Lessen & Inzichten →
   Datum), wordt daarmee wel binnen-bundel gebundeld per periode. Voor Sales
   Funnel bestaat geen wijzigingsgeschiedenis (geen "Fase sinds"-veld in de
   registry) — dat toont dit dashboard daarom als huidige verdeling, met een
   zichtbare kanttekening, in plaats van een trend te verzinnen die niet te
   onderbouwen is.
4. **Dagverslagen wordt niet gebruikt als gebruiksspoor in zone 3**, ondanks
   dat het ontwerp het noemt. Het domein heeft in de huidige registry geen
   `Agent`-veld (alleen `Persoon`, een mens) — er is dus geen agent aan een
   dagverslag-rij te koppelen. Gemeld, niet zelf een veld verzonnen.
   Zone 3 gebruikt daarom alleen Acties en Lessen & Inzichten.
5. **Zone 3 kan "module niet gebruikt" en "module niet aangeschaft" niet uit
   elkaar houden** — er is met opzet geen licentiecheck in dit dashboard, en
   dus geen manier om te weten welke modules een klant kocht. De UI zegt dit
   er expliciet bij in plaats van te doen alsof het onderscheid gemaakt kan
   worden.
6. **Acties.Deadline als proxy voor "wanneer ingezet"** in zone 3 en zone 4.
   Het domein Acties heeft geen aanmaakdatum-veld, alleen een deadline. Een
   deadline is niet hetzelfde als "wanneer de agent iets deed", en dat staat
   met opzet met een voetnoot in de UI, niet stilzwijgend als feit.
7. **Geen bundelnpm-toolchain** voor de "build" — zie §Bouwen.
8. **De periodeschakelaar is verzet van dagen naar weken (8/12/24, standaard
   12)**, één en dezelfde instelling voor zowel de homepage
   (activiteitengrafiek, adoptiescore, sporen-KPI) als de detailpagina's
   (die intern nog altijd op dagen rekenen — `periodDays = weken × 7`). Eén
   instelling in plaats van twee voorkomt dat de homepage en het detail een
   andere periode tonen zonder dat dat zichtbaar is.
9. **Breedte is altijd berekenbaar, Ritme en Opvolging soms niet.** Dat is
   geen inconsistentie: Breedte's "bron" is de bundel zelf (welke domeinen
   heeft hij), en die is per definitie altijd bekend — een ontbrekend domein
   is voor déze berekening gewoon "geen inhoud". Ritme en Opvolging hebben
   allebei een specifiek brondomein/-veld nodig (een van de vier
   ritme-domeinen, resp. een Acties-rij met een verstreken deadline) om
   überhaupt een noemer te hebben. Ontbreekt die, dan is er niets om op te
   rekenen — vandaar "niet te berekenen" in plaats van 0.
10. **Adoptiescore middelt over de afgeronde percentages, niet de ruwe
    breuken.** Bewuste keuze zodat de rekenregel die de UI toont ("het
    gemiddelde van de getallen die je hierboven ziet") ook klopt als je hem
    met de hand narekent vanaf de getallen op het scherm. Op de grens van een
    half procentpunt kan dit een net iets ander resultaat geven dan middelen
    over de ruwe breuken (verschil van maximaal 1 procentpunt) — dat is de
    prijs van "letterlijk narekenbaar vanaf het scherm", en die prijs is de
    eis in het ontwerp waard.
11. **Gebruik-per-agent-detectie kijkt naar gevulde data, niet naar het
    schema.** Het veld Agent staat in de registry voor zowel Acties als
    Lessen & Inzichten, maar een bundel kan dat veld toch leeg laten op elke
    rij (geconstateerd tegen een echte, niet-fictieve export — zie
    §Getest). Dit dashboard onderscheidt daarom "geen enkele rij heeft een
    waarde" van "geen agent gebruikt is er", en toont in het eerste geval
    een expliciet grijs blok in plaats van een misleidende ranglijst van
    twintig nullen.
12. **Ritme en Breedte worden bij de metrics-route client-side afgeleid, niet
    aangeleverd.** Het ontwerp-document schetst het metricsbestand op
    hoofdlijnen; het schrijft niet voor of de adoptiescore-subscores kant-
    en-klaar meekomen of lokaal berekend worden. Omdat de bouwstenen
    (`weekreeks`, `domeinen`) toch al in het bestand staan en dezelfde
    formule als bij werkdata-rijen hergebruikt kan worden, is dat de kleinere
    toevoeging. Opvolging kán dat niet: "een verstreken deadline" is geen
    afgeleide van de andere blokken zonder rijen te zien, dus die twee
    tellers (`acties.verstreken`/`klaar_verstreken`) staan wél expliciet in
    het bestand.
13. **Vier extra blokken (`sales_funnel`, `content`, `klantsucces`,
    `backlog`, `lessen`) bovenop de schets in het ontwerp-document.** Die
    schets noemt `acties` en `agents`, maar zone 4 (Opbrengst) en zone 5
    (Leren) tonen in dit dashboard meer dan alleen acties. Zonder deze
    blokken zou de metrics-route die twee zones grotendeels leeg moeten
    laten terwijl werkdata-rijen ze wel vullen — en dat zou de renderlaag
    per vulmethode laten verschillen, precies wat de opdracht uitsluit ("de
    renderlaag mag niet weten uit welke route de metrics kwamen").

## Vormgeving

Agentic Team-huisstijl (mint/donker), niet de Obeya-huisstijl:

```
Deep Navy    #1A1A2E   hoofdachtergrond
Donkergrijs  #2D2D44   panelen en cards
Mintgroen    #4ADE80   accent: koppen, iconen — nooit als statuskleur
Licht mint   #86EFAC   hover
Wit          #FFFFFF   bodytekst op donker
Middengrijs  #9CA3AF   bijschriften, tijdstempels
```

Signaalkleuren (rood/oranje/groen/grijs) staan bewust **buiten** dit
palet en worden nooit voor iets anders gebruikt dan status. Elk signaal
heeft een tweede kenmerk (icoon + border-stijl), niet alleen kleur. Grijs =
onbekend-of-verouderd, altijd met een zichtbare tijdstempel, altijd gedimd
(`opacity` + gestippelde rand), nooit een equivalent van groen.

## Notion-CORS-aanname — geverifieerd

Waarom het dashboard nooit zelf met Notion praat, maar de Coördinator het
metricsbestand via de werkruimte aanlevert (f24): het ontwerp neemt aan dat
een browserpagina de Notion-API niet rechtstreeks kan aanroepen
(server-naar-server, geen CORS). Dat klopt, en de omweg via de werkruimte is
dus terecht:

- Notion's eigen documentatie (`developers.notion.com`) beschrijft de API
  uitsluitend met een `Authorization: Bearer`-token dat via server-side
  omgevingsvariabelen gebruikt moet worden, en waarschuwt expliciet: "Never
  store the token in your source code or commit it in version control" —
  een client-side pagina die het token nodig heeft, is al in strijd met die
  eigen richtlijn.
- Er is **geen expliciete zin** in de officiële Notion-documentatie
  gevonden die letterlijk "wij ondersteunen geen CORS" zegt — dat wil ik
  hier niet groter maken dan het is.
- Wel bevestigd, herhaaldelijk, in issues op de **officiële** SDK-repo
  (`github.com/makenotion/notion-sdk-js`, beheerd door Notion zelf, bv.
  issue #96 en #417): rechtstreekse browser-requests naar `api.notion.com`
  lopen vast op een ontbrekende `Access-Control-Allow-Origin`-header. Dat
  patroon is consistent over meerdere jaren issues, zonder dat Notion CORS
  ondersteuning heeft toegevoegd.
- Conclusie: de aanname klopt in de praktijk, bevestigd door de architectuur
  van de API zelf (server-side bearer token) en door consistent
  gerapporteerd gedrag op Notion's eigen SDK-repo. Geen bron met een
  letterlijke "geen CORS"-uitspraak gevonden — dat vermeld ik expliciet in
  plaats van een citaat te verzinnen.

## Getest, en hoe

Er is één route en die is end-to-end getest, geautomatiseerd, tegen de
échte gebouwde `dashboard.html`: `test/integratie.test.js` draait het
artefact in jsdom met `window.fetch` gestubd als werkruimte-instantie
(dezelfde antwoordvormen als `scripts/mock-instantie.mjs`, Node's `Response`
omdat jsdom geen Fetch API heeft). De dashboardcode zelf is ongewijzigd
t.o.v. wat een browser draait. Wat de suite bewijst (`npm test`):

- **Werkdata-rijen uit de fixture** (`testdata/data/`, 14 domeinen) →
  homepage rendert vier KPI-tegels, activiteitengrafiek met gestapelde
  series, drie subscore-kolommen, gebruik-per-agent als grafiek (het veld
  Agent is in de fixture gevuld); alle detailpagina's via de hash-router,
  inclusief terug-knop, zonder JS-fout.
- **Lege werkruimte** (geen enkel domein) → geen crash: adoptiescore "0%"
  (Breedte is legitiem 0/15), Ritme/Opvolging "niet te berekenen", acties
  en tijdwinst "n.v.t.", grijze blokken met reden, waarschuwingsblok.
- **Metricsbestand, versie 1, met bewuste gaten** (`testdata/notion-metrics/`,
  ontbrekend `agents`-blok, een week zonder spoor, één verouderd domein)
  → home-view zichtbaar, `#version-error` verborgen, periodeschakelaar
  uitgeschakeld (periode ligt vast op 8 weken), gebruik-per-agent toont
  "Niet af te leiden", aandachtlijst precies vijf items (vier aangeleverd
  plus de zelf toegevoegde "1 domein met data ouder dan 30 dagen").
  Minuten-per-actie live herrekend (25 → 60 verandert de tijdwinst-KPI
  zonder nieuwe export).
- **Voorrangsregels metrics vs. rijen** — verse metrics winnen; verouderde
  metrics naast échte werkdata-rijen worden genegeerd met waarschuwing;
  verouderde metrics zonder werkdata worden getoond mét waarschuwing.
- **Onbekende versie** (`"versie": 2`, stub in de test) → niets getekend,
  `#version-error` toont gevonden en verwacht versienummer. **Onleesbaar
  bestand** → eigen tekst ("niet herkend als metricsbestand"), niets
  getekend.
- **Teamfeed** (f22), **onbekend domein** (zichtbaar in het
  waarschuwingenblok, nooit stil genegeerd), **interne tegels** alleen bij
  `intern: true`, **401/500** van de instantie → duidelijke melding, geen
  half dashboard.
- Daarnaast: `test/xss.test.js` (b32, sanitizer), `test/correctievrij.test.js`
  (i25, rekent de gate na op de fixture: week 10-08 op 67%),
  `test/kalenderdag.test.js` (b37), `test/gelijktijdigheid.test.js` (s26,
  begrensd parallel ophalen van domeinen).

**Extra, tegen een echte klantexport (niet gecommit, niet gekopieerd,
alleen lokaal gelezen tijdens de bouwsessie):** de adoptiescore-formule
(Ritme/Breedte/Opvolging en het gemiddelde) is doorgerekend tegen een echte
export van 13 domeinen/146 acties en kwam — op de dag van de export zelf —
exact overeen met een onafhankelijk vooraf berekende referentie. Op een
latere dag geopend geeft de Opvolging-subscore een net iets andere uitkomst
(1 procentpunt in deze steekproef), omdat er dan meer acties over hun
deadline zijn heen gegleden — verwacht gedrag van een "vandaag"-gebaseerde
berekening, geen fout. In diezelfde export bleek het veld Agent niet gevuld
in Acties en Lessen & Inzichten — het gebruik-per-agent-paneel toonde daar
correct het grijze blok in plaats van een ranglijst.

**Wat jsdom niet bewijst:** lay-out, overlap en leesbaarheid op een echt
scherm. De suite controleert concrete DOM-inhoud (aantal SVG-elementen,
tekst van grijze blokken, `display`-status van homepage/detail), geen
pixels. Een korte visuele controle door een mens blijft bij UI-wijzigingen
aan te raden; productie draait op dashboard.agentic-team.ai en is daar
handmatig nagelopen (f15).

## De werkruimte-route: live via een daglink (f15/f18)

Elke klant heeft een hosted werkruimte (f18). De Coördinator genereert met
de MCP-tool `werkruimte_dashboard_link` (in `agentic-team-werkruimte`) een
kortlevend, alleen-lezen token en deelt bij de dagstart een prefilled URL:

```text
https://dashboard.agentic-team.ai#t=<token>&i=<instantie-url>
```

Wat `src/werkruimte-loader.js` daarmee doet, en waarom zo:

- **Het token staat in het `#fragment`** en wordt dus nooit naar een server
  meegestuurd — het belandt in geen enkel access log, niet bij ons en niet
  bij de hostingprovider. Bij het laden verhuist het naar `sessionStorage`
  (herladen = verversen, tabblad dicht = weg) en wordt het meteen uit de
  adresbalk gehaald (`history.replaceState`).
- **De browser praat rechtstreeks met de instantie** (`/dashboard/overzicht`
  en `/dashboard/entries?domein=…` op de instantie-URL, met het token als
  Bearer) — de backend van agentic-team.ai zit er niet tussen, conform de
  harde grens van f15: klantdata raakt onze servers nooit. De instantie
  accepteert deze route alleen met CORS vanaf de dashboardpagina.
- **Het token kan alleen lezen en verloopt na 24 uur.** Een verlopen link
  geeft de melding "Vraag je Coördinator om een nieuwe"; er is geen
  alternatieve ingang. Dit is bewust een minimale voorloper van OAuth
  (p10, GA-voorwaarde) — geen weggegooid werk.
- **Zelfde interne vorm.** De loader levert een gewone rows-bundel
  (entries → `rows`, `bijgewerkt` → `staleAt`, bedrijfscontext-entries →
  het zone 2-object); alles stroomafwaarts weet niet dat de data live is.
  Domeinen die de werkruimte wél kent maar deze dashboardversie niet,
  belanden zichtbaar in het waarschuwingenblok — nooit stil genegeerd.
- **Werkdata buiten de werkruimte? Dan metrics via `dashboard_metrics`
  (f24).** Teams met werkdata in Notion of een eigen systeem hebben geen
  rijen in de werkruimte; hun Coördinator schrijft bij de dagstart het
  kant-en-klare metricsbestand (contract v1, zie §De interne metricsvorm) als
  JSON-string naar het domein `dashboard_metrics` (één entry, `metrics`,
  dagelijks overschreven). De loader leest die entry en volgt deze
  voorrangsregels: verse metrics (gegenereerd op vandaag) winnen; een
  verouderde metrics-entry naast échte werkdata-rijen wordt genegeerd
  (met waarschuwing); verouderde metrics zonder werkdata-rijen worden wél
  getoond, mét verouderd-waarschuwing. `logboek` en `bedrijfscontext`
  tellen niet als werkdata — die zijn bij elke werkruimte-klant gevuld.
  Het domein zelf staat bewust níet in het dashboard-schema
  (`opslag: "werkruimte"`-filter in `extract-schema.py`) en wordt nooit
  als rows-domein getekend.
- **Interne tegels.** `/dashboard/overzicht` levert `intern: true` wanneer
  de instantie met `DASHBOARD_INTERN=1` draait (FFG, Greenhive-test). Alleen
  dan toont het dashboard de KPI-tegel "Correctievrij (4 wk)" met de
  f19-gate en de bijbehorende detailpagina; een klantinstantie zet die vlag
  niet. De berekening zelf draait altijd (tests, één rekenregel), alleen de
  rendering is gegate. Dit is "nooit per ongeluk zichtbaar", geen
  afscherming: wie de pagina openbreekt ziet hooguit zijn eigen percentage.

### Eén bron: deze repo heeft zijn eigen Vercel-project

`dashboard.agentic-team.ai` is een eigen Vercel-project op deze repo —
bewust niet ondergebracht in `agentic-team-site`, zodat er geen tweede
kopie van het artefact bestaat die uit de pas kan lopen. Bij deploy bouwt
Vercel de pagina vers uit `src/` (zie `vercel.json`: hetzelfde
`scripts/build.py` als lokaal, artefact wordt `index.html`) en serveert
hem met een strakke CSP: geen extern script of analytics, en `connect-src`
beperkt tot de instantie-domeinen — de pagina kán technisch nergens anders
heen praten, ook niet naar agentic-team.ai zelf. Wisselt de
instantie-provider (nu Azure Container Apps), dan moet de CSP in
`vercel.json` mee veranderen. Het gecommitte `dashboard.html` in de
repo-root is hetzelfde artefact (zelfde bron, zelfde build) en bestaat
alleen zodat de integratietest en de build-driftgate op de release draaien —
het is geen distributiekanaal en wordt niet los aan klanten gegeven.

## Acceptatiecriteria (§11 van het ontwerp)

1. **Geen extern script, geen login, geen data via onze servers** —
   gehaald. Geen `<script src>` naar extern. Het enige `fetch`-pad is de
   daglink (sinds f15) en dat gaat uitsluitend, en alleen op initiatief
   van de gebruiker zelf, naar zijn eigen werkruimte-instantie; zonder
   daglink doet de pagina geen enkele netwerkaanroep. (Het oorspronkelijke
   criterium "werkt via `file://`" is met het besluit van 25-08-2026
   vervallen: er is geen offline-bestand meer.)
2. **De route is met de fictieve fixture end-to-end ingelezen** — gehaald,
   zie §Getest: werkdata-rijen én metricsbestand, plus de foutpaden
   (onbekende versie, onleesbaar bestand, verlopen daglink, 401/500).
3. **Onvolledige bundel → gedeeltelijk dashboard, geen foutmelding** —
   gehaald: ontbrekende domeinen worden overgeslagen (geen paneel, geen
   crash), corrupte bestanden belanden zichtbaar in een waarschuwingsblok.
4. **Elk getoond gegeven herleidbaar naar een veld** — gehaald, zie de
   tabel hierboven en de footnote onder elke KPI/grafiek/detailpagina in de
   UI zelf. De ene uitzondering (bedrijfscontext, nog geen registryveld) is
   expliciet als zodanig gelabeld, niet verstopt.
5. **Elk signaal heeft een tweede kenmerk, verouderd is nooit groen** —
   gehaald: icoon + badge-tekst naast kleur op de detailpagina's,
   dashed/gestippeld + tekstlabel voor de nieuwe homepage-elementen ("geen"
   bij een lege activiteitsweek, "niet te berekenen" bij een subscore,
   gestippelde rand + tekst bij het grijze gebruik-per-agent-blok). `isStale()`
   in `zones.js` sluit "groen" categorisch uit zodra data ouder is dan de
   drempel.
6. **Per zone in één zin de beslissing** — gehaald: staat op elke
   detailpagina (`.decision`) en, voor de nieuwe homepage-panelen, in de
   `.decision`-regel naast elke paneeltitel (bv. "Welke agent laat ik links
   liggen, en waarom?" boven de gebruik-per-agent-grafiek).
7. **Geen playbook-inhoud/agent-instructies/echte klantdata** — gehaald:
   deze repo bevat geen fase-content, geen dispatch/samenwerkingsdata, geen
   trigger-teksten — alleen publieke identificatiegegevens (slug, naam,
   emoji, module) en het datadomeinenschema, wat nodig is om iemands eigen
   werkruimte te kunnen lezen. Testdata is expliciet fictief
   ("GroenBuro", "-fictief"-domeinnamen). De echte klantexport die tijdens
   deze sessie is gebruikt om de adoptiescore-formule te verifiëren, is
   uitsluitend gelezen vanaf een pad buiten deze repo — niets daarvan is
   gekopieerd, gecommit of in deze README als brondata opgenomen.
8. **(nieuw, uit de homepage-herbouw) Geen cirkeldiagrammen, geen
   statuskleur als serie-kleur** — gehaald: `charts.js` gebruikt uitsluitend
   staafgrafieken (gestapeld en horizontaal-gerangschikt) met
   mint/licht-mint/twee neutrale tinten; rood/oranje/groen komen nergens in
   `CHART_SERIE_KLEUREN` voor.
9. **(nieuw) Adoptiescore-formule exact zoals gespecificeerd, met de hand
   na te rekenen** — gehaald en doorgerekend tegen een echte export, zie
   §Getest.
10. **(nieuw) Ontbrekend brongegeven toont een expliciet grijs blok, nooit
    een misleidende ranglijst van nullen** — gehaald voor gebruik-per-agent
    (`computeAgentGebruikRanking`), doorgerekend tegen een echte export
    waarin dit zich daadwerkelijk voordeed.
11. **(nieuw, uit het metricsbestand) Eén interne metricsvorm, twee manieren
    om hem te vullen, renderlaag onwetend van de herkomst** — gehaald: zie
    §De interne metricsvorm. `render.js`/`homepage.js` zijn in deze
    wijziging niet aangeraakt op de zone-render-functies zelf; alleen
    `app.js` → `buildContext()` koos een andere vulmethode.
12. **(nieuw) Onbekende versie van het metricsbestand tekent niets, met een
    duidelijke melding** — gehaald, zie §Versiecontrole en §Getest.
13. **(nieuw) Ontbrekend blok in het metricsbestand toont "bron ontbreekt",
    nooit nul** — gehaald voor elk van de zes optionele blokken, zie
    §Ontbrekende blokken.

## Wat er nog moet gebeuren voor dit naar een klant kan

- **Echte visuele/browsertest** (zie §Getest) — deze sessie had geen
  werkende Chrome-koppeling en geen headless Chromium beschikbaar. De
  jsdom-integratietest bevestigt correcte DOM-structuur/-inhoud en
  hash-routering, maar geen lay-out op een echt scherm (overlap, responsive
  gedrag op smalle breedtes, leesbaarheid van de SVG-grafieken op
  mobiel/tablet).
- **Licentie is een concept.** `LICENSE` en `NOTICE` (s33) staan in de
  repo, maar de licentietekst wacht op juridische beoordeling (gemarkeerd
  met `<<JURIST-REVIEW>>`).
- **Bedrijfscontext-schema moet landen in `core/agents.json`** (f13/S17) —
  daarna kan de uitzondering in §Bedrijfscontext hierboven vervallen.
- **Metricsbestand (versie 1) tegen een échte Coördinator-export.** Sinds
  f24 schrijft de Coördinator het bestand bij de dagstart naar
  `dashboard_metrics`; de vorm hier is de leeskant van dat contract. De
  geautomatiseerde tests draaien op de fictieve fixture — bij een
  vormwijziging aan de schrijfkant hoort de versie omhoog en deze README mee.
- **Geen echte browsertest van de nieuwe "onbekende versie"-melding en de
  uitgeschakelde periodeschakelaar bij de metrics-route.** Zoals bij de rest
  van dit dashboard (zie het punt hierboven over de visuele/browsertest):
  de jsdom-run bevestigt de juiste DOM-inhoud en -status, maar niet hoe het
  `#version-error`-blok en de `title`-tooltip op de uitgeschakelde
  periodeschakelaar er in een echte browser uitzien.
- **Adoptiescore drift over tijd.** Bij een "vandaag"-gebaseerde
  berekening (in plaats van een vaste peildatum) verschuift de
  Opvolging-subscore geleidelijk terwijl er niets aan de brondata
  verandert, simpelweg omdat meer acties hun deadline passeren. Dat is
  inherent aan de gekozen formule (zie ontwerp) en geen bug, maar een
  klant die het dashboard op twee opeenvolgende dagen opent zonder iets te
  wijzigen, kan een net iets ander percentage zien — dat verdient een
  zichtbare toelichting op het scherm zelf (nu alleen in deze README) als
  dit vaker een vraag oplevert.
