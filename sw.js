// Bump this on every deploy that changes any cached file — it's what forces old caches (and
// stale phone installs) to drop and re-fetch. The fetch handler is network-first, so this mostly
// just controls the offline fallback; the version bump matters for forcing SW re-activation.
const CACHE = 'envelope-v5';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon.svg',
  './js/bus.js',
  './js/charts.js',
  './js/db.js',
  './js/main.js',
  './js/money.js',
  './js/palette.js',
  './js/period.js',
  './js/router.js',
  './js/state.js',
  './js/stats.js',
  './js/ui/chrome.js',
  './js/sync.js',
  './js/waterfall.js',
  './js/ui/dashboard.js',
  './js/ui/bills.js',
  './js/ui/debts.js',
  './js/ui/essentials.js',
  './js/ui/folders.js',
  './js/ui/goals.js',
  './js/ui/modal.js',
  './js/ui/onboarding.js',
  './js/ui/quickadd.js',
  './js/ui/reports.js',
  './js/ui/settings.js',
  './js/ui/toast.js',
  './js/ui/transactions.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Network-first: always try to serve the latest deployed file when online, so a fresh push shows
// up on next load without the user needing to uninstall/reinstall the PWA. Cache is purely an
// offline fallback, refreshed on every successful network fetch.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return; // never touch cross-origin (Supabase) or non-GET requests
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
