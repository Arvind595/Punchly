import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const XLSX = createRequire(import.meta.url)('../vendor/xlsx-0.20.3.mini.js')

const at = '2026-11-23T09:30:00.000Z'
const record = {
  date: '2026-11-23', kind: 'daily', mode: 'full', totalMinutes: 480, targetMinutes: 480,
  notes: 'Client visit',
  punches: { morningIn: '09:00', eveningOut: '17:45' },
  audit: { createdAt: at, updatedAt: at, events: [{ at, changes: [{ field: 'morningIn', from: '', to: '09:00' }] }] },
}

function environment(includeLogs, initialSettings = { displayName: 'Demo', profileNameSource: 'user' }) {
  const downloads = []
  const names = []
  const drawn = []
  let workbook
  let prompts = 0
  let settings = { ...initialSettings }
  const elements = {
    exportChangeLogs: { checked: includeLogs },
    exportExcel: { disabled: false, setAttribute() {}, removeAttribute() {} },
    exportStatus: {},
    exportProfileForm: {
      elements: { displayName: {} },
      addEventListener(name, handler) { this[name] = handler },
    },
  }
  const xlsx = {
    utils: XLSX.utils,
    writeFile(book, name) { workbook = book; names.push(name) },
  }
  const ctx = {
    fillRect() {}, fillText(text) { drawn.push(text) }, measureText: text => ({ width: text.length * 8 }),
  }
  const canvas = { getContext: () => ctx, toDataURL: () => 'data:image/png;base64,AAAAAAAAAAAAAAAA' }
  const window = { XLSX: xlsx, getExportRecords: () => [record], showPunchlyToast() {}, dispatchEvent() {} }
  const context = {
    window,
    document: {
      getElementById: id => elements[id],
      querySelector: () => ({ content: '30' }),
      createElement: type => type === 'canvas' ? canvas : { click() { names.push(this.download) } },
    },
    Shift: { fields: ['morningIn', 'lunchOut', 'lunchReturn', 'eveningOut'], recordStatus: () => 'Target met', label: () => 'Full day' },
    Audit: { labels: { morningIn: 'Morning in' }, punchedAt: audit => audit?.updatedAt || '', format: value => value, describe: () => 'Morning in changed' },
    Storage: { getSettings: () => settings, saveSettings: value => { settings = value; return true },
      profileDetails: value => ({ displayName: value.displayName || '' }), exportBackup: () => ({ settings, history: [record] }),
      validateBackup() {}, markBackup: () => true },
    Setup: { isDeviceProfile: async value => !value.displayName || value.profileNameSource === 'device' },
    AppTools: { modal: (id, close) => ({ open: () => { prompts++; queueMicrotask(() => elements.exportProfileForm.submit({ preventDefault() {} })) }, close }) },
    UiSounds: { feedback: () => () => {}, startLoading: () => () => {}, play() {} },
    Charts: { exportChart: () => canvas },
    FormData: class { *[Symbol.iterator]() { yield ['displayName', 'Entered Name'] } },
    URL: { createObjectURL(blob) { downloads.push(blob); return 'blob:result' }, revokeObjectURL() {} },
    Blob, TextEncoder, Uint8Array, DataView, Event, atob, Intl, setTimeout() {},
  }
  runInNewContext(readFileSync('js/export.js', 'utf8'), context)
  return { window, downloads, names, drawn, workbook: () => workbook, prompts: () => prompts, settings: () => settings }
}

for (const enabled of [true, false]) {
  test(`report exports ${enabled ? 'include' : 'omit'} change logs and audit timestamps`, async () => {
    const env = environment(enabled)
    await env.window.exportVisibleCSV()
    const csv = await env.downloads.at(-1).text()
    assert.equal(csv.includes('Change log (JSON)'), enabled)
    assert.equal(csv.includes('First logged (UTC)'), enabled)
    assert.equal(csv.includes(at), enabled)
    assert.ok(csv.includes('09:00'))
    assert.ok(csv.includes('User notes: Client visit'))
    assert.match(env.names.at(-1), /^Punchly_v30_history_\d{4}-\d{2}-\d{2}\.csv$/)

    await env.window.exportVisibleExcel()
    const { SheetNames, Sheets: sheets } = env.workbook()
    assert.match(env.names.at(-1), /^Punchly_v30_history_\d{4}-\d{2}-\d{2}\.xlsx$/)
    assert.equal('Change log' in sheets, enabled)
    const header = XLSX.utils.sheet_to_json(sheets.Timesheet, { header: 1 }).find(row => row[0] === 'Date')
    assert.equal(header.includes('First logged (UTC)'), enabled)
    assert.deepEqual(SheetNames, enabled ? ['Timesheet', 'Change log'] : ['Timesheet'])

    await env.window.exportVisiblePDF()
    assert.match(env.names.at(-1), /^Punchly_v30_timesheet_\d{4}-\d{2}-\d{2}\.pdf$/)
    assert.equal(env.drawn.includes('Change log'), enabled)
    assert.ok(env.drawn.some(line => line.includes('Worked 8h 0m')))
    assert.ok(env.drawn.some(line => line.includes('User notes: Client visit')))

    await env.window.exportChartPNG()
    assert.match(env.names.at(-1), /^Punchly_v30_chart_\d{4}-\d{2}-\d{2}\.png$/)
    const png = await env.downloads.at(-1).text()
    assert.equal(png.includes('changeLog'), enabled)
    assert.equal(png.includes(at), enabled)

    await env.window.downloadBackup()
    assert.match(env.names.at(-1), /^Punchly_v30_backup_\d{4}-\d{2}-\d{2}\.json$/)
    const backup = JSON.parse(await env.downloads.at(-1).text())
    assert.equal(backup.history[0].audit.events[0].at, at)
    assert.equal(env.prompts(), 0)
  })
}

test('an automatic device name prompts once and saves the entered profile for later exports', async () => {
  const env = environment(true, { displayName: 'Windows PC', profileNameSource: 'device' })
  await env.window.exportVisibleCSV()
  assert.equal(env.prompts(), 1)
  assert.equal(env.settings().displayName, 'Entered Name')
  assert.equal(env.settings().profileNameSource, 'user')
  await env.window.downloadPunchlySettings()
  assert.equal(env.prompts(), 1)
  assert.match(env.names.at(-1), /^Punchly_v30_settings_\d{4}-\d{2}-\d{2}\.json$/)
})
