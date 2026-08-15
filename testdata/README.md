# Testdata — GroenBuro (volledig fictief)

Deze map bevat één fictieve klant ("GroenBuro", een verzonnen bedrijf in
kantoorbeplanting en werkplekwelzijn) in alle drie de bundelformaten die
`dashboard.html` moet kunnen lezen. Genereer opnieuw met:

```
python3 scripts/generate-testdata.py
```

Alle namen, bedragen, e-mailadressen en gebeurtenissen zijn verzonnen — geen
overeenkomst met een bestaande klant. "GroenBuro" is een andere fictieve
naam dan `agent-architecture/clients/demo-fictief` ("De Groene Wijk VvE" e.a.),
om verwarring tussen de twee te voorkomen.

De drie bundels delen dezelfde onderliggende feiten (dezelfde organisaties,
dezelfde deals, dezelfde acties), maar zijn **met opzet niet even compleet** —
precies zoals een echte klant niet noodzakelijk al zijn domeinen in elke
route bijhoudt. Zo wordt niet alleen het gelukkige pad getest.

## `agentic-team.xlsx` (Excel-route)

- Bevat alleen de domeinen van de modules `core`, `sales`, `delivery`,
  `visibility` (13 tabbladen + `_schema`) — **geen** `tijdregistratie` of
  `product_catalogus` (modules `backoffice`/`strategy` niet aangeschaft).
- Tabblad **Delivery Rugzak is leeg** (0 rijen, wel de header) — test "leeg
  domein" vs. "domein ontbreekt".
- **Geen bedrijfscontext-tabblad** — test zone 2's "onbekend, niet in deze
  bundel"-pad (grijs, expliciet anders dan rood).
- Het **hele bestand is 45 dagen oud** gezet (drempel in het dashboard is 30
  dagen) — test dat veroudering het hele werkboek dimt, niet per tabblad
  (want het is één bestand).
- Agent **Dealmaker** komt in geen enkele Acties- of Lessen-rij voor → "geen
  spoor gevonden".

## `data/*.json` (lokale-bestanden-route)

- Vorm per bestand: `{"_schema": "...", "items": [...]}`, zoals de
  bron-intake-fase in `agent-architecture/core/base/orchestrator/prompt.md`
  beschrijft.
- **`klantsucces.json` ontbreekt volledig**, terwijl de rest van de
  delivery-domeinen er wel staan — test een ontbrekend domein in een verder
  complete bundel.
- **`productbacklog.json` is zelf 60 dagen oud**, terwijl de rest van de
  bestanden vers is — test veroudering per bestand (in tegenstelling tot de
  Excel-route, waar dat per definitie bundelbreed is).
- **`bedrijfscontext.json` is aanwezig, compleet en vers** — dit is het
  groene pad voor zone 2.
- Agent **Delivery Architect** heeft geen enkele Acties/Lessen-vermelding →
  "geen spoor gevonden".

## `notion-export/*.json` (Notion-route)

Er bestaat nog geen canoniek exportmechanisme in `agent-architecture` (de
kant van de Coördinator die dit zou wegschrijven, is nog niet gebouwd — zie
`README.md` van deze repo, "wat ik bewust anders heb gedaan"). Dit is dus
een eigen ontwerp: dezelfde `{_schema, items}`-vorm als de lokale route,
aangevuld met `_geexporteerd_op` (wanneer de Coördinator exporteerde) en
`_database_id` (fictief, ter illustratie).

- **`lessen-inzichten.json` is leeg** (0 items) — test zone 5's "geen lessen
  vastgelegd = bevinding, geen leeg paneel".
- **`bedrijfscontext.json` is verouderd (200 dagen) én heeft 3 openstaande
  placeholders**, en de kopie in projectkennis is zelf ouder dan die
  al-verouderde bron — test het rode pad van zone 2, inclusief de
  S17-controle "is de kopie ouder dan de bron?".
- Agent **Content Strateeg** heeft in deze bundel wel een actie, maar niet
  binnen de standaardperiode van 30 dagen — test het onderscheid tussen
  "geen spoor" en "spoor buiten de gekozen periode".

## `notion-metrics*/metrics.json` (Notion-route, nieuwe vorm: één metricsbestand)

Sinds `ONTWERP-wekelijkse-dashboardbijwerking.md` levert de Notion-route
niet langer vijftien bestanden met rijen, maar één klein bestand met
kant-en-klare uitkomsten (zie de hoofdlijn van dat bestand in `README.md`
→ "De interne metricsvorm en de Notion-route"). Drie scenario's, elk in
zijn eigen map omdat de map-picker in het dashboard alle bestanden in de
gekozen map leest — één bestand per scenario voorkomt dat de map-picker
per ongeluk het verkeerde pad kiest:

- **`notion-metrics/metrics.json`** — het hoofdscenario: geldig (`"versie": 1`),
  zelfde fictieve klant GroenBuro, getallen afgeleid van dezelfde
  onderliggende feiten als de andere drie bundels (zie
  `scripts/generate-testdata-metrics.py`, dat de domeinlijsten uit
  `generate-testdata.py` hergebruikt en optelt — precies zoals de
  Coördinator dat met een aggregatiequery zou doen). Bewuste gaten:
  - **Geen `agents`-blok** — test het "ontbrekend blok"-pad voor zone 3
    (Gebruik) en de gebruik-per-agent-grafiek: die tonen "bron ontbreekt",
    niet twintig agents op nul.
  - **Eén week zonder enig spoor** in de weekreeks (index 5, een fictieve
    vakantieweek — zelfde verhaal als de losse les in de andere bundels
    over de contentkalender die leegliep door vakantie) — het gat blijft
    zichtbaar in de grafiek, wordt niet weggelaten.
  - **Domein `delivery_rugzak` is 56 dagen oud** in het domeinen-blok
    (drempel is 30) — test dat het dashboard zelf, zonder rijen te zien,
    een "verouderde domeinen"-regel aan de aandachtlijst toevoegt.
  - **Twee domeinen ontbreken volledig** uit het domeinen-blok
    (`tijdregistratie`, `product_catalogus`) — zelfde module-gat als de
    Excel-testdata (geen backoffice/strategy aangeschaft), test Breedte
    <100%.
  - **Bedrijfscontext is hier het groene pad** (compleet, vers) — de oude
    `notion-export/`-bundel hierboven laat al het rode pad zien; deze
    bundel laat zien dat de metrics-route ook een gezonde context correct
    meldt.
- **`notion-metrics-onbekende-versie/metrics.json`** — zelfde inhoud, maar
  `"versie": 2`. Test dat het dashboard hier NIETS tekent (geen homepage,
  geen detailpagina's) en in plaats daarvan een duidelijke melding toont
  met het gevonden en het verwachte versienummer.
- **`notion-metrics-leeg/metrics.json`** — letterlijk `{}`. Test het "leeg
  of onherkenbaar bestand"-pad: geen `"versie"`- of `"type"`-sleutel, dus
  geen enkele aanname over wat er wél in zou kunnen staan — ook hier wordt
  niets getekend, met een andere (eigen) tekst dan het versie-scenario.

Genereer opnieuw met:

```
python3 scripts/generate-testdata-metrics.py
```

**De echte Five Forward-export (zie §Getest in `README.md`) is nooit als
testdata gebruikt en niets daarvan is naar deze repo gekopieerd** — alle
drie de scenario's hierboven zijn volledig fictief, "GroenBuro"-stijl.
