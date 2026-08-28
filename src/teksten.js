/* Juridisch geladen teksten — bewust op één plek.
 *
 * De formuleringen hieronder zijn woordelijk goedgekeurd in de juridische
 * toets van 26-08-2026 (backlogitem f25). Wijzig ze niet zonder een nieuwe
 * toets: de één-regelversie is de samenvatting, PRIVACY_UITKLAP is de
 * juridische tekst en moet in de UI zelf bereikbaar zijn op het moment dat
 * de belofte wordt gedaan — niet achter een tweede klik of op een andere
 * pagina.
 *
 * Harde voorwaarde bij deze tekst: GEEN TELEMETRIE op dit dashboard. Zodra
 * er analytics, foutrapportage of een andere meting naar ons bij komt, is
 * deze tekst onjuist en moet hij mee veranderen. Zie het hoofdstuk
 * "Geen telemetrie" in de README en test/geen-telemetrie.test.js. */

const PRIVACY_REGEL =
  "Je gegevens komen rechtstreeks uit je eigen werkruimte en blijven in je browser — wij zien ze niet.";

/* Herzien voor p10 (dashboard-login) — juristronde 3, 28-08-2026, punt B3.
 *
 * De vorige tekst opende met "Dit dashboard bewaart en verwerkt zelf geen
 * gegevens" en sloot met "Lokaal in je browser worden ALLEEN het moment van
 * laatst laden en je minuten-per-actie-instelling bewaard". Allebei worden ze
 * onwaar zodra er ingelogd kan worden: er staan dan ook inlogtokens in de
 * browser. Dat ze in sessionStorage staan en bij het sluiten van het tabblad
 * verdwijnen maakt ze korter houdbaar, niet onbestaand — en "alleen" is een
 * uitputtende claim.
 *
 * Wat wél overeind blijft en daarom het hart van de tekst is: bedrijfsdata gaat
 * browser ↔ eigen werkruimte en komt niet langs onze servers. Bij het inloggen
 * gaat er één call naar agentic-team.ai, en daar zit geen bedrijfsdata in — in
 * geen van beide richtingen. Zie test/geen-telemetrie.test.js, dat die grens
 * op de gebouwde bundel afdwingt. */
/* Vier alinea's in plaats van één blok van tien zinnen: art. 12 lid 1 AVG vraagt
 * een beknopte en begrijpelijke vorm, en dit kost niets (advies jurist, B3-toets
 * 28-08). PRIVACY_UITKLAP blijft de volledige tekst als één string — dat is de
 * versie die getoetst is en waarop de regressiecontrole staat. */
const PRIVACY_UITKLAP_ALINEAS = [
  "Je bedrijfsgegevens komen rechtstreeks uit je eigen werkruimte en gaan niet langs onze servers. Alles wat je hier ziet, haalt je browser op bij jouw eigen werkruimte-instantie.",
  "De pagina zelf wordt wel van dashboard.agentic-team.ai geladen, met de gebruikelijke technische gegevens die daarbij horen (zoals je IP-adres).",
  /* De slotzin van deze alinea is de correctie uit de B3-toets. De vorige versie
   * zei alleen dat er geen bedrijfsdata meegaat — waar, maar een lezer kon
   * daaruit opmaken dat inloggen spoorloos is. Dat is het niet: de inlogwissel
   * is een verzoek aan onze server, en die legt vast wélke licentie inlogt en
   * wanneer (registreerSeat in app/api/oauth/authorize/route.ts). Het
   * privacyblok op de site vertelt dat ook; zonder deze zin zouden twee eigen
   * teksten elkaar tegenspreken. */
  "Er zijn twee manieren om binnen te komen. Het daglink-token staat achter het #-teken en wordt daarom nooit naar een server verstuurd; hij is alleen-lezen en verloopt na 24 uur. Log je in met je licentie, dan wisselt je browser eenmalig een inlogcode om bij agentic-team.ai voor een inlogtoken. Daar gaat geen bedrijfsdata bij mee, in geen van beide richtingen — wel zien wij daarbij dat er met jouw licentie is ingelogd, en wanneer.",
  "In je browser bewaren we je inlogtoken en de daglink voor de duur van dit tabblad — sluit je het tabblad, dan zijn ze weg — en blijvend alleen het moment van laatst laden en je minuten-per-actie-instelling.",
];

const PRIVACY_UITKLAP = PRIVACY_UITKLAP_ALINEAS.join(" ");

/* Dezelfde belofte, in de lege staat (nog geen daglink geladen). Bewust
 * dezelfde strekking en dezelfde grens als hierboven — twee varianten van
 * één belofte is op zichzelf al een risico. */
const PRIVACY_LEGE_STAAT =
  "Je gegevens komen straks rechtstreeks uit je eigen werkruimte en blijven in je browser — wij zien ze niet.";

/* Feed-specifieke variant (f22-tab). Idem: geen absolute claim over al het
 * verkeer, wel de grens die wél klopt — bedrijfsdata gaat browser ↔ eigen
 * werkruimte. */
const PRIVACY_FEED =
  "Deze feed leest rechtstreeks uit je eigen werkruimte via de daglink; die berichten komen niet langs onze servers.";

if (typeof module !== "undefined") {
  module.exports = { PRIVACY_REGEL, PRIVACY_UITKLAP, PRIVACY_UITKLAP_ALINEAS, PRIVACY_LEGE_STAAT, PRIVACY_FEED };
}
