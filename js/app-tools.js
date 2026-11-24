const AppTools = (() => {
  const byId = id => document.getElementById(id);

  function modal(id, onClose, sound = true) {
    const dialog = byId(id);
    let previous;
    function finish() {
      previous?.focus();
      onClose?.();
    }
    function close() {
      if (dialog.close) dialog.close();
      else {
        dialog.removeAttribute('open');
        finish();
      }
    }
    function dismiss() {
      close();
      if (sound) UiSounds.play('close');
    }
    dialog.querySelector('[data-close]')?.addEventListener('click', dismiss);
    dialog.addEventListener('close', finish);
    dialog.addEventListener('keydown', event => {
      if (!dialog.showModal && event.key === 'Escape') dismiss();
    });
    dialog.addEventListener('cancel', () => { if (sound) UiSounds.play('close'); });
    return {
      close,
      open(withSound = sound) {
        if (dialog.hasAttribute('open')) return;
        previous = document.activeElement;
        if (dialog.showModal) dialog.showModal();
        else {
          dialog.setAttribute('open', '');
          dialog.querySelector('button, input, a')?.focus();
        }
        if (withSound) UiSounds.play('open');
      }
    };
  }

  function connectStartup(version) {
    const screen = byId('startupScreen');
    const profile = byId('startupProfile');
    const update = byId('startupUpdate');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const minVisible = reducedMotion ? 0 : 600;
    byId('startupVersion').textContent = `v${version}`;

    function profileReady(displayName) {
      profile.textContent = displayName ? `Profile ready · ${displayName}` : 'Local profile ready';
      profile.dataset.state = 'done';
      update.dataset.state = 'active';
      update.hidden = false;
    }

    function finish(initialUpdate, onReveal) {
      function revealApp() {
        byId('startupNotice').hidden = true;
        screen.hidden = true;
        document.documentElement.removeAttribute('data-app-starting');
        onReveal?.();
      }

      // Continue checking in the background if the update server is slow.
      const deadline = window.setTimeout(revealApp, 1200);
      initialUpdate.then(result => {
        if (screen.hidden) return;
        if (result === 'updating') {
          update.textContent = 'Opening the updated version…';
          return;
        }
        update.textContent = {
          current: 'Latest version checked',
          offline: 'Opening offline',
          local: 'Opening local copy'
        }[result] || 'Opening Punchly';
        update.dataset.state = result === 'offline' ? 'offline' : 'done';
        window.clearTimeout(deadline);
        const elapsed = performance.now() - Number(screen.dataset.startedAt);
        window.setTimeout(revealApp, Math.max(0, minVisible - elapsed));
      });
    }

    return { profileReady, finish };
  }

  function connectUpdates(version, dateKey, notify) {
    const status = byId('connectionStatus');
    const button = byId('refreshPage');
    const localFile = location.protocol === 'file:';
    const registration = 'serviceWorker' in navigator && window.isSecureContext && !localFile ?
      navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }).catch(() => null) :
      Promise.resolve(null);
    let checkedDay;
    let pending;
    let request;
    let triedRelease;

    function display(state) {
      status.dataset.state = state;
      status.textContent = { checking: 'Checking connection…', online: 'Connected', offline: 'Offline' }[state];
    }

    async function check(manual = false) {
      if (pending) return;
      if (!navigator.onLine) {
        display('offline');
        if (manual) notify('Offline. Your saved punches are available.');
        return 'offline';
      }
      if (localFile) {
        display('online');
        if (manual) location.reload();
        return 'local';
      }
      pending = true;
      button.setAttribute('aria-busy', 'true');
      const day = dateKey(new Date());
      request = new AbortController();
      const timeout = setTimeout(() => request.abort(), 5000);
      try {
        const response = await fetch('index.html', { cache: 'no-store', signal: request.signal });
        if (!response.ok) throw new Error('Punchly could not reach the app.');
        const html = await response.text();
        const next = /<meta name="punchly-release" content="(\d+)">/.exec(html)?.[1];
        if (!next) throw new Error('The response was not Punchly.');
        display('online');
        const daily = day !== checkedDay;
        const newer = Number(next) > Number(version) && triedRelease !== next;
        const editing = Boolean(document.querySelector('dialog[open]'));
        if (!newer || !editing) checkedDay = day;
        if (manual || daily) {
          registration.then(worker => worker?.update()).catch(() => {});
        }
        if (manual || (daily && newer && !editing && !hasReloaded(next))) {
          triedRelease = next;
          if (newer) {
            try { sessionStorage.setItem(`punchly-update-${version}`, next); } catch (error) { /* optional */ }
          }
          location.reload();
          return 'updating';
        }
        return 'current';
      } catch (error) {
        display('offline');
        if (manual) notify('Offline. Punchly could not reach its update server.');
        return 'offline';
      } finally {
        clearTimeout(timeout);
        request = null;
        pending = false;
        button.removeAttribute('aria-busy');
      }
    }

    function hasReloaded(next) {
      try { return sessionStorage.getItem(`punchly-update-${version}`) === next; }
      catch (error) { return false; }
    }

    function onReturn() {
      if (!document.hidden && (checkedDay !== dateKey(new Date()) || status.dataset.state !== 'online')) check();
    }
    button.addEventListener('click', () => check(true));
    window.addEventListener('online', async () => {
      const wasOffline = status.dataset.state === 'offline';
      const respond = UiSounds.feedback();
      const result = await check();
      if (wasOffline && (result === 'current' || result === 'local')) respond('connect', { cooldownMs: 1200 });
    });
    window.addEventListener('offline', () => {
      request?.abort();
      const wasOnline = status.dataset.state === 'online';
      display('offline');
      if (wasOnline) UiSounds.play('disconnect', { cooldownMs: 1200 });
    });
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('pageshow', onReturn);
    window.addEventListener('focus', onReturn);
    setInterval(() => { if (!document.hidden) check(); }, 60000);
    display('checking');
    return check();
  }

  function connectInvite(notify) {
    const dialog = modal('inviteDialog');
    const link = byId('inviteLink');
    const url = 'https://arvind595.github.io/Punchly/';
    async function invite() {
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Punchly', text: 'Try Punchly, a private time tracker.', url });
          return;
        } catch (error) {
          if (error.name === 'AbortError') return;
        }
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url);
        notify('Install link copied. Share it with a friend.');
      } catch (error) {
        dialog.open();
        link.focus();
        link.select();
      }
    }
    byId('inviteFriend').addEventListener('click', invite);
    byId('headerInvite').addEventListener('click', invite);
  }

  function connectHelp(version) {
    const help = modal('helpDialog');
    byId('openHelp').addEventListener('click', help.open);
    byId('settingsHelp').addEventListener('click', help.open);
    const support = modal('supportDialog');
    const heading = byId('reportHeading');
    const message = byId('reportMessage');
    const include = byId('reportDiagnostics');
    const preview = byId('reportPreview');
    const email = byId('openReportEmail');
    let subject;
    let device = '';
    let selection = 0;

    function updateEmail() {
      const body = [message.value.trim(), include.checked && device].filter(Boolean).join('\n\n');
      email.href = `mailto:arvindne555@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    document.querySelectorAll('[data-support]').forEach(button => button.addEventListener('click', () => {
      selection++;
      const issue = button.dataset.support === 'issue';
      subject = issue ? 'Punchly bug report' : 'Punchly feature request';
      heading.textContent = issue ? 'Report an issue' : 'Request a feature';
      message.placeholder = issue ? 'What happened? How can it be reproduced?' : 'What would you like to do in Punchly?';
      message.value = '';
      device = '';
      include.checked = false;
      preview.hidden = true;
      updateEmail();
      support.open();
    }));
    message.addEventListener('input', updateEmail);
    include.addEventListener('change', async () => {
      const current = ++selection;
      preview.hidden = !include.checked;
      if (!include.checked) { updateEmail(); return; }
      const userAgent = navigator.userAgentData;
      const lines = [
        `Punchly v${version} · ${document.documentElement.dataset.layout} layout`,
        `Browser: ${navigator.userAgent}`,
        `Viewport: ${innerWidth} × ${innerHeight} CSS pixels, DPR ${devicePixelRatio}`,
        `Screen: ${screen.width} × ${screen.height} CSS pixels`,
        `Language: ${navigator.language}`,
        `Standalone: ${matchMedia('(display-mode: standalone)').matches || navigator.standalone === true}`,
        `Connection: ${byId('connectionStatus').textContent}`
      ];
      if (userAgent?.platform) lines.push(`Platform: ${userAgent.platform}`);
      device = lines.join('\n');
      preview.textContent = device;
      updateEmail();
      try {
        const details = await userAgent?.getHighEntropyValues?.(['model', 'platformVersion']);
        if (current !== selection || !include.checked || !details) return;
        if (details.model) lines.push(`Device model: ${details.model}`);
        if (details.platformVersion) lines.push(`OS version: ${details.platformVersion}`);
        device = lines.join('\n');
        preview.textContent = device;
        updateEmail();
      } catch (error) { /* optional browser hints */ }
    });
  }

  async function validatePhotoFile(file) {
    const types = ['image/jpeg', 'image/png', 'image/webp'];
    if (!types.includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
    if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('Choose an image of up to 5 MB.');
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
    const webp = String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
    if (!(file.type === 'image/jpeg' && jpeg || file.type === 'image/png' && png || file.type === 'image/webp' && webp)) {
      throw new Error('The image file does not match its format.');
    }
  }

  function connectPhoto(onCrop, notify) {
    const crop = modal('photoDialog');
    const fileInput = byId('profilePhotoFile');
    const canvas = byId('photoCrop');
    const zoom = byId('photoZoom');
    const x = byId('photoX');
    const y = byId('photoY');
    const size = canvas.width;
    let image;
    let selection = 0;

    function render() {
      const context = canvas.getContext('2d');
      const side = Math.min(image.naturalWidth, image.naturalHeight) * 100 / Number(zoom.value);
      x.disabled = image.naturalWidth === side;
      y.disabled = image.naturalHeight === side;
      const left = (image.naturalWidth - side) * Number(x.value) / 100;
      const top = (image.naturalHeight - side) * Number(y.value) / 100;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size, size);
      context.drawImage(image, left, top, side, side, 0, 0, size, size);
    }

    byId('profilePhotoChoose').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      const current = ++selection;
      const respond = UiSounds.feedback();
      try { await validatePhotoFile(file); }
      catch (error) { if (current === selection) { notify(error.message || 'Could not read this image.'); respond('error'); } return; }
      if (current !== selection) return;
      const url = URL.createObjectURL(file);
      const next = new Image();
      next.onload = () => {
        URL.revokeObjectURL(url);
        if (current !== selection) return;
        if (!next.naturalWidth || !next.naturalHeight || next.naturalWidth > 8192 || next.naturalHeight > 8192 || next.naturalWidth * next.naturalHeight > 16000000) {
          notify('Image dimensions are too large. Choose an image up to 16 megapixels.');
          respond('error');
          return;
        }
        image = next;
        zoom.value = '100';
        x.value = y.value = '50';
        render();
        crop.open(false);
        respond('open');
      };
      next.onerror = () => {
        URL.revokeObjectURL(url);
        if (current !== selection) return;
        notify('Choose a JPEG, PNG, or WebP image that this browser can open.');
        respond('error');
      };
      next.src = url;
    });
    [zoom, x, y].forEach(input => input.addEventListener('input', render));
    byId('applyPhoto').addEventListener('click', () => {
      onCrop(canvas.toDataURL('image/jpeg', .86));
      crop.close();
    });
  }

  function connectReset({ onProfileDeleted, onReset }) {
    const confirmDialog = modal('resetDialog');
    const status = byId('resetStatus');
    const confirm = byId('confirmReset');
    let resetAll;

    function open(all) {
      resetAll = all;
      const action = all ? 'Reset Punchly' : 'Delete profile';
      byId('resetHeading').textContent = action + '?';
      byId('resetDescription').textContent = all ?
        'This erases your profile, preferences, punches, drafts, reports, and change logs from this browser.' :
        'This removes your name, employee details, and profile picture from this browser. Your punches, reports, and other preferences are kept.';
      byId('resetActionLabel').textContent = action;
      Icons.draw(byId('resetActionIcon'), all ? 'delete_forever' : 'person_remove');
      status.hidden = true;
      confirm.disabled = false;
      confirmDialog.open();
    }

    byId('deleteProfile').addEventListener('click', () => open(false));
    byId('resetApp').addEventListener('click', () => open(true));
    byId('resetBackup').addEventListener('click', async () => {
      try {
        if (!await window.downloadBackup()) return;
        status.textContent = 'Check that the backup is in your downloads before continuing.';
      } catch (error) {
        status.textContent = 'The backup could not be downloaded.';
      }
      status.hidden = false;
    });
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      if (!(resetAll ? Storage.reset() : Storage.deleteProfile())) {
        status.textContent = 'Browser storage is unavailable. The changes could not be saved.';
        status.hidden = false;
        confirm.disabled = false;
        UiSounds.play('error');
        return;
      }
      confirmDialog.close();
      if (resetAll) onReset();
      else {
        onProfileDeleted();
        UiSounds.play('delete');
      }
    });
  }

  return { modal, connectStartup, connectUpdates, connectHelp, connectInvite, connectPhoto, validatePhotoFile, connectReset };
})();
