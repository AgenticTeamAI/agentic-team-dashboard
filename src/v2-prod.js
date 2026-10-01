/* Dashboard v2 — de bedieningslaag (src/v2-begin.js t/m src/v2-eind.js) leeft
 * in één afgeschermde scope, zodat haar namen (soortVan, renderHulp, …) niet
 * botsen met de geteste logica eromheen. Waar ze een productiefunctie nodig
 * heeft die ze zelf ook zo noemt, haalt ze die hier op, vóór de scope begint.
 * Alles wat een knop schrijft of een lijst bepaalt, blijft zo in voor-jou.js,
 * vaste-taken.js en data-bewerken.js — daar is het getest. */
const V2_PROD = Object.freeze({
  soortVan, hoortBijMens, vanMij, isTeLaat, sindsVan, aanJouZet, bijCollegas, bijTeam, kloptNiet,
  datumKeuzes, klaarCheck, taakStatus, weekTelling, werkmomentSporen, werkdagenNa, naamGelijk, isAgentNaam,
});
