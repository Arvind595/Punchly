document.addEventListener('DOMContentLoaded', () => {
  const dayFields = Shift.fields;
  const dayInputs = dayFields.map(id => document.getElementById(id));
  const settings = Storage.getSettings();
  const workDate = document.getElementById('workDate');
  const shiftMode = document.getElementById('shiftMode');
  const shiftTarget = document.getElementById('targetShift');
  const dayNotes = document.getElementById('dayNotes');
  const historyRange = document.getElementById('timeRangeFilter');
  const localClock = document.getElementById('localClock');
  const todayView = document.getElementById('today-view');
  const compactDetails = document.getElementById('compactDetails');
  const clockFormatters = Object.fromEntries(['24', '12'].map(format => [
    format, new Intl.DateTimeFormat(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: format === '12' ? 'h12' : 'h23'
    })
  ]));
  let todayKey = localDateKey(new Date());
  let lastRenderedMinute = null;
  let weekRows = loadWeek();
  let weeklyMinutes = 0;
  let editingWeeklyId = null;
  let hasShiftTarget = false;

  const preferences = Preferences.connect(settings, { notify: toast, onChange: applyPreferences });
  const reminders = Reminders.connect(settings);
  historyRange.value = settings.historyRange;
  workDate.value = todayKey;
  restoreToday();
  renderWeek();
  tickClock();
  setInterval(tickClock, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickClock(); });
  updateHistory();
  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') navigator.serviceWorker.register('service-worker.js').catch(error => console.warn('Punchly offline support could not be enabled.', error));
  connectInstall();

  document.querySelectorAll('.tab-btn').forEach((tab, index, tabs) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      tabs[next].focus(); activateTab(tabs[next]);
    });
  });
  function activateTab(tab, updateLocation = true) {
    const changed = tab.getAttribute('aria-selected') !== 'true';
    document.querySelectorAll('.tab-btn').forEach(item => { const active = item === tab; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; });
    document.querySelectorAll('.tab-pane').forEach(pane => { const active = pane.id === tab.dataset.target; pane.classList.toggle('active', active); pane.hidden = !active; });
    if (updateLocation) history.replaceState(null, '', `#${tab.dataset.target}`);
    if (changed) window.scrollTo(0, 0);
    if (tab.dataset.target === 'history-view') updateHistory();
  }

  function openLinkedTab() {
    const tab = [...document.querySelectorAll('.tab-btn')].find(item => `#${item.dataset.target}` === location.hash);
    activateTab(tab || document.getElementById('tab-today'), false);
  }
  window.addEventListener('hashchange', openLinkedTab);
  openLinkedTab();
  document.querySelector('.brand').addEventListener('click', event => {
    event.preventDefault();
    activateTab(document.getElementById('tab-today'));
  });
  document.getElementById('openSettings').addEventListener('click', () => {
    activateTab(document.getElementById('tab-settings'));
    document.getElementById('profileHeading').focus();
  });

  function applyPreferences(section) {
    if (section === 'tracking') {
      if (!hasShiftTarget && !dayInputs.some(input => input.value)) shiftTarget.value = settings.targetShift;
      historyRange.value = settings.historyRange;
      if (!editingWeeklyId && !weekRows.some(row => row.from || row.to || row.break) &&
          !document.getElementById('reportHeaderInput').value && !document.getElementById('reportNotesInput').value) {
        weekRows = loadWeek(null);
        renderWeek();
      }
      tickClock();
      renderDay();
    }
    if (section === 'tracking' || section === 'reminders') runReminders(new Date());
    if (section === 'appearance' || section === 'tracking') updateHistory();
  }
  function punchNow(field) {
    const now = new Date();
    document.getElementById(field).value = formatClock(now.getHours() * 60 + now.getMinutes());
    updateDayDraft();
  }
  document.querySelectorAll('.btn-now').forEach((button, index) => {
    button.setAttribute('aria-keyshortcuts', `Alt+${index + 1}`);
    button.addEventListener('click', () => punchNow(button.dataset.target));
  });
  document.addEventListener('keydown', event => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat ||
        document.getElementById('restoreDialog').open) return;
    const digit = event.key.match(/^[1-4]$/)?.[0] || /^(?:Digit|Numpad)([1-4])$/.exec(event.code)?.[1];
    if (!digit) return;
    event.preventDefault();
    const day = selectedDay();
    const now = new Date();
    const elapsed = nowMinutesForDay(now, day);
    const punches = readPunches();
    const start = Shift.parseTime(punches.morningIn);
    const validOvernight = day === yesterdayKey(now) && start !== null && !punches.eveningOut &&
      !Shift.isDayOff(shiftMode.value) && elapsed !== null && elapsed - start < 1440;
    if (day !== todayKey && !validOvernight) {
      workDate.value = todayKey;
      restoreToday();
    }
    activateTab(document.getElementById('tab-today'));
    const field = dayFields[Number(digit) - 1];
    if (Shift.isDayOff(shiftMode.value) || (shiftMode.value === 'half' && (field === 'lunchOut' || field === 'lunchReturn'))) {
      toast('This punch is unavailable for the selected day type.');
      return;
    }
    punchNow(field);
  });
  compactDetails.addEventListener('click', () => {
    const expanded = todayView.classList.toggle('show-shift-details');
    compactDetails.setAttribute('aria-expanded', String(expanded));
    compactDetails.textContent = expanded ? 'Hide shift details' : 'Show shift details';
  });
  dayInputs.forEach(input => input.addEventListener('input', updateDayDraft));
  workDate.addEventListener('change', () => { restoreToday(); renderDay(); });
  shiftMode.addEventListener('change', updateDayDraft);
  dayNotes.addEventListener('input', () => { saveDayDraft(); });
  shiftTarget.addEventListener('input', () => {
    hasShiftTarget = shiftTarget.value !== settings.targetShift;
    updateDayDraft();
  });
  document.getElementById('saveDayBtn').addEventListener('click', saveDay);
  document.getElementById('clearDayBtn').addEventListener('click', () => {
    dayInputs.forEach(input => { input.value = ''; });
    if (updateDayDraft()) toast('Punches cleared.');
  });
  document.getElementById('timeRangeFilter').addEventListener('change', updateHistory);
  if ('ResizeObserver' in window) {
    const chart = document.getElementById('analyticsChart');
    new ResizeObserver(() => window.updateAnalytics?.(window.getVisibleHistory(), Storage.getHistory())).observe(chart);
  }
  document.fonts?.addEventListener?.('loadingdone', () => window.updateAnalytics?.(window.getVisibleHistory(), Storage.getHistory()));
  document.getElementById('exportExcel').addEventListener('click', () => window.exportVisibleExcel?.());
  document.getElementById('exportCSV').addEventListener('click', () => window.exportVisibleCSV?.());
  document.getElementById('exportChartPNG').addEventListener('click', () => window.exportChartPNG?.());
  document.getElementById('backupExport').addEventListener('click', () => window.downloadBackup?.());
  document.getElementById('backupImportBtn').addEventListener('click', () => document.getElementById('backupImport').click());
  document.getElementById('backupImport').addEventListener('change', event => window.importBackupFile?.(event.target));
  window.addEventListener('punchly:backup-imported', () => {
    Object.assign(settings, Storage.getSettings());
    preferences.refresh();
    historyRange.value = settings.historyRange;
    editingWeeklyId = null;
    restoreToday(); weekRows = loadWeek(); renderWeek(); tickClock(); renderDay(); updateHistory();
  });
  document.getElementById('printHistory').addEventListener('click', () => window.print());
  document.getElementById('printWeekly').addEventListener('click', printWeeklyReport);
  document.getElementById('copyFirstRow').addEventListener('click', () => {
    weekRows.slice(1).forEach((row, index) => Object.assign(row, { from: weekRows[0].from, to: weekRows[0].to, break: weekRows[0].break, workday: row.workday }));
    renderWeek(); toast('Monday times copied to the remaining days.');
  });
  document.getElementById('clearWeekly').addEventListener('click', () => {
    editingWeeklyId = null;
    weekRows = loadWeek(null);
    renderWeek();
  });
  document.getElementById('roundTimeSelect').addEventListener('change', renderWeek);
  ['reportHeaderInput', 'reportNotesInput'].forEach(id => document.getElementById(id).addEventListener('input', saveWeek));
  document.getElementById('saveWeeklyBtn').addEventListener('click', saveWeekly);

  function connectInstall() {
    const button = document.getElementById('installApp');
    const note = document.getElementById('installNote');
    let installPrompt;
    function installed() {
      button.hidden = true;
      note.textContent = 'Punchly is running as an installed app.';
    }
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) installed();
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      installPrompt = event;
      button.hidden = false;
    });
    button.addEventListener('click', async () => {
      if (!installPrompt) return;
      const prompt = installPrompt;
      installPrompt = null;
      button.hidden = true;
      try { await prompt.prompt(); } catch (error) { /* The browser menu remains available. */ }
    });
    window.addEventListener('appinstalled', installed);
  }

  function loadWeek(saved = Storage.getWeek()) {
    const days = Preferences.days;
    const rows = days.map((day, index) => ({
      day, from: '', to: '', break: '', target: settings.targetShift, workday: settings.workdays.includes((index + 1) % 7)
    }));
    if (saved && Array.isArray(saved.rows)) saved.rows.forEach((row, i) => { if (rows[i]) Object.assign(rows[i], row, { day: days[i] }); });
    document.getElementById('reportHeaderInput').value = saved?.title || '';
    document.getElementById('reportNotesInput').value = saved?.notes || '';
    document.getElementById('roundTimeSelect').value = saved?.rounding || settings.rounding;
    return rows;
  }
  function saveWeek() {
    Storage.saveWeek({ rows: weekRows, title: document.getElementById('reportHeaderInput').value, notes: document.getElementById('reportNotesInput').value, rounding: document.getElementById('roundTimeSelect').value });
  }
  function renderWeek() {
    const body = document.getElementById('scheduleRows'); body.replaceChildren();
    let total = 0; let invalid = false;
    weekRows.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.setAttribute('role', 'row');
      const workCell = document.createElement('td');
      const workdayLabel = document.createElement('label');
      workdayLabel.className = 'workday-toggle';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(row.workday);
      checkbox.setAttribute('aria-label', `Count ${row.day} as a workday`);
      checkbox.addEventListener('change', () => { row.workday = checkbox.checked; saveWeek(); updateWeeklyTotal(); });
      const workdayText = document.createElement('span');
      workdayText.textContent = 'Workday';
      workdayText.setAttribute('aria-hidden', 'true');
      workdayLabel.append(checkbox, workdayText);
      workCell.append(workdayLabel); tr.append(workCell);
      const dayCell = document.createElement('th'); dayCell.scope = 'row'; dayCell.textContent = row.day; tr.append(dayCell);
      [['from', 'From'], ['to', 'To'], ['break', 'Break'], ['target', 'Daily target']].forEach(([field, label]) => {
        const cell = document.createElement('td');
        const input = document.createElement('input');
        const caption = document.createElement('span');
        caption.className = 'mobile-field-label';
        caption.textContent = label;
        caption.setAttribute('aria-hidden', 'true');
        input.className = 'matte-input schedule-input';
        input.type = field === 'target' ? 'time' : 'text';
        input.value = row[field] || '';
        input.placeholder = field === 'break' ? '0:30' : '9:00 AM';
        input.setAttribute('aria-label', `${row.day} ${label}`);
        input.addEventListener('input', () => { row[field] = input.value; saveWeek(); updateWeeklyTotal(); });
        cell.append(caption, input);
        tr.append(cell);
      });
      const amount = rowMinutes(row); if (amount === null && (row.from || row.to || row.break)) invalid = true; else { row.calculatedMinutes = amount || 0; total += row.calculatedMinutes; }
      const worked = document.createElement('td'); worked.textContent = formatDuration(row.calculatedMinutes || 0); tr.append(worked);
      const action = document.createElement('td'); const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'btn-text'; clear.textContent = 'Clear'; clear.setAttribute('aria-label', `Clear ${row.day}`); clear.addEventListener('click', () => { row.from = ''; row.to = ''; row.break = ''; renderWeek(); }); action.append(clear); tr.append(action);
      Array.from(tr.cells).forEach(cell => cell.setAttribute('role', cell.tagName === 'TH' ? 'rowheader' : 'cell'));
      body.append(tr);
    });
    weeklyMinutes = total; document.getElementById('weeklyTotal').textContent = formatDuration(total);
    const expected = weekRows.reduce((sum, row) => sum + (row.workday && validTime(row.target) ? toMinutes(row.target) : 0), 0);
    document.getElementById('weeklyExpectation').textContent = `Scheduled target: ${formatDuration(expected)} · ${formatDuration(Math.max(0, total - expected))} overtime`;
    const error = document.getElementById('weeklyValidation'); error.hidden = !invalid; error.textContent = invalid ? 'Check the weekly time entries. Use valid times and a break such as 0:30 or 30.' : '';
    saveWeek();
  }
  function updateWeeklyTotal() {
    let total = 0, invalid = false;
    weekRows.forEach((row, index) => {
      const amount = rowMinutes(row);
      if (amount === null && (row.from || row.to || row.break)) { invalid = true; row.calculatedMinutes = 0; }
      else { row.calculatedMinutes = amount || 0; total += row.calculatedMinutes; }
      const workedCell = document.querySelectorAll('#scheduleRows tr')[index]?.children[6];
      if (workedCell) workedCell.textContent = formatDuration(row.calculatedMinutes);
    });
    weeklyMinutes = total; document.getElementById('weeklyTotal').textContent = formatDuration(total);
    const expected = weekRows.reduce((sum, row) => sum + (row.workday && validTime(row.target) ? toMinutes(row.target) : 0), 0);
    document.getElementById('weeklyExpectation').textContent = `Scheduled target: ${formatDuration(expected)} · ${formatDuration(Math.max(0, total - expected))} overtime`;
    const error = document.getElementById('weeklyValidation'); error.hidden = !invalid; error.textContent = invalid ? 'Check the weekly time entries. Use valid times and a break such as 0:30 or 30.' : '';
  }
  function rowMinutes(row) {
    if (!row.from && !row.to && !row.break) return 0;
    if (!row.from || !row.to || !validFlexibleTime(row.from) || !validFlexibleTime(row.to)) return null;
    const start = parseFlexibleTime(row.from), end = parseFlexibleTime(row.to);
    let elapsed = end - start; if (elapsed < 0) elapsed += 1440;
    const breakMinutes = parseBreak(row.break); if (breakMinutes === null || breakMinutes > elapsed) return null;
    let worked = Math.max(0, elapsed - breakMinutes);
    const rounding = document.getElementById('roundTimeSelect').value;
    if (rounding !== 'none') worked = Math.round(worked / Number(rounding)) * Number(rounding);
    return worked;
  }
  function saveWeekly() {
    renderWeek();
    if (document.getElementById('weeklyValidation').hidden === false) return toast('Fix the invalid time entries before saving.');
    const record = { kind: 'weekly', id: editingWeeklyId || `weekly-${localDateKey(new Date())}-${Date.now()}`, date: localDateKey(new Date()), title: document.getElementById('reportHeaderInput').value.trim() || 'Weekly time report', notes: document.getElementById('reportNotesInput').value.trim(), totalMinutes: weeklyMinutes, schedule: weekRows.map(({ day, from, to, break: breakTime, target, workday }) => ({ day, from, to, break: breakTime, target, workday })), rounding: document.getElementById('roundTimeSelect').value };
    if (!Storage.saveRecord(record)) return toast('Could not save. Browser storage may be full or unavailable.');
    editingWeeklyId = null;
    toast('Weekly report saved to history.');
  }
  function printWeeklyReport() {
    renderWeek();
    if (!document.getElementById('weeklyValidation').hidden) return toast('Fix the invalid time entries before printing.');
    document.getElementById('weeklyPrintReport').innerHTML = '';
    const root = document.getElementById('weeklyPrintReport'); const title = document.createElement('h1'); title.textContent = document.getElementById('reportHeaderInput').value.trim() || 'Weekly time report'; root.append(title);
    const table = document.createElement('table'); table.className = 'minimal-table';
    table.innerHTML = '<thead><tr><th>Workday</th><th>Day</th><th>From</th><th>To</th><th>Break</th><th>Target</th><th>Worked</th></tr></thead>';
    const tbody = document.createElement('tbody'); weekRows.forEach(row => { const tr = document.createElement('tr'); [row.workday ? 'Yes' : 'No', row.day, row.from || '—', row.to || '—', row.break || '—', row.target || '—', formatDuration(row.calculatedMinutes || 0)].forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); }); tbody.append(tr); }); table.append(tbody); root.append(table);
    const expected = weekRows.reduce((sum, row) => sum + (row.workday && validTime(row.target) ? toMinutes(row.target) : 0), 0);
    const summary = document.createElement('p'); summary.textContent = `Weekly total: ${formatDuration(weeklyMinutes)} · Scheduled target: ${formatDuration(expected)} · Overtime: ${formatDuration(Math.max(0, weeklyMinutes - expected))}`; root.append(summary);
    const notes = document.getElementById('reportNotesInput').value.trim(); if (notes) { const p = document.createElement('p'); p.textContent = `Notes: ${notes}`; root.append(p); }
    activateTab(document.getElementById('tab-weekly'));
    window.print();
  }

  function tickClock() {
    const now = new Date();
    setText(localClock, clockFormatters[settings.clockFormat].format(now));
    localClock.dateTime = `${formatClock(now.getHours() * 60 + now.getMinutes())}:${String(now.getSeconds()).padStart(2, '0')}`;

    const nextDay = localDateKey(now);
    if (nextDay !== todayKey) {
      const wasToday = workDate.value === todayKey;
      const [, , , end] = dayInputs;
      const active = !Shift.isDayOff(shiftMode.value) && dayInputs[0].value && !end.value;
      todayKey = nextDay;
      if (wasToday && !active) {
        workDate.value = todayKey;
        restoreToday();
      } else {
        renderDayHeading();
      }
      updateHistory();
    }

    const minute = Math.floor(now.getTime() / 60000);
    if (minute !== lastRenderedMinute) {
      lastRenderedMinute = minute;
      renderDay(now);
      runReminders(now);
    }
  }

  function selectedDay() {
    return workDate.value || todayKey;
  }

  function renderDayHeading() {
    const date = new Date(`${selectedDay()}T12:00:00`);
    document.getElementById('todayDate').textContent = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('todayHeading').textContent = selectedDay() === todayKey ? "Today's shift" : 'Shift details';
  }

  function loadDayFields(draft, record) {
    const mode = Shift.normalizeMode(draft?.mode ?? record?.mode);
    const recordTarget = record?.baseTargetMinutes ?? (record?.mode === 'half' ? record?.targetMinutes * 2 : record?.targetMinutes);
    const savedTarget = draft?.targetShift || (recordTarget > 0 ? formatClock(recordTarget) : '');
    shiftMode.value = mode;
    hasShiftTarget = toMinutes(savedTarget) > 0;
    shiftTarget.value = hasShiftTarget ? savedTarget : settings.targetShift;
    dayNotes.value = draft?.notes ?? record?.notes ?? '';

    const punches = draft || record?.punches || { morningIn: record?.in, eveningOut: record?.out };
    dayInputs.forEach(input => { input.value = punches[input.id] || ''; });
  }

  function restoreToday() {
    const date = selectedDay();
    const draft = Storage.getDraft(date);
    const record = Storage.getHistory().find(item => item.kind === 'daily' && item.date === date);
    loadDayFields(draft, record);
    if (!draft && !record) {
      const legacy = Storage.getToday();
      if (legacy?.date === date || legacy?.date === new Date(`${date}T12:00:00`).toLocaleDateString()) {
        loadDayFields(legacy.punches || legacy);
      }
    }
    renderDayHeading();
  }

  function readPunches() {
    return Object.fromEntries(dayInputs.map(input => [input.id, input.value]));
  }

  function nowMinutesForDay(now, date) {
    const daysSinceShift = (Date.parse(localDateKey(now)) - Date.parse(date)) / 86400000;
    return daysSinceShift === 0 || daysSinceShift === 1
      ? daysSinceShift * 1440 + now.getHours() * 60 + now.getMinutes()
      : null;
  }

  function measureDay(now = new Date(), punches = readPunches()) {
    return Shift.measure({
      mode: shiftMode.value, punches, baseTarget: toMinutes(shiftTarget.value),
      lunchLimit: settings.lunchLimit, now: nowMinutesForDay(now, selectedDay())
    });
  }

  function yesterdayKey(now) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return localDateKey(yesterday);
  }

  function dayForReminder(date) {
    if (date === selectedDay()) return { date, mode: shiftMode.value, punches: readPunches(), baseTarget: toMinutes(shiftTarget.value) };
    const draft = Storage.getDraft(date);
    const record = !draft && Storage.getHistory().find(item => item.kind === 'daily' && item.date === date);
    const mode = Shift.normalizeMode(draft?.mode ?? record?.mode);
    return {
      date, mode, punches: draft || record?.punches || { morningIn: record?.in, eveningOut: record?.out },
      baseTarget: toMinutes(draft?.targetShift) || record?.baseTargetMinutes || toMinutes(settings.targetShift)
    };
  }

  function runReminders(now, justEdited = false) {
    if (![settings.reminderIn, settings.reminderLunchOut, settings.reminderLunchReturn, settings.reminderOut, settings.reminderTarget].some(Boolean)) return;
    const date = localDateKey(now);
    const today = dayForReminder(date);
    let activeShift = today;
    if (!today.punches.morningIn && !Shift.isDayOff(today.mode)) activeShift = dayForReminder(yesterdayKey(now));
    const elapsed = nowMinutesForDay(now, activeShift.date);
    const start = Shift.parseTime(activeShift.punches.morningIn);
    const completed = Boolean(activeShift.punches.eveningOut);
    const includeCompleted = justEdited && activeShift.date === selectedDay();
    if (Shift.isDayOff(activeShift.mode) || start === null || elapsed === null || elapsed < start ||
        elapsed - start >= 1440 || (completed && !includeCompleted)) {
      activeShift = null;
    } else {
      activeShift.result = Shift.measure({ ...activeShift, lunchLimit: settings.lunchLimit, now: elapsed });
    }
    reminders.check(now, date, today, activeShift);
  }

  function renderDay(now = new Date()) {
    const mode = shiftMode.value;
    const dayOff = Shift.isDayOff(mode);
    todayView.dataset.dayOff = String(dayOff);
    const half = mode === 'half';
    document.getElementById('punchDetails').hidden = dayOff;
    document.querySelectorAll('[data-lunch-punch]').forEach(group => { group.hidden = half; });
    setText(document.getElementById('punchInLabel'), half ? 'Start punch' : 'Morning in');
    setText(document.getElementById('punchOutLabel'), half ? 'End punch' : 'Evening out');
    setText(document.getElementById('targetHelp'), half ? 'Half days use half the full day target and two punches.' : 'Lunch is excluded from worked time.');
    setText(document.getElementById('saveDayBtn'), dayOff ? 'Save day' : 'Save shift');
    document.getElementById('clearDayBtn').hidden = dayOff;

    const result = measureDay(now);
    const validation = document.getElementById('todayValidation');
    const problem = result.error || (!dayOff && result.target <= 0 ? 'Set a work target greater than zero.' : '');
    validation.hidden = !problem;
    setText(validation, problem);

    document.getElementById('workSummary').hidden = dayOff;
    setText(document.getElementById('targetOutLabel'), dayOff ? 'Day type' : 'Target out time');
    const extraDays = result.targetOut === null ? 0 : Math.floor(result.targetOut / 1440);
    const clockOut = result.targetOut === null ? '--:--' : `${displayClock(result.targetOut)}${extraDays ? ` +${extraDays}d` : ''}`;
    setText(document.getElementById('targetOutDisplay'), dayOff ? Shift.label(mode) : clockOut);
    const hint = document.getElementById('targetOutHint');
    hint.hidden = !result.estimatedLunch;
    setText(hint, 'Estimate until lunch is recorded');

    const remaining = Math.max(0, result.target - result.total);
    setText(document.getElementById('netTargetDisplay'), formatDuration(result.target));
    setText(document.getElementById('totalWorkedDisplay'), formatDuration(result.total));
    setText(document.getElementById('remainingDisplay'), formatDuration(remaining));
    setText(document.getElementById('extraWorkedDisplay'), formatDuration(result.extra));
    const percent = result.target > 0 ? Math.min(100, Math.round(result.total / result.target * 100)) : 0;
    document.getElementById('shiftProgressBar').style.width = `${percent}%`;
    document.querySelector('.progress-container').setAttribute('aria-valuenow', String(percent));

    let status = 'Add your first punch to get started.';
    if (dayOff) status = 'This day has no work target or punches.';
    else if (problem) status = 'Check the shift details to continue.';
    else if (result.started && !remaining) status = 'Work target reached.';
    else if (result.complete) status = 'Shift complete. Below target.';
    else if (result.started) status = `${formatDuration(remaining)} left to reach your target.`;
    setText(document.getElementById('todayStatus'), status);

    const lunch = document.getElementById('lunchStatus');
    lunch.hidden = result.lunch === null;
    if (result.lunch !== null) {
      const overLimit = Math.max(0, result.lunch - settings.lunchLimit);
      const limitMessage = overLimit ? ` · ${overLimit} min over limit` : '';
      lunch.classList.toggle('lunch-over-limit', overLimit > 0);
      setText(lunch, `Lunch${result.lunchOpen ? ' so far' : ''}: ${result.lunch} min / ${settings.lunchLimit} min${limitMessage}`);
    }
  }

  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  function saveDayDraft(punches = readPunches()) {
    const draftTarget = (hasShiftTarget || Object.values(punches).some(Boolean)) && toMinutes(shiftTarget.value) > 0
      ? shiftTarget.value : '';
    const ok = Storage.saveDraft(selectedDay(), {
      ...punches, targetShift: draftTarget, mode: shiftMode.value, notes: dayNotes.value
    });
    if (!ok) toast('Could not save the draft to browser storage.');
    return ok;
  }

  function updateDayDraft() {
    renderDay();
    const saved = saveDayDraft();
    runReminders(new Date(), true);
    return saved;
  }

  function saveDay() {
    if (!workDate.reportValidity()) return;
    const mode = shiftMode.value;
    const punches = Shift.punchesForMode(readPunches(), mode);
    const result = measureDay(new Date(), punches);
    if (result.error) return toast(result.error);
    if (!Shift.isDayOff(mode)) {
      if (result.target <= 0) return toast('Set a work target greater than zero.');
      if (!result.started) return toast('Add a start punch before saving.');
    }

    const date = selectedDay();
    const record = {
      id: `daily-${date}`, kind: 'daily', date, mode, punches,
      in: punches.morningIn || '', out: punches.eveningOut || '', notes: dayNotes.value.trim(),
      baseTargetMinutes: toMinutes(shiftTarget.value), targetMinutes: result.target,
      totalMinutes: result.total, extraMinutes: result.extra, lunchMinutes: result.lunch,
      targetMet: result.complete && result.total >= result.target
    };
    if (!Storage.saveRecord(record)) return toast('Could not save. Browser storage may be full or unavailable.');
    if (!saveDayDraft()) {
      updateHistory();
      return;
    }
    renderDay();
    updateHistory();
    toast(Shift.isDayOff(mode) ? `${Shift.label(mode)} saved.` : 'Shift saved.');
  }

  function updateHistory(redraw = true) {
    const all = Storage.getHistory(); const range = document.getElementById('timeRangeFilter').value;
    const now = new Date(); const today = localDateKey(now); const start = new Date(`${today}T12:00:00`);
    if (range === 'weekly') { const day = (start.getDay() + 6) % 7; start.setDate(start.getDate() - day); }
    else if (range === 'monthly') start.setDate(1);
    else if (range === 'yearly') start.setMonth(0, 1);
    const startKey = localDateKey(start);
    const visible = all.filter(record => range === 'all' || (record.date >= startKey && record.date <= today)).sort((a, b) => b.date.localeCompare(a.date));
    window.getVisibleHistory = () => visible;
    const daily = visible.filter(record => record.kind === 'daily' && !Shift.isDayOff(record.mode));
    const sum = daily.reduce((acc, record) => acc + Math.max(0, Number(record.totalMinutes) || 0), 0);
    const over = daily.reduce((acc, record) => acc + (record.extraMinutes || 0), 0);
    document.getElementById('summaryHours').textContent = formatDuration(sum);
    document.getElementById('summaryAverage').textContent = formatDuration(daily.length ? Math.round(sum / daily.length) : 0);
    document.getElementById('summaryOvertime').textContent = formatDuration(over);
    document.getElementById('summaryTargets').textContent = `${daily.filter(record => record.targetMet).length} / ${daily.length}`;
    const body = document.getElementById('historyTableBody'); body.replaceChildren();
    document.getElementById('emptyHistory').hidden = visible.length > 0;
    visible.forEach(record => {
      const tr = document.createElement('tr');
      tr.setAttribute('role', 'row');
      const date = document.createElement('td'); date.textContent = formatDate(record.date); tr.append(date);
      const label = document.createElement('td');
      label.textContent = record.kind === 'weekly' ? `Weekly: ${record.title || 'Time report'}` : Shift.label(record.mode);
      if (record.kind === 'daily' && record.notes) {
        const notes = document.createElement('p');
        notes.className = 'history-notes';
        notes.textContent = record.notes;
        label.append(notes);
      }
      tr.append(label);
      const amount = document.createElement('td');
      amount.textContent = Shift.isDayOff(record.mode) ? '—' : formatDuration(record.totalMinutes || 0);
      tr.append(amount);
      const status = document.createElement('td'); status.textContent = Shift.recordStatus(record); tr.append(status);
      const actions = document.createElement('td'); actions.className = 'action-cell';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn-text'; edit.textContent = record.kind === 'weekly' ? 'Load' : 'Edit'; edit.addEventListener('click', () => record.kind === 'weekly' ? loadWeeklyRecord(record) : loadDailyRecord(record));
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn-text danger'; remove.textContent = 'Delete'; remove.addEventListener('click', () => { if (confirm(`Delete this ${record.kind} record?`)) { Storage.deleteRecord(record.id); updateHistory(); toast('Record deleted.'); } });
      actions.append(edit, remove); tr.append(actions);
      Array.from(tr.cells).forEach(cell => cell.setAttribute('role', 'cell'));
      body.append(tr);
    });
    if (redraw) window.updateAnalytics?.(visible, all);
  }
  function loadDailyRecord(record) {
    workDate.value = record.date;
    loadDayFields(null, record);
    renderDayHeading();
    updateDayDraft();
    activateTab(document.getElementById('tab-today'));
    toast(`Loaded ${formatDate(record.date)}. Save to update that record.`);
  }
  function loadWeeklyRecord(record) {
    editingWeeklyId = record.id;
    weekRows = loadWeek();
    if (Array.isArray(record.schedule)) record.schedule.forEach((row, i) => { if (weekRows[i]) Object.assign(weekRows[i], row, { break: row.break ?? row.breakDeduction ?? '' }); });
    document.getElementById('reportHeaderInput').value = record.title || record.header || '';
    document.getElementById('reportNotesInput').value = record.notes || '';
    document.getElementById('roundTimeSelect').value = record.rounding || 'none'; renderWeek(); activateTab(document.getElementById('tab-weekly')); toast('Weekly report loaded.');
  }
  function toast(message) { const el = document.getElementById('toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 3200); }
  window.showPunchlyToast = toast;
  function parseFlexibleTime(value) {
    const match = value.trim().toUpperCase().match(/^(\d{1,2})(?::|\.)(\d{1,2})\s*(AM|PM)?$|^(\d{3,4})\s*(AM|PM)?$/);
    if (!match) return null;
    let hour, minute, suffix;
    if (match[4]) { hour = Number(match[4].slice(0, -2)); minute = Number(match[4].slice(-2)); suffix = match[5]; }
    else { hour = Number(match[1]); minute = Number(match[2]); suffix = match[3]; }
    if (minute > 59 || (suffix ? hour < 1 || hour > 12 : hour > 23)) return null;
    if (suffix === 'PM' && hour < 12) hour += 12; if (suffix === 'AM' && hour === 12) hour = 0;
    return hour * 60 + minute;
  }
  function validFlexibleTime(value) { return parseFlexibleTime(value) !== null; }
  function parseBreak(value) {
    if (!value.trim()) return 0;
    if (/^\d{1,2}:\d{1,2}$/.test(value.trim())) { const [hours, minutes] = value.split(':').map(Number); return minutes < 60 ? hours * 60 + minutes : null; }
    if (/^\d+$/.test(value.trim())) return Number(value);
    return null;
  }
  function validTime(value) { return Shift.parseTime(value) !== null; }
  function toMinutes(value) { return Shift.parseTime(value) ?? 0; }
  function formatClock(minutes) { minutes = ((minutes % 1440) + 1440) % 1440; return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
  function displayClock(minutes) {
    if (settings.clockFormat !== '12') return formatClock(minutes);
    const hour = Math.floor(minutes / 60) % 24;
    return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  }
  function formatDuration(minutes) { minutes = Math.max(0, Math.floor(minutes || 0)); return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
  function localDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function formatDate(date) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
});
