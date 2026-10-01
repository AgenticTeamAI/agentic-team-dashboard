/* Dashboard v2 — afgeleide logica voor de schermen.
 *
 * Eén definitie (aanJouZet in voor-jou.js) voedt lijst, badge, teller, baan
 * Jij en de klaar-check. Deze laag rekent met de schermvorm (zie v2-basis.js)
 * en vraagt elk oordeel door aan de geteste productiefuncties. */

function actie(id) { return S.data && S.data.perId ? S.data.perId.get(id) : null; }
function ik() { return jij() || undefined; }
/* Per tekenbeurt onthouden: honderden rijen maal tientallen aanroepen. */
let RC = new Map();
function nieuweTekenbeurt() { RC = new Map(); }
function onthoud(soort, a, fn) { const k = soort + "|" + a.id; if (!RC.has(k)) RC.set(k, fn()); return RC.get(k); }
function hoortBijMens(a) { return onthoud("mens", a, () => P.hoortBijMens(a.rij, namen(), NU)); }
function vanMij(a) { return onthoud("mij", a, () => P.vanMij(a.rij, ik(), namen())); }
function isTeLaat(a) { return P.isTeLaat(a.rij, namen(), NU); }
function sindsVan(a) { return P.sindsVan(a.rij) || dt(a.aangemaakt) || NU; }
function viaIds(rijen) { return (rijen || []).map(r => actie(r.__entryId)).filter(Boolean); }
function aanJouZet() { return CTX && rows(CTX.bundle, "acties") ? viaIds(P.aanJouZet(CTX.bundle, CTX.schema, { ik: ik(), nu: NU })) : []; }
function bijCollegas() { return viaIds(P.bijCollegas(CTX.bundle, CTX.schema, { ik: ik(), nu: NU })); }
function bijTeam() { return viaIds(P.bijTeam(CTX.bundle, CTX.schema, { ik: ik(), nu: NU })); }
function kloptNiet() { return viaIds(P.kloptNiet(CTX.bundle, CTX.schema, { ik: ik(), nu: NU })); }
function maandag() { return plusDagen(dagStart(NU), -((NU.getDay() + 6) % 7)); }
function afgerondDezeWeek(lijst) {
  const ma = maandag();
  // Zonder enige datum blijft hij zichtbaar: liever in Afgerond dan nergens.
  return (lijst || S.data.acties).filter(a => a.status === "Klaar" && (!afgerondMoment(a) || afgerondMoment(a) >= ma))
    .sort((a, b) => (afgerondMoment(b) || 0) - (afgerondMoment(a) || 0));
}

/* Nummers blijven staan tot Ververs, zodat "nummer 3" in Claude en hier
 * hetzelfde item is. Een nieuw geladen werkruimte telt opnieuw. */
function nummer(a) { if (!S.nummers[a.id]) S.nummers[a.id] = S.volgNr++; return S.nummers[a.id]; }
function telNummersOpnieuw() { S.nummers = {}; S.volgNr = 1; aanJouZet().forEach(nummer); }
function voorJouLijst() { const l = aanJouZet(); l.forEach(nummer); return l.sort((a, b) => S.nummers[a.id] - S.nummers[b.id]); }

/* soortVan uit voor-jou.js, met één verfijning voor het scherm: werk dat naar
 * buiten gaat (een mail, een post) krijgt "ik verstuur hem zelf" op de knop. */
