// Service worker minimal de Coinvera : il rend le site installable (PWA) et ne met RIEN en cache.
// Aucune donnée de compte, de paiement ou de session n'est conservée par ce fichier ; toutes les requêtes passent par le réseau.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
