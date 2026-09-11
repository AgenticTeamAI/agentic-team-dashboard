#!/usr/bin/env python3
"""
Zet out/ klaar voor de deploy: het releasebestand op zijn twee routes, het
favicon en version.json.

WAAROM DIT EEN SCRIPT IS EN GEEN SHELL-KETTING IN vercel.json. Dat was het wel,
tot die keten op 11 september 2026 over een harde grens liep: Vercel weigert een
buildCommand langer dan 256 tekens ("projectSettings.buildCommand should NOT be
longer than 256 characters"). Met version.json erbij werd hij 280 en faalde élke
CLI-deploy — nog voordat de build begon, met een foutmelding die niets over de
inhoud zei. De keten zat op 228 tekens, dus die grens lag al dichtbij zonder dat
iemand het wist. Hier is ruimte voor de volgende stap, en de stappen zijn nu te
lezen en te draaien zonder deploy.

WAAROM version.json. Dit dashboard is een statische build zonder server, dus er
was geen enkele manier om van buitenaf te zien welke versie er live staat. Dat
kostte op 3 september vier dagen: de arch-pin van deze repo liep achter en dat
bleek pas toen de driftpoort rood ging. Het infrascherm van de site
(/intern/infra) leest dit bestand; zonder bestand blijft die rij op "niet te
peilen" staan. Bewust publiek en zonder sleutel, net als /api/health op de site:
een commit-sha en een registryversie helpen een aanvaller niet verder, en een
peilpunt achter een sleutel is geen peilpunt.

Draait ná scripts/build.py — die schrijft dashboard.html in de repo-root.
Buiten Vercel komt de commit uit git en staat de omgeving op "lokaal"; dat is
geen fout, het zegt precies wat het is.

Gebruik:
    python3 scripts/build.py && python3 scripts/publiceer.py
"""
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT = ROOT / "out"


def lokale_commit() -> str:
    """Buiten Vercel: vraag het aan git. Lukt dat niet, dan 'onbekend'."""
    try:
        uit = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, timeout=5
        )
        return uit.stdout.strip()[:7] if uit.returncode == 0 else "onbekend"
    except Exception:
        return "onbekend"


def version_json() -> dict:
    sha = os.environ.get("VERCEL_GIT_COMMIT_SHA", "")
    lock = json.loads((ROOT / "agent-architecture.lock.json").read_text(encoding="utf-8"))
    return {
        "naam": "agentic-team-dashboard",
        "commit": sha[:7] if sha else lokale_commit(),
        "registryVersion": lock.get("registryVersion"),
        "archCommit": (lock.get("commit") or "")[:7] or None,
        "omgeving": os.environ.get("VERCEL_ENV", "lokaal"),
        "gebouwd": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def main() -> None:
    bron = ROOT / "dashboard.html"
    if not bron.exists():
        raise SystemExit("FOUT: dashboard.html ontbreekt — draai eerst scripts/build.py.")

    # Schoon beginnen: een achtergebleven bestand uit een vorige build zou
    # meegedeployed worden zonder dat iets erover klaagt.
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)

    # Twee routes naar hetzelfde bestand: / en /dashboard.html. Die tweede is
    # de link die in oudere werkruimtes en daglinks staat.
    shutil.copyfile(bron, OUT / "index.html")
    shutil.copyfile(bron, OUT / "dashboard.html")
    shutil.copyfile(ROOT / "public" / "favicon.ico", OUT / "favicon.ico")

    versie = version_json()
    (OUT / "version.json").write_text(
        json.dumps(versie, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(
        f"OK: out/ klaar — index.html, dashboard.html, favicon.ico, "
        f"version.json ({versie['commit']}, registry {versie['registryVersion']})."
    )


if __name__ == "__main__":
    main()
