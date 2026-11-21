const Reminders = (() => {
  const logKey = 'punchly_reminder_log';
  const memoryLog = new Set();

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
    const button = document.getElementById('enableNotifications');
    const status = document.getElementById('notificationStatus');
    const banner = document.getElementById('reminderBanner');
    const message = document.getElementById('reminderMessage');
    const supported = 'Notification' in window && window.isSecureContext;
    function showPermission() {
      const permission = supported ? Notification.permission : 'unsupported';
      button.disabled = permission !== 'default';
      const messages = {
        granted: 'Device alerts are enabled.',
        denied: 'Device alerts are blocked. Change the site permission in your browser to enable them.',
        unsupported: 'Device alerts are unavailable here. In-app reminders still work.'
      };
      status.textContent = messages[permission] || 'In-app reminders are on when scheduled.';
    }
    button.addEventListener('click', async () => {
      try { await Notification.requestPermission(); } catch (error) { /* Keep the in-app fallback. */ }
      showPermission();
    });
    document.getElementById('dismissReminder').addEventListener('click', () => { banner.hidden = true; });
    window.addEventListener('focus', showPermission);
    showPermission();

    function check(now, today, day, activeShift) {
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
      sendDeviceAlert(message.textContent);
    }
    return { check };
  }

  return { connect };
})();
