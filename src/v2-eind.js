/* ── Dashboard v2: wat app.js (en de tests) van de schermlaag zien ── */
function v2Start(haken) {
  Object.assign(V2_HAKEN, haken || {});
  bedraad();
  S.route = routeUitHash(typeof window !== "undefined" ? window.location.hash : "");
}
function v2Toon(ctx) {
  CTX = ctx; NU = (ctx && ctx.today) || new Date();
  S.leeg = null; S.versieFout = null;
  if (S.opdrachtVoor && kanSchrijven()) { const o = S.opdrachtVoor; S.opdrachtVoor = null; startOpdrachtSheet({ ag: o.ag && isAgentSlug(o.ag) ? o.ag : null }); }
  render();
}
function v2Leeg(o) { CTX = null; S.data = null; S.dataCtx = null; S.leeg = o || null; S.versieFout = null; S.route = routeUitHash(window.location.hash); render(); }
function v2VersieFout(o) { CTX = null; S.data = null; S.dataCtx = null; S.versieFout = o || {}; render(); }
function v2HashGewijzigd() {
  const r = routeUitHash(window.location.hash);
  if (r !== S.route) {
    S.route = r; S.sheet = null; S.ui.bewerk = null;
    if (!itemRoute()) S.terugNaar = null;
    if (S.opdrachtVoor && kanSchrijven()) { const o = S.opdrachtVoor; S.opdrachtVoor = null; startOpdrachtSheet({ ag: o.ag && isAgentSlug(o.ag) ? o.ag : null }); }
  }
  render();
}
function v2Reset() {
  CTX = null; S.route = "/"; S.hist = []; S.data = null; S.dataCtx = null; S.nummers = {}; S.volgNr = 1; S.nummerBundel = null;
  S.sessie = { afgehandeld: [] }; S.sheet = null; S.toast = null; S.ronde = null; S.terugNaar = null; S.leeg = null; S.versieFout = null;
  S.ui.acties = { weergave: "lijst", van: "mij", toon: "open", zoek: "", baan: "jij" }; S.ui.team.filter = null; S.ui.gegevens = { zoek: "", filter: "" };
  S.ui.bewerk = null; S.ui.dismissed = {}; S.ui.meerOpen = {}; S.ui.det = {}; S.ui.hulp = { zoek: "", open: {}, vb: "stil", stap: -1 };
  S.scrollMap = {}; S.laatsteSleutel = null; kcCache = null;
}

globalThis.V2 = {
  start: v2Start, toon: v2Toon, leeg: v2Leeg, versieFout: v2VersieFout, hashGewijzigd: v2HashGewijzigd, render,
  // Voor de tests: de toestand en een paar afgeleide lijsten, alleen-lezen bedoeld.
  _S: S, _reset: v2Reset, _aanJouZet: () => aanJouZet(), _banen: () => banen(), _routeUitHash: routeUitHash,
};
})();
