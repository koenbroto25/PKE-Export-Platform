const CACHE_NAME = 'pke-platform-v1';
const STATIC_CACHE = 'pke-static-v1';
const DYNAMIC_CACHE = 'pke-dynamic-v1';

// Assets to cache during install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/css/*',
  '/js/*'
];

// Install service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
  );
});

// Activate service worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== STATIC_CACHE && cache !== DYNAMIC_CACHE) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch event - cache first strategy for static, network first for dynamic
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Skip non-GET requests for private data
  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then((fetchResponse) => {
        // Don't cache private responses
        if (!fetchResponse || fetchResponse.type !== 'basic') {
          return fetchResponse;
        }
        
        const responseToCache = fetchResponse.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        
        return fetchResponse;
      });
    })
  );
});

// Message handler for sync
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'sync') {
    // Handle sync request
    self.clients.claim().then(() => {
      // Trigger sync
      self.clients.matchAll({ type: 'all' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'sync:result', success: true });
        });
      });
    });
  }
}