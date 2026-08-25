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
    "schema-helpers.js",
    "werkruimte-loader.js",
    "zones.js",
    "metrics-sanitize.js",
    "metrics.js",
    "render.js",
    "charts.js",
    "feed.js",
    "homepage.js",
    "app.js",
]


def main():
    schema_js = (ROOT / "schema" / "schema.generated.js").read_text(encoding="utf-8")
    styles = (SRC / "styles.css").read_text(encoding="utf-8")
    shell = (SRC / "shell.html").read_text(encoding="utf-8")

    app_js = "\n\n".join((SRC / name).read_text(encoding="utf-8") for name in JS_MODULES_IN_ORDER)

    registry_version = "onbekend"
    for line in schema_js.splitlines():
        if '"registryVersion"' in line:
            registry_version = line.split(":", 1)[1].strip().strip(',').strip('"')
            break

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
        .replace("__STYLES__", styles)
        .replace("__SCHEMA__", schema_js)
        .replace("__APP__", app_js)
        .replace("__REGISTRY_VERSION__", registry_version)
    )

    out_path = ROOT / "dashboard.html"
    out_path.write_text(out, encoding="utf-8")
    print(f"OK: {out_path} geschreven ({len(out)} bytes).")

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
