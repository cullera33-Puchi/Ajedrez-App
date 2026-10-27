// Service worker: permite instalar la app en el móvil y abrirla sin conexión.
// Páginas: primero la red; archivos con huella (assets/): primero la caché; el resto: caché y actualización por detrás.
const CACHE = 'ajedrez-app-v4'
// ignoreVary: el servidor puede responder con «Vary: Origin» y los scripts de módulo llevan Origin;
// sin esta opción, la copia guardada no se encontraría sin conexión.
// Motor de análisis y paquete de problemas sin conexión.
const ENGINE = ['engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm', 'puzzles/pack.json']

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
  // Las partes que se cargan al usarlas (pantallas, escáner) se nombran dentro de otros JS: se
  // recorren todos, también los que se descubren por el camino.
  const pending = linked.filter((x) => x.endsWith('.js'))
  const seen = new Set(pending)
  const lazy = []
  while (pending.length) {
    const u = pending.pop()
    const js = await fetch(u).then((r) => (r.ok ? r.text() : '')).catch(() => '')
    for (const m of js.matchAll(/["'`](?:\.\/|assets\/)([\w.-]+\.(?:js|css))["'`]/g)) {
      const href = new URL(`assets/${m[1]}`, scope).href
      if (seen.has(href)) continue
      seen.add(href)
      lazy.push(href)
      if (href.endsWith('.js')) pending.push(href)
    }
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
  // Archivos con huella en el nombre (assets/): nunca cambian, primero la caché.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => store(req, res))))
    return
  }
  // El resto (motor, paquete de problemas, iconos): se sirve la copia guardada y se actualiza por detrás.
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => {
      const fresh = fetch(req)
        .then((res) => store(req, res))
        .catch(() => hit ?? Response.error())
      if (hit) {
        event.waitUntil(fresh)
        return hit
      }
      return fresh
    }),
  )
})
