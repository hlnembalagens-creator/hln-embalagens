/* Service worker mínimo: permite instalar o app no celular. Rede primeiro — nunca serve
   dados antigos do CRM; o cache só guarda a casca (HTML/CSS/JS) para abrir sem sinal. */
var CACHE = 'hln-admin-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.indexOf('/api/') === 0) return; // Supabase/API: sempre rede
  e.respondWith(fetch(req).then(function (resp) {
    var copia = resp.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copia); });
    return resp;
  }).catch(function () { return caches.match(req); }));
});
