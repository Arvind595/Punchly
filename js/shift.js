const Shift = (() => {
  const MINUTES_PER_DAY = 1440;
  const MAX_WORK_SEGMENT = 18 * 60;
  const fields = ['morningIn', 'lunchOut', 'lunchReturn', 'eveningOut'];
  const nationalHolidays = new Map([
    ['01-26', 'Republic Day'], ['08-15', 'Independence Day'], ['10-02', 'Gandhi Jayanti']
  ]);
  const labels = new Map([
    ['full', 'Full day'],
    ['half', 'Half day'],
    ['leave', 'Leave'],
    ['holiday', 'Holiday'],
    ['sat1', '1st Saturday'],
    ['sat3', '3rd Saturday']
  ]);

  function normalizeMode(mode) {
    return labels.has(mode) ? mode : 'full';
  }

  function dayPeriod(now) {
    const hour = now.getHours();
    if (hour < 5 || hour >= 20) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }

  function isDayOff(mode) {
    return mode === 'leave' || mode === 'holiday';
  }

  function label(mode) {
    return labels.get(normalizeMode(mode));
  }

  function saturdayMode(date) {
    if (!date || new Date(date + 'T12:00:00').getDay() !== 6) return null;
    const day = Number(date.slice(8));
    return day <= 7 ? 'sat1' : day >= 15 && day <= 21 ? 'sat3' : null;
  }

  function isSaturday(mode) {
    return mode === 'sat1' || mode === 'sat3';
  }

  function isSundayHoliday(date, workdays) {
    return !workdays.includes(0) && new Date(date + 'T12:00:00Z').getUTCDay() === 0;
  }

  function nationalHoliday(date) {
    return nationalHolidays.get(date.slice(5));
  }

  function nationalHolidayDates(start, end) {
    const dates = [];
    for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year++) {
      for (const day of nationalHolidays.keys()) {
        const date = String(year).padStart(4, '0') + '-' + day;
        if (date >= start && date <= end) dates.push(date);
      }
    }
    return dates;
  }

  function holidayNotes(value, date) {
    const name = nationalHoliday(date);
    const notes = String(value ?? '');
    if (!name || notes.split(/\r?\n/).some(line => line.trim() === name)) return notes;
    return [notes.trimEnd(), name].filter(Boolean).join('\n');
  }

  function hasPunches(punches) {
    return fields.some(field => parseTime(punches?.[field]) !== null);
  }

  function isHoliday(mode, punches) {
    return isDayOff(mode) || (isSaturday(mode) && !hasPunches(punches));
  }

  function saturdayNotes(value, date, worked) {
    const mode = saturdayMode(date);
    if (!mode) return String(value || '');
    const marker = label(mode) + ' worked';
    const notes = String(value || '').split('\n').filter(line => line.trim() !== marker).join('\n').trimEnd();
    return worked ? [notes, marker].filter(Boolean).join('\n') : notes;
  }

  function parseTime(value) {
    if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  function punchesForMode(punches, mode) {
    if (isDayOff(mode)) return {};
    const included = mode === 'half' ? ['morningIn', 'eveningOut'] : fields;
    return Object.fromEntries(included.map(field => [field, punches[field] || '']));
  }

  function measure({ mode, punches, baseTarget, lunchLimit, minimumLunch = false, now }) {
    const target = isHoliday(mode, punches) ? 0 : mode === 'half' ? Math.ceil(baseTarget / 2) : baseTarget;
    const result = {
      target, total: 0, extra: 0, lunch: null, lunchDeduction: null, lunchOpen: false, started: false, complete: false,
      targetOut: null, endDayOffset: 0, estimatedLunch: false, error: '', timeline: null
    };
    if (isDayOff(mode)) return result;

    const activePunches = punchesForMode(punches, mode);
    const times = fields.map(field => parseTime(activePunches[field]));
    if (times[0] === null) {
      if (times.some(time => time !== null)) result.error = 'Enter a start punch first.';
      return result;
    }
    if (times[1] === null && times[2] !== null) {
      result.error = 'Enter lunch out before lunch return.';
      return result;
    }
    if (times[1] !== null && times[2] === null && times[3] !== null) {
      result.error = 'Enter lunch return before the end punch.';
      return result;
    }

    let previous = times[0];
    const [start, lunchOut, lunchReturn, end] = times.map(time => {
      if (time === null) return null;
      const dayStart = previous - previous % MINUTES_PER_DAY;
      const absolute = dayStart + time;
      previous = absolute < previous ? absolute + MINUTES_PER_DAY : absolute;
      return previous;
    });
    if (previous - start >= MINUTES_PER_DAY) {
      result.error = 'A shift must be shorter than 24 hours. Check the punch order.';
      return result;
    }

    const firstSegment = (lunchOut ?? end ?? start) - start;
    const secondSegment = lunchReturn !== null && end !== null ? end - lunchReturn : 0;
    if (firstSegment > MAX_WORK_SEGMENT || secondSegment > MAX_WORK_SEGMENT) {
      result.error = 'A work segment cannot exceed 18 hours. Check the punch order.';
      return result;
    }

    result.started = true;
    result.complete = end !== null;
    result.endDayOffset = end !== null ? Math.floor(end / MINUTES_PER_DAY) : 0;
    result.total = firstSegment + secondSegment;
    const activeNow = now !== null && now >= start && now - start < MINUTES_PER_DAY ? now : null;
    result.timeline = { morningIn: start, lunchOut, lunchReturn, eveningOut: end, now: activeNow };
    if (!result.complete && activeNow !== null) {
      const activeStart = lunchReturn ?? (lunchOut === null ? start : null);
      if (activeStart !== null && activeNow >= activeStart) result.total += activeNow - activeStart;
    }
    if (lunchOut !== null) {
      result.lunchOpen = lunchReturn === null;
      result.lunch = Math.max(0, (lunchReturn ?? activeNow ?? lunchOut) - lunchOut);
    }
    // Reserve any unused part of the minimum, including before lunch is recorded.
    const enforceMinimum = minimumLunch && mode !== 'half';
    const recordedLunch = result.lunch ?? 0;
    const additionalDeduction = enforceMinimum ? Math.max(0, lunchLimit - recordedLunch) : 0;
    result.total = Math.max(0, result.total - additionalDeduction);
    result.lunchDeduction = enforceMinimum ? Math.max(lunchLimit, result.lunch ?? 0) : result.lunch;
    result.extra = target > 0 ? Math.max(0, result.total - target) : 0;
    if (target <= 0) return result;

    if (enforceMinimum) {
      const lunch = lunchOut === null ? lunchLimit : Math.max(lunchLimit, result.lunch ?? 0);
      result.targetOut = start + target + lunch;
      result.estimatedLunch = lunchOut !== null && lunchReturn === null;
    } else if (lunchOut !== null && firstSegment < target) {
      const projectedReturn = lunchReturn ?? Math.max(lunchOut + lunchLimit, activeNow ?? lunchOut);
      result.targetOut = projectedReturn + target - firstSegment;
      result.estimatedLunch = lunchReturn === null;
    } else {
      const planLunch = mode !== 'half' && lunchOut === null && end === null && lunchLimit > 0 && result.total < target;
      result.targetOut = start + target + (planLunch ? lunchLimit : 0);
      result.estimatedLunch = planLunch;
    }
    return result;
  }

  function recordStatus(record) {
    if (record.entryStatus) return record.entryStatus;
    if (record.kind === 'weekly') return 'Saved report';
    if (isDayOff(record.mode)) return label(record.mode);
    if (isSaturday(record.mode) && !hasPunches(record.punches) && !record.in && !record.out) return label(record.mode) + ' holiday';
    if (record.targetMet) return 'Target met';
    return record.out ? 'Below target' : 'In progress';
  }

  return { fields, label, normalizeMode, dayPeriod, isDayOff, isSaturday, saturdayMode, saturdayNotes, isSundayHoliday, nationalHoliday,
    nationalHolidayDates, holidayNotes, hasPunches, isHoliday, parseTime, punchesForMode, measure, recordStatus };
})();
