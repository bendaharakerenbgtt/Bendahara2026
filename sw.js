const CACHE_NAME = 'dana-imip-cache-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dasboard.html',
  '/laporan-keuangan.html',
  '/lihat-kegiatan.html',
  '/detail-kegiatan.html',
  '/riwayat-transaksi.html',
  '/pembayaran-kas.html',
  '/buat-surat.html',
  '/folder-surat.html',
  '/manifest.json',
  '/bendahara.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Cache install warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Let Google Script API, SweetAlert CDN, and dynamic network requests bypass cache or go straight to network
  if (event.request.url.includes('script.google.com') || event.request.url.includes('googleusercontent.com') || event.request.method !== 'GET') {
    return;
  }

  // Network-first strategy with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
