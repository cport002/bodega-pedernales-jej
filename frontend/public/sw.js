const CACHE = 'bodega-pedernales-v2';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: siempre intenta la red, cae a caché solo si no hay conexión
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return; // API siempre en vivo

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Notificación push (nueva solicitud, o aprobación/rechazo de la propia) — el payload lo arma
// services/notificaciones.js en el backend: { titulo, mensaje, url }.
self.addEventListener('push', e => {
  let data = { titulo: 'Bodega Pedernales', mensaje: '', url: '/' };
  try { data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(
    self.registration.showNotification(data.titulo, {
      body: data.mensaje || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

// Al tocar la notificación: si ya hay una pestaña de la app abierta, la enfoca y navega ahí;
// si no, abre una nueva. Evita acumular pestañas duplicadas.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      const existente = clientsArr.find(c => 'focus' in c);
      if (existente) {
        existente.navigate(url);
        return existente.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
