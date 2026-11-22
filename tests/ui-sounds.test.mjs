import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { buildSync } from 'esbuild'
import { createRecipe, renderRecipe } from 'uisfx'

const bundle = buildSync({
  entryPoints: ['src/ui-sounds.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'UiSounds',
  write: false,
}).outputFiles[0].text
const defaults = { punchAudio: true, soundVolume: 70, typingSounds: false }
const sampleRate = 8000
const lengths = new Map(
  ['success', 'notification', 'checkpoint', 'loading', 'typing'].map((cue) => [
    renderRecipe(createRecipe('zen', cue), sampleRate).left.length,
    cue,
  ]),
)

function events() {
  const handlers = new Map()
  return {
    hidden: false,
    addEventListener(type, handler, { signal }) {
      if (!handlers.has(type)) handlers.set(type, new Set())
      const list = handlers.get(type)
      list.add(handler)
      signal.addEventListener('abort', () => list.delete(handler), {
        once: true,
      })
    },
    emit(type, fields = {}) {
      for (const handler of handlers.get(type) ?? [])
        handler({ isTrusted: true, ...fields })
    },
  }
}

function clock() {
  let time = 0
  let id = 0
  const jobs = new Map()
  return {
    performance: { now: () => time },
    setTimeout(fn, delay) {
      jobs.set(++id, { fn, at: time + delay })
      return id
    },
    clearTimeout(handle) {
      jobs.delete(handle)
    },
    tick(ms) {
      const target = time + ms
      for (;;) {
        const job = [...jobs].sort((a, b) => a[1].at - b[1].at)[0]
        if (!job || job[1].at > target) break
        jobs.delete(job[0])
        time = job[1].at
        job[1].fn()
      }
      time = target
    },
  }
}

function browser(initialState = 'running') {
  const heard = []
  let opened = 0
  let closed = 0
  let resume
  class AudioContext {
    state = initialState
    currentTime = 0
    sampleRate = sampleRate
    constructor() {
      opened++
    }
    resume() {
      return new Promise((resolve) => {
        resume = () => {
          this.state = 'running'
          resolve()
        }
      })
    }
    async close() {
      this.state = 'closed'
      closed++
    }
    createBuffer(channels, length) {
      return { length, getChannelData: () => new Float32Array(length) }
    }
    createBufferSource() {
      let end
      const output = {
        playbackRate: { value: 1 },
        connect() {},
        disconnect() {},
        addEventListener(type, handler) {
          end = handler
        },
        start() {
          heard.push(output)
        },
        stop() {
          output.stopped = true
          end()
        },
        get cue() {
          return lengths.get(this.buffer.length)
        },
      }
      return output
    }
    createGain() {
      return {
        connect() {},
        disconnect() {},
        gain: {
          value: 1,
          cancelScheduledValues() {},
          setValueAtTime(value) {
            this.value = value
          },
          linearRampToValueAtTime(value) {
            this.value = value
          },
        },
      }
    }
  }
  class Element {
    matches() {
      return true
    }
  }
  const window = { ...events(), AudioContext }
  const document = events()
  const timers = clock()
  const global = { window, document, Element, AbortController, ...timers }
  runInNewContext(bundle, global)
  return {
    ...timers,
    window,
    document,
    Element,
    heard,
    ui: global.UiSounds,
    opened: () => opened,
    closed: () => closed,
    resume: () => resume(),
  }
}

const waitStatus = { getClientRects: () => [true] }

test('does not instantiate or play on the server, at startup, or for synthetic gestures', () => {
  const server = {}
  runInNewContext(bundle, server)
  server.UiSounds.connect(defaults)
  assert.equal(server.UiSounds.play('success'), null)
  const b = browser()
  b.ui.connect(defaults)
  b.document.emit('click', { isTrusted: false })
  assert.equal(b.ui.play('success'), null)
  assert.equal(b.opened(), 0)
})

test('shares one context across pointer and keyboard activation and plays one mapped punch cue per action', () => {
  const b = browser()
  b.ui.connect(defaults)
  b.ui.connect(defaults)
  b.document.emit('pointerdown', { pointerType: 'mouse' })
  b.document.emit('click')
  b.document.emit('keydown', { key: 'Enter' })
  b.document.emit('click')
  assert.equal(b.opened(), 1)
  assert.equal(b.heard.length, 0)
  for (const period of ['morning', 'afternoon', 'evening', 'night']) {
    b.ui.punch(period)
    b.tick(1000)
  }
  assert.deepEqual(
    b.heard.map((source) => source.cue),
    Array(4).fill('checkpoint'),
  )
  assert.deepEqual(
    b.heard.map((source) => source.playbackRate.value),
    [1.08, 1, 0.94, 0.86],
  )
})

test('drops an async cue captured before unlock and invalidates a pending cue when leaving the view', () => {
  const b = browser('suspended')
  b.ui.connect(defaults)
  const before = b.ui.feedback()
  b.document.emit('pointerup', { pointerType: 'touch' })
  const suspended = b.ui.feedback()
  b.resume()
  before('success')
  suspended('success')
  assert.equal(b.heard.length, 0)
  const active = b.ui.feedback()
  active('success')
  assert.equal(b.heard[0].cue, 'success')
  b.ui.leaveView()
  active('notification')
  assert.equal(b.heard.length, 1)
})

test('opt-in typing plays for each trusted text input and stops at mute', () => {
  const b = browser()
  b.ui.connect(defaults)
  b.document.emit('keydown', { key: 'a' })
  const target = new b.Element()
  b.document.emit('input', { target })
  b.ui.sync({ ...defaults, typingSounds: true })
  b.document.emit('input', { target })
  b.document.emit('input', { target })
  b.document.emit('input', { target, isTrusted: false })
  assert.deepEqual(
    b.heard.map((source) => source.cue),
    ['typing', 'typing'],
  )
  b.ui.sync({ ...defaults, typingSounds: true, punchAudio: false })
  assert.ok(b.heard.every((source) => source.stopped))
  b.document.emit('input', { target })
  assert.equal(b.heard.length, 2)
})

test('delays loading, ignores duplicate starts, and stops at completion, cancellation, timeout, mute, and cleanup', async () => {
  const b = browser()
  b.ui.connect(defaults)
  b.document.emit('click')
  const skipped = b.ui.startLoading(waitStatus)
  skipped()
  b.tick(300)
  assert.equal(b.heard.length, 0)
  for (const end of [
    (stop) => stop(),
    () => b.ui.leaveView(),
    () => b.tick(8000),
    () => b.ui.sync({ ...defaults, punchAudio: false }),
    () => b.ui.sync({ ...defaults, soundVolume: 0 }),
    () => {
      b.document.hidden = true
      b.document.emit('visibilitychange')
    },
    () => b.window.emit('pagehide', { persisted: true }),
  ]) {
    const stop = b.ui.startLoading(waitStatus)
    assert.equal(stop, b.ui.startLoading(waitStatus))
    const before = b.heard.length
    b.tick(300)
    assert.equal(b.heard.length, before + 1)
    assert.equal(b.heard.at(-1).cue, 'loading')
    assert.equal(b.heard.at(-1).loop, true)
    end(stop)
    assert.equal(b.heard.at(-1).stopped, true)
    b.document.hidden = false
    b.ui.sync(defaults)
    b.tick(8000)
    assert.equal(b.heard.length, before + 1)
  }
  b.ui.startLoading(waitStatus)
  b.tick(300)
  await b.ui.destroy()
  assert.ok(b.heard.at(-1).stopped)
  assert.equal(b.closed(), 1)
  b.document.emit('click')
  assert.equal(b.opened(), 1)
  b.ui.connect(defaults)
  b.document.emit('click')
  assert.equal(b.opened(), 2)
  await b.ui.destroy()
  assert.equal(b.closed(), 2)
})

test('retains mute, volume, and typing preferences across app instances', () => {
  const data = new Map([
    ['punchly_settings', JSON.stringify({ punchAudio: false })],
  ])
  const localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }
  function storage() {
    const browsingContext = { localStorage, Shift: { parseTime: () => null } }
    runInNewContext(
      readFileSync('js/storage.js', 'utf8') + '\nthis.appStorage = Storage;',
      browsingContext,
    )
    return browsingContext.appStorage
  }
  assert.equal(storage().getSettings().soundVolume, 70)
  assert.equal(storage().getSettings().punchAudio, false)
  storage().saveSettings({
    ...defaults,
    punchAudio: false,
    soundVolume: 35,
    typingSounds: true,
  })
  const saved = storage().getSettings()
  assert.equal(saved.soundVolume, 35)
  assert.equal(saved.typingSounds, true)
  const b = browser()
  b.ui.connect(saved)
  b.document.emit('click')
  assert.equal(b.ui.play('success'), null)
})

