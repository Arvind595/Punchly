const Holidays = (() => {
  const cacheKey = 'punchly_holiday_calendar_v1';
  const refreshInterval = 15 * 60000;
  const file = 'config/holidays.json';
  const maxLength = 262144;
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= '0001-01-01' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const validName = (value, limit) => typeof value === 'string' && value.trim().length > 0 &&
    value.length <= limit && !/[\r\n\t]/.test(value);

  function validate(data) {
    if (data?.schemaVersion !== 1 || !isObject(data.years)) throw new Error('Expected a version 1 holiday calendar with years.');
    const years = new Map();
    for (const [year, schedule] of Object.entries(data.years)) {
      if (!/^[1-9]\d{3}$/.test(year) || !isObject(schedule)) throw new Error(`Invalid holiday year: ${year}`);
      const { approval = null, holidays, optionalLeaves } = schedule;
      if (approval !== null && (!isObject(approval) || !validName(approval.by, 100) || !validDate(approval.date))) {
        throw new Error(`Invalid approval for ${year}.`);
      }
      const usedDates = new Set();
      const validateDates = entries => {
        if (!Array.isArray(entries)) throw new Error(`Missing date list for ${year}.`);
        const result = new Map();
        for (const entry of entries) {
          if (!validDate(entry?.date) || entry.date.slice(0, 4) !== year || !validName(entry.name, 100) || usedDates.has(entry.date)) {
            throw new Error(`Invalid or duplicate date in the ${year} calendar.`);
          }
          usedDates.add(entry.date);
          result.set(entry.date, entry.name.trim());
        }
        return new Map([...result].sort(([a], [b]) => a.localeCompare(b)));
      };
      years.set(year, { approval, holidays: validateDates(holidays), optionalLeaves: validateDates(optionalLeaves) });
    }
    return years;
  }

  function connect(onChange) {
    let current;
    let pending;
    let lastCheck = 0;

    function apply(raw) {
      if (!raw || raw === current) return false;
      if (raw.length > maxLength) throw new Error('Holiday calendar is too large.');
      Shift.setHolidayCalendar(validate(JSON.parse(raw)));
      current = raw;
      return true;
    }

    try { apply(localStorage.getItem(cacheKey)); } catch {}

    function refresh(force = false) {
      if (pending || !['http:', 'https:'].includes(location.protocol) ||
          (!force && Date.now() - lastCheck < refreshInterval)) return pending;
      lastCheck = Date.now();
      pending = (async () => {
        try {
          const response = await fetch(file, { cache: 'no-cache', signal: AbortSignal.timeout(5000) });
          if (response.ok && apply(await response.text())) {
            try { localStorage.setItem(cacheKey, current); } catch {}
            onChange();
          }
        } catch {
          // Keep the last validated calendar when offline or when a new file is malformed.
        }
      })().finally(() => { pending = null; });
      return pending;
    }

    return { refresh };
  }

  return { validate, connect };
})();
