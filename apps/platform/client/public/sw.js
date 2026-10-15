/*
 * Retirement worker for the legacy Serwist installation.
 *
 * The application no longer ships a PWA worker, but browsers that registered
 * the old one keep controlling localhost until they receive a valid update at
 * this exact URL.  Activate once, discard its caches and unregister itself so
 * future navigations always use the current application assets and API data.
 */
self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
    await self.registration.unregister()
    const windows = await self.clients.matchAll({ type: 'window' })
    await Promise.all(windows.map((windowClient) => windowClient.navigate(windowClient.url)))
  })())
})
