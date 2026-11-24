const Reminders = (() => {
  const logKey = 'punchly_reminder_log';
  const memoryLog = new Set();
  const backupInterval = 7 * 86400000;

  function claim(key, today) {
    if (memoryLog.has(key)) return false;
    try {
      const log = JSON.parse(localStorage.getItem(logKey)) || {};
      if (log[key]) return false;
      const cutoff = Date.parse(today) - 2 * 86400000;
      const recent = Object.fromEntries(Object.entries(log).filter(([, date]) => Date.parse(date) >= cutoff));
      recent[key] = today;
      localStorage.setItem(logKey, JSON.stringify(recent));
    } catch (error) {
      // The in-memory log still prevents repeat alerts when storage is unavailable.
    }
    memoryLog.add(key);
    return true;
  }

  async function sendDeviceAlert(message) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const options = { body: message, icon: 'assets/icon-192.png', tag: 'punchly-reminder' };
    try {
      const registration = navigator.serviceWorker?.controller && await navigator.serviceWorker.getRegistration();
      if (registration) await registration.showNotification('Punchly reminder', options);
      else new Notification('Punchly reminder', options);
    } catch (error) {
      // The in-app banner remains available if the browser cannot display an alert.
    }
  }

  function connect(settings) {
    const buttons = ['enableNotifications', 'setupNotifications'].map(id => document.getElementById(id));
    const statuses = ['notificationStatus', 'setupNotificationStatus'].map(id => document.getElementById(id));
    const banner = document.getElementById('reminderBanner');
    const message = document.getElementById('reminderMessage');
    const backupBanner = document.getElementById('backupReminder');
    const backupButton = document.getElementById('reminderExportBackup');
    let lastBackupReminder = 0;
    const supported = 'Notification' in window && window.isSecureContext;
    function showPermission() {
      const permission = supported ? Notification.permission : 'unsupported';
      buttons.forEach(button => { button.disabled = permission !== 'default'; });
      const messages = {
        granted: 'Device alerts are enabled.',
        denied: 'Device alerts are blocked. Change the site permission in your browser to enable them.',
        unsupported: 'Device alerts are unavailable here. In-app reminders still work.'
      };
      statuses[0].textContent = messages[permission] || 'In-app reminders are on when scheduled.';
      statuses[1].textContent = messages[permission] || 'Allow device alerts to receive scheduled punch reminders.';
    }
    buttons.forEach(button => button.addEventListener('click', async () => {
      if (!supported) return;
      const respond = UiSounds.feedback();
      try {
        const permission = await Notification.requestPermission();
        showPermission();
        if (permission === 'granted') respond('success');
        else if (permission === 'denied') respond('blocked');
      } catch (error) {
        showPermission();
        respond('error');
      }
    }));
    document.getElementById('dismissReminder').addEventListener('click', () => { banner.hidden = true; });
    const hideBackupReminder = () => { backupBanner.hidden = true; };
    document.getElementById('dismissBackupReminder').addEventListener('click', hideBackupReminder);
    window.addEventListener('punchly:backup-exported', hideBackupReminder);
    backupButton.addEventListener('click', async () => {
      backupButton.disabled = true;
      try { await window.downloadBackup(); }
      catch (error) { /* The export flow shows the error. */ }
      finally { backupButton.disabled = false; }
    });
    window.addEventListener('focus', showPermission);
    showPermission();

    function check(now, today, day, activeShift, audible) {
      const messages = [];
      const elapsed = now.getHours() * 60 + now.getMinutes();
      function due(value) {
        const minute = Shift.parseTime(value);
        return minute !== null && elapsed >= minute && elapsed - minute <= 5;
      }
      const workingDay = !Shift.isHoliday(day.mode, day.punches);
      const pendingClockOut = Boolean(activeShift?.punches.morningIn && !activeShift.punches.eveningOut);
      if (settings.workdays.includes(now.getDay()) && workingDay) {
        if (!day.punches.morningIn && !pendingClockOut && due(settings.reminderIn) &&
            claim(`${today}:in:${settings.reminderIn}`, today)) messages.push('Time to punch in.');
        if ((day.punches.morningIn && !day.punches.eveningOut || pendingClockOut) && due(settings.reminderOut) &&
            claim(`${today}:out:${settings.reminderOut}`, today)) messages.push('Time to punch out.');
        if (pendingClockOut && activeShift.mode === 'full') {
          if (!activeShift.punches.lunchOut && due(settings.reminderLunchOut) &&
              claim(`${today}:lunch-out:${settings.reminderLunchOut}`, today)) messages.push('Time to punch out for lunch.');
          if (activeShift.punches.lunchOut && !activeShift.punches.lunchReturn && due(settings.reminderLunchReturn) &&
              claim(`${today}:lunch-return:${settings.reminderLunchReturn}`, today)) messages.push('Time to punch back in from lunch.');
        }
      }
      const result = activeShift?.result;
      if (settings.reminderTarget && result?.started && result.target > 0 &&
          result.total >= result.target && claim(`${activeShift.date}:target`, today)) {
        messages.push('You reached your work target.');
      }
      if (!messages.length) return;
      message.textContent = messages.join(' ');
      banner.hidden = false;
      if (audible) UiSounds.play('notification', { cooldownMs: 2000 });
      sendDeviceAlert(message.textContent);
    }
    function checkBackup(now) {
      if (document.hidden) return;
      const exported = Date.parse(Storage.lastBackup()) || 0;
      if (exported >= lastBackupReminder && exported > 0) hideBackupReminder();
      const latest = Math.max(exported, lastBackupReminder, Date.parse(Storage.lastBackupReminder()) || 0);
      if (now.getTime() - latest < backupInterval || !Storage.hasBackupRecords()) return;
      lastBackupReminder = now.getTime();
      Storage.markBackupReminder(now.toISOString());
      backupBanner.hidden = false;
    }
    return { check, checkBackup };
  }

  return { connect };
})();
