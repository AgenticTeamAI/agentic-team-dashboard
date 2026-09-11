// GEGENEREERD BESTAND - NIET HANDMATIG BEWERKEN.
//
// Gegenereerd door scripts/extract-schema.py uit
// AgenticTeamAI/agent-architecture, core/agents.json.
//   registryVersion : 1.90.0
//   registry updated: 2026-09-07
//   bron-commit     : e8f0055fc53071b0590b6c78346df68eb19998f4
//   geextraheerd op : 2026-09-11T13:41:45Z
//
// Verandert de registry (nieuwe agent, gewijzigd datadomein, nieuwe module),
// draai dit script dan opnieuw tegen een verse clone en commit het resultaat.
// Typ deze structuur nooit met de hand over - dat is precies de tweede bron
// van waarheid die de registry-koppeling (Stream B) moest voorkomen.
window.AGENTIC_TEAM_SCHEMA = {
  "registryVersion": "1.90.0",
  "registryUpdated": "2026-09-07",
  "sourceCommit": "e8f0055fc53071b0590b6c78346df68eb19998f4",
  "extractedAt": "2026-09-11T13:41:45Z",
  "modules": {
    "core": {
      "naam": "Core",
      "altijdInbegrepen": true,
      "aantalAgents": 4
    },
    "growth": {
      "naam": "Growth",
      "aantalAgents": 3
    },
    "visibility": {
      "naam": "Visibility",
      "aantalAgents": 3
    },
    "sales": {
      "naam": "Sales",
      "aantalAgents": 2
    },
    "delivery": {
      "naam": "Delivery",
      "aantalAgents": 2
    },
    "strategy": {
      "naam": "Strategy",
      "aantalAgents": 2
    },
    "backoffice": {
      "naam": "Backoffice",
      "aantalAgents": 5
    }
  },
  "agents": [
    {
      "slug": "orchestrator",
      "displayName": "Coördinator",
      "emoji": "🔮",
      "module": "core",
      "team": "gedeeld",
      "description": "Regisseert je AI-team en maakt elke werkdag een concreet dagplan met prioriteiten en naderende deadlines. Gebruik om je werkdag te starten.",
      "rol": "cross-cutting"
    },
    {
      "slug": "management-assistent",
      "displayName": "Management Assistent",
      "emoji": "📌",
      "module": "core",
      "team": "gedeeld",
      "description": "Je persoonlijke rechterhand die overzicht bewaakt en prioriteiten stelt zodat niets tussen wal en schip valt. Gebruik voor je ochtendbrief en dagafsluiting.",
      "rol": null
    },
    {
      "slug": "quality-control",
      "displayName": "Quality Control",
      "emoji": "🛡️",
      "module": "core",
      "team": "gedeeld",
      "description": "Controleert agentwerk op feiten, logica, toon, bewijs en procesintegriteit en markeert wat een menselijke blik nodig heeft. Gebruik vóór belangrijke besluiten of publicatie.",
      "rol": "cross-cutting"
    },
    {
      "slug": "gids",
      "displayName": "Gids",
      "emoji": "🧭",
      "module": "core",
      "team": "gedeeld",
      "description": "Maakt je startklaar met je team en leert je stap voor stap hoe je het effectief inzet. Gebruik bij je eerste sessie of als je even niet verder komt.",
      "rol": "cross-cutting"
    },
    {
      "slug": "ceo-agent",
      "displayName": "CEO Agent",
      "emoji": "🌟",
      "module": "strategy",
      "team": "gedeeld",
      "description": "Strategische sparringpartner voor je commerciële koers: bewaakt richting, prioriteiten en samenhang tussen marketing, sales en product. Gebruik bij koersvragen.",
      "rol": null
    },
    {
      "slug": "coo-agent",
      "displayName": "COO Agent",
      "emoji": "🏛️",
      "module": "backoffice",
      "team": "gedeeld",
      "description": "Operationeel leider die financiële gezondheid, compliance, administratie en capaciteit bewaakt. Gebruik voor operationele en organisatorische vraagstukken.",
      "rol": null
    },
    {
      "slug": "marktmaker",
      "displayName": "Marktmaker",
      "emoji": "🎯",
      "module": "growth",
      "team": "ceo",
      "description": "Strategische marketingdenker die bepaalt waar en voor wie je zichtbaar bent en hoe je structureel leads wint. Gebruik voor positionering en campagnestrategie.",
      "rol": null
    },
    {
      "slug": "researcher",
      "displayName": "Researcher",
      "emoji": "🔍",
      "module": "growth",
      "team": "ceo",
      "description": "Vindt en kwalificeert potentiële klantorganisaties in jouw doelsegmenten. Gebruik om nieuwe prospects op te sporen op basis van concrete koopsignalen.",
      "rol": null
    },
    {
      "slug": "pipeline-manager",
      "displayName": "Pipeline Manager",
      "emoji": "📊",
      "module": "growth",
      "team": "ceo",
      "description": "Bewaakt je salespipeline zodat elke deal een status, volgende actie en eigenaar heeft. Gebruik om stagnerende deals te spotten en je week te reviewen.",
      "rol": null
    },
    {
      "slug": "product-designer",
      "displayName": "Product Designer",
      "emoji": "🧪",
      "module": "strategy",
      "team": "ceo",
      "description": "Ontwerpt en optimaliseert je aanbod vanuit wat de markt nodig heeft. Gebruik voor nieuwe producten, prijsstelling en het aanscherpen van je portfolio.",
      "rol": null
    },
    {
      "slug": "outreach-specialist",
      "displayName": "Outreach Specialist",
      "emoji": "📨",
      "module": "sales",
      "team": "ceo",
      "description": "Schrijft gepersonaliseerde outreach die laat zien dat je de persoon en organisatie echt kent. Gebruik voor eerste benadering en follow-ups naar prospects.",
      "rol": null
    },
    {
      "slug": "dealmaker",
      "displayName": "Dealmaker",
      "emoji": "🤝",
      "module": "sales",
      "team": "ceo",
      "description": "Onderzoekt koopcontext en helpt gesprekken, businesscases, offertes en besluitvorming voorbereiden—evidence-first en zonder klanten te benaderen of namens jou te onderhandelen.",
      "rol": null
    },
    {
      "slug": "content-strateeg",
      "displayName": "Content Strateeg",
      "emoji": "✍️",
      "module": "visibility",
      "team": "ceo",
      "description": "Ontwikkelt samen met jou inhoudelijke, onderbouwde content: van gekozen idee en onderzoek tot concept, review, planning en leren na publicatie.",
      "rol": null
    },
    {
      "slug": "de-stem",
      "displayName": "De Stem",
      "emoji": "🎙️",
      "module": "visibility",
      "team": "ceo",
      "description": "Scherpt het onderscheidende verhaal, de geloofwaardige hoek en het passende podium. Gebruik voor thought leadership, PR, media-pitches en personal branding.",
      "rol": null
    },
    {
      "slug": "delivery-architect",
      "displayName": "Delivery Architect",
      "emoji": "🎒",
      "module": "delivery",
      "team": "ceo",
      "description": "Ontwerpt stap voor stap hoe je een opdracht uitvoert bij de klant. Gebruik als er nog geen duidelijke aanpak is voor een deal, product of maatwerktraject.",
      "rol": null
    },
    {
      "slug": "controller",
      "displayName": "Controller",
      "emoji": "📊",
      "module": "backoffice",
      "team": "coo",
      "description": "Je financiële geweten dat terug- én vooruitkijkt: rapportages, cashflow, forecasting en fiscale planning. Gebruik voor cijfers, marges en financiële scenario's.",
      "rol": null
    },
    {
      "slug": "jurist",
      "displayName": "Jurist",
      "emoji": "⚖️",
      "module": "backoffice",
      "team": "coo",
      "description": "Juridisch adviseur die je bedrijf beschermt: kloppende contracten, afgedekte risico's en compliance op orde. Gebruik voor contractchecks en juridische vragen.",
      "rol": null
    },
    {
      "slug": "administratie",
      "displayName": "Administratie",
      "emoji": "📋",
      "module": "backoffice",
      "team": "coo",
      "description": "Bereidt je facturatie voor en volgt openstaande posten op: uren verantwoord, factuurregels klaargezet in je boekhoudpakket. Gebruik voor facturatie, debiteuren en uren.",
      "rol": null
    },
    {
      "slug": "seo-geo-specialist",
      "displayName": "SEO/GEO Specialist",
      "emoji": "🧲",
      "module": "visibility",
      "team": "ceo",
      "description": "Bepaalt welke onderwerpen vindbaarheid opleveren vóórdat er geschreven wordt, en toetst achteraf of pagina's gevonden worden — in Google én in AI-assistenten zoals ChatGPT en Perplexity.",
      "rol": null
    },
    {
      "slug": "customer-success-manager",
      "displayName": "Customer Success Manager",
      "emoji": "💚",
      "module": "delivery",
      "team": "coo",
      "description": "Bewaakt de klantrelatie na de deal: begeleidt onboarding, signaleert retentierisico's, herkent groeikansen en verwerkt klantfeedback. Gebruik voor health-checks en verlengingen.",
      "rol": null
    },
    {
      "slug": "informatiemanager",
      "displayName": "Informatiemanager",
      "emoji": "🖥️",
      "module": "backoffice",
      "team": "coo",
      "description": "Bewaakt je digitale werkomgeving: de juiste tools, betrouwbare data en actuele kennis. Gebruik voor toolkeuzes, toolstack- en security-audits, datakwaliteit en het opschonen van je kennisbank.",
      "rol": null
    }
  ],
  "datadomeinen": {
    "organisaties": {
      "naam": "Organisaties",
      "module": "core",
      "emoji": "🏢",
      "velden": [
        {
          "naam": "Naam",
          "type": "titel"
        },
        {
          "naam": "Fase",
          "type": "select",
          "opties": [
            "Prospect",
            "Lead",
            "Actieve klant",
            "Voormalig klant",
            "Partner"
          ]
        },
        {
          "naam": "Segment",
          "type": "select",
          "opties_dynamisch": "segment_options"
        },
        {
          "naam": "Omvang FTE",
          "type": "select",
          "opties": [
            "<50",
            "50-100",
            "100-250",
            "250-500",
            "500-1000",
            "1000-5000",
            "5000+"
          ]
        },
        {
          "naam": "Lead Bron",
          "type": "select",
          "opties": [
            "Netwerk",
            "LinkedIn",
            "Event",
            "Referral",
            "AI Research",
            "Inbound"
          ]
        },
        {
          "naam": "Signaal",
          "type": "tekst"
        },
        {
          "naam": "Signaal Datum",
          "type": "datum"
        },
        {
          "naam": "Website",
          "type": "url"
        },
        {
          "naam": "LinkedIn",
          "type": "url"
        },
        {
          "naam": "Vestigingsplaats",
          "type": "tekst"
        },
        {
          "naam": "Eigenaar",
          "type": "mensen"
        },
        {
          "naam": "KvK-nummer",
          "type": "tekst"
        },
        {
          "naam": "Notities",
          "type": "tekst"
        },
        {
          "naam": "Signaalbron",
          "type": "url"
        },
        {
          "naam": "Signaal publicatiedatum",
          "type": "datum"
        },
        {
          "naam": "Signaal geverifieerd op",
          "type": "datum"
        }
      ]
    },
    "contactpersonen": {
      "naam": "Contactpersonen",
      "module": "core",
      "emoji": "👤",
      "velden": [
        {
          "naam": "Naam",
          "type": "titel"
        },
        {
          "naam": "Functie",
          "type": "tekst"
        },
        {
          "naam": "E-mail",
          "type": "email"
        },
        {
          "naam": "LinkedIn URL",
          "type": "url"
        },
        {
          "naam": "Warmte",
          "type": "select",
          "opties": [
            "Koud",
            "Lauw",
            "Warm",
            "Heet"
          ]
        },
        {
          "naam": "Outreach Status",
          "type": "select",
          "opties": [
            "Niet benaderd",
            "Benaderd",
            "Gereageerd",
            "In gesprek",
            "Niet reageren"
          ]
        },
        {
          "naam": "Rol in besluitvorming",
          "type": "select",
          "opties": [
            "Champion",
            "Decision Maker",
            "Influencer",
            "Gatekeeper"
          ]
        },
        {
          "naam": "Laatste Contact",
          "type": "datum"
        },
        {
          "naam": "Notities",
          "type": "tekst"
        },
        {
          "naam": "Organisatie",
          "type": "relatie",
          "naar": "organisaties"
        },
        {
          "naam": "Buying-grouprol",
          "type": "select",
          "opties": [
            "Sponsor",
            "Probleemeigenaar",
            "Gebruiker",
            "Product-/proceseigenaar",
            "Finance",
            "Procurement",
            "IT/architectuur",
            "Data",
            "Security",
            "Privacy/legal",
            "Operations/support",
            "Blocker"
          ]
        },
        {
          "naam": "Grondslag benadering",
          "type": "select",
          "opties": [
            "Toestemming",
            "Klantrelatie",
            "Gerechtvaardigd belang",
            "Opengesteld adres"
          ]
        },
        {
          "naam": "Bron persoonsgegevens",
          "type": "tekst"
        },
        {
          "naam": "Art. 14 geïnformeerd op",
          "type": "datum"
        },
        {
          "naam": "Bezwaar/afmelding",
          "type": "checkbox"
        },
        {
          "naam": "Bezwaar/afmelding op",
          "type": "datum"
        }
      ]
    },
    "interacties": {
      "naam": "Interacties",
      "module": "sales",
      "emoji": "💬",
      "velden": [
        {
          "naam": "Onderwerp",
          "type": "titel"
        },
        {
          "naam": "Type",
          "type": "select",
          "opties": [
            "LinkedIn bericht",
            "E-mail",
            "Telefoongesprek",
            "Meeting",
            "Demo",
            "Event",
            "Overig"
          ]
        },
        {
          "naam": "Richting",
          "type": "select",
          "opties": [
            "Uitgaand",
            "Inkomend",
            "Intern"
          ]
        },
        {
          "naam": "Datum",
          "type": "datum"
        },
        {
          "naam": "Samenvatting",
          "type": "tekst"
        },
        {
          "naam": "Sentiment",
          "type": "select",
          "opties": [
            "Positief",
            "Neutraal",
            "Negatief",
            "Geen reactie"
          ]
        },
        {
          "naam": "Volgende Actie",
          "type": "tekst"
        },
        {
          "naam": "Actie Deadline",
          "type": "datum"
        },
        {
          "naam": "Bericht Tekst",
          "type": "tekst"
        },
        {
          "naam": "Organisatie",
          "type": "relatie",
          "naar": "organisaties"
        },
        {
          "naam": "Deal (link)",
          "type": "url"
        },
        {
          "naam": "Actie doorgezet",
          "type": "checkbox"
        },
        {
          "naam": "Contactpersoon",
          "type": "relatie",
          "naar": "contactpersonen"
        },
        {
          "naam": "Deal",
          "type": "relatie",
          "naar": "sales_funnel"
        },
        {
          "naam": "Project",
          "type": "relatie",
          "naar": "projecten",
          "crossModuleBedoeld": true
        }
      ]
    },
    "sales_funnel": {
      "naam": "Sales Funnel",
      "module": "core",
      "emoji": "📊",
      "velden": [
        {
          "naam": "Deal Naam",
          "type": "titel"
        },
        {
          "naam": "Fase",
          "type": "select",
          "opties": [
            "Targeting (10%)",
            "Discovery (20%)",
            "Probleemdefinitie (30%)",
            "Visievorming (50%)",
            "Oplossingsrichting (70%)",
            "Besluitvorming (85%)",
            "Contractering (95%)",
            "After-sales (100%)"
          ]
        },
        {
          "naam": "Opvolg Status",
          "type": "select",
          "opties": [
            "Actie Vereist",
            "In afwachting",
            "Op schema",
            "Gewonnen",
            "Verloren",
            "Gepauzeerd"
          ]
        },
        {
          "naam": "Verwachte Omzet",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Omzet bewust onbekend",
          "type": "checkbox"
        },
        {
          "naam": "Probability",
          "type": "getal",
          "format": "percent"
        },
        {
          "naam": "Verwachte Sluitdatum",
          "type": "datum"
        },
        {
          "naam": "Volgende Actie",
          "type": "tekst"
        },
        {
          "naam": "Volgende Actie Deadline",
          "type": "datum"
        },
        {
          "naam": "Laatste Contact",
          "type": "datum"
        },
        {
          "naam": "Lead Bron",
          "type": "select",
          "opties": [
            "Netwerk",
            "LinkedIn",
            "Event",
            "Referral",
            "AI Research",
            "Inbound"
          ]
        },
        {
          "naam": "Eigenaar",
          "type": "mensen"
        },
        {
          "naam": "Notities",
          "type": "tekst"
        },
        {
          "naam": "Organisatie",
          "type": "relatie",
          "naar": "organisaties"
        },
        {
          "naam": "Contactpersonen",
          "type": "relatie",
          "naar": "contactpersonen",
          "meervoud": true
        },
        {
          "naam": "Producten",
          "type": "relatie",
          "naar": "product_catalogus",
          "meervoud": true
        },
        {
          "naam": "Fase sinds",
          "type": "datum"
        }
      ]
    },
    "projecten": {
      "naam": "Projecten",
      "module": "delivery",
      "emoji": "📁",
      "velden": [
        {
          "naam": "Projectnaam",
          "type": "titel"
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Opstarten",
            "Actief",
            "Afgerond",
            "Gepauzeerd",
            "Geannuleerd"
          ]
        },
        {
          "naam": "Startdatum",
          "type": "datum"
        },
        {
          "naam": "Einddatum",
          "type": "datum"
        },
        {
          "naam": "Contractwaarde",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Gefactureerd",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Eigenaar",
          "type": "mensen"
        },
        {
          "naam": "Gedeelde Pagina",
          "type": "url"
        },
        {
          "naam": "Notities",
          "type": "tekst"
        },
        {
          "naam": "Risiconiveau",
          "type": "select",
          "opties": [
            "Hoog",
            "Midden",
            "Laag"
          ]
        },
        {
          "naam": "Deliveryrisico's",
          "type": "tekst"
        },
        {
          "naam": "Evaluatie",
          "type": "tekst"
        },
        {
          "naam": "Geëvalueerd op",
          "type": "datum"
        },
        {
          "naam": "Organisatie",
          "type": "relatie",
          "naar": "organisaties"
        },
        {
          "naam": "Contactpersonen",
          "type": "relatie",
          "naar": "contactpersonen",
          "meervoud": true
        },
        {
          "naam": "Uitvoerenden",
          "type": "relatie",
          "naar": "contactpersonen",
          "meervoud": true
        },
        {
          "naam": "Deal",
          "type": "relatie",
          "naar": "sales_funnel"
        },
        {
          "naam": "Producten",
          "type": "relatie",
          "naar": "product_catalogus",
          "meervoud": true
        }
      ]
    },
    "offertes": {
      "naam": "Offertes",
      "module": "sales",
      "emoji": "📄",
      "velden": [
        {
          "naam": "Offertenummer",
          "type": "titel"
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Concept",
            "Verstuurd",
            "In bespreking",
            "Geaccepteerd",
            "Afgewezen",
            "Verlopen"
          ]
        },
        {
          "naam": "Bedrag excl. BTW",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "BTW bedrag",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Geldig tot",
          "type": "datum"
        },
        {
          "naam": "Verstuurd op",
          "type": "datum"
        },
        {
          "naam": "Getekend op",
          "type": "datum"
        },
        {
          "naam": "Offerte URL",
          "type": "url"
        },
        {
          "naam": "Notities",
          "type": "tekst"
        },
        {
          "naam": "Deal",
          "type": "relatie",
          "naar": "sales_funnel"
        },
        {
          "naam": "Contactpersoon",
          "type": "relatie",
          "naar": "contactpersonen"
        },
        {
          "naam": "Organisatie",
          "type": "relatie",
          "naar": "organisaties"
        },
        {
          "naam": "Producten",
          "type": "relatie",
          "naar": "product_catalogus",
          "meervoud": true
        },
        {
          "naam": "Versie",
          "type": "getal",
          "format": "number"
        }
      ]
    },
    "product_catalogus": {
      "naam": "Product Catalogus",
      "module": "core",
      "emoji": "🧩",
      "velden": [
        {
          "naam": "Productnaam",
          "type": "titel"
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Actief",
            "In creatie",
            "Archief"
          ]
        },
        {
          "naam": "Type",
          "type": "select",
          "opties": [
            "Advies",
            "Training",
            "Coaching",
            "Assessment",
            "E-learning",
            "Abonnement",
            "Template",
            "Overig"
          ]
        },
        {
          "naam": "Prijs",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Prijsmodel",
          "type": "select",
          "opties": [
            "Vast",
            "Per dag",
            "Per deelnemer",
            "Per maand",
            "Per kwartaal",
            "Op maat"
          ]
        },
        {
          "naam": "Plek in ladder",
          "type": "select",
          "opties": [
            "Awareness",
            "Diagnose",
            "Activatie",
            "Verdieping",
            "Verankering",
            "Evenement"
          ]
        },
        {
          "naam": "Segment",
          "type": "multi_select",
          "opties_dynamisch": "segment_options"
        },
        {
          "naam": "Beschrijving",
          "type": "tekst"
        },
        {
          "naam": "USP",
          "type": "tekst"
        },
        {
          "naam": "Notities",
          "type": "tekst"
        },
        {
          "naam": "Probleem",
          "type": "tekst"
        },
        {
          "naam": "Doelgroep",
          "type": "tekst"
        },
        {
          "naam": "Oplossing",
          "type": "tekst"
        },
        {
          "naam": "Marge",
          "type": "getal",
          "format": "percent"
        },
        {
          "naam": "Validatiestatus",
          "type": "select",
          "opties": [
            "Idee",
            "In validatie",
            "Gevalideerd",
            "Afgewezen"
          ]
        },
        {
          "naam": "Go/No-Go-criteria",
          "type": "tekst"
        }
      ]
    },
    "content_kalender": {
      "naam": "Content Kalender",
      "module": "visibility",
      "emoji": "📅",
      "velden": [
        {
          "naam": "Titel",
          "type": "titel"
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Idee",
            "Geselecteerd",
            "In productie",
            "Klaar voor review",
            "Gepland",
            "Gepubliceerd",
            "Archief"
          ]
        },
        {
          "naam": "Type",
          "type": "select",
          "opties": [
            "LinkedIn post",
            "Artikel",
            "E-mail template",
            "Case study",
            "Persbericht",
            "Podcast",
            "Video",
            "Overig"
          ]
        },
        {
          "naam": "Segment",
          "type": "select",
          "opties_dynamisch": "segment_options"
        },
        {
          "naam": "Merk",
          "type": "tekst"
        },
        {
          "naam": "Herkomst",
          "type": "multi_select",
          "opties": [
            "Gebruiker",
            "Marktmaker",
            "SEO/GEO Specialist",
            "De Stem",
            "Dealmaker",
            "Customer Success Manager",
            "Researcher"
          ]
        },
        {
          "naam": "Koopuitkomst",
          "type": "multi_select",
          "opties": [
            "Markt en situatie herkennen",
            "Probleem begrijpen",
            "Waarde en opties afwegen",
            "Bewijs en risico toetsen",
            "Besluit mogelijk maken",
            "Implementatie voorbereiden",
            "Waarde aantonen en verdiepen"
          ]
        },
        {
          "naam": "Kernvraag",
          "type": "tekst"
        },
        {
          "naam": "Hoofdboodschap",
          "type": "tekst"
        },
        {
          "naam": "Menselijke input",
          "type": "tekst"
        },
        {
          "naam": "Bronnen",
          "type": "tekst"
        },
        {
          "naam": "SEO/GEO briefing",
          "type": "tekst"
        },
        {
          "naam": "Hoekkaart",
          "type": "tekst"
        },
        {
          "naam": "Publicatiedatum",
          "type": "datum"
        },
        {
          "naam": "Kanaal",
          "type": "multi_select",
          "opties": [
            "LinkedIn",
            "Website",
            "E-mail",
            "Instagram",
            "YouTube",
            "Overig"
          ]
        },
        {
          "naam": "Hook A",
          "type": "tekst"
        },
        {
          "naam": "Hook B",
          "type": "tekst"
        },
        {
          "naam": "Concept Tekst",
          "type": "tekst"
        },
        {
          "naam": "Versie",
          "type": "getal"
        },
        {
          "naam": "Campagne",
          "type": "tekst"
        },
        {
          "naam": "CTA",
          "type": "tekst"
        },
        {
          "naam": "Prioriteit",
          "type": "select",
          "opties": [
            "Hoog",
            "Midden",
            "Laag"
          ]
        },
        {
          "naam": "Akkoord hoek",
          "type": "checkbox"
        },
        {
          "naam": "Menselijk akkoord",
          "type": "checkbox"
        },
        {
          "naam": "Akkoord versie",
          "type": "getal"
        },
        {
          "naam": "Publicatie URL",
          "type": "url"
        },
        {
          "naam": "Impressies",
          "type": "getal"
        },
        {
          "naam": "Engagement",
          "type": "getal"
        },
        {
          "naam": "Leersignaal",
          "type": "tekst"
        },
        {
          "naam": "Eigenaar",
          "type": "mensen"
        },
        {
          "naam": "Primaire koopuitkomst",
          "type": "select",
          "opties": [
            "Markt en situatie herkennen",
            "Probleem begrijpen",
            "Waarde en opties afwegen",
            "Bewijs en risico toetsen",
            "Besluit mogelijk maken",
            "Implementatie voorbereiden",
            "Waarde aantonen en verdiepen"
          ]
        },
        {
          "naam": "Moeite",
          "type": "select",
          "opties": [
            "Hoog",
            "Midden",
            "Laag"
          ]
        }
      ]
    },
    "lessen_inzichten": {
      "naam": "Lessen & Inzichten",
      "systeem": true,
      "module": "core",
      "emoji": "💡",
      "velden": [
        {
          "naam": "Les",
          "type": "titel"
        },
        {
          "naam": "Agent",
          "type": "select",
          "opties_dynamisch": "agent_options"
        },
        {
          "naam": "Categorie",
          "type": "select",
          "opties": [
            "Strategie & Koers",
            "Marketing & Positionering",
            "Sales Pipeline",
            "Sales & Conversie",
            "Content & Communicatie",
            "Reputatie & PR",
            "Markt & Prospects",
            "Outreach & Acquisitie",
            "Product & Portfolio",
            "Operations & Finance",
            "Finance & Fiscaal",
            "Juridisch & Compliance",
            "Administratie & Facturatie",
            "Delivery & Uitvoering",
            "Kwaliteit & Review",
            "Team Coördinatie",
            "Dagelijks Ritme",
            "Content & Zichtbaarheid",
            "Klantsucces & Retentie",
            "Data & Tooling"
          ]
        },
        {
          "naam": "Datum",
          "type": "datum"
        },
        {
          "naam": "Actie",
          "type": "tekst"
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Open",
            "In uitvoering",
            "Afgerond",
            "Vervallen"
          ]
        },
        {
          "naam": "Impact",
          "type": "select",
          "opties": [
            "Hoog",
            "Medium",
            "Laag"
          ]
        },
        {
          "naam": "Verwerkt in prompt?",
          "type": "checkbox"
        }
      ]
    },
    "bedrijfscontext": {
      "naam": "Bedrijfscontext",
      "systeem": true,
      "module": "core",
      "emoji": "📋",
      "velden": [
        {
          "naam": "Onderdeel",
          "type": "titel"
        },
        {
          "naam": "Inhoud",
          "type": "tekst"
        },
        {
          "naam": "Versie",
          "type": "getal",
          "format": "number"
        },
        {
          "naam": "Bijgewerkt",
          "type": "datum"
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Concept",
            "Vastgesteld",
            "Verouderd"
          ]
        }
      ]
    },
    "logboek": {
      "naam": "Logboek",
      "systeem": true,
      "module": "core",
      "emoji": "📔",
      "velden": [
        {
          "naam": "Onderwerp",
          "type": "titel"
        },
        {
          "naam": "Agent",
          "type": "select",
          "opties_dynamisch": "agent_options"
        },
        {
          "naam": "Type",
          "type": "select",
          "opties": [
            "Sessielog",
            "Werkstuk"
          ]
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Lopend",
            "Afgerond",
            "Archief"
          ]
        },
        {
          "naam": "Datum",
          "type": "datum"
        },
        {
          "naam": "Resultaat",
          "type": "tekst"
        },
        {
          "naam": "Link",
          "type": "url"
        },
        {
          "naam": "Vervolg",
          "type": "tekst"
        }
      ]
    },
    "dagverslagen": {
      "naam": "Dagverslagen",
      "module": "core",
      "emoji": "📓",
      "velden": [
        {
          "naam": "Naam",
          "type": "titel"
        },
        {
          "naam": "Type",
          "type": "select",
          "opties": [
            "Dagverslag",
            "Weekoverzicht",
            "Maandoverzicht"
          ]
        },
        {
          "naam": "Dag",
          "type": "datum"
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Te doen",
            "In uitvoering",
            "Afgerond"
          ]
        },
        {
          "naam": "Persoon",
          "type": "mensen"
        }
      ]
    },
    "delivery_rugzak": {
      "naam": "Delivery Rugzak",
      "module": "delivery",
      "emoji": "🎒",
      "velden": [
        {
          "naam": "Naam",
          "type": "titel"
        },
        {
          "naam": "Type",
          "type": "select",
          "opties": [
            "Model / Framework",
            "Theorie / Concept",
            "Werkvorm / Oefening",
            "Template / Tool",
            "Facilitatietechniek",
            "Overig"
          ]
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "💡 Idee",
            "In ontwikkeling",
            "Gereed",
            "Archief"
          ]
        },
        {
          "naam": "Beschrijving",
          "type": "tekst"
        },
        {
          "naam": "Wanneer inzetten",
          "type": "tekst"
        },
        {
          "naam": "Werkt goed bij",
          "type": "tekst"
        },
        {
          "naam": "Werkt niet bij",
          "type": "tekst"
        },
        {
          "naam": "Laatst ingezet",
          "type": "datum"
        },
        {
          "naam": "Benodigdheden",
          "type": "tekst"
        },
        {
          "naam": "Segment",
          "type": "multi_select",
          "opties_dynamisch": "segment_options"
        },
        {
          "naam": "Bron",
          "type": "url"
        }
      ]
    },
    "tijdregistratie": {
      "naam": "Tijdregistratie",
      "module": "backoffice",
      "emoji": "⏱️",
      "velden": [
        {
          "naam": "Beschrijving",
          "type": "titel"
        },
        {
          "naam": "Datum",
          "type": "datum"
        },
        {
          "naam": "Uren",
          "type": "getal",
          "format": "number"
        },
        {
          "naam": "Type",
          "type": "select",
          "opties": [
            "Billable",
            "Intern",
            "Marketing",
            "Overhead"
          ]
        },
        {
          "naam": "Uurtarief",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Gefactureerd",
          "type": "checkbox"
        },
        {
          "naam": "Persoon",
          "type": "mensen"
        },
        {
          "naam": "Organisatie",
          "type": "relatie",
          "naar": "organisaties"
        },
        {
          "naam": "Project",
          "type": "relatie",
          "naar": "projecten",
          "crossModuleBedoeld": true
        }
      ]
    },
    "acties": {
      "naam": "Acties",
      "module": "core",
      "emoji": "✅",
      "velden": [
        {
          "naam": "Actie",
          "type": "titel"
        },
        {
          "naam": "Eigenaar",
          "type": "tekst"
        },
        {
          "naam": "Agent",
          "type": "select",
          "opties_dynamisch": "agent_options"
        },
        {
          "naam": "Deadline",
          "type": "datum"
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Voorstel",
            "Open",
            "Bezig",
            "Wacht",
            "Wacht op review",
            "Klaar"
          ]
        },
        {
          "naam": "Type",
          "type": "select",
          "opties": [
            "Taak",
            "Alert",
            "Opvolging",
            "Beslissing"
          ]
        },
        {
          "naam": "Prioriteit",
          "type": "select",
          "opties": [
            "Hoog",
            "Normaal",
            "Laag"
          ]
        },
        {
          "naam": "Toelichting",
          "type": "tekst"
        },
        {
          "naam": "Aangemaakt door",
          "type": "tekst"
        },
        {
          "naam": "Organisatie",
          "type": "relatie",
          "naar": "organisaties"
        },
        {
          "naam": "Bron (link)",
          "type": "url"
        },
        {
          "naam": "Afgerond door",
          "type": "tekst"
        },
        {
          "naam": "Afgerond op",
          "type": "datum"
        },
        {
          "naam": "Gecorrigeerd",
          "type": "checkbox"
        },
        {
          "naam": "Correctie",
          "type": "tekst"
        },
        {
          "naam": "Deal",
          "type": "relatie",
          "naar": "sales_funnel"
        },
        {
          "naam": "Project",
          "type": "relatie",
          "naar": "projecten",
          "crossModuleBedoeld": true
        },
        {
          "naam": "Contactpersoon",
          "type": "relatie",
          "naar": "contactpersonen"
        },
        {
          "naam": "Interactie",
          "type": "relatie",
          "naar": "interacties",
          "crossModuleBedoeld": true
        },
        {
          "naam": "Bovenliggende actie",
          "type": "relatie",
          "naar": "acties"
        }
      ]
    },
    "notities": {
      "naam": "Notities",
      "systeem": true,
      "module": "core",
      "emoji": "📝",
      "velden": [
        {
          "naam": "Onderwerp",
          "type": "titel"
        },
        {
          "naam": "Notitie",
          "type": "tekst"
        },
        {
          "naam": "Datum",
          "type": "datum"
        },
        {
          "naam": "Auteur",
          "type": "tekst"
        },
        {
          "naam": "Soort",
          "type": "select",
          "opties": [
            "Mens",
            "Agent"
          ]
        },
        {
          "naam": "Betreft",
          "type": "relatie",
          "naar": "*"
        }
      ]
    },
    "ritmetaken": {
      "naam": "Ritmetaken",
      "module": "core",
      "emoji": "🔁",
      "velden": [
        {
          "naam": "Taak",
          "type": "titel"
        },
        {
          "naam": "Agent",
          "type": "select",
          "opties_dynamisch": "agent_options"
        },
        {
          "naam": "Ritme",
          "type": "select",
          "opties": [
            "elk-uur",
            "elke-2-uur",
            "elke-4-uur",
            "dagelijks",
            "wekelijks-ma",
            "wekelijks-di",
            "wekelijks-wo",
            "wekelijks-vr",
            "maandelijks"
          ]
        },
        {
          "naam": "Volgorde",
          "type": "getal"
        },
        {
          "naam": "Laatst gedraaid",
          "type": "datum"
        },
        {
          "naam": "Actief",
          "type": "checkbox"
        },
        {
          "naam": "Bron-template",
          "type": "tekst"
        },
        {
          "naam": "Instructie",
          "type": "tekst"
        }
      ]
    },
    "klantsucces": {
      "naam": "Klantsucces",
      "module": "delivery",
      "emoji": "💚",
      "velden": [
        {
          "naam": "Klantnaam",
          "type": "titel"
        },
        {
          "naam": "Fase",
          "type": "select",
          "opties": [
            "Onboarding",
            "Actief",
            "Risico",
            "Verlenging",
            "Verloren"
          ]
        },
        {
          "naam": "Health",
          "type": "select",
          "opties": [
            "Groen",
            "Oranje",
            "Rood"
          ]
        },
        {
          "naam": "Verlengdatum",
          "type": "datum"
        },
        {
          "naam": "Laatste check",
          "type": "datum"
        },
        {
          "naam": "Signalen",
          "type": "tekst"
        },
        {
          "naam": "Eigenaar",
          "type": "tekst"
        },
        {
          "naam": "Klant",
          "type": "relatie",
          "naar": "organisaties"
        },
        {
          "naam": "Volgende actie",
          "type": "tekst"
        },
        {
          "naam": "Actie deadline",
          "type": "datum"
        },
        {
          "naam": "Adoptie",
          "type": "select",
          "opties": [
            "Hoog",
            "Gemiddeld",
            "Laag"
          ]
        },
        {
          "naam": "Deal",
          "type": "relatie",
          "naar": "sales_funnel"
        },
        {
          "naam": "Project",
          "type": "relatie",
          "naar": "projecten"
        },
        {
          "naam": "Contactpersoon",
          "type": "relatie",
          "naar": "contactpersonen"
        }
      ]
    },
    "productbacklog": {
      "naam": "Productbacklog",
      "module": "core",
      "emoji": "🗂️",
      "velden": [
        {
          "naam": "Item",
          "type": "titel"
        },
        {
          "naam": "Herkomst",
          "type": "tekst"
        },
        {
          "naam": "Eigenaar",
          "type": "select",
          "opties": [
            "Product Designer",
            "Delivery Architect"
          ]
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "To do",
            "Doing",
            "Ter validatie",
            "Done"
          ]
        },
        {
          "naam": "Prioriteit",
          "type": "select",
          "opties": [
            "Hoog",
            "Midden",
            "Laag"
          ]
        },
        {
          "naam": "Besluit",
          "type": "tekst"
        }
      ]
    },
    "besluiten": {
      "naam": "Besluiten",
      "module": "strategy",
      "emoji": "🌟",
      "velden": [
        {
          "naam": "Besluit",
          "type": "titel"
        },
        {
          "naam": "Datum",
          "type": "datum"
        },
        {
          "naam": "Horizon",
          "type": "select",
          "opties": [
            "3HAG",
            "1HAG",
            "Kwartaal",
            "Ad hoc"
          ]
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Genomen",
            "Herzien",
            "Teruggedraaid",
            "Vervallen"
          ]
        },
        {
          "naam": "Aanleiding",
          "type": "tekst"
        },
        {
          "naam": "Alternatieven",
          "type": "tekst"
        },
        {
          "naam": "Onderbouwing",
          "type": "tekst"
        },
        {
          "naam": "Meetpunt",
          "type": "tekst"
        },
        {
          "naam": "Herzien op",
          "type": "datum"
        },
        {
          "naam": "Uitkomst",
          "type": "tekst"
        },
        {
          "naam": "Bron (link)",
          "type": "url"
        }
      ]
    },
    "toolstack": {
      "naam": "Toolstack",
      "module": "backoffice",
      "emoji": "🖥️",
      "velden": [
        {
          "naam": "Tool",
          "type": "titel"
        },
        {
          "naam": "Categorie",
          "type": "select",
          "opties": [
            "CRM & werkdata",
            "Communicatie",
            "Financieel & administratie",
            "Marketing & content",
            "AI & automatisering",
            "Opslag & documenten",
            "Beveiliging & toegang",
            "Overig"
          ]
        },
        {
          "naam": "Doel",
          "type": "tekst"
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Actief",
            "Proef",
            "Opzeggen",
            "Opgezegd"
          ]
        },
        {
          "naam": "Eigenaar",
          "type": "tekst"
        },
        {
          "naam": "Kosten per maand",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Verlengdatum",
          "type": "datum"
        },
        {
          "naam": "Datalocatie",
          "type": "select",
          "opties": [
            "EU",
            "Buiten EU",
            "Onbekend"
          ]
        },
        {
          "naam": "Persoonsgegevens",
          "type": "checkbox"
        },
        {
          "naam": "Verwerkersovereenkomst",
          "type": "checkbox"
        },
        {
          "naam": "Toegang",
          "type": "tekst"
        },
        {
          "naam": "Notities",
          "type": "tekst"
        }
      ]
    },
    "financieel_overzicht": {
      "naam": "Financieel Overzicht",
      "module": "backoffice",
      "emoji": "💶",
      "velden": [
        {
          "naam": "Periode",
          "type": "titel"
        },
        {
          "naam": "Type",
          "type": "select",
          "opties": [
            "Maandcijfers",
            "Forecast",
            "Budget",
            "Capaciteit"
          ]
        },
        {
          "naam": "Peildatum",
          "type": "datum"
        },
        {
          "naam": "Omzet",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Kosten",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Resultaat",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Cash einde periode",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Toelichting",
          "type": "tekst"
        }
      ]
    },
    "contracten": {
      "naam": "Contracten",
      "module": "backoffice",
      "emoji": "📜",
      "velden": [
        {
          "naam": "Contractnaam",
          "type": "titel"
        },
        {
          "naam": "Type",
          "type": "select",
          "opties": [
            "Klantcontract",
            "Leverancierscontract",
            "NDA",
            "Verwerkersovereenkomst",
            "Arbeids-/opdrachtovereenkomst",
            "Overig"
          ]
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Concept",
            "Actief",
            "Opgezegd",
            "Beëindigd"
          ]
        },
        {
          "naam": "Wederpartij",
          "type": "relatie",
          "naar": "organisaties"
        },
        {
          "naam": "Startdatum",
          "type": "datum"
        },
        {
          "naam": "Einddatum",
          "type": "datum"
        },
        {
          "naam": "Verlengdatum",
          "type": "datum"
        },
        {
          "naam": "Opzegtermijn",
          "type": "tekst"
        },
        {
          "naam": "DPA-status",
          "type": "select",
          "opties": [
            "N.v.t.",
            "Nodig",
            "Aanwezig"
          ]
        },
        {
          "naam": "Risico",
          "type": "select",
          "opties": [
            "Hoog",
            "Midden",
            "Laag"
          ]
        },
        {
          "naam": "Locatie",
          "type": "url"
        },
        {
          "naam": "Notities",
          "type": "tekst"
        }
      ]
    },
    "seo_vraagonderzoek": {
      "naam": "SEO Vraagonderzoek",
      "module": "visibility",
      "emoji": "🔍",
      "velden": [
        {
          "naam": "Vraag",
          "type": "titel"
        },
        {
          "naam": "Segment",
          "type": "select",
          "opties_dynamisch": "segment_options"
        },
        {
          "naam": "Koopintentie",
          "type": "select",
          "opties": [
            "Hoog",
            "Midden",
            "Laag"
          ]
        },
        {
          "naam": "Koopuitkomst",
          "type": "select",
          "opties": [
            "Markt en situatie herkennen",
            "Probleem begrijpen",
            "Waarde en opties afwegen",
            "Bewijs en risico toetsen",
            "Besluit mogelijk maken",
            "Implementatie voorbereiden",
            "Waarde aantonen en verdiepen"
          ]
        },
        {
          "naam": "Bron",
          "type": "select",
          "opties": [
            "Klantkennis",
            "Google",
            "AI-assistent",
            "Sitedata"
          ]
        },
        {
          "naam": "Al gedekt",
          "type": "checkbox"
        },
        {
          "naam": "Prioriteit",
          "type": "select",
          "opties": [
            "Hoog",
            "Midden",
            "Laag"
          ]
        }
      ]
    },
    "vindbaarheid_audit": {
      "naam": "Vindbaarheid Audit",
      "module": "visibility",
      "emoji": "📶",
      "velden": [
        {
          "naam": "Pagina",
          "type": "titel"
        },
        {
          "naam": "Pagina URL",
          "type": "url"
        },
        {
          "naam": "Segment",
          "type": "select",
          "opties_dynamisch": "segment_options"
        },
        {
          "naam": "Zoekintentie match",
          "type": "getal",
          "format": "number"
        },
        {
          "naam": "Titel en meta",
          "type": "getal",
          "format": "number"
        },
        {
          "naam": "Koppenstructuur",
          "type": "getal",
          "format": "number"
        },
        {
          "naam": "Direct antwoordblok",
          "type": "getal",
          "format": "number"
        },
        {
          "naam": "Interne links",
          "type": "getal",
          "format": "number"
        },
        {
          "naam": "Citeerbaarheid",
          "type": "getal",
          "format": "number"
        },
        {
          "naam": "Totaalscore",
          "type": "getal",
          "format": "number"
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Rood",
            "Oranje",
            "Groen"
          ]
        },
        {
          "naam": "Entiteit-consistentie",
          "type": "select",
          "opties": [
            "Ja",
            "Nee",
            "Onbekend"
          ]
        },
        {
          "naam": "Datum audit",
          "type": "datum"
        }
      ]
    },
    "geo_metingen": {
      "naam": "GEO Metingen",
      "module": "visibility",
      "emoji": "🤖",
      "velden": [
        {
          "naam": "Vraag",
          "type": "titel"
        },
        {
          "naam": "Segment",
          "type": "select",
          "opties_dynamisch": "segment_options"
        },
        {
          "naam": "Assistent",
          "type": "select",
          "opties": [
            "Google AI Overviews",
            "ChatGPT",
            "Perplexity",
            "Claude",
            "Overig"
          ]
        },
        {
          "naam": "Datum",
          "type": "datum"
        },
        {
          "naam": "Bedrijf genoemd",
          "type": "checkbox"
        },
        {
          "naam": "Bronnen wel genoemd",
          "type": "tekst"
        },
        {
          "naam": "Gat",
          "type": "tekst"
        },
        {
          "naam": "Vervolgactie",
          "type": "tekst"
        }
      ]
    },
    "pipeline_weekreview": {
      "naam": "Pipeline Weekreview",
      "module": "growth",
      "emoji": "📈",
      "velden": [
        {
          "naam": "Week",
          "type": "titel"
        },
        {
          "naam": "Datum",
          "type": "datum"
        },
        {
          "naam": "Aantal deals",
          "type": "getal",
          "format": "number"
        },
        {
          "naam": "Pipelinewaarde",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Gewogen waarde",
          "type": "getal",
          "format": "euro"
        },
        {
          "naam": "Per fase",
          "type": "tekst"
        },
        {
          "naam": "Mutaties",
          "type": "tekst"
        },
        {
          "naam": "Aandachtspunten",
          "type": "tekst"
        }
      ]
    },
    "klantbewijs": {
      "naam": "Klantbewijs",
      "module": "core",
      "emoji": "🏅",
      "velden": [
        {
          "naam": "Titel",
          "type": "titel"
        },
        {
          "naam": "Soort bewijs",
          "type": "select",
          "opties": [
            "Resultaatmeting",
            "Quote",
            "Case",
            "Referentie",
            "Overig"
          ]
        },
        {
          "naam": "Klant",
          "type": "relatie",
          "naar": "organisaties"
        },
        {
          "naam": "Bewering",
          "type": "tekst"
        },
        {
          "naam": "Meetcontext",
          "type": "tekst"
        },
        {
          "naam": "Beperkingen",
          "type": "tekst"
        },
        {
          "naam": "Toestemming",
          "type": "select",
          "opties": [
            "Onbekend",
            "Niet toegestaan",
            "Toegestaan"
          ]
        },
        {
          "naam": "Toestemming via",
          "type": "relatie",
          "naar": "contactpersonen"
        },
        {
          "naam": "Toestemmingsdatum",
          "type": "datum"
        },
        {
          "naam": "Kanaal en scope",
          "type": "tekst"
        },
        {
          "naam": "Niet publiceren",
          "type": "tekst"
        },
        {
          "naam": "Kernvraag",
          "type": "tekst"
        }
      ]
    },
    "autoriteit": {
      "naam": "Autoriteit",
      "module": "visibility",
      "emoji": "📣",
      "velden": [
        {
          "naam": "Titel",
          "type": "titel"
        },
        {
          "naam": "Categorie",
          "type": "select",
          "opties": [
            "Podium of medium",
            "Autoriteitsbewijs"
          ]
        },
        {
          "naam": "Vorm",
          "type": "select",
          "opties": [
            "Vakmedium",
            "Podcast",
            "Congres of event",
            "Panel",
            "Nieuwsbrief",
            "Community",
            "Vermelding",
            "Citaat",
            "Interview",
            "Gastartikel",
            "Optreden",
            "Award",
            "Eigen publicatie",
            "Overig"
          ]
        },
        {
          "naam": "Herkomst",
          "type": "select",
          "opties": [
            "Verdiend",
            "Eigen",
            "Nog niet van toepassing"
          ]
        },
        {
          "naam": "Aanleiding",
          "type": "select",
          "opties": [
            "Uitgenodigd",
            "Zelf gepitcht",
            "Eigen initiatief",
            "Onbekend"
          ]
        },
        {
          "naam": "Status",
          "type": "select",
          "opties": [
            "Kans",
            "Benaderd",
            "Toegezegd",
            "Gepubliceerd",
            "Afgewezen",
            "Niet passend"
          ]
        },
        {
          "naam": "Segment",
          "type": "select",
          "opties_dynamisch": "segment_options"
        },
        {
          "naam": "Persoon",
          "type": "tekst"
        },
        {
          "naam": "Contact en beat",
          "type": "tekst"
        },
        {
          "naam": "Datum",
          "type": "datum"
        },
        {
          "naam": "Laatste contact",
          "type": "datum"
        },
        {
          "naam": "Link",
          "type": "url"
        },
        {
          "naam": "Bron en datum vaststelling",
          "type": "tekst"
        },
        {
          "naam": "Blijft er iets van over",
          "type": "select",
          "opties": [
            "Ja",
            "Nee",
            "Onbekend"
          ]
        },
        {
          "naam": "Hergebruikt in",
          "type": "multi_select",
          "opties": [
            "Offerte",
            "Gesprek",
            "Bio",
            "Post",
            "Nog niet"
          ]
        },
        {
          "naam": "Hergebruik aantal",
          "type": "getal",
          "format": "number"
        },
        {
          "naam": "Laatst hergebruikt",
          "type": "datum"
        },
        {
          "naam": "Content",
          "type": "relatie",
          "naar": "content_kalender"
        },
        {
          "naam": "Podium",
          "type": "relatie",
          "naar": "autoriteit"
        },
        {
          "naam": "Notities",
          "type": "tekst"
        }
      ]
    }
  },
  "werkruimteDomeinen": [
    "bronkoppeling",
    "dashboard_metrics",
    "teamfeed"
  ]
};
