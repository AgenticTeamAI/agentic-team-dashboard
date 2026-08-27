/* NOTICE-claim: "het uitgeleverde artefact bevat geen code, fonts of
 * afbeeldingen van derden".
 *
 * Die zin in NOTICE is geen belofte maar een feitelijke bewering, en hij
 * draagt onze juridische positie: MIT, ISC, BSD en Apache-2.0 activeren hun
 * attributieplicht bij *distributie*. Zolang er niets van een derde in
 * dashboard.html zit, is er niets te attribueren en klopt NOTICE. Zodra er
 * één font, één icoon uit een set, één polyfill of één geknipt stuk
 * voorbeeldcode in belandt, klopt hij niet meer — meestal zonder dat iemand
 * het merkt. Deze test (juridische toets 26-08-2026, punt 1.7) faalt dan.
 *
 * Twee lagen, want ze vangen verschillende fouten:
 *   1. HERKOMST — dashboard.html is byte voor byte te herleiden tot
 *      src/ + schema/. Er kan dus niets in het artefact zitten dat niet uit
 *      een bronbestand komt (build.py plakt alleen die bestanden samen).
 *   2. SIGNATUREN — de bronbestanden zélf worden gescand op sporen van
 *      derden: fonts, icoonsets, polyfills, geminificeerde bundels,
 *      licentie- en copyrightteksten, externe bronnen en SVG-metadata van
 *      tekenprogramma's. Laag 1 alleen is blind voor code die iemand in
 *      src/ heeft geplakt.
 *
 * Faalt deze test terecht (er is bewust iets van een derde toegevoegd), dan
 * is de fix niet "de test aanpassen" maar: NOTICE bijwerken met pakket,
 * versie, licentie en SPDX-identifier, en pas daarna de allowlist hier. */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lees = (rel) => readFileSync(join(ROOT, rel), "utf8");

const HTML = lees("dashboard.html");
const NOTICE = lees("NOTICE");

/* Dezelfde volgorde als JS_MODULES_IN_ORDER in scripts/build.py. Wijkt die
 * af, dan mislukt de herkomstcheck hieronder — precies de bedoeling. */
const JS_MODULES = [
  "teksten.js",
  "schema-helpers.js",
  "werkruimte-loader.js",
  "zones.js",
  "metrics-sanitize.js",
  "metrics.js",
  "render.js",
  "charts.js",
  "feed.js",
  "homepage.js",
  "databrowser.js",
  "app.js",
];

const BRONNEN = ["src/shell.html", "src/styles.css", "schema/schema.generated.js", ...JS_MODULES.map((n) => `src/${n}`)];

describe("herkomst — het artefact komt volledig uit src/ + schema/", () => {
  it("dashboard.html is byte voor byte de som van de bronbestanden", () => {
    const schema = lees("schema/schema.generated.js");
    const styles = lees("src/styles.css");
    const shell = lees("src/shell.html");
    const app = JS_MODULES.map((n) => lees(`src/${n}`)).join("\n\n");

    const registryVersion =
      schema
        .split("\n")
        .find((r) => r.includes('"registryVersion"'))
        ?.split(":")
        .slice(1)
        .join(":")
        .trim()
        .replace(/,$/, "")
        .replace(/^"|"$/g, "") ?? "onbekend";

    const cspHash = (tekst) => `'sha256-${createHash("sha256").update(tekst, "utf8").digest("base64")}'`;
    const cspMeta =
      '<meta http-equiv="Content-Security-Policy" content="script-src ' +
      cspHash(`\n${schema}\n`) +
      " " +
      cspHash(`\n${app}\n`) +
      '">';

    const verwacht = shell
      .replaceAll("__CSP_META__", cspMeta)
      .replaceAll("__ROBOTS_META__", "") // productiebouw: geen noindex
      .replaceAll("__STYLES__", styles)
      .replaceAll("__SCHEMA__", schema)
      .replaceAll("__APP__", app)
      .replaceAll("__REGISTRY_VERSION__", registryVersion);

    // Geen toEqual op de volledige tekst: bij een verschil is een diff van
    // 240 kB onleesbaar. Eerst de plek aanwijzen, dan pas falen.
    if (verwacht !== HTML) {
      let i = 0;
      while (i < verwacht.length && i < HTML.length && verwacht[i] === HTML[i]) i++;
      const regel = HTML.slice(0, i).split("\n").length;
      throw new Error(
        `dashboard.html is niet (meer) de som van ${BRONNEN.join(", ")}.\n` +
          `Eerste verschil op regel ${regel} (positie ${i}):\n` +
          `  uit de bron : ${JSON.stringify(verwacht.slice(i, i + 90))}\n` +
          `  in artefact : ${JSON.stringify(HTML.slice(i, i + 90))}\n` +
          `Draai 'python3 scripts/build.py' als de build simpelweg oud is. Blijft het ` +
          `verschil bestaan, dan zit er inhoud in dashboard.html die niet uit src/ of ` +
          `schema/ komt — en dan klopt de NOTICE-claim niet meer.`,
      );
    }
    expect(verwacht).toBe(HTML);
  });
});

