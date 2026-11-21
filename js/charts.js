function rollingHours(records) {
  const day = 86400000;
  const rows = records
    .filter(record => record.kind === 'daily' && !Shift.isDayOff(record.mode))
    .map(record => ({ date: record.date, time: Date.parse(record.date), hours: (record.totalMinutes || 0) / 60 }))
    .filter(row => Number.isFinite(row.time))
    .sort((a, b) => a.time - b.time);
  const averages = new Map();
  let first = 0;
  let total = 0;
  rows.forEach((row, index) => {
    total += row.hours;
    while (rows[first].time < row.time - 6 * day) total -= rows[first++].hours;
    averages.set(row.date, total / (index - first + 1));
  });
  return averages;
}

window.updateAnalytics = function (records, history = records) {
  const canvas = document.getElementById('analyticsChart');
  if (!canvas?.clientWidth) return;
  const daily = records.filter(record => record.kind === 'daily' && !Shift.isDayOff(record.mode)).sort((a, b) => a.date.localeCompare(b.date));
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!ctx || !height) return;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const styles = getComputedStyle(document.documentElement);
  const text = styles.getPropertyValue('--text-secondary').trim();
  const grid = styles.getPropertyValue('--border-color').trim();
  const accent = styles.getPropertyValue('--accent-color').trim();
  const trend = styles.getPropertyValue('--trend-color').trim();
  const font = styles.getPropertyValue('--app-font').trim() || 'Arial, sans-serif';
  const note = document.getElementById('chartNote');
  ctx.fillStyle = styles.getPropertyValue('--surface-color').trim();
  ctx.fillRect(0, 0, width, height);
  if (!daily.length) {
    ctx.fillStyle = text;
    note.textContent = '';
    ctx.font = `14px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText('Save daily records to see your hours here.', width / 2, height / 2);
    return;
  }
  const shown = daily.slice(-14);
  const rolling = rollingHours(history);
  note.textContent = `${daily.length > shown.length ? 'Showing the latest 14 logged workdays. ' : ''}The average uses logged workdays in the preceding seven calendar days, including the date shown.`;
  const left = 44, right = 12, top = 18, bottom = 42;
  const plotW = width - left - right, plotH = height - top - bottom;
  const max = Math.max(10, Math.ceil(Math.max(...shown.map(row => Math.max((row.totalMinutes || 0) / 60, rolling.get(row.date) || 0))) / 2) * 2);
  ctx.font = `11px ${font}`;
  ctx.textAlign = 'right';
  for (let hour = 0; hour <= max; hour += Math.max(1, Math.ceil(max / 5))) {
    const y = top + plotH - (hour / max) * plotH;
    ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
    ctx.fillStyle = text; ctx.fillText(`${hour}h`, left - 8, y + 4);
  }
  const slot = plotW / shown.length;
  const labelStep = Math.max(1, Math.ceil(45 / slot));
  const trendPoints = [];
  shown.forEach((row, index) => {
    const barW = Math.min(34, slot * 0.62);
    const value = Math.max(0, row.totalMinutes || 0) / 60;
    const barH = Math.min(plotH, (value / max) * plotH);
    const x = left + index * slot + (slot - barW) / 2;
    const y = top + plotH - barH;
    ctx.fillStyle = accent; ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, 4); else ctx.rect(x, y, barW, barH);
    ctx.fill();
    const average = rolling.get(row.date);
    if (average !== undefined) trendPoints.push([x + barW / 2, top + plotH - (average / max) * plotH]);
    if (index % labelStep === 0) {
      ctx.fillStyle = text;
      ctx.textAlign = 'center';
      ctx.fillText(new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), x + barW / 2, height - 12);
    }
  });
  ctx.beginPath();
  trendPoints.forEach(([x, y], index) => { if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.strokeStyle = trend;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = trend;
  trendPoints.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
};
