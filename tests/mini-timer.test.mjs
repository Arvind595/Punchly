import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

test('countdown follows the estimated checkout including overnight shifts and stops at zero', () => {
  const context = {}
  runInNewContext(readFileSync('js/mini-timer.js', 'utf8') + '\nthis.MiniTimer = MiniTimer', context)
  const result = { started: true, complete: false, error: '', targetOut: 1500 }
  const now = { getSeconds: () => 20 }
  assert.equal(context.MiniTimer.countdown(result, 1439, now), '1h 00m 40s')
  assert.equal(context.MiniTimer.countdown(result, 1501, now), '0h 00m 00s')
  assert.equal(context.MiniTimer.countdown({ ...result, complete: true }, 1501, now), '—')
  assert.equal(context.MiniTimer.countdown({ ...result, error: 'Invalid' }, 1439, now), '—')
  assert.equal(context.MiniTimer.countdown(result, null, now), '—')
})

test('mini timer refreshes each second and copies theme colors to its floating window', async () => {
  const nodes = Object.fromEntries(['miniTimerToggle', 'miniTimer', 'miniTimerClose', 'miniTimerWorked', 'miniTimerTarget', 'miniTimerCountdown', 'miniTimerNote'].map(id => [id, {
    hidden: id === 'miniTimer', handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn }, setAttribute() {}, focus() {},
  }]))
  nodes.miniTimer.parentNode = { append() {} }
  const copied = {}
  const pip = {
    closed: false,
    document: { documentElement: { style: { setProperty: (key, value) => { copied[key] = value } } },
      createElement: () => ({}), head: { append() {} }, body: { append() {} } },
    addEventListener() {}, close() { this.closed = true },
  }
  let tick
  let cleared = false
  let countdown = '1h 00m 00s'
  const context = {
    document: { getElementById: id => nodes[id], documentElement: {} },
    window: { documentPictureInPicture: { requestWindow: async () => pip }, addEventListener() {} },
    getComputedStyle: () => ({ getPropertyValue: key => `theme:${key}` }),
    setInterval: fn => { tick = fn; return 1 }, clearInterval: () => { cleared = true },
  }
  runInNewContext(readFileSync('js/mini-timer.js', 'utf8') + '\nthis.MiniTimer = MiniTimer', context)
  const timer = context.MiniTimer.connect({ desktop: () => true, snapshot: () => ({ worked: '2h', target: '5 PM', countdown, note: '' }) })
  await nodes.miniTimerToggle.handlers.click()
  assert.equal(nodes.miniTimerCountdown.textContent, '1h 00m 00s')
  assert.equal(copied['--surface-color'], 'theme:--surface-color')
  assert.equal(copied['--accent-color'], 'theme:--accent-color')
  countdown = '0h 59m 59s'
  tick()
  assert.equal(nodes.miniTimerCountdown.textContent, countdown)
  timer.close()
  assert.equal(cleared, true)
})
