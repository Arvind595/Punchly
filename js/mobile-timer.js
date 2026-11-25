const MobileTimerNotifications = (() => {
  const tag = 'punchly-mini-timer';
  const logKey = 'punchly_mobile_timer_alerts';

  function connect(settings) {
    const android = /Android/i.test(navigator.userAgentData?.platform || navigator.userAgent);
    const supported = android && window.isSecureContext && 'Notification' in window && Boolean(navigator.serviceWorker);
    document.getElementById('androidTimerOptions').hidden = !android;
    let previousKey = '';
    let postedShift = '';
    let log;
    let queued;
    let updating;
    let checkedEmpty = false;

    function getLog(shift) {
      let saved;
      try { saved = JSON.parse(localStorage.getItem(logKey)); } catch {}
      const remembered = log?.shift === shift ? log : { shift };
      log = saved?.shift === shift ? { ...remembered, ...saved } : remembered;
      return log;
    }

    async function render(registration, data) {
      if (!settings.mobileTimerEnabled || !data?.active || Notification.permission !== 'granted') {
        if (!checkedEmpty) {
          for (const item of await registration.getNotifications({ tag })) item.close();
          checkedEmpty = true;
        }
        postedShift = previousKey = '';
        return;
      }
      checkedEmpty = false;
      const sent = getLog(data.shift);
      const target = settings.mobileTimerTarget && data.targetReached && !sent.target;
      const overtime = settings.mobileTimerOvertime && data.status === 'Overtime' && !sent.overtime;
      const alert = overtime || target;
      const key = JSON.stringify([data.shift, data.status, data.worked, data.target]);
      if (!alert && key === previousKey) return;
      if (!alert && postedShift === data.shift && !(await registration.getNotifications({ tag })).length) return;
      const title = overtime ? 'Punchly · Overtime started' : target ? 'Punchly · Target out reached' : 'Punchly mini timer';
      const body = [data.status, `Worked ${data.worked}`, data.target !== '—' && `Target out ${data.target}`].filter(Boolean).join(' · ');
      await registration.showNotification(title, {
        body, tag, icon: 'assets/icon-192.png', timestamp: data.updatedAt, requireInteraction: true,
        silent: !alert, renotify: alert, data: { openMiniTimer: true }
      });
      previousKey = key;
      postedShift = data.shift;
      if (alert) {
        if (target) sent.target = true;
        if (overtime) sent.overtime = true;
        try { localStorage.setItem(logKey, JSON.stringify(sent)); } catch {}
      }
    }

    function update(data) {
      if (!supported) return;
      queued = { data };
      if (updating) return updating;
      updating = (async () => {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (!registration?.active) return;
          while (queued) {
            const current = queued.data;
            queued = undefined;
            if (navigator.locks?.request) {
              await navigator.locks.request(logKey, () => render(registration, current));
            } else {
              await render(registration, current);
            }
          }
        } catch {
          // Browser settings or platform notification policy may prevent posting.
        }
      })().finally(() => { updating = null; });
      return updating;
    }

    return { supported, update };
  }

  return { connect };
})();
