/* s64 nafix — de Hulp (v2 en het oude hulp.js) met vier soorten bron: een
 * daglink van 24 uur, een daglink zonder `iat` (van vóór b32), een
 * Business-daglink van 4 uur en een inlogsessie; voor het oude hulp.js ook
 * de lege staat (ctx null). Hetzelfde scenario dient voor de opname van main
 * (test/fixtures/s64-hulp-main.json) en voor de test die ermee vergelijkt
 * (test/s64-hulp-daglink.test.js). Gebruikt alleen wat main al had. */

export const NU = new Date(2026, 10, 26, 9, 30);
const IAT = Math.floor(new Date(2026, 10, 26, 7, 0).getTime() / 1000);

const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const daglink = (extra) => `${b64({ scope: "lees", licentie: "at_test", jti: "x", ...extra })}.handtekening`;

export const BRONNEN = {
  daglink24: { token: daglink({ iat: IAT, exp: IAT + 86400 }), instantieUrl: "https://connector.example" },
  daglinkZonderIat: { token: daglink({ exp: IAT + 86400 }), instantieUrl: "https://connector.example" },
  daglink4: { token: daglink({ iat: IAT, exp: IAT + 4 * 3600, seat: "s1", groepen: ["werkgeheugen"] }), instantieUrl: "https://connector.example" },
  oauth: { oauth: true, token: `kop.${b64({ scope: "dashboard:lees dashboard:schrijf", sub: "at_test#seat1", iat: IAT, exp: IAT + 3600 })}.handtekening`, instantieUrl: "https://connector.example" },
};

export function maakCtx(g, bron) {
  const domains = { acties: { rows: [] } };
  return {
    schema: g.AGENTIC_TEAM_SCHEMA, today: NU, periodWeeks: 12, minutenPerActie: 25, bron,
    kanSchrijven: !!bron.oauth, herlaad: () => {}, werkBij: () => true, bundelWaarschuwingen: [],
    bundle: { kind: "rows", source: "werkruimte", klant: "Verbeek Advies", systeemPerDomein: {}, domains, instantieDomeinen: Object.keys(domains) },
  };
}

/* v2: de hele Hulp (#/hulp), html van #root. */
export function renderV2(g, ctx) {
  document.body.innerHTML = '<div id="root"></div><div id="melding" hidden></div><div id="live"></div>';
  window.location.hash = "#/hulp";
  g.V2._reset();
  g.V2.start({});
  g.V2.toon(ctx);
  return document.getElementById("root").innerHTML;
}

/* Het oude hulp.js: de twee secties die over de daglink gaan. */
export function renderV1(g, ctx) {
  const secties = Object.fromEntries(g.hulpSecties(ctx).map(([id, , html]) => [id, html()]));
  return { daglink: secties.daglink, woorden: secties.woorden };
}

export function alles(g) {
  const v2 = {}, v1 = {};
  for (const [naam, bron] of Object.entries(BRONNEN)) {
    v2[naam] = renderV2(g, maakCtx(g, bron));
    v1[naam] = renderV1(g, maakCtx(g, bron));
  }
  v1.leeg = renderV1(g, null);
  return { v2, v1 };
}
