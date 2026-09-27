// Service worker : fonctionnement hors ligne et mise en cache des visuels
const VERSION = 'v6';
const APP = 'app-' + VERSION;
const IMG = 'img-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'Icons/icon-192.png', 'Icons/icon-512.png', 'Icons/icon-maskable-512.png'];
const MAX_IMG = 2500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith('app-') && k !== APP).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function trim() {
  const c = await caches.open(IMG);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_IMG; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Visuels des cartes : cache d'abord, réseau ensuite
  if (url.hostname === 'assets.tcgdex.net') {
    e.respondWith(caches.open(IMG).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type !== 'opaque') { c.put(req, res.clone()); trim(); }
      return res;
    }));
    return;
  }

  // Polices Google : cache d'abord
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open(APP).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Application : réseau d'abord (pour recevoir les mises à jour), cache si hors ligne
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) caches.open(APP).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  }
});
