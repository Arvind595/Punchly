import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const XLSX = require('../vendor/xlsx-0.20.3.mini.js')
const backup = JSON.parse(readFileSync('test-data/Punchly_v18_test_backup.json', 'utf8'))

function csvRows(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++ }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(cell); cell = '' }
    else if (char === '\n' && !quoted) { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (char !== '\r' || quoted) cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

function environment() {
  const values = new Map()
  const blobs = []
  const lines = []
  let workbookBytes
  const nodes = { exportChangeLogs: { checked: true }, exportExcel: { setAttribute() {}, removeAttribute() {} }, exportStatus: {} }
  const png = readFileSync('assets/icon-192.png').toString('base64')
  const jpeg = readFileSync('assets/punch-countryside.jpg').toString('base64')
  const canvas = { getContext: () => ({ fillRect() {}, fillText: text => lines.push(text), measureText: value => ({ width: value.length * 7 }) }),
    toDataURL: type => `data:${type};base64,${type === 'image/jpeg' ? jpeg : png}` }
  const context = {
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) },
    console, Blob, TextEncoder, Uint8Array, DataView, atob, Intl, Event, setTimeout() {},
    URL: { createObjectURL: blob => { blobs.push(blob); return 'blob:report' }, revokeObjectURL() {} },
    document: { getElementById: id => nodes[id], querySelector: () => ({ content: '30' }),
      createElement: type => type === 'canvas' ? canvas : { click() {} } },
    window: { dispatchEvent() {}, showPunchlyToast() {}, XLSX: { ...XLSX, writeFile: book => { workbookBytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) } } },
    UiSounds: { feedback: () => () => {}, startLoading: () => () => {}, play() {} },
    Setup: { isDeviceProfile: async () => false }, Charts: { exportChart: () => canvas },
  }
  for (const name of ['shift', 'audit', 'storage']) runInNewContext(readFileSync(`js/${name}.js`, 'utf8'), context)
  runInNewContext('this.Storage = Storage', context)
  context.Storage.importBackup(backup, false)
  context.window.getExportRecords = () => context.Storage.getHistory().slice(0, 2)
  runInNewContext(readFileSync('js/export.js', 'utf8'), context)
  return { context, blobs, lines, workbook: () => workbookBytes }
}

test('CSV and Excel reports can be read back with their records and change logs', async () => {
  const e = environment()
  await e.context.window.exportVisibleCSV()
  const rows = csvRows(await e.blobs.at(-1).text())
  assert.equal(rows.length, 3)
  assert.equal(rows[1][0], backup.history[0].date)
  assert.ok(rows[1][rows[0].indexOf('Notes')].includes(backup.history[0].notes))
  assert.equal(JSON.parse(rows[1][rows[0].indexOf('Change log (JSON)')])[0].at, backup.history[0].audit.events[0].at)
  await e.context.window.exportVisibleExcel()
  const book = XLSX.read(e.workbook(), { type: 'buffer', cellDates: true })
  assert.deepEqual(book.SheetNames, ['Timesheet', 'Change log', 'Export details'])
  const sheet = XLSX.utils.sheet_to_json(book.Sheets.Timesheet, { defval: '' })
  assert.equal(sheet.length, 2)
  assert.equal(sheet[0]['Total minutes'], backup.history[0].totalMinutes)
  assert.ok(sheet[0]['Date'] instanceof Date)
  assert.ok(XLSX.utils.sheet_to_json(book.Sheets['Change log']).length > 0)
})

test('PNG metadata and PDF container survive report export', async () => {
  const e = environment()
  await e.context.window.exportChartPNG()
  const png = Buffer.from(await e.blobs.at(-1).arrayBuffer())
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  let offset = 8, found = false
  while (offset + 12 <= png.length) {
    const size = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8)
    const payload = png.subarray(offset + 8, offset + 8 + size)
    if (type === 'iTXt' && payload.toString().includes('Punchly Export')) {
      assert.ok(payload.toString().includes('changeLog'))
      assert.ok(payload.toString().includes(backup.history[0].date))
      found = true
    }
    offset += size + 12
    if (type === 'IEND') break
  }
  assert.equal(found, true)
  assert.equal(offset, png.length)
  await e.context.window.exportVisiblePDF()
  const pdf = Buffer.from(await e.blobs.at(-1).arrayBuffer())
  assert.ok(pdf.subarray(0, 8).toString().startsWith('%PDF-1.4'))
  assert.match(pdf.subarray(-256).toString(), /startxref\n\d+\n%%EOF/)
  assert.ok(e.lines.some(line => line.includes('User notes:')))
})

test('downloaded JSON backup can be parsed, validated, and restored', async () => {
  const e = environment()
  await e.context.window.downloadBackup()
  const exported = JSON.parse(await e.blobs.at(-1).text())
  e.context.Storage.validateBackup(exported)
  assert.equal(exported.history.length, backup.history.length)
  assert.equal(e.context.Storage.lastBackup() !== '', true)
  assert.equal(e.context.Storage.importBackup(exported, false), backup.history.length)
})
