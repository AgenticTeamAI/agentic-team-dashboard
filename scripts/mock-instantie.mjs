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

// Zelfde CORS-gedrag als de echte instantie (http.ts -> dashboardRoute):
// alleen de dashboard-origin mag deze routes vanuit de browser aanroepen.
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3000'

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
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
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
      return json(200, { domein: d, entries: domeinen[d].slice(0, limiet) })
    }
  }
  json(404, { fout: 'Onbekende route' })
})

server.listen(POORT, () => {
  console.log(`mock-instantie op http://localhost:${POORT}`)
  console.log(`daglink: http://localhost:${POORT}/werkruimte#t=${TOKEN}&i=${encodeURIComponent(`http://localhost:${POORT}`)}`)
  console.log('domeinen:', Object.entries(domeinen).map(([k, v]) => `${k}(${v.length})`).join(', '))
})
