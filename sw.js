/* Service worker: maakt de app offline beschikbaar.
   Verhoog CACHE_VERSION bij elke wijziging aan de app-bestanden, dan laadt de telefoon de nieuwe versie. */
'use strict';
var CACHE_VERSION = 'habits-v3';
var SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function(ev){
  ev.waitUntil(caches.open(CACHE_VERSION).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(ev){
  ev.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_VERSION; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(ev){
  var req = ev.request;
  if(req.method !== 'GET') return;

  // Pagina: eerst netwerk (dan zie je updates meteen), zonder internet de opgeslagen versie.
  if(req.mode === 'navigate'){
    ev.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function(c){ c.put('index.html', copy); });
        return res;
      }).catch(function(){ return caches.match('index.html'); })
    );
    return;
  }

  // Overige bestanden (iconen, lettertypen): uit cache, en op de achtergrond verversen.
  ev.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if(res && (res.ok || res.type === 'opaque')){
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});
