import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const version = JSON.parse(readFileSync('release.json', 'utf8')).version

function worker() {
  const handlers = {}
  const stores = new Map()
  const self = {
    registration: { scope: 'https://example.test/Punchly/' }, location: { origin: 'https://example.test' },
    addEventListener: (name, fn) => { handlers[name] = fn }, skipWaiting: async () => {},
    clients: { claim: async () => {} },
  }
  let response = new Response(`<meta name="punchly-release" content="${version}">`)
  let failAssets = false
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map())
      const data = stores.get(name)
      return {
        addAll: async requests => { if (failAssets) throw new Error('missing asset'); requests.forEach(request => data.set(request.url, new Response('asset'))) },
        put: async (key, value) => data.set(key, value),
        match: async key => data.get(typeof key === 'string' ? key : key.url),
      }
    },
    keys: async () => [...stores.keys()], delete: async name => stores.delete(name),
    match: async request => { for (const data of stores.values()) if (data.has(request.url)) return data.get(request.url); return undefined },
  }
  const context = { self, caches, URL, Request, Response, AbortController, setTimeout, clearTimeout, fetch: async () => response }
  runInNewContext(readFileSync('service-worker.js', 'utf8') + '\nthis.config = { RELEASE, CACHE_NAME, APP_ASSETS }', context)
  return { handlers, stores, config: context.config, caches, setResponse: value => { response = value }, fail: () => { failAssets = true } }
}

function dispatch(fn, extras = {}) {
  let pending
  fn({ ...extras, waitUntil: promise => { pending = promise }, respondWith: promise => { pending = promise } })
  return pending
}

test('install caches the generated assets and retains the previous working cache', async () => {
  const w = worker()
  await w.caches.open(`punchly-static-v${version - 2}`)
  await w.caches.open(`punchly-static-v${version - 1}`)
  await dispatch(w.handlers.install)
  assert.ok(w.config.APP_ASSETS.some(url => /js\/app\.js\?v=[0-9a-f]{12}$/.test(url)))
  assert.ok(w.stores.get(w.config.CACHE_NAME).has('https://example.test/Punchly/index.html'))
  await dispatch(w.handlers.activate)
  assert.equal(w.stores.has(`punchly-static-v${version - 2}`), false)
  assert.equal(w.stores.has(`punchly-static-v${version - 1}`), true)
  assert.equal(w.stores.has(w.config.CACHE_NAME), true)
})

test('failed install removes its partial cache and mismatched HTML falls back to the active release', async () => {
  const failing = worker()
  failing.fail()
  await assert.rejects(dispatch(failing.handlers.install), /missing asset/)
  assert.equal(failing.stores.has(failing.config.CACHE_NAME), false)
  const active = worker()
  await dispatch(active.handlers.install)
  active.setResponse(new Response(`<meta name="punchly-release" content="${version + 1}">`))
  const result = await dispatch(active.handlers.fetch, { request: { method: 'GET', mode: 'navigate', url: 'https://example.test/Punchly/index.html' } })
  assert.ok((await result.text()).includes(`content="${version}"`))
})
