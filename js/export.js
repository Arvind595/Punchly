(() => {
  const punchFields = Shift.fields;
  const header = ['Date', 'Type', 'Title', 'Total minutes', 'Status', 'Morning in', 'Lunch out', 'Lunch return', 'Evening out', 'Notes', 'Schedule', 'Day type', 'Work target (minutes)', 'Lunch (minutes)', 'Lunch deducted (minutes)', 'Extra worked (minutes)'];
  const auditHeader = [...punchFields.map(field => Audit.labels[field] + ' recorded (UTC)'), 'First logged (UTC)', 'Last changed (UTC)'];
  const includeChangeLogs = () => document.getElementById('exportChangeLogs').checked;
  const employeeFields = [
    ['employeeId', 'Employee ID'], ['employeeEmail', 'Employee email'], ['role', 'Role'], ['department', 'Department']
  ];
  const metaLabels = ['Profile name', 'Punchly version', 'Exported at (UTC)', 'Export time zone', ...employeeFields.map(([, label]) => label)];
  let sheetJs;
  let requestProfile;
  function filename(field, extension) {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const version = document.querySelector('meta[name="punchly-release"]').content;
    return `Punchly_v${version}_${field}_${date}.${extension}`;
  }
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
  function visibleRecords() {
    const records = window.getExportRecords?.() ?? window.getVisibleHistory?.() ?? [];
    if (!records.length) window.showPunchlyToast?.('There are no records in this date range to export.', 'blocked');
    return records;
  }
  function createProfilePrompt() {
    const form = document.getElementById('exportProfileForm');
    let resolve;
    let answer;
    const dialog = AppTools.modal('exportProfileDialog', () => {
      const done = resolve;
      resolve = null;
      done?.(answer);
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const profile = Storage.profileDetails(Object.fromEntries(new FormData(form)));
      if (!profile.displayName) { window.showPunchlyToast?.('Enter a display name for exports.', 'error'); return; }
      if (!Storage.saveSettings({ ...Storage.getSettings(), ...profile, profileNameSource: 'user' })) {
        window.showPunchlyToast?.('Could not save the profile. Check browser storage.', 'error');
        return;
      }
      answer = profile;
      window.dispatchEvent(new Event('punchly:profile-updated'));
      dialog.close();
    });
    return () => {
      if (resolve) return Promise.resolve(null);
      answer = null;
      const profile = Storage.profileDetails(Storage.getSettings());
      for (const [field, value] of Object.entries(profile)) form.elements[field].value = value;
      form.elements.displayName.value = '';
      return new Promise(done => {
        resolve = done;
        dialog.open();
      });
    };
  }
  async function chooseProfile() {
    const settings = Storage.getSettings();
    if (!await Setup.isDeviceProfile(settings)) return Storage.profileDetails(settings);
    if (!requestProfile) requestProfile = createProfilePrompt();
    return requestProfile();
  }
  function exportOutcome(respond, failed = '') {
    window.showPunchlyToast?.(failed || 'Download started.');
    respond(failed ? 'error' : 'success');
  }
  function metadata(profile = Storage.profileDetails(Storage.getSettings())) {
    const { displayName, ...employee } = profile;
    const profileName = displayName || 'Unnamed profile';
    const appVersion = document.querySelector('meta[name="punchly-release"]').content;
    const exportedAt = new Date().toISOString();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
    return { profileName, appVersion, exportedAt, timeZone, ...employee };
  }
  function metaValues(meta) {
    return [meta.profileName, `v${meta.appVersion}`, meta.exportedAt, meta.timeZone,
      ...employeeFields.map(([field]) => meta[field])];
  }
  function stamp(meta) {
    return `${meta.profileName} · Punchly v${meta.appVersion} · ${Audit.format(meta.exportedAt)} (${meta.timeZone})`;
  }
  function employeeLines(meta) {
    return employeeFields.filter(([field]) => meta[field]).map(([field, label]) => `${label} · ${meta[field]}`);
  }

  function recordRows(records, includeLogs) {
    return records.map(record => [
      record.date, record.kind === 'weekly' ? 'Weekly' : 'Daily', record.title || '', record.totalMinutes || 0,
      Shift.recordStatus(record),
      record.punches?.morningIn || record.in || '', record.punches?.lunchOut || '', record.punches?.lunchReturn || '', record.punches?.eveningOut || record.out || '',
      record.notes ? `User notes: ${record.notes}` : '', record.schedule ? JSON.stringify(record.schedule) : '',
      record.kind === 'daily' ? Shift.label(record.mode) : '',
      record.kind === 'daily' ? record.targetMinutes : '',
      record.lunchMinutes ?? '', record.lunchDeductionMinutes ?? record.lunchMinutes ?? '', record.extraMinutes ?? '',
      ...(includeLogs ? [...punchFields.map(field => Audit.punchedAt(record.audit, field, record.punches?.[field])),
        record.audit?.createdAt || '', record.audit?.updatedAt || ''] : [])
    ]);
  }
  window.exportVisibleCSV = async () => {
    const records = visibleRecords();
    if (!records.length) return;
    const includeLogs = includeChangeLogs();
    const profile = await chooseProfile();
    if (!profile) return;
    const respond = UiSounds.feedback();
    try {
      const meta = metaValues(metadata(profile));
      const rows = recordRows(records, includeLogs).map((row, index) => [...row,
        ...(includeLogs ? [records[index].audit ? JSON.stringify(records[index].audit.events) : ''] : []), ...meta]);
      download([[...header, ...(includeLogs ? [...auditHeader, 'Change log (JSON)'] : []), ...metaLabels], ...rows]
        .map(row => row.map(csvCell).join(',')).join('\r\n'), filename('history', 'csv'), 'text/csv;charset=utf-8');
    } catch (error) { exportOutcome(respond, 'The CSV file could not be created.'); return; }
    exportOutcome(respond);
  };
  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!sheetJs) {
      sheetJs = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'vendor/xlsx-0.20.3.mini.js';
        const timeout = setTimeout(fail, 8000);
        function fail() {
          clearTimeout(timeout);
          script.remove();
          reject(new Error('SheetJS did not load.'));
        }
        script.onload = () => {
          if (!window.XLSX) { fail(); return; }
          clearTimeout(timeout);
          resolve(window.XLSX);
        };
        script.onerror = fail;
        document.head.append(script);
      }).catch(error => { sheetJs = undefined; throw error; });
    }
    return sheetJs;
  }
  function excelDate(value) {
    const time = Date.parse(value);
    const epoch = Date.UTC(1899, 11, 31);
    if (!Number.isFinite(time) || time < epoch) return value;
    // Excel's 1900 calendar reserves serial 60 for its fictitious February 29.
    return (time - epoch) / 86400000 + Number(time >= Date.UTC(1900, 2, 1));
  }
  window.exportVisibleExcel = async () => {
    const button = document.getElementById('exportExcel');
    if (button.disabled) return;
    const records = visibleRecords();
    if (!records.length) return;
    const includeLogs = includeChangeLogs();
    const profile = await chooseProfile();
    if (!profile) return;
    const meta = metadata(profile);
    const respond = UiSounds.feedback();
    const status = document.getElementById('exportStatus');
    status.textContent = 'Preparing Excel workbook…';
    status.hidden = false;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const stopLoading = UiSounds.startLoading(status);
    let failure = '';
    try {
      const xlsx = await loadSheetJs();
      const columns = [...header, ...(includeLogs ? auditHeader : [])];
      const rows = recordRows(records, includeLogs);
      rows.forEach(row => { row[0] = excelDate(row[0]); });
      const values = metaValues(meta);
      const timesheetHeader = [['Punchly timesheet'], ...metaLabels.map((label, index) => [label, values[index] || '']), []];
      const sheet = xlsx.utils.aoa_to_sheet([...timesheetHeader, columns, ...rows]);
      rows.forEach(([date], index) => {
        if (typeof date === 'number') sheet[`A${timesheetHeader.length + index + 2}`].z = 'yyyy-mm-dd';
      });
      const range = xlsx.utils.decode_range(sheet['!ref']);
      range.s.r = timesheetHeader.length;
      sheet['!autofilter'] = { ref: xlsx.utils.encode_range(range) };
      sheet['!cols'] = columns.map((label, index) => ({ wch: Math.max([22, 28][index] ?? 14, label.length + 2) }));
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, sheet, 'Timesheet');
      if (includeLogs) {
        const log = [['Shift date', 'Record type', 'Record title', 'Recorded at (UTC)', 'Field', 'Previous value', 'New value']];
        for (const record of records) {
          for (const event of record.audit?.events || []) {
            for (const change of event.changes) {
              log.push([excelDate(record.date), record.kind, record.title || '', event.at,
                Audit.labels[change.field], change.from, change.to]);
            }
          }
        }
        const auditSheet = xlsx.utils.aoa_to_sheet(log);
        log.slice(1).forEach(([date], index) => {
          if (typeof date === 'number') auditSheet[`A${index + 2}`].z = 'yyyy-mm-dd';
        });
        auditSheet['!autofilter'] = { ref: auditSheet['!ref'] };
        auditSheet['!cols'] = [14, 14, 24, 26, 20, 40, 40].map(wch => ({ wch }));
        xlsx.utils.book_append_sheet(workbook, auditSheet, 'Change log');
      }
      xlsx.writeFile(workbook, filename('history', 'xlsx'));
    } catch (error) { failure = 'The Excel file could not be created.'; }
    finally {
      stopLoading();
      button.disabled = false;
      button.removeAttribute('aria-busy');
      status.hidden = true;
    }
    exportOutcome(respond, failure);
  };
  function pngWithMetadata(canvas, data) {
    const png = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), char => char.charCodeAt(0));
    const encoder = new TextEncoder();
    const keyword = encoder.encode('Punchly Export');
    const value = encoder.encode(JSON.stringify(data));
    // An uncompressed iTXt chunk stores UTF-8 metadata without changing the chart pixels.
    const chunk = new Uint8Array(12 + keyword.length + 5 + value.length);
    const numbers = new DataView(chunk.buffer);
    numbers.setUint32(0, chunk.length - 12);
    chunk.set(encoder.encode('iTXt'), 4);
    chunk.set(keyword, 8);
    chunk.set(value, 8 + keyword.length + 5);
    let crc = 0xffffffff;
    for (const byte of chunk.subarray(4, chunk.length - 4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    numbers.setUint32(chunk.length - 4, crc ^ 0xffffffff);
    return new Blob([png.subarray(0, png.length - 12), chunk, png.subarray(png.length - 12)], { type: 'image/png' });
  }

  window.exportChartPNG = async () => {
    const records = visibleRecords();
    if (!records.length) return;
    const includeLogs = includeChangeLogs();
    const profile = await chooseProfile();
    if (!profile) return;
    const respond = UiSounds.feedback();
    try {
      const meta = metadata(profile);
      const canvas = Charts.exportChart(window.getExportChartData?.(records) ?? records, window.getExportChartKind?.() || 'bar', [stamp(meta), ...employeeLines(meta)]);
      const changeLog = includeLogs ? records.filter(record => record.audit).map(({ date, kind, title, audit }) => ({ date, kind, title, audit })) : undefined;
      download(pngWithMetadata(canvas, { ...meta, ...(includeLogs ? { changeLog } : {}) }), filename('chart', 'png'), 'image/png');
    } catch (error) { exportOutcome(respond, 'The chart image could not be created.'); return; }
    exportOutcome(respond);
  };

  function pdfBlob(images, width, height) {
    const encoder = new TextEncoder();
    const parts = [];
    const offsets = [0];
    let length = 0;
    function write(part) {
      const bytes = typeof part === 'string' ? encoder.encode(part) : part;
      parts.push(bytes);
      length += bytes.length;
    }
    function object(id, ...contents) {
      offsets[id] = length;
      write(`${id} 0 obj\n`);
      contents.forEach(write);
      write('\nendobj\n');
    }
    write('%PDF-1.4\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    const pages = images.map((_, i) => 3 + i * 3);
    object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map(id => `${id} 0 R`).join(' ')}] >>`);
    for (const [index, jpeg] of images.entries()) {
      const page = pages[index];
      const drawing = 'q 595 0 0 842 0 0 cm /Im0 Do Q\n';
      object(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`);
      object(page + 1, `<< /Length ${drawing.length} >>\nstream\n${drawing}endstream`);
      object(page + 2, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream');
    }
    const xref = length;
    write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    offsets.slice(1).forEach(offset => write(`${String(offset).padStart(10, '0')} 00000 n \n`));
    write(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  function pdfTimesheet(records, meta, includeLogs) {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1415;
    const ctx = canvas.getContext('2d');
    const margin = 48;
    const lineWidth = canvas.width - margin * 2;
    const pages = [];
    let y;
    function startPage() {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#26243d'; ctx.font = 'bold 36px sans-serif';
      ctx.fillText('Punchly timesheet', margin, 75);
      ctx.font = '19px sans-serif';
      ctx.fillText(`Page ${pages.length + 1}  ·  ${records.length} ${records.length === 1 ? 'record' : 'records'}`, margin, 108);
      ctx.fillText(stamp(meta), margin, 138, lineWidth);
      y = 182;
      const employee = employeeLines(meta);
      employee.forEach((detail, index) => ctx.fillText(detail, margin, 166 + index * 24, lineWidth));
      y += employee.length * 24;
    }
    function finishPage() {
      const bytes = atob(canvas.toDataURL('image/jpeg', .88).split(',')[1]);
      pages.push(Uint8Array.from(bytes, char => char.charCodeAt(0)));
    }
    function ensureRoom(height) {
      if (y + height < canvas.height - 42) return;
      finishPage();
      startPage();
    }
    function line(text, bold = false) {
      ensureRoom(28);
      ctx.fillStyle = bold ? '#26243d' : '#46465b';
      ctx.font = bold ? 'bold 21px sans-serif' : '19px sans-serif';
      ctx.fillText(text, margin, y, lineWidth);
      y += 28;
    }
    function notes(text) {
      ctx.font = '19px sans-serif';
      for (const paragraph of String(text).split(/\r?\n/)) {
        let row = '';
        for (const word of paragraph.split(/\s+/)) {
          const next = row ? `${row} ${word}` : word;
          if (row && ctx.measureText(next).width > lineWidth) { line(row); row = word; }
          else row = next;
        }
        if (row) line(row);
      }
    }
    startPage();
    const duration = minutes => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    for (const record of records) {
      ensureRoom(88);
      const [, type, title, total, status, start, lunchOut, lunchReturn, end] = recordRows([record])[0];
      line(`${record.date}  ·  ${title || (type === 'Weekly' ? 'Weekly report' : Shift.label(record.mode))}  ·  ${status}`, true);
      const punches = [start && `In ${start}`, lunchOut && `Lunch out ${lunchOut}`, lunchReturn && `Lunch return ${lunchReturn}`, end && `Out ${end}`].filter(Boolean);
      line([`Worked ${duration(Math.max(0, total))}`, ...punches].join('  ·  '));
      for (const row of record.schedule || []) {
        if (row.from || row.to) line(`${row.day}: ${row.from || '—'} to ${row.to || '—'}${row.break || row.breakDeduction ? ` · Break ${row.break || row.breakDeduction}` : ''}`);
      }
      if (record.notes) notes(`User notes: ${record.notes}`);
      if (includeLogs && record.audit?.events.length) {
        line('Change log', true);
        for (const event of record.audit.events) {
          notes(`${Audit.format(event.at)} · ${event.changes.map(Audit.describe).join(' · ')}`);
        }
      }
      y += 18;
    }
    finishPage();
    return pdfBlob(pages, canvas.width, canvas.height);
  }

  window.exportVisiblePDF = async () => {
    const records = visibleRecords();
    if (!records.length) return;
    const includeLogs = includeChangeLogs();
    const profile = await chooseProfile();
    if (!profile) return;
    const respond = UiSounds.feedback();
    try { download(pdfTimesheet(records, metadata(profile), includeLogs), filename('timesheet', 'pdf'), 'application/pdf'); }
    catch (error) { exportOutcome(respond, 'The PDF could not be created.'); return; }
    exportOutcome(respond);
  };
  window.downloadBackup = async () => {
    const profile = await chooseProfile();
    if (!profile) return false;
    const respond = UiSounds.feedback();
    let recorded = true;
    try {
      const backup = Storage.exportBackup();
      const settings = { ...backup.settings, ...profile };
      const content = JSON.stringify({ ...backup, settings, ...metadata(profile) }, null, 2);
      Storage.validateBackup(JSON.parse(content));
      download(content, filename('backup', 'json'), 'application/json');
      recorded = Storage.markBackup();
      window.dispatchEvent(new Event('punchly:backup-exported'));
    } catch (error) { exportOutcome(respond, error.message || 'The backup could not be downloaded.'); throw error; }
    exportOutcome(respond);
    if (!recorded) window.showPunchlyToast?.('Backup download started, but its timestamp could not be saved.');
    return true;
  };
  window.downloadRecoveryData = () => {
    try {
      download(JSON.stringify(Storage.recoveryData(), null, 2), filename('recovery', 'json'), 'application/json');
      window.showPunchlyToast?.('Recovery data download started. Keep this file private.');
    } catch (error) { window.showPunchlyToast?.('Could not download recovery data.', 'error'); }
  };
  window.downloadPunchlySettings = async () => {
    const profile = await chooseProfile();
    if (!profile) return;
    try {
      download(JSON.stringify({ format: 'punchly-settings', version: 1, ...metadata(profile), settings: Storage.getSettings() },
        null, 2), filename('settings', 'json'), 'application/json');
    } catch (error) { exportOutcome(UiSounds.play, 'The settings file could not be created.'); return; }
    exportOutcome(UiSounds.play);
  };
  function chooseRestoreMode(backup, respond) {
    const dialog = document.getElementById('restoreDialog');
    const count = backup.history.length;
    const duplicates = Storage.duplicateDates?.(backup) || [];
    const conflict = duplicates.length ? ` ${duplicates.length} attendance ${duplicates.length === 1 ? 'date already exists' : 'dates already exist'}; Merge keeps existing records for those dates.` : '';
    if (typeof dialog.showModal !== 'function') {
      const choice = prompt(`Import ${count} records.${conflict} Type MERGE to keep existing data or REPLACE to restore the backup.`);
      return Promise.resolve(choice?.trim().toLowerCase());
    }
    document.getElementById('restorePreview').textContent = `This backup contains ${count} saved ${count === 1 ? 'record' : 'records'}.${conflict}`;
    return new Promise(resolve => {
      dialog.returnValue = 'cancel';
      dialog.showModal();
      respond('open');
      dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
    });
  }
  function readBackupFile(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('The backup file could not be read.'));
      reader.readAsText(file);
    });
  }
  window.importBackupFile = async (input, notify = message => window.showPunchlyToast?.(message)) => {
    const file = input.files?.[0]; if (!file) return false;
    const respond = UiSounds.feedback();
    try {
      const backup = JSON.parse(await readBackupFile(file));
      if (backup?.format === 'punchly-settings') {
        if (!confirm('Apply these Punchly preferences? Your punches and time reports will be kept.')) return false;
        Storage.importSettings(backup);
        window.dispatchEvent(new CustomEvent('punchly:settings-imported'));
        notify('Settings imported.');
        respond('success');
        return true;
      }
      Storage.validateBackup(backup);
      const mode = await chooseRestoreMode(backup, respond);
      if (mode !== 'merge' && mode !== 'replace') { respond('cancel'); return false; }
      const count = Storage.importBackup(backup, mode === 'merge');
      window.dispatchEvent(new CustomEvent('punchly:backup-imported'));
      notify(`${mode === 'replace' ? 'Backup restored.' : 'Backup merged.'} ${count} ${count === 1 ? 'record' : 'records'} added.`);
      respond('success');
      return true;
    } catch (error) {
      notify(error instanceof SyntaxError ? 'This file is not valid JSON.' : error.message || 'Could not import that backup file.');
      respond('error');
      return false;
    }
    finally {
      input.value = '';
      if (Storage.diagnostics) window.dispatchEvent(new Event('punchly:storage-diagnostics'));
    }
  };
})();
