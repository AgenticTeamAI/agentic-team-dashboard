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

const PRIVACY_UITKLAP =
  "Dit dashboard bewaart en verwerkt zelf geen gegevens. Alles wat je hier ziet, haalt je browser rechtstreeks op bij jouw eigen werkruimte-instantie met de daglink; jouw bedrijfsdata komt niet langs onze servers. De pagina zelf wordt wel van dashboard.agentic-team.ai geladen, met de gebruikelijke technische gegevens die daarbij horen (zoals je IP-adres). Het daglink-token staat achter het #-teken en wordt daarom nooit naar een server verstuurd; hij is alleen-lezen en verloopt na 24 uur. Lokaal in je browser worden alleen het moment van laatst laden en je minuten-per-actie-instelling bewaard.";

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
  module.exports = { PRIVACY_REGEL, PRIVACY_UITKLAP, PRIVACY_LEGE_STAAT, PRIVACY_FEED };
}
