import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

function browser(shared = new Map(), quota = false) {
  const notifications = []
  const windowHandlers = {}
  const nodes = Object.fromEntries(['enableNotifications', 'setupNotifications', 'notificationStatus', 'setupNotificationStatus', 'reminderBanner', 'reminderMessage', 'dismissReminder'].map(id => [id, {
    handlers: {}, hidden: false, addEventListener(name, fn) { this.handlers[name] = fn },
  }]))
  class Notification {
    static permission = 'default'
    static async requestPermission() { return Notification.permission }
    constructor(title, options) { notifications.push({ title, ...options }) }
  }
  const window = { Notification, isSecureContext: true, addEventListener(name, fn) { windowHandlers[name] = fn } }
  const context = {
    window, Notification, document: { getElementById: id => nodes[id] }, navigator: {},
    localStorage: { getItem: key => shared.get(key) ?? null, setItem: (key, value) => { if (quota) throw new Error('full'); shared.set(key, value) } },
    Shift: { parseTime: value => value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null, isHoliday: () => false },
    UiSounds: { feedback: () => () => {}, play() {} },
  }
  runInNewContext(readFileSync('js/reminders.js', 'utf8') + '\nthis.Reminders = Reminders', context)
  const settings = { workdays: [1], reminderIn: '09:00', reminderOut: '', reminderLunchOut: '', reminderLunchReturn: '', reminderTarget: false }
  const reminders = context.Reminders.connect(settings)
  const day = { mode: 'full', punches: {} }
  const now = { getDay: () => 1, getHours: () => 9, getMinutes: () => 0 }
  return { nodes, Notification, notifications, windowHandlers, check: () => reminders.check(now, '2026-11-23', day, null, true) }
}

test('permission controls update when browser permission changes', async () => {
  const b = browser()
  assert.equal(b.nodes.enableNotifications.disabled, false)
  b.Notification.permission = 'denied'
  b.windowHandlers.focus()
  assert.equal(b.nodes.enableNotifications.disabled, true)
  assert.match(b.nodes.notificationStatus.textContent, /blocked/i)
  b.Notification.permission = 'granted'
  b.windowHandlers.focus()
  assert.match(b.nodes.notificationStatus.textContent, /enabled/i)
  b.check()
  assert.equal(b.notifications.length, 1)
})

test('a due reminder is not duplicated on repeated checks or browser reload', () => {
  const shared = new Map()
  const first = browser(shared)
  first.Notification.permission = 'granted'
  first.check()
  first.check()
  assert.equal(first.notifications.length, 1)
  const second = browser(shared)
  second.Notification.permission = 'granted'
  second.check()
  assert.equal(second.notifications.length, 0)
})

test('in-app reminders work without notification permission and storage failure does not repeat within a session', () => {
  const b = browser(new Map(), true)
  b.Notification.permission = 'denied'
  b.check()
  assert.match(b.nodes.reminderMessage.textContent, /punch in/i)
  b.nodes.reminderBanner.hidden = true
  b.check()
  assert.equal(b.nodes.reminderBanner.hidden, true)
  assert.equal(b.notifications.length, 0)
})
