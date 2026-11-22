document.addEventListener('DOMContentLoaded', () => {
  const dayFields = Shift.fields;
  const dayInputs = dayFields.map(id => document.getElementById(id));
  const settings = Storage.getSettings();
  UiSounds.connect(settings);
  const manualPunchSounds = new Map();
  const workDate = document.getElementById('workDate');
  const shiftMode = document.getElementById('shiftMode');
  const firstPunchPane = document.getElementById('firstPunchDialog');
  const firstPunchMode = document.getElementById('firstPunchMode');
  const firstPunchSubmit = document.getElementById('firstPunchSubmit');
  const shiftTarget = document.getElementById('targetShift');
  const dayNotes = document.getElementById('dayNotes');
  const historyRange = document.getElementById('timeRangeFilter');
  const historySearch = document.getElementById('historySearch');
  const historyFilter = document.getElementById('historyFilter');
  const statsRange = document.getElementById('statsRange');
  const statsView = document.getElementById('statsView');
  const exportRange = document.getElementById('exportRange');
  const todayView = document.getElementById('today-view');
  const compactDetails = document.getElementById('compactDetails');
  const compactDetailsLabel = document.getElementById('compactDetailsLabel');
  const tabs = [...document.querySelectorAll('.tab-nav [role="tab"]')];
  const tabDock = document.getElementById('tabDock');
  const moreTabs = document.getElementById('moreTabs');
  const extraTabs = document.getElementById('extraTabs');
  const handheld = window.matchMedia('(max-width: 680px), (max-width: 1024px) and (hover: none) and (pointer: coarse)');
  const settingsFolds = [...document.querySelectorAll('.settings-fold')];
  let todayKey = localDateKey(new Date());
  let lastRenderedMinute = null;
  let lastDayLogs = '';
  let hasShiftTarget = false;
  let miniTimer;
  let pendingFirstPunch;

  const version = document.querySelector('meta[name="punchly-release"]').content;
  document.getElementById('appVersion').textContent = `v${version}`;
  document.title = `Punchly v${version} | Time Tracker`;

  const startup = AppTools.connectStartup(version);
  Icons.init();
  connectClientLayout();
  const initialUpdate = AppTools.connectUpdates(version, localDateKey, toast);
  AppTools.connectHelp(version);
  const dayTypeDialog = AppTools.modal('firstPunchDialog', () => {
    if (firstPunchPane.hasAttribute('open')) return;
    pendingFirstPunch = null;
    if (document.activeElement === document.body && !document.getElementById('punch-view').hidden) {
      document.getElementById('guidedEdit').focus();
    }
  });
  const preferences = Preferences.connect(settings, { notify: toast, onChange: applyPreferences });
  startup.profileReady(settings.displayName);
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
    openDay: openDailyLog, describePunches, reserveLeave, cancelLeave
  });
  miniTimer = MiniTimer.connect({ desktop: () => !handheld.matches, snapshot: timerSnapshot });
  const guidedPunch = GuidedPunch.connect({
    getShift: guidedShift,
    recordPunch(date, field, now) {
      if (field !== 'morningIn' || !requestFirstPunch(date, now)) recordGuidedPunch(date, field, now);
    },
    save: saveGuidedShift, edit: openDailyLog,
    formatDate, displayTime: displayClock, formatDuration
  });
  connectMobileHaptics();
  historyRange.value = settings.historyRange;
  statsRange.value = settings.historyRange;
  workDate.max = todayKey;
  workDate.value = todayKey;
  restoreToday();
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
  const setup = Setup.connect(settings, (chosen, saved, respond) => {
    Object.assign(settings, chosen);
    preferences.refresh();
    applyPreferences('tracking');
    if (!saved) toast('Setup choices are available for this session. Browser storage is unavailable.');
    respond(saved ? 'complete' : 'error');
  });

  function reopenAfterReset() {
    UiSounds.silence();
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
    UiSounds.play(open ? 'open' : 'close');
    if (open) (extraTabs.querySelector('[aria-selected="true"]') || extraTabs.querySelector('button')).focus();
  });
  document.addEventListener('click', event => {
    if (!tabDock.contains(event.target) && moreTabs.getAttribute('aria-expanded') === 'true') setTabMenu(false);
  });
  tabDock.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || moreTabs.getAttribute('aria-expanded') !== 'true') return;
    setTabMenu(false);
    moreTabs.focus();
    UiSounds.play('close');
  });
  function activateTab(tab, updateLocation = true, keepMenu = false, withSound = updateLocation) {
    const changed = tab.getAttribute('aria-selected') !== 'true';
    if (changed) UiSounds.leaveView();
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
    if (changed && withSound) UiSounds.play('select', { volume: .12, cooldownMs: 110 });
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

    const summaryToggle = document.getElementById('mobileSummaryToggle');
    summaryToggle.addEventListener('click', () => {
      const expanded = document.getElementById('shiftSummary').classList.toggle('mobile-expanded');
      summaryToggle.setAttribute('aria-expanded', String(expanded));
    });
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
      renderDay();
      refreshDayLogs();
    }
    if (section === 'tracking' || section === 'reminders') runReminders(new Date(), false, false);
    if (section === 'appearance' || section === 'tracking') updateHistory();
    refreshGuided();
    miniTimer.refresh();
  }
  function punchNow(field) {
    const now = new Date();
    if (field === 'morningIn' && requestFirstPunch(selectedDay(), now)) return;
    if (Shift.isDayOff(shiftMode.value) || (shiftMode.value === 'half' && (field === 'lunchOut' || field === 'lunchReturn'))) {
      toast('This punch is unavailable for the selected day type.', 'blocked');
      return;
    }
    const input = document.getElementById(field);
    const previous = input.value;
    input.value = formatClock(now.getHours() * 60 + now.getMinutes());
    manualPunchSounds.delete(input);
    if (!updateDayDraft(now)) { UiSounds.play('error'); return; }
    if (previous === input.value) return;
    if (measureDay(now).error) UiSounds.play('error');
    else UiSounds.punch(Shift.dayPeriod(now));
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
    activateTab(document.getElementById('tab-today'), true, false, false);
    const field = dayFields[Number(digit) - 1];
    punchNow(field);
  });
  compactDetails.addEventListener('click', () => {
    const expanded = todayView.classList.toggle('show-shift-details');
    compactDetails.setAttribute('aria-expanded', String(expanded));
    compactDetailsLabel.textContent = expanded ? 'Hide shift details' : 'Show shift details';
  });
  dayInputs.forEach(input => {
    input.addEventListener('input', () => {
      const now = new Date();
      if (input.id === 'morningIn' && readPunchShift(selectedDay(), now).firstPunch) {
        manualPunchSounds.delete(input);
        return;
      }
      const saved = updateDayDraft(now);
      if (Shift.parseTime(input.value) !== null) {
        manualPunchSounds.set(input, { value: input.value, valid: saved && !measureDay(now).error });
      }
      else manualPunchSounds.delete(input);
    });
    input.addEventListener('change', () => {
      if (input.id === 'morningIn' && Shift.parseTime(input.value) !== null &&
          requestFirstPunch(selectedDay(), new Date(), input.value)) return;
      const pending = manualPunchSounds.get(input);
      if (pending?.value === input.value) {
        if (pending.valid) UiSounds.punch(Shift.dayPeriod(new Date()));
        else UiSounds.play('error');
      }
      manualPunchSounds.delete(input);
    });
  });
  firstPunchMode.addEventListener('change', updateFirstPunchAction);
  document.getElementById('firstPunchForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!pendingFirstPunch) return;
    const { date, enteredTime } = pendingFirstPunch;
    const mode = firstPunchMode.value;
    pendingFirstPunch = null;
    dayTypeDialog.close();
    const now = new Date();
    if (!readPunchShift(date, now).firstPunch) {
      refreshTracking();
      toast('The shift has changed. Review today’s punches and try again.', 'blocked');
      return;
    }
    if (Shift.isHoliday(mode, {})) {
      selectPunchDate(date);
      shiftMode.value = mode;
      saveDay(now);
    } else recordGuidedPunch(date, 'morningIn', now, mode, enteredTime);
  });
  workDate.addEventListener('change', () => {
    const today = localDateKey(new Date());
    workDate.max = today;
    if (workDate.value > today) {
      workDate.value = today;
      toast('Choose today or an earlier shift start date.', 'error');
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
    const hadPunches = dayInputs.some(input => input.value);
    manualPunchSounds.clear();
    dayInputs.forEach(input => { input.value = ''; });
    if (updateDayDraft()) toast('Punches cleared.', hadPunches ? 'delete' : null);
    else UiSounds.play('error');
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
  document.getElementById('backupExport').addEventListener('click', () => window.downloadBackup().catch(() => {}));
  document.getElementById('settingsExport').addEventListener('click', () => window.downloadPunchlySettings?.());
  document.getElementById('backupImportBtn').addEventListener('click', () => document.getElementById('backupImport').click());
  document.getElementById('backupImport').addEventListener('change', event => window.importBackupFile?.(event.target));
  window.addEventListener('punchly:backup-imported', () => {
    Object.assign(settings, Storage.getSettings());
    preferences.refresh();
    historyRange.value = settings.historyRange;
    statsRange.value = settings.historyRange;
    restoreToday(); renderDay(); updateHistory(); refreshDayLogs(); miniTimer.refresh(); refreshGuided();
  });
  window.addEventListener('punchly:settings-imported', () => {
    Object.assign(settings, Storage.getSettings());
    preferences.refresh();
    applyPreferences('tracking');
    statsRange.value = settings.historyRange;
    updateStatistics();
  });
  function connectInstall() {
    const buttons = ['installApp', 'setupInstall'].map(id => document.getElementById(id));
    const notes = ['installNote', 'setupInstallNote'].map(id => document.getElementById(id));
    const needsHostedApp = location.protocol === 'file:' || !window.isSecureContext;
    const hostedApp = 'https://arvind595.github.io/Punchly/';
    let installPrompt;
    let prompting = false;
    let showInstallHint = false;
    let installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    function refreshInstall() {
      buttons.forEach(button => {
        button.disabled = installed || prompting;
        if (needsHostedApp) button.setAttribute('aria-label', 'Install Punchly (opens the web app in a new tab)');
      });
      let message = '';
      if (installed) message = 'Punchly is installed.';
      else if (showInstallHint && !installPrompt) message = 'In your browser menu, choose Install app or Add to Home Screen.';
      notes.forEach(note => {
        note.hidden = !message;
        note.textContent = message;
      });
    }
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      installPrompt = event;
      refreshInstall();
    });
    buttons.forEach(button => button.addEventListener('click', async () => {
      if (installed || prompting) return;
      if (needsHostedApp) {
        window.open(hostedApp, '_blank', 'noopener');
        return;
      }
      if (!installPrompt) {
        showInstallHint = true;
        refreshInstall();
        return;
      }
      const prompt = installPrompt;
      installPrompt = null;
      prompting = true;
      showInstallHint = false;
      refreshInstall();
      try { await prompt.prompt(); }
      catch (error) { showInstallHint = true; }
      finally {
        prompting = false;
        refreshInstall();
      }
    }));
    window.addEventListener('appinstalled', () => {
      installed = true;
      refreshInstall();
    });
    refreshInstall();
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

  function readPunchShift(date, now) {
    const record = Storage.getHistory().find(row => row.kind === 'daily' && row.date === date);
    const draft = Storage.getDraft(date) || (!record && legacyDraftOn(date, Storage.getToday()));
    const input = { ...logInput(date, record, draft), lunchLimit: settings.lunchLimit };
    const elapsed = nowMinutesForDay(now, date);
    const result = Shift.measure({ ...input, now: elapsed });
    const saved = Boolean(record && (!draft || matchingDraft(record, draft)));
    const firstPunch = date === localDateKey(now) && !Shift.hasPunches(input.punches) &&
      (!saved || !Shift.isHoliday(input.mode, input.punches));
    return { ...input, date, result, saved, elapsed, firstPunch, audit: draft?.audit ?? record?.audit };
  }

  function guidedShift(now) {
    const current = readPunchShift(localDateKey(now), now);
    if (Shift.hasPunches(current.punches)) return current;
    const previous = readPunchShift(yesterdayKey(now), now);
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

  function updateFirstPunchAction() {
    firstPunchSubmit.textContent = Shift.isHoliday(firstPunchMode.value, {}) ? 'Save day' : 'Punch in';
  }

  function requestFirstPunch(date, now, enteredTime) {
    if (firstPunchPane.hasAttribute('open')) return true;
    if (date !== localDateKey(now)) return false;
    const shift = readPunchShift(date, now);
    if (!shift.firstPunch) return false;
    const saturday = Shift.saturdayMode(date);
    for (const option of firstPunchMode.options) {
      if (Shift.isSaturday(option.value)) option.disabled = option.hidden = option.value !== saturday;
    }
    firstPunchMode.value = Shift.isSaturday(shift.mode) && shift.mode !== saturday ? 'full' : shift.mode;
    document.getElementById('firstPunchDate').textContent = [formatDate(date), Shift.nationalHoliday(date)].filter(Boolean).join(' · ');
    if (enteredTime) restoreToday();
    pendingFirstPunch = { date, enteredTime };
    updateFirstPunchAction();
    dayTypeDialog.open();
    firstPunchMode.focus();
    return true;
  }

  function recordGuidedPunch(date, field, now, mode, enteredTime) {
    selectPunchDate(date);
    if (mode) shiftMode.value = mode;
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
      toast('The current time is earlier than your previous punch. Check the times in Today.', 'error');
      return;
    }
    input.value = enteredTime || formatClock(now.getHours() * 60 + now.getMinutes());
    const result = measureDay(now);
    if (result.error) {
      input.value = '';
      renderDay(now);
      toast(result.error, 'error');
      return;
    }
    if (!updateDayDraft(now)) {
      restoreToday();
      renderDay(now);
      UiSounds.play('error');
      return;
    }
    if (field === 'eveningOut') saveDay(now, true);
    else {
      UiSounds.punch(Shift.dayPeriod(now));
      toast(`Punch saved at ${displayClock(Shift.parseTime(input.value))}.`);
    }
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

  function logInput(date, record, draft) {
    const source = draft || record?.punches || { morningIn: record?.in, eveningOut: record?.out === '--:--' ? '' : record?.out };
    const scheduled = Shift.nationalHoliday(date) && !Shift.hasPunches(source) ? 'holiday' : Shift.saturdayMode(date);
    const mode = Shift.normalizeMode(draft?.mode ?? record?.mode ?? scheduled);
    const punches = Shift.punchesForMode(source, mode);
    const savedTarget = record?.baseTargetMinutes ?? (record?.mode === 'half' ? record.targetMinutes * 2 : record?.targetMinutes);
    return {
      mode, punches,
      baseTarget: toMinutes(draft?.targetShift) || savedTarget || toMinutes(settings.targetShift),
      notes: Shift.holidayNotes(draft?.notes ?? record?.notes, date).trim()
    };
  }

  function matchingDraft(record, draft) {
    if (!draft) return false;
    const saved = logInput(record.date, record);
    const current = logInput(record.date, record, draft);
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
    const draftInput = draft && logInput(date, record, draft);
    const hasDraft = draftInput && (draft.audit || draftInput.mode !== 'full' || draftInput.notes ||
      Object.values(draftInput.punches).some(Boolean));
    const isDraft = Boolean(hasDraft && (!record || !matchingDraft(record, draft)));
    if (!record && !isDraft) {
      const holiday = Shift.nationalHoliday(date);
      if (holiday) return { date, mode: 'holiday', notes: holiday, status: 'Holiday', total: null };
      const saturday = Shift.saturdayMode(date);
      return { date, mode: saturday, status: saturday ? Shift.label(saturday) + ' holiday' : 'No entry', total: null };
    }

    const entry = isDraft ? draftInput : logInput(date, record);
    const result = Shift.measure({ ...entry, lunchLimit: settings.lunchLimit, now: nowMinutesForDay(now, date) });
    const dayOff = Shift.isHoliday(entry.mode, entry.punches);
    entry.notes = Shift.saturdayNotes(entry.notes, date, Shift.parseTime(entry.punches.morningIn) !== null);
    const status = isDraft
      ? (result.error ? 'Draft · Check punches' : dayOff ? `Draft · ${Shift.label(entry.mode)}` : 'Draft')
      : Shift.recordStatus(record);
    const total = dayOff || (isDraft && result.error) ? null : isDraft ? result.total : record.totalMinutes;
    return { date, ...entry, status, total, target: result.target, lunch: result.lunch,
      extra: result.extra, isDraft, complete: result.complete, endDayOffset: result.endDayOffset,
      hasRecord: Boolean(record), audit: isDraft ? draft.audit ?? record?.audit : record?.audit };
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
    const length = (now.getDay() + 6) % 7 + 1;
    const dates = Array.from({ length }, (_, index) => offsetDate(today, index + 1 - length));
    const week = readDayEntries(dates, now);
    const key = JSON.stringify([week, settings.clockFormat]);
    if (key === lastDayLogs) return;
    lastDayLogs = key;
    drawDayLog(document.getElementById('weekLogRows'), week, today);
    setText(document.getElementById('weekLogRange'), `${formatDate(week[0].date)} – ${formatDate(today)}`);
    const total = week.reduce((minutes, entry) => minutes + (entry.total || 0), 0);
    setText(document.getElementById('weekLogTotal'), formatDuration(total));
  }

  function describePunches(entry) {
    const punch = value => {
      const minutes = Shift.parseTime(value);
      return minutes === null ? '' : displayClock(minutes);
    };
    const start = punch(entry.punches?.morningIn);
    const end = punch(entry.punches?.eveningOut);
    const times = [];
    if (start) times.push(`In ${start}`);
    const lunch = [punch(entry.punches?.lunchOut), punch(entry.punches?.lunchReturn)].filter(Boolean);
    if (lunch.length) times.push(`Lunch ${lunch.join('–')}`);
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

  function leaveRecord(date) {
    return Storage.getHistory().find(record => record.kind === 'daily' && record.date === date);
  }

  function reserveLeave(date, notes) {
    const now = new Date();
    if (date <= localDateKey(now)) return false;
    const existing = leaveRecord(date);
    if (Storage.getDraft(date) || (existing && existing.mode !== 'leave')) {
      toast('This date already has an entry.', 'blocked');
      return false;
    }
    const before = logInput(date, existing);
    const mode = 'leave';
    notes = Shift.holidayNotes(notes, date);
    const audit = Audit.track(existing?.audit, { mode: before.mode, notes: before.notes }, { mode, notes }, now);
    const saved = Storage.saveRecord({
      id: existing?.id || `daily-${date}`, kind: 'daily', date, mode, notes, audit,
      punches: {}, in: '', out: '', totalMinutes: 0, targetMinutes: 0, extraMinutes: 0, targetMet: false
    });
    toast(saved ? 'Leave reservation saved.' : 'Could not save the leave reservation.', saved ? 'success' : 'error');
    return saved;
  }

  function cancelLeave(date) {
    if (date <= localDateKey(new Date())) return false;
    const existing = leaveRecord(date);
    if (existing?.mode !== 'leave' || Storage.getDraft(date)) return false;
    const removed = Storage.deleteRecord(existing.id);
    toast(removed ? 'Leave reservation canceled.' : 'Could not cancel the leave reservation.', removed ? 'delete' : 'error');
    return removed;
  }

  function drawDayLog(list, entries, today) {
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
      const times = describePunches(entry);
      const status = entry.mode === 'half' ? `Half day · ${entry.status}` : entry.status;
      line.textContent = [times.join(' · '), status].filter(Boolean).join(' · ');
      details.append(line);
      if (entry.notes) {
        const notes = document.createElement('p');
        notes.className = 'help-text log-detail';
        notes.textContent = entry.notes;
        details.append(notes);
      }
      const actions = document.createElement('div');
      actions.className = 'log-actions';
      if (entry.total !== null) {
        const total = document.createElement('strong');
        total.textContent = formatDuration(entry.total);
        actions.append(total);
      }
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn-text';
      edit.dataset.date = entry.date;
      edit.textContent = entry.status === 'No entry' ? 'Log' : 'Edit';
      edit.setAttribute('aria-label', `${edit.textContent} shift for ${formatDate(entry.date)}`);
      edit.addEventListener('click', () => openDailyLog(entry.date));
      if (entry.date === focusedDate) toRefocus = edit;
      actions.append(edit);
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
    const date = selectedDay();
    const saturday = Shift.saturdayMode(date);
    let mode = logInput(date, record, draft).mode;
    if (Shift.isSaturday(mode) && mode !== saturday) mode = saturday || 'full';
    for (const option of shiftMode.options) {
      if (Shift.isSaturday(option.value)) option.disabled = option.hidden = option.value !== saturday;
    }
    const recordTarget = record?.baseTargetMinutes ?? (record?.mode === 'half' ? record?.targetMinutes * 2 : record?.targetMinutes);
    const savedTarget = draft?.targetShift || (recordTarget > 0 ? formatClock(recordTarget) : '');
    shiftMode.value = mode;
    hasShiftTarget = toMinutes(savedTarget) > 0;
    shiftTarget.value = hasShiftTarget ? savedTarget : settings.targetShift;
    dayNotes.value = Shift.holidayNotes(draft?.notes ?? record?.notes, date);

    const punches = draft || record?.punches || { morningIn: record?.in, eveningOut: record?.out };
    dayInputs.forEach(input => { input.value = punches[input.id] || ''; });
    syncSaturdayNote();
  }

  function restoreToday() {
    manualPunchSounds.clear();
    const date = selectedDay();
    const draft = Storage.getDraft(date);
    const record = Storage.getHistory().find(item => item.kind === 'daily' && item.date === date);
    loadDayFields(draft || (!record && legacyDraftOn(date, Storage.getToday())), record);
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
    const record = Storage.getHistory().find(item => item.kind === 'daily' && item.date === date);
    return { date, ...logInput(date, record, draft) };
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

  function runReminders(now, justEdited = false, audible = !justEdited) {
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
    reminders.check(now, date, today, activeShift, audible);
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
    const before = logInput(date, record, previous);
    const next = {
      ...punches, targetShift: draftTarget, mode: shiftMode.value, notes: dayNotes.value
    };
    const snapshot = input => ({ ...Object.fromEntries(dayFields.map(field => [field, input.punches[field]])),
      mode: input.mode, target: input.baseTarget, notes: input.notes });
    next.audit = Audit.track(previous?.audit ?? record?.audit, snapshot(before),
      snapshot(logInput(date, record, next)), now, editingNotes);
    const ok = Storage.saveDraft(date, next);
    if (!ok) toast('Could not save the draft to browser storage.');
    else {
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

  function saveDay(now = new Date(), punch = false) {
    workDate.max = localDateKey(now);
    if (!workDate.reportValidity()) { UiSounds.play('error'); return; }
    const mode = shiftMode.value;
    const punches = Shift.punchesForMode(readPunches(), mode);
    syncSaturdayNote();
    const result = measureDay(now, punches);
    if (result.error) return toast(result.error, 'error');
    if (!Shift.isHoliday(mode, punches)) {
      if (result.target <= 0) return toast('Set a work target greater than zero.', 'error');
      if (!result.started) return toast('Add a start punch before saving.', 'error');
    }

    const date = selectedDay();
    if (!saveDayDraft(readPunches(), now)) { UiSounds.play('error'); return; }
    const record = {
      id: `daily-${date}`, kind: 'daily', date, mode, punches,
      in: punches.morningIn || '', out: punches.eveningOut || '', notes: Shift.holidayNotes(dayNotes.value, date).trim(),
      baseTargetMinutes: toMinutes(shiftTarget.value), targetMinutes: result.target,
      totalMinutes: result.total, extraMinutes: result.extra, lunchMinutes: result.lunch, lunchLimitMinutes: settings.lunchLimit,
      targetMet: result.complete && result.total >= result.target, audit: Storage.getDraft(date)?.audit
    };
    if (!Storage.saveRecord(record)) return toast('Could not save. Browser storage may be full or unavailable.', 'error');
    renderDay(now);
    updateHistory();
    refreshDayLogs(now);
    refreshGuided(now);
    if (Shift.isDayOff(mode)) toast(`${Shift.label(mode)} saved.`);
    else if (Shift.isSaturday(mode) && !Shift.hasPunches(punches)) toast(`${Shift.label(mode)} holiday saved.`);
    else toast('Shift saved.');
    if (punch) UiSounds.punch(Shift.dayPeriod(now));
    else UiSounds.play('success');
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
    const start = periodStart(range, now, all, Object.keys(Storage.getDrafts()));
    const dates = [];
    for (let date = start; date <= today; date = offsetDate(date, 1)) dates.push(date);
    return readDayEntries(dates, now);
  }

  function periodStart(range, now, records, draftDates) {
    if (range !== 'all') return rangeStart(range, now);
    const first = rangeStart('yearly', now);
    const dates = [...records.filter(row => row.kind === 'daily').map(row => row.date), ...draftDates];
    return dates.filter(date => date < first && /^\d{4}-\d{2}-\d{2}$/.test(date)).sort()[0] || first;
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
    const records = withDailyEntries(inRange(all, range, now), range, now);
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
    return withDailyEntries(inRange(Storage.getHistory(), range, now), range, now).sort((a, b) => b.date.localeCompare(a.date));
  }

  function withDailyEntries(records, range, now) {
    const today = localDateKey(now);
    const draftDates = Object.keys(Storage.getDrafts());
    const start = periodStart(range, now, records, draftDates);
    const dates = new Set(draftDates.filter(date => date <= today && date >= start));
    const holidays = Shift.nationalHolidayDates(start, today);
    holidays.forEach(date => dates.add(date));
    const entries = readDayEntries([...dates], now).filter(entry => entry.isDraft ||
      (entry.mode === 'holiday' && Shift.nationalHoliday(entry.date)));
    const byDate = new Map(entries.map(entry => [entry.date, entry]));
    const saved = records.map(record => {
      if (record.kind !== 'daily') return record;
      const entry = byDate.get(record.date);
      byDate.delete(record.date);
      if (entry?.isDraft) return { ...record, ...entryRecord(entry, entry.mode, entry.status),
        id: record.id, derived: false, hasDraft: true };
      const notes = Shift.holidayNotes(record.notes, record.date);
      return notes === record.notes ? record : { ...record, notes };
    });
    return [...saved, ...Array.from(byDate.values(), entry => entryRecord(entry, entry.mode, entry.status))];
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

  function weeklyArchive(record) {
    const details = document.createElement('details');
    details.className = 'audit-log';
    const summary = document.createElement('summary');
    summary.textContent = 'View saved report';
    details.append(summary);
    if (record.notes) {
      const notes = document.createElement('p');
      notes.textContent = record.notes;
      details.append(notes);
    }
    const schedule = document.createElement('ul');
    (record.schedule || []).forEach((row, index) => {
      if (!row.from && !row.to) return;
      const line = document.createElement('li');
      const pause = row.break || row.breakDeduction;
      line.textContent = `${row.day || Preferences.days[index] || 'Shift'} · ${row.from || '—'}–${row.to || '—'}${pause ? ` · Break ${pause}` : ''}`;
      schedule.append(line);
    });
    if (schedule.childElementCount) details.append(schedule);
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
      if (record.kind === 'weekly' && (record.notes || record.schedule?.length)) label.append(weeklyArchive(record));
      if (record.audit) label.append(changeLog(record.audit));
      tr.append(label);
      const amount = document.createElement('td');
      amount.textContent = Shift.isHoliday(record.mode, record.punches) || record.entryStatus === 'No punch' ? '—' : formatDuration(record.totalMinutes || 0);
      tr.append(amount);
      const status = document.createElement('td'); status.textContent = Shift.recordStatus(record); tr.append(status);
      const actions = document.createElement('td'); actions.className = 'action-cell';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn-text icon-button';
      edit.append(Icons.make('edit'), 'Edit');
      edit.addEventListener('click', () => {
        if (record.derived) openDailyLog(record.date);
        else loadDailyRecord(record);
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn-text icon-button danger';
      remove.append(Icons.make('delete'), 'Delete');
      remove.addEventListener('click', () => {
        const question = record.hasDraft ? 'Delete this daily record and its draft?' : `Delete this ${record.kind} record?`;
        if (!confirm(question)) return;
        if (!Storage.deleteRecord(record.id)) return toast('Could not delete the record.', 'error');
        if (record.kind === 'daily') {
          const draft = Storage.getDraft(record.date);
          if (record.hasDraft || matchingDraft(record, draft)) Storage.deleteDraft(record.date);
          if (matchingDraft(record, legacyDraftOn(record.date, Storage.getToday()))) Storage.saveToday(null);
          if (selectedDay() === record.date) { restoreToday(); renderDay(); }
        }
        updateHistory();
        refreshDayLogs();
        toast('Record deleted.', 'delete');
      });
      if (record.kind === 'daily' && record.date <= today) actions.append(edit);
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
  function toast(message, cue) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('visible'), 3200);
    if (cue) UiSounds.play(cue);
  }
  window.showPunchlyToast = toast;
  function toMinutes(value) { return Shift.parseTime(value) ?? 0; }
  function formatClock(minutes) { minutes = ((minutes % 1440) + 1440) % 1440; return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
  function displayClock(minutes) {
    if (settings.clockFormat !== '12') return formatClock(minutes);
    const hour = Math.floor(minutes / 60) % 24;
    return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  }
  function formatDuration(minutes) { minutes = Math.max(0, Math.floor(minutes || 0)); return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
  function localDateKey(date) { return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function formatDate(date) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  document.documentElement.setAttribute('data-app-ready', '');
  startup.finish(initialUpdate, setup.open);
});
