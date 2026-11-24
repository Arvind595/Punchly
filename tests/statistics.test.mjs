import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const context = {}
for (const name of ['shift', 'statistics', 'attendance']) runInNewContext(readFileSync(`js/${name}.js`, 'utf8'), context)
const Stats = runInNewContext('Statistics', context)
const Attendance = runInNewContext('Attendance', context)
const workdays = [1, 2, 3, 4, 5, 6]
const worked = (date, total = 480, target = 480) => ({ date, total, target, state: 'completed' })
const sum = model => model.rows.reduce((total, row) => total + (row.minutes ?? 0), 0)

test('attendance separates complete and incomplete punches from leave, holidays, and unscheduled dates', () => {
  const state = (date, fields = {}) => Stats.classify({ date, mode: 'full', ...fields }, workdays)
  assert.equal(state('2026-11-24', { punches: { morningIn: '09:00', eveningOut: '18:00' }, complete: true, total: 495 }), 'completed')
  assert.equal(state('2026-11-24', { punches: { morningIn: '09:00' }, total: 400 }), 'incomplete')
  assert.equal(state('2026-11-24', { punches: { eveningOut: '18:00' } }), 'incomplete')
  assert.equal(state('2026-11-24'), 'no-punch')
  assert.equal(state('2026-11-22'), 'holiday')
  assert.equal(Stats.classify({ date: '2026-11-28', mode: 'full' }, [1, 2, 3, 4, 5]), 'day-off')
  assert.equal(state('2026-11-24', { mode: 'leave' }), 'leave')
  assert.equal(state('2026-11-24', { mode: 'holiday' }), 'holiday')
  assert.equal(state('2026-11-21', { mode: 'sat3' }), 'holiday')
  assert.equal(state('2026-08-15'), 'holiday')
  assert.equal(state('2026-08-15', { punches: { morningIn: '09:00', eveningOut: '18:00' }, complete: true, total: 480 }), 'completed')
})

test('Sundays default to holidays while worked Sundays and explicitly scheduled Sundays use their usual states', () => {
  const sunday = '2026-11-22'
  const today = '2026-11-24'
  const workedSunday = { date: sunday, mode: 'full', complete: true, total: 480, punches: { morningIn: '09:00', eveningOut: '17:45' } }
  assert.equal(Attendance.stateFor(sunday, today, undefined, workdays), 'holiday')
  assert.equal(Attendance.stateFor('2026-11-29', today, undefined, workdays), 'holiday')
  assert.equal(Attendance.stateFor(sunday, today, workedSunday, workdays), 'completed')
  assert.equal(Stats.classify(workedSunday, workdays), 'completed')
  const workdaysWithSunday = [...workdays, 0]
  assert.equal(Attendance.stateFor(sunday, today, undefined, workdaysWithSunday), 'no-punch')
  assert.equal(Stats.classify({ date: sunday }, workdaysWithSunday), 'no-punch')
})

test('half days have their own breakdown category and count once toward hours, averages, and targets', () => {
  const half = { date: '2026-11-24', mode: 'half', complete: true, total: 250, target: 250,
    punches: { morningIn: '09:00', eveningOut: '13:10' } }
  half.state = Stats.classify(half, workdays)
  assert.equal(half.state, 'half')
  assert.equal(Stats.classify({ ...half, complete: false }, workdays), 'incomplete')
  const days = [worked('2026-11-23'), half]
  const summary = Stats.summarize(days)
  assert.equal(summary.counts.completed, 1)
  assert.equal(summary.counts.half, 1)
  assert.equal(summary.completed, 2)
  assert.equal(summary.total, 730)
  assert.equal(summary.average, 365)
  assert.equal(summary.met, 2)
  const chart = Stats.buckets(Stats.period('weekly', half.date), days)
  assert.equal(sum(chart), 730)
  assert.equal(chart.rows[1].average, 365)
})

