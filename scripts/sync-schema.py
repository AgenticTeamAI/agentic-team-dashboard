#!/usr/bin/env python3
"""
Ververst schema/schema.generated.js uit agent-architecture en zet de pin in
agent-architecture.lock.json (backlog s31/s28).

Extraheert op een schone uitpak (git archive) van precies één commit die op
origin/main van agent-architecture staat — niet op een werkkopie met lokale
wijzigingen die CI nooit ziet. Daarna: python3 scripts/build.py en commit
schema/, dashboard.html, vercel.json en agent-architecture.lock.json samen.

Gebruik:
    python3 scripts/sync-schema.py                    # origin/main van ../agent-architecture
    python3 scripts/sync-schema.py --commit <sha>     # specifieke commit (moet op origin/main staan)
    python3 scripts/sync-schema.py --arch <pad>       # andere locatie van de clone (of env ARCH_PATH)
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ("Gepinde commit van AgenticTeamAI/agent-architecture waaruit schema/schema.generated.js is geëxtraheerd "
       "(backlog s31 + s28). CI extraheert opnieuw op precies deze commit en faalt bij verschil, en faalt ook zodra "
       "core/ op arch-main verder is dan de pin — code uit arch draait hier nooit, alleen core/agents.json wordt "
       "gelezen. Bijwerken: python3 scripts/sync-schema.py (schrijft schema + dit bestand). Niet met de hand bewerken.")


def git(arch, *args, text=True):
    return subprocess.run(["git", "-C", str(arch), *args], check=True, capture_output=True, text=text).stdout


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arch", default=os.environ.get("ARCH_PATH", str(ROOT.parent / "agent-architecture")))
    ap.add_argument("--commit", default="origin/main")
    args = ap.parse_args()
    arch = Path(args.arch).resolve()
    if not (arch / ".git").exists():
        sys.exit(f"sync-schema: geen git-repo op {arch}. Clone AgenticTeamAI/agent-architecture ernaast of geef --arch <pad>.")

    git(arch, "fetch", "-q", "origin", "main")
    commit = git(arch, "rev-parse", "--verify", f"{args.commit}^{{commit}}").strip()
    if subprocess.run(["git", "-C", str(arch), "merge-base", "--is-ancestor", commit, "origin/main"]).returncode != 0:
        sys.exit(f"sync-schema: {commit} staat niet op origin/main van agent-architecture; CI checkt de pin uit op de remote en zou hem niet vinden.")

    with tempfile.TemporaryDirectory(prefix="sync-schema-") as tmp:
        tar_pad = Path(tmp) / "core.tar"
        subprocess.run(["git", "-C", str(arch), "archive", "--format=tar", "-o", str(tar_pad), commit, "core"], check=True)
        subprocess.run(["tar", "-xf", str(tar_pad), "-C", tmp], check=True)
        registry = json.loads((Path(tmp) / "core" / "agents.json").read_text(encoding="utf-8"))
        subprocess.run([sys.executable, str(ROOT / "scripts" / "extract-schema.py"),
                        "--source", tmp, "--source-commit", commit,
                        "--output", str(ROOT / "schema" / "schema.generated.js")], check=True)

    # p10: de OAuth-fixture volgt dezelfde route als het schema — letterlijke kopie
    # van dezelfde pin, zodat site, werkruimte en dashboard tegen één versie
    # verifiëren (contract §12). Ontbreekt hij op die commit, dan is dat geen
    # fout: pins van vóór p10 kennen het bestand niet.
    fixture_versie = None
    try:
        fixture = subprocess.run(["git", "-C", str(arch), "show", f"{commit}:architectuur/oauth-fixture.json"],
                                 capture_output=True, text=True, check=True).stdout
        (ROOT / "test" / "fixtures").mkdir(parents=True, exist_ok=True)
        (ROOT / "test" / "fixtures" / "oauth-fixture.json").write_text(fixture, encoding="utf-8")
        fixture_versie = json.loads(fixture).get("contract_versie", "?")
    except subprocess.CalledProcessError:
        print("sync-schema: geen architectuur/oauth-fixture.json op deze commit — overgeslagen")

    lock = {"_doc": DOC, "repository": "AgenticTeamAI/agent-architecture", "commit": commit,
            "registryVersion": registry.get("registryVersion"), "bijgewerkt": datetime.now(timezone.utc).date().isoformat()}
    (ROOT / "agent-architecture.lock.json").write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"sync-schema: schema ← registry {lock['registryVersion']}" + (f", oauth-fixture ← contract {fixture_versie}" if fixture_versie else "") + f" @ {commit[:7]}; pin bijgewerkt. Nu: python3 scripts/build.py en commit schema/, dashboard.html, vercel.json en agent-architecture.lock.json.")


if __name__ == "__main__":
    main()
