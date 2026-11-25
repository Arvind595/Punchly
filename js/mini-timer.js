const MiniTimer = (() => {
  function countdown(result, elapsed, now) {
    if (!result.started || result.complete || result.error || result.targetOut === null || elapsed === null) return '—';
    const seconds = Math.max(0, (result.targetOut - elapsed) * 60 - now.getSeconds());
    return `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m ${String(seconds % 60).padStart(2, '0')}s`;
  }

  function timing(result, elapsed, now, dayOff) {
    if (dayOff) return { status: 'Day off', countdown: '—' };
    if (result.error) return { status: 'Check punches', countdown: '—' };
    if (result.complete) return { status: 'Completed', countdown: '—' };
    if (!result.started) return { status: 'Not started', countdown: '—' };
    if (result.lunchOpen) return { status: 'Lunch', countdown: countdown(result, elapsed, now) };
    if (result.target > 0 && result.total >= result.target) {
      const seconds = (result.total - result.target) * 60 + (result.timeline?.now != null ? now.getSeconds() : 0);
      const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
      return { status: seconds < 60 ? 'Target reached' : 'Overtime',
        countdown: '+' + parts.map(part => String(part).padStart(2, '0')).join(':') };
    }
    return { status: 'Working', countdown: countdown(result, elapsed, now) };
  }

  function connect({ desktop, snapshot, preferences, openMain }) {
    const button = document.getElementById('miniTimerToggle');
    const panel = document.getElementById('miniTimer');
    const closeButton = document.getElementById('miniTimerClose');
    const worked = document.getElementById('miniTimerWorked');
    const target = document.getElementById('miniTimerTarget');
    const counter = document.getElementById('miniTimerCountdown');
    const counterLabel = document.getElementById('miniTimerCounterLabel');
    const status = document.getElementById('miniTimerStatus');
    const note = document.getElementById('miniTimerNote');
    const home = panel.parentNode;
    let popup;
    let opening = false;
    let ticker;

    function refresh(now = new Date()) {
      if (panel.hidden) return;
      if (popup?.closed) { close(); return; }
      const settings = preferences();
      if (popup && !settings.miniTimerOnTop) {
        const previous = popup;
        popup = null;
        home.append(panel);
        previous.close();
      }
      const data = snapshot(now);
      worked.textContent = data.worked;
      target.textContent = data.target;
      counter.textContent = data.countdown;
      counterLabel.textContent = data.countdown.startsWith('+') ? 'Overtime' : 'Time left';
      if (status.textContent !== data.status) status.textContent = data.status;
      note.textContent = popup ? data.note : [data.note, 'Floats inside Punchly.'].filter(Boolean).join(' ');
      panel.style.opacity = settings.miniTimerOpacity / 100;
      if (popup) {
        const styles = getComputedStyle(document.documentElement);
        popup.document.documentElement.style.colorScheme = styles.colorScheme;
        for (const color of ['--bg-color', '--surface-color', '--text-primary', '--text-secondary', '--accent-color', '--border-color', '--app-font']) {
          popup.document.documentElement.style.setProperty(color, styles.getPropertyValue(color));
        }
      }
    }

    function hide() {
      clearInterval(ticker);
      ticker = null;
      home.append(panel);
      panel.hidden = true;
      button.setAttribute('aria-pressed', 'false');
    }

    function close() {
      const current = popup;
      popup = null;
      hide();
      if (current && !current.closed) current.close();
    }

    function showInWindow(pip) {
      const page = pip.document;
      page.title = 'Punchly mini timer';
      const style = page.createElement('style');
      style.textContent = `
        * { box-sizing: border-box; }
        body { margin: 0; padding: 8px; background: var(--bg-color, #f4f4f8); color: var(--text-primary, #202039); font: 14px/1.35 var(--app-font, system-ui, sans-serif); }
        .mini-timer { padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 12px; background: var(--surface-color, #fff); cursor: pointer; }
        .mini-timer-heading, dl { display: flex; justify-content: space-between; align-items: start; gap: 8px; }
        h2 { font-size: 14px; margin: 5px 0; }
        button { border: 0; background: transparent; color: var(--accent-color, #5546cc); font-size: 18px; min-width: 36px; min-height: 32px; cursor: pointer; }
        #miniTimerOpen { padding: 0; font: inherit; text-align: left; font-weight: 700; }
        #miniTimerStatus { color: var(--accent-color); font-weight: 700; margin-top: 0; }
        .ui-icon svg { width: 1.2em; height: 1.2em; fill: currentColor; vertical-align: middle; }
        dl { margin: 6px 0; gap: 10px; flex-wrap: wrap; }
        dt, p { color: var(--text-secondary, #59596e); font-size: 12px; }
        dd { margin: 2px 0 0; font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
        p { margin: 8px 0 0; }
      `;
      page.head.append(style);
      page.body.append(panel);
      pip.addEventListener('pagehide', () => {
        if (popup !== pip) return;
        popup = null;
        hide();
      }, { once: true });
    }

    async function floatTimer() {
      if (popup || opening || panel.hidden || !desktop() || !preferences().miniTimerOnTop) return;
      const api = window.documentPictureInPicture;
      if (typeof api?.requestWindow !== 'function') return;
      opening = true;
      let pip;
      try {
        pip = await api.requestWindow({ width: 360, height: 182 });
      } catch (error) {
        // Show the timer within Punchly if the browser cannot open the window.
      } finally {
        opening = false;
      }
      if (panel.hidden || !desktop() || !preferences().miniTimerOnTop) { pip?.close(); return; }
      if (pip && !pip.closed) {
        try {
          showInWindow(pip);
          popup = pip;
        } catch (error) {
          home.append(panel);
          pip.close();
        }
      }
      refresh();
    }

    function applyOnTop() {
      refresh();
      // Request the window during the settings gesture, which grants browser activation.
      return floatTimer();
    }

    function show() {
      if (!panel.hidden) return;
      panel.hidden = false;
      button.setAttribute('aria-pressed', 'true');
      refresh();
      ticker = setInterval(() => refresh(), 1000);
    }

    button.addEventListener('click', () => {
      if (!desktop()) return;
      if (!panel.hidden) { close(); return; }
      show();
      return floatTimer();
    });

    closeButton.addEventListener('click', () => { close(); if (desktop()) button.focus(); });
    document.getElementById('miniTimerOpen').addEventListener('click', openMain);
    panel.addEventListener('click', event => { if (!event.target.closest('button')) openMain(); });
    window.addEventListener('pagehide', close);
    return { close, refresh, applyOnTop, show };
  }

  return { connect, countdown, timing };
})();
