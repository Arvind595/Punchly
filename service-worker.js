const RELEASE = 18;
const CACHE_NAME = `punchly-static-v${RELEASE}`;
const APP_ASSETS = [
  ...['css/style.css', 'manifest.webmanifest', 'js/shift.js', 'js/icons.js', 'js/audit.js', 'js/storage.js',
    'js/charts.js', 'js/export.js', 'js/settings.js', 'js/reminders.js', 'js/attendance.js', 'js/mini-timer.js', 'js/guided-punch.js',
    'js/app-tools.js', 'js/app.js']
    .map(path => `./${path}?v=${RELEASE}`),
  './assets/logo.svg', './assets/icon-192.png', './assets/icon-512.png',
  './assets/punch-countryside.jpg', './assets/punch-holiday.jpg',
  './assets/avatar-fox.svg', './assets/avatar-whale.svg', './assets/avatar-fern.svg',
  './assets/avatar-coffee.svg', './assets/avatar-orbit.svg',
  './assets/fonts/inter-regular.woff', './assets/fonts/inter-bold.woff',
  './assets/fonts/manrope-regular.woff', './assets/fonts/manrope-bold.woff',
  './vendor/xlsx-0.20.3.mini.js'
].map(path => new URL(path, self.registration.scope).href);
const entryUrl = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const page = await fetch(entryUrl, { cache: 'reload' });
    const releaseTag = `<meta name="punchly-release" content="${RELEASE}">`;
    if (!page.ok || !(await page.clone().text()).includes(releaseTag)) {
      throw new Error('The Punchly deployment is still updating.');
    }
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_ASSETS.map(url => new Request(url, { cache: 'reload' })));
    await cache.put(entryUrl, page);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('punchly-static-') && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  url.hash = '';
  const appPage = event.request.mode === 'navigate' && (url.href === self.registration.scope || url.href === entryUrl);
  if (appPage) {
    event.respondWith(loadAppPage(event.request));
    return;
  }
  if (!APP_ASSETS.includes(event.request.url)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(event.request);
    return cached || fetch(event.request);
  }));
});

async function loadAppPage(request) {
  const cache = await caches.open(CACHE_NAME);
  const offlinePage = await cache.match(entryUrl);
  const controller = new AbortController();
  const timeout = offlinePage ? setTimeout(() => controller.abort(), 4000) : undefined;
  try {
    const response = await fetch(request, { cache: 'no-cache', signal: controller.signal });
    return response.ok ? response : offlinePage || response;
  } catch (error) {
    if (offlinePage) return offlinePage;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const page = pages.find(client => client.url.startsWith(self.registration.scope));
    if (page) await page.focus();
    else await self.clients.openWindow(entryUrl);
  })());
});
