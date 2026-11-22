document.addEventListener('DOMContentLoaded', () => {
  const dayFields = Shift.fields;
  const dayInputs = dayFields.map(id => document.getElementById(id));
  const settings = Storage.getSettings();
  const workDate = document.getElementById('workDate');
  const shiftMode = document.getElementById('shiftMode');
  const shiftTarget = document.getElementById('targetShift');
  const dayNotes = document.getElementById('dayNotes');
  const historyRange = document.getElementById('timeRangeFilter');
  const historySearch = document.getElementById('historySearch');
  const historyFilter = document.getElementById('historyFilter');
  const statsRange = document.getElementById('statsRange');
  const statsView = document.getElementById('statsView');
  const exportRange = document.getElementById('exportRange');
  const todayView = document.getElementById('today-view');
  const quickLog = document.getElementById('quickLog');
  const manualWeek = document.getElementById('manualWeek');
  const compactDetails = document.getElementById('compactDetails');
  const tabs = [...document.querySelectorAll('.tab-nav [role="tab"]')];
  const tabDock = document.getElementById('tabDock');
  const moreTabs = document.getElementById('moreTabs');
  const extraTabs = document.getElementById('extraTabs');
  const handheld = window.matchMedia('(max-width: 680px), (max-width: 1024px) and (hover: none) and (pointer: coarse)');
  const settingsFolds = [...document.querySelectorAll('.settings-fold')];
  let todayKey = localDateKey(new Date());
  let lastRenderedMinute = null;
  let lastDayLogs = '';
  let weekRows = loadWeek();
  let weeklyMinutes = 0;
  let editingWeeklyId = null;
  let hasShiftTarget = false;
  let expandedWeekDay = null;
  let miniTimer;

  const version = document.querySelector('meta[name="punchly-release"]').content;
  document.getElementById('appVersion').textContent = `v${version}`;
  document.title = `Punchly v${version} | Time Tracker`;

  Icons.init();
  connectClientLayout();
  AppTools.connectUpdates(version, localDateKey, toast);
  AppTools.connectHelp(version);
  const preferences = Preferences.connect(settings, { notify: toast, onChange: applyPreferences });
  AppTools.connectReset({
    onProfileDeleted() {
      Object.assign(settings, Storage.getSettings());
      preferences.refresh();
      toast('Profile deleted.');
    },
    onReset: reopenAfterReset
  });
  const reminders = Reminders.connect(settings);
  const attendance = Attendance.connect({
    todayKey: () => localDateKey(new Date()), localDateKey, entriesFor: readDayEntries,
    openDay: openDailyLog, describePunches
  });
  miniTimer = MiniTimer.connect({ desktop: () => !handheld.matches, snapshot: timerSnapshot });
  const guidedPunch = GuidedPunch.connect({
    getShift: guidedShift, recordPunch: recordGuidedPunch, save: saveGuidedShift, edit: openDailyLog,
    formatDate, displayTime: displayClock, formatDuration
  });
  connectMobileHaptics();
  historyRange.value = settings.historyRange;
  statsRange.value = settings.historyRange;
  workDate.max = todayKey;
  workDate.value = todayKey;
  restoreToday();
  renderWeek();
  scheduleTrackingRefresh();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    refreshTracking();
    refreshGuided();
  });
  window.addEventListener('storage', event => {
    if (event.key === Storage.resetKey && event.newValue) {
      reopenAfterReset();
      return;
    }
    if (event.key === Storage.keys.SETTINGS) {
      Object.assign(settings, Storage.getSettings());
      preferences.refresh();
    }
    if (!event.key || [Storage.keys.DRAFTS, Storage.keys.HISTORY, Storage.keys.TODAY].includes(event.key)) refreshGuided();
  });
  updateHistory();
  connectInstall();

  function reopenAfterReset() {
    const home = new URL(location.href);
    home.hash = 'punch-view';
    history.replaceState(null, '', home.href);
    location.reload();
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const fromMenu = handheld.matches && extraTabs.contains(tab);
      activateTab(tab);
      if (fromMenu) moreTabs.focus();
    });
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const choices = visibleTabs();
      const index = choices.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 :
        (index + (event.key === 'ArrowRight' ? 1 : choices.length - 1)) % choices.length;
      choices[next].focus();
      activateTab(choices[next], true, true);
    });
  });
  function visibleTabs() {
    return tabs.filter(tab => !handheld.matches || moreTabs.getAttribute('aria-expanded') === 'true' || !extraTabs.contains(tab));
  }
  function updateTabFocus() {
    const selected = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
    const choices = visibleTabs();
    const tabStop = choices.includes(selected) ? selected : choices[0];
    tabs.forEach(tab => { tab.tabIndex = tab === tabStop ? 0 : -1; });
    const extraActive = selected && extraTabs.contains(selected);
    moreTabs.classList.toggle('active', Boolean(extraActive));
    moreTabs.setAttribute('aria-label', extraActive ? `More tabs, ${selected.textContent.trim()} selected` : 'More tabs');
  }
  function setTabMenu(open) {
    tabDock.classList.toggle('open-tabs', open);
    moreTabs.setAttribute('aria-expanded', String(open));
    updateTabFocus();
  }
  moreTabs.addEventListener('click', () => {
    const open = moreTabs.getAttribute('aria-expanded') !== 'true';
    setTabMenu(open);
    if (open) (extraTabs.querySelector('[aria-selected="true"]') || extraTabs.querySelector('button')).focus();
  });
  document.addEventListener('click', event => {
    if (!tabDock.contains(event.target) && moreTabs.getAttribute('aria-expanded') === 'true') setTabMenu(false);
  });
  tabDock.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || moreTabs.getAttribute('aria-expanded') !== 'true') return;
    setTabMenu(false);
    moreTabs.focus();
  });
  function activateTab(tab, updateLocation = true, keepMenu = false) {
    const changed = tab.getAttribute('aria-selected') !== 'true';
    tabs.forEach(item => { const active = item === tab; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)); });
    if (keepMenu) updateTabFocus(); else setTabMenu(false);
    document.querySelectorAll('.tab-pane').forEach(pane => { const active = pane.id === tab.dataset.target; pane.classList.toggle('active', active); pane.hidden = !active; });
    if (updateLocation) history.replaceState(null, '', `#${tab.dataset.target}`);
    if (changed) window.scrollTo(0, 0);
    if (tab.dataset.target === 'punch-view') refreshGuided();
    if (tab.dataset.target === 'history-view') updateHistory();
    if (tab.dataset.target === 'weekly-view') refreshDayLogs();
    if (tab.dataset.target === 'calendar-view') attendance.refresh();
    if (tab.dataset.target === 'stats-view') updateStatistics();
    if (tab.dataset.target === 'export-view') updateExport();
  }

  function openLinkedTab() {
    const tab = tabs.find(item => `#${item.dataset.target}` === location.hash);
    activateTab(tab || tabs[0], false);
  }
  window.addEventListener('hashchange', openLinkedTab);
  openLinkedTab();
  document.querySelector('.brand').addEventListener('click', event => {
    event.preventDefault();
    activateTab(tabs[0]);
  });
  document.getElementById('openSettings').addEventListener('click', () => {
    activateTab(document.getElementById('tab-settings'));
    const heading = document.getElementById('profileHeading');
    const profile = heading.closest('details');
    profile.open = true;
    (handheld.matches ? profile.querySelector('summary') : heading).focus();
  });

  function connectClientLayout() {
    function syncLayout() {
      const mobile = handheld.matches;
      document.documentElement.dataset.layout = mobile ? 'mobile' : 'desktop';
      settingsFolds.forEach(panel => { panel.open = !mobile; });
      quickLog.open = !mobile;
      if (mobile) miniTimer?.close();
      setTabMenu(false);
    }
    syncLayout();
    if (handheld.addEventListener) handheld.addEventListener('change', syncLayout);
    else if (handheld.addListener) handheld.addListener(syncLayout);

    settingsFolds.forEach(panel => panel.addEventListener('toggle', () => {
      if (!handheld.matches || !panel.open) return;
      settingsFolds.forEach(other => { if (other !== panel) other.open = false; });
    }));

    for (const [buttonId, containerId] of [
      ['mobileSummaryToggle', 'shiftSummary'],
      ['weeklyOptionsToggle', 'weekly-view']
    ]) {
      const button = document.getElementById(buttonId);
      const container = document.getElementById(containerId);
      button.addEventListener('click', () => {
        const expanded = container.classList.toggle('mobile-expanded');
        button.setAttribute('aria-expanded', String(expanded));
      });
    }
  }

  function connectMobileHaptics() {
    const touch = window.matchMedia('(any-pointer: coarse)');
    document.addEventListener('click', event => {
      if (!settings.mobileHaptics || !handheld.matches || typeof navigator.vibrate !== 'function' ||
          (event.pointerType !== 'touch' && !touch.matches)) return;
      if (event.target.closest('.tab-btn, .btn-now, .btn-primary, .calendar-day')) navigator.vibrate(12);
    });
  }

  function applyPreferences(section) {
    if (section === 'tracking') {
      if (!hasShiftTarget && !dayInputs.some(input => input.value)) shiftTarget.value = settings.targetShift;
      historyRange.value = settings.historyRange;
      if (!editingWeeklyId && !weekRows.some(row => row.from || row.to || row.break) &&
          !document.getElementById('reportHeaderInput').value && !document.getElementById('reportNotesInput').value) {
        weekRows = loadWeek(null);
        renderWeek();
      }
      renderDay();
      refreshDayLogs();
    }
    if (section === 'tracking' || section === 'reminders') runReminders(new Date());
    if (section === 'appearance' || section === 'tracking') updateHistory();
    refreshGuided();
    miniTimer.refresh();
  }
  function punchNow(field) {
    const now = new Date();
    document.getElementById(field).value = formatClock(now.getHours() * 60 + now.getMinutes());
    updateDayDraft(now);
  }
  document.querySelectorAll('.btn-now').forEach((button, index) => {
    button.setAttribute('aria-keyshortcuts', `Alt+${index + 1}`);
    button.addEventListener('click', () => punchNow(button.dataset.target));
  });
  document.addEventListener('keydown', event => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat ||
        document.querySelector('dialog[open]')) return;
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
  dayInputs.forEach(input => input.addEventListener('input', () => updateDayDraft()));
  workDate.addEventListener('change', () => {
    const today = localDateKey(new Date());
    workDate.max = today;
    if (workDate.value > today) {
      workDate.value = today;
      toast('Choose today or an earlier shift start date.');
    }
    restoreToday();
    renderDay();
  });
  shiftMode.addEventListener('change', () => updateDayDraft());
  dayNotes.addEventListener('input', () => { saveDayDraft(readPunches(), new Date(), true); });
  shiftTarget.addEventListener('input', () => {
    hasShiftTarget = shiftTarget.value !== settings.targetShift;
    updateDayDraft();
  });
  document.getElementById('saveDayBtn').addEventListener('click', () => saveDay());
  document.getElementById('clearDayBtn').addEventListener('click', () => {
    dayInputs.forEach(input => { input.value = ''; });
    if (updateDayDraft()) toast('Punches cleared.');
  });
  document.getElementById('timeRangeFilter').addEventListener('change', updateHistory);
  historySearch.addEventListener('input', () => updateHistory());
  historyFilter.addEventListener('change', updateHistory);
  statsRange.addEventListener('change', updateStatistics);
  statsView.addEventListener('change', updateStatistics);
  exportRange.addEventListener('change', updateExport);
  window.getExportRecords = exportRecords;
  window.getExportChartKind = () => statsView.value === 'log' ? 'bar' : statsView.value;
  if ('ResizeObserver' in window) {
    const chart = document.getElementById('analyticsChart');
    new ResizeObserver(() => { if (chart.clientWidth && statsView.value !== 'log') updateStatistics(); }).observe(chart);
  }
  document.fonts?.addEventListener?.('loadingdone', () => {
    if (!document.getElementById('stats-view').hidden) updateStatistics();
  });
  document.getElementById('exportExcel').addEventListener('click', () => window.exportVisibleExcel?.());
  document.getElementById('exportCSV').addEventListener('click', () => window.exportVisibleCSV?.());
  document.getElementById('exportChartPNG').addEventListener('click', () => window.exportChartPNG?.());
  document.getElementById('exportPDF').addEventListener('click', () => window.exportVisiblePDF?.());
  document.getElementById('backupExport').addEventListener('click', () => window.downloadBackup?.());
  document.getElementById('settingsExport').addEventListener('click', () => window.downloadPunchlySettings?.());
  document.getElementById('backupImportBtn').addEventListener('click', () => document.getElementById('backupImport').click());
  document.getElementById('backupImport').addEventListener('change', event => window.importBackupFile?.(event.target));
  window.addEventListener('punchly:backup-imported', () => {
    Object.assign(settings, Storage.getSettings());
    preferences.refresh();
    historyRange.value = settings.historyRange;
    statsRange.value = settings.historyRange;
    editingWeeklyId = null;
    restoreToday(); weekRows = loadWeek(); renderWeek(); renderDay(); updateHistory(); refreshDayLogs(); miniTimer.refresh(); refreshGuided();
  });
  window.addEventListener('punchly:settings-imported', () => {
    Object.assign(settings, Storage.getSettings());
    preferences.refresh();
    applyPreferences('tracking');
    statsRange.value = settings.historyRange;
    updateStatistics();
  });
  document.getElementById('printWeekly').addEventListener('click', printWeeklyReport);
  document.getElementById('printWeeklyMobile').addEventListener('click', printWeeklyReport);
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
      const dayCell = document.createElement('th');
      dayCell.scope = 'row';
      const dayTitle = document.createElement('span');
      dayTitle.className = 'week-day-title';
      dayTitle.textContent = row.day;
      const dayToggle = document.createElement('button');
      dayToggle.type = 'button';
      dayToggle.className = 'mobile-only week-day-toggle';
      dayToggle.append(row.day, Icons.make('expand_more'));
      dayToggle.setAttribute('aria-expanded', String(expandedWeekDay === index));
      tr.classList.toggle('week-day-expanded', expandedWeekDay === index);
      dayToggle.addEventListener('click', () => {
        expandedWeekDay = expandedWeekDay === index ? null : index;
        [...body.rows].forEach((dayRow, rowIndex) => {
          const open = rowIndex === expandedWeekDay;
          dayRow.classList.toggle('week-day-expanded', open);
          dayRow.querySelector('.week-day-toggle').setAttribute('aria-expanded', String(open));
        });
        if (expandedWeekDay === index) dayToggle.scrollIntoView({ block: 'nearest' });
      });
      dayCell.append(dayTitle, dayToggle);
      tr.append(dayCell);
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
      const worked = document.createElement('td');
      worked.className = 'week-row-total';
      worked.textContent = formatDuration(row.calculatedMinutes || 0);
      tr.append(worked);
      const action = document.createElement('td');
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn-text icon-button';
      clear.append(Icons.make('delete'), 'Clear');
      clear.setAttribute('aria-label', `Clear ${row.day}`);
      clear.addEventListener('click', () => { row.from = ''; row.to = ''; row.break = ''; renderWeek(); });
      action.append(clear);
      tr.append(action);
      Array.from(tr.cells).forEach(cell => cell.setAttribute('role', cell.tagName === 'TH' ? 'rowheader' : 'cell'));
      const fields = Array.from(tr.cells).filter(cell => cell !== dayCell && cell !== worked);
      fields.forEach((cell, fieldIndex) => { cell.id = `weekly-day-${index}-field-${fieldIndex}`; });
      dayToggle.setAttribute('aria-controls', fields.map(cell => cell.id).join(' '));
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
    const now = new Date();
    const previous = editingWeeklyId && Storage.getHistory().find(row => row.id === editingWeeklyId);
    const date = previous?.date || localDateKey(now);
    const record = { kind: 'weekly', id: editingWeeklyId || `weekly-${date}-${now.getTime()}`, date, title: document.getElementById('reportHeaderInput').value.trim() || 'Weekly time report', notes: document.getElementById('reportNotesInput').value.trim(), totalMinutes: weeklyMinutes, schedule: weekRows.map(({ day, from, to, break: breakTime, target, workday }) => ({ day, from, to, break: breakTime, target, workday })), rounding: document.getElementById('roundTimeSelect').value };
    const snapshot = row => ({
      title: row?.title || row?.header, notes: row?.notes,
      schedule: row ? JSON.stringify(row.schedule.map(day => ({
        from: day.from || '', to: day.to || '', break: day.break ?? day.breakDeduction ?? '',
        target: day.target || settings.targetShift, workday: Boolean(day.workday ?? true)
      }))) : '',
      rounding: row?.rounding || 'none'
    });
    record.audit = Audit.track(previous?.audit, snapshot(previous), snapshot(record), now);
    if (!Storage.saveRecord(record)) return toast('Could not save. Browser storage may be full or unavailable.');
    editingWeeklyId = null;
    toast('Weekly report saved to history.');
  }
  function printWeeklyReport() {
    renderWeek();
    if (!document.getElementById('weeklyValidation').hidden) return toast('Fix the invalid time entries before printing.');
    document.getElementById('weeklyPrintReport').innerHTML = '';
    const root = document.getElementById('weeklyPrintReport'); const title = document.createElement('h1'); title.textContent = document.getElementById('reportHeaderInput').value.trim() || 'Weekly time report'; root.append(title);
    const stamp = document.createElement('p');
    stamp.textContent = window.punchlyExportStamp();
    root.append(stamp);
    const table = document.createElement('table'); table.className = 'minimal-table';
    table.innerHTML = '<thead><tr><th>Workday</th><th>Day</th><th>From</th><th>To</th><th>Break</th><th>Target</th><th>Worked</th></tr></thead>';
    const tbody = document.createElement('tbody'); weekRows.forEach(row => { const tr = document.createElement('tr'); [row.workday ? 'Yes' : 'No', row.day, row.from || '—', row.to || '—', row.break || '—', row.target || '—', formatDuration(row.calculatedMinutes || 0)].forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); }); tbody.append(tr); }); table.append(tbody); root.append(table);
    const expected = weekRows.reduce((sum, row) => sum + (row.workday && validTime(row.target) ? toMinutes(row.target) : 0), 0);
    const summary = document.createElement('p'); summary.textContent = `Weekly total: ${formatDuration(weeklyMinutes)} · Scheduled target: ${formatDuration(expected)} · Overtime: ${formatDuration(Math.max(0, weeklyMinutes - expected))}`; root.append(summary);
    const notes = document.getElementById('reportNotesInput').value.trim(); if (notes) { const p = document.createElement('p'); p.textContent = `Notes: ${notes}`; root.append(p); }
    const audit = editingWeeklyId && Storage.getHistory().find(row => row.id === editingWeeklyId)?.audit;
    if (audit?.events.length) {
      const log = changeLog(audit);
      log.open = true;
      root.append(log);
    }
    activateTab(document.getElementById('tab-weekly'));
    window.print();
  }

  function scheduleTrackingRefresh() {
    refreshTracking();
    setTimeout(scheduleTrackingRefresh, 60000 - (Date.now() % 60000));
  }

  function refreshTracking() {
    const now = new Date();
    const nextDay = localDateKey(now);
    if (nextDay !== todayKey) {
      const wasToday = workDate.value === todayKey;
      const [, , , end] = dayInputs;
      const active = !Shift.isDayOff(shiftMode.value) && dayInputs[0].value && !end.value;
      todayKey = nextDay;
      workDate.max = todayKey;
      if (wasToday && !active) {
        workDate.value = todayKey;
        restoreToday();
      } else {
        renderDayHeading();
      }
      updateHistory();
      if (!document.getElementById('calendar-view').hidden) attendance.refresh();
    }

    const minute = Math.floor(now.getTime() / 60000);
    if (minute !== lastRenderedMinute) {
      lastRenderedMinute = minute;
      renderDay(now);
      refreshDayLogs(now);
      runReminders(now);
      miniTimer.refresh(now);
      refreshGuided(now);
    }
  }

  function refreshGuided(now) {
    if (!document.getElementById('punch-view').hidden) guidedPunch.refresh(now);
  }

  function guidedShift(now) {
    function readShift(date) {
      const record = Storage.getHistory().find(row => row.kind === 'daily' && row.date === date);
      const draft = Storage.getDraft(date) || (!record && legacyDraftOn(date, Storage.getToday()));
      const input = logInput(record, draft || (!record && { mode: Shift.saturdayMode(date) || 'full' }));
      const elapsed = nowMinutesForDay(now, date);
      const result = Shift.measure({ ...input, lunchLimit: settings.lunchLimit, now: elapsed });
      const saved = Boolean(record && (!draft || matchingDraft(record, draft)));
      return { ...input, date, result, saved, elapsed, audit: draft?.audit ?? record?.audit };
    }
    const current = readShift(localDateKey(now));
    if (Shift.hasPunches(current.punches)) return current;
    const previous = readShift(yesterdayKey(now));
    const start = Shift.parseTime(previous.punches.morningIn);
    if (start !== null && previous.elapsed !== null && previous.elapsed - start < 1440 &&
        !previous.result.complete && previous.result.targetOut >= 1440) return { ...previous, overnight: true };
    return current;
  }

  function selectPunchDate(date) {
    workDate.max = localDateKey(new Date());
    workDate.value = date;
    restoreToday();
  }

  function recordGuidedPunch(date, field, now) {
    selectPunchDate(date);
    const input = document.getElementById(field);
    if (input.value || Shift.isDayOff(shiftMode.value)) return;
    const elapsed = nowMinutesForDay(now, date);
    let last = null;
    for (const punch of Object.values(Shift.punchesForMode(readPunches(), shiftMode.value))) {
      const value = Shift.parseTime(punch);
      if (value === null) continue;
      const absolute = Math.floor((last ?? 0) / 1440) * 1440 + value;
      last = last !== null && absolute < last ? absolute + 1440 : absolute;
    }
    if (elapsed === null || (last !== null && elapsed < last)) {
      toast('The current time is earlier than your previous punch. Check the times in Today.');
      return;
    }
    input.value = formatClock(now.getHours() * 60 + now.getMinutes());
    const result = measureDay(now);
    if (result.error) {
      input.value = '';
      renderDay(now);
      toast(result.error);
      return;
    }
    if (!updateDayDraft(now)) {
      restoreToday();
      renderDay(now);
      return;
    }
    if (field === 'eveningOut') saveDay(now);
    else toast(`Punch saved at ${displayClock(Shift.parseTime(input.value))}.`);
  }

  function saveGuidedShift(date) {
    selectPunchDate(date);
    saveDay();
  }

  function selectedDay() {
    return workDate.value || todayKey;
  }

  function offsetDate(date, days) {
    const result = new Date(`${date}T12:00:00`);
    result.setDate(result.getDate() + days);
    return localDateKey(result);
  }

  function logInput(record, draft) {
    const mode = Shift.normalizeMode(draft?.mode ?? record?.mode);
    const punches = Shift.punchesForMode(
      draft || record?.punches || { morningIn: record?.in, eveningOut: record?.out === '--:--' ? '' : record?.out },
      mode
    );
    const savedTarget = record?.baseTargetMinutes ?? (record?.mode === 'half' ? record.targetMinutes * 2 : record?.targetMinutes);
    return {
      mode, punches,
      baseTarget: toMinutes(draft?.targetShift) || savedTarget || toMinutes(settings.targetShift),
      notes: String(draft?.notes ?? record?.notes ?? '').trim()
    };
  }

  function matchingDraft(record, draft) {
    if (!draft) return false;
    const saved = logInput(record);
    const current = logInput(record, draft);
    return saved.mode === current.mode && saved.notes === current.notes &&
      JSON.stringify(record.audit ?? null) === JSON.stringify(draft.audit ?? record.audit ?? null) &&
      (Shift.isDayOff(saved.mode) || (saved.baseTarget === current.baseTarget &&
        dayFields.every(field => saved.punches[field] === current.punches[field])));
  }

  function legacyDraftOn(date, legacy) {
    if (legacy?.date === date || legacy?.date === new Date(`${date}T12:00:00`).toLocaleDateString()) {
      return legacy.punches || legacy;
    }
    return null;
  }

  function logEntry(date, record, draft, now) {
    const draftInput = draft && logInput(record, draft);
    const hasDraft = draftInput && (draft.audit || draftInput.mode !== 'full' || draftInput.notes ||
      Object.values(draftInput.punches).some(Boolean));
    const isDraft = Boolean(hasDraft && (!record || !matchingDraft(record, draft)));
    if (!record && !isDraft) {
      const saturday = Shift.saturdayMode(date);
      return { date, mode: saturday, status: saturday ? Shift.label(saturday) + ' holiday' : 'No entry', total: null };
    }

    const entry = isDraft ? draftInput : logInput(record);
    const result = Shift.measure({ ...entry, lunchLimit: settings.lunchLimit, now: nowMinutesForDay(now, date) });
    const dayOff = Shift.isHoliday(entry.mode, entry.punches);
    entry.notes = Shift.saturdayNotes(entry.notes, date, Shift.parseTime(entry.punches.morningIn) !== null);
    const status = isDraft
      ? (result.error ? 'Draft · Check punches' : dayOff ? `Draft · ${Shift.label(entry.mode)}` : 'Draft')
      : Shift.recordStatus(record);
    const total = dayOff || (isDraft && result.error) ? null : isDraft ? result.total : record.totalMinutes;
    return { date, ...entry, status, total, target: result.target, lunch: result.lunch,
      extra: result.extra, isDraft, complete: result.complete, endDayOffset: result.endDayOffset,
      audit: isDraft ? draft.audit ?? record?.audit : record?.audit };
  }

  function readDayEntries(days, now = new Date()) {
    const records = new Map(Storage.getHistory().filter(record => record.kind === 'daily').map(record => [record.date, record]));
    const drafts = Storage.getDrafts();
    const legacy = Storage.getToday();
    return days.map(date => {
      const record = records.get(date);
      return logEntry(date, record, drafts[date] || (!record && legacyDraftOn(date, legacy)), now);
    });
  }

  function refreshDayLogs(now = new Date()) {
    const today = localDateKey(now);
    const days = Array.from({ length: 7 }, (_, index) => offsetDate(today, -index));
    const entries = readDayEntries(days, now);
    const week = entries.slice(0, ((now.getDay() + 6) % 7) + 1).reverse();
    const key = JSON.stringify([entries, settings.clockFormat]);
    if (key === lastDayLogs) return;
    lastDayLogs = key;
    drawDayLog(document.getElementById('quickLogRows'), entries, today, false);
    drawDayLog(document.getElementById('weekLogRows'), week, today, true);
    setText(document.getElementById('weekLogRange'), `${formatDate(week[0].date)} – ${formatDate(today)}`);
    const total = week.reduce((minutes, entry) => minutes + (entry.total || 0), 0);
    setText(document.getElementById('weekLogTotal'), formatDuration(total));
  }

  function describePunches(entry, showLunch = true) {
    const punch = value => {
      const minutes = Shift.parseTime(value);
      return minutes === null ? '' : displayClock(minutes);
    };
    const start = punch(entry.punches?.morningIn);
    const end = punch(entry.punches?.eveningOut);
    const times = [];
    if (start) times.push(`In ${start}`);
    if (showLunch) {
      const lunch = [punch(entry.punches?.lunchOut), punch(entry.punches?.lunchReturn)].filter(Boolean);
      if (lunch.length) times.push(`Lunch ${lunch.join('–')}`);
    }
    if (end) times.push(`Out ${end}${entry.endDayOffset ? ' (+1 day)' : ''}`);
    return times;
  }

  function openDailyLog(date) {
    if (date > localDateKey(new Date())) return;
    workDate.value = date;
    restoreToday();
    renderDay();
    activateTab(document.getElementById('tab-today'));
    document.getElementById('todayHeading').focus();
    window.scrollTo(0, 0);
  }

  function drawDayLog(list, entries, today, showLunch) {
    const focusedDate = list.contains(document.activeElement) ? document.activeElement.dataset.date : null;
    const fragment = document.createDocumentFragment();
    let toRefocus;
    for (const entry of entries) {
      const row = document.createElement('li');
      const details = document.createElement('div');
      const day = document.createElement('strong');
      day.textContent = entry.date === today ? 'Today' :
        new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
      const date = document.createElement('time');
      date.dateTime = entry.date;
      date.textContent = new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const title = document.createElement('div');
      title.className = 'log-date';
      title.append(day, date);
      details.append(title);
      const line = document.createElement('p');
      line.className = 'help-text log-detail';
      const times = describePunches(entry, showLunch);
      const status = entry.mode === 'half' ? `Half day · ${entry.status}` : entry.status;
      line.textContent = [times.join(' · '), status].filter(Boolean).join(' · ');
      details.append(line);
      if (showLunch && entry.notes) {
        const notes = document.createElement('p');
        notes.className = 'help-text log-detail';
        notes.textContent = entry.notes;
        details.append(notes);
      }
      if (entry.audit) details.append(changeLog(entry.audit));
      const actions = document.createElement('div');
      actions.className = 'log-actions';
      if (entry.total !== null) {
        const total = document.createElement('strong');
        total.textContent = formatDuration(entry.total);
        actions.append(total);
      }
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'btn-text';
      open.dataset.date = entry.date;
      open.textContent = entry.status === 'No entry' ? 'Log' : 'Open';
      open.setAttribute('aria-label', `${open.textContent} shift for ${formatDate(entry.date)}`);
      open.addEventListener('click', () => openDailyLog(entry.date));
      if (entry.date === focusedDate) toRefocus = open;
      actions.append(open);
      row.append(details, actions);
      fragment.append(row);
    }
    list.replaceChildren(fragment);
    toRefocus?.focus({ preventScroll: true });
  }

  function renderDayHeading() {
    const date = new Date(`${selectedDay()}T12:00:00`);
    document.getElementById('todayDate').textContent = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    document.getElementById('todayHeading').textContent = selectedDay() === todayKey ? "Today's shift" : 'Shift details';
  }

  function loadDayFields(draft, record) {
    const saturday = Shift.saturdayMode(selectedDay());
    let mode = Shift.normalizeMode(draft?.mode ?? record?.mode ?? saturday);
    if (Shift.isSaturday(mode) && mode !== saturday) mode = saturday || 'full';
    for (const option of shiftMode.options) {
      if (Shift.isSaturday(option.value)) option.disabled = option.hidden = option.value !== saturday;
    }
    const recordTarget = record?.baseTargetMinutes ?? (record?.mode === 'half' ? record?.targetMinutes * 2 : record?.targetMinutes);
    const savedTarget = draft?.targetShift || (recordTarget > 0 ? formatClock(recordTarget) : '');
    shiftMode.value = mode;
    hasShiftTarget = toMinutes(savedTarget) > 0;
    shiftTarget.value = hasShiftTarget ? savedTarget : settings.targetShift;
    dayNotes.value = draft?.notes ?? record?.notes ?? '';

    const punches = draft || record?.punches || { morningIn: record?.in, eveningOut: record?.out };
    dayInputs.forEach(input => { input.value = punches[input.id] || ''; });
    syncSaturdayNote();
  }

  function restoreToday() {
    const date = selectedDay();
    const draft = Storage.getDraft(date);
    const record = Storage.getHistory().find(item => item.kind === 'daily' && item.date === date);
    loadDayFields(draft || (!record && legacyDraftOn(date, Storage.getToday())), record);
    renderDayHeading();
    Audit.show(document.getElementById('todayAudit'), draft?.audit ?? record?.audit);
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
    const mode = Shift.normalizeMode(draft?.mode ?? record?.mode ?? Shift.saturdayMode(date));
    return {
      date, mode, punches: draft || record?.punches || { morningIn: record?.in, eveningOut: record?.out },
      baseTarget: toMinutes(draft?.targetShift) || record?.baseTargetMinutes || toMinutes(settings.targetShift)
    };
  }

  function timerSnapshot(now) {
    const today = localDateKey(now);
    let shift = dayForReminder(today);
    const measure = day => Shift.measure({ ...day, lunchLimit: settings.lunchLimit, now: nowMinutesForDay(now, day.date) });
    let result = measure(shift);
    if (!shift.punches.morningIn) {
      const previous = dayForReminder(yesterdayKey(now));
      const overnight = measure(previous);
      const start = Shift.parseTime(previous.punches.morningIn);
      const elapsed = nowMinutesForDay(now, previous.date);
      if (start !== null && elapsed !== null && elapsed >= start && elapsed - start < 1440 &&
          !overnight.complete && overnight.targetOut >= 1440) {
        shift = previous;
        result = overnight;
      }
    }
    const nextDay = result.targetOut !== null && result.targetOut >= 1440 ? ' +1d' : '';
    return {
      worked: formatDuration(result.total),
      target: result.targetOut === null ? '—' : `${displayClock(result.targetOut)}${nextDay}`,
      note: result.error || (Shift.isDayOff(shift.mode) ? Shift.label(shift.mode) :
        shift.date !== today ? `Overnight shift · ${formatDate(shift.date)}` : !result.started ? 'No shift started.' : '')
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
    const dayOff = Shift.isHoliday(mode, readPunches());
    todayView.dataset.dayOff = String(dayOff);
    const half = mode === 'half';
    document.getElementById('punchDetails').hidden = Shift.isDayOff(mode);
    document.querySelectorAll('[data-lunch-punch]').forEach(group => { group.hidden = half; });
    setText(document.getElementById('punchInLabel'), half ? 'Start punch' : 'Morning in');
    setText(document.getElementById('punchOutLabel'), half ? 'End punch' : 'Evening out');
    setText(document.getElementById('targetHelp'), half ? 'Half days use half the full day target and two punches.' : 'Lunch is excluded from worked time.');
    setText(document.getElementById('saveDayBtn'), dayOff ? 'Save day' : 'Save shift');
    document.getElementById('clearDayBtn').hidden = dayOff;

    const result = measureDay(now);
    todayView.dataset.hasExtra = String(result.extra > 0);
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
    const overnight = document.getElementById('overnightNote');
    overnight.hidden = !result.endDayOffset;
    setText(overnight, result.endDayOffset ? `Clock-out is on ${formatDate(offsetDate(selectedDay(), result.endDayOffset))} (next day).` : '');

    const remaining = Math.max(0, result.target - result.total);
    setText(document.getElementById('netTargetDisplay'), formatDuration(result.target));
    setText(document.getElementById('totalWorkedDisplay'), formatDuration(result.total));
    setText(document.getElementById('remainingDisplay'), formatDuration(remaining));
    setText(document.getElementById('extraWorkedDisplay'), formatDuration(result.extra));
    const percent = result.target > 0 ? Math.min(100, Math.round(result.total / result.target * 100)) : 0;
    document.getElementById('shiftProgressBar').style.width = `${percent}%`;
    document.querySelector('.progress-container').setAttribute('aria-valuenow', String(percent));

    let status = 'Add your first punch to get started.';
    if (dayOff) status = Shift.isSaturday(mode)
      ? 'Scheduled Saturday holiday. Enter punches if you worked.'
      : 'This day has no work target or punches.';
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

  function syncSaturdayNote() {
    const worked = !Shift.isDayOff(shiftMode.value) && Shift.parseTime(readPunches().morningIn) !== null;
    const notes = Shift.saturdayNotes(dayNotes.value, selectedDay(), worked);
    if (dayNotes.value !== notes) dayNotes.value = notes;
  }

  function saveDayDraft(punches = readPunches(), now = new Date(), editingNotes = false) {
    const date = workDate.value;
    if (!date || date > localDateKey(new Date())) return false;
    const draftTarget = (hasShiftTarget || Object.values(punches).some(Boolean)) && toMinutes(shiftTarget.value) > 0
      ? shiftTarget.value : '';
    const record = Storage.getHistory().find(item => item.kind === 'daily' && item.date === date);
    const previous = Storage.getDraft(date) || (!record && legacyDraftOn(date, Storage.getToday()));
    const before = logInput(record, previous || (!record && { mode: Shift.saturdayMode(date) || 'full' }));
    const next = {
      ...punches, targetShift: draftTarget, mode: shiftMode.value, notes: dayNotes.value
    };
    const snapshot = input => ({ ...Object.fromEntries(dayFields.map(field => [field, input.punches[field]])),
      mode: input.mode, target: input.baseTarget, notes: input.notes });
    next.audit = Audit.track(previous?.audit ?? record?.audit, snapshot(before),
      snapshot(logInput(record, next)), now, editingNotes);
    const ok = Storage.saveDraft(date, next);
    if (!ok) toast('Could not save the draft to browser storage.');
    else {
      Audit.show(document.getElementById('todayAudit'), next.audit);
      refreshDayLogs(now);
      if (!document.getElementById('calendar-view').hidden) attendance.refresh();
    }
    miniTimer.refresh();
    refreshGuided();
    return ok;
  }

  function updateDayDraft(now = new Date()) {
    syncSaturdayNote();
    renderDay(now);
    const saved = saveDayDraft(readPunches(), now);
    runReminders(now, true);
    return saved;
  }

  function saveDay(now = new Date()) {
    workDate.max = localDateKey(now);
    if (!workDate.reportValidity()) return;
    const mode = shiftMode.value;
    const punches = Shift.punchesForMode(readPunches(), mode);
    syncSaturdayNote();
    const result = measureDay(now, punches);
    if (result.error) return toast(result.error);
    if (!Shift.isHoliday(mode, punches)) {
      if (result.target <= 0) return toast('Set a work target greater than zero.');
      if (!result.started) return toast('Add a start punch before saving.');
    }

    const date = selectedDay();
    if (!saveDayDraft(readPunches(), now)) return;
    const record = {
      id: `daily-${date}`, kind: 'daily', date, mode, punches,
      in: punches.morningIn || '', out: punches.eveningOut || '', notes: dayNotes.value.trim(),
      baseTargetMinutes: toMinutes(shiftTarget.value), targetMinutes: result.target,
      totalMinutes: result.total, extraMinutes: result.extra, lunchMinutes: result.lunch, lunchLimitMinutes: settings.lunchLimit,
      targetMet: result.complete && result.total >= result.target, audit: Storage.getDraft(date)?.audit
    };
    if (!Storage.saveRecord(record)) return toast('Could not save. Browser storage may be full or unavailable.');
    renderDay(now);
    updateHistory();
    refreshDayLogs(now);
    refreshGuided(now);
    if (Shift.isDayOff(mode)) toast(`${Shift.label(mode)} saved.`);
    else if (Shift.isSaturday(mode) && !Shift.hasPunches(punches)) toast(`${Shift.label(mode)} holiday saved.`);
    else toast('Shift saved.');
  }

  function rangeStart(range, now) {
    const date = new Date(now);
    if (range === 'weekly') date.setDate(date.getDate() - (date.getDay() + 6) % 7);
    else if (range === 'monthly') date.setDate(1);
    else if (range === 'yearly') date.setMonth(0, 1);
    return localDateKey(date);
  }

  function inRange(all, range, now) {
    const today = localDateKey(now);
    const start = rangeStart(range, now);
    return all.filter(record => record.date <= today && (range === 'all' || record.date >= start));
  }

  function periodEntries(all, range, now) {
    const today = localDateKey(now);
    let start = rangeStart(range, now);
    if (range === 'all') {
      const dates = [...all.filter(row => row.kind === 'daily').map(row => row.date), ...Object.keys(Storage.getDrafts())];
      start = dates.filter(date => date <= today && /^\d{4}-\d{2}-\d{2}$/.test(date)).sort()[0] || rangeStart('monthly', now);
    }
    const dates = [];
    for (let date = start; date <= today; date = offsetDate(date, 1)) dates.push(date);
    return readDayEntries(dates, now);
  }

  function entryRecord(entry, type, status) {
    return {
      id: `derived-${entry.date}`, kind: 'daily', date: entry.date, derived: true, mode: type,
      entryStatus: status, notes: entry.notes, totalMinutes: entry.total ?? 0, targetMinutes: entry.target ?? 0,
      lunchMinutes: entry.lunch, extraMinutes: entry.extra, punches: entry.punches,
      in: entry.punches?.morningIn || '', out: entry.punches?.eveningOut || '', audit: entry.audit
    };
  }

  function historyRecords(all, now, range, filter) {
    const records = withDrafts(inRange(all, range, now), range, now);
    if (filter === 'all') return records;
    if (filter === 'leave') return records.filter(record => record.kind === 'daily' && record.mode === 'leave');
    if (filter === 'overtime') return records.filter(record => record.kind === 'daily' && record.extraMinutes > 0);
    if (filter === 'over-lunch') return records.filter(record => {
      if (record.kind !== 'daily' || !record.punches?.lunchOut || !record.punches?.lunchReturn) return false;
      const limit = record.lunchLimitMinutes ?? settings.lunchLimit;
      const lunch = record.lunchMinutes ?? Shift.measure({ mode: record.mode, punches: record.punches, baseTarget: 0, lunchLimit: limit, now: null }).lunch;
      return lunch > limit;
    });

    const today = localDateKey(now);
    const byDate = new Map(records.filter(record => record.kind === 'daily').map(record => [record.date, record]));
    return periodEntries(all, range, now).flatMap(entry => {
      const state = Attendance.stateFor(entry.date, today, entry);
      const punches = Shift.hasPunches(entry.punches);
      if (filter === 'no-punch' && state === 'no-punch') return [entryRecord(entry, entry.mode || 'full', 'No punch')];
      if (filter === 'holiday' && (state === 'holiday' || Shift.isSaturday(state) && !punches)) {
        const saved = !entry.isDraft && byDate.get(entry.date);
        return [saved || entryRecord(entry, state, Attendance.labels[state] + (Shift.isSaturday(state) ? ' holiday' : ''))];
      }
      if (filter === 'incomplete' && punches && !entry.complete) {
        return [!entry.isDraft && byDate.get(entry.date) || entryRecord(entry, entry.mode, 'Incomplete shift')];
      }
      return [];
    });
  }

  function updateStatistics() {
    const all = Storage.getHistory();
    const now = new Date();
    const today = localDateKey(now);
    const range = statsRange.value;
    const records = inRange(all, range, now);
    const daily = records.filter(record => record.kind === 'daily' && !Shift.isHoliday(record.mode, record.punches));
    const sum = daily.reduce((acc, record) => acc + Math.max(0, Number(record.totalMinutes) || 0), 0);
    const over = daily.reduce((acc, record) => acc + (record.extraMinutes || 0), 0);
    setText(document.getElementById('summaryHours'), formatDuration(sum));
    setText(document.getElementById('summaryAverage'), formatDuration(daily.length ? Math.round(sum / daily.length) : 0));
    setText(document.getElementById('summaryOvertime'), formatDuration(over));
    setText(document.getElementById('summaryTargets'), `${daily.filter(record => record.targetMet).length} / ${daily.length}`);
    setText(document.getElementById('summaryLeave'), String(records.filter(record => record.kind === 'daily' && record.mode === 'leave').length));
    const entries = periodEntries(all, range, now);
    const days = entries.map(entry => ({ ...entry, state: Attendance.stateFor(entry.date, today, entry) }));
    const holidays = days.filter(day => day.state === 'holiday' && !day.isDraft ||
      Shift.isSaturday(day.state) && !Shift.hasPunches(day.punches)).length;
    setText(document.getElementById('summaryHolidays'), String(holidays));

    const log = statsView.value === 'log';
    document.getElementById('statsLog').hidden = !log;
    document.getElementById('chartExportArea').hidden = log;
    if (log) {
      const fragment = document.createDocumentFragment();
      for (const day of [...days].reverse()) {
        const row = document.createElement('tr');
        for (const value of [formatDate(day.date), Attendance.labels[day.state], day.total == null ? '—' : formatDuration(day.total)]) {
          row.insertCell().textContent = value;
        }
        fragment.append(row);
      }
      document.getElementById('statsLogRows').replaceChildren(fragment);
    } else {
      Charts.update(records, all, statsView.value, days.map(day => day.state));
    }
  }

  function exportRecords(visibleHistory) {
    const now = new Date();
    if (exportRange.value === 'history') return Array.isArray(visibleHistory) ? visibleHistory : filteredHistory(now);
    const range = exportRange.value;
    return withDrafts(inRange(Storage.getHistory(), range, now), range, now).sort((a, b) => b.date.localeCompare(a.date));
  }

  function withDrafts(records, range, now) {
    const today = localDateKey(now);
    const start = rangeStart(range, now);
    const dates = Object.keys(Storage.getDrafts()).filter(date => date <= today && (range === 'all' || date >= start));
    const drafts = readDayEntries(dates, now).filter(entry => entry.isDraft);
    const draftsByDate = new Map(drafts.map(entry => [entry.date, entryRecord(entry, entry.mode, entry.status)]));
    const saved = records.map(record => {
      const draft = record.kind === 'daily' && draftsByDate.get(record.date);
      if (!draft) return record;
      draftsByDate.delete(record.date);
      return { ...record, ...draft, id: record.id, derived: false, hasDraft: true };
    });
    return [...saved, ...draftsByDate.values()];
  }

  function changeLog(audit) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    details.className = 'audit-log';
    summary.textContent = 'Change log';
    details.append(summary);
    Audit.show(details, audit);
    return details;
  }

  function updateExport(visibleHistory) {
    const count = exportRecords(visibleHistory).length;
    setText(document.getElementById('exportCount'), `${count} ${count === 1 ? 'record' : 'records'} ready to export.`);
    document.querySelectorAll('#export-view .export-actions button').forEach(button => { button.disabled = !count; });
  }

  function filteredHistory(now) {
    const query = historySearch.value.trim().toLocaleLowerCase();
    return historyRecords(Storage.getHistory(), now, historyRange.value, historyFilter.value).filter(record => {
      if (!query) return true;
      const [year, month, day] = record.date.split('-');
      const numericDate = new Date(`${record.date}T12:00:00`).toLocaleDateString();
      return [record.date, formatDate(record.date), numericDate, `${day}/${month}/${year}`, record.notes, record.title]
        .some(value => String(value ?? '').toLocaleLowerCase().includes(query));
    }).sort((a, b) => b.date.localeCompare(a.date));
  }

  function updateHistory() {
    const now = new Date();
    const today = localDateKey(now);
    const visible = filteredHistory(now);
    window.getVisibleHistory = () => visible;
    const body = document.getElementById('historyTableBody'); body.replaceChildren();
    const empty = document.getElementById('emptyHistory');
    empty.hidden = visible.length > 0;
    empty.textContent = historySearch.value.trim() || historyFilter.value !== 'all' ? 'No records match these filters.' : 'No records in this date range yet.';
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
      if (record.audit) label.append(changeLog(record.audit));
      tr.append(label);
      const amount = document.createElement('td');
      amount.textContent = Shift.isHoliday(record.mode, record.punches) || record.entryStatus === 'No punch' ? '—' : formatDuration(record.totalMinutes || 0);
      tr.append(amount);
      const status = document.createElement('td'); status.textContent = Shift.recordStatus(record); tr.append(status);
      const actions = document.createElement('td'); actions.className = 'action-cell';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn-text icon-button';
      edit.append(Icons.make(record.kind === 'weekly' ? 'folder_open' : record.derived ? 'open_in_new' : 'edit'),
        record.kind === 'weekly' ? 'Load' : record.derived ? 'Open' : 'Edit');
      edit.addEventListener('click', () => {
        if (record.kind === 'weekly') loadWeeklyRecord(record);
        else if (record.derived) openDailyLog(record.date);
        else loadDailyRecord(record);
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn-text icon-button danger';
      remove.append(Icons.make('delete'), 'Delete');
      remove.addEventListener('click', () => {
        const question = record.hasDraft ? 'Delete this daily record and its draft?' : `Delete this ${record.kind} record?`;
        if (!confirm(question)) return;
        if (!Storage.deleteRecord(record.id)) return toast('Could not delete the record.');
        if (record.kind === 'daily') {
          const draft = Storage.getDraft(record.date);
          if (record.hasDraft || matchingDraft(record, draft)) Storage.deleteDraft(record.date);
          if (matchingDraft(record, legacyDraftOn(record.date, Storage.getToday()))) Storage.saveToday(null);
          if (selectedDay() === record.date) { restoreToday(); renderDay(); }
        }
        updateHistory();
        refreshDayLogs();
        toast('Record deleted.');
      });
      if (record.kind === 'weekly' || record.date <= today) actions.append(edit);
      if (!record.derived) actions.append(remove);
      tr.append(actions);
      Array.from(tr.cells).forEach(cell => cell.setAttribute('role', 'cell'));
      body.append(tr);
    });
    updateExport(visible);
  }
  function loadDailyRecord(record) {
    if (record.date > localDateKey(new Date())) return toast('This shift start date is still in the future.');
    workDate.value = record.date;
    restoreToday();
    renderDay();
    activateTab(document.getElementById('tab-today'));
    toast(`Loaded ${formatDate(record.date)}. Save to update that record.`);
  }
  function loadWeeklyRecord(record) {
    editingWeeklyId = record.id;
    weekRows = loadWeek();
    if (Array.isArray(record.schedule)) record.schedule.forEach((row, i) => { if (weekRows[i]) Object.assign(weekRows[i], row, { break: row.break ?? row.breakDeduction ?? '' }); });
    document.getElementById('reportHeaderInput').value = record.title || record.header || '';
    document.getElementById('reportNotesInput').value = record.notes || '';
    document.getElementById('roundTimeSelect').value = record.rounding || 'none';
    renderWeek();
    manualWeek.open = true;
    activateTab(document.getElementById('tab-weekly'));
    manualWeek.scrollIntoView({ block: 'start' });
    toast('Weekly report loaded.');
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
  document.documentElement.setAttribute('data-app-ready', '');
});
