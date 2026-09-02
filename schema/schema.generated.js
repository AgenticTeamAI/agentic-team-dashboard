// GEGENEREERD BESTAND - NIET HANDMATIG BEWERKEN.
//
// Gegenereerd door scripts/extract-schema.py uit
// AgenticTeamAI/agent-architecture, core/agents.json.
//   registryVersion : 1.65.0
//   registry updated: 2026-09-02
//   bron-commit     : 94832d6154f1d7ae2332f50615f4a860a90cbd42
//   geextraheerd op : 2026-09-02T17:48:14Z
//
// Verandert de registry (nieuwe agent, gewijzigd datadomein, nieuwe module),
// draai dit script dan opnieuw tegen een verse clone en commit het resultaat.
// Typ deze structuur nooit met de hand over - dat is precies de tweede bron
// van waarheid die de registry-koppeling (Stream B) moest voorkomen.
window.AGENTIC_TEAM_SCHEMA = {
  "registryVersion": "1.65.0",
  "registryUpdated": "2026-09-02",
  "sourceCommit": "94832d6154f1d7ae2332f50615f4a860a90cbd42",
  "extractedAt": "2026-09-02T17:48:14Z",
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
      "team": "gedeeld"
    },
    {
      "slug": "management-assistent",
      "displayName": "Management Assistent",
      "emoji": "📌",
      "module": "core",
      "team": "gedeeld"
    },
    {
      "slug": "quality-control",
      "displayName": "Quality Control",
      "emoji": "🛡️",
      "module": "core",
      "team": "gedeeld"
    },
    {
      "slug": "gids",
      "displayName": "Gids",
      "emoji": "🧭",
      "module": "core",
      "team": "gedeeld"
    },
    {
      "slug": "ceo-agent",
      "displayName": "CEO Agent",
      "emoji": "🌟",
      "module": "strategy",
      "team": "gedeeld"
    },
    {
      "slug": "coo-agent",
      "displayName": "COO Agent",
      "emoji": "🏛️",
      "module": "backoffice",
      "team": "gedeeld"
    },
    {
      "slug": "marktmaker",
      "displayName": "Marktmaker",
      "emoji": "🎯",
      "module": "growth",
      "team": "ceo"
    },
    {
      "slug": "researcher",
      "displayName": "Researcher",
      "emoji": "🔍",
      "module": "growth",
      "team": "ceo"
    },
    {
      "slug": "pipeline-manager",
      "displayName": "Pipeline Manager",
      "emoji": "📊",
      "module": "growth",
      "team": "ceo"
    },
    {
      "slug": "product-designer",
      "displayName": "Product Designer",
      "emoji": "🧪",
      "module": "strategy",
      "team": "ceo"
    },
    {
      "slug": "outreach-specialist",
      "displayName": "Outreach Specialist",
      "emoji": "📨",
      "module": "sales",
      "team": "ceo"
    },
    {
      "slug": "dealmaker",
      "displayName": "Dealmaker",
      "emoji": "🤝",
      "module": "sales",
      "team": "ceo"
    },
    {
      "slug": "content-strateeg",
      "displayName": "Content Strateeg",
      "emoji": "✍️",
      "module": "visibility",
      "team": "ceo"
    },
    {
      "slug": "de-stem",
      "displayName": "De Stem",
      "emoji": "🎙️",
      "module": "visibility",
      "team": "ceo"
    },
    {
      "slug": "delivery-architect",
      "displayName": "Delivery Architect",
      "emoji": "🎒",
      "module": "delivery",
      "team": "ceo"
    },
    {
      "slug": "controller",
      "displayName": "Controller",
      "emoji": "📊",
      "module": "backoffice",
      "team": "coo"
    },
    {
      "slug": "jurist",
      "displayName": "Jurist",
      "emoji": "⚖️",
      "module": "backoffice",
      "team": "coo"
    },
    {
      "slug": "administratie",
      "displayName": "Administratie",
      "emoji": "📋",
      "module": "backoffice",
      "team": "coo"
    },
    {
      "slug": "seo-geo-specialist",
      "displayName": "SEO/GEO Specialist",
      "emoji": "🧲",
      "module": "visibility",
      "team": "ceo"
    },
    {
      "slug": "customer-success-manager",
      "displayName": "Customer Success Manager",
      "emoji": "💚",
      "module": "delivery",
      "team": "coo"
    },
    {
      "slug": "informatiemanager",
      "displayName": "Informatiemanager",
      "emoji": "🖥️",
      "module": "backoffice",
      "team": "coo"
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
          "naar": "projecten"
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
        }
      ]
    },
    "product_catalogus": {
      "naam": "Product Catalogus",
      "module": "strategy",
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
          "naam": "Menselijk akkoord",
          "type": "checkbox"
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
        }
      ]
    },
    "lessen_inzichten": {
      "naam": "Lessen & Inzichten",
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
          "naam": "Project",
          "type": "relatie",
          "naar": "projecten"
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
          "naar": "projecten"
        },
        {
          "naam": "Contactpersoon",
          "type": "relatie",
          "naar": "contactpersonen"
        },
        {
          "naam": "Interactie",
          "type": "relatie",
          "naar": "interacties"
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
    }
  },
  "werkruimteDomeinen": [
    "bronkoppeling",
    "dashboard_metrics",
    "teamfeed"
  ]
};
