#!/usr/bin/env python3
"""
Stelt de uitrol samen voor dashboard v2 op een losse link:
    https://dashboard.agentic-team.ai/       → ongewijzigd (de huidige release)
    https://dashboard.agentic-team.ai/v2/    → dashboard v2

WAAROM EEN PAD EN GEEN EIGEN DOMEIN. Elke werkruimte-instantie en de router
geven CORS aan precies één origin (DASHBOARD_ORIGIN, werkruimte src/config.ts).
Een eigen domein of het staging-project kan daardoor geen echte gegevens laden
zonder een uitrol over de hele vloot. Een pad op dezelfde origin wel: voor de
instanties is het hetzelfde dashboard. Alleen de OAuth-terugkeer-URL verschilt
(build.py --basis /v2/); de site moet die kennen (redirect_uris van de
dashboard-client, exacte match).

WAT HIER GEBEURT. Beide releases worden uit git gebouwd, met dezelfde vlaggen
als het productieproject (OAUTH_DASHBOARD staat daar aan, DASHBOARD_NOINDEX
niet), en samengevoegd in één map met een vercel.json die niets meer bouwt en
per pad zijn eigen CSP meegeeft — de scripthashes van beide artefacten zijn
verschillend. De root moet byte voor byte gelijk zijn aan wat nu live staat;
daarom bouwen we hem uit de commit van die deployment (b69c788 =
agentic-team-dashboard-nuiq34zvy, 25-9 08:10) en controleer je dat bij de
uitrol (zie UITROL-V2.md in de uitvoermap) vóór je promoot.

Gebruik:
    python3 scripts/bouw-losse-link.py                 # oud=b69c788, nieuw=origin/main
    python3 scripts/bouw-losse-link.py --nieuw HEAD --doel /tmp/uitrol-v2
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).parent.parent
PAD = "v2"


def uitpakken(ref: str, doel: Path) -> None:
    """Een schone kopie van `ref` zonder .git: dezelfde bron als een CLI-deploy."""
    doel.mkdir(parents=True)
    archief = subprocess.run(["git", "archive", "--format=tar", ref], cwd=ROOT, capture_output=True, check=True).stdout
    with tempfile.NamedTemporaryFile(suffix=".tar") as t:
        t.write(archief)
        t.flush()
        with tarfile.open(t.name) as tar:
            tar.extractall(doel, filter="data")


def bouw(map_: Path, *vlaggen: str) -> None:
    subprocess.run([sys.executable, "scripts/build.py", "--oauth", *vlaggen], cwd=map_, check=True)


def csp_uit(vercel_json: Path) -> list:
    d = json.loads(vercel_json.read_text(encoding="utf-8"))
    for regel in d.get("headers", []):
        if regel.get("source") == "/(.*)":
            return regel["headers"]
    raise SystemExit(f"FOUT: geen headerregel voor /(.*) in {vercel_json}")


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--oud", default="b69c788", help="commit van de release die op / blijft staan")
    ap.add_argument("--nieuw", default="origin/main", help="commit van dashboard v2")
    ap.add_argument("--doel", default=str(ROOT / "uitrol-v2"), help="uitvoermap (wordt leeggemaakt)")
    a = ap.parse_args()

    oud_sha = subprocess.run(["git", "rev-parse", "--short=7", a.oud], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    nieuw_sha = subprocess.run(["git", "rev-parse", "--short=7", a.nieuw], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    doel = Path(a.doel)
    shutil.rmtree(doel, ignore_errors=True)
    out = doel / "out"

    with tempfile.TemporaryDirectory() as tmp:
        oud, nieuw = Path(tmp) / "oud", Path(tmp) / "nieuw"
        uitpakken(a.oud, oud)
        uitpakken(a.nieuw, nieuw)

        # / — de huidige release, precies zoals het productieproject hem bouwt.
        bouw(oud)
        subprocess.run([sys.executable, "scripts/publiceer.py"], cwd=oud, check=True)
        shutil.copytree(oud / "out", out)
        versie = json.loads((out / "version.json").read_text(encoding="utf-8"))
        versie.update({"commit": oud_sha, "omgeving": "production"})
        (out / "version.json").write_text(json.dumps(versie, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        # /v2/ — dashboard v2, met de OAuth-terugkeer-URL op dat pad.
        bouw(nieuw, "--basis", f"/{PAD}/")
        (out / PAD).mkdir()
        shutil.copyfile(nieuw / "dashboard.html", out / PAD / "index.html")
        lock = json.loads((nieuw / "agent-architecture.lock.json").read_text(encoding="utf-8"))
        (out / PAD / "version.json").write_text(json.dumps({
            "naam": "agentic-team-dashboard", "pad": f"/{PAD}/", "commit": nieuw_sha,
            "registryVersion": lock.get("registryVersion"), "omgeving": "production",
        }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        csp_oud, csp_nieuw = csp_uit(oud / "vercel.json"), csp_uit(nieuw / "vercel.json")

    # Eén deployment, twee artefacten: per pad de eigen CSP. De rootregel slaat
    # /v2 over, zodat er nooit twee CSP-headers op één antwoord staan (dan
    # gelden ze allebei, en blokkeert de ene de scripts van de andere).
    (doel / "vercel.json").write_text(json.dumps({
        "buildCommand": "echo 'vooraf gebouwd door scripts/bouw-losse-link.py'",
        "outputDirectory": "out",
        # Geen redirect /v2 → /v2/: niet-strikt matcht "/v2" ook "/v2/", en
        # dat wordt een lus. Vercel serveert v2/index.html op beide.
        "headers": [
            {"source": f"/((?!{PAD}(?:/|$)).*)", "headers": csp_oud},
            {"source": f"/{PAD}", "headers": csp_nieuw},
            {"source": f"/{PAD}/(.*)", "headers": csp_nieuw},
        ],
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    (doel / "UITROL-V2.md").write_text(f"""# Uitrol dashboard v2 op /{PAD}/

