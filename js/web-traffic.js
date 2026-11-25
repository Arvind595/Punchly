(() => {
  if (location.origin !== 'https://arvind595.github.io' || !location.pathname.startsWith('/Punchly/')) return;

  // Public site identifier for measurement. The GraphQL credential exists only in the Worker.
  const beacon = document.createElement('script');
  beacon.type = 'module';
  beacon.async = true;
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', '{"token":"7d082ed2634e4a418cfe3535e047cd27","spa":false}');
  document.head.append(beacon);

  const panel = document.getElementById('webTraffic');
  const status = document.getElementById('webTrafficStatus');
  const totals = document.getElementById('webTrafficTotals');
  const formatter = new Intl.NumberFormat();
  let endpoint;
  let due = 0;
  let loading = false;

  async function refresh() {
    if (document.hidden || loading || Date.now() < due ||
        document.getElementById('settings-view').hidden || !panel.closest('details').open) return;
    loading = true;
    try {
      const options = { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) };
      if (!endpoint) {
        const config = await fetch('config/traffic.json', { ...options, cache: 'no-cache' });
        if (!config.ok) throw new Error('Traffic configuration unavailable');
        const { endpoint: configured } = await config.json();
        if (!configured) {
          status.textContent = 'Public traffic statistics are awaiting setup.';
          due = Date.now() + 5 * 60000;
          return;
        }
        const url = new URL(configured);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/stats') {
          throw new Error('Invalid traffic endpoint');
        }
        endpoint = url.href;
      }
      const response = await fetch(endpoint, options);
      if (!response.ok) throw new Error('Traffic unavailable');
      const data = await response.json();
      if (data.periodDays !== 7 || ![data.pageViews, data.visits].every(value => Number.isSafeInteger(value) && value >= 0) ||
          !Number.isFinite(Date.parse(data.asOf))) throw new Error('Invalid traffic data');
      document.getElementById('webPageViews').textContent = formatter.format(data.pageViews);
      document.getElementById('webVisits').textContent = formatter.format(data.visits);
      const timestamp = new Date(data.asOf);
      status.textContent = `Seven-day totals · Updated ${timestamp.toLocaleString()}`;
      totals.hidden = false;
      due = Date.now() + 30 * 60000;
    } catch {
      if (totals.hidden) status.textContent = 'Public traffic statistics are temporarily unavailable.';
      due = Date.now() + 5 * 60000;
    } finally {
      loading = false;
    }
  }

  panel.hidden = false;
  window.addEventListener('punchly:settings-opened', refresh);
  document.addEventListener('visibilitychange', refresh);
  panel.closest('details').addEventListener('toggle', refresh);
  window.setInterval(refresh, 5 * 60000);
  refresh();
})();
