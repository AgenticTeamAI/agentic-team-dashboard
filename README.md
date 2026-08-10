# Agentic Team Dashboard

Eén zelfstandig HTML-bestand (`dashboard.html`) dat een klant lokaal opent of
zelf host, en dat laat zien hoe zijn Agentic Team ervoor staat. Het dashboard
**bevat geen data** — het leest, toont en rekent, en is nooit de bron van
iets. Alle gegevens komen uit een lokale databundel die de klant al heeft:
een Excel-werkboek, een `data/`-map met JSON-bestanden, of een Notion-export
die de Coördinator wegschrijft.

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
  shell.html             → HTML-skelet met __PLACEHOLDERS__
  styles.css              → huisstijl (zie §Vormgeving)
  zip-xlsx.js             → ZIP + xlsx-lezer (geen library — zie §Waarom geen SheetJS)
  schema-helpers.js       → matching van sheets/bestanden/agents op het schema
  bundle-loaders.js       → leest de drie bundelformaten tot één interne vorm
  zones.js                → de vijf zoneberekeningen (puur, geen DOM)
  render.js               → tekent de zoneberekeningen naar DOM
  app.js                  → wiring: bestandskeuze, periodeschakelaar, opslag laatste keuze
schema/
  schema.generated.js     → GEGENEREERD uit core/agents.json — nooit met de hand bewerken
scripts/
  extract-schema.py       → regenereert schema.generated.js uit een verse clone
  generate-testdata.py    → genereert de fictieve testbundel in alle 3 formaten
  build.py                → plakt src/ + schema/ samen tot dashboard.html
testdata/                → fictieve bundel (Excel, JSON, Notion-export) — zie testdata/README.md
```

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

## De vijf zones — herkomst en beslissing

| Zone | Beslissing die hij mogelijk maakt | Leest (domein → veld) |
|---|---|---|
| 1 · Aandacht | Waar besteed ik vandaag mijn halfuur aan? | Acties (Agent, Status, Deadline), Klantsucces (Health), Sales Funnel (Opvolg Status, Volgende Actie Deadline), en de tijdstempel van elk domein |
| 2 · Contextgezondheid | Moet ik mijn bedrijfscontext bijwerken voordat ik het team weer aan het werk zet? | Het (nog niet in de registry gestandaardiseerde) bedrijfscontext-onderdeel van de bundel — zie §Bedrijfscontext hieronder |
| 3 · Gebruik | Welke agent laat ik links liggen, en waarom? | Acties (Agent, Deadline als proxy-tijdstip), Lessen & Inzichten (Agent, Datum) |
| 4 · Opbrengst | Levert dit team genoeg op om het te blijven betalen? | Acties (Status), Sales Funnel (Fase, Verwachte Omzet), Content Kalender (Status, Publicatiedatum), Klantsucces (Fase), Productbacklog (Besluit, Status) |
| 5 · Leren | Wat weet dit team nu dat het vorige maand niet wist? | Lessen & Inzichten (Categorie, Status, Datum) |

Elke kaart in de UI zelf toont ook zijn eigen footnote met de exacte
herkomst — dat hoeft niemand in deze README op te zoeken.

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

`file://`, geen server, geen internet, geen tokens — geverifieerd door
`dashboard.html` te openen als lokaal bestand.

