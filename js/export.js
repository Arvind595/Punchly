(() => {
  const header = ['Date', 'Type', 'Title', 'Total minutes', 'Status', 'Morning in', 'Lunch out', 'Lunch return', 'Evening out', 'Notes', 'Schedule', 'Day type', 'Work target (minutes)', 'Lunch (minutes)', 'Extra worked (minutes)'];
  let sheetJs;
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
    const records = window.getVisibleHistory?.() || [];
    if (!records.length) window.showPunchlyToast?.('There are no records in this date range to export.');
    return records;
  }
  function recordRows(records) {
    return records.map(record => [
      record.date, record.kind === 'weekly' ? 'Weekly' : 'Daily', record.title || '', record.totalMinutes || 0,
      Shift.recordStatus(record),
      record.punches?.morningIn || record.in || '', record.punches?.lunchOut || '', record.punches?.lunchReturn || '', record.punches?.eveningOut || record.out || '',
      record.notes || '', record.schedule ? JSON.stringify(record.schedule) : '',
      record.kind === 'daily' ? Shift.label(record.mode) : '',
      record.kind === 'daily' ? record.targetMinutes : '',
      record.lunchMinutes ?? '', record.extraMinutes ?? ''
    ]);
  }
  window.exportVisibleCSV = () => {
    const records = visibleRecords();
    if (records.length) download([header, ...recordRows(records)].map(row => row.map(csvCell).join(',')).join('\r\n'), 'Punchly_filtered_history.csv', 'text/csv;charset=utf-8');
  };
  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!sheetJs) {
      sheetJs = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'vendor/xlsx-0.20.3.mini.js';
        script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('SheetJS did not load.'));
        script.onerror = () => { script.remove(); reject(new Error('SheetJS did not load.')); };
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
    const records = visibleRecords();
    if (!records.length) return;
    try {
      const xlsx = await loadSheetJs();
      const rows = recordRows(records);
      rows.forEach(row => { row[0] = excelDate(row[0]); });
      const sheet = xlsx.utils.aoa_to_sheet([header, ...rows]);
      rows.forEach(([date], index) => {
        if (typeof date === 'number') sheet[`A${index + 2}`].z = 'yyyy-mm-dd';
      });
      sheet['!autofilter'] = { ref: sheet['!ref'] };
      sheet['!cols'] = header.map(label => ({ wch: Math.max(14, label.length + 2) }));
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, sheet, 'Timesheet');
      xlsx.writeFile(workbook, 'Punchly_history.xlsx');
    } catch (error) { window.showPunchlyToast?.('The Excel file could not be created.'); }
  };
  window.exportChartPNG = () => {
    const canvas = document.getElementById('analyticsChart');
    try {
      const link = document.createElement('a'); link.download = 'Punchly_filtered_chart.png'; link.href = canvas.toDataURL('image/png'); link.click();
    } catch (error) { window.showPunchlyToast?.('The chart image could not be created.'); }
  };
  window.downloadBackup = () => download(JSON.stringify(Storage.exportBackup(), null, 2), 'Punchly_backup.json', 'application/json');
  function chooseRestoreMode(backup) {
    const dialog = document.getElementById('restoreDialog');
    const count = backup.history.length;
    if (typeof dialog.showModal !== 'function') {
      const choice = prompt(`Import ${count} records. Type MERGE to keep existing data or REPLACE to restore the backup.`);
      return Promise.resolve(choice?.trim().toLowerCase());
    }
    document.getElementById('restorePreview').textContent = `This backup contains ${count} saved ${count === 1 ? 'record' : 'records'}.`;
    return new Promise(resolve => {
      dialog.returnValue = 'cancel';
      dialog.showModal();
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
  window.importBackupFile = async input => {
    const file = input.files?.[0]; if (!file) return;
    try {
      const backup = JSON.parse(await readBackupFile(file));
      Storage.validateBackup(backup);
      const mode = await chooseRestoreMode(backup);
      if (mode !== 'merge' && mode !== 'replace') return;
      const count = Storage.importBackup(backup, mode === 'merge');
      window.dispatchEvent(new CustomEvent('punchly:backup-imported'));
      window.showPunchlyToast?.(`${mode === 'replace' ? 'Backup restored.' : 'Backup merged.'} ${count} ${count === 1 ? 'record' : 'records'} added.`);
    } catch (error) {
      window.showPunchlyToast?.(error instanceof SyntaxError ? 'This file is not valid JSON.' : error.message || 'Could not import that backup file.');
    }
    finally { input.value = ''; }
  };
})();
