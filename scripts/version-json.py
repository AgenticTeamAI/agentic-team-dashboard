#!/usr/bin/env python3
"""
Schrijft out/version.json: welke build hier draait.

WAAROM. Dit dashboard is een statische build zonder server, en er was dus geen
enkele manier om van buitenaf te zien wélke versie er live staat. Dat kostte op
3 september vier dagen: de arch-pin van deze repo liep achter en dat bleek pas
toen de driftpoort rood ging. Het infrascherm van de site (/intern/infra) leest
dit bestand; zonder bestand blijft die rij op "niet te peilen" staan.

Bewust publiek en zonder sleutel, net als /api/health op de site: een commit-sha
en een registryversie zeggen niets wat een aanvaller verder helpt, en een
peilpunt achter een sleutel is geen peilpunt.

Draait ná `mkdir out` in de buildCommand van vercel.json, want out/ wordt daar
pas gemaakt. Buiten Vercel (lokaal) staan de git-velden op "onbekend"; dat is
geen fout, het zegt precies wat het is.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent


def lokale_commit() -> str:
    """Buiten Vercel: vraag het aan git. Lukt dat niet, dan 'onbekend'."""
    try:
        uit = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, timeout=5
        )
        return uit.stdout.strip()[:7] if uit.returncode == 0 else "onbekend"
    except Exception:
        return "onbekend"


def main() -> None:
    doel = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "out" / "version.json"

    sha = os.environ.get("VERCEL_GIT_COMMIT_SHA", "")
    lock = json.loads((ROOT / "agent-architecture.lock.json").read_text(encoding="utf-8"))

    inhoud = {
        "naam": "agentic-team-dashboard",
        "commit": sha[:7] if sha else lokale_commit(),
        "registryVersion": lock.get("registryVersion"),
        "archCommit": (lock.get("commit") or "")[:7] or None,
        "omgeving": os.environ.get("VERCEL_ENV", "lokaal"),
        "gebouwd": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    doel.parent.mkdir(parents=True, exist_ok=True)
    doel.write_text(json.dumps(inhoud, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"OK: {doel} geschreven ({inhoud['commit']}, registry {inhoud['registryVersion']}).")


if __name__ == "__main__":
    main()