test('worked metrics use completed shifts and only valid positive targets for achievement and overtime', () => {
  const result = Stats.summarize([
    worked('2026-11-02', 510, 480), worked('2026-11-03', 420, 480), worked('2026-11-09', 480, 0),
    { date: '2026-11-10', total: 100, target: 90, state: 'incomplete' },
    ...['leave', 'holiday', 'no-punch', 'day-off'].map(state => ({ date: '2026-11-11', total: 0, state })),
  ])
  assert.equal(result.total, 1410)
  assert.equal(result.average, 470)
  assert.equal(result.counts.completed, 3)
  assert.equal(result.counts.incomplete, 1)
  assert.equal(result.eligible, 2)
  assert.equal(result.met, 1)
  assert.equal(result.rate, .5)
  assert.equal(result.overtime, 30)
  assert.equal(result.longest.date, '2026-11-02')
  assert.equal(result.shortest.date, '2026-11-03')
  assert.equal(result.bestWeek.total, 930)
  assert.equal(result.worstWeek.date, '2026-11-09')
  assert.equal(result.highestOvertime.extra, 30)
  assert.equal(Stats.summarize([]).average, null)
  assert.equal(Stats.summarize([worked('2026-11-02', 480, NaN)]).rate, null)
})

test('week and month charts retain all calendar days and distinguish future days from zero work', () => {
  const week = Stats.period('weekly', '2026-11-25')
  const weekly = Stats.buckets(week, [worked('2026-11-23'), worked('2026-11-25', 360)], [worked('2026-11-22')])
  assert.equal(week.start, '2026-11-23')
  assert.equal(weekly.rows.length, 7)
  assert.equal(weekly.rows[0].average, 480)
  assert.equal(weekly.rows[1].minutes, 0)
  assert.equal(weekly.rows[3].minutes, null)
  assert.equal(sum(weekly), 840)
  const month = Stats.period('monthly', '2026-01-31')
  const days = Stats.datesBetween(month.start, month.end).map(day => worked(day))
  const monthly = Stats.buckets(month, days)
  assert.equal(monthly.rows.length, 31)
  assert.equal(sum(monthly), 31 * 480)
  assert.equal(monthly.rows[0].minutes, 480)
  assert.equal(Stats.buckets(Stats.period('monthly', '2024-02-29'), []).rows.length, 29)
})

test('year and all-time charts aggregate completed shifts into months or years', () => {
  const days = [worked('2025-01-10'), worked('2026-01-05'), worked('2026-01-06'), worked('2026-11-23'),
    { date: '2026-11-24', total: 120, state: 'incomplete' }]
  const current = Stats.buckets(Stats.period('yearly', '2026-11-24'), days.slice(1))
  assert.equal(current.rows.length, 12)
  assert.equal(current.rows[0].minutes, 960)
  assert.equal(current.rows[10].minutes, 480)
  assert.equal(current.rows[11].minutes, null)
  assert.equal(sum(current), 1440)
  const months = Stats.buckets(Stats.period('all', '2026-11-24', '2025-01-10'), days)
  assert.equal(months.grain, 'month')
  assert.equal(months.rows.length, 23)
  assert.equal(sum(months), 1920)
  const years = Stats.buckets(Stats.period('all', '2026-11-24', '2023-12-31'), days)
  assert.equal(years.grain, 'year')
  assert.deepEqual(Array.from(years.rows, row => row.minutes), [0, 0, 480, 1440])
})

test('previous periods compare the same elapsed days, falling back to the last valid date', () => {
  const prior = (range, today) => {
    const { start, end } = Stats.period(range, today).previous
    return [start, end]
  }
  assert.deepEqual(prior('weekly', '2026-11-25'), ['2026-11-16', '2026-11-18'])
  assert.deepEqual(prior('monthly', '2026-03-31'), ['2026-02-01', '2026-02-28'])
  assert.deepEqual(prior('monthly', '2026-03-15'), ['2026-02-01', '2026-02-15'])
  assert.deepEqual(prior('yearly', '2024-02-29'), ['2023-01-01', '2023-02-28'])
  assert.equal(Stats.period('all', '2026-11-24').previous, null)
})