function soortVan(a) {
  return onthoud("soort", a, () => { const s = P.soortVan(a.rij, namen(), NU); return s === "check" && a.kanaal ? "check-extern" : s; });
}
const SOORT_LABEL = {
  check: "Klaar om te checken", "check-extern": "Klaar om te checken", voorstel: "Voorstel", signaal: "Signaal",
  taak: "Taak voor jou", weer: "Weer aan de beurt", team: "Bij je team", wacht: "Wacht", klaar: "Afgerond",
  "klopt-niet": "Klopt niet helemaal",
};
function beurt(a) {
  const s = soortVan(a);
  if (s === "team") return { k: "team", t: "◐ je team is aan zet" };
  if (s === "wacht") return { k: "niemand", t: "○ wacht" };
  if (s === "klaar") return { k: "niemand", t: "✓ afgerond" };
  if (s === "klopt-niet") return { k: "niemand", t: "? niemand aan zet" };
  return { k: "jij", t: "● jij bent aan zet" };
}
function vormVan(s) { return s === "team" ? "◐" : s === "wacht" ? "○" : s === "klaar" ? "✓" : s === "klopt-niet" ? "?" : "●"; }

/* ── Het verhaal bovenaan (vaste zinnen op data, geen taalmodel) ────────
 * Zonder "vorig bezoek": dat zou de sleutel laatst-gebruikt een nieuw doel
 * geven (juridisch restpunt). 's Ochtends is het de nacht, daarna de dag. */
function verhaalData() {
  const ochtend = NU.getHours() < 12;
  const van = ochtend ? new Date(NU.getFullYear(), NU.getMonth(), NU.getDate() - 1, 18, 0) : dagStart(NU);
  const titel = ochtend ? "Terwijl je sliep" : "Vandaag";
  const A = S.data.acties;
  const na = (v) => { const d = dt(v); return !!d && d > van; };
  const zelf = A.filter(a => a.status === "Klaar" && isAgentSlug(a.afgerondDoor) && afgerondMoment(a) && afgerondMoment(a) > van);
  const klaarAlle = A.filter(a => isAgentSlug(a.door) && na(a.aangemaakt) && (hoortBijMens(a) || (a.status === "Klaar" && !isAgentSlug(a.afgerondDoor))));
  const klaar = klaarAlle.filter(vanMij); const klaarAnder = klaarAlle.filter(a => !vanMij(a));
  const begon = A.filter(a => a.status === "Bezig" && isAgentNaam(a.eigenaar) && na(a.bezigSinds));
  // 's Ochtends telt alleen wat een werkmoment deed (de start en het slot van
  // een ronde, en wat er 's nachts verscheen) — niet je eigen dagstart om 08:30.
  const feed = S.data.feed.filter(f => f.t > van && (!ochtend || f.t.getHours() < 6 || f.soort === "rondestart" || f.soort === "afgerond"));
  const agents = [...new Set([...klaar.map(werkAgent), ...zelf.map(a => a.afgerondDoor), ...begon.map(werkAgent), ...feed.map(f => f.ag)].filter(isAgentSlug))];
  return { titel, zelf, klaar, klaarAnder, begon, agents, van, feed };
}
function verhaalZin(v) {
  const delen = [];
  if (v.zelf.length) delen.push("rondde je team <b>" + telwoord(v.zelf.length, "ding", "dingen") + "</b> zelf af");
  if (v.klaar.length) delen.push((delen.length ? "zette er " : "zette je team ") + "<b>" + v.klaar.length + "</b> voor je klaar");
  if (v.klaarAnder.length) delen.push((v.klaar.length ? "en " : (delen.length ? "zette er " : "zette je team ")) + "<b>" + v.klaarAnder.length + "</b> " + (v.klaar.length ? "" : "klaar ") + "voor je collega’s");
  if (v.begon.length) delen.push((delen.length ? "begon aan " : "begon je team aan ") + "<b>" + v.begon.length + "</b>");
  if (!delen.length) return null;
  return v.titel + " " + lijstZin(delen) + ".";
}
function verhaalDetail(v) {
  const frag = v.klaar.concat(v.zelf).slice(0, 2).map((a, i) => {
    const ag = werkAgent(a) || a.afgerondDoor;
    const wat = a.status === "Klaar" && isAgentSlug(a.afgerondDoor) ? "rondde ‘" + a.titel + "’ af" : "zette ‘" + a.titel + "’ klaar";
    return "<b>" + esc(deNaam(ag, i === 0)) + "</b> " + esc(wat);
  });
  return frag.length ? frag.join("; ") + "." : "";
}

