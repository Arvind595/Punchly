const Preferences = (() => {
  const deviceTheme = { id: 'system', name: 'Match device', colors: ['#f7f7ff', '#6555e8', '#20213f'] };
  const lightThemes = [
    { id: 'light', name: 'Periwinkle', colors: ['#f7f7ff', '#5546cc', '#4938c7', '#7338a3'] },
    { id: 'ocean', name: 'Ocean', colors: ['#eef7ff', '#075eaa', '#1552ae', '#096e84'] },
    { id: 'mint', name: 'Mint', colors: ['#eef9f4', '#12674d', '#14634d', '#207663'] },
    { id: 'peach', name: 'Peach', colors: ['#fff4ed', '#a23d24', '#a33a32', '#9a4d1e'] },
    { id: 'berry', name: 'Berry', colors: ['#fff0f7', '#9f2861', '#962255', '#843093'] },
    { id: 'solar', name: 'Marigold', colors: ['#fff8e7', '#805007', '#825007', '#9d5419'] },
    { id: 'champagne', name: 'Champagne', colors: ['#f8eedc', '#80531c', '#76491a', '#a36724'] },
    { id: 'lavender', name: 'Lavender', colors: ['#f3edfc', '#68459c', '#5e3d8e', '#8053a4'] }
  ];
  const darkThemes = [
    { id: 'dark', name: 'Midnight', dark: true, colors: ['#17172a', '#bfb4ff', '#4537aa', '#703993'] },
    { id: 'lagoon', name: 'Lagoon', dark: true, colors: ['#102321', '#79dbc8', '#12665b', '#235a86'] },
    { id: 'ember', name: 'Ember', dark: true, colors: ['#281b20', '#ffa594', '#90343e', '#944421'] },
    { id: 'graphite', name: 'Graphite', dark: true, colors: ['#1b1c20', '#d4d8e4', '#424a64', '#545768'] },
    { id: 'amoled', name: 'AMOLED Black', dark: true, colors: ['#000000', '#cabaff', '#352090', '#581f78'] },
    { id: 'forest', name: 'Forest', dark: true, colors: ['#101e15', '#a9dda5', '#235437', '#39714b'] }
  ];
  const themeGroups = [
    ['Device appearance', [deviceTheme]], ['Light themes', lightThemes], ['Dark themes', darkThemes]
  ];
  const themes = [deviceTheme, ...lightThemes, ...darkThemes];
  const fonts = [
    ['system', 'System', 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif'],
    ['manrope', 'Manrope', 'Manrope, "Segoe UI", Arial, sans-serif'],
    ['inter', 'Inter', 'Inter, "Segoe UI", Arial, sans-serif'],
    ['satoshi', 'Satoshi', 'Satoshi, Inter, "Segoe UI", Arial, sans-serif'],
    ['arial', 'Arial', 'Arial, Helvetica, sans-serif'],
    ['verdana', 'Verdana', 'Verdana, Geneva, sans-serif'],
    ['tahoma', 'Tahoma', 'Tahoma, Verdana, sans-serif'],
    ['trebuchet', 'Trebuchet MS', '"Trebuchet MS", Arial, sans-serif'],
    ['georgia', 'Georgia', 'Georgia, "Times New Roman", serif'],
    ['courier', 'Courier New', '"Courier New", Courier, monospace'],
    ['playpen-sans', 'Playpen Sans', '"Playpen Sans", "Segoe UI", Arial, sans-serif'],
    ['nunito', 'Nunito', 'Nunito, "Segoe UI", Arial, sans-serif'],
    ['comic-neue', 'Comic Neue', '"Comic Neue", "Segoe UI", Arial, sans-serif']
  ];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const byId = id => document.getElementById(id);

  function applyAppearance(settings) {
    let theme = themes.find(option => option.id === settings.theme) || lightThemes[0];
    if (theme === deviceTheme) theme = systemDark.matches ? darkThemes[0] : lightThemes[0];
    const [background, accent, primary, secondary] = theme.colors;
    const root = document.documentElement;
    root.dataset.theme = theme.id;
    root.dataset.colorMode = theme.dark ? 'dark' : 'light';
    root.dataset.compact = String(settings.compactMode);
    const font = fonts.find(option => option[0] === settings.font) || fonts[0];
    root.style.setProperty('--app-font', font[2]);
    if (settings.font === 'satoshi' && !byId('satoshiStyles')) {
      const link = document.createElement('link');
      link.id = 'satoshiStyles';
      link.rel = 'stylesheet';
      link.href = 'https://api.fontshare.com/v2/css?f[]=satoshi@400,700&display=swap';
      link.referrerPolicy = 'no-referrer';
      document.head.append(link);
    }
    root.style.setProperty('--bg-color', background);
    root.style.setProperty('--accent-color', accent);
    root.style.setProperty('--primary-color', primary);
    root.style.setProperty('--secondary-color', secondary);
    document.querySelector('meta[name="theme-color"]').content = background;
  }

  function drawAvatar(node, avatar, initials, photo) {
    node.textContent = '';
    if (!photo && avatar === 'initials') {
      node.textContent = initials;
      return;
    }
    const image = document.createElement('img');
    image.src = photo || `assets/avatar-${avatar}.svg`;
    image.alt = '';
    image.width = image.height = 48;
    node.append(image);
  }

  function applyProfile(name, avatar, photo) {
    const displayName = typeof name === 'string' ? name.trim() : '';
    const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2)
      .map(word => Array.from(word)[0].toLocaleUpperCase()).join('') || 'P';
    ['headerInitials', 'profileInitials'].forEach(id => drawAvatar(byId(id), avatar, initials, photo));
    byId('headerProfileName').textContent = displayName || 'Profile';
  }

  function drawThemeTile(theme) {
    const label = document.createElement('label');
    label.className = 'theme-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'theme';
    input.value = theme.id;
    const tile = document.createElement('span');
    tile.className = 'theme-tile';
    const preview = document.createElement('span');
    preview.className = 'theme-preview';
    preview.setAttribute('aria-hidden', 'true');
    preview.style.setProperty('--swatch-bg', theme.colors[0]);
    preview.style.setProperty('--swatch-accent', theme.colors[1]);
    preview.style.setProperty('--swatch-secondary', theme.colors[3] || theme.colors[2]);
    const name = document.createElement('span');
    name.textContent = theme.name;
    tile.append(preview, name);
    label.append(input, tile);
    return label;
  }

  function connect(settings, { onChange, notify }) {
    const profileForm = byId('profileForm');
    const themeOptions = byId('themeOptions');
    const workdayOptions = byId('workdayOptions');
    const avatarOptions = byId('avatarOptions');
    const soundVolume = byId('soundVolume');
    const soundVolumeLabel = byId('soundVolumeLabel');
    const typingSounds = byId('typingSounds');
    for (const [id, name, stack] of fonts) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      option.style.fontFamily = stack;
      byId('fontSelect').append(option);
    }
    for (const [id, name] of Storage.avatarOptions) {
      const label = document.createElement('label');
      label.className = 'avatar-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'profile-icon';
      input.value = id;
      input.setAttribute('aria-label', name);
      label.title = name;
      const preview = document.createElement('span');
      preview.className = 'avatar';
      drawAvatar(preview, id, 'Aa');
      preview.setAttribute('aria-hidden', 'true');
      const caption = document.createElement('span');
      caption.className = 'avatar-caption';
      caption.textContent = name;
      caption.setAttribute('aria-hidden', 'true');
      label.append(input, preview, caption);
      avatarOptions.append(label);
    }
    for (const [name, choices] of themeGroups) {
      const group = document.createElement('fieldset');
      group.className = 'theme-section';
      const legend = document.createElement('legend');
      legend.textContent = name;
      const grid = document.createElement('div');
      grid.className = 'theme-grid';
      grid.append(...choices.map(drawThemeTile));
      group.append(legend, grid);
      themeOptions.append(group);
    }
    days.forEach((day, index) => {
      const label = document.createElement('label');
      label.className = 'weekday-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = (index + 1) % 7;
      input.setAttribute('aria-label', day);
      const text = document.createElement('span');
      text.textContent = day.slice(0, 3);
      label.append(input, text);
      workdayOptions.append(label);
    });

    const themeInputs = [...themeOptions.querySelectorAll('input')];
    const workdayInputs = [...workdayOptions.querySelectorAll('input')];
    const avatarInputs = [...avatarOptions.querySelectorAll('input')];

    function refresh() {
      applyAppearance(settings);
      applyProfile(settings.displayName, settings.avatar, settings.profilePhoto);
      byId('profilePhotoRemove').hidden = !settings.profilePhoto;
      for (const [name, value] of Object.entries(Storage.profileDetails(settings))) profileForm.elements[name].value = value;
      byId('fontSelect').value = settings.font;
      byId('compactMode').checked = settings.compactMode;
      byId('mobileHaptics').checked = settings.mobileHaptics;
      refreshSoundControls();
      avatarInputs.find(input => input.value === settings.avatar).checked = true;
      byId('reminderIn').value = settings.reminderIn;
      byId('reminderLunchOut').value = settings.reminderLunchOut;
      byId('reminderLunchReturn').value = settings.reminderLunchReturn;
      byId('reminderOut').value = settings.reminderOut;
      byId('reminderTarget').checked = settings.reminderTarget;
      byId('defaultTarget').value = settings.targetShift;
      byId('lunchLimit').value = settings.lunchLimit;
      byId('minimumLunch').checked = settings.minimumLunch;

      byId('clockFormat').value = settings.clockFormat;
      byId('defaultRange').value = settings.historyRange;
      const selectedTheme = themeInputs.find(input => input.value === settings.theme) || themeInputs.find(input => input.value === lightThemes[0].id);
      selectedTheme.checked = true;
      workdayInputs.forEach(input => { input.checked = settings.workdays.includes(Number(input.value)); });
    }

    function refreshSoundControls() {
      byId('punchAudio').checked = settings.punchAudio;
      soundVolume.value = settings.soundVolume;
      soundVolumeLabel.value = `${settings.soundVolume}%`;
      soundVolume.disabled = typingSounds.disabled = !settings.punchAudio;
      typingSounds.checked = settings.typingSounds;
      UiSounds.sync(settings);
    }

    function save(changes, section, message, cue = message ? 'success' : null) {
      const next = { ...settings, ...changes };
      if (!Storage.saveSettings(next)) {
        refresh();
        notify('Browser storage is unavailable. Settings could not be saved.');
        UiSounds.play('error');
        return;
      }
      Object.assign(settings, next);
      if (section === 'sound') refreshSoundControls();
      if (section === 'appearance') applyAppearance(settings);
      onChange(section);
      if (message) notify(message);
      if (cue) UiSounds.play(cue);
    }

    themeOptions.addEventListener('change', event => {
      save({ theme: event.target.value }, 'appearance', null, 'select');
    });
    const onSystemTheme = () => {
      if (settings.theme === 'system') {
        applyAppearance(settings);
        onChange('appearance');
      }
    };
    if (systemDark.addEventListener) systemDark.addEventListener('change', onSystemTheme);
    else if (systemDark.addListener) systemDark.addListener(onSystemTheme);
    byId('fontSelect').addEventListener('change', event => save({ font: event.target.value }, 'appearance', null, 'select'));
    const toggleCue = checked => checked ? 'toggle-on' : 'toggle-off';
    byId('compactMode').addEventListener('change', event => save({ compactMode: event.target.checked }, 'appearance', null, toggleCue(event.target.checked)));
    byId('mobileHaptics').addEventListener('change', event => save({ mobileHaptics: event.target.checked }, 'interaction', null, toggleCue(event.target.checked)));
    byId('punchAudio').addEventListener('change', event => save({ punchAudio: event.target.checked }, 'sound', null, toggleCue(event.target.checked)));
    typingSounds.addEventListener('change', event => save({ typingSounds: event.target.checked }, 'sound', null, toggleCue(event.target.checked)));
    soundVolume.addEventListener('input', () => { soundVolumeLabel.value = `${soundVolume.value}%`; });
    soundVolume.addEventListener('change', () => save({ soundVolume: soundVolume.valueAsNumber }, 'sound', null, 'volume-change'));
    byId('remindersForm').addEventListener('submit', event => {
      event.preventDefault();
      save({
        reminderIn: byId('reminderIn').value,
        reminderLunchOut: byId('reminderLunchOut').value,
        reminderLunchReturn: byId('reminderLunchReturn').value,
        reminderOut: byId('reminderOut').value,
        reminderTarget: byId('reminderTarget').checked
      }, 'reminders', 'Reminders saved.');
    });
    function saveProfile(photo, message) {
      if (!profileForm.reportValidity()) return;
      save({
        ...Storage.profileDetails(Object.fromEntries(new FormData(profileForm))),
        avatar: avatarInputs.find(input => input.checked).value,
        profilePhoto: photo
      }, 'profile', message, photo === '' && settings.profilePhoto ? 'delete' : 'success');
      applyProfile(settings.displayName, settings.avatar, settings.profilePhoto);
      byId('profilePhotoRemove').hidden = !settings.profilePhoto;
    }
    profileForm.addEventListener('submit', event => {
      event.preventDefault();
      const sameIcon = avatarInputs.find(input => input.checked).value === settings.avatar;
      saveProfile(sameIcon ? settings.profilePhoto : '', 'Profile saved.');
    });
    byId('profilePhotoRemove').addEventListener('click', () => saveProfile('', 'Profile photo removed.'));
    AppTools.connectPhoto(photo => saveProfile(photo, 'Profile photo saved.'), notify);
    byId('trackingForm').addEventListener('submit', event => {
      event.preventDefault();
      save({
        targetShift: byId('defaultTarget').value,
        lunchLimit: byId('lunchLimit').valueAsNumber,
        minimumLunch: byId('minimumLunch').checked,

        clockFormat: byId('clockFormat').value,
        historyRange: byId('defaultRange').value,
        workdays: workdayInputs.filter(input => input.checked).map(input => Number(input.value))
      }, 'tracking', 'Tracking preferences saved.');
    });
    refresh();
    return { refresh };
  }

  return { days, themeGroups, connect };
})();
