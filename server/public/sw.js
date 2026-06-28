const CACHE_NAME = "sge-shell-c271b2a79ec5";
const APP_SHELL = [
    "/index.html",
    "/manifest.json",
    "/icons/icon.svg",
    "/css/tailwind.css",
    "/css/custom.css",
    "/vendor/bootstrap/css/bootstrap.min.css",
    "/vendor/bootstrap/js/bootstrap.bundle.min.js",
    "/vendor/fontawesome/css/all.min.css",
    "/vendor/chartjs/chart.umd.js",
    "/js/api.js",
    "/js/app.js",
    "/js/auth.js",
    "/js/colegios.js",
    "/js/dashboard.js",
    "/js/dashboardSostenedor.js",
    "/js/estudiantes.js",
    "/js/casos.js",
    "/js/bitacora.js",
    "/js/mediaciones.js",
    "/js/capacitaciones.js",
    "/js/comiteConvivencia.js",
    "/js/convivencia.js",
    "/js/equipo.js",
    "/js/config.js",
    "/js/sumarios.js",
    "/js/offline.js",
];

self.addEventListener("install", (event) => {
    // skipWaiting evita que haya que cerrar todas las pestañas para que el nuevo
    // service worker (y por tanto el app shell actualizado) entre en vigencia.
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

// Las respuestas de /api nunca se cachean: dependen de la sesión activa y deben
// reflejar siempre el estado real del servidor. Solo se cachea el "app shell".
self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET" || url.pathname.startsWith("/api")) return;

    event.respondWith(
        caches.match(event.request).then((cacheada) => {
            if (cacheada) return cacheada;
            return fetch(event.request).catch(() => caches.match("/index.html"));
        })
    );
});