/* ── Werkmoment en klaar-check ──────────────────────────────────────── */
function laatsteWerkmoment() { const s = P.werkmomentSporen(CTX); return s.length ? new Date(Math.max(...s)) : null; }
/* Een spoor zonder tijd (alleen een datum) komt binnen als middernacht; noem
 * dan de dag, geen verzonnen "00:00". */
function wanneerSpoor(d) {
  if (!d) return "";
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) return zelfdeDag(d, NU) ? "vandaag" : zelfdeDag(d, plusDagen(NU, -1)) ? "gisteren" : datumKort(d);
  return wanneer(d);
}
function bijHetVolgende() { const l = laatsteWerkmoment(); return "bij het volgende werkmoment" + (l ? " (laatst " + wanneerSpoor(l) + ")" : ""); }
const KC_LABEL = { start: "Zo regel je het in 2 minuten", vaker: "Laat je team vaker werken", ronde: "Loop ze één voor één door", login: "Inloggen" };
let kcCache = null;
function klaarCheck() {
  if (kcCache && kcCache.ctx === CTX && kcCache.n === S.data) return kcCache.kc;
  const kc = P.klaarCheck(CTX);
  kc.regels = kc.regels.map(r => Object.assign({}, r, { actie: r.actie ? [KC_LABEL[r.actie] || "Bekijk", r.actie] : null }));
  if (!kc.notion && kanSchrijven()) kc.regels.push({ id: "afhandelen", k: "ok", telt: false, titel: "Je kunt afhandelen", tekst: jij() ? "Ingelogd als " + voornaam(jij()) + "." : "Je bent ingelogd." });
  if (!kc.notion && ingelogd() && !kanSchrijven()) kc.regels = kc.regels.map(r => r.id === "afhandelen" ? Object.assign({}, r, { titel: "Je sessie mag alleen lezen", tekst: "Log opnieuw in om af te handelen." }) : r);
  kc.recent = laatsteWerkmoment();
  // Notion: een lege ronde meldt niets in de feed, dus hooguit "let op" (vaste-taken.js).
  kc.stilNotion = kc.notion && kc.regels.some(x => x.id === "werkt" && x.k === "let");
  kcCache = { ctx: CTX, n: S.data, kc };
  return kc;
}
function checkSamenvatting(kc) {
  if (kc.notion && !kc.totaal) return { kop: "Is je team klaar? Dat zien we hier niet", sub: "Je vaste taken en acties staan in " + naamElders("acties") + "." };
  const s = klaarSamenvatting(kc);
  if (!kc.notion && kc.totaal === kc.ok && kc.recent && !kc.wachten) s.sub = "Je team werkt vanzelf. Laatst: " + wanneerSpoor(kc.recent) + ".";
  return s;
}

/* ── Vaste taken ────────────────────────────────────────────────────── */
function taakStatus(t) { return P.taakStatus(t.rij, NU); }
function weekTelling() {
  const w = P.weekTelling(S.data.taken.map(t => t.rij), NU);
  const perId = new Map(S.data.taken.map(t => [t.rij, t]));
  w.dagen = w.dagen.map(d => ({ d: d.kort, nr: d.nr, lang: d.lang, taken: d.taken.map(r => perId.get(r)).filter(Boolean) }));
  w.drukste = w.dagen.filter(d => w.max >= 2 && d.taken.length === w.max);
  w.vaak = w.vaak.map(r => perId.get(r)).filter(Boolean);
  return w;
}
const RITME_VOLGORDE = ["elk-uur", "elke-2-uur", "elke-4-uur", "dagelijks", "wekelijks-ma", "wekelijks-di", "wekelijks-wo", "wekelijks-do", "wekelijks-vr", "maandelijks"];
function ritmes() { return ritmeKeuzes(CTX.schema).sort((a, b) => RITME_VOLGORDE.indexOf(a.waarde) - RITME_VOLGORDE.indexOf(b.waarde)); }
