// Service worker: permite instalar la app en el móvil y abrirla sin conexión.
// Páginas: primero la red (para recibir actualizaciones); el resto de archivos: primero la caché.
const CACHE = 'ajedrez-app-v2'
// ignoreVary: el servidor puede responder con «Vary: Origin» y los scripts de módulo llevan Origin;
// sin esta opción, la copia guardada no se encontraría sin conexión.
const ENGINE = ['engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm']

/**
 * Al instalar se guarda la página principal, los archivos que enlaza (JS y CSS con hash), las partes
 * que se cargan al usarlas y el motor, para que toda la app funcione sin conexión desde la primera visita.
 */
async function precache() {
  const cache = await caches.open(CACHE)
  const scope = self.registration.scope
  const res = await fetch(scope, { cache: 'no-cache' })
  if (!res.ok) return
  const html = await res.clone().text()
  await cache.put(scope, res)
  const linked = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => new URL(m[1], scope))
    .filter((u) => u.origin === self.location.origin)
    .map((u) => u.href)
  // Las partes que se cargan al usarlas (como el escáner) se nombran dentro de los JS principales.
  const lazy = []
  for (const u of linked.filter((x) => x.endsWith('.js'))) {
    const js = await fetch(u).then((r) => (r.ok ? r.text() : '')).catch(() => '')
    for (const m of js.matchAll(/["'`](?:\.\/|assets\/)([\w.-]+\.(?:js|css))["'`]/g)) lazy.push(new URL(`assets/${m[1]}`, scope).href)
  }
  const urls = [...new Set([...linked, ...lazy, ...ENGINE.map((f) => new URL(f, scope).href)])]
  await Promise.all(urls.map((u) => cache.add(u).catch(() => undefined)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().catch(() => undefined).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const store = (req, res) => {
  if (res.ok) {
    const copy = res.clone()
    caches.open(CACHE).then((c) => c.put(req, copy))
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  // Solo archivos propios; las APIs (Chess.com, Lichess, entrenador local) van siempre a la red.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => store(req, res))
        .catch(() => caches.match(req, { ignoreVary: true }).then((hit) => hit || caches.match(self.registration.scope, { ignoreVary: true }))),
    )
    return
  }
  event.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => store(req, res))))
})
