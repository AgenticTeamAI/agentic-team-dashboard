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
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC = ROOT / "src"

JS_MODULES_IN_ORDER = [
    "zip-xlsx.js",
    "schema-helpers.js",
    "bundle-loaders.js",
    "zones.js",
    "metrics.js",
    "render.js",
    "charts.js",
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

    out = (
        shell
        .replace("__STYLES__", styles)
        .replace("__SCHEMA__", schema_js)
        .replace("__APP__", app_js)
        .replace("__REGISTRY_VERSION__", registry_version)
    )

    out_path = ROOT / "dashboard.html"
    out_path.write_text(out, encoding="utf-8")
    print(f"OK: {out_path} geschreven ({len(out)} bytes).")


if __name__ == "__main__":
    main()
