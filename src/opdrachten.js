/* f61 — Doorgeven aan je team, als je acties in je eigen systeem staan.
 *
 * Een klant met acties buiten de werkruimte (bronkoppeling 'acties': notion,
 * crm, …) kan een actie hier niet direct afhandelen: het dashboard praat
 * alleen met de eigen werkruimte. Een klik schrijft daarom een opdrachtrij in
 * het domein `dashboard_opdrachten` (opslag=werkruimte, rechtengroep open);
 * het volgende werkmoment voert hem uit in het eigen systeem en zet de rij op
 * Uitgevoerd of Mislukt.
 *
 * Het domein komt bewust niet in schema.datadomeinen (extract-schema.py zet
 * opslag=werkruimte-domeinen alleen als naam in werkruimteDomeinen). De
 * veldnamen en keuzes staan dus hier, één keer, en
 * test/f61-opdrachten.test.js houdt ze gelijk aan het f61-contract
 * (core/agents.json in agent-architecture).
 *
 * Schrijven loopt via de eigen route van de instantie:
 *   POST /dashboard/opdrachten               {handeling, actie, extern_id?, bron_link?, tekst?, specialist?, datum?}
 *   POST /dashboard/opdrachten/<id>/intrekken
 * De server zet Status, "Gegeven door" (uit je login) en "Bronsysteem" zelf;
 * die stuurt het dashboard dus nooit mee. */

const OPDRACHT_HANDELINGEN = ["Goedkeuren", "Ja", "Nee", "Terugsturen", "Doorzetten", "Later", "Nieuw"];
const OPDRACHT_STATUSSEN = ["Doorgegeven", "In uitvoering", "Uitgevoerd", "Mislukt", "Ingetrokken"];
/* Zolang een opdracht hierin staat, ligt hij nog bij je team: geen tweede knop. */
const OPDRACHT_OPEN = ["Doorgegeven", "In uitvoering"];
const OPDRACHT_VELDEN = [
  { naam: "Actie", type: "titel" },
  { naam: "Handeling", type: "select", opties: OPDRACHT_HANDELINGEN },
  { naam: "Status", type: "select", opties: OPDRACHT_STATUSSEN },
  { naam: "Tekst", type: "tekst" },
  { naam: "Specialist", type: "select", opties_dynamisch: "agent_options" },
  { naam: "Datum", type: "datum" },
  { naam: "Gegeven door", type: "tekst" },
  { naam: "Bronsysteem", type: "tekst" },
  { naam: "Extern ID", type: "tekst" },
  { naam: "Bron (link)", type: "url" },
  { naam: "Uitkomst", type: "tekst" },
  { naam: "Uitgevoerd op", type: "datum" },
];
const OPDRACHT_ACTIE_MAX = 200;
const OPDRACHT_TEKST_MAX = 4000;

/* De sleutel van een item in het eigen systeem. Voor een pagina uit een
 * notitiesysteem het id van 32 tekens aan het eind van het pad (ook in de vorm
 * met streepjes); anders de url zelf. Geen url: geen sleutel, en dan ook geen
 * knoppen — zonder sleutel kan je team het item niet terugvinden. */
