const GuidedPunch = (() => {
  const steps = [
    ['morningIn', 'Morning in', 'Punch in now'],
    ['lunchOut', 'Lunch out', 'Punch out for lunch'],
    ['lunchReturn', 'Lunch return', 'Punch back in'],
    ['eveningOut', 'Evening out', 'Punch out now']
  ];

  function nextAction(shift) {
    if (Shift.isDayOff(shift.mode) || shift.result.error) return null;
    if (shift.result.complete) return shift.saved ? null : 'save';
    if (!shift.punches.morningIn) return 'morningIn';
    if (shift.mode === 'half') return 'eveningOut';
    if (!shift.punches.lunchOut) return 'lunchOut';
    if (!shift.punches.lunchReturn) return 'lunchReturn';
    return 'eveningOut';
  }

  function connect({ getShift, recordPunch, save, edit, formatDate, displayTime, formatDuration }) {
    const byId = id => document.getElementById(id);
    const list = byId('guidedSteps');
    const primary = byId('guidedNext');
    const skipLunch = byId('guidedSkipLunch');
    const status = byId('guidedStatus');
    let displayed;
    let lastAction = -Infinity;

    function refresh(now = new Date()) {
      const shift = getShift(now);
      const next = nextAction(shift);
      displayed = { date: shift.date, next };
      byId('guidedDate').textContent = formatDate(shift.date);
      const off = Shift.isDayOff(shift.mode);
      const noLunch = shift.result.complete && !shift.punches.lunchOut;
      const isHalf = shift.mode === 'half';
      const rows = off ? [] : steps.filter(([field]) => !(isHalf || noLunch) || !field.startsWith('lunch'));
      const line = shift.result.error ? `Review your punches in Today. ${shift.result.error}` :
        off ? `${Shift.label(shift.mode)} · No punches scheduled.` :
        shift.saved && shift.result.complete ? `Shift saved · ${formatDuration(shift.result.total)} worked.` :
        next === 'save' ? 'All punches are captured. Save the shift to add it to History.' :
        Shift.isSaturday(shift.mode) && next === 'morningIn' ? `${Shift.label(shift.mode)} holiday. Punch in if you are working.` :
        shift.overnight ? 'Continuing your overnight shift.' :
        next === 'morningIn' ? 'Start with your first punch. Each punch is saved as you go.' : 'Your punches are saved on this device.';
      if (status.textContent !== line) status.textContent = line;
      primary.hidden = !next;
      primary.textContent = next === 'save' ? 'Save shift' : steps.find(([field]) => field === next)?.[2] || '';
      skipLunch.hidden = next !== 'lunchOut';
      list.hidden = off;
      const items = rows.map(([field, label]) => {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = label;
        const time = document.createElement('strong');
        const captured = Shift.parseTime(shift.punches[field]);
        time.textContent = captured === null ? (field === next ? 'Next' : '—') :
          displayTime(captured) + (field === 'eveningOut' && shift.result.endDayOffset ? ' (+1 day)' : '');
        if (field === next) item.setAttribute('aria-current', 'step');
        if (captured !== null) item.className = 'guided-captured';
        item.append(name, time);
        return item;
      });
      list.replaceChildren(...items);
    }

    function advance(skip = false) {
      if (performance.now() - lastAction < 500) return;
      const now = new Date();
      const shift = getShift(now);
      const next = nextAction(shift);
      if (!displayed || displayed.date !== shift.date || displayed.next !== next || !next || (skip && next !== 'lunchOut')) {
        refresh();
        return;
      }
      lastAction = performance.now();
      if (next === 'save') save(shift.date);
      else recordPunch(shift.date, skip ? 'eveningOut' : next, now);
      refresh();
    }

    primary.addEventListener('click', () => advance());
    skipLunch.addEventListener('click', () => advance(true));
    byId('guidedEdit').addEventListener('click', () => edit(getShift(new Date()).date));
    return { refresh };
  }

  return { connect };
})();