/* Wat een derde in het artefact verraadt. Elk patroon staat er om een reden
 * die in de melding zelf uitgelegd wordt: de test moet zichzelf verklaren
 * aan wie hem over twee jaar rood ziet worden. */
const SIGNATUREN = [
  ["ingesloten font (@font-face)", /@font-face/i, "fonts hebben vrijwel altijd een eigen licentie (SIL OFL, CC-BY) mét attributieplicht"],
  ["fontbestand als data-URI", /data:(font|application\/(x-)?font|application\/vnd\.ms-fontobject)/i, "een meegeleverd fontbestand is distributie"],
  ["base64-fontpayload", /(d09GMg|d09GRg|AAEAAA[A-Za-z0-9+/]|T1RUTw|T1RUT8|wOF2|wOFF)[A-Za-z0-9+/]{40}/, "base64 van woff/woff2/ttf/otf, ook zonder mimetype herkenbaar"],
  ["externe font- of scriptbron", /fonts\.(googleapis|gstatic)\.com|use\.typekit|cdnjs|unpkg\.com|jsdelivr|cdn\.[a-z0-9-]+\.[a-z]{2,}/i, "een extern gehost onderdeel is nog steeds een onderdeel van derden"],
  ["extern stylesheet of script", /<link[^>]+rel=["']?stylesheet|<script[^>]+\ssrc=/i, "het artefact hoort zelfstandig te zijn: geen enkele externe bron"],
  ["icoonset van derden", /font-?awesome|\bfa-[a-z]{3,}|material-icons|\bbi-[a-z]{3,}|lucide|feather-icons|heroicons|octicons?|ionicons|bootstrap-icons|tabler-icons|phosphor-icons|simple-icons/i, "icoonsets dragen een eigen licentie (vaak MIT of CC-BY) met attributieplicht"],
  ["polyfill of transpiler-runtime", /core-js|regenerator-runtime|es5-shim|\bpolyfill\b|_classCallCheck|__webpack_require__|webpackJsonp|\/\/# sourceMappingURL/i, "polyfills zijn code van derden, ook al zijn ze klein"],
  ["licentietekst van een derde", /SPDX-License-Identifier|Permission is hereby granted, free of charge|Redistribution and use in source and binary forms|Apache License|SIL Open Font License|OFL-1\.1|Creative Commons|\bCC[ -]BY\b/i, "wie een licentietekst meelevert, levert het werk erbij mee"],
  ["auteursrechtvermelding", /copyright|\(c\)\s*(19|20)\d{2}|©/i, "elke copyright-regel in het artefact hoort van Licentiegever te zijn, en die staat in LICENSE/NOTICE — niet in de pagina"],
  ["SVG-metadata van een tekenprogramma", /inkscape|sodipodi|Generator:\s*(Adobe|Sketch|Figma)|<metadata|rdf:RDF|xmlns:dc=/i, "zulke metadata wijst op een SVG die ergens anders vandaan komt"],
  ["verwijzing naar geknipte voorbeeldcode", /stack\s?overflow|stackexchange|codepen\.io|gist\.github/i, "voorbeeldcode van internet is auteursrechtelijk beschermd (Stack Overflow: CC-BY-SA)"],
];

describe("signaturen — geen onderdelen van derden in dashboard.html", () => {
  it.each(SIGNATUREN)("bevat geen %s", (naam, patroon, waarom) => {
    const treffer = HTML.match(patroon);
    expect(
      treffer,
      treffer
        ? `dashboard.html bevat een ${naam} ("${treffer[0].slice(0, 60)}") — ${waarom}. ` +
          `Daarmee klopt de NOTICE-regel "bevat geen code, fonts of afbeeldingen van derden" niet meer: ` +
          `neem het onderdeel op in NOTICE (naam, versie, licentie, SPDX) of haal het uit het artefact.`
        : undefined,
    ).toBeNull();
  });

  it("bevat geen base64-blob (een ingesloten binair bestand van derden valt daaronder)", () => {
    // Alleen de tekstuele SVG-achtergrond in styles.css is toegestaan; die is
    // geen base64 en staat leesbaar in de bron.
    const blobs = HTML.match(/data:[a-z/+.-]*;base64,[A-Za-z0-9+/=]{100,}/gi) || [];
    expect(blobs.map((b) => b.slice(0, 60)), "een ingesloten binair bestand hoort in NOTICE thuis").toEqual([]);
  });

  it("bevat geen geminificeerde bundel (regel van meer dan 1500 tekens)", () => {
    const lang = HTML.split("\n")
      .map((regel, i) => [i + 1, regel.length])
      .filter(([, len]) => len > 1500);
    expect(
      lang,
      `regel(s) ${lang.map(([n]) => n).join(", ")} zijn extreem lang — dat is het patroon van een ` +
        `geplakte, geminificeerde bibliotheek. Klopt het toch, verhoog dan bewust de grens.`,
    ).toEqual([]);
  });
});

/* Fonts worden bijna altijd vergeten. Ze zitten hier niet in het artefact —
 * de stack noemt alleen namen, en een naam noemen is geen distributie: de
 * browser gebruikt wat er op het systeem van de bezoeker staat. Deze test
 * bewaakt dat het bij namen blijft. */
const TOEGESTANE_FONTFAMILIES = [
  "var(--font)", // de eigen variabele
  "inter", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "sans-serif",
  "sfmono-regular", "consolas", "monospace",
];

describe("fonts — alleen genoemd, nooit meegeleverd", () => {
  it("noemt geen font buiten de vastgelegde stack", () => {
    const families = [...HTML.matchAll(/font-family\s*:\s*([^;}"']+)/gi)]
      .flatMap((m) => m[1].split(","))
      .map((f) => f.trim().replace(/^["']|["']$/g, "").toLowerCase())
      .filter(Boolean);
    const onbekend = [...new Set(families.filter((f) => !TOEGESTANE_FONTFAMILIES.includes(f)))];
    expect(
      onbekend,
      `nieuwe fontnaam/-namen in het artefact: ${onbekend.join(", ")}. Controleer of het font alleen ` +
        `wordt genoemd (mag, geen attributieplicht) of ook wordt meegeleverd (dan hoort het in NOTICE), ` +
        `en breid daarna deze lijst uit.`,
    ).toEqual([]);
  });
});

describe("NOTICE — de bewering en de bewaker horen bij elkaar", () => {
  it("noemt deze test als bewaker van de runtime-claim", () => {
    expect(
      NOTICE,
      "NOTICE hoort te vermelden welke test de claim 'geen derden in het artefact' bewaakt",
    ).toContain("test/geen-derden-in-artefact.test.js");
  });

  it("claimt niet iets anders dan wat hier getest wordt", () => {
    expect(NOTICE).toMatch(/geen code, fonts of afbeeldingen van derden/);
  });
});