function externIdVanUrl(url) {
  const u = String(url || "").trim();
  if (!/^https:\/\//i.test(u)) return null;
  let pad = u;
  try { pad = new URL(u).pathname; } catch (e) { return u; }
  const laatste = pad.split("/").filter(Boolean).pop() || "";
  const kaal = laatste.replace(/-/g, "");
  const m = /([0-9a-f]{32})$/i.exec(kaal);
  // Alleen als het id echt aan het eind staat (titel-<id> of het id met streepjes).
  if (m && (/[0-9a-f]{32}$/i.test(laatste) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(laatste))) return m[1].toLowerCase();
  return u;
}

function opdrachtVeld(entry, naam) {
  const d = entry && entry.data;
  const v = d ? d[naam] : undefined;
  return v === undefined || v === null ? "" : String(v).trim();
}

/* De opdrachten zoals de instantie ze gaf, nieuwste eerst. */
function opdrachtenLijst(bundle) {
  const o = bundle && bundle.opdrachten;
  const l = o && Array.isArray(o.entries) ? o.entries.filter(e => e && e.entryId && e.data && typeof e.data === "object") : [];
  return l.slice().sort((a, b) => String(b.aangemaakt || "").localeCompare(String(a.aangemaakt || "")));
}

/* Hoort deze opdracht bij dit item uit je dagstart? Op Extern ID of op de link. */
function opdrachtHoortBij(entry, url) {
  if (!url) return false;
  const id = externIdVanUrl(url);
  const eid = opdrachtVeld(entry, "Extern ID");
  const link = opdrachtVeld(entry, "Bron (link)");
  return (!!eid && !!id && eid.toLowerCase() === id.toLowerCase()) || (!!link && link === String(url).trim());
}

/* De laatste opdracht bij dit item; een ingetrokken opdracht telt niet. */
function opdrachtVoorItem(bundle, url) {
  return opdrachtenLijst(bundle).find(e => opdrachtVeld(e, "Status") !== "Ingetrokken" && opdrachtHoortBij(e, url)) || null;
}

function opdrachtIsOpen(entry) { return !!entry && OPDRACHT_OPEN.indexOf(opdrachtVeld(entry, "Status")) !== -1; }

/* Wat de kaart over de opdracht zegt. k is de stijl van de pil. */
function opdrachtStatus(entry) {
  const st = opdrachtVeld(entry, "Status");
  if (st === "Doorgegeven") return { k: "team", kort: "Doorgegeven", tekst: "Doorgegeven — wordt bij het volgende werkmoment verwerkt" };
  if (st === "In uitvoering") return { k: "team", kort: "Wordt verwerkt", tekst: "Wordt verwerkt" };
  if (st === "Uitgevoerd") return { k: "ok", kort: "Gedaan", tekst: "Gedaan" };
  if (st === "Mislukt") {
    const u = opdrachtVeld(entry, "Uitkomst");
    return { k: "laat", kort: "Niet gelukt", tekst: "Niet gelukt" + (u ? ": " + u : "") };
  }
  if (st === "Ingetrokken") return { k: "", kort: "Ingetrokken", tekst: "Ingetrokken" };
  return { k: "", kort: st || "—", tekst: st || "—" };
}

/* Wat je doorgaf, in de woorden van de knop. */
const OPDRACHT_WAT = { Goedkeuren: "Goedgekeurd", Ja: "Ja, doe maar", Nee: "Niet doen", Terugsturen: "Teruggestuurd", Doorzetten: "Aan je team gegeven", Later: "Later", Nieuw: "Nieuwe opdracht" };

/* Dezelfde regels als de instantie (POST /dashboard/opdrachten). Hier alleen
 * om je een weigering te besparen; de instantie beslist. Geeft een zin of null. */
function controleerOpdracht(b) {
  if (!b || OPDRACHT_HANDELINGEN.indexOf(b.handeling) === -1) return "Deze handeling kent je team niet.";
  if (!String(b.actie || "").trim()) return "Er staat geen titel bij.";
  if (String(b.actie).length > OPDRACHT_ACTIE_MAX) return "De titel is te lang.";
  if (b.handeling !== "Nieuw" && !b.extern_id && !b.bron_link) return "Dit item heeft geen link naar je eigen systeem; je team kan het dan niet terugvinden.";
  if (b.bron_link && !/^https:\/\//i.test(b.bron_link)) return "De link naar je eigen systeem is niet veilig (geen https).";
  if ((b.handeling === "Terugsturen" || b.handeling === "Nieuw") && !String(b.tekst || "").trim()) return b.handeling === "Nieuw" ? "Schrijf eerst wat er moet gebeuren." : "Schrijf in één zin wat anders moet.";
  if (b.tekst && String(b.tekst).length > OPDRACHT_TEKST_MAX) return "Je tekst is te lang (hooguit " + OPDRACHT_TEKST_MAX + " tekens).";
  if (b.handeling === "Later" && !b.datum) return "Kies eerst een datum.";
  if (b.handeling === "Doorzetten" && !b.specialist) return "Kies eerst wie het oppakt.";
  return null;
}

/* De body voor een item uit je dagstart. Alleen wat de handeling nodig heeft. */
function opdrachtBody(handeling, item, { tekst, specialist, datum } = {}) {
  const url = item && item.url ? String(item.url).trim() : "";
  const id = externIdVanUrl(url);
  const b = { handeling, actie: String((item && item.titel) || "").trim().slice(0, OPDRACHT_ACTIE_MAX) };
  if (id) b.extern_id = id;
  if (url) b.bron_link = url;
  const t = String(tekst || "").trim();
  if (t) b.tekst = t.slice(0, OPDRACHT_TEKST_MAX);
  if (specialist) b.specialist = specialist;
  if (datum) b.datum = datum;
  return b;
}

/* Een weigering van de instantie in gewone taal. De instantie antwoordt met
 * { fout: <code>, melding: <zin> }. Een paar codes vertalen we zelf (ze vragen
 * een eigen uitleg of een andere stap); bij de rest tonen we de melding van de
 * instantie, behalve als daar een merknaam in staat (die laten we nooit in
 * beeld). Oudere routes sturen een zin in `fout`: die tonen we zoals hij is. */
const MERKNAAM = /notion|claude|anthropic/i;
function opdrachtFoutTekst(e) {
  const body = (e && e.body) || {};
  const code = typeof body.fout === "string" ? body.fout : "";
  const melding = typeof body.melding === "string" && body.melding.trim() && !MERKNAAM.test(body.melding) ? body.melding.trim() : "";
  const isCode = /^[a-z_]+$/.test(code);
  if (code === "al_doorgegeven") return "Dit is al doorgegeven. Je team verwerkt het bij het volgende werkmoment.";
  if (code === "niet_meer_in_te_trekken") return "Je team is er al mee bezig, dus intrekken kan niet meer.";
  if (code === "niet_gevonden") return "Deze opdracht bestaat niet meer. Ververs het dashboard voor de actuele stand.";
  if (code === "acties_in_werkruimte") return "Je acties staan in je werkruimte. Ververs het dashboard en handel het hier direct af.";
  if (code === "domein_onbekend") return "Je werkruimte kent doorgeven nog niet. Probeer het later opnieuw.";
  if (code === "geen_persoon") return "Doorgeven kan alleen als je bent ingelogd met je eigen account. Log opnieuw in en probeer het dan.";
  if (code === "alleen_lezen") return "Je mag dit niet doorgeven met je rol in deze werkruimte. Vraag de eigenaar van je werkruimte om meer rechten.";
  if (e && (e.oauthVerlopen || e.daglinkVerlopen)) return e.message;
  if (melding) return melding;
  if (code && !isCode) return code;
  if (e && e.status === 403) return "Je mag dit niet doorgeven met je rol in deze werkruimte. Vraag de eigenaar van je werkruimte om meer rechten.";
  if (code === "ongeldig") return "Je werkruimte keurde de gegevens af. Opnieuw proberen helpt niet; vraag je team om hulp.";
  if (isCode) return "Je werkruimte weigerde dit. Ververs het dashboard en probeer het opnieuw.";
  return (e && e.message && !MERKNAAM.test(e.message) && e.message) || "Dat is niet gelukt.";
}

if (typeof module !== "undefined") {
  module.exports = {
    OPDRACHT_HANDELINGEN, OPDRACHT_STATUSSEN, OPDRACHT_VELDEN, externIdVanUrl, opdrachtVoorItem, opdrachtStatus,
    opdrachtBody, controleerOpdracht, opdrachtFoutTekst, opdrachtenLijst,
  };
}
