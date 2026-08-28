#!/usr/bin/env node
// Mock werkruimte-instantie om route 4 (daglink) lokaal te testen zonder
// echte instantie. Serveert dashboard.html op /werkruimte en dezelfde twee
// alleen-lezen dashboardroutes als agentic-team-werkruimte/src/http.ts,
// gevuld met de fictieve testdata uit testdata/data/.
//
// Gebruik:
//     node scripts/mock-instantie.mjs
// en open daarna de daglink die hij print. Token-check is nep (vast
// "testtoken") — dit is een testhulpmiddel, geen referentie-implementatie.
import { createServer } from 'node:http'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const DATA_DIR = join(REPO, 'testdata', 'data')
const TOKEN = 'testtoken'
const POORT = 8791

// testdata/data/*.json -> entries per domein, in de vorm van de werkruimte
// (storage/types.ts: { domein, entryId, data, aangemaakt, bijgewerkt })
const domeinen = {}
for (const f of readdirSync(DATA_DIR)) {
  if (!f.endsWith('.json')) continue
  const naam = f.replace(/\.json$/, '').replace(/-/g, '_')
  const parsed = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8'))
  if (naam === 'bedrijfscontext') {
    // De bestandsvorm is één sleutel->waarde-object; de werkruimte bewaart
    // losse Onderdeel/Inhoud-entries (registry 1.24.1).
    domeinen.bedrijfscontext = Object.entries(parsed)
      .filter(([k]) => !k.startsWith('_'))
      .map(([k, v], i) => ({
        domein: 'bedrijfscontext', entryId: `bc-${i}`,
        data: { Onderdeel: k, Inhoud: String(v), Bijgewerkt: '2026-08-18' },
        aangemaakt: '2026-08-01T08:00:00Z', bijgewerkt: '2026-08-18T08:00:00Z',
      }))
    continue
  }
  const items = Array.isArray(parsed) ? parsed : parsed.items || []
  domeinen[naam] = items.map((data, i) => ({
    domein: naam, entryId: `${naam}-${i}`, data,
    aangemaakt: '2026-08-01T08:00:00Z', bijgewerkt: '2026-08-20T09:30:00Z',
  }))
}

// f22: de teamfeed is een opslag=werkruimte-domein en hoort niet in de
// bundel-testdata (testdata/data), maar wél in de mock-instantie. Tijden
// staan absoluut in het bestand; ze worden hier naar "nu" verschoven zodat
// de dagkoppen (Vandaag/Gisteren) en het open-lus-vangnet kloppen.
//   MOCK_ZONDER_TEAMFEED=1   simuleert een instantie op een oudere registry
if (process.env.MOCK_ZONDER_TEAMFEED !== '1') {
  const ruw = JSON.parse(readFileSync(join(REPO, 'testdata', 'werkruimte', 'teamfeed.json'), 'utf8'))
  const nieuwste = Math.max(...ruw.map((e) => Date.parse(e.aangemaakt)))
  const schuif = Date.now() - nieuwste
  domeinen.teamfeed = ruw.map((e) => {
    const ts = new Date(Date.parse(e.aangemaakt) + schuif).toISOString()
    return { ...e, aangemaakt: ts, bijgewerkt: ts }
  })
}

// f24-testvarianten voor het dashboard_metrics-domein:
//   MOCK_METRICS=vers|oud|kapot|versie2   (weggelaten = geen metrics-entry)
//   MOCK_ALLEEN_GEHEUGEN=1                (alleen logboek+bedrijfscontext als
//                                          rows — simuleert een klant met
//                                          werkdata buiten de werkruimte)
const MOCK_METRICS = process.env.MOCK_METRICS ?? ''
if (MOCK_METRICS) {
  const basis = JSON.parse(readFileSync(join(REPO, 'testdata', 'notion-metrics', 'metrics.json'), 'utf8'))
  if (MOCK_METRICS === 'vers') basis.gegenereerd_op = new Date().toISOString()
  if (MOCK_METRICS === 'versie2') basis.versie = 2
  const inhoud = MOCK_METRICS === 'kapot' ? '{dit is geen json' : JSON.stringify(basis)
  domeinen.dashboard_metrics = [{
    domein: 'dashboard_metrics', entryId: 'metrics',
    data: { Titel: `Dashboardmetrics ${String(basis.gegenereerd_op).slice(0, 10)}`, Inhoud: inhoud },
    aangemaakt: '2026-08-01T08:00:00Z', bijgewerkt: String(basis.gegenereerd_op),
  }]
}
// i23: een bronkoppeling-entry hoort door de loader stil overgeslagen te
// worden (opslag=werkruimte-domein, geen rows-domein, geen waarschuwing).
if (process.env.MOCK_BRONKOPPELING === '1') {
  domeinen.bronkoppeling = [{
    domein: 'bronkoppeling', entryId: 'sales_funnel',
    data: { Titel: 'Sales Funnel', Systeem: 'notion', Verwijzing: 'collection://00000000-mock', Laatst_geverifieerd: '2026-08-22' },
    aangemaakt: '2026-08-22T08:00:00Z', bijgewerkt: '2026-08-22T08:00:00Z',
  }, {
    domein: 'bronkoppeling', entryId: 'acties',
    data: { Titel: 'Acties', Systeem: 'notion', Verwijzing: 'collection://11111111-mock', Laatst_geverifieerd: '2026-08-22' },
    aangemaakt: '2026-08-22T08:00:00Z', bijgewerkt: '2026-08-22T08:00:00Z',
  }]
}
// Eén verdwaalde werkdata-entry (het FFG-geval): acties wonen volgens de
// bronkoppeling in Notion, maar er staat toch één actie in de werkruimte.
if (process.env.MOCK_STRAY_ACTIE === '1') {
  domeinen._strayActies = [{
    domein: 'acties', entryId: 'stray-1',
    data: { Actie: 'Boekhoudsysteem kiezen', Status: 'Open', Deadline: '2026-08-29', Agent: 'Coördinator', Eigenaar: 'Tijmen' },
    aangemaakt: '2026-08-22T21:00:00Z', bijgewerkt: '2026-08-22T21:00:00Z',
  }]
}
if (process.env.MOCK_ALLEEN_GEHEUGEN === '1') {
  for (const naam of Object.keys(domeinen)) {
    if (!['bedrijfscontext', 'dashboard_metrics', 'bronkoppeling', 'teamfeed', '_strayActies'].includes(naam) && naam !== 'logboek') delete domeinen[naam]
  }
}
if (domeinen._strayActies) {
  domeinen.acties = domeinen._strayActies
  delete domeinen._strayActies
}

