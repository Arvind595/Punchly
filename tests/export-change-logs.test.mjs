import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const at = '2026-11-23T09:30:00.000Z'
const record = {
  date: '2026-11-23', kind: 'daily', mode: 'full', totalMinutes: 480, targetMinutes: 480,
  punches: { morningIn: '09:00', eveningOut: '17:45' },
  audit: { createdAt: at, updatedAt: at, events: [{ at, changes: [{ field: 'morningIn', from: '', to: '09:00' }] }] },
}

function environment(includeLogs) {
  const downloads = []
  const drawn = []
  let workbook
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
    utils: {
      aoa_to_sheet: rows => ({ rows, A2: {}, '!ref': 'A1:Z2' }),
      book_new: () => ({ sheets: {} }),
      book_append_sheet(book, sheet, name) { book.sheets[name] = sheet },
    },
    writeFile(book) { workbook = book },
  }
  const ctx = {
    fillRect() {}, fillText(text) { drawn.push(text) }, measureText: text => ({ width: text.length * 8 }),
  }
  const canvas = { getContext: () => ctx, toDataURL: () => 'data:image/png;base64,AAAAAAAAAAAAAAAA' }
  const window = { XLSX: xlsx, getExportRecords: () => [record], showPunchlyToast() {} }
  const context = {
    window,
    document: {
      getElementById: id => elements[id],
      querySelector: () => ({ content: '29' }),
      createElement: type => type === 'canvas' ? canvas : { click() {} },
    },
    Shift: { fields: ['morningIn', 'lunchOut', 'lunchReturn', 'eveningOut'], recordStatus: () => 'Target met', label: () => 'Full day' },
    Audit: { labels: { morningIn: 'Morning in' }, punchedAt: audit => audit?.updatedAt || '', format: value => value, describe: () => 'Morning in changed' },
    Storage: { getSettings: () => ({}), profileDetails: () => ({ displayName: 'Demo' }), exportBackup: () => ({ settings: {}, history: [record] }) },
    AppTools: { modal: (id, close) => ({ open: () => queueMicrotask(() => elements.exportProfileForm.submit({ preventDefault() {} })), close }) },
    UiSounds: { feedback: () => () => {}, startLoading: () => () => {} },
    Charts: { exportChart: () => canvas },
    FormData: class { *[Symbol.iterator]() { yield ['displayName', 'Demo'] } },
    URL: { createObjectURL(blob) { downloads.push(blob); return 'blob:result' }, revokeObjectURL() {} },
    Blob, TextEncoder, Uint8Array, DataView, atob, Intl, setTimeout() {},
  }
  runInNewContext(readFileSync('js/export.js', 'utf8'), context)
  return { window, downloads, drawn, workbook: () => workbook }
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

    await env.window.exportVisibleExcel()
    const sheets = env.workbook().sheets
    assert.equal('Change log' in sheets, enabled)
    assert.equal(sheets.Timesheet.rows[0].includes('First logged (UTC)'), enabled)
    assert.ok('Export details' in sheets)

    await env.window.exportVisiblePDF()
    assert.equal(env.drawn.includes('Change log'), enabled)
    assert.ok(env.drawn.some(line => line.includes('Worked 8h 0m')))

    await env.window.exportChartPNG()
    const png = await env.downloads.at(-1).text()
    assert.equal(png.includes('changeLog'), enabled)
    assert.equal(png.includes(at), enabled)

    await env.window.downloadBackup()
    const backup = JSON.parse(await env.downloads.at(-1).text())
    assert.equal(backup.history[0].audit.events[0].at, at)
  })
}
