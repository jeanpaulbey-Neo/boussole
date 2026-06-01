// Service worker — offline-first du socle (SPEC §1 « offline-first pour le contenu déjà chargé »).
// App shell + JS : cache-first. Données fiscales (/shared/data) : network-first avec
// repli sur le cache, pour servir la version OTA la plus fraîche tout en restant lisible
// hors-ligne (cohérent avec data.js qui cache aussi la dernière bonne valeur).

const VERSION = 'boussole-v12';
const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/engine.js',
  '/js/data.js',
  '/js/avis.js',
  '/manifest.webmanifest',
  '/shared/data/fiscal-params.json',
  '/shared/data/veille-fiscale.json',
  '/shared/data/modules.json',
  '/shared/data/niches-fiscales.json',
  '/shared/data/droits-sociaux.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Données fiscales : network-first (fraîcheur OTA) → cache → échec géré par l'app.
  if (url.pathname.startsWith('/shared/data/')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request)),
    );
    return;
  }

  // App shell : cache-first → réseau.
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});
