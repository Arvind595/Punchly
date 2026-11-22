const MiniTimer = (() => {
  function connect({ desktop, snapshot }) {
    const button = document.getElementById('miniTimerToggle');
    const panel = document.getElementById('miniTimer');
    const closeButton = document.getElementById('miniTimerClose');
    const worked = document.getElementById('miniTimerWorked');
    const target = document.getElementById('miniTimerTarget');
    const note = document.getElementById('miniTimerNote');
    const home = panel.parentNode;
    let popup;
    let opening = false;

    function refresh(now = new Date()) {
      if (panel.hidden) return;
      if (popup?.closed) { close(); return; }
      const data = snapshot(now);
      worked.textContent = data.worked;
      target.textContent = data.target;
      note.textContent = popup ? data.note : [data.note, 'Floats inside Punchly.'].filter(Boolean).join(' ');
      if (popup) {
        const styles = getComputedStyle(document.documentElement);
        for (const color of ['--surface-color', '--text-primary', '--text-secondary', '--accent-color']) {
          popup.document.documentElement.style.setProperty(color, styles.getPropertyValue(color));
        }
      }
    }

    function hide() {
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
        body { margin: 0; padding: 12px; background: var(--surface-color, #fff); color: var(--text-primary, #202039); font: 14px/1.35 system-ui, sans-serif; }
        .mini-timer-heading, dl { display: flex; justify-content: space-between; align-items: start; gap: 8px; }
        h2 { font-size: 14px; margin: 5px 0; }
        button { border: 0; background: transparent; color: var(--accent-color, #5546cc); font-size: 18px; min-width: 36px; min-height: 32px; cursor: pointer; }
        .ui-icon svg { width: 1.2em; height: 1.2em; fill: currentColor; vertical-align: middle; }
        dl { margin: 6px 0; }
        dt, p { color: var(--text-secondary, #59596e); font-size: 12px; }
        dd { margin: 2px 0 0; font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; }
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

    button.addEventListener('click', async () => {
      if (!desktop() || opening) return;
      if (!panel.hidden) { close(); return; }
      const api = window.documentPictureInPicture;
      opening = true;
      let pip;
      try {
        if (typeof api?.requestWindow === 'function') pip = await api.requestWindow({ width: 275, height: 150 });
      } catch (error) {
        // Show the timer within Punchly if the browser cannot open the window.
      } finally {
        opening = false;
      }
      if (!desktop()) { pip?.close(); return; }
      if (pip && !pip.closed) {
        try {
          showInWindow(pip);
          popup = pip;
        } catch (error) {
          home.append(panel);
          pip.close();
        }
      }
      panel.hidden = false;
      button.setAttribute('aria-pressed', 'true');
      refresh();
    });

    closeButton.addEventListener('click', () => { close(); if (desktop()) button.focus(); });
    window.addEventListener('pagehide', close);
    return { close, refresh };
  }

  return { connect };
})();
