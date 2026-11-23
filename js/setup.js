const Setup = (() => {
  function legacyDeviceName() {
    const agent = navigator.userAgent;
    if (/\bAndroid\b/i.test(agent) || navigator.userAgentData?.platform === 'Android') {
      const model = /Android[^;)]*;\s*([^;)]+)/i.exec(agent)?.[1].split(/\s+Build\//i)[0].trim();
      return model && !/^(?:K|wv|Build\/.*|[a-z]{2}(?:[-_][a-z]{2})?)$/i.test(model) ? model : 'Android device';
    }
    if (/\biPhone\b/.test(agent)) return 'iPhone';
    if (/\biPad\b/.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/\bWindows\b/.test(agent)) return 'Windows PC';
    if (/\bMacintosh\b/.test(agent)) return 'Mac';
    if (/\bCrOS\b/.test(agent)) return 'ChromeOS device';
    if (/\bLinux\b/.test(agent)) return 'Linux device';
    return 'This device';
  }

  async function defaultProfileName() {
    const hints = navigator.userAgentData;
    if (!hints?.getHighEntropyValues) return legacyDeviceName();
    let timer;
    try {
      const deadline = new Promise(resolve => { timer = setTimeout(resolve, 500); });
      const details = await Promise.race([hints.getHighEntropyValues(['model']), deadline]);
      const model = details?.model?.trim();
      if (model && model !== 'K') return model;
    } catch (error) { /* Use the available device description if hints are blocked. */ }
    finally { clearTimeout(timer); }
    return legacyDeviceName();
  }

  async function isDeviceProfile(settings) {
    const name = (settings.displayName || '').trim();
    if (!name || settings.profileNameSource === 'device') return true;
    if (settings.profileNameSource === 'user') return false;
    if (/^(?:Android device|iPhone|iPad|Windows PC|Mac|ChromeOS device|Linux device|This device)$/i.test(name)) return true;
    return name === await defaultProfileName();
  }

  function connect(settings, onDone) {
    const setupDialog = document.getElementById('setupDialog');
    const form = document.getElementById('setupForm');
    const skipConfirmation = document.getElementById('setupSkipPane');
    const keepSetup = document.getElementById('keepSetup');
    const confirmSetupSkip = document.getElementById('confirmSetupSkip');
    const steps = [...form.querySelectorAll('[data-setup-step]')];
    const heading = document.getElementById('setupHeading');
    const welcomeHeading = heading.textContent;
    const welcome = document.getElementById('setupWelcome');
    const position = document.getElementById('setupPosition');
    const back = document.getElementById('setupBack');
    const next = document.getElementById('setupContinue');
    const skip = document.getElementById('setupSkip');
    const restore = document.getElementById('setupRestore');
    const input = document.getElementById('setupBackup');
    const status = document.getElementById('setupBackupStatus');
    let index = -1;
    let finished = false;
    let restoring = false;

    const dialog = AppTools.modal('setupDialog', null, false);
    for (const [name, choices] of Preferences.themeGroups) {
      const group = document.createElement('optgroup');
      group.label = name;
      for (const theme of choices) group.append(new Option(theme.name, theme.id));
      form.elements.theme.append(group);
    }

    const fields = ['clockFormat', 'theme', 'targetShift', 'lunchLimit', ...Object.keys(Storage.profileDetails(settings))];

    function fill() {
      for (const field of fields) form.elements[field].value = settings[field];
      form.elements.minimumLunch.checked = settings.minimumLunch;
      if (!form.elements.theme.value) form.elements.theme.value = 'light';
    }

    function showStep() {
      skipConfirmation.hidden = true;
      form.hidden = false;
      setupDialog.removeAttribute('aria-describedby');
      for (const [number, step] of steps.entries()) {
        step.hidden = step.disabled = number !== index;
      }
      const isWelcome = index === -1;
      welcome.hidden = !isWelcome;
      position.hidden = isWelcome;
      position.textContent = isWelcome ? '' : `Step ${index + 1} of ${steps.length}`;
      heading.textContent = isWelcome ? welcomeHeading : steps[index].dataset.setupStep;
      back.hidden = isWelcome;
      next.textContent = isWelcome ? 'Get started' : index === 0 ? 'Continue setup' :
        index === steps.length - 1 ? 'Finish setup' : 'Continue';
      setupDialog.scrollTop = 0;
      heading.focus();
    }

    async function finish(changes) {
      if (finished || restoring) return;
      finished = true;
      const respond = UiSounds.feedback();
      const chosen = { ...settings, ...changes };
      if (!chosen.displayName) {
        back.disabled = next.disabled = skip.disabled = restore.disabled = true;
        const name = await defaultProfileName();
        chosen.displayName = Storage.profileDetails({ displayName: name }).displayName;
        chosen.profileNameSource = 'device';
      } else if (changes.displayName && changes.displayName !== settings.displayName) {
        chosen.profileNameSource = 'user';
      }
      onDone(chosen, Storage.finishSetup(chosen), respond);
      dialog.close();
    }

    function showSkipConfirmation() {
      if (restoring || finished) return;
      form.hidden = position.hidden = true;
      heading.textContent = 'Skip setup?';
      setupDialog.setAttribute('aria-describedby', 'setupSkipDescription');
      skipConfirmation.hidden = false;
      keepSetup.focus();
      UiSounds.play('open');
    }

    function resumeSetup() {
      if (finished) return;
      showStep();
      skip.focus();
      UiSounds.play('close');
    }

    function dismissSetup() {
      if (skipConfirmation.hidden) showSkipConfirmation();
      else resumeSetup();
    }

    keepSetup.addEventListener('click', resumeSetup);
    confirmSetupSkip.addEventListener('click', () => {
      keepSetup.disabled = confirmSetupSkip.disabled = true;
      finish({ displayName: form.elements.displayName.value.trim() || settings.displayName });
    });
    restore.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      if (!input.files?.length) return;
      restoring = next.disabled = skip.disabled = restore.disabled = true;
      status.hidden = true;
      try {
        const imported = await window.importBackupFile(input, message => {
          status.textContent = message;
          status.hidden = false;
        });
        if (imported) fill();
      } finally {
        restoring = next.disabled = skip.disabled = restore.disabled = false;
      }
    });
    setupDialog.addEventListener('cancel', event => {
      event.preventDefault();
      dismissSetup();
    });
    setupDialog.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dismissSetup();
    }, true);
    skip.addEventListener('click', showSkipConfirmation);
    back.addEventListener('click', () => {
      index--;
      showStep();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (restoring || finished || !skipConfirmation.hidden) return;
      if (index < steps.length - 1) {
        index++;
        showStep();
        return;
      }
      const values = Object.fromEntries(fields.map(field => [field, form.elements[field].value]));
      finish({
        ...Storage.profileDetails(values),
        clockFormat: values.clockFormat,
        theme: values.theme,
        targetShift: values.targetShift,
        lunchLimit: Number(values.lunchLimit),
        minimumLunch: form.elements.minimumLunch.checked
      });
    });

    return {
      open() {
        if (!Storage.needsSetup()) return;
        fill();
        dialog.open();
        showStep();
      }
    };
  }

  return { connect, isDeviceProfile };
})();
