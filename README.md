# Agentic Team Dashboard

Eén zelfstandig HTML-bestand (`dashboard.html`) dat een klant lokaal opent of
zelf host, en dat laat zien hoe zijn Agentic Team ervoor staat. Het dashboard
**bevat geen data** — het leest, toont en rekent, en is nooit de bron van
iets. Alle gegevens komen uit een lokale databundel die de klant al heeft:
een Excel-werkboek, een `data/`-map met JSON-bestanden, of een Notion-export
die de Coördinator wegschrijft.

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

Open `dashboard.html` gewoon in een browser (dubbelklikken volstaat — geen
server, geen build, geen internet nodig). Klik op één van de drie
bundelknoppen en kies het Excel-bestand, de `data/`-map, of de
Notion-export-map. Wil je het meteen met voorbeelddata proberen: gebruik de
bestanden in `testdata/` (zie `testdata/README.md` voor wat daar bewust wel
en niet in staat).

## Wat er in deze repo staat

```
dashboard.html          → HET releasebestand. Dit is wat een klant download.
src/                     → bronbestanden waaruit dashboard.html gebouwd wordt
  shell.html             → HTML-skelet met __PLACEHOLDERS__ (homepage + detail-view)
  styles.css              → huisstijl (zie §Vormgeving)
  zip-xlsx.js             → ZIP + xlsx-lezer (geen library — zie §Waarom geen SheetJS)
  schema-helpers.js       → matching van sheets/bestanden/agents op het schema
  bundle-loaders.js       → leest de drie bundelformaten tot één interne vorm
  zones.js                → alle berekeningen (puur, geen DOM): de vijf zones, de
                             adoptiescore (ritme/breedte/opvolging), activiteit per
                             week, tijdwinst-som, gebruik-per-agent-ranglijst
  render.js               → tekent de vijf zoneberekeningen naar DOM (nu: detail-inhoud)
  charts.js                → inline-SVG-grafiekbouwers (gestapelde staaf, horizontale staaf) — puur, geen DOM
  homepage.js              → KPI-tegels, grafiekpanelen, adoptiescore-balken, detail-router
  app.js                  → wiring: bestandskeuze, periode (weken), minuten-per-actie, hash-routering
schema/
  schema.generated.js     → GEGENEREERD uit core/agents.json — nooit met de hand bewerken
scripts/
  extract-schema.py       → regenereert schema.generated.js uit een verse clone
  generate-testdata.py    → genereert de fictieve testbundel in alle 3 formaten
  build.py                → plakt src/ + schema/ samen tot dashboard.html
testdata/                → fictieve bundel (Excel, JSON, Notion-export) — zie testdata/README.md
```

## De homepage: KPI's, grafieken, adoptiescore, tijdwinst

De homepage toont, van boven naar beneden:

1. **Vier KPI-tegels** — adoptiescore, acties afgerond, sporen in de
   gekozen periode, geschatte tijdwinst. Elke tegel is klikbaar (`data-goto`)
   en springt naar zijn detailpagina.
2. **Activiteit per week** — gestapelde staafgrafiek (inline SVG, zie
   `charts.js`), standaard 12 weken. Series: Interacties·Datum,
   Dagverslagen·Dag, Lessen & Inzichten·Datum, Content Kalender·Publicatiedatum
   — elk uit hun eigen datumveld. Een week zonder spoor blijft staan als een
   gedimd, gestippeld streepje met het label "geen" — nooit weggelaten, want
   het gat is het signaal.
3. **Waar de adoptiescore vandaan komt** — drie horizontale balken
   (Ritme/Breedte/Opvolging) met de subscores, plus één regel die de
   optelsom letterlijk uitschrijft.
4. **Vraagt je aandacht** — dezelfde berekening als zone 1, afgekapt tot
   vijf items, met een doorklik naar de volledige lijst.
5. **Gebruik per agent** — gerangschikte horizontale staafgrafiek. Ontbreekt
   het brongegeven (zie hieronder), dan een expliciet grijs blok met de
   reden, geen twintig balkjes op nul.

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

## Het schema bijwerken

Het schema (de vijftien datadomeinen, hun veldnamen, en de agentlijst) staat
canoniek in `AgenticTeamAI/agent-architecture` → `core/agents.json` →
`datadomeinen`. Dit dashboard **typt dat nooit over** — het wordt afgeleid:

```bash
git clone https://<fine-grained-token>@github.com/AgenticTeamAI/agent-architecture.git /tmp/aa
python3 scripts/extract-schema.py --source /tmp/aa --output schema/schema.generated.js
python3 scripts/build.py
```

Het token hoort alleen in de clone-URL, nooit in een bestand van deze repo,
commit-message of PR-tekst. Trek het token na gebruik in via GitHub →
Settings → Developer settings → Fine-grained tokens.

