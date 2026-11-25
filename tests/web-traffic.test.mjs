import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import worker from '../workers/traffic/index.mjs'

test('the traffic Worker caches and exposes only fixed-window totals', async t => {
  const memory = new Map()
  const waits = []
  const previousCaches = globalThis.caches
  globalThis.caches = { default: {
    match: async request => memory.get(request.url)?.clone(),
    put: async (request, response) => { memory.set(request.url, response.clone()) },
  } }
  t.after(() => { if (previousCaches === undefined) delete globalThis.caches; else globalThis.caches = previousCaches })
  const env = { CF_ACCOUNT_ID: 'a'.repeat(32), CF_WEB_ANALYTICS_SITE_TAG: 'b'.repeat(32), CF_ANALYTICS_API_TOKEN: 'secret-for-test' }
  const upstream = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql')
    assert.equal(options.headers.Authorization, 'Bearer secret-for-test')
    assert.equal(JSON.parse(options.body).variables.site, env.CF_WEB_ANALYTICS_SITE_TAG)
    return Response.json({ data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [{ count: 72, ip: 'test value', sum: { visits: 35 } }] }] } } })
  })
  const ctx = { waitUntil: task => waits.push(task) }
  const route = new Request('https://traffic.example/stats')
  assert.equal((await worker.fetch(route, {}, ctx)).status, 503)
  assert.equal((await worker.fetch(new Request(route.url + '?range=recent'), env, ctx)).status, 404)
  const response = await worker.fetch(route, env, ctx)
  await Promise.all(waits)
  assert.equal(response.headers.get('cache-control'), 'public, max-age=1800')
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://arvind595.github.io')
  const totals = await response.json()
  assert.deepEqual(totals, { pageViews: 72, visits: 35, periodDays: 7, asOf: totals.asOf })
  assert.ok(Number.isFinite(Date.parse(totals.asOf)))
  assert.deepEqual(await (await worker.fetch(route, env, ctx)).json(), totals)
  assert.equal(upstream.mock.callCount(), 1)
})

test('hosted traffic UI loads the page-view beacon and renders aggregate counts without credentials', async () => {
  const source = readFileSync('js/web-traffic.js', 'utf8')
  assert.doesNotThrow(() => runInNewContext(source, { location: { origin: 'null' } }))
  const calls = []
  const handlers = {}
  const elements = {
    webTraffic: { hidden: true, closest: () => ({ open: true, addEventListener() {} }) },
    webTrafficStatus: {}, webTrafficTotals: { hidden: true },
    webPageViews: {}, webVisits: {}, 'settings-view': { hidden: true },
  }
  const beacon = { setAttribute(name, value) { this[name] = value } }
  const context = {
    location: { origin: 'https://arvind595.github.io', pathname: '/Punchly/' },
    document: {
      hidden: false, head: { append(node) { calls.push(node.src) } }, addEventListener() {},
      createElement: () => beacon, getElementById: id => elements[id],
    },
    window: { addEventListener(name, callback) { handlers[name] = callback }, setInterval() {} },
    URL, AbortSignal,
    fetch: async (url, options) => {
      calls.push(url)
      assert.equal(options.credentials, 'omit')
      assert.equal(options.headers, undefined)
      return url === 'config/traffic.json'
        ? Response.json({ endpoint: 'https://example.test/stats' })
        : Response.json({ pageViews: 23, visits: 15, periodDays: 7, asOf: '2026-11-25T12:00:00Z' })
    },
  }
  runInNewContext(source, context)
  assert.deepEqual(calls, ['https://static.cloudflareinsights.com/beacon.min.js'])
  assert.equal(JSON.parse(beacon['data-cf-beacon']).spa, false)
  elements['settings-view'].hidden = false
  await handlers['punchly:settings-opened']()
  assert.deepEqual(calls.slice(1), ['config/traffic.json', 'https://example.test/stats'])
  assert.equal(elements.webTrafficTotals.hidden, false)
  assert.equal(elements.webPageViews.textContent, '23')
  assert.equal(elements.webVisits.textContent, '15')
})
