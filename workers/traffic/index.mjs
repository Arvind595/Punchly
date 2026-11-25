const analyticsUrl = 'https://api.cloudflare.com/client/v4/graphql';
const pageOrigin = 'https://arvind595.github.io';
const ttl = 1800;
const query = `query PunchlyTraffic($account: String!, $site: String!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      rumPageloadEventsAdaptiveGroups(
        limit: 1
        filter: { siteTag: $site, datetime_geq: $start, datetime_lt: $end }
      ) {
        count
        sum { visits }
      }
    }
  }
}`;
let pending;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Access-Control-Allow-Origin': pageOrigin,
      'Cache-Control': status === 200 ? `public, max-age=${ttl}` : 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function readTraffic(env) {
  const now = Date.now();
  const end = new Date(Math.floor(now / 60000) * 60000).toISOString().replace('.000Z', 'Z');
  const start = new Date(Date.parse(end) - 7 * 86400000).toISOString().replace('.000Z', 'Z');
  const response = await fetch(analyticsUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.CF_ANALYTICS_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { account: env.CF_ACCOUNT_ID, site: env.CF_WEB_ANALYTICS_SITE_TAG, start, end } }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Analytics unavailable');
  const result = await response.json();
  const rows = result.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups;
  if (result.errors?.length || !Array.isArray(rows)) throw new Error('Analytics unavailable');
  const totals = rows[0];
  const pageViews = totals ? totals.count : 0;
  const visits = totals ? totals.sum?.visits : 0;
  if (![pageViews, visits].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid aggregate');
  return { pageViews, visits, periodDays: 7, asOf: end };
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname !== '/stats' || url.search) return json({ error: 'Not found' }, 404);
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (!env.CF_ANALYTICS_API_TOKEN || !/^[a-f0-9]{32}$/i.test(env.CF_ACCOUNT_ID ?? '') ||
        !/^[a-f0-9]{32}$/i.test(env.CF_WEB_ANALYTICS_SITE_TAG ?? '')) {
      return json({ error: 'Traffic statistics unavailable' }, 503);
    }

    try {
      const cache = caches.default;
      const key = new Request(`${url.origin}/stats?site=${env.CF_WEB_ANALYTICS_SITE_TAG}`);
      const cached = await cache.match(key);
      if (cached) return cached;
      if (!pending) pending = readTraffic(env).finally(() => { pending = null; });
      const response = json(await pending);
      context.waitUntil(cache.put(key, response.clone()).catch(() => {}));
      return response;
    } catch {
      return json({ error: 'Traffic statistics unavailable' }, 503);
    }
  }
};
