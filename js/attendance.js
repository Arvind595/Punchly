const Attendance = (() => {
  const labels = {
    completed: 'Completed workday', 'no-punch': 'No punch', leave: 'Leave', holiday: 'Holiday',
    sat1: '1st Saturday', sat3: '3rd Saturday', half: 'Half day', upcoming: 'Upcoming',
    incomplete: 'Incomplete shift', draft: 'Draft'
  };
  const asDate = date => new Date(`${date}T12:00:00`);
  const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
  const fullDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  function stateFor(date, today, entry) {
    const saturday = Shift.saturdayMode(date);
    if (date > today) return Shift.nationalHoliday(date) ? 'holiday' : saturday || 'upcoming';
    if (entry?.mode === 'leave' || entry?.mode === 'holiday') return entry.mode;
    const hasPunches = Shift.hasPunches(entry?.punches);
    if (entry?.mode === 'half' && hasPunches) return 'half';
    if (saturday) return saturday;
    if (!hasPunches) return 'no-punch';
    if (entry?.isDraft) return 'draft';
    if (entry?.complete) return 'completed';
    return 'incomplete';
  }

  function connect({ todayKey, localDateKey, entriesFor, openDay, describePunches }) {
    const byId = id => document.getElementById(id);
    const grid = byId('calendarDays');
    const next = byId('calendarNext');
    const edit = byId('calendarEdit');
    let month;
    let selected;
    let entries;

    function showSelection() {
      const today = todayKey();
      const entry = entries.get(selected);
      const status = stateFor(selected, today, entry);
      const detail = Shift.isSaturday(status) ? (Shift.hasPunches(entry?.punches) ? ' · Worked' : ' · Scheduled holiday') : '';
      byId('calendarSelection').textContent = `${fullDate.format(asDate(selected))} · ${labels[status]}${detail}`;
      const punches = entry?.mode ? describePunches(entry).join(' · ') : '';
      const punchLine = byId('calendarPunches');
      punchLine.hidden = !punches;
      punchLine.textContent = punches;
      const note = byId('calendarNotes');
      note.hidden = !entry?.notes;
      note.textContent = entry?.notes || '';
      Audit.show(byId('calendarAudit'), entry?.audit);
      edit.hidden = selected > today;
      edit.lastChild.textContent = entry?.mode ? 'Open shift' : 'Log shift';
      grid.querySelectorAll('button').forEach(button => {
        const active = button.dataset.date === selected;
        button.setAttribute('aria-pressed', String(active));
        button.tabIndex = active ? 0 : -1;
      });
    }

    function refresh() {
      const today = todayKey();
      const currentMonth = today.slice(0, 7);
      if (!month || month > currentMonth) month = currentMonth;
      if (selected?.slice(0, 7) !== month) selected = currentMonth === month ? today : `${month}-01`;
      const first = asDate(`${month}-01`);
      const last = new Date(first);
      last.setMonth(last.getMonth() + 1, 0);
      const dates = Array.from({ length: last.getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
      entries = new Map(entriesFor(dates).map(entry => [entry.date, entry]));
      byId('calendarMonth').textContent = monthTitle.format(first);
      next.disabled = month === currentMonth;

      const fragment = document.createDocumentFragment();
      for (let i = 0; i < (first.getDay() + 6) % 7; i++) {
        const spacer = document.createElement('span');
        spacer.setAttribute('aria-hidden', 'true');
        fragment.append(spacer);
      }
      for (const date of dates) {
        const status = stateFor(date, today, entries.get(date));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'calendar-day';
        button.dataset.date = date;
        button.dataset.attendance = status;
        button.textContent = String(Number(date.slice(8)));
        button.setAttribute('aria-label', `${fullDate.format(asDate(date))}, ${labels[status]}`);
        if (date === today) button.setAttribute('aria-current', 'date');
        button.addEventListener('click', () => { selected = date; showSelection(); });
        fragment.append(button);
      }
      grid.replaceChildren(fragment);
      showSelection();
    }

    function moveMonth(offset) {
      const first = asDate(`${month}-01`);
      first.setMonth(first.getMonth() + offset);
      month = localDateKey(first).slice(0, 7);
      refresh();
    }

    byId('calendarPrevious').addEventListener('click', () => moveMonth(-1));
    next.addEventListener('click', () => moveMonth(1));
    edit.addEventListener('click', () => { if (selected && selected <= todayKey()) openDay(selected); });
    grid.addEventListener('keydown', event => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (!step || !event.target.matches('.calendar-day')) return;
      event.preventDefault();
      const buttons = [...grid.querySelectorAll('.calendar-day')];
      const day = buttons[buttons.indexOf(event.target) + step];
      if (!day) return;
      selected = day.dataset.date;
      showSelection();
      day.focus();
    });
    return { refresh };
  }

  return { connect, stateFor, labels };
})();