Deze build gebruikt registryVersion **1.18.0** (commit `882f544a…`,
9 augustus 2026 — 20 agents, 15 datadomeinen, 7 modules).

## Bouwen

```bash
python3 scripts/build.py            # dashboard.html opnieuw genereren uit src/ + schema/
python3 scripts/generate-testdata.py  # testdata/ opnieuw genereren
```

Bewust **geen** npm/bundler-toolchain: `scripts/build.py` is een letterlijke
tekstsamenvoeging (shell + css + schema + js-modules, in vaste volgorde) —
dat is de hele build. Dat past bij het uitgangspunt dat het uitgeleverde
bestand zonder internet moet werken, en het houdt de build zelf ook
netwerkloos.

## Waarom geen SheetJS of andere xlsx-library

`.xlsx` is een ZIP-bestand met XML erin. In plaats van een externe library
te vendoren, gebruikt `src/zip-xlsx.js` de in de browser **ingebouwde**
`DecompressionStream('deflate-raw')` om de ZIP-entries te decomprimeren, en
`DOMParser` om de XML te lezen. Geen dependency, geen licentievraag, geen
netwerkverzoek — en het is precies zo veel code als nodig is om
`xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/sharedStrings.xml` en de
sheet-XML's te lezen. Werkt in elke browser met `DecompressionStream`
(Chrome/Edge sinds 2023, Firefox sinds 2024, Safari sinds 16.4) — een
oudere browser krijgt een duidelijke foutmelding in plaats van een silent
fail.

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
  `src/bundle-loaders.js`) en beoordeeld op: aanwezigheid van een bron,
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
2. **Notion-exportformaat is zelf ontworpen.** De kant van de Coördinator
   die een export naar de werkmap wegschrijft, bestaat nog niet in
   `agent-architecture`. Dit dashboard leest `{_schema, items, _geexporteerd_op,
   _database_id}` per domein — dezelfde velden als de lokale route, plus twee
   Notion-specifieke. Zodra de echte exportbouwer er is, kan die dit formaat
   volgen of dit dashboard moet zich aanpassen — meld dat dan, verander niet
   stilzwijgend één van de twee kanten.
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

Het ontwerp neemt aan dat een pagina die via `file://` geopend wordt de
Notion-API niet rechtstreeks kan aanroepen (server-naar-server, geen CORS),
en dat daarom een derde route (export naar de werkmap) nodig is in plaats
van live Notion-koppeling. Dat klopt, en de derde route is dus terecht:

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

`file://`, geen server, geen internet, geen tokens — de bundel-loaders,
berekeningen (`zones.js`) en grafiekbouwers (`charts.js`) zijn dependency-vrij
en netwerkloos, net als voorheen.

Alle drie de dataroutes zijn **daadwerkelijk ingelezen** (niet alleen
code-review) tegen de fictieve bundel in `testdata/`, via een Node/jsdom-
integratietest die de echte, gebouwde `dashboard.html` uitvoert (inclusief de
zip/xlsx-parser — Node zelf heeft geen `Blob.stream()`/`DecompressionStream`
op zijn `window`-object binnen jsdom, dat is in de testharness zelf
gepolyfilld met Node's eigen `stream/web`- en `buffer`-implementaties; de
dashboardcode zelf is ongewijzigd t.o.v. wat een echte browser draait):

- **data/\*.json** (fictief) → 14 domeinen, homepage rendert vier
  KPI-tegels, activiteitengrafiek met 17 SVG-rects (inclusief gestapelde
  series), drie subscore-kolommen, gebruik-per-agent als grafiek (het veld
  Agent is in de testdata wél gevuld).
- **notion-export/\*.json** (fictief) → 15 domeinen, zelfde route, andere
  adoptiescore/sporentelling (verschillende testdata-spreiding).
- **Excel-werkboek** (fictief) → 13 domeinen, homepage rendert identiek aan
  de JSON-routes.
- Volledig lege bundel (geen enkel domein) → geen crash: adoptiescore toont
  "0%" (Breedte is legitiem 0/15, dus wél berekenbaar), Ritme/Opvolging
  tonen "niet te berekenen", Acties-afgerond en tijdwinst tonen "n.v.t."
  (geen Acties-domein), activiteitengrafiek en gebruik-per-agent tonen een
  grijs blok met reden, waarschuwingsblok verschijnt.