// Zelfde CORS-gedrag als de echte instantie (http.ts -> dashboardRoute):
// alleen de dashboard-origin mag deze routes vanuit de browser aanroepen.
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3000'

/** De productie-CSP uit vercel.json, met deze mock-origin erbij in connect-src. */
function csp() {
  const vercel = JSON.parse(readFileSync(join(REPO, 'vercel.json'), 'utf8'))
  const regel = vercel.headers
    .flatMap((h) => h.headers)
    .find((h) => h.key === 'Content-Security-Policy').value
  return regel.replace('connect-src ', `connect-src http://localhost:${POORT} `)
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const json = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }
  if (url.pathname.startsWith('/dashboard/')) {
    const origin = req.headers.origin
    if (origin && origin === DASHBOARD_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    }
    if (req.method === 'OPTIONS') return res.writeHead(origin === DASHBOARD_ORIGIN ? 204 : 403).end()
  }
  if (url.pathname === '/werkruimte') {
    // Mét de échte CSP uit vercel.json, alleen met deze origin erbij in
    // connect-src (in productie staat de connector daar). Zonder die header
    // test je de pagina zonder de grens die hem in productie omringt — en
    // juist dingen als de blob-download van f30 staan of vallen daarmee.
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp() })
    return res.end(readFileSync(join(REPO, 'dashboard.html')))
  }
  if (url.pathname.startsWith('/dashboard/')) {
    const kop = req.headers.authorization ?? ''
    const token = kop.startsWith('Bearer ') ? kop.slice(7) : ''
    if (token !== TOKEN) return json(401, { fout: 'Deze dashboardlink is verlopen. Vraag je Coördinator om een nieuwe.' })
    if (url.pathname === '/dashboard/overzicht') {
      return json(200, {
        klant: 'Mockbedrijf BV',
        domeinen: Object.entries(domeinen).map(([domein, e]) => ({ domein, aantal: e.length })),
      })
    }
    if (url.pathname === '/dashboard/entries') {
      const d = url.searchParams.get('domein')
      if (!d || !domeinen[d]) return json(400, { fout: `Onbekend domein ${d}` })
      const limiet = Number(url.searchParams.get('limiet') ?? 50)
      const sinds = url.searchParams.get('sinds')
      const lijst = sinds ? domeinen[d].filter((e) => String(e.bijgewerkt) >= sinds) : domeinen[d]
      return json(200, { domein: d, entries: lijst.slice(0, limiet) })
    }
    // f30 — dezelfde route als de echte instantie, inclusief de
    // download-headers. Zonder deze mock is de knop lokaal niet te proberen.
    if (url.pathname === '/dashboard/export') {
      const formaat = url.searchParams.get('formaat') ?? 'markdown'
      if (formaat !== 'json' && formaat !== 'markdown') return json(400, { fout: "Parameter 'formaat' is 'json' of 'markdown'" })
      const alles = Object.values(domeinen).flat()
      const inhoud = formaat === 'json'
        ? JSON.stringify({ werkruimte: 'Mockbedrijf BV', aantalEntries: alles.length, entries: alles }, null, 2)
        : `# Werkruimte-export — Mockbedrijf BV\n\n${alles.length} entries\n`
      res.writeHead(200, {
        'content-type': formaat === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="werkruimte-export-mockbedrijf-bv-2026-08-28.${formaat === 'json' ? 'json' : 'md'}"`,
        'cache-control': 'no-store',
      })
      return res.end(inhoud)
    }
  }
  json(404, { fout: 'Onbekende route' })
})

server.listen(POORT, () => {
  console.log(`mock-instantie op http://localhost:${POORT}`)
  console.log(`daglink: http://localhost:${POORT}/werkruimte#t=${TOKEN}&i=${encodeURIComponent(`http://localhost:${POORT}`)}`)
  console.log('domeinen:', Object.entries(domeinen).map(([k, v]) => `${k}(${v.length})`).join(', '))
})
