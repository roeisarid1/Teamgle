const CACHE_NAME = "teamgle-pwa-v4";

const APP_SHELL = [
  "./auth.html",
  "./employee-dashboard.html",
  "./manager-dashboard.html",
  "./manager-dashboard-he.html",
  "./css/auth.css",
  "./css/chat.css",
  "./css/manager-dashboard.css",
  "./js/api-config.js",
  "./js/auth.js",
  "./js/chat-service.js",
  "./js/chat-ui.js",
  "./js/employee-dashboard.js",
  "./js/firebase-config.js",
  "./js/i18n.js",
  "./js/manager-dashboard.js",
  "./js/time-picker.js",
  "./manifest.webmanifest",
  "./icons/teamgle-192.png",
  "./icons/teamgle-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchedResponse = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          }
          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchedResponse;
    })
  );
});