- Alle acht detailpagina's (`#/detail/aandacht|context|gebruik|opbrengst|
  leren|adoptiescore|tijdwinst|activiteit`) doorlopen via de hash-router,
  inclusief de terug-knop — geen enkele JS-fout (`window.onerror`
  gecontroleerd op 0).
- Periodeschakelaar (8/12/24 weken) herberekent homepage én open
  detailpagina zonder fout; minuten-per-actie-veld herberekent de
  tijdwinst-KPI live en onthoudt de instelling in `localStorage`.
- Corrupt Excel-bestand / JSON-map met een ongeldig bestand ertussen →
  ongewijzigd gedrag t.o.v. de vorige versie (zie de git-historie): geen
  crash, zichtbaar in het waarschuwingsblok.

**Extra, tegen een echte klantexport (niet gecommit, niet gekopieerd,
alleen lokaal gelezen tijdens deze sessie):** de adoptiescore-formule
(Ritme/Breedte/Opvolging en het gemiddelde) is doorgerekend tegen een echte
export van 13 domeinen/146 acties en kwam — op de dag van de export zelf —
exact overeen met een onafhankelijk vooraf berekende referentie. Op een
latere dag geopend geeft de Opvolging-subscore een net iets andere uitkomst
(1 procentpunt in deze steekproef), omdat er dan meer acties over hun
deadline zijn heen gegleden — dat is verwacht gedrag van een "vandaag"-
gebaseerde berekening, geen fout. In diezelfde export bleek het veld Agent
inderdaad niet gevuld in Acties en Lessen & Inzichten — het
gebruik-per-agent-paneel toonde daar correct het grijze blok in plaats van
een ranglijst.

**Niet gelukt in deze sessie:** een pixel-echte visuele controle in een
draaiende browser (geen Chrome-koppeling en geen headless Chromium
beschikbaar in deze sandbox om te installeren). De hierboven beschreven
jsdom-integratietest voert dezelfde `dashboard.html`, dezelfde
berekeningen, dezelfde SVG-string-opbouw en dezelfde DOM-rendering/hash-
routering uit als een browser zou doen, en controleert concrete
DOM-inhoud (aantal SVG-elementen, tekstinhoud van grijze blokken,
`display`-status van homepage/detail) — maar het is geen oordeel over
lay-out, overlap of leesbaarheid op een scherm. Een korte visuele controle
door een mens, vóór dit naar een klant gaat, blijft aan te raden.

## Acceptatiecriteria (§11 van het ontwerp)

1. **Werkt via `file://`, zonder server/internet/tokens** — gehaald. Geen
   `<script src>` naar extern, geen `fetch`, geen login.
2. **Alle drie routes getest met fictieve bundel, elk minstens één keer
   echt ingelezen** — gehaald, zie §Getest hierboven.
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
   Excel/JSON/Notion te kunnen lezen. Testdata is expliciet fictief
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

## Wat er nog moet gebeuren voor dit naar een klant kan

- **Echte visuele/browsertest** (zie §Getest) — deze sessie had geen
  werkende Chrome-koppeling en geen headless Chromium beschikbaar. De
  jsdom-integratietest bevestigt correcte DOM-structuur/-inhoud en
  hash-routering, maar geen lay-out op een echt scherm (overlap, responsive
  gedrag op smalle breedtes, leesbaarheid van de SVG-grafieken op
  mobiel/tablet).
- **Licentie ontbreekt.** Deze repo is publiek maar heeft nog geen
  LICENSE-bestand.
- **Bedrijfscontext-schema moet landen in `core/agents.json`** (f13/S17) —
  daarna kan de uitzondering in §Bedrijfscontext hierboven vervallen.
- **Notion-exportmechanisme aan de kant van de Coördinator** bestaat nog
  niet als gebouwde functionaliteit — dit dashboard leest een zelf ontworpen
  formaat. Dat formaat is deze sessie wél tegen een echte, handmatig
  samengestelde export van een eerste testklant gelezen (zie §Getest), wat
  meer vertrouwen geeft dan alleen de fictieve testdata, maar het is nog
  geen test tegen een export die de Coördinator zelf automatisch produceert.
- **Cross-browsertest voor `DecompressionStream`/`Blob.stream()`** op de
  daadwerkelijke doelgroep (MKB-directeuren, waarschijnlijk Chrome/Edge op
  Windows) — functioneel correct verondersteld op basis van
  MDN-compatibiliteitsdata, niet zelf getest op elk platform.
- **Downloadmechanisme vanaf de accountpagina** (ontwerp §8) — buiten scope
  van deze repo; dat is werk in `agentic-team-site`.
- **Adoptiescore drift over tijd.** Bij een "vandaag"-gebaseerde
  berekening (in plaats van een vaste peildatum) verschuift de
  Opvolging-subscore geleidelijk terwijl er niets aan de brondata
  verandert, simpelweg omdat meer acties hun deadline passeren. Dat is
  inherent aan de gekozen formule (zie ontwerp) en geen bug, maar een
  klant die het dashboard op twee opeenvolgende dagen opent zonder iets te
  wijzigen, kan een net iets ander percentage zien — dat verdient een
  zichtbare toelichting op het scherm zelf (nu alleen in deze README) als
  dit vaker een vraag oplevert.
