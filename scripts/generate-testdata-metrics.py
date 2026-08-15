#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genereert de testdata voor de nieuwe Notion-route: een kant-en-klaar
metricsbestand (versie 1) in plaats van vijftien bestanden met rijen. Zie
ONTWERP-wekelijkse-dashboardbijwerking.md voor het waarom en de vorm.

Zelfde fictieve klant als de rest van testdata/ ("GroenBuro"), en de
getallen zijn afgeleid van dezelfde onderliggende feiten als
generate-testdata.py (ACTIES, SALES_FUNNEL, KLANTSUCCES, LESSEN_INZICHTEN,
PRODUCTBACKLOG, CONTENT_KALENDER) — dit bestand hergebruikt die lijsten en
telt ze op, precies zoals de Coördinator dat met een aggregatiequery zou
doen. Geen rijen zelf komen in het metricsbestand terecht.

Schrijft drie scenario's, elk in zijn eigen map (zodat de map-picker in het
dashboard, die alle bestanden in de gekozen map leest, per scenario precies
één bestand tegenkomt):

  testdata/notion-metrics/metrics.json
      Het hoofdscenario: geldig (versie 1), met bewuste gaten:
        - geen "agents"-blok (ontbrekend blok -> "bron ontbreekt", niet 0)
        - één week zonder enig spoor in de weekreeks (vakantieweek)
        - domein "delivery_rugzak" is 56 dagen oud (> de 30-dagen-drempel)
        - twee domeinen (tijdregistratie, product_catalogus) ontbreken
          volledig uit het domeinen-blok, want die modules zijn niet
          aangeschaft (net als bij de Excel-testdata)
        - bedrijfscontext is hier bewust het GROENE pad (compleet, vers) -
          notion-export/ (oude route) laat al het rode pad zien; dit
          bestand laat zien dat de metrics-route ook een gezonde context
          kan melden.

  testdata/notion-metrics-onbekende-versie/metrics.json
      Zelfde inhoud, maar "versie": 2 — test de "onbekende versie"-melding.

  testdata/notion-metrics-leeg/metrics.json
      Letterlijk "{}" — test het "leeg/onherkenbaar bestand"-pad.

Gebruik:
    python3 scripts/generate-testdata-metrics.py