Gebouwd uit: / = {oud_sha}, /{PAD}/ = {nieuw_sha}.
sha256 out/index.html = {sha(out / "index.html")}
sha256 out/{PAD}/index.html = {sha(out / PAD / "index.html")}

1. Site eerst: de terugkeer-URL https://dashboard.agentic-team.ai/{PAD}/ moet in
   redirect_uris van de dashboard-client staan (site-PR). Additief: bestaande
   logins op / merken niets.
2. Deploy zonder het domein te verplaatsen:
       cd {doel}
       vercel link --yes --project agentic-team-dashboard --scope tijmenkips-projects
       rm -f .env.local
       vercel deploy --prod --skip-domain --yes --archive=tgz --scope tijmenkips-projects
3. Controleer op de nieuwe deployment-URL (hieronder X) vóór je promoot:
   - curl -s X/ | shasum -a 256  ==  curl -s https://dashboard.agentic-team.ai/ | shasum -a 256
     (de root is byte voor byte de huidige release)
   - curl -sI X/{PAD}/ → 200, Content-Security-Policy met de v2-hashes
   - curl -sI X/ → Content-Security-Policy met de oude hashes, niet die van v2
4. Promoot:  vercel promote X --scope tijmenkips-projects
5. Open https://dashboard.agentic-team.ai/{PAD}/ en log in; of plak het deel
   na # van een daglink achter /{PAD}/.

Terug: vercel rollback https://agentic-team-dashboard-nuiq34zvy-tijmenkips-projects.vercel.app --scope tijmenkips-projects
""", encoding="utf-8")
    print(f"OK: {doel} — / = {oud_sha}, /{PAD}/ = {nieuw_sha}. Zie UITROL-V2.md.")


if __name__ == "__main__":
    main()
