/* Eén instelling, één reden.
 *
 * De meeste suites hier bouwen per test een volledige jsdom-pagina uit het
 * gebouwde dashboard.html — inmiddels ruim 400 kB die telkens opnieuw geparsed
 * en uitgevoerd wordt. Op een rustige machine duurt dat een seconde of twee, op
 * een volle CI-runner of bij parallelle suites zit je tegen de standaardtimeout
 * van 5 seconden aan. Dat leverde rode runs op die bij herhaling gewoon groen
 * werden — en een test die soms faalt zonder dat er iets stuk is, leert iedereen
 * om rood te negeren. Dat is duurder dan de trage test zelf.
 *
 * 20 seconden is ruim boven de ~7 s die de zwaarste test in de praktijk haalt,
 * en nog steeds kort genoeg om een échte hangende test af te kappen. Geen enkele
 * assertie verandert hierdoor.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
