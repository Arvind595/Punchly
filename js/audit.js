const Audit = (() => {
  const labels = {
    morningIn: 'Morning in', lunchOut: 'Lunch out', lunchReturn: 'Lunch return', eveningOut: 'Evening out',
    mode: 'Day type', target: 'Work target (minutes)', notes: 'Notes', title: 'Report title',
    schedule: 'Weekly schedule', rounding: 'Rounding'
  };

  function track(audit, before, after, now = new Date(), editingNotes = false) {
    const changes = Object.keys(after).flatMap(field => {
      const from = String(before[field] ?? '');
      const to = String(after[field] ?? '');
      return from === to ? [] : [{ field, from, to }];
    });
    if (!changes.length) return audit;
    const at = now.toISOString();
    const events = [...(audit?.events || [])];
    const last = events[events.length - 1];
    const lastChange = last?.changes[0];
    if (editingNotes && changes.length === 1 && changes[0].field === 'notes' &&
        last?.changes.length === 1 && lastChange.field === 'notes' &&
        Date.parse(at) - Date.parse(last.at) < 1500) {
      const { from } = lastChange;
      const { to } = changes[0];
      events.pop();
      if (from !== to) events.push({ at, changes: [{ field: 'notes', from, to }] });
    } else {
      events.push({ at, changes });
    }
    if (!events.length) return undefined;
    return { createdAt: events[0].at, updatedAt: events[events.length - 1].at, events };
  }

  function format(at) {
    const date = new Date(at);
    return at && Number.isFinite(date.getTime()) ? date.toLocaleString() : '';
  }

  function punchedAt(audit, field, value) {
    if (!value) return '';
    const events = audit?.events || [];
    for (let i = events.length - 1; i >= 0; i--) {
      const change = events[i].changes.find(item => item.field === field);
      if (change) return change.to === value ? events[i].at : '';
    }
    return '';
  }

  function describe(change) {
    const label = labels[change.field] || change.field;
    if (change.field === 'schedule' || change.field === 'notes') return `${label} updated`;
    const value = item => (change.field === 'mode' && item ? Shift.label(item) : item) || '—';
    return `${label} ${value(change.from)} → ${value(change.to)}`;
  }

  function show(details, audit) {
    const existing = details.querySelector('ol');
    if (existing) existing.remove();
    details.hidden = !audit?.events.length;
    if (details.hidden) return;
    details.querySelector('summary').textContent = `Change log · ${format(audit.updatedAt)}`;
    const list = document.createElement('ol');
    for (const event of [...audit.events].reverse()) {
      const item = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = event.at;
      time.textContent = format(event.at);
      item.append(time, ' · ' + event.changes.map(describe).join(' · '));
      list.append(item);
    }
    details.append(list);
  }

  function valid(audit) {
    const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
    return audit == null || (date(audit.createdAt) && date(audit.updatedAt) && Array.isArray(audit.events) &&
      audit.events.every(event => event && date(event.at) && Array.isArray(event.changes) &&
        event.changes.every(change => change && Object.prototype.hasOwnProperty.call(labels, change.field) &&
          typeof change.from === 'string' && typeof change.to === 'string')));
  }

  return { track, format, punchedAt, describe, show, valid, labels };
})();
