# Testdata — fixture "GroenBuro" (volledig fictief)

Deze map is een **testfixture**, geen productfunctie. Het dashboard leest
sinds 25-08-2026 uitsluitend uit de werkruimte van de klant (daglink); wat
hier staat wordt alleen gelezen door de tests en door de lokale
mock-instantie, die zich voordoet als zo'n werkruimte.

Eén fictieve klant: "GroenBuro", een verzonnen bedrijf in kantoorbeplanting
en werkplekwelzijn. Alle namen, bedragen, e-mailadressen en gebeurtenissen
zijn verzonnen — geen overeenkomst met een bestaande klant. "GroenBuro" is
een andere fictieve naam dan `agent-architecture/clients/demo-fictief`
("De Groene Wijk VvE" e.a.), om verwarring tussen de twee te voorkomen.

## Wat hier staat en wie het leest

| Pad | Inhoud | Gelezen door | Genereren |
|---|---|---|---|
| `data/*.json` | rijen per domein, `{"_schema": "...", "items": [...]}` — de vorm die de werkruimte per domein teruggeeft via `/dashboard/entries` | `scripts/mock-instantie.mjs`, `test/integratie.test.js` | `python3 scripts/generate-testdata.py` |
| `notion-metrics/metrics.json` | het kant-en-klare metricsbestand (contract versie 1) zoals de Coördinator dat naar het domein `dashboard_metrics` schrijft (f24) | `scripts/mock-instantie.mjs`, `test/integratie.test.js`, `test/correctievrij.test.js` | `python3 scripts/generate-testdata-metrics.py` |
| `werkruimte/teamfeed.json` | teamfeed-berichten (f22) in de vorm van de werkruimte | `scripts/mock-instantie.mjs`, `test/integratie.test.js` | met de hand |

De twee generatoren delen dezelfde onderliggende feiten (dezelfde
organisaties, deals, acties): `generate-testdata-metrics.py` importeert de
domeinlijsten uit `generate-testdata.py` en telt ze op, precies zoals de
Coördinator dat met een aggregatiequery zou doen. `TODAY` staat vast op
2026-08-10, zodat beide fixtures reproduceerbaar zijn. Veldnamen komen 1-op-1
uit `schema/schema.generated.js` — nooit hier opnieuw verzonnen.

## Bewuste gaten in `data/`

Niet alleen het gelukkige pad wordt getest:

- **`klantsucces.json` ontbreekt volledig**, terwijl de rest van de
  delivery-domeinen er wel staat — een ontbrekend domein in een verder
  complete werkruimte.
- **`productbacklog.json` is 60 dagen oud** (bestandsdatum, via `os.utime`;
  de integratietest zet `bijgewerkt` zelf), de rest is vers — veroudering
  per domein.
- **`bedrijfscontext.json` is aanwezig, compleet en vers** — het groene pad
  voor zone 2.
- Agent **Delivery Architect** heeft geen enkele Acties/Lessen-vermelding →
  "geen spoor gevonden".

## Bewuste gaten in `notion-metrics/metrics.json`

- **Geen `agents`-blok** — zone 3 (Gebruik) en de gebruik-per-agent-grafiek
  tonen "bron ontbreekt", niet twintig agents op nul.
- **Eén week zonder enig spoor** in de weekreeks (index 5, een fictieve
  vakantieweek) — het gat blijft zichtbaar in de grafiek.
- **Domein `delivery_rugzak` is 56 dagen oud** in het domeinen-blok
  (drempel 30) — het dashboard voegt zelf een "verouderde domeinen"-regel
  aan de aandachtlijst toe.
- **Twee domeinen ontbreken** (`tijdregistratie`, `product_catalogus`;
  modules backoffice/strategy niet aangeschaft) — Breedte < 100%.
- **`correctievrij`-blok (i25)** met week 10-08 op 67% — de f19-gate wordt
  net niet gehaald; `test/correctievrij.test.js` rekent dit na.
- **Bedrijfscontext is het groene pad** (compleet, vers).

De foutpaden — onbekende versie, leeg of onherkenbaar bestand, verouderde
metrics naast échte werkdata, 401/500 van de instantie — hebben geen
fixture: `test/integratie.test.js` bouwt die stubs zelf.

## Verwijderd (s36, 26-08-2026)

`agentic-team.xlsx`, `notion-export/`, `notion-metrics-onbekende-versie/`
en `notion-metrics-leeg/` hoorden bij de bestandsroutes (Excel-werkboek,
Notion-export-map) die met het besluit "alleen werkruimte" zijn verdwenen.
Niets las ze nog (grep over `src/`, `test/`, `scripts/` en CI); de
generatoren schrijven ze niet meer. Wie de geschiedenis wil zien: git-log
op deze map.

**De echte Five Forward-export (zie §Getest in `README.md`) is nooit als
testdata gebruikt en niets daarvan is naar deze repo gekopieerd.**
