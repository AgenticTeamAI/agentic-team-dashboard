#!/usr/bin/env python3
"""
Agentic Team Dashboard — schema-extractie

Leest core/agents.json uit een (verse!) clone van AgenticTeamAI/agent-architecture
en genereert schema/schema.generated.js — het enige bestand in deze repo dat de
datadomeinen, hun veldnamen en de agentlijst beschrijft.

Waarom dit script bestaat, en waarom je het NOOIT moet vervangen door de JSON
handmatig over te typen: core/agents.json -> "datadomeinen" is in agent-architecture
de canonieke, enige plek waar domeinen en kolomnamen gedefinieerd zijn. Zowel
installer/setup_notion_databases.py als installer/setup_workbook.py lezen daar
letterlijk uit. Typt dit dashboard de veldnamen ergens anders over, dan ontstaat
er een tweede plek die op een dag uit de pas loopt - precies het probleem dat de
registry-koppeling in Stream B moest oplossen. Dit dashboard leest daarom niet
"wat we nog weten van de registry", maar draait dit script tegen een verse clone.

Gebruik:
    git clone https://<token>@github.com/AgenticTeamAI/agent-architecture.git /tmp/aa
    python3 scripts/extract-schema.py --source /tmp/aa --output schema/schema.generated.js

Het token hoort alleen in de clone-URL, nooit in een bestand van deze repo.
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def git_commit(repo_path):
    try:
        out = subprocess.run(
            ["git", "-C", str(repo_path), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip()
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="Extraheer datadomeinen + agentlijst uit agent-architecture")
    parser.add_argument("--source", required=True, help="Pad naar een verse clone van AgenticTeamAI/agent-architecture")
    parser.add_argument("--output", default="schema/schema.generated.js", help="Uitvoerpad voor het gegenereerde JS-bestand")
    # s31: CI extraheert op een schone uitpak (geen .git) van de gepinde commit
    # en moet byte-gelijk uitkomen met de gecommitte versie — daarom zijn de
    # twee niet-inhoudelijke velden van buitenaf te zetten.
    parser.add_argument("--source-commit", default=None, help="Commit-SHA van de bron als --source geen git-clone is (bv. een git-archive-uitpak)")
    parser.add_argument("--extracted-at", default=None, help="Vaste waarde voor extractedAt (ISO, UTC) i.p.v. 'nu' — voor reproduceerbare vergelijking in CI")
    args = parser.parse_args()

    registry_path = Path(args.source) / "core" / "agents.json"
    if not registry_path.exists():
        print(f"FOUT: {registry_path} bestaat niet. Is --source een clone van agent-architecture?")
        sys.exit(1)

    with open(registry_path, "r", encoding="utf-8") as f:
        registry = json.load(f)

    if "datadomeinen" not in registry:
        print("FOUT: core/agents.json bevat geen 'datadomeinen' - verkeerde versie van de registry?")
        sys.exit(1)

    agents = [
        {
            "slug": a["slug"],
            "displayName": a["displayName"],
            "emoji": a.get("emoji", ""),
            "module": a.get("module"),
            "team": a.get("team"),
        }
        for a in registry.get("agents", [])
    ]

    payload = {
        "registryVersion": registry.get("registryVersion"),
        "registryUpdated": registry.get("updated"),
        "sourceCommit": args.source_commit or git_commit(args.source),
        "extractedAt": args.extracted_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "modules": registry.get("modules", {}),
        "agents": agents,
        # opslag=werkruimte-domeinen (bv. dashboard_metrics) zijn afgeleide
        # data die alleen in de werkruimte-instantie leeft - geen bundel-
        # domein, telt niet mee in breedte/volledigheid. werkruimte-loader.js
        # heeft daarnaast een eigen slug-skip als tweede vangrail.
        "datadomeinen": {
            slug: domein
            for slug, domein in registry.get("datadomeinen", {}).items()
            if domein.get("opslag") != "werkruimte"
        },
        # De weggefilterde slugs apart meegeven: de werkruimte-loader moet ze
        # in het instantie-overzicht stil kunnen overslaan (het zijn geen
        # rows-domeinen), zonder ze hier hardcoded te kennen.
        "werkruimteDomeinen": sorted(
            slug
            for slug, domein in registry.get("datadomeinen", {}).items()
            if domein.get("opslag") == "werkruimte"
        ),
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    header = f"""// GEGENEREERD BESTAND - NIET HANDMATIG BEWERKEN.
//
// Gegenereerd door scripts/extract-schema.py uit
// AgenticTeamAI/agent-architecture, core/agents.json.
//   registryVersion : {payload['registryVersion']}
//   registry updated: {payload['registryUpdated']}
//   bron-commit     : {payload['sourceCommit']}
//   geextraheerd op : {payload['extractedAt']}
//
// Verandert de registry (nieuwe agent, gewijzigd datadomein, nieuwe module),
// draai dit script dan opnieuw tegen een verse clone en commit het resultaat.
// Typ deze structuur nooit met de hand over - dat is precies de tweede bron
// van waarheid die de registry-koppeling (Stream B) moest voorkomen.
"""
    js = header + "window.AGENTIC_TEAM_SCHEMA = " + json.dumps(payload, indent=2, ensure_ascii=False) + ";\n"

    out_path.write_text(js, encoding="utf-8")
    print(f"OK: {out_path} geschreven - {len(payload['datadomeinen'])} datadomeinen, {len(payload['agents'])} agents, {len(payload['modules'])} modules.")


if __name__ == "__main__":
    main()
