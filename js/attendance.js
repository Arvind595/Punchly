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
    if (entry?.mode === 'leave' || entry?.mode === 'holiday') return entry.mode;
    if (date > today) return Shift.nationalHoliday(date) ? 'holiday' : saturday || 'upcoming';
    const hasPunches = Shift.hasPunches(entry?.punches);
    if (entry?.mode === 'half' && hasPunches) return 'half';
    if (saturday) return saturday;
    if (!hasPunches) return 'no-punch';
    if (entry?.isDraft) return 'draft';
    if (entry?.complete) return 'completed';
    return 'incomplete';
  }

  function connect({ todayKey, localDateKey, entriesFor, openDay, describePunches, reserveLeave, cancelLeave }) {
    const byId = id => document.getElementById(id);
    const grid = byId('calendarDays');
    const next = byId('calendarNext');
    const previous = byId('calendarPrevious');
    const edit = byId('calendarEdit');
    const jumpMonth = byId('calendarJumpMonth');
    const jumpYear = byId('calendarJumpYear');
    const leaveForm = byId('calendarLeaveForm');
    const leaveNotes = byId('calendarLeaveNotes');
    const leaveButton = byId('calendarReserveLeave');
    const cancelButton = byId('calendarCancelLeave');
    const monthName = new Intl.DateTimeFormat(undefined, { month: 'long' });
    for (let index = 0; index < 12; index++) {
      const option = document.createElement('option');
      option.value = String(index + 1).padStart(2, '0');
      option.textContent = monthName.format(new Date(2020, index, 1, 12));
      jumpMonth.append(option);
    }
    let month;
    let selected;
    let entries;

    function showSelection() {
      const today = todayKey();
      const entry = entries.get(selected);
      const status = stateFor(selected, today, entry);
      const future = selected > today;
      const reserved = future && entry?.hasRecord && entry.mode === 'leave';
      const detail = Shift.isSaturday(status) ? (Shift.hasPunches(entry?.punches) ? ' · Worked' : ' · Scheduled holiday') : '';
      byId('calendarSelection').textContent = `${fullDate.format(asDate(selected))} · ${reserved ? 'Leave reserved' : labels[status]}${detail}`;
      const punches = entry?.mode ? describePunches(entry).join(' · ') : '';
      const punchLine = byId('calendarPunches');
      punchLine.hidden = !punches;
      punchLine.textContent = punches;
      const note = byId('calendarNotes');
      note.hidden = !entry?.notes;
      note.textContent = entry?.notes || '';
      Audit.show(byId('calendarAudit'), entry?.audit);
      edit.hidden = future;
      edit.lastChild.textContent = entry?.mode ? 'Open shift' : 'Log shift';
      leaveForm.hidden = !future || entry?.isDraft || (entry?.hasRecord && !reserved);
      if (!leaveForm.hidden) {
        leaveNotes.value = reserved ? entry.notes : '';
        leaveButton.textContent = reserved ? 'Update reservation' : 'Reserve leave';
        cancelButton.hidden = !reserved;
      }
      grid.querySelectorAll('button').forEach(button => {
        const active = button.dataset.date === selected;
        button.setAttribute('aria-pressed', String(active));
        button.tabIndex = active ? 0 : -1;
      });
    }

    function refresh() {
      const today = todayKey();
      const currentMonth = today.slice(0, 7);
      if (!month) month = currentMonth;
      if (selected?.slice(0, 7) !== month) selected = currentMonth === month ? today : `${month}-01`;
      const first = asDate(`${month}-01`);
      const last = new Date(first);
      last.setMonth(last.getMonth() + 1, 0);
      const dates = Array.from({ length: last.getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
      entries = new Map(entriesFor(dates).map(entry => [entry.date, entry]));
      byId('calendarMonth').textContent = monthTitle.format(first);
      jumpMonth.value = month.slice(5);
      jumpYear.value = Number(month.slice(0, 4));
      previous.disabled = month === '0001-01';
      next.disabled = month === '9999-12';

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
        const label = date > today && status === 'leave' ? 'Leave reserved' : labels[status];
        button.setAttribute('aria-label', `${fullDate.format(asDate(date))}, ${label}`);
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

    previous.addEventListener('click', () => moveMonth(-1));
    next.addEventListener('click', () => moveMonth(1));
    byId('calendarJump').addEventListener('submit', event => {
      event.preventDefault();
      month = `${jumpYear.valueAsNumber.toString().padStart(4, '0')}-${jumpMonth.value}`;
      refresh();
    });
    byId('calendarToday').addEventListener('click', () => {
      selected = todayKey();
      month = selected.slice(0, 7);
      refresh();
    });
    edit.addEventListener('click', () => { if (selected && selected <= todayKey()) openDay(selected); });
    leaveForm.addEventListener('submit', event => {
      event.preventDefault();
      if (reserveLeave(selected, leaveNotes.value.trim())) refresh();
    });
    cancelButton.addEventListener('click', () => {
      if (confirm('Cancel this leave reservation?') && cancelLeave(selected)) refresh();
    });
    grid.addEventListener('keydown', event => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (!step || !event.target.matches('.calendar-day')) return;
      event.preventDefault();
      const date = asDate(event.target.dataset.date);
      date.setDate(date.getDate() + step);
      if (date.getFullYear() < 1 || date.getFullYear() > 9999) return;
      selected = localDateKey(date);
      if (selected.slice(0, 7) !== month) {
        month = selected.slice(0, 7);
        refresh();
      } else {
        showSelection();
      }
      grid.querySelector('[aria-pressed="true"]')?.focus();
    });
    return { refresh };
  }

  return { connect, stateFor, labels };
})();
