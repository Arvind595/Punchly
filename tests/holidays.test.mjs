import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const calendar = {
  schemaVersion: 1,
  years: {
    2027: {
      approval: { by: 'Calendar owner', date: '2026-11-25' },
      holidays: [{ date: '2027-03-22', name: 'Regional festival' }],
      optionalLeaves: [{ date: '2027-04-14', name: 'Optional festival' }],
    },
  },
}

function browser() {
  const memory = new Map()
  let payload = calendar
  const context = {
    location: { protocol: 'https:' }, AbortSignal,
    fetch: async () => ({ ok: true, text: async () => JSON.stringify(payload) }),
    localStorage: { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) },
  }
  for (const name of ['shift', 'holidays', 'attendance']) runInNewContext(readFileSync(`js/${name}.js`, 'utf8'), context)
  return { ...runInNewContext('({ Shift, Holidays, Attendance })', context), setPayload: data => { payload = data } }
}

test('repository holiday calendar validates and overrides only its listed years', async () => {
  const { Shift, Holidays, Attendance } = browser()
  const published = JSON.parse(readFileSync('config/holidays.json', 'utf8'))
  Holidays.validate(published)
  const feed = Holidays.connect(() => {})
  await feed.refresh(true)
  assert.equal(Shift.nationalHoliday('2027-03-22'), 'Regional festival')
  assert.equal(Shift.nationalHoliday('2027-01-26'), undefined)
  assert.equal(Shift.nationalHoliday('2028-01-26'), 'Republic Day')
  assert.equal(Shift.holidaysForYear('2027').approval.by, 'Calendar owner')
  assert.deepEqual(Array.from(Shift.nationalHolidayDates('2027-03-01', '2027-04-30')), ['2027-03-22'])
  assert.equal(Attendance.stateFor('2027-04-14', '2027-02-01', null, [1, 2, 3, 4, 5]), 'optional')
  assert.equal(Attendance.stateFor('2027-04-14', '2027-04-15', { mode: 'leave' }, [1, 2, 3, 4, 5]), 'leave')
  assert.equal(Shift.recordStatus({ date: '2027-03-22', kind: 'daily', in: '08:00', out: '17:00', targetMet: true }), 'Worked on holiday · Target met')
})

test('holiday refresh retains the last validated calendar when the next update is invalid', async () => {
  const { Shift, Holidays, setPayload } = browser()
  let changes = 0
  const feed = Holidays.connect(() => { changes++ })
  await feed.refresh(true)
  const invalid = structuredClone(calendar)
  invalid.years[2027].optionalLeaves.push({ date: '2027-03-22', name: 'Duplicate' })
  setPayload(invalid)
  assert.throws(() => Holidays.validate(invalid), /duplicate/)
  await feed.refresh(true)
  assert.equal(changes, 1)
  assert.equal(Shift.nationalHoliday('2027-03-22'), 'Regional festival')
})