test('backup import sounds follow the committed restore, cancellation, invalid file, and write failure', async () => {
  const log = []
  const window = {
    dispatchEvent: (event) => log.push(event.type),
  }
  let close
  const dialog = {
    showModal() {
      log.push('shown')
    },
    addEventListener(type, handler) {
      close = handler
    },
  }
  const storage = {
    validateBackup: () => {},
    importBackup() {
      log.push('write')
      return 2
    },
  }
  runInNewContext(readFileSync('js/export.js', 'utf8'), {
    window,
    Shift: { fields: [] },
    Audit: {},
    Storage: storage,
    CustomEvent: Event,
    UiSounds: { feedback: () => (cue) => log.push(cue) },
    document: {
      getElementById: (id) => (id === 'restoreDialog' ? dialog : {}),
    },
  })
  const notify = () => log.push('status')
  function begin(text) {
    return window.importBackupFile(
      { value: 'backup.json', files: [{ text }] },
      notify,
    )
  }
  async function decide(choice) {
    await new Promise((resolve) => setImmediate(resolve))
    dialog.returnValue = choice
    close()
  }
  let resolve
  const success = begin(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  assert.deepEqual(log, [])
  resolve('{"history":[]}')
  await decide('replace')
  assert.equal(await success, true)
  assert.deepEqual(log.splice(0), [
    'shown',
    'open',
    'write',
    'punchly:backup-imported',
    'status',
    'success',
  ])
  const cancelled = begin(async () => '{"history":[]}')
  await decide('cancel')
  assert.equal(await cancelled, false)
  assert.deepEqual(log.splice(0), ['shown', 'open', 'cancel'])
  assert.equal(await begin(async () => 'invalid json'), false)
  assert.deepEqual(log.splice(0), ['status', 'error'])
  storage.importBackup = () => {
    throw new Error('Storage full')
  }
  const failure = begin(async () => '{"history":[]}')
  await decide('merge')
  assert.equal(await failure, false)
  assert.deepEqual(log, ['shown', 'open', 'status', 'error'])
})
