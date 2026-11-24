// BEGIN GENERATED ASSETS
const RELEASE = 32;
const CACHE_NAME = 'punchly-static-v32-854fb1a158be';
const APP_ASSETS = [
  "./LICENSE",
  "./assets/avatar-coffee.svg",
  "./assets/avatar-fern.svg",
  "./assets/avatar-fox.svg",
  "./assets/avatar-orbit.svg",
  "./assets/avatar-whale.svg",
  "./assets/fonts/comic-neue-bold.woff",
  "./assets/fonts/comic-neue-regular.woff",
  "./assets/fonts/inter-bold.woff",
  "./assets/fonts/inter-regular.woff",
  "./assets/fonts/manrope-bold.woff",
  "./assets/fonts/manrope-regular.woff",
  "./assets/fonts/nunito-bold.woff",
  "./assets/fonts/nunito-regular.woff",
  "./assets/fonts/playpen-sans-bold.woff",
  "./assets/fonts/playpen-sans-regular.woff",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/logo.svg",
  "./assets/punch-countryside.jpg",
  "./assets/punch-holiday.jpg",
  "./css/style.css?v=7657e2ba76b6",
  "./js/app-tools.js?v=bfef889ffa44",
  "./js/app.js?v=7d7e673f7cf4",
  "./js/attendance.js?v=3097a9895a1a",
  "./js/audit.js?v=752164cdd977",
  "./js/charts.js?v=3f318c0d760b",
  "./js/export.js?v=e8b500d7e005",
  "./js/guided-punch.js?v=ea34e9e7182d",
  "./js/icons.js?v=74e70b32813f",
  "./js/mini-timer.js?v=b7e165ac5c70",
  "./js/reminders.js?v=fe928f88bbeb",
  "./js/settings.js?v=8037eb6423b1",
  "./js/setup.js?v=8a09ae3dfd49",
  "./js/shift.js?v=53f923395d39",
  "./js/storage.js?v=a41e9fa3d107",
  "./manifest.webmanifest?v=2558bca903f1",
  "./vendor/punchly-sounds.js?v=6428b26e6b88",
  "./vendor/xlsx-0.20.3.mini.js"
]
  .map(path => new URL(path, self.registration.scope).href);
// END GENERATED ASSETS
const entryUrl = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const page = await fetch(entryUrl, { cache: 'reload' });
    const releaseTag = `<meta name="punchly-release" content="${RELEASE}">`;
    if (!page.ok || !(await page.clone().text()).includes(releaseTag)) {
      throw new Error('The Punchly deployment is still updating.');
    }
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(APP_ASSETS.map(url => new Request(url, { cache: 'reload' })));
      await cache.put(entryUrl, page);
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => keys.filter(key => key.startsWith('punchly-static-') && key !== CACHE_NAME))
    .then(previous => Promise.all(previous.slice(0, -1).map(key => caches.delete(key))))
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
  if (!APP_ASSETS.includes(event.request.url)) {
    if (url.origin === self.location.origin && event.request.url.includes('?v=')) {
      event.respondWith((async () => {
        const previous = (await caches.keys()).filter(key => key.startsWith('punchly-static-')).reverse();
        for (const key of previous) {
          const cached = await (await caches.open(key)).match(event.request);
          if (cached) return cached;
        }
        return fetch(event.request);
      })());
    }
    return;
  }
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
    if (!response.ok) return offlinePage || response;
    const releaseTag = `<meta name="punchly-release" content="${RELEASE}">`;
    return (await response.clone().text()).includes(releaseTag) ? response : offlinePage || response;
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
