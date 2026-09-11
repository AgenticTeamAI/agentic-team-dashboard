// @vitest-environment jsdom
/* i75 — het werkstuk van een agent leesbaar maken.
 *
 * De vondst: de regelovergangen die een agent schrijft stáán in de werkruimte,
 * maar HTML vouwt elke \n tot een spatie. Een Toelichting van vijfduizend
 * tekens kwam daardoor als één ononderbroken blok op het scherm, op regels van
 * honderdtwintig aanslagen. Deze tests bewaken de drie dingen die dat oplossen
 * — structuur, plaatsing en veiligheid — en het feit dat een notitie niet twee
 * keer gemeld wordt. */
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [
  "schema/schema.generated.js",
  "src/teksten.js",
  "src/schema-helpers.js",
  "src/werkruimte-loader.js",
  "src/zones.js",
  "src/metrics-sanitize.js",
  "src/metrics.js",
  "src/render.js",
  "src/charts.js",
  "src/feed.js",
  "src/homepage.js",
  "src/databrowser.js",
  "src/data-bewerken.js",
];

let g;
beforeAll(() => {
  for (const rel of MODULES) {
    vm.runInThisContext(readFileSync(join(ROOT, rel), "utf8"), { filename: rel });
  }
  g = globalThis;
});

function el() {
  const d = document.createElement("div");
  document.body.appendChild(d);
  return d;
}

function ctxMet(domains, kind = "rows") {
  return {
    schema: g.getSchema(),
    bundle: { kind, source: "werkruimte", sourceLabel: "je werkruimte", domains },
  };
}

/* Zo schrijft een agent een resultaat weg: een kop, vette tussenkoppen, een
 * citaatblok met een conceptbericht, een scheiding en een genummerde lijst.
 * Letterlijk de vorm uit de Greenhive-werkruimte. */
const WERKSTUK = [
  "## Resultaat — 2026-08-27 — Customer Success Manager",
  "",
  "**Health-check:** relatie Kuenen Installatietechniek is gezond.",
  "",
  "**Voorstel concept-bericht:**",
  "",
  "> Onderwerp: Bedankt voor je aanbeveling, Gerrit!",
  ">",
  "> Beste Gerrit, nog even terugkomend op ons gesprek.",
  "",
  "---",
  "",
  "1. Van de 14 open deals zitten er 12 in Productiebedrijven.",
  "2. Het onevenwicht zit in de open pipeline, niet in het trackrecord.",
  "",
  "- eerste punt",
  "- tweede punt",
].join("\n");

describe("i75 — langeTekstHtml geeft de structuur terug die de agent bedoelde", () => {
  it("een regelovergang wordt een alinea, niet een spatie", () => {
    const html = g.langeTekstHtml("Eerste zin.\n\nTweede zin.");
    expect(html.match(/<p>/g)).toHaveLength(2);
    // Dit is precies wat er misging: zonder blokvorming stond alles op één regel.
    expect(html).not.toContain("Eerste zin. Tweede zin.");
  });

  it("herkent kop, vette kop, citaat, streep, genummerde en gewone lijst", () => {
    const html = g.langeTekstHtml(WERKSTUK);
    expect(html).toContain('<p class="prosa-kop">Resultaat — 2026-08-27 — Customer Success Manager</p>');
    expect(html).toContain('<p class="prosa-kop">Voorstel concept-bericht:</p>');
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<hr>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<strong>Health-check:</strong>");
  });

  it("een citaatblok loopt door over een lege >-regel heen", () => {
    // "> > Beste Gerrit" op het scherm was het bewijs dat de \n er wél was.
    const html = g.langeTekstHtml("> Onderwerp: Hoi\n>\n> Beste Gerrit");
    expect(html.match(/<blockquote>/g)).toHaveLength(1);
    expect(html).toContain("<p>Onderwerp: Hoi</p><p>Beste Gerrit</p>");
  });

  it("een genummerde lijst die niet bij 1 begint houdt zijn nummers", () => {
    expect(g.langeTekstHtml("3. derde\n4. vierde")).toContain('<ol start="3">');
  });

  it("opmaak die we niet kennen blijft gewone tekst, en gaat niet verloren", () => {
    const html = g.langeTekstHtml("Een [link](http://x) en een | tabel |");
    expect(html).toContain("[link](http://x)");
    expect(html).toContain("| tabel |");
  });

  it("de tekst komt van een LLM-agent: er gaat nooit HTML uit de bron mee", () => {
    const vijandig = '## <img src=q onerror=window.__i75=1>\n\n**<script>alert(1)</script>**\n\n> <b>x</b>';
    const html = g.langeTekstHtml(vijandig);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;img src=q onerror=window.__i75=1&gt;");
    // Het zichtbare resultaat blijft de tekst zelf, niet een leeg gat.
    const d = el();
    d.innerHTML = html;
    expect(d.textContent).toContain("alert(1)");
    expect(window.__i75).toBeUndefined();
  });
});

