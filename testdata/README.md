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
