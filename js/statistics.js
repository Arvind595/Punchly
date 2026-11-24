const Statistics = (() => {
  const date = key => new Date(`${key}T12:00:00Z`);
  const key = value => value.toISOString().slice(0, 10);
  const daysInRange = (start, end) => (date(end) - date(start)) / 86400000 + 1;
  const monthsInRange = (start, end) => (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1;
  const shiftDate = (value, days) => {
    const next = date(value);
    next.setUTCDate(next.getUTCDate() + days);
    return key(next);
  };
  const monthAt = (value, offset) => {
    const next = date(value.slice(0, 7) + '-01');
    next.setUTCMonth(next.getUTCMonth() + offset);
    return key(next);
  };
  const weekStart = value => shiftDate(value, -((date(value).getUTCDay() + 6) % 7));
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
  const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const fullDay = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const fullMonth = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', timeZone: 'UTC' });
  const labels = { completed: 'Worked', half: 'Half day', leave: 'Leave', holiday: 'Holiday',
    incomplete: 'Incomplete', 'no-punch': 'No punch', 'day-off': 'Day off' };
  const isWorkedDay = state => state === 'completed' || state === 'half';

  function datesBetween(start, end) {
    const days = [];
    for (let day = start; day <= end; day = shiftDate(day, 1)) days.push(day);
    return days;
  }

  function period(range, today, first = today) {
    if (range === 'weekly') {
      const start = weekStart(today);
      return { range, start, end: shiftDate(start, 6), through: today,
        previous: { start: shiftDate(start, -7), end: shiftDate(today, -7) } };
    }
    if (range === 'monthly') {
      const start = monthAt(today, 0);
      const previous = monthAt(today, -1);
      const previousEnd = shiftDate(previous, Number(today.slice(8)) - 1);
      return { range, start, end: shiftDate(monthAt(today, 1), -1), through: today,
        previous: { start: previous, end: previousEnd < start ? previousEnd : shiftDate(start, -1) } };
    }
    if (range === 'yearly') {
      const year = Number(today.slice(0, 4));
      const previous = String(year - 1).padStart(4, '0');
      const priorDay = previous + today.slice(4);
      return { range, start: `${year}-01-01`, end: `${year}-12-31`, through: today,
        previous: { start: `${previous}-01-01`, end: key(date(priorDay)) === priorDay ? priorDay : `${previous}-02-28` } };
    }
    return { range, start: first, end: today, through: today, previous: null };
  }

  function customPeriod(start, end, today) {
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '0001-01-01' &&
      Number.isFinite(date(value).getTime()) && key(date(value)) === value;
    if (!validDate(start) || !validDate(end) || start > end || end > today) return null;
    const previousStart = shiftDate(start, -daysInRange(start, end));
    const previous = previousStart >= '0001-01-01' ? { start: previousStart, end: shiftDate(start, -1) } : null;
    return { range: 'custom', start, end, through: end, previous };
  }

  function chartGrain({ range, start, end }) {
    if (range === 'weekly' || range === 'monthly' || (range === 'custom' && daysInRange(start, end) <= 31)) return 'day';
    return monthsInRange(start, end) > 24 ? 'year' : 'month';
  }

  function classify(entry, workdays) {
    const punched = Shift.hasPunches(entry.punches);
    if (entry.mode === 'leave') return 'leave';
    if (entry.mode === 'holiday' || (!punched && (Shift.isSaturday(entry.mode) ||
        Shift.nationalHoliday(entry.date) || Shift.isSundayHoliday(entry.date, workdays)))) return 'holiday';
    if (punched) {
      if (!entry.complete || !Number.isFinite(entry.total)) return 'incomplete';
      return entry.mode === 'half' ? 'half' : 'completed';
    }
    return workdays.includes(date(entry.date).getUTCDay()) ? 'no-punch' : 'day-off';
  }

  function summarize(days) {
    const counts = Object.fromEntries(Object.keys(labels).map(state => [state, 0]));
    const weeks = new Map();
    let total = 0, overtime = 0, eligible = 0, met = 0;
    let longest, shortest, highestOvertime;
    for (const day of days) {
      counts[day.state]++;
      if (!isWorkedDay(day.state)) continue;
      total += day.total;
      if (!longest || day.total > longest.total) longest = day;
      if (!shortest || day.total < shortest.total) shortest = day;
      if (Number.isFinite(day.target) && day.target > 0) {
        eligible++;
        if (day.total >= day.target) met++;
        const extra = Math.max(0, day.total - day.target);
        overtime += extra;
        if (extra > (highestOvertime?.extra ?? 0)) highestOvertime = { date: day.date, extra };
      }
      const start = weekStart(day.date);
      weeks.set(start, (weeks.get(start) || 0) + day.total);
    }
    let bestWeek, worstWeek;
    for (const [start, minutes] of weeks) {
      if (!bestWeek || minutes > bestWeek.total) bestWeek = { date: start, total: minutes };
      if (!worstWeek || minutes < worstWeek.total) worstWeek = { date: start, total: minutes };
    }
    const completed = counts.completed + counts.half;
    return { counts, completed, total, overtime, eligible, met, rate: eligible ? met / eligible : null,
      average: completed ? Math.round(total / completed) : null,
      longest, shortest, bestWeek, worstWeek, highestOvertime };
  }

  function buckets(selection, days, trailing = days) {
    const { range, start, end, through } = selection;
    const grain = chartGrain(selection);
    const daily = grain === 'day';
    const yearly = grain === 'year';
    const bucketKey = value => value.slice(0, daily ? 10 : yearly ? 4 : 7);
    const completed = days.filter(day => isWorkedDay(day.state));
    const totals = new Map();
    for (const day of completed) {
      const id = bucketKey(day.date);
      totals.set(id, (totals.get(id) || 0) + day.total);
    }
    const byDate = new Map(trailing.filter(day => isWorkedDay(day.state)).map(day => [day.date, day.total]));
    const anchors = daily ? datesBetween(start, end) : yearly
      ? Array.from({ length: Number(end.slice(0, 4)) - Number(start.slice(0, 4)) + 1 }, (_, i) => String(Number(start.slice(0, 4)) + i).padStart(4, '0') + '-01-01')
      : Array.from({ length: monthsInRange(start, end) }, (_, i) => monthAt(start, i));
    const rows = anchors.map(anchor => {
      let average = null;
      if (daily && anchor <= through) {
        const recent = datesBetween(shiftDate(anchor, -6), anchor).filter(day => byDate.has(day));
        if (recent.length) average = recent.reduce((sum, day) => sum + byDate.get(day), 0) / recent.length;
      }
      const future = anchor > through;
      return { minutes: future ? null : totals.get(bucketKey(anchor)) || 0, average, future,
        label: daily ? dayLabel.format(date(anchor)) : yearly ? anchor.slice(0, 4) :
          range === 'yearly' ? monthLabel.format(date(anchor)) : `${monthLabel.format(date(anchor))} ${anchor.slice(0, 4)}`,
        description: daily ? fullDay.format(date(anchor)) : yearly ? anchor.slice(0, 4) : fullMonth.format(date(anchor)) };
    });
    return { grain, rows, states: days.map(day => day.state), hasWork: completed.length > 0 };
  }

  return { date, shiftDate, datesBetween, labels, isWorkedDay, period, customPeriod, chartGrain, classify, summarize, buckets };
})();
