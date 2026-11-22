const GuidedPunch = (() => {
  const steps = [
    ['morningIn', 'Morning in', 'Punch in now', 'login'],
    ['lunchOut', 'Lunch out', 'Punch out for lunch', 'lunch_dining'],
    ['lunchReturn', 'Lunch return', 'Punch back in', 'login'],
    ['eveningOut', 'Evening out', 'Punch out now', 'logout']
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
    const actionIcon = byId('guidedActionIcon');
    const actionLabel = byId('guidedActionLabel');
    const dial = byId('guidedDial');
    const done = byId('guidedDialDone');
    const metrics = byId('guidedMetrics');
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
      if (next) {
        const step = steps.find(([field]) => field === next);
        const icon = step?.[3] || 'save';
        if (actionIcon.dataset.icon !== icon) {
          actionIcon.dataset.icon = icon;
          Icons.draw(actionIcon, icon);
        }
        actionLabel.textContent = step?.[2] || 'Save shift';
      }
      done.hidden = Boolean(next);
      done.textContent = off ? Shift.label(shift.mode) : shift.result.error ? 'Review punches' : 'Shift complete';
      dial.dataset.stage = next || (shift.result.complete ? 'complete' : 'off');
      const progress = shift.result.target > 0 ? Math.min(100, shift.result.total * 100 / shift.result.target) : 0;
      dial.style.setProperty('--dial-progress', `${progress}%`);
      const target = shift.result.targetOut;
      const values = shift.result.started ? [
        `${formatDuration(shift.result.total)} worked`,
        !shift.result.complete && target !== null && `Target out ${displayTime(target % 1440)}${target >= 1440 ? ' (+1 day)' : ''}`
      ].filter(Boolean) : [];
      metrics.textContent = values.join(' · ');
      metrics.hidden = !values.length;
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
        const detail = document.createElement('span');
        detail.className = 'guided-punch-time';
        detail.append(time);
        const stamp = Audit.punchedAt(shift.audit, field, shift.punches[field]);
        if (stamp) {
          const recorded = document.createElement('time');
          recorded.dateTime = stamp;
          recorded.textContent = 'Logged ' + Audit.format(stamp);
          detail.append(recorded);
        }
        item.append(name, detail);
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