describe("i75 — de detailkaart", () => {
  const ACTIE = {
    Actie: "Nazorggesprek Kuenen",
    Status: "Wacht op review",
    Eigenaar: "Tom Bakker",
    Toelichting: WERKSTUK,
    "Aangemaakt door": "Management Assistent",
    __entryId: "act-1",
  };

  function kaart() {
    const c = el();
    g.wisDataDetail();
    g.renderDataDomein(c, "acties", ctxMet({ acties: { rows: [ACTIE] } }));
    c.querySelector(".rij-open-knop").click();
    return c;
  }

  it("zet lange tekst in een eigen blok over de volle breedte", () => {
    const c = kaart();
    const lang = c.querySelectorAll(".detail-lang");
    expect(lang).toHaveLength(1);
    expect(lang[0].querySelector(".detail-lang-kop").textContent).toBe("Toelichting");
    expect(lang[0].querySelector(".prosa .prosa-kop")).not.toBeNull();
  });

  it("houdt korte velden in de tabelvorm — en zet ze vóór de lange tekst", () => {
    const c = kaart();
    const velden = [...c.querySelectorAll(".detail-regel .detail-veld")].map(e => e.textContent);
    expect(velden).toContain("Eigenaar");
    expect(velden).toContain("Aangemaakt door");
    expect(velden).not.toContain("Toelichting");

    // De metadata mag niet twee schermen onder het werkstuk belanden.
    const kaartEl = c.querySelector("[data-detail-kaart]");
    const posities = [...kaartEl.children].map(e => e.className);
    expect(posities.lastIndexOf("detail-regel")).toBeLessThan(posities.indexOf("detail-lang"));
  });

  it("een korte waarde blijft een korte waarde", () => {
    const c = el();
    g.wisDataDetail();
    g.renderDataDomein(c, "acties", ctxMet({ acties: { rows: [{ Actie: "Bellen", __entryId: "a2" }] } }));
    c.querySelector(".rij-open-knop").click();
    expect(c.querySelectorAll(".detail-lang")).toHaveLength(0);
  });
});

describe("i75 — een notitie wordt één keer gemeld", () => {
  const ORG = { Naam: "Acme Holding", __entryId: "org-1" };
  const NOTITIE = {
    Onderwerp: "Test",
    Notitie: "Wacht op interne goedkeuring.",
    Betreft: { id: "org-1", titel: "Acme Holding", domein: "organisaties" },
    __entryId: "not-1",
  };

  it("staat de notitiedraad er, dan niet nog eens onder 'Wat hieraan hangt'", () => {
    const ctx = ctxMet({ organisaties: { rows: [ORG] }, notities: { rows: [NOTITIE] } });
    if (!ctx.schema.datadomeinen.notities) return; // registry nog niet gesynct
    const c = el();
    g.wisDataDetail();
    g.renderDataDomein(c, "organisaties", ctx);
    c.querySelector(".rij-open-knop").click();

    // Eén keer, en wel de versie mét tekst.
    expect(c.querySelectorAll(".notitie-tekst")).toHaveLength(1);
    expect(c.querySelector(".notitie-tekst").textContent).toContain("Wacht op interne goedkeuring");
    const terug = [...c.querySelectorAll(".detail-terug")].map(e => e.textContent);
    expect(terug.some(t => t.includes("Notities"))).toBe(false);
  });

  it("de helper zelf blijft algemeen — hij kent notities gewoon", () => {
    const ctx = ctxMet({ organisaties: { rows: [ORG] }, notities: { rows: [NOTITIE] } });
    if (!ctx.schema.datadomeinen.notities) return;
    const terug = g.terugverwijzingen(ctx, "organisaties", "org-1");
    expect(terug.some(t => t.slug === "notities")).toBe(true);
  });
});
