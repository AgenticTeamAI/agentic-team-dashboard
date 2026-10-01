/* Laadt de bronmodules in deze testcontext, zoals scripts/build.py ze aan
 * elkaar plakt. De schermlaag van dashboard v2 (src/v2-begin.js t/m
 * src/v2-eind.js) is één afgeschermde scope en moet dus als één geheel
 * draaien: los is v2-begin.js geen geldige JavaScript. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Dezelfde volgorde als JS_MODULES_IN_ORDER in scripts/build.py (zonder app.js). */
export const MODULES = [
  "teksten.js", "schema-helpers.js", "werkruimte-loader.js", "oauth-client.js", "zones.js", "voor-jou.js",
  "metrics-sanitize.js", "metrics.js", "render.js", "charts.js", "feed.js", "homepage.js", "databrowser.js",
  "data-bewerken.js", "item-blad.js", "voor-jou-scherm.js", "acties-tab.js", "vaste-taken.js", "catalogus.js",
  "hulp.js", "opdracht.js", "rijpagina.js", "notion-werk.js", "modules-beheer.js", "team-beheer.js",
];
export const V2 = ["v2-prod.js", "v2-begin.js", "v2-basis.js", "v2-logica.js", "v2-voor-jou.js", "v2-acties-team.js",
  "v2-gegevens.js", "v2-hulp.js", "v2-bediening.js", "v2-eind.js"];

export function laadAlles({ metApp = false } = {}) {
  vm.runInThisContext(readFileSync(join(ROOT, "schema/schema.generated.js"), "utf8"), { filename: "schema.generated.js" });
  for (const m of MODULES) vm.runInThisContext(readFileSync(join(ROOT, "src", m), "utf8"), { filename: m });
  vm.runInThisContext(readFileSync(join(ROOT, "src", "v2-prod.js"), "utf8"), { filename: "v2-prod.js" });
  const scope = V2.slice(1).map((m) => readFileSync(join(ROOT, "src", m), "utf8")).join("\n\n");
  vm.runInThisContext(scope, { filename: "v2-scope.js" });
  if (metApp) vm.runInThisContext(readFileSync(join(ROOT, "src", "app.js"), "utf8"), { filename: "app.js" });
  return globalThis;
}

/* Een stub voor localStorage: die van jsdom bewaart in deze opzet niets. */
export function stubOpslag(win) {
  const kluis = new Map();
  Object.defineProperty(win, "localStorage", {
    configurable: true,
    value: { getItem: (k) => (kluis.has(k) ? kluis.get(k) : null), setItem: (k, v) => kluis.set(k, String(v)), removeItem: (k) => kluis.delete(k), _kluis: kluis },
  });
  return kluis;
}
