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
  const nodes = Object.fromEntries(['miniTimerToggle', 'miniTimer', 'miniTimerClose', 'miniTimerOpen', 'miniTimerWorked', 'miniTimerTarget', 'miniTimerCountdown',
    'miniTimerCounterLabel', 'miniTimerStatus', 'miniTimerNote'].map(id => [id, {
    hidden: id === 'miniTimer', handlers: {}, style: {}, addEventListener(name, fn) { this.handlers[name] = fn }, setAttribute() {}, focus() {},
  }]))
  nodes.miniTimer.parentNode = { append() {} }
  const copied = {}
  const makePopup = () => ({
    closed: false,
    document: { documentElement: { style: { setProperty: (key, value) => { copied[key] = value } } },
      createElement: () => ({}), head: { append() {} }, body: { append() {} } },
    addEventListener() {}, close() { this.closed = true },
  })
  const windows = []
  let tick
  let cleared = false
  let countdown = '1h 00m 00s'
  let returnedToPunch = false
  let intervals = 0
  const preferences = { miniTimerOnTop: true, miniTimerOpacity: 80 }
  const context = {
    document: { getElementById: id => nodes[id], documentElement: {} },
    window: { documentPictureInPicture: { requestWindow: async () => {
      const popup = makePopup()
      windows.push(popup)
      return popup
    } }, addEventListener() {} },
    getComputedStyle: () => ({ getPropertyValue: key => `theme:${key}` }),
    setInterval: fn => { tick = fn; return ++intervals }, clearInterval: () => { cleared = true },
  }
  runInNewContext(readFileSync('js/mini-timer.js', 'utf8') + '\nthis.MiniTimer = MiniTimer', context)
  const timer = context.MiniTimer.connect({ desktop: () => true, preferences: () => preferences,
    openMain: () => { returnedToPunch = true }, snapshot: () => ({ worked: '2h', target: '5 PM', countdown, status: 'Working', note: '' }) })
  await nodes.miniTimerToggle.handlers.click()
  assert.equal(nodes.miniTimerCountdown.textContent, '1h 00m 00s')
  assert.equal(copied['--surface-color'], 'theme:--surface-color')
  assert.equal(copied['--accent-color'], 'theme:--accent-color')
  assert.equal(nodes.miniTimer.style.opacity, .8)
  assert.equal(nodes.miniTimerStatus.textContent, 'Working')
  nodes.miniTimerOpen.handlers.click()
  assert.equal(returnedToPunch, true)
  countdown = '0h 59m 59s'
  tick()
  assert.equal(nodes.miniTimerCountdown.textContent, countdown)
  preferences.miniTimerOnTop = false
  await timer.applyOnTop()
  assert.equal(windows[0].closed, true)
  assert.equal(nodes.miniTimer.hidden, false)
  preferences.miniTimerOnTop = true
  await timer.applyOnTop()
  assert.equal(windows.length, 2)
  assert.equal(windows[1].closed, false)
  assert.equal(nodes.miniTimer.hidden, false)
  assert.equal(intervals, 1)

  timer.close()
  assert.equal(windows[1].closed, true)
  await timer.applyOnTop()
  assert.equal(windows.length, 2)
  preferences.miniTimerOnTop = false
  await nodes.miniTimerToggle.handlers.click()
  assert.equal(windows.length, 2)
  timer.close()
  assert.equal(cleared, true)
})

test('timer identifies shift states and switches from countdown to worked overtime', () => {
  const context = {}
  runInNewContext(readFileSync('js/mini-timer.js', 'utf8') + '\nthis.MiniTimer = MiniTimer', context)
  const current = { started: true, target: 480, total: 456, targetOut: 1020, timeline: { now: 996 } }
  const status = (result, dayOff = false) => context.MiniTimer.timing(result, 996, { getSeconds: () => 18 }, dayOff)
  assert.equal(status(current).status, 'Working')
  assert.equal(status({ ...current, lunchOpen: true }).status, 'Lunch')
  assert.equal(status({ ...current, started: false }).status, 'Not started')
  assert.equal(status({ ...current, started: false }, true).status, 'Day off')
  assert.equal(status({ ...current, complete: true }).status, 'Completed')
  assert.equal(status({ ...current, total: 480 }).status, 'Target reached')
  const overtime = status({ ...current, total: 504 })
  assert.equal(overtime.status, 'Overtime')
  assert.equal(overtime.countdown, '+00:24:18')
})
