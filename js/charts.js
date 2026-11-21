const Charts = (() => {
  const attendanceColors = {
    completed: '#29975d', 'no-punch': '#c53f52', leave: '#b88c13', holiday: '#397aca',
    sat1: '#8666cf', sat3: '#368d8c', half: '#aa5b24', draft: '#747891', incomplete: '#c67432'
  };

  function workdays(records) {
    return records.filter(row => row.kind === 'daily' && !Shift.isHoliday(row.mode, row.punches) &&
      row.entryStatus !== 'No punch').sort((a, b) => a.date.localeCompare(b.date));
  }

  function rollingHours(records) {
    const rows = workdays(records).map(row => ({ ...row, time: Date.parse(row.date), hours: (row.totalMinutes || 0) / 60 }));
    const averages = new Map();
    let first = 0;
    let total = 0;
    rows.forEach((row, index) => {
      total += row.hours;
      while (rows[first].time < row.time - 6 * 86400000) total -= rows[first++].hours;
      averages.set(row.date, total / (index - first + 1));
    });
    return averages;
  }

  function path(ctx, points, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
    points.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
  }

  function draw(canvas, records, history, kind, states, width, height, exportImage = false) {
    if (!width || !height) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const styles = getComputedStyle(document.documentElement);
    const color = prop => styles.getPropertyValue(prop).trim();
    const text = color('--text-primary');
    const muted = color('--text-secondary');
    const accent = color('--accent-color');
    const trend = color('--trend-color');
    const font = color('--app-font') || 'Arial, sans-serif';
    const ratio = exportImage ? 1.5 : window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = color('--surface-color');
    ctx.fillRect(0, 0, width, height);
    const title = kind === 'pie' ? 'Attendance breakdown' : kind === 'line' ? 'Hours over time' : 'Daily hours worked';
    if (exportImage) {
      ctx.fillStyle = text;
      ctx.font = `700 20px ${font}`;
      ctx.fillText(title, 22, 30);
    }
    const top = exportImage ? 50 : 14;
    const bottom = height - (exportImage ? 85 : 36);
    let note = '';
    let legend = [];
    if (kind === 'pie' && states.length) {
      const counts = new Map();
      states.forEach(state => counts.set(state, (counts.get(state) || 0) + 1));
      const radius = Math.max(20, Math.min(width, bottom - top) / 2 - 6);
      const cx = width / 2;
      const cy = (top + bottom) / 2 + 8;
      let angle = -Math.PI / 2;
      for (const [state, count] of counts) {
        const next = angle + 2 * Math.PI * count / states.length;
        const fill = attendanceColors[state] || accent;
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, angle, next); ctx.closePath(); ctx.fill();
        angle = next;
        legend.push([`${Attendance.labels[state]} (${count})`, fill]);
      }
      note = 'Each slice represents the number of dates with that attendance status.';
    } else if (kind !== 'pie' && workdays(records).length) {
      const daily = workdays(records);
      const shown = daily.slice(-14);
      const rolling = rollingHours(history);
      const max = Math.max(10, Math.ceil(Math.max(...shown.map(row => Math.max((row.totalMinutes || 0) / 60, rolling.get(row.date) || 0))) / 2) * 2);
      const left = 38, right = width - 12;
      const yFor = value => bottom - (bottom - top) * value / max;
      ctx.font = `11px ${font}`;
      ctx.textAlign = 'right';
      for (let hour = 0; hour <= max; hour += Math.ceil(max / 5)) {
        const y = yFor(hour);
        ctx.strokeStyle = color('--border-color'); ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
        ctx.fillStyle = muted; ctx.fillText(`${hour}h`, left - 7, y + 4);
      }
      const slot = (right - left) / shown.length;
      const labelsEvery = Math.max(1, Math.ceil(44 / slot));
      const points = [];
      const averages = [];
      shown.forEach((row, index) => {
        const x = left + (index + .5) * slot;
        const y = yFor((row.totalMinutes || 0) / 60);
        const bar = Math.min(34, slot * .62);
        if (kind === 'line') points.push([x, y]);
        else { ctx.fillStyle = accent; ctx.fillRect(x - bar / 2, y, bar, bottom - y); }
        if (rolling.has(row.date)) averages.push([x, yFor(rolling.get(row.date))]);
        if (index % labelsEvery === 0) {
          ctx.fillStyle = muted; ctx.textAlign = 'center';
          ctx.fillText(new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), x, bottom + 18);
        }
      });
      if (kind === 'line') path(ctx, points, accent);
      path(ctx, averages, trend);
      legend = [['Daily hours', accent], ['7-day average', trend]];
      note = `${daily.length > shown.length ? 'Showing the latest 14 logged workdays. ' : ''}The average uses logged workdays in the preceding seven calendar days.`;
    } else {
      ctx.fillStyle = muted;
      ctx.font = `14px ${font}`;
      ctx.textAlign = 'center';
      ctx.fillText('No chart data in this date range.', width / 2, (top + bottom) / 2, width - 16);
    }
    if (exportImage) {
      ctx.textAlign = 'left';
      ctx.font = `13px ${font}`;
      let x = 22, y = height - 48;
      for (const [label, fill] of legend) {
        const needed = ctx.measureText(label).width + 30;
        if (x > 22 && x + needed >= width) { x = 22; y += 19; }
        ctx.fillStyle = fill;
        ctx.fillRect(x, y - 10, 10, 10);
        ctx.fillStyle = text;
        ctx.fillText(label, x + 15, y);
        x += needed;
      }
    }
    return { title, note, legend };
  }

  function update(records, history, kind, states) {
    const canvas = document.getElementById('analyticsChart');
    const chart = draw(canvas, records, history, kind, states, canvas.clientWidth, canvas.clientHeight);
    if (!chart) return;
    canvas.setAttribute('aria-label', chart.title);
    document.getElementById('chartNote').textContent = chart.note;
    const legend = chart.legend.map(([label, fill]) => {
      const item = document.createElement('li');
      item.style.setProperty('--key-color', fill);
      item.textContent = label;
      return item;
    });
    document.getElementById('chartLegend').replaceChildren(...legend);
  }

  function exportChart(records, kind) {
    const canvas = document.createElement('canvas');
    const states = records.filter(row => row.kind === 'daily').map(row => Attendance.stateFor(row.date, row.date, {
      ...row, complete: Boolean(row.out)
    }));
    draw(canvas, records, records, kind, states, 860, 430, true);
    return canvas;
  }

  return { update, exportChart };
})();
