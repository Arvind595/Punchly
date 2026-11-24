import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const example = JSON.parse(readFileSync('test-data/Punchly_v18_test_backup.json', 'utf8'))

function browser(initial = {}) {
  const data = new Map(Object.entries(initial))
  const events = []
  let fail = () => false
  const localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem(key, value) {
      if (fail(key, value)) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' })
      data.set(key, String(value))
    },
    removeItem: key => data.delete(key),
  }
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail } }
  const ctx = { localStorage, window: { dispatchEvent: event => events.push(event) }, CustomEvent, console: { warn() {}, error() {} } }
  for (const name of ['shift', 'audit', 'storage']) runInNewContext(readFileSync(`js/${name}.js`, 'utf8'), ctx)
  runInNewContext('this.Storage = Storage; this.Audit = Audit', ctx)
  return { Storage: ctx.Storage, Audit: ctx.Audit, data, events, setFailure: callback => { fail = callback } }
}

test('valid backup survives export and replace round trip, including drafts and change logs', () => {
  const first = browser()
  assert.equal(first.Storage.importBackup(example, false), example.history.length)
  const backup = JSON.parse(JSON.stringify(first.Storage.exportBackup()))
  const second = browser()
  second.Storage.validateBackup(backup)
  second.Storage.importBackup(backup, false)
  assert.equal(second.Storage.getHistory().length, example.history.length)
  assert.deepEqual(JSON.parse(JSON.stringify(second.Storage.getDrafts())), example.drafts)
  assert.deepEqual(JSON.parse(JSON.stringify(second.Storage.getHistory()[0].audit)), example.history[0].audit)
  assert.equal(second.data.has('punchly_restore_recovery_v1'), false)
})

test('replace does not bring back weekly records from an older local calculator', () => {
  const b = browser({ timecard_calculator_history_v1: JSON.stringify([{ id: 'old-week', dateFormatted: '2025-01-01', header: 'Old' }]) })
  b.Storage.importBackup(example, false)
  assert.equal(b.Storage.getHistory().some(row => row.id === 'old-week'), false)
})

test('legacy history migration retries when storage could not save the imported records', () => {
  const b = browser({ timecard_calculator_history_v1: JSON.stringify([{ id: 'old-week', dateFormatted: '2025-01-01' }]) })
  b.setFailure(key => key === 'punchly_history')
  assert.equal(b.Storage.getHistory()[0].id, 'old-week')
  assert.equal(b.data.has('punchly_legacy_weekly_migrated_v1'), false)
  b.setFailure(() => false)
  assert.equal(b.Storage.getHistory()[0].id, 'old-week')
  assert.equal(JSON.parse(b.data.get('punchly_history'))[0].id, 'old-week')
})

test('malformed and duplicate backup data is rejected before changing storage', () => {
  const b = browser({ punchly_history: '[]', punchly_settings: '{"displayName":"Existing"}' })
  const original = [...b.data]
  const invalid = structuredClone(example)
  invalid.history[0].punches.morningIn = 'not a time'
  assert.throws(() => b.Storage.importBackup(invalid, false), /not a supported/)
  assert.deepEqual([...b.data], original)
  const duplicate = structuredClone(example)
  duplicate.history.push({ ...duplicate.history[0], id: 'another-id' })
  assert.throws(() => b.Storage.importBackup(duplicate, false), /duplicate attendance dates/i)
  assert.deepEqual([...b.data], original)
  const badSettings = structuredClone(example)
  badSettings.settings.lunchLimit = '45'
  assert.throws(() => b.Storage.importBackup(badSettings, false), /not a supported/)
  assert.deepEqual([...b.data], original)
})

test('merge identifies existing attendance dates and keeps existing records', () => {
  const b = browser()
  b.Storage.importBackup(example, false)
  assert.equal(b.Storage.duplicateDates(example).length, example.history.filter(row => row.kind === 'daily').length)
  assert.equal(b.Storage.importBackup(example, true), 0)
  assert.equal(b.Storage.getHistory().length, example.history.length)
})

