const CACHE_NAME = "piflm-timeclock-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener(
  "install",
  (event) => {
    self.skipWaiting();

    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) => {
          return cache.addAll(ASSETS);
        })
    );
  }
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      Promise.all([
        self.clients.claim(),

        caches
          .keys()
          .then((keys) => {
            return Promise.all(
              keys
                .filter(
                  (key) =>
                    key !== CACHE_NAME
                )
                .map(
                  (key) =>
                    caches.delete(key)
                )
            );
          })
      ])
    );
  }
);

self.addEventListener(
  "fetch",
  (event) => {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(
            event.request
          );
        })
    );
  }
);
