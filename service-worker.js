const CACHE_NAME = 'coherent-breathing-cache-v1.1'; // Updated version
const urlsToCache = [
  './', // Alias for index.html in service worker context
  './index.html',
  './app.js',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
  // Add any other crucial assets like specific fonts if used locally
];

// Install event - cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        // Use {cache: 'reload'} to ensure fresh copies from network during install
        const cachePromises = urlsToCache.map(urlToCache => {
            return fetch(urlToCache, {cache: 'reload'})
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to fetch ${urlToCache}: ${response.statusText}`);
                    }
                    return cache.put(urlToCache, response);
                }).catch(error => {
                    console.error('Failed to cache:', urlToCache, error);
                });
        });
        return Promise.all(cachePromises);
      })
      .catch(error => {
        console.error('Cache addAll/fetch failed during install:', error);
      })
  );
  self.skipWaiting(); // Activate new service worker immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // Take control of clients immediately
    })
  );
});

// Fetch event - serve from cache, fallback to network, then offline page if applicable
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // console.log('Serving from cache:', event.request.url);
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(event.request).then(
          networkResponse => {
            // Check if we received a valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // console.log('Caching new resource:', event.request.url);
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(error => {
          console.log('Fetch failed; returning offline page instead.', error);
          // Fallback for navigation requests (HTML pages)
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html'); // Or a specific offline.html page
          }
          // For other requests (CSS, JS, images), you might not want a fallback or a different one
          return new Response("Network error occurred", {
            status: 408,
            headers: { "Content-Type": "text/plain" },
          });
        });
      })
  );
});

// Handle skip waiting messages from the client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