Alle drie de dataroutes zijn **daadwerkelijk ingelezen** (niet alleen
code-review) tegen de fictieve bundel in `testdata/`, via een Node/jsdom-
integratietest die de echte `dashboard.html` uitvoert (inclusief de
zip/xlsx-parser, met Node's eigen `DecompressionStream`) en de daadwerkelijke
bestanden leest:

- Excel-werkboek → 13 domeinen gevonden, geen bedrijfscontext (grijs-pad),
  bundelbrede veroudering (45 dagen) correct gesignaleerd.
- data/*.json → 14 domeinen (klantsucces ontbreekt, correct genegeerd),
  bedrijfscontext groen, productbacklog correct als individueel verouderd
  gemarkeerd.
- notion-export/*.json → 15 domeinen, lessen_inzichten correct als "leeg,
  dat is een bevinding" getoond, bedrijfscontext correct rood met drie
  redenen (leeftijd, open placeholders, kopie ouder dan bron).
- Corrupt Excel-bestand → duidelijke foutmelding, dashboard blijft in de
  lege staat (geen crash).
- JSON-map met één ongeldig JSON-bestand ertussen → de overige bestanden
  laden gewoon, het kapotte bestand verschijnt zichtbaar in een
  waarschuwingsblok — geen silent fail, geen crash.
- Periodeschakelaar (7/30/90 dagen) herberekent zone 3 zonder fout.

**Niet gelukt in deze sessie:** een visuele controle in een echte browser
(Chrome-extensie was niet verbonden in deze sandbox, en er was geen
headless Chromium beschikbaar om te installeren). De hierboven beschreven
jsdom-integratietest voert dezelfde `dashboard.html`, dezelfde parser en
dezelfde DOM-rendering uit als een echte browser zou doen, en jsdom's eigen
`DOMParser`/`localStorage`-gedrag kwam overeen met verwacht browsergedrag
(inclusief het correct afvangen van een `SecurityError` op `localStorage`
onder een `file://`-origin — de "onthoud laatste keuze"-functie faalt dan
stil, precies zoals bedoeld). Een korte visuele controle door een mens,
vóór dit naar een klant gaat, is nog aan te raden.

## Acceptatiecriteria (§11 van het ontwerp)

1. **Werkt via `file://`, zonder server/internet/tokens** — gehaald. Geen
   `<script src>` naar extern, geen `fetch`, geen login.
2. **Alle drie routes getest met fictieve bundel, elk minstens één keer
   echt ingelezen** — gehaald, zie §Getest hierboven.
3. **Onvolledige bundel → gedeeltelijk dashboard, geen foutmelding** —
   gehaald: ontbrekende domeinen worden overgeslagen (geen paneel, geen
   crash), corrupte bestanden belanden zichtbaar in een waarschuwingsblok.
4. **Elk getoond gegeven herleidbaar naar een veld** — gehaald, zie de
   tabel hierboven en de footnote onder elke zone in de UI zelf. De ene
   uitzondering (bedrijfscontext, nog geen registryveld) is expliciet als
   zodanig gelabeld, niet verstopt.
5. **Elk signaal heeft een tweede kenmerk, verouderd is nooit groen** —
   gehaald: icoon + badge-tekst naast kleur, en `isStale()` in `zones.js`
   sluit "groen" categorisch uit zodra data ouder is dan de drempel (zie
   `computeZone2`, dat bij onbekende leeftijd naar grijs valt, nooit groen).
6. **Per zone in één zin de beslissing** — gehaald, staat letterlijk in de
   UI (`.decision` naast elke zonetitel) én in de tabel hierboven.
7. **Geen playbook-inhoud/agent-instructies/echte klantdata** — gehaald:
   deze repo bevat geen fase-content, geen dispatch/samenwerkingsdata, geen
   trigger-teksten — alleen publieke identificatiegegevens (slug, naam,
   emoji, module) en het datadomeinenschema, wat nodig is om iemands eigen
   Excel/JSON/Notion te kunnen lezen. Testdata is expliciet fictief
   ("GroenBuro", "-fictief"-domeinnamen).

## Wat er nog moet gebeuren voor dit naar een klant kan

- **Echte visuele/browsertest** (zie §Getest) — deze sessie had geen
  werkende Chrome-koppeling.
- **Licentie ontbreekt.** Deze repo is publiek maar heeft nog geen
  LICENSE-bestand.
- **Bedrijfscontext-schema moet landen in `core/agents.json`** (f13/S17) —
  daarna kan de uitzondering in §Bedrijfscontext hierboven vervallen.
- **Notion-exportmechanisme moet nog gebouwd worden** aan de kant van de
  Coördinator — dit dashboard leest een zelf ontworpen formaat dat nog
  ergens geverifieerd moet worden tegen de echte export zodra die bestaat.
- **Cross-browsertest voor `DecompressionStream`** op de daadwerkelijke
  doelgroep (MKB-directeuren, waarschijnlijk Chrome/Edge op Windows) —
  functioneel correct verondersteld op basis van MDN-compatibiliteitsdata,
  niet zelf getest op elk platform.
- **Downloadmechanisme vanaf de accountpagina** (ontwerp §8) — buiten scope
  van deze repo; dat is werk in `agentic-team-site`.