test('cached history refreshes after external changes and never exposes stale data after corruption', () => {
  const b = browser()
  b.Storage.importBackup(example, false)
  const original = example.history[0]
  assert.equal(b.Storage.getDaily(original.date).id, original.id)
  b.Storage.getHistory().pop()
  assert.equal(b.Storage.getHistory().length, example.history.length)
  b.data.set('punchly_history', JSON.stringify([{ ...original, notes: 'Changed in another tab' }]))
  assert.equal(b.Storage.getDaily(original.date).notes, 'Changed in another tab')
  b.data.set('punchly_history', '{broken')
  assert.equal(b.Storage.getDaily(original.date), undefined)
  assert.ok(b.Storage.diagnostics().issues.some(issue => issue.key === 'punchly_history'))
})

test('repeated daily lookups reuse validated history instead of revalidating every record', () => {
  const b = browser()
  b.Storage.importBackup(example, false)
  let validations = 0
  const original = b.Audit.valid
  b.Audit.valid = value => { validations++; return original(value) }
  b.Storage.getDaily(example.history[0].date)
  const first = validations
  assert.ok(first > 0)
  for (let i = 0; i < 10; i++) b.Storage.getDaily(example.history[0].date)
  assert.equal(validations, first)
})

test('corrupted history is reported and preserved rather than normalized or overwritten', () => {
  for (const raw of ['{broken', '[{"date":"2026-11-23","punches":{"morningIn":"bad"}}]', '[{"date":"2026-11-23","totalMinutes":"oops"}]']) {
    const b = browser({ punchly_history: raw })
    const state = b.Storage.diagnostics()
    assert.ok(state.issues.some(issue => issue.key === 'punchly_history'))
    assert.equal(b.Storage.saveRecord({ id: 'x', kind: 'daily', date: '2026-11-23' }), false)
    assert.equal(b.data.get('punchly_history'), raw)
    assert.equal(b.Storage.recoveryData().raw.punchly_history, raw)
    assert.throws(() => b.Storage.exportBackup(), /recovery/i)
  }
})

test('quota failure during replace restores original raw data', () => {
  const initial = { punchly_history: '[]', punchly_settings: '{"displayName":"Original"}', punchly_daily_drafts: '{}' }
  const b = browser(initial)
  let failed = false
  b.setFailure(key => key === 'punchly_daily_drafts' && !failed && (failed = true))
  assert.throws(() => b.Storage.importBackup(example, false), /storage is full.*original data was restored/i)
  for (const [key, value] of Object.entries(initial)) assert.equal(b.data.get(key), value)
  assert.equal(b.data.has('punchly_restore_recovery_v1'), false)
})

test('when automatic rollback fails the recovery copy remains available and can be restored later', () => {
  const initial = { punchly_history: '[]', punchly_settings: '{"displayName":"Original"}' }
  const b = browser(initial)
  b.setFailure(key => key === 'punchly_history')
  assert.throws(() => b.Storage.importBackup(example, false), /automatic recovery failed/i)
  assert.equal(b.Storage.recoveryData().raw.punchly_settings, initial.punchly_settings)
  b.setFailure(() => false)
  b.Storage.recoverPrevious()
  for (const [key, value] of Object.entries(initial)) assert.equal(b.data.get(key), value)
  assert.equal(b.data.has('punchly_restore_recovery_v1'), false)
})

test('quota errors creating a recovery copy prevent replacement and are reported on ordinary writes', () => {
  const b = browser({ punchly_history: '[]' })
  b.setFailure(key => key === 'punchly_restore_recovery_v1')
  assert.throws(() => b.Storage.importBackup(example, false), /storage is full/i)
  assert.equal(b.data.get('punchly_history'), '[]')
  b.setFailure(key => key === 'punchly_settings')
  assert.equal(b.Storage.saveSettings({}), false)
  assert.match(b.events.at(-1).detail, /storage is full/i)
})
