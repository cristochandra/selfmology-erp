const CACHE_NAME = 'selfmology-erp-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/modules/dashboard.js',
  './js/modules/master-data.js',
  './js/modules/inventory.js',
  './js/modules/invoices.js',
  './js/modules/delivery-orders.js',
  './js/modules/expenses.js',
  './js/modules/users.js',
  './js/modules/customers.js',
  './manifest.json'
];

// Pre-cache the shell and take over immediately on update.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Remove old cache versions and start controlling open pages right away.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for same-origin GETs: always try fresh files, fall back to
// cache only when offline. Cross-origin requests (Apps Script API, CDNs) and
// non-GET requests (API POSTs) pass straight through, never cached.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
