const CACHE_NAME = 'punchly-static-v4';
const APP_FILES = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/shift.js', './js/storage.js', './js/charts.js', './js/export.js',
  './js/settings.js', './js/reminders.js', './js/app.js',
  './assets/logo.svg', './assets/icon-192.png', './assets/icon-512.png',
  './assets/fonts/inter-regular.woff', './assets/fonts/inter-bold.woff',
  './assets/fonts/manrope-regular.woff', './assets/fonts/manrope-bold.woff',
  './vendor/xlsx-0.20.3.mini.js'
].map(path => new URL(path, self.registration.scope).href);
const entryUrl = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
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
  const appPage = event.request.mode === 'navigate' && (url.href === self.registration.scope || url.href === entryUrl);
  const key = appPage ? entryUrl : event.request.url;
  if (!APP_FILES.includes(key)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    const cached = await cache.match(key);
    return cached || fetch(event.request);
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const page = pages.find(client => client.url.startsWith(self.registration.scope));
    if (page) await page.focus();
    else await self.clients.openWindow(entryUrl);
  })());
});