"""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
TESTDATA = ROOT / "testdata"

# Hergebruik de domeinlijsten uit generate-testdata.py zonder het script uit
# te voeren (het heeft een if __name__ == "__main__"-gate, dus importeren
# is veilig en voert alleen de module-top toe, niet build_excel() etc.)
spec = importlib.util.spec_from_file_location("gtd", ROOT / "scripts" / "generate-testdata.py")
gtd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gtd)

d = gtd.d  # dag-offset t.o.v. TODAY (2026-08-10), zelfde vaste "vandaag" als de andere drie bundels

OUT_GOED = TESTDATA / "notion-metrics"
OUT_ONBEKEND = TESTDATA / "notion-metrics-onbekende-versie"
OUT_LEEG = TESTDATA / "notion-metrics-leeg"


def build_metrics_payload():
    acties = gtd.ACTIES
    verstreken = [r for r in acties if r["Deadline"] < d(0)]
    klaar_verstreken = [r for r in verstreken if r["Status"] == "Klaar"]
    afgerond = [r for r in acties if r["Status"] == "Klaar"]

    sales_funnel = gtd.SALES_FUNNEL
    per_fase = {}
    for r in sales_funnel:
        per_fase[r["Fase"]] = per_fase.get(r["Fase"], 0) + 1
    omzet_totaal = sum(r["Verwachte Omzet"] for r in sales_funnel)

    content = gtd.CONTENT_KALENDER
    gepubliceerd = [r for r in content if r["Status"] == "Gepubliceerd"]
    gepland = [r for r in content if r["Status"] in ("Gepland", "Gepubliceerd")]

    klantsucces = gtd.KLANTSUCCES
    in_onboarding = [r for r in klantsucces if r["Fase"] == "Onboarding"]

    backlog = gtd.PRODUCTBACKLOG
    besloten = [r for r in backlog if (r.get("Besluit") or "").strip()]
    done = [r for r in backlog if r["Status"] == "Done"]

    lessen = gtd.LESSEN_INZICHTEN
    per_categorie = {}
    for r in lessen:
        per_categorie[r["Categorie"]] = per_categorie.get(r["Categorie"], 0) + 1
    open_lessen = [r for r in lessen if r["Status"] == "Open"]
    in_periode_lessen = [r for r in lessen if r["Datum"] >= d(-56)]

    # Domeinen die GroenBuro daadwerkelijk gebruikt (zelfde module-gat als
    # de Excel-testdata: geen backoffice/strategy -> geen tijdregistratie,
    # geen product_catalogus).
    domain_counts = {
        "organisaties": len(gtd.ORGANISATIES),
        "contactpersonen": len(gtd.CONTACTPERSONEN),
        "interacties": len(gtd.INTERACTIES),
        "sales_funnel": len(gtd.SALES_FUNNEL),
        "acties": len(gtd.ACTIES),
        "lessen_inzichten": len(gtd.LESSEN_INZICHTEN),
        "dagverslagen": len(gtd.DAGVERSLAGEN),
        "productbacklog": len(gtd.PRODUCTBACKLOG),
        "klantsucces": len(gtd.KLANTSUCCES),
        "projecten": len(gtd.PROJECTEN),
        "offertes": len(gtd.OFFERTES),
        "content_kalender": len(gtd.CONTENT_KALENDER),
        "delivery_rugzak": len(gtd.DELIVERY_RUGZAK),
    }
    domeinen = {}
    for key, n in domain_counts.items():
        laatst = d(-56) if key == "delivery_rugzak" else d(-1)  # delivery_rugzak bewust verouderd (> 30 dagen)
        domeinen[key] = {"rijen": n, "laatst_bijgewerkt": laatst}

    # Weekreeks: 8 weken, één week (index 5) zonder enig spoor ("vakantie-
    # week" - zelfde verhaal als de losse les hierboven over de
    # contentkalender die leegliep door vakantie).
    week_labels = [d(-56 + 7 * i) for i in range(8)]
    week_waarden = [
        {"dagverslagen": 1, "lessen_inzichten": 0, "interacties": 2, "content_kalender": 0},
        {"dagverslagen": 0, "lessen_inzichten": 1, "interacties": 1, "content_kalender": 1},
        {"dagverslagen": 2, "lessen_inzichten": 0, "interacties": 0, "content_kalender": 0},
        {"dagverslagen": 1, "lessen_inzichten": 1, "interacties": 1, "content_kalender": 0},
        {"dagverslagen": 0, "lessen_inzichten": 0, "interacties": 1, "content_kalender": 1},
        {"dagverslagen": 0, "lessen_inzichten": 0, "interacties": 0, "content_kalender": 0},  # vakantieweek
        {"dagverslagen": 1, "lessen_inzichten": 2, "interacties": 1, "content_kalender": 0},
        {"dagverslagen": 2, "lessen_inzichten": 0, "interacties": 1, "content_kalender": 2},
    ]
    buckets = []
    for start, waarden in zip(week_labels, week_waarden):
        totaal = sum(waarden.values())
        buckets.append({
            "week_start": start,
            "label": start[8:10] + "-" + start[5:7],
            "waarden": waarden,
            "totaal": totaal,
        })

    return {
        "type": "agentic-team-metrics",
        "versie": 1,
        "bron_label": "Notion-export — GroenBuro workspace (metricsbestand)",
        "gegenereerd_op": d(0) + "T09:15:00+02:00",
        "door": "Coördinator",
        "periode": {"van": d(-56), "tot": d(0), "weken": 8},
        "minuten_per_actie": 25,

        "domeinen": domeinen,

        "weekreeks": {
            "bronnen": ["dagverslagen", "lessen_inzichten", "interacties", "content_kalender"],
            "buckets": buckets,
        },

        # BEWUST GEEN "agents"-blok — test het "ontbrekend blok"-pad voor
        # zone 3 (Gebruik) en de gebruik-per-agent-grafiek op de homepage.
        # In een echte export levert de Coördinator dit blok gewoon mee;
        # hier ontbreekt het expres, als testdata voor de foutafhandeling.

        "acties": {
            "totaal": len(acties),
            "afgerond": len(afgerond),
            "verstreken": len(verstreken),
            "klaar_verstreken": len(klaar_verstreken),
            "opmerking": "Totaal = alle acties in de bundel (geen aanmaakdatum beschikbaar in dit domein om op periode te filteren).",
        },
        "sales_funnel": {
            "per_fase": per_fase,
            "verwachte_omzet_totaal": omzet_totaal,
            "opmerking": "Huidige verdeling — de bundel bevat geen wijzigingsgeschiedenis, dus geen trend van deals die van fase wisselden.",
        },
        "content": {
            "gepubliceerd": len(gepubliceerd),
            "gepland_in_periode": len(gepland),
            "totaal": len(content),
        },
        "klantsucces": {
            "in_onboarding": len(in_onboarding),
            "totaal": len(klantsucces),
        },
        "backlog": {
            "besloten": len(besloten),
            "done": len(done),
            "totaal": len(backlog),
        },

        "lessen": {
            "totaal": len(lessen),
            "per_categorie": per_categorie,
            "open": len(open_lessen),
            "in_periode": len(in_periode_lessen),
        },

        # Bewust het GROENE pad: notion-export/ (oude route) toont het rode
        # pad al (zie testdata/README.md); deze bundel laat zien dat de
        # metrics-route ook een gezonde context correct meldt.
        "bedrijfscontext": {
            "bron": "Notion-pagina 'GroenBuro - Bedrijfscontext' (intern gedeeld met het team)",
            "laatst_bijgewerkt": d(-4),
            "placeholders_open": [],
            "projectkennis_kopie_laatst_bijgewerkt": d(-4),
        },

        # Max. vijf, door de Coördinator zelf samengesteld (zie ontwerp).
        # Het dashboard voegt hier zelf nog een vijfde regel aan toe als er
        # verouderde domeinen zijn (zie domeinen-blok) - dat brengt dit op
        # precies vijf.
        "aandacht": [
            {"type": "acties-deadline", "ernst": "rood", "label": "4 acties over de deadline (van 8 in de bundel)", "link": None},
            {"type": "klantsucces", "ernst": "rood", "label": "1 klant op rood in Klantsucces: Zorggroep Vredehof (escalatie te laat opgepakt)", "link": None},
            {"type": "deals-stil", "ernst": "oranje", "label": "3 deals met een verlopen vervolgactie: Buro Helder, CoWorkPlek Zuid, Vredehof", "link": None},
            {"type": "klantsucces", "ernst": "oranje", "label": "1 klant op oranje: Facilitair Collectief Oost (verlengingsvoorstel nog zonder reactie)", "link": None},
        ],

        "waarschuwingen": [],
    }


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def main():
    goed = build_metrics_payload()
    write_json(OUT_GOED / "metrics.json", goed)

    onbekend = dict(goed)
    onbekend["versie"] = 2
    onbekend["bron_label"] = "Notion-export — GroenBuro workspace (metricsbestand, volgende generatie)"
    write_json(OUT_ONBEKEND / "metrics.json", onbekend)

    write_json(OUT_LEEG / "metrics.json", {})

    print("Testdata (metricsroute) gegenereerd:")
    print(" -", OUT_GOED / "metrics.json")
    print(" -", OUT_ONBEKEND / "metrics.json")
    print(" -", OUT_LEEG / "metrics.json")


if __name__ == "__main__":
    main()
