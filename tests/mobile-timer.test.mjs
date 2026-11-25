import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync('js/mobile-timer.js', 'utf8')
const shift = { active: true, shift: '2026-11-25:09:00', updatedAt: 60000, worked: '7h 05m', target: '6:05 PM', status: 'Working' }

function android(memory) {
  const calls = []
  let current
  const registration = {
    active: {},
    async getNotifications() { return current ? [current] : [] },
    async showNotification(title, options) {
      calls.push({ title, ...options })
      current = { close() { current = undefined } }
    },
  }
  const context = {
    window: { isSecureContext: true, Notification: {} },
    navigator: { userAgent: 'Android', serviceWorker: { getRegistration: async () => registration } },
    Notification: { permission: 'default' },
    document: { getElementById: () => ({}) },
    localStorage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) },
  }
  const settings = { mobileTimerEnabled: true, mobileTimerTarget: true, mobileTimerOvertime: true }
  runInNewContext(source + '\nthis.timer = MobileTimerNotifications', context)
  return { timer: context.timer.connect(settings), notification: context.Notification, settings, calls, current: () => current }
}

test('Android timer is opt-in, persistent, deep-linked and sends each threshold alert once', async () => {
  const memory = new Map()
  const first = android(memory)
  await first.timer.update(shift)
  assert.equal(first.calls.length, 0)
  first.notification.permission = 'granted'
  await first.timer.update(shift)
  assert.equal(first.calls.length, 1)
  assert.equal(first.calls[0].requireInteraction, true)
  assert.equal(first.calls[0].silent, true)
  assert.equal(first.calls[0].data.openMiniTimer, true)
  await first.timer.update({ ...shift, targetReached: true, status: 'Target reached' })
  assert.match(first.calls[1].title, /Target out/)
  assert.equal(first.calls[1].renotify, true)
  const overtime = { ...shift, targetReached: true, status: 'Overtime', worked: '8h 21m' }
  await first.timer.update(overtime)
  assert.match(first.calls[2].title, /Overtime/)
  await first.timer.update(overtime)
  assert.equal(first.calls.length, 3)
  first.settings.mobileTimerEnabled = false
  await first.timer.update(overtime)
  assert.equal(first.current(), undefined)

  const reloaded = android(memory)
  reloaded.notification.permission = 'granted'
  await reloaded.timer.update(overtime)
  assert.equal(reloaded.calls.length, 1)
  assert.equal(reloaded.calls[0].silent, true)
  await reloaded.timer.update({ ...overtime, active: false })
  assert.equal(reloaded.current(), undefined)
})
