import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const context = {}
runInNewContext(readFileSync('js/shift.js', 'utf8') + '\nthis.Shift = Shift', context)
const { Shift } = context
const punches = (morningIn, lunchOut = '', lunchReturn = '', eveningOut = '') => ({
  morningIn, lunchOut, lunchReturn, eveningOut,
})
const measure = (values = {}) => Shift.measure({
  mode: 'full', punches: punches('09:00'), baseTarget: 480, lunchLimit: 45,
  minimumLunch: true, now: null, ...values,
})

test('minimum lunch uses the configured limit for a short break and the actual duration for a long break', () => {
  for (const [back, out, actual, total, checkout] of [
    ['13:30', '17:45', 30, 480, 1065],
    ['14:00', '18:00', 60, 480, 1080],
  ]) {
    const result = measure({ punches: punches('09:00', '13:00', back, out) })
    assert.equal(result.lunch, actual)
    assert.equal(result.lunchDeduction, Math.max(45, actual))
    assert.equal(result.total, total)
    assert.equal(result.targetOut, checkout)
  }
})

test('live estimates and worked time reserve the unused minimum, including a skipped lunch', () => {
  let result = measure({ now: 12 * 60 })
  assert.equal(result.total, 135)
  assert.equal(result.targetOut, 1065)
  result = measure({ punches: punches('09:00', '13:00'), now: 13 * 60 + 30 })
  assert.equal(result.total, 225)
  assert.equal(result.targetOut, 1065)
  result = measure({ punches: punches('09:00', '13:00'), now: 14 * 60 })
  assert.equal(result.total, 240)
  assert.equal(result.targetOut, 1080)
  result = measure({ punches: punches('09:00', '', '', '17:45') })
  assert.equal(result.total, 480)
  assert.equal(result.lunch, null)
  assert.equal(result.lunchDeduction, 45)
  assert.equal(measure({ punches: punches('09:00', '', '', '09:10') }).total, 0)
})

test('disabled minimum and half days retain their existing calculations', () => {
  const short = punches('09:00', '13:00', '13:30', '17:30')
  const standard = measure({ punches: short, minimumLunch: false })
  assert.equal(standard.total, 480)
  assert.equal(standard.targetOut, 1050)
  assert.equal(standard.lunchDeduction, 30)
  const half = measure({ mode: 'half', punches: punches('09:00', '', '', '13:00') })
  assert.equal(half.total, 240)
  assert.equal(half.target, 240)
  assert.equal(half.lunchDeduction, null)
})

test('minimum deduction works across midnight and respects a zero limit', () => {
  const overnight = measure({ punches: punches('20:00', '23:30', '00:00', '04:45') })
  assert.equal(overnight.total, 480)
  assert.equal(overnight.targetOut, 1725)
  assert.equal(overnight.endDayOffset, 1)
  const zero = measure({ lunchLimit: 0, punches: punches('09:00', '13:00', '13:30', '17:30') })
  assert.equal(zero.total, 480)
  assert.equal(zero.lunchDeduction, 30)
})

test('settings and backups preserve the option and missing settings default to on', () => {
  const data = new Map()
  const localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  }
  const browser = { Shift, localStorage, Audit: { valid: () => true }, console }
  runInNewContext(readFileSync('js/storage.js', 'utf8') + '\nthis.Storage = Storage', browser)
  const { Storage } = browser
  assert.equal(Storage.getSettings().minimumLunch, true)
  Storage.saveSettings({ ...Storage.getSettings(), minimumLunch: false })
  assert.equal(Storage.getSettings().minimumLunch, false)
  Storage.saveSettings({ ...Storage.getSettings(), minimumLunch: true })
  Storage.saveRecord({
    id: 'daily-2026-11-23', kind: 'daily', date: '2026-11-23', mode: 'full',
    in: '09:00', out: '17:45', punches: punches('09:00', '13:00', '13:30', '17:45'),
    totalMinutes: 480, targetMinutes: 480, lunchMinutes: 30, lunchDeductionMinutes: 45,
    lunchLimitMinutes: 45, minimumLunch: true,
  })
  const backup = Storage.exportBackup()
  assert.equal(backup.settings.minimumLunch, true)
  Storage.saveSettings({ ...Storage.getSettings(), minimumLunch: false })
  Storage.importBackup(backup, false)
  assert.equal(Storage.getSettings().minimumLunch, true)
  assert.equal(Storage.getHistory()[0].lunchMinutes, 30)
  assert.equal(Storage.getHistory()[0].lunchDeductionMinutes, 45)
  assert.equal(Storage.getHistory()[0].minimumLunch, true)
  Storage.importSettings({ format: 'punchly-settings', version: 1, settings: {} })
  assert.equal(Storage.getSettings().minimumLunch, true)
})
