const Storage = (() => {
  const keys = { TODAY: 'punchly_today_state', DRAFTS: 'punchly_daily_drafts', HISTORY: 'punchly_history', SETTINGS: 'punchly_settings', WEEK: 'punchly_week_state' };
  const avatarOptions = [['fox', 'Fox'], ['whale', 'Whale'], ['fern', 'Fern'], ['coffee', 'Coffee'], ['orbit', 'Orbit'], ['initials', 'Initials']];
  const oldAvatars = new Map([['sun', 'fox'], ['moon', 'orbit'], ['bolt', 'coffee'], ['leaf', 'fern']]);
  const legacyWeekKey = 'timecard_calculator_history_v1';
  const migrationKey = 'punchly_legacy_weekly_migrated_v1';
  const resetKey = 'punchly_last_reset';
  const setupKey = 'punchly_setup_complete';
  const profileLengths = { displayName: 48, employeeId: 40, employeeEmail: 254, role: 60, department: 60 };
  const defaults = {
    targetShift: '08:20',
    font: 'manrope',
    avatar: avatarOptions[0][0],
    profilePhoto: '',
    compactMode: true,
    mobileHaptics: true,
    punchAudio: true,
    soundVolume: 70,
    typingSounds: false,
    reminderIn: '',
    reminderLunchOut: '',
    reminderLunchReturn: '',
    reminderOut: '',
    reminderTarget: false,
    lunchLimit: 45,
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
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`Punchly could not read ${key}; using an empty value.`, error);
      return fallback;
    }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { console.error(`Punchly could not save ${key}.`, error); return false; }
  }
  function isoDate(value) {
    if (!value) return new Date().toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }
  function normalizeHistory() {
    const current = read(keys.HISTORY, []);
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
    if (JSON.stringify(history) !== JSON.stringify(current)) write(keys.HISTORY, history);
    if (!migrationDone) write(migrationKey, true);
    return history;
  }
  function parseDuration(value) {
    if (typeof value !== 'string') return 0;
    const match = value.match(/(\d+)\s*h\s*(\d+)\s*m/i);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
  }
  function getSettings() {
    const value = read(keys.SETTINGS, {});
    const settings = { ...defaults, ...(value && typeof value === 'object' ? value : {}) };
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(settings.targetShift) || settings.targetShift === '00:00') settings.targetShift = defaults.targetShift;
    if (!Number.isInteger(settings.lunchLimit) || settings.lunchLimit < 0 || settings.lunchLimit > 720) settings.lunchLimit = defaults.lunchLimit;
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
    settings.mobileHaptics = settings.mobileHaptics !== false;
    settings.punchAudio = settings.punchAudio !== false;
    if (!Number.isInteger(settings.soundVolume) || settings.soundVolume < 0 || settings.soundVolume > 100) {
      settings.soundVolume = defaults.soundVolume;
    }
    settings.typingSounds = settings.typingSounds === true;
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
    const history = normalizeHistory();
    const next = { ...record, id: record.id || `${record.kind || 'daily'}-${record.date}-${Date.now()}` };
    const index = history.findIndex(item => item.id === next.id || (next.kind === 'daily' && item.kind === 'daily' && item.date === next.date));
    if (index >= 0) history[index] = next; else history.push(next);
    return write(keys.HISTORY, history);
  }

  function getDrafts() {
    const drafts = read(keys.DRAFTS, {});
    return drafts && typeof drafts === 'object' && !Array.isArray(drafts) ? drafts : {};
  }

  function validateBackup(data) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    const schedule = value => Array.isArray(value) && value.every(row => object(row) &&
      ['from', 'to', 'break', 'breakDeduction'].every(key => row[key] == null || typeof row[key] === 'string'));
    if (!object(data) || data.format !== 'punchly-backup' || data.version !== 1 || !Array.isArray(data.history) ||
        !data.history.every(record => object(record) && typeof record.id === 'string' && date(record.date) &&
          (record.audit == null || Audit.valid(record.audit)) &&
          (record.kind === 'daily' || (record.kind === 'weekly' && schedule(record.schedule)))) ||
        (data.settings != null && !object(data.settings)) || (data.today != null && !object(data.today)) ||
        (data.week != null && (!object(data.week) || !schedule(data.week.rows))) ||
        (data.drafts != null && (!object(data.drafts) || !Object.entries(data.drafts).every(([key, draft]) =>
          date(key) && object(draft) && (draft.audit == null || Audit.valid(draft.audit)))))) {
      throw new Error('This file is not a supported Punchly backup.');
    }
  }

  function importSettings(data) {
    if (data?.format !== 'punchly-settings' || data.version !== 1 || !data.settings ||
        typeof data.settings !== 'object' || Array.isArray(data.settings)) throw new Error('This file is not a supported Punchly settings export.');
    const settings = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, data.settings[key] ?? value]));
    if (!write(keys.SETTINGS, settings)) throw new Error('The browser could not save these settings.');
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
      changed.reverse().forEach(([key, value]) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      });
      throw error;
    }
  }

  function deleteProfile() {
    const { avatar, profilePhoto, ...settings } = getSettings();
    Object.keys(profileLengths).forEach(field => delete settings[field]);
    return write(keys.SETTINGS, settings);
  }

  function needsSetup() {
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
    const entries = [...Object.values(keys), setupKey, legacyWeekKey, migrationKey, 'punchly_reminder_log'].map(key => [key, null]);
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
    if (!merge) entries.push([keys.SETTINGS, { ...defaults, ...data.settings }]);
    try { restoreKeys(entries); }
    catch (error) {
      console.warn('Punchly backup restore could not be completed.', error);
      throw new Error('The browser could not save the backup. Check available storage and try again.');
    }
    return added;
  }
  return {
    keys, resetKey, avatarOptions, profileDetails,
    getToday: () => read(keys.TODAY, null), saveToday: data => write(keys.TODAY, data),
    getDraft(date) { return getDrafts()[date] || null; },
    getDrafts,
    saveDraft(date, draft) { const drafts = getDrafts(); drafts[date] = draft; return write(keys.DRAFTS, drafts); },
    deleteDraft(date) { const drafts = getDrafts(); delete drafts[date]; return write(keys.DRAFTS, drafts); },
    getWeek: () => read(keys.WEEK, null), saveWeek: data => write(keys.WEEK, data),
    getHistory: normalizeHistory, getSettings, saveSettings: value => write(keys.SETTINGS, value),
    saveRecord,
    deleteRecord(id) { return write(keys.HISTORY, normalizeHistory().filter(item => item.id !== id)); },
    exportBackup() { return { format: 'punchly-backup', version: 1, exportedAt: new Date().toISOString(), settings: getSettings(), today: read(keys.TODAY, null), drafts: read(keys.DRAFTS, {}), week: read(keys.WEEK, null), history: normalizeHistory() }; },
    validateBackup, importBackup, importSettings, needsSetup, finishSetup, deleteProfile, reset
  };
})();
