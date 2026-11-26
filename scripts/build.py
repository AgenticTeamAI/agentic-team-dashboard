#!/usr/bin/env python3
"""
Bouwt het releasebestand dashboard.html: één zelfstandig HTML-bestand,
werkt via file:// zonder server, zonder internet, zonder tokens.

Plakt src/shell.html samen met src/styles.css, schema/schema.generated.js
en de JS-modules in src/ (in laadvolgorde) tot dashboard.html in de
repo-root. Dit ís de "build" - er is bewust geen bundler/npm-toolchain
gebruikt (geen netwerktoegang nodig om dit te bouwen of te draaien).

Gebruik:
    python3 scripts/build.py
    python3 scripts/build.py --noindex   # staging: meta robots noindex erbij
    python3 scripts/build.py --oauth     # p10: loginknop + tokenflow aan
    python3 scripts/build.py --oauth --sessie   # s66: ingelogd blijven via het sessiecookie
"""
import hashlib
import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC = ROOT / "src"

JS_MODULES_IN_ORDER = [
    "teksten.js",
    "schema-helpers.js",
    "werkruimte-loader.js",
    "oauth-client.js",
    "zones.js",
    "voor-jou.js",
    "metrics-sanitize.js",
    "dagplan.js",
    "metrics.js",
    "render.js",
    "charts.js",
    "feed.js",
    "homepage.js",
    "databrowser.js",
    "data-bewerken.js",
    "item-blad.js",
    "voor-jou-scherm.js",
    "acties-tab.js",
    "vaste-taken.js",
    "catalogus.js",
    "hulp.js",
    "opdracht.js",
    "rijpagina.js",
    "notion-werk.js",
    "modules-beheer.js",
    "team-beheer.js",
    # f61: doorgeven aan je team als je acties in je eigen systeem staan.
    "opdrachten.js",
    # Dashboard v2: de schermlaag, in één afgeschermde scope (v2-begin.js
    # opent hem, v2-eind.js sluit hem). Zie v2-prod.js.
    "v2-prod.js",
    "v2-begin.js",
    "v2-basis.js",
    "v2-logica.js",
    "v2-voor-jou.js",
    "v2-acties-team.js",
    "v2-gegevens.js",
    "v2-hulp.js",
    "v2-bediening.js",
    "v2-eind.js",
    "app.js",
]


