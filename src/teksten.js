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

/* Juristrapport 25-11-2026 (rapport-jurist-dashboardgebruik-2026-11-25.md,
 * addendum punt C): sinds b32 fase 2 (24-08) loopt al het dashboardverkeer door
 * de connector-router (connector.agentic-team.ai, wr-router, dezelfde EU-omgeving
 * als de instanties). "Gaat niet langs onze servers" en "wordt nooit naar een
 * server verstuurd" waren daardoor onjuist. Woordelijk de teksten uit het
 * addendum; voor de daglink de voorkeursvariant met de sleutelzin. */
/* Juristrapport 25-11-2026, punten A en B (variant A+B), met de correctie uit
 * het addendum: een token vernieuwt pas bij het eerste verzoek na een uur, niet
 * "af en toe". Vervangt ook "eenmalig", dat sinds b43 (stille vernieuwing) al
 * niet meer klopte. Deze tekst moet live staan vóór DASHBOARD_TELLER=aan op de
 * site (art. 13 lid 3 AVG). */
const PRIVACY_REGEL =
  "Je gegevens komen uit je eigen werkruimte en blijven in je browser. Wij bewaren ze niet en gebruiken ze niet.";

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
  "Je bedrijfsgegevens komen uit je eigen werkruimte en komen niet terecht op onze centrale servers, waar je licentie en onze website staan. Alles wat je hier ziet, haalt je browser op bij jouw eigen werkruimte-instantie. Onderweg gaat het verkeer door een doorgeefluik van ons in dezelfde EU-omgeving als je werkruimte, dat je gegevens niet bewaart en alleen de methode, de status en de duur van een verzoek registreert.",
  /* i87 (oordeel jurist 1-10-2026, Juridisch Loket "Dashboard v2 —
   * metricsbestand"): met f54 staan bij klanten met een eigen bron niet meer
   * alleen tellingen in de werkruimte, maar ook de openstaande items. Gedekt
   * onder "dashboardgegevens" in de DPA, maar de verwachting bij "werkdata
   * naar keuze van de klant" vraagt dat we het zeggen. Woordelijk het voorstel
   * van de jurist, inclusief het back-upvenster: niet "direct weg". */
  "Staan je acties en vaste taken in je eigen bron, zoals Notion, dan zet je Coördinator bij elke dagstart de openstaande items in je werkruimte: de titel (ingekort tot 120 tekens), de soort, de specialist, de data en een link naar de pagina in je bron. Bij vaste taken: de naam, het ritme en wanneer hij laatst draaide. Zo kan het dashboard ze tonen. De vorige versie wordt bij elke dagstart overschreven en verdwijnt daarna met het back-upvenster van zeven dagen.",
  "De pagina zelf wordt wel van dashboard.agentic-team.ai geladen, met de gebruikelijke technische gegevens die daarbij horen (zoals je IP-adres).",
  /* De slotzin van deze alinea is de correctie uit de B3-toets. De vorige versie
   * zei alleen dat er geen bedrijfsdata meegaat — waar, maar een lezer kon
   * daaruit opmaken dat inloggen spoorloos is. Dat is het niet: de inlogwissel
   * is een verzoek aan onze server, en die legt vast wélke licentie inlogt en
   * wanneer (registreerSeat in app/api/oauth/authorize/route.ts). Het
   * privacyblok op de site vertelt dat ook; zonder deze zin zouden twee eigen
   * teksten elkaar tegenspreken. */
  "Er zijn twee manieren om binnen te komen. Het daglink-token staat achter het #-teken en gaat daarom niet mee naar de server die deze pagina levert. Je browser stuurt hem daarna wel als sleutel mee met elk verzoek via ons doorgeefluik, dat hem alleen gebruikt om je werkruimte te vinden. Hij is alleen-lezen en verloopt na 24 uur. Log je in met je licentie, dan wisselt je browser een inlogcode om bij agentic-team.ai voor een inlogtoken. Is je inlogtoken na een uur verlopen, dan vernieuwt je browser het bij je eerstvolgende verzoek op dezelfde manier. Daar gaat geen bedrijfsdata bij mee, in geen van beide richtingen. Wel zien wij daarbij dat er met jouw licentie is ingelogd of vernieuwd, en wanneer. Wij tellen per licentie per dag hoe vaak dat gebeurt, en bewaren die telling 90 dagen. We gebruiken dat voor het beheer van de plekken op je licentie en om te zien hoe vaak het dashboard wordt gebruikt. Dat bekijken we per licentie en niet per persoon.",
  /* f33: "blijvend alleen X en Y" is een uitputtende opsomming, en er kwam een
   * derde item bij: de naam waaronder je werkt (voor "Aan mij" en "Afgerond
   * door").
   *
   * i77 verplaatste die naam van deze browser naar de licentie: hij hoort bij
   * je seat en staat versleuteld naast je e-mailadres in de uitnodigingenlijst,
   * zodat een tweede apparaat hem kent en de beheerder hem kan rechtzetten. De
   * browser houdt nog een kopie als terugval. Dat zijn twee bewaarplekken in
   * plaats van één, en een opsomming die dat niet noemt is niet uitputtend meer
   * — vandaar dat deze alinea beide noemt, plus dat de browser er één keer per
   * sessie om vraagt.
   *
   * Dashboard v2 (1-10-2026, besluit Tijmen; ter toetsing bij de jurist, zie
   * brief-jurist-dashboard-v2-delta.md): de themakeuze komt erbij, alleen als
   * die afwijkt van je systeeminstelling. Puur een weergavevoorkeur, blijft in
   * de browser. */
  "In je browser bewaren we je inlogtoken, de daglink en je gekozen filter voor de duur van dit tabblad — sluit je het tabblad, dan zijn ze weg. Blijvend bewaren we het moment van laatst laden, je minuten-per-actie-instelling, je keuze voor een licht of donker thema als die afwijkt van je systeeminstelling, en een kopie van de naam waaronder je werkt. Tijdens het inloggen bewaren we kort een technische controlecode; breek je het inloggen af, dan kan die blijven staan tot je opnieuw inlogt of je browsergegevens wist. Die naam bewaren we ook bij je licentie op agentic-team.ai, versleuteld naast het e-mailadres waarmee je inlogt: zo hoef je hem niet op elk apparaat opnieuw op te geven en kan de beheerder van je licentie hem rechtzetten. Je browser vraagt hem daarvoor hoogstens één keer per sessie op; daar gaat geen bedrijfsdata bij mee.",
  /* Dashboard v2 (1-10-2026, besluit Tijmen; ter toetsing bij de jurist, zie
   * brief-jurist-dashboard-v2-delta.md): de knop "Feedback geven". Alleen als
   * je bent ingelogd en alleen als je zelf op versturen drukt. De site zet het
   * in onze eigen administratie (Notion-database Dashboard-feedback).
   * Slotzin over de termijnen: juristoordeel 1-10-2026, punt 4; de site dwingt
   * ze af (privacy 2.12 art. 2.5 en 6, dagelijkse ronde in de vlootcron). */
  "Geef je ingelogd feedback via de knop Feedback geven, dan sturen we je tekst, het scherm waar je was, je licentie en de naam waaronder je werkt naar agentic-team.ai. Daar bewaren we het om het dashboard te verbeteren. Gegevens uit je werkruimte gaan niet mee. Met een daglink opent de knop alleen je eigen mailprogramma. We bewaren je naam en licentie hierbij 12 maanden en de feedback zelf 24 maanden. Meer in onze privacyverklaring.",
];

const PRIVACY_UITKLAP = PRIVACY_UITKLAP_ALINEAS.join(" ");

/* Dezelfde belofte, in de lege staat (nog geen daglink geladen). Bewust
 * dezelfde strekking en dezelfde grens als hierboven — twee varianten van
 * één belofte is op zichzelf al een risico. */
const PRIVACY_LEGE_STAAT =
  "Je gegevens komen straks uit je eigen werkruimte en blijven in je browser. Wij bewaren ze niet en gebruiken ze niet.";

/* Feed-specifieke variant (f22-tab). Idem: geen absolute claim over al het
 * verkeer, wel de grens die wél klopt — bedrijfsdata gaat browser ↔ eigen
 * werkruimte. */
const PRIVACY_FEED =
  "Deze feed leest uit je eigen werkruimte via de daglink. De berichten gaan niet naar onze website- of licentieserver en worden niet door ons bewaard.";

if (typeof module !== "undefined") {
  module.exports = { PRIVACY_REGEL, PRIVACY_UITKLAP, PRIVACY_UITKLAP_ALINEAS, PRIVACY_LEGE_STAAT, PRIVACY_FEED };
}
