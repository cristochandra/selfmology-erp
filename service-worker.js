const CACHE_NAME = 'selfmology-erp-v1';
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
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
