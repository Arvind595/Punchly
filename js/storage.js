const Storage = (() => {
  const keys = { TODAY: 'punchly_today_state', DRAFTS: 'punchly_daily_drafts', HISTORY: 'punchly_history', SETTINGS: 'punchly_settings', WEEK: 'punchly_week_state' };
  const avatarOptions = [['fox', 'Fox'], ['whale', 'Whale'], ['fern', 'Fern'], ['coffee', 'Coffee'], ['orbit', 'Orbit'], ['initials', 'Initials']];
  const oldAvatars = new Map([['sun', 'fox'], ['moon', 'orbit'], ['bolt', 'coffee'], ['leaf', 'fern']]);
  const legacyWeekKey = 'timecard_calculator_history_v1';
  const migrationKey = 'punchly_legacy_weekly_migrated_v1';
  const resetKey = 'punchly_last_reset';
  const setupKey = 'punchly_setup_complete';
  const recoveryKey = 'punchly_restore_recovery_v1';
  const lastBackupKey = 'punchly_last_backup_export';
  const backupReminderKey = 'punchly_last_backup_reminder';
  const issues = new Map();
  let lastWriteFailure = '';
  let historyCache;
  const profileLengths = { displayName: 48, employeeId: 40, employeeEmail: 254, role: 60, department: 60 };
  const defaults = {
    targetShift: '08:20',
    font: 'manrope',
    avatar: avatarOptions[0][0],
    profilePhoto: '',
    profileNameSource: '',
    compactMode: true,
    mobileHaptics: true,
    punchAudio: true,
    soundVolume: 70,
    typingSounds: false,
    miniTimerOnTop: true,
    miniTimerOpacity: 100,
    mobileTimerEnabled: false,
    mobileTimerTarget: true,
    mobileTimerOvertime: false,
    reminderIn: '',
    reminderLunchOut: '',
    reminderLunchReturn: '',
    reminderOut: '',
    reminderTarget: false,
    lunchLimit: 45,
    minimumLunch: true,
    theme: 'light',
    workdays: [1, 2, 3, 4, 5, 6],
    rounding: 'none',
    clockFormat: '12',
    historyRange: 'weekly',
    ...Object.fromEntries(Object.keys(profileLengths).map(field => [field, '']))
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) { issues.delete(key); return fallback; }
      const result = JSON.parse(raw);
      issues.delete(key);
      return result;
    } catch (error) {
      issues.set(key, 'Stored data could not be read or is not valid JSON.');
      console.warn(`Punchly could not read ${key}; using an empty value.`, error);
      return fallback;
    }
  }
  function write(key, value) {
    if (issues.has(key)) { lastWriteFailure = 'Saved data is damaged. Open Data & backups to download recovery data.'; return false; }
    try { localStorage.setItem(key, JSON.stringify(value)); lastWriteFailure = ''; return true; }
    catch (error) {
      console.error(`Punchly could not save ${key}.`, error);
      lastWriteFailure = error.name === 'QuotaExceededError' ? 'Browser storage is full. Export a backup and free space before saving.' : 'Browser storage is unavailable. Your changes could not be saved.';
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent('punchly:storage-error', {
        detail: lastWriteFailure
      }));
      return false;
    }
  }
  function isoDate(value) {
    if (!value) return new Date().toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  function normalizeHistory(persist = true) {
    if (persist) {
      try {
        const signature = historySignature();
        if (historyCache && signature.every((value, index) => value === historyCache.signature[index])) return historyCache.records;
        historyCache = null;
      } catch (error) { historyCache = null; }
    }
    const current = read(keys.HISTORY, []);
    if (!Array.isArray(current) || current.some(record => !record || typeof record !== 'object' || Array.isArray(record) ||
      (typeof record.date !== 'string' || !Number.isFinite(Date.parse(record.date)) ||
        (/^\d{4}-\d{2}-\d{2}$/.test(record.date) && new Date(record.date).toISOString().slice(0, 10) !== record.date)) ||
      (record.punches != null && (typeof record.punches !== 'object' || Array.isArray(record.punches))) ||
      (record.punches && Shift.fields.some(field => record.punches[field] != null && record.punches[field] !== '' && Shift.parseTime(record.punches[field]) === null)) ||
      (record.mode != null && !['full', 'half', 'leave', 'holiday', 'sat1', 'sat3'].includes(record.mode)) ||
      ['totalMinutes', 'targetMinutes', 'extraMinutes', 'lunchMinutes', 'lunchLimitMinutes', 'lunchDeductionMinutes', 'baseTargetMinutes'].some(key =>
        record[key] != null && (!Number.isFinite(record[key]) || record[key] < 0)) ||
      (record.notes != null && typeof record.notes !== 'string') || (record.audit != null && !Audit.valid(record.audit)))) {
      issues.set(keys.HISTORY, 'Saved history contains malformed records.');
      return [];
    }
    const dailyDates = new Set();
    const recordIds = new Set();
    if (current.some(record => {
      if (record.id && recordIds.has(record.id)) return true;
      if (record.id) recordIds.add(record.id);
      if (record.kind && record.kind !== 'daily' || !record.date) return false;
      if (dailyDates.has(record.date)) return true;
      dailyDates.add(record.date);
      return false;
    })) {
      issues.set(keys.HISTORY, 'Saved history contains duplicate dates or record IDs.');
      return [];
    }
    const history = Array.isArray(current) ? current.filter(record => record && typeof record === 'object').map((record, index) => {
      const totalMinutes = Number.isFinite(record.totalMinutes) ? record.totalMinutes : parseDuration(record.total);
      const targetMinutes = Number.isFinite(record.targetMinutes) ? record.targetMinutes : 500;
      const out = record.out === '--:--' ? '' : record.out;
      const kind = record.kind || 'daily';
      const normalized = { ...record, id: record.id || `daily-${isoDate(record.date)}-${index}`, kind, date: isoDate(record.date), out, totalMinutes, targetMinutes };
      if (kind !== 'daily') return normalized;
      const mode = Shift.normalizeMode(record.mode);
      if (Shift.isDayOff(mode)) return { ...normalized, mode, totalMinutes: 0, targetMinutes: 0, extraMinutes: 0, out: '', targetMet: false };
      return { ...normalized, mode, extraMinutes: Math.max(0, totalMinutes - targetMinutes), targetMet: Boolean(out) && targetMinutes > 0 && totalMinutes >= targetMinutes };
    }) : [];
    // Bring records saved by the original standalone weekly calculator into the main history.
    const migrationDone = read(migrationKey, false);
    const legacyWeekly = migrationDone ? [] : read(legacyWeekKey, []);
    if (Array.isArray(legacyWeekly)) legacyWeekly.filter(record => record && typeof record === 'object').forEach((record, index) => {
      const id = record.id || `legacy-week-${index}`;
      if (!history.some(item => item.id === id)) history.push({
        id, kind: 'weekly', date: isoDate(record.dateFormatted), title: record.header || 'Weekly time report',
        notes: record.notes || '', totalMinutes: Number(record.totalMinutes) || parseDuration(record.totalFormatted),
        schedule: Array.isArray(record.schedule) ? record.schedule : [], rounding: 'none', legacy: true
      });
    });
    if (persist && !issues.has(keys.HISTORY) && !issues.has(migrationKey) && !issues.has(legacyWeekKey)) {
      const saved = JSON.stringify(history) === JSON.stringify(current) || write(keys.HISTORY, history);
      if (!saved || (!migrationDone && !write(migrationKey, true))) return history;
      try {
        historyCache = {
          signature: historySignature(),
          records: history,
          daily: dailyIndex(history)
        };
      } catch (error) { historyCache = null; }
    }
    return history;
  }
  function historySignature() {
    return [keys.HISTORY, migrationKey, legacyWeekKey].map(key => localStorage.getItem(key));
  }
  function dailyIndex(history) {
    return new Map(history.filter(record => record.kind === 'daily').map(record => [record.date, record]));
  }
  function parseDuration(value) {
    if (typeof value !== 'string') return 0;
    const match = value.match(/(\d+)\s*h\s*(\d+)\s*m/i);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
  }
  function getSettings() {
    let value = read(keys.SETTINGS, {});
    if (!validSettings(value)) {
      issues.set(keys.SETTINGS, 'Saved settings are malformed.');
      value = {};
    }
    const settings = { ...defaults, ...(value && typeof value === 'object' ? value : {}) };
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(settings.targetShift) || settings.targetShift === '00:00') settings.targetShift = defaults.targetShift;
    if (!Number.isInteger(settings.lunchLimit) || settings.lunchLimit < 0 || settings.lunchLimit > 720) settings.lunchLimit = defaults.lunchLimit;
    settings.minimumLunch = settings.minimumLunch === true;
    if (!['none', '5', '15', '30'].includes(settings.rounding)) settings.rounding = defaults.rounding;
    if (!['24', '12'].includes(settings.clockFormat)) settings.clockFormat = defaults.clockFormat;
    if (!['weekly', 'monthly', 'yearly', 'all'].includes(settings.historyRange)) settings.historyRange = defaults.historyRange;
    if (!['system', 'manrope', 'inter', 'satoshi', 'arial', 'verdana', 'tahoma', 'trebuchet', 'georgia', 'courier',
      'playpen-sans', 'nunito', 'comic-neue'].includes(settings.font)) settings.font = defaults.font;
    settings.avatar = oldAvatars.get(settings.avatar) ?? settings.avatar;
    if (!avatarOptions.some(([id]) => id === settings.avatar)) settings.avatar = defaults.avatar;
    if (typeof settings.profilePhoto !== 'string' || settings.profilePhoto.length > 200000 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/i.test(settings.profilePhoto)) settings.profilePhoto = '';
    if (typeof settings.compactMode !== 'boolean') settings.compactMode = defaults.compactMode;
    if (!['', 'device', 'user'].includes(settings.profileNameSource)) settings.profileNameSource = '';
    settings.mobileHaptics = settings.mobileHaptics !== false;
    settings.punchAudio = settings.punchAudio !== false;
    if (!Number.isInteger(settings.soundVolume) || settings.soundVolume < 0 || settings.soundVolume > 100) {
      settings.soundVolume = defaults.soundVolume;
    }
    settings.typingSounds = settings.typingSounds === true;
    settings.miniTimerOnTop = settings.miniTimerOnTop !== false;
    settings.miniTimerOpacity ??= defaults.miniTimerOpacity;
    settings.mobileTimerEnabled = settings.mobileTimerEnabled === true;
    settings.mobileTimerTarget = settings.mobileTimerTarget !== false;
    settings.mobileTimerOvertime = settings.mobileTimerOvertime === true;
    settings.reminderTarget = settings.reminderTarget === true;
    ['reminderIn', 'reminderLunchOut', 'reminderLunchReturn', 'reminderOut'].forEach(key => {
      if (Shift.parseTime(settings[key]) === null) settings[key] = '';
    });
    if (!Array.isArray(settings.workdays)) settings.workdays = defaults.workdays;
    else settings.workdays = settings.workdays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
    return { ...settings, ...profileDetails(settings) };
  }
  function profileDetails(data) {
    return Object.fromEntries(Object.entries(profileLengths).map(([field, max]) => [
      field, typeof data[field] === 'string' ? data[field].replace(/\s+/g, ' ').trim().slice(0, max) : ''
    ]));
  }
  function saveRecord(record) {
    const history = normalizeHistory().slice();
    const next = { ...record, id: record.id || `${record.kind || 'daily'}-${record.date}-${Date.now()}` };
    const index = history.findIndex(item => item.id === next.id || (next.kind === 'daily' && item.kind === 'daily' && item.date === next.date));
    if (index >= 0) history[index] = next; else history.push(next);
    return write(keys.HISTORY, history);
  }

  function getDrafts() {
    const drafts = read(keys.DRAFTS, {});
    if (!drafts || typeof drafts !== 'object' || Array.isArray(drafts) ||
        Object.values(drafts).some(draft => !draft || typeof draft !== 'object' || Array.isArray(draft) ||
          (draft.notes != null && typeof draft.notes !== 'string') || (draft.audit != null && !Audit.valid(draft.audit)) ||
          Shift.fields.some(field => draft[field] != null && draft[field] !== '' && Shift.parseTime(draft[field]) === null))) {
      issues.set(keys.DRAFTS, 'Saved drafts are malformed.');
      return {};
    }
    return drafts;
  }

  function validSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.entries(value).every(([key, item]) => {
      if (!(key in defaults) || item == null) return true;
      if (key === 'workdays') return Array.isArray(item) && item.every(day => Number.isInteger(day) && day >= 0 && day <= 6);
      if (typeof item !== typeof defaults[key] || (typeof item === 'number' && !Number.isFinite(item))) return false;
      if (key === 'lunchLimit') return Number.isInteger(item) && item >= 0 && item <= 720;
      if (key === 'soundVolume') return Number.isInteger(item) && item >= 0 && item <= 100;
      if (key === 'miniTimerOpacity') return Number.isInteger(item) && item >= 50 && item <= 100;
      if (key === 'targetShift') return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item) && item !== '00:00';
      return true;
    });
  }

  function validateBackup(data) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const schedule = value => Array.isArray(value) && value.every(row => object(row) &&
      ['from', 'to', 'break', 'breakDeduction'].every(key => row[key] == null || typeof row[key] === 'string'));
    const time = value => value == null || value === '' || (typeof value === 'string' && Shift.parseTime(value) !== null);
    const punches = value => object(value) && Shift.fields.every(key => time(value[key]));
    const validDay = value => object(value) && (value.mode == null || ['full', 'half', 'leave', 'holiday', 'sat1', 'sat3'].includes(value.mode)) &&
      (value.notes == null || typeof value.notes === 'string') && (value.punches == null || punches(value.punches)) &&
      Shift.fields.every(key => time(value[key])) && time(value.in) && (value.out === '--:--' || time(value.out)) &&
      (value.targetShift == null || time(value.targetShift)) && (value.audit == null || Audit.valid(value.audit));
    if (!object(data) || data.format !== 'punchly-backup' || data.version !== 1 || !Array.isArray(data.history) ||
        !data.history.every(record => validDay(record) && typeof record.id === 'string' && record.id && date(record.date) &&
          ['totalMinutes', 'targetMinutes', 'extraMinutes', 'lunchMinutes', 'lunchLimitMinutes', 'lunchDeductionMinutes', 'baseTargetMinutes']
            .every(key => record[key] == null || (Number.isFinite(record[key]) && record[key] >= 0)) &&
          (record.kind === 'daily' || (record.kind === 'weekly' && schedule(record.schedule)))) ||
        (data.settings != null && !validSettings(data.settings)) || (data.today != null && !validDay(data.today)) ||
        (data.week != null && (!object(data.week) || !schedule(data.week.rows))) ||
        (data.drafts != null && (!object(data.drafts) || !Object.entries(data.drafts).every(([key, draft]) =>
          date(key) && validDay(draft))))) {
      throw new Error('This file is not a supported Punchly backup.');
    }
    const dates = new Set();
    const ids = new Set();
    for (const record of data.history) {
      if (record.kind === 'daily' && dates.has(record.date)) throw new Error(`The backup contains duplicate attendance dates: ${record.date}.`);
      if (ids.has(record.id)) throw new Error(`The backup contains a duplicate record ID: ${record.id}.`);
      if (record.kind === 'daily') dates.add(record.date);
      ids.add(record.id);
    }
  }

  function importSettings(data) {
    if (data?.format !== 'punchly-settings' || data.version !== 1 || !data.settings ||
        !validSettings(data.settings)) throw new Error('This file is not a supported Punchly settings export.');
    const settings = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, data.settings[key] ?? value]));
    if (!write(keys.SETTINGS, settings)) throw new Error(lastWriteFailure || 'The browser could not save these settings.');
  }

  function restoreKeys(entries) {
    const previous = entries.map(([key]) => [key, localStorage.getItem(key)]);
    const changed = [];
    try {
      entries.forEach(([key, value], index) => {
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
        changed.push(previous[index]);
      });
    } catch (error) {
      changed.forEach(([key]) => localStorage.removeItem(key));
      changed.forEach(([key, value]) => { if (value !== null) localStorage.setItem(key, value); });
      throw error;
    }
  }

  function punchState(date) {
    const history = normalizeHistory();
    const record = historyCache ? historyCache.daily.get(date) : history.find(item => item.kind === 'daily' && item.date === date);
    const draft = getDrafts()[date];
    return { record, draft };
  }

  function undoPunch(date, before, after) {
    const current = punchState(date);
    if (issues.has(keys.HISTORY) || issues.has(keys.DRAFTS)) throw new Error('Undo is unavailable while stored records need recovery.');
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (!same(current, after)) return false;
    const changes = [];
    if (!same(before.draft, after.draft)) {
      const drafts = getDrafts();
      if (before.draft) drafts[date] = before.draft;
      else delete drafts[date];
      changes.push([keys.DRAFTS, drafts]);
    }
    if (!same(before.record, after.record)) {
      const history = normalizeHistory().slice();
      const index = history.findIndex(item => item.kind === 'daily' && item.date === date);
      if (before.record && index >= 0) history[index] = before.record;
      else if (before.record) history.push(before.record);
      else if (index >= 0) history.splice(index, 1);
      changes.push([keys.HISTORY, history]);
    }
    if (changes.length) restoreKeys(changes);
    return true;
  }

  const recoveryKeys = [...Object.values(keys), migrationKey];
  function recoverySnapshot() {
    const raw = Object.fromEntries(recoveryKeys.map(key => [key, localStorage.getItem(key)]));
    return { format: 'punchly-recovery', version: 1, capturedAt: new Date().toISOString(), raw };
  }
  function beginRecovery() {
    if (localStorage.getItem(recoveryKey)) throw new Error('A previous recovery snapshot is still available. Restore or download it before importing again.');
    const snapshot = recoverySnapshot();
    try { localStorage.setItem(recoveryKey, JSON.stringify(snapshot)); }
    catch (error) {
      throw new Error(error.name === 'QuotaExceededError' ? 'Storage is full. Free space before importing so Punchly can create a recovery copy.' : 'Punchly could not create a recovery copy. Check browser storage access.');
    }
    return snapshot;
  }
  function applyRecovery(snapshot) {
    if (!snapshot || snapshot.format !== 'punchly-recovery' || snapshot.version !== 1 || !snapshot.raw ||
        !recoveryKeys.every(key => Object.hasOwn(snapshot.raw, key) && (snapshot.raw[key] === null || typeof snapshot.raw[key] === 'string'))) {
      throw new Error('The recovery copy is invalid.');
    }
    recoveryKeys.forEach(key => localStorage.removeItem(key));
    recoveryKeys.forEach(key => { if (snapshot.raw[key] !== null) localStorage.setItem(key, snapshot.raw[key]); });
    issues.clear();
  }
  function recoverPrevious() {
    const raw = localStorage.getItem(recoveryKey);
    if (!raw) throw new Error('No recovery copy is available.');
    try { applyRecovery(JSON.parse(raw)); localStorage.removeItem(recoveryKey); }
    catch (error) { throw new Error('Recovery could not be completed. The recovery copy is still available to download.'); }
  }
  function diagnostics() {
    normalizeHistory(false);
    getDrafts();
    getSettings();
    const today = read(keys.TODAY, null);
    const week = read(keys.WEEK, null);
    if (today !== null && (!today || typeof today !== 'object' || Array.isArray(today) ||
      (today.punches != null && (typeof today.punches !== 'object' || Array.isArray(today.punches))) ||
      Shift.fields.some(field => {
        const value = today.punches?.[field] ?? today[field];
        return value != null && value !== '' && Shift.parseTime(value) === null;
      }))) issues.set(keys.TODAY, 'Saved day data is malformed.');
    if (week !== null && (!week || typeof week !== 'object' || Array.isArray(week) || !Array.isArray(week.rows) ||
      week.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row)))) issues.set(keys.WEEK, 'Saved weekly data is malformed.');
    let recovery = false;
    try { recovery = !!localStorage.getItem(recoveryKey); } catch (error) { issues.set(recoveryKey, 'Browser storage is unavailable.'); }
    return { issues: [...issues].map(([key, message]) => ({ key, message })), recovery };
  }
  function recoveryData() {
    const raw = localStorage.getItem(recoveryKey);
    if (!raw) return recoverySnapshot();
    try { return JSON.parse(raw); }
    catch (error) { return { ...recoverySnapshot(), damagedRecovery: raw }; }
  }
  function storedStamp(key) {
    try { return localStorage.getItem(key) || ''; } catch (error) { return ''; }
  }
  function markStamp(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (error) { return false; }
  }

  function hasBackupRecords() {
    const hasDayData = draft => Shift.hasPunches(draft?.punches ?? draft) ||
      Shift.isDayOff(draft?.mode) || (typeof draft?.notes === 'string' && Boolean(draft.notes.trim()));
    return normalizeHistory().length > 0 || Object.values(getDrafts()).some(hasDayData) ||
      hasDayData(read(keys.TODAY, null)) || Boolean(read(keys.WEEK, null)?.rows?.length);
  }

  function deleteProfile() {
    const { avatar, profilePhoto, profileNameSource, ...settings } = getSettings();
    Object.keys(profileLengths).forEach(field => delete settings[field]);
    return write(keys.SETTINGS, settings);
  }

  function needsSetup() {
    const state = diagnostics();
    if (state.issues.length || state.recovery) return false;
    const history = read(keys.HISTORY, []);
    const legacy = read(legacyWeekKey, []);
    return !read(setupKey, false) && !read(keys.SETTINGS, null) && !read(keys.TODAY, null) &&
      !read(keys.WEEK, null) && !Object.keys(getDrafts()).length &&
      !(Array.isArray(history) && history.length) && !(Array.isArray(legacy) && legacy.length);
  }

  function finishSetup(settings) {
    try {
      restoreKeys([[keys.SETTINGS, settings], [setupKey, true]]);
      return true;
    } catch (error) {
      console.warn('Punchly could not save initial setup.', error);
      return false;
    }
  }

  function reset() {
    const entries = [...Object.values(keys), setupKey, legacyWeekKey, migrationKey, lastBackupKey, backupReminderKey,
      'punchly_reminder_log', 'punchly_mobile_timer_alerts'].map(key => [key, null]);
    try {
      restoreKeys([...entries, [resetKey, new Date().toISOString()]]);
      return true;
    } catch (error) {
      console.warn('Punchly could not reset browser storage.', error);
      return false;
    }
  }

  function importBackup(data, merge = true) {
    validateBackup(data);
    const identity = record => record.kind === 'daily' ? `daily:${record.date}` : `weekly:${record.id}`;
    if (merge && diagnostics().issues.length) throw new Error('Existing stored data is damaged. Download recovery data or use Replace with a valid backup.');
    const snapshot = beginRecovery();
    try {
      const history = new Map(merge ? normalizeHistory().map(record => [identity(record), record]) : []);
      let added = 0;
      for (const record of data.history) {
        const key = identity(record);
        if (!history.has(key)) {
          history.set(key, record);
          added++;
        }
      }
      const drafts = { ...data.drafts, ...(merge ? read(keys.DRAFTS, {}) : {}) };
      const entries = [
        [keys.HISTORY, [...history.values()]],
        [keys.DRAFTS, drafts],
        [keys.TODAY, (merge && read(keys.TODAY, null)) || data.today || null],
        [keys.WEEK, (merge && read(keys.WEEK, null)) || data.week || null]
      ];
      if (!merge) entries.push([keys.SETTINGS, { ...defaults, ...data.settings }], [migrationKey, true]);
      restoreKeys(entries);
      issues.clear();
      localStorage.removeItem(recoveryKey);
      return added;
    } catch (error) {
      console.warn('Punchly backup restore could not be completed.', error);
      let restored = false;
      try { applyRecovery(snapshot); localStorage.removeItem(recoveryKey); restored = true; } catch (recoveryError) { /* Keep the recovery copy. */ }
      const reason = error.name === 'QuotaExceededError' ? 'Browser storage is full.' : 'The browser could not save the backup.';
      throw new Error(`${reason} ${restored ? 'Your original data was restored.' : 'Automatic recovery failed; download the recovery copy in Settings → Data & backups.'}`);
    }
  }
  function duplicateDates(data) {
    validateBackup(data);
    try {
      const current = JSON.parse(localStorage.getItem(keys.HISTORY) || '[]');
      if (!Array.isArray(current)) return [];
      const dates = new Set(current.filter(record => record && (record.kind === 'daily' || !record.kind)).map(record => record.date));
      return data.history.filter(record => record.kind === 'daily' && dates.has(record.date)).map(record => record.date);
    } catch (error) { return []; }
  }
  return {
    keys, resetKey, avatarOptions, profileDetails,
    getToday: () => read(keys.TODAY, null), saveToday: data => write(keys.TODAY, data),
    getDraft(date) { return getDrafts()[date] || null; },
    getDrafts,
    saveDraft(date, draft) { const drafts = getDrafts(); drafts[date] = draft; return write(keys.DRAFTS, drafts); },
    deleteDraft(date) { const drafts = getDrafts(); delete drafts[date]; return write(keys.DRAFTS, drafts); },
    getWeek: () => read(keys.WEEK, null), saveWeek: data => write(keys.WEEK, data),
    getHistory: () => normalizeHistory().slice(),
    getDaily(date) {
      const history = normalizeHistory();
      return historyCache ? historyCache.daily.get(date) : history.find(record => record.kind === 'daily' && record.date === date);
    },
    getDailyEntries(dates) {
      const history = normalizeHistory();
      const index = historyCache?.daily ?? dailyIndex(history);
      return new Map(dates.map(date => [date, index.get(date)]));
    },
    getSettings, saveSettings: value => write(keys.SETTINGS, value),
    saveRecord, punchState, undoPunch,
    deleteRecord(id) { return write(keys.HISTORY, normalizeHistory().filter(item => item.id !== id)); },
    exportBackup() {
      const state = diagnostics();
      if (state.issues.length || state.recovery) throw new Error('Stored data needs recovery. Download recovery data from Settings → Data & backups before exporting a normal backup.');
      return { format: 'punchly-backup', version: 1, exportedAt: new Date().toISOString(), settings: getSettings(), today: read(keys.TODAY, null), drafts: read(keys.DRAFTS, {}), week: read(keys.WEEK, null), history: normalizeHistory() };
    },
    validateBackup, importBackup, importSettings, needsSetup, finishSetup, deleteProfile, reset,
    diagnostics, recoveryData, recoverPrevious, duplicateDates, hasBackupRecords,
    lastBackup: () => storedStamp(lastBackupKey), markBackup: () => markStamp(lastBackupKey, new Date().toISOString()),
    lastBackupReminder: () => storedStamp(backupReminderKey), markBackupReminder: stamp => markStamp(backupReminderKey, stamp),
    lastError: () => lastWriteFailure
  };
})();