def main():
    # f25: staging (at-dashboard-staging.vercel.app) is publiek bereikbaar en
    # hoort niet in de zoekindex. Geen aparte build en geen tweede artefact:
    # dezelfde bouw met een extra meta-regel, aangezet via de omgevingsvariabele
    # DASHBOARD_NOINDEX op het staging-project. De CSP-hashes dekken alleen de
    # scriptblokken, dus deze meta verandert daar niets aan.
    noindex = "--noindex" in sys.argv

    # p10 fase 3 (OAuth-contract §9): OAUTH_DASHBOARD is BUILD-TIME, in de
    # trant van DASHBOARD_NOINDEX hierboven. De vlag reist als meta-tag mee in
    # het artefact; alleen de loginknop en de tokenflow zitten erachter.
    # Terugrollen is dus een redeploy, geen env-flip. De CSP-verbreding in
    # vercel.json staat er bewust BUITEN: die is onvoorwaardelijk, zodat de
    # header van staging en productie niet uiteen kan lopen met de vlag.
    oauth = "--oauth" in sys.argv

    # s66 stap 1 (besluit Tijmen 26-11-2026): DASHBOARD_SESSIE is, net als
    # OAUTH_DASHBOARD, BUILD-TIME. Met de vlag blijft de gebruiker ingelogd via
    # een httpOnly-cookie op www.agentic-team.ai (de BFF van de site); het
    # access-token leeft alleen in het geheugen van de pagina. De vlag bouwt
    # óp de loginflow: zonder --oauth is er geen loginknop en dus niets om
    # vast te houden. Een build met alleen --sessie is een vergissing in de
    # projectinstellingen, en die hoort hier te falen, niet stil inert te zijn.
    # Terugrollen is opnieuw bouwen zonder de vlag.
    sessie = "--sessie" in sys.argv
    if sessie and not oauth:
        raise SystemExit("FOUT: --sessie vraagt ook --oauth (DASHBOARD_SESSIE zonder OAUTH_DASHBOARD).")

    # Losse link (dashboard v2): hetzelfde artefact onder een pad op dezelfde
    # origin, bv. dashboard.agentic-team.ai/v2/. Zelfde origin = zelfde CORS op
    # de instanties en de router (die geven precies één origin toegang); alleen
    # de OAuth-terugkeer-URL verschilt, en die leest oauth-client.js uit deze
    # meta. Zonder vlag: "/" — precies zoals het was.
    basis = "/"
    if "--basis" in sys.argv:
        basis = sys.argv[sys.argv.index("--basis") + 1]
        if not re.fullmatch(r"/[a-z0-9-]+/", basis):
            raise SystemExit(f"FOUT: --basis moet de vorm /naam/ hebben, niet {basis!r}.")

    schema_js = (ROOT / "schema" / "schema.generated.js").read_text(encoding="utf-8")
    styles = (SRC / "styles.css").read_text(encoding="utf-8")
    shell = (SRC / "shell.html").read_text(encoding="utf-8")

    app_js = "\n\n".join((SRC / name).read_text(encoding="utf-8") for name in JS_MODULES_IN_ORDER)

    registry_version = "onbekend"
    for line in schema_js.splitlines():
        if '"registryVersion"' in line:
            registry_version = line.split(":", 1)[1].strip().strip(',').strip('"')
            break

    # i71: de voettekst noemde alleen een versienummer, en dat las als de
    # versie van de connector — terwijl het de gepinde schemaversie is waarop
    # dit artefact gebouwd is. Die twee lopen per definitie soms uiteen (de
    # pin wordt per PR bijgewerkt, de connector draait op arch-main). De datum
    # erbij maakt het verschil zichtbaar in plaats van verwarrend.
    schema_datum = "onbekend"
    lock_path = ROOT / "agent-architecture.lock.json"
    if lock_path.exists():
        schema_datum = json.loads(lock_path.read_text(encoding="utf-8")).get("bijgewerkt") or "onbekend"

    # b32 fase 2: CSP-hashes voor de twee inline scriptblokken. De pagina
    # draagt zo zijn eigen script-src (meta), die samen met de header-CSP uit
    # vercel.json geldt: 'unsafe-inline' in de header wordt daardoor genegeerd
    # en alleen precies deze twee blokken mogen draaien.
    def csp_hash(tekst: str) -> str:
        return "'sha256-" + base64.b64encode(hashlib.sha256(tekst.encode("utf-8")).digest()).decode() + "'"

    script_schema = "\n" + schema_js + "\n"
    script_app = "\n" + app_js + "\n"
    csp_meta = (
        '<meta http-equiv="Content-Security-Policy" content="script-src '
        + csp_hash(script_schema) + " " + csp_hash(script_app)
        + '">'
    )

    out = (
        shell
        .replace("__CSP_META__", csp_meta)
        .replace("__ROBOTS_META__", '<meta name="robots" content="noindex">' if noindex else "")
        # s66: de sessiemeta reist in hetzelfde gat als de oauth-meta, direct
        # erachter. Zonder --sessie is de uitvoer byte-gelijk aan vroeger.
        .replace("__OAUTH_META__", ('<meta name="at-oauth" content="1">' if oauth else "") + ('<meta name="at-sessie" content="1">' if sessie else ""))
        .replace("__BASIS_META__", f'<meta name="at-basis" content="{basis}">' if basis != "/" else "")
        .replace("__STYLES__", styles)
        .replace("__SCHEMA__", schema_js)
        .replace("__APP__", app_js)
        .replace("__REGISTRY_VERSION__", registry_version)
        .replace("__SCHEMA_DATUM__", schema_datum)
    )

    out_path = ROOT / "dashboard.html"
    out_path.write_text(out, encoding="utf-8")
    vlaggen = "".join(f" — met {naam}" for naam, aan in (("noindex", noindex), ("oauth-login", oauth), ("dashboardsessie", sessie), (f"basis {basis}", basis != "/")) if aan)
    print(f"OK: {out_path} geschreven ({len(out)} bytes){vlaggen}.")

    # Dezelfde hashes in de header-CSP (vercel.json), zodat de meta-tag niet
    # de enige drager is. vercel.json wordt door Vercel vóór de build gelezen:
    # dit bestand hoort dus gecommit te worden; de test bewaakt de gelijkheid.
    vercel_path = ROOT / "vercel.json"
    vercel = json.loads(vercel_path.read_text(encoding="utf-8"))
    for regel in vercel.get("headers", []):
        for h in regel.get("headers", []):
            if h.get("key") == "Content-Security-Policy":
                h["value"] = re.sub(r"script-src [^;]+;", "script-src " + csp_hash(script_schema) + " " + csp_hash(script_app) + ";", h["value"])
                # s31: een script-src zonder afsluitende puntkomma zou de
                # substitutie stil laten mislukken — dan draagt productie een
                # verkeerde hash en blokkeert de CSP het eigen script.
                if csp_hash(script_schema) not in h["value"] or csp_hash(script_app) not in h["value"]:
                    sys.exit("FOUT: vercel.json script-src kon niet bijgewerkt worden (staat script-src nog als 'script-src …;' met afsluitende puntkomma?).")
    vercel_path.write_text(json.dumps(vercel, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"OK: {vercel_path} script-src-hashes bijgewerkt.")


if __name__ == "__main__":
    main()
