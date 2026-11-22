const GuidedPunch = (() => {
  const steps = [
    ['morningIn', 'Morning in', 'Punch in now', 'login'],
    ['lunchOut', 'Lunch out', 'Punch out for lunch', 'lunch_dining'],
    ['lunchReturn', 'Lunch return', 'Punch back in', 'login'],
    ['eveningOut', 'Evening out', 'Punch out now', 'logout']
  ];

  function dayPeriod(now) {
    const hour = now.getHours();
    if (hour < 5 || hour >= 20) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }

  function nextAction(shift) {
    if (Shift.isDayOff(shift.mode) || shift.result.error) return null;
    if (shift.result.complete) return shift.saved ? null : 'save';
    if (!shift.punches.morningIn) return 'morningIn';
    if (shift.mode === 'half') return 'eveningOut';
    if (!shift.punches.lunchOut) return 'lunchOut';
    if (!shift.punches.lunchReturn) return 'lunchReturn';
    return 'eveningOut';
  }

  function planShift(shift) {
    if (shift.result.error || !shift.result.target) return null;
    const start = shift.result.timeline?.morningIn ?? 0;
    const lunch = shift.mode === 'half' ? 0 : shift.lunchLimit;
    const breakStart = start + Math.floor(shift.result.target / 2);
    return {
      morningIn: start,
      lunchOut: lunch ? breakStart : null,
      lunchReturn: lunch ? breakStart + lunch : null,
      eveningOut: start + shift.result.target + lunch
    };
  }

  function timelineTime(time, displayTime) {
    const days = Math.floor(time / 1440);
    return displayTime(time % 1440) + (days ? ` (+${days} ${days === 1 ? 'day' : 'days'})` : '');
  }

  function paintTimeline(group, plan, recorded, estimate) {
    if (!plan) {
      group.replaceChildren();
      return;
    }
    const first = plan.morningIn;
    const elapsed = recorded ? recorded.eveningOut ??
      Math.max(recorded.now ?? first, recorded.lunchReturn ?? recorded.lunchOut ?? first) : first;
    // Leave room beyond planned checkout and rescale if overtime extends past it.
    const minutes = Math.max((plan.eveningOut - first) / .875, (Math.max(elapsed, estimate ?? first) - first) / .95);
    const fragment = document.createDocumentFragment();

    function point(time, radius) {
      const angle = (time - first) / minutes * Math.PI * 2;
      return [132 + Math.sin(angle) * radius, 132 - Math.cos(angle) * radius];
    }

    function draw(tag, kind, punch, attributes) {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
      element.setAttribute('class', tag === 'path' ? 'punch-arc' : 'punch-tick');
      element.setAttribute('data-kind', kind);
      if (punch) element.setAttribute('data-punch', punch);
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
      fragment.append(element);
    }

    function arc(from, to, punch, kind) {
      if (from === null || to === null || to <= from) return;
      const start = point(from, 110);
      const end = point(to, 110);
      const large = Number(to - from > minutes / 2);
      draw('path', kind, punch, { d: `M ${start.join(' ')} A 110 110 0 ${large} 1 ${end.join(' ')}` });
    }

    function stages(times, end, kind) {
      arc(times.morningIn, times.lunchOut ?? end, 'morningIn', kind);
      arc(times.lunchOut, times.lunchReturn ?? end, 'lunchOut', kind);
      arc(times.lunchReturn, end, 'lunchReturn', kind);
    }

    function marker(time, kind, punch, radii) {
      if (time === null) return;
      const [x1, y1] = point(time, radii[0]);
      const [x2, y2] = point(time, radii[1]);
      draw('line', kind, punch, { x1, y1, x2, y2 });
    }

    stages(plan, plan.eveningOut, 'planned');
    if (recorded) stages(recorded, elapsed, 'recorded');
    for (const field of Shift.fields) {
      marker(plan[field], 'planned', field, [121, 130]);
      if (recorded) marker(recorded[field], 'recorded', field, [103, 117]);
    }
    marker(estimate, 'estimate', null, [92, 102]);
    group.replaceChildren(fragment);
  }

  function connect({ getShift, recordPunch, save, edit, formatDate, displayTime, formatDuration }) {
    const byId = id => document.getElementById(id);
    const list = byId('guidedSteps');
    const primary = byId('guidedNext');
    const actionIcon = byId('guidedActionIcon');
    const actionLabel = byId('guidedActionLabel');
    const dial = byId('guidedDial');
    const scenery = byId('guidedScenery');
    const timeline = byId('guidedTimeline');
    const timelineKey = byId('guidedTimelineKey');
    const estimateKey = byId('guidedEstimateKey');
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
      const nationalHoliday = Shift.nationalHoliday(shift.date);
      const holiday = shift.mode === 'holiday' ? nationalHoliday : null;
      const line = shift.result.error ? `Review your punches in Today. ${shift.result.error}` :
        off ? `${holiday || Shift.label(shift.mode)} · No punches scheduled.` :
        shift.saved && shift.result.complete ? `Shift saved · ${formatDuration(shift.result.total)} worked.` :
        next === 'save' ? 'All punches are captured. Save the shift to add it to History.' :
        Shift.isSaturday(shift.mode) && next === 'morningIn' ? `${Shift.label(shift.mode)} holiday. Punch in if you are working.` :
        shift.overnight ? 'Continuing your overnight shift.' :
        next === 'morningIn' ? 'Start with your first punch. Each punch is saved as you go.' : 'Your punches are saved on this device.';
      if (status.textContent !== line) status.textContent = line;
      const period = dayPeriod(now);
      dial.dataset.period = period;
      scenery.dataset.scene = shift.mode === 'holiday' || nationalHoliday ? 'holiday' : period;
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
      const recorded = shift.result.timeline;
      const plan = planShift(shift);
      const target = shift.result.complete ? null : shift.result.targetOut;
      paintTimeline(timeline, plan, recorded, target);
      timelineKey.hidden = !plan;
      estimateKey.hidden = target === null;
      const values = shift.result.started ? [
        `${formatDuration(shift.result.total)} worked`,
        target !== null && `Est. checkout ${timelineTime(target, displayTime)}`
      ].filter(Boolean) : [];
      metrics.textContent = values.join(' · ');
      metrics.hidden = !values.length;
      skipLunch.hidden = next !== 'lunchOut';
      list.hidden = off;
      const items = rows.map(([field, label]) => {
        const item = document.createElement('li');
        item.dataset.punch = field;
        const name = document.createElement('span');
        name.className = 'guided-punch-label';
        const title = document.createElement('span');
        title.textContent = label;
        name.append(title);
        const planned = plan?.[field];
        if (planned != null && (recorded || field !== 'morningIn')) {
          const timing = document.createElement('small');
          timing.className = 'guided-plan-time';
          timing.textContent = recorded ? `Plan ${timelineTime(planned, displayTime)}` :
            `Plan +${formatDuration(planned - plan.morningIn)}`;
          name.append(timing);
        }
        const time = document.createElement('strong');
        const captured = Shift.parseTime(shift.punches[field]);
        time.textContent = captured === null ? (field === next ? 'Next' : '—') :
          timelineTime(recorded?.[field] ?? captured, displayTime);
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
