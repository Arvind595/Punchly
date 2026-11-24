const Charts = (() => {
  const attendanceColors = {
    completed: '#29975d', 'no-punch': '#c53f52', leave: '#b88c13', holiday: '#397aca',
    half: '#aa672a', incomplete: '#b34e83', 'day-off': '#747891'
  };
  let interactive;

  function path(ctx, points, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
    points.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
  }

  function draw(canvas, model, kind, width, height, exportImage = false, selected = -1) {
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
    const { rows, grain, states } = model;
    const interval = { day: 'Daily', month: 'Monthly', year: 'Yearly' }[grain];
    const title = kind === 'pie' ? 'Attendance breakdown' : `${interval} hours worked`;
    if (exportImage) {
      ctx.fillStyle = text;
      ctx.font = `700 20px ${font}`;
      ctx.fillText(title, 22, 30);
    }
    const top = exportImage ? 50 : 14;
    const bottom = height - (exportImage ? 85 : 36);
    let note = '';
    let legend = [];
    let hit = null;
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
        legend.push([`${Statistics.labels[state]} (${count})`, fill]);
      }
      note = 'Each slice represents the number of dates with that attendance status.';
    } else if (kind !== 'pie' && rows.length) {
      const peak = rows.reduce((high, row) => Math.max(high, row.minutes / 60, row.average / 60), 0);
      const step = Math.max(1, Math.ceil(peak / 5));
      const max = step * 5;
      const left = Math.max(40, String(max).length * 7 + 20), right = width - 12;
      const yFor = value => bottom - (bottom - top) * value / max;
      ctx.font = `11px ${font}`;
      ctx.textAlign = 'right';
      for (let hour = 0; hour <= max; hour += step) {
        const y = yFor(hour);
        ctx.strokeStyle = color('--border-color'); ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
        ctx.fillStyle = muted; ctx.fillText(`${hour}h`, left - 7, y + 4);
      }
      const slot = (right - left) / rows.length;
      const labelsEvery = Math.max(1, Math.ceil((grain === 'day' ? 40 : 52) / slot));
      hit = { left, right, slot, width };
      const points = [];
      const averages = [];
      rows.forEach((row, index) => {
        const x = left + (index + .5) * slot;
        const y = yFor(row.minutes / 60);
        const bar = Math.min(40, slot * .68);
        if (!row.future && kind === 'line') points.push([x, y]);
        else if (!row.future) {
          ctx.fillStyle = accent;
          ctx.fillRect(x - bar / 2, y, bar, Math.max(1, bottom - y));
        }
        if (row.average !== null) averages.push([x, yFor(row.average / 60)]);
        if (index === selected) {
          ctx.strokeStyle = accent; ctx.lineWidth = 1;
          ctx.strokeRect(x - slot / 2, top, slot, bottom - top);
        }
        if (index % labelsEvery === 0) {
          ctx.fillStyle = muted; ctx.textAlign = 'center';
          ctx.fillText(row.label, x, bottom + 18, Math.min(slot * labelsEvery - 2, (x - 2) * 2, (width - x - 2) * 2));
        }
      });
      if (kind === 'line') path(ctx, points, accent);
      if (averages.length) path(ctx, averages, trend);
      legend = [[`${interval} hours`, accent]];
      if (averages.length) legend.push(['7-day average', trend]);
      note = model.hasWork ? (averages.length ? 'The trend averages completed shifts over the preceding seven calendar days.' : '') :
        'No completed shifts in this period.';
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
    return { title, note, legend, hit };
  }

  function update(model, kind, formatDuration) {
    const canvas = document.getElementById('analyticsChart');
    const selection = document.getElementById('chartSelection');
    if (!interactive) {
      interactive = { selected: -1 };
      const select = index => {
        const state = interactive;
        if (!state.hit || index < 0 || index >= state.model.rows.length) return;
        state.selected = index;
        const row = state.model.rows[index];
        selection.textContent = `${row.description} · ${row.future ? 'Upcoming' : state.formatDuration(row.minutes) + ' worked'}`;
        draw(canvas, state.model, state.kind, canvas.clientWidth, canvas.clientHeight, false, index);
      };
      canvas.addEventListener('click', event => {
        const hit = interactive.hit;
        if (!hit) return;
        const bounds = canvas.getBoundingClientRect();
        const x = (event.clientX - bounds.left) * hit.width / bounds.width;
        select(Math.floor((x - hit.left) / hit.slot));
      });
      canvas.addEventListener('keydown', event => {
        if (!interactive.hit || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const last = interactive.model.rows.length - 1;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? last :
          Math.max(0, Math.min(last, interactive.selected + (event.key === 'ArrowLeft' ? -1 : 1)));
        select(next);
      });
    }
    if (interactive.kind !== kind || interactive.model?.rows[0]?.description !== model.rows[0]?.description ||
        interactive.model?.rows.length !== model.rows.length) interactive.selected = -1;
    Object.assign(interactive, { model, kind, formatDuration });
    const chart = draw(canvas, model, kind, canvas.clientWidth, canvas.clientHeight, false, interactive.selected);
    if (!chart) return;
    interactive.hit = chart.hit;
    canvas.tabIndex = chart.hit ? 0 : -1;
    canvas.setAttribute('aria-label', chart.hit ? chart.title + '. Use left and right arrows to inspect values.' : chart.title);
    const selected = model.rows[interactive.selected];
    selection.hidden = !chart.hit;
    selection.textContent = selected ? `${selected.description} · ${selected.future ? 'Upcoming' : formatDuration(selected.minutes) + ' worked'}` :
      'Tap the chart or use the arrow keys to see a value.';
    document.getElementById('chartNote').textContent = chart.note;
    const legend = chart.legend.map(([label, fill]) => {
      const item = document.createElement('li');
      item.style.setProperty('--key-color', fill);
      item.textContent = label;
      return item;
    });
    document.getElementById('chartLegend').replaceChildren(...legend);
  }

  function exportChart(model, kind, details) {
    const chart = document.createElement('canvas');
    draw(chart, model, kind, 860, 430, true);
    const canvas = document.createElement('canvas');
    canvas.width = chart.width;
    canvas.height = chart.height + 42 + (details.length - 1) * 21;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(chart, 0, 0);
    context.fillStyle = '#46465b';
    context.font = '15px sans-serif';
    details.forEach((line, index) => context.fillText(line, 18, chart.height + 25 + index * 21, canvas.width - 36));
    return canvas;
  }

  function resize() {
    if (interactive?.model) update(interactive.model, interactive.kind, interactive.formatDuration);
  }

  return { update, exportChart, resize };
})();
