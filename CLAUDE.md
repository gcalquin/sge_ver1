# CLAUDE.md — SGE (Sistema de Gestión de Casos Estudiantiles)

Contexto persistente del proyecto para asistir a futuras sesiones de Claude Code. Léelo antes de tocar código.

## 1. Objetivo del proyecto

El SGE es una plataforma para que **colegios chilenos** registren, organicen y den seguimiento a situaciones que afectan a sus estudiantes: convivencia escolar, rendimiento académico, asistencia/deserción, salud mental y vulneración de derechos.

El sistema busca:
- Centralizar cada situación en un **expediente único (caso)** con una bitácora cronológica de todas las acciones (entrevistas, seguimientos, medidas reparatorias, mediaciones, cierre).
- Permitir que **distintos profesionales** del establecimiento (orientadores, psicólogos, inspectores, encargados de convivencia) colaboren sobre los mismos casos con permisos diferenciados.
- Forzar el cumplimiento de **plazos y protocolos de actuación** exigidos por la normativa educacional chilena (Ley de Convivencia Escolar 20.536, denuncia obligatoria, Ley 19.628/21.719 de protección de datos para la retención/purga de expedientes).
- Operar en **modalidad multi-tenant**: un mismo despliegue sirve a muchos colegios (potencialmente agrupados bajo un mismo sostenedor), cada uno con sus propios datos aislados, más un nivel de **administración central** que gestiona la red completa de colegios y sostenedores.
- Dejar trazabilidad legal/administrativa de todo (auditoría, hash-chain de bitácora, firmas electrónicas simples).

El proyecto nació como un prototipo 100% estático (`index.html` con `localStorage`, ver `ESPECIFICACION-MIGRACION-BACKEND.md`) y fue migrado a una arquitectura cliente-servidor real con Node.js + PostgreSQL, manteniendo la UI original y ampliándola progresivamente. **El código vigente vive en `server/`.**

## 2. Dónde está el código (y qué NO tocar)

```
Sge/
├── CLAUDE.md                          ← este archivo
├── ESPECIFICACION-MIGRACION-BACKEND.md  ← spec histórica de la migración localStorage → backend (contexto, ya ejecutada)
├── .github/workflows/ci.yml            ← CI: lint + migraciones + seed + build:css + tests en cada push/PR
├── legacy/                             ← prototipo ESTÁTICO ORIGINAL (localStorage), OBSOLETO. No se edita ni se sirve.
│   ├── index.html
│   └── index - respaldo ver 1.html
└── server/                             ← APLICACIÓN REAL (backend + frontend servido por Express)
    ├── src/                           ← backend Node.js/Express
    ├── public/                        ← frontend (HTML/CSS/JS vanilla servido como estático)
    ├── migrations/                    ← node-pg-migrate (histórico de cambios de esquema)
    ├── tests/                         ← vitest + supertest
    ├── eslint.config.js, .prettierrc.json  ← `npm run lint` / `npm run format`
    └── scripts/                       ← utilitarios puntuales
```

**Los dos HTML en `Sge/legacy/` son artefactos heredados del prototipo pre-migración. No se editan ni se sirven — toda la UI real está en `server/public/index.html`.** Si una tarea menciona "el index.html" sin más contexto, casi siempre se refiere a `server/public/index.html`.

## 3. Stack tecnológico

| Capa | Tecnología | Notas |
|---|---|---|
| Runtime | Node.js (CommonJS, `"type": "commonjs"`) | |
| Framework HTTP | Express 4 | `server/src/app.js` configura el pipeline completo |
| Base de datos | PostgreSQL | acceso vía `pg` (node-postgres) plano, **sin ORM** — SQL escrito a mano en cada controller |
| Migraciones | `node-pg-migrate` | `server/migrations/*.js`, ejecutar con `npm run db:migrate` |
| Esquema base | `server/src/db/schema.sql` | script idempotente (`CREATE TABLE IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object$$`) que se puede re-ejecutar sin romper nada |
| Seed de datos | `server/src/db/seed.js` | usuarios/colegios/casos de demostración |
| Autenticación | `express-session` + `connect-pg-simple` (sesión persistida en tabla `session` de Postgres), contraseñas con `bcryptjs` | sin JWT |
| Protección | `helmet` (CSP afinada para `onclick=""` inline), CSRF token propio (`src/middleware/csrf.js`), `express-rate-limit` | |
| Validación de entrada | `zod` (`server/src/validation/*.js`) | cada endpoint de escritura valida con un schema zod vía middleware `validar()` |
| Logging | `pino` + `pino-http` | |
| Subida de archivos | `multer` (adjuntos de casos, logo de colegio) | configs separadas en `src/config/upload.js` y `src/config/uploadLogo.js` |
| Generación de PDF | `pdfkit` | expedientes individuales y export masivo |
| Compresión ZIP | `archiver` **fijado a `^7.0.1`** | la v8 es ESM-only con API de clases y rompe el `archiver(format, options)` factory usado en el código — no actualizar sin reescribir esa integración |
| Email | `nodemailer` (config en `src/config/mailer.js`) | resumen de alertas, notificaciones |
| Tests | `vitest` + `supertest` | `npm test` |
| CSS | Tailwind CSS (build con `npm run build:css`) + Bootstrap 5 (CSS/JS vendoreados, servidos desde `node_modules` vía Express static) | |
| Iconos | Font Awesome Free (vendoreado) | |
| Gráficos | Chart.js | |
| Frontend JS | **Vanilla JS, sin build step, sin framework**. Cada archivo en `public/js/` es un IIFE-módulo (`const Casos = (() => {...})()`) que expone funciones en un objeto global referenciado desde `onclick=""` inline en el HTML | ver sección 6 |
| PWA | Service worker cache-first (`public/sw.js`) + `manifest.json` | ver sección 7 (gotcha crítico) |

No hay bundler/transpilador (no Webpack/Vite/Babel) para el JS de frontend: los `<script>` se cargan directo en `index.html` en orden de dependencia.

## 4. Arquitectura del backend

Pipeline de capas, estrictamente en este orden por request (ver `src/app.js` y cada archivo de `src/routes/*.js`):

```
helmet → pino-http (logging) → express.json() → sessionMiddleware
  → (solo /api) no-cache headers → verificarCsrf
  → router (routes/index.js)
      → requireAuth                (¿hay sesión?)
      → requireColegioContexto     (¿hay colegio activo en la sesión? → setea req.colegioId)
      → requireRol(...) / requireEscritura   (autorización por rol)
      → validar(zodSchema)         (valida body/params)
      → auditar("accion")          (engancha un log de auditoría a la respuesta vía res.on("finish"))
      → controller                  (SQL directo con `pool.query`, vía asyncHandler)
  → express.static(public/)        (sirve el frontend y vendors)
  → notFound / errorHandler
```

Convenciones a respetar al agregar funcionalidad:
- **Multi-tenancy**: casi toda query de negocio debe filtrar por `colegio_id = req.colegioId`. `requireColegioContexto` resuelve ese id: para roles normales es `req.usuario.colegioId`; para `superadmin` es `req.session.contextoColegioId` (el colegio que esté "impersonando" desde el Panel Central). Nunca asumas un colegio fijo.
- **Roles** (`rol_usuario` enum): `superadmin` (administración central, fuera de cualquier colegio salvo que entre en contexto) > `admin` (administra su colegio: equipo, configuración, convivencia) > `funcionario` (opera casos) > `invitado` (solo lectura, bloqueado por `requireEscritura`).
- **Rutas literales antes de `/:id`** en Express (orden de declaración importa).
- **`asyncHandler`** (`src/utils/asyncHandler.js`) envuelve todo controller async para no tener que hacer try/catch repetido — úsalo siempre en nuevos endpoints.
- **Auditoría**: usa el middleware `auditar("namespace.accion")` en rutas de escritura relevantes; queda visible en Configuración → Registro de Auditoría (solo `admin`/`superadmin`).
- **Bitácora con hash-chain**: cada entrada de bitácora encadena un hash SHA-256 sobre la entrada anterior (`src/utils/hash.js` → `calcularHash`) para dar integridad al historial del expediente; reutilizado también para entradas automáticas (p. ej. reasignación de casos al eliminar un usuario).
- **Protocolos**: existe un catálogo global de protocolos (`protocolos`) y un override opcional por colegio (`protocolos_colegio`). `obtenerPasosProtocoloEfectivo(colegioId, categoria)` resuelve primero el override y cae al global. Un caso nuevo congela una copia (snapshot) de los pasos vigentes al momento de crearse en `caso_pasos_protocolo`.

## 5. Modelo de datos (PostgreSQL)

Definido en `server/src/db/schema.sql` (fuente de verdad; las migraciones en `server/migrations/` son el historial incremental que llevó hasta ese estado). Tablas principales:

- `sostenedores` — entidad legal que puede administrar varios `colegios`.
- `colegios` — cada establecimiento (RBD, comuna, dirección, logo opcional, `activo` para desactivación lógica).
- `usuarios` — cuentas de login, con `rol` (enum `rol_usuario`), `especialidad` (enum `especialidad_usuario`, ej. "Psicólogo PIE"), `colegio_id` (null para `superadmin`).
- `casos` — expediente: estudiante (el "principal"), `categoria_caso` (enum), `estado_caso` (enum: Abierto/En seguimiento/Cerrado), responsable, flags PIE/NEE, JUNAEB, curso, etc.
- `caso_estudiantes_adicionales` — estudiantes adicionales involucrados en un caso (ej. una pelea o conflicto entre varios alumnos), más allá del `estudiante` principal de `casos` (que se mantiene tal cual por compatibilidad con folio/PDF/CSV/notificaciones). Tabla aditiva 1-a-muchos (`caso_id` FK con `ON DELETE CASCADE`), con su propio índice FTS (`to_tsvector('spanish', inmutable_unaccent(nombre))`). La búsqueda de casos (`listar`, `exportarPdfsZip`) y la detección de reincidencia (`dashboard`) consideran tanto el estudiante principal como los adicionales de cada caso (vía `EXISTS`/CTE `UNION ALL`, ver `casos.js`). El PDF de expediente imprime "Estudiante Principal" + "Otros estudiantes involucrados" cuando corresponde. CRUD vía `POST/DELETE /casos/:id/estudiantes-adicionales[/:estId]`.
- `bitacora` — entradas cronológicas (`tipo_entrada_bitacora` enum: Apertura/Entrevista/Seguimiento/Medida/Cierre), con hash-chain.
- `mediaciones` + `mediacion_compromisos` — actas de mediación escolar y sus compromisos de seguimiento. Cada acta se puede imprimir individualmente en PDF (con espacio para firma física) y luego adjuntar como medio de verificación una vez firmada y escaneada.
- `cursos_profesor_jefe` — mapea curso → profesor jefe, para notificación automática al abrir un caso de ese curso.
- `protocolos` (catálogo global) y `protocolos_colegio` (override por colegio) + `caso_pasos_protocolo` (snapshot por caso).
- `derivaciones` — derivaciones externas (Carabineros, Fiscalía, OLN — Oficina Local de la Niñez, ex-OPD — etc.), con `estado_derivacion` enum y flag de denuncia obligatoria.
- `metas_pme` — metas del Plan de Mejoramiento Educativo, comparadas contra indicadores reales en el Dashboard.
- `adjuntos` — "medios de verificación" genéricos. `caso_id` es nullable; cada fila cuelga de exactamente una entidad padre vía `bitacora_id`, `derivacion_id`, `mediacion_id` o `actividad_id` (este último sin `caso_id`, porque las actividades de convivencia no pertenecen a un caso).
- `auditoria` — log administrativo (usuario, colegio, acción, detalle, ip).
- `capacitaciones` — capacitaciones del equipo, con fecha de vencimiento (alimenta el panel "Capacitaciones por Vencer").
- `actividades_convivencia` — actividades preventivas (talleres/charlas), independientes de los casos. Tiene su propia bitácora de seguimiento (`actividad_bitacora`) y campos de cierre (`cerrada`, `fecha_cierre`, `evaluacion_cierre`, `cerrada_por`); se puede generar un PDF/resumen de impresión por actividad.
- `actividad_bitacora` — entradas cronológicas de seguimiento de una actividad de convivencia (asistencia, avances, incidencias), análogas a `bitacora` pero a nivel de actividad en vez de caso.
- `medidas_catalogo` — catálogo configurable (por colegio) de medidas reparatorias seleccionables en la bitácora.
- `session` — tabla de sesiones de `connect-pg-simple` (no tocar manualmente).

> La feature de "Firmas Electrónicas Simples" (tabla `firmas`) y la de "Notificar Apoderado" (canal WhatsApp/SMS/correo con plantillas multiidioma) existieron en versiones anteriores y fueron eliminadas por completo (backend, frontend y tabla). No reintroducirlas salvo pedido explícito. La generación de "Citación a Apoderado" (texto que se copia al portapapeles desde el expediente) es una función distinta que sí se mantiene.

## 6. Arquitectura del frontend

`server/public/index.html` es un SPA de una sola página con múltiples `<main id="view-...">` que se muestran/ocultan vía `App.switchView(nombre)` (en `public/js/app.js`). No hay router de URL; la navegación es 100% por estado en memoria.

- **Módulos JS** (`public/js/*.js`): cada uno es un IIFE que expone un objeto global (`App`, `Auth`, `Casos`, `Bitacora`, `Mediaciones`, `Capacitaciones`, `Convivencia`, `Equipo`, `Colegios`, `Config`, `Dashboard`, `Api`, `Offline`). Los botones del HTML llaman directo a estas funciones vía `onclick="Modulo.funcion()"` — no hay event delegation centralizado.
- **`Api.apiFetch`** centraliza `fetch()` hacia `/api/...`, inyectando el token CSRF y manejando sesión.
- **Permisos en UI**: `Auth.evaluarPermisosYRestriccionesDeRoles()` oculta botones de navegación (`.hidden`) y atenúa formularios (`opacity-40 pointer-events-none`) según `App.estado.currentUser.rol`. Esto es solo cosmético — **la autorización real siempre se valida en el backend** (`requireRol`/`requireEscritura`); nunca confíes solo en el gating de UI.
- **Tooltips**: Bootstrap 5 Tooltip no se auto-inicializa. Cualquier elemento con `data-bs-toggle="tooltip"` debe ser activado por `App.inicializarTooltips()`, que se llama en `DOMContentLoaded` y de nuevo al final de cada `render*()` que repinte contenido dinámico.
- **Vistas actuales**: `view-central` (superadmin: colegios/sostenedores), `view-dashboard`, `view-casos`, `view-detalle` (expediente), `view-equipo`, `view-convivencia` (actividades/medidas/protocolos personalizados — separada de Configuración por claridad de UX), `view-config` (umbrales, retención/purga, metas PME, auditoría).
- **Manual de usuario**: `server/public/manual.html`, documento HTML autocontenido (con su propio `<style>`, índice lateral y ejemplos) destinado a usuarios finales del colegio, no a desarrolladores. Mantenerlo sincronizado cuando se agregan funciones visibles para el usuario.

## 7. Gotchas críticos (ya mordieron antes — no repetir)

1. **Service Worker (`public/sw.js`) usa cache-first sobre el app shell.** Cualquier cambio a `index.html`, `*.css` o cualquier `*.js` listado en `APP_SHELL` requiere que `CACHE_NAME` cambie en el mismo commit, o los usuarios con el sitio ya abierto seguirán viendo la versión vieja indefinidamente (un usuario real reportó esto como "no veo los cambios / no puedo editar"). Esto **ya no depende de la memoria humana**: `npm run build:css` corre automáticamente `scripts/update-sw-version.mjs`, que recalcula `CACHE_NAME` como un hash del contenido real de los archivos de `APP_SHELL` (`sge-shell-<hash>`). Sigue siendo necesario correr `npm run build:css` (o `npm run build:sw` directamente) después de tocar cualquier archivo del app shell — lo que cambió es que ya no hay un número de versión que alguien pueda olvidar subir. El SW ya tiene `self.skipWaiting()` + `self.clients.claim()` para que la actualización no requiera cerrar todas las pestañas.
2. **`archiver` debe quedar en `^7.0.1`.** `npm install archiver` sin pin trae v8 (ESM-only, sin factory function) y rompe el export ZIP en runtime con `TypeError: archiver is not a function`.
3. **Orden de rutas Express**: las rutas literales (`/medidas-catalogo`, `/protocolos`) deben declararse antes que los patrones `/:id` o `/:categoria` equivalentes para no capturarlas por error.
4. **El gating de permisos en el HTML es solo visual.** Todo endpoint de escritura debe repetir la validación de rol en el middleware del backend.
5. **`to_tsquery('spanish', ...)` no acepta texto plano multi-palabra.** Pasarle directamente `inmutable_unaccent($n) || ':*'` revienta con "error de sintaxis en tsquery" en cuanto el término de búsqueda tiene más de una palabra (ej. "Juan Pérez"). Usar el helper `tsQueryBusqueda(param)` en `casos.js`, que convierte el texto en sintaxis válida (`regexp_replace(..., '\s+', ':* & ', 'g') || ':*'`) antes de pasarlo a `to_tsquery`.
6. **El logger (`pino`) escribe a stdout, no a un archivo.** Es deliberado (12-factor): la rotación de logs es responsabilidad de quien despliega (pm2, systemd, Docker), no de la app. Al verificar manualmente con `node src/server.js > algo.log 2>&1 &`, ese archivo es un artefacto de la sesión de desarrollo (ya está en `.gitignore` vía `*.log`) — bórralo cuando termines en vez de dejarlo creciendo indefinidamente.

## 8. Flujo de trabajo / comandos

```bash
cd server
cp .env.example .env          # configurar DATABASE_URL, SESSION_SECRET, SMTP_*
npm install
npm run db:migrate            # aplica server/migrations/*.js
npm run seed                  # carga usuarios/colegios/casos de demostración
npm run build:css             # compila Tailwind (tailwind-source.css → tailwind.css) y reversiona el Service Worker
npm run dev                   # node --watch src/server.js (puerto definido en .env, por defecto 3000)
npm test                      # vitest run (tests/*.test.js con supertest)
npm run lint                  # eslint . (0 errores requeridos; warnings no bloquean)
npm run format                # prettier --write sobre src/, public/js/, tests/, migrations/
```

CI (`.github/workflows/ci.yml`, en la raíz del repo) corre en cada push/PR a `main`: `npm run lint` → `npm run db:migrate` → `npm run seed` → `npm run build:css` → `npm test`, contra un Postgres de servicio efímero.

Variables de entorno relevantes (`.env`, ver `.env.example`): `PORT`, `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`, `SESSION_SECRET`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `SMTP_*`.

No hay paso de build para el JS de frontend: los archivos en `public/` se sirven tal cual; basta refrescar el navegador (atento al gotcha #1 del Service Worker).

## 9. Usuarios de prueba (seed)

- `admin` / `admin123` — rol `admin` en cada colegio semilla.
- `invitado` / `invitado123` — rol `invitado`, solo lectura.
- `superadmin` / `super123` — administración central (Panel Central, gestiona todos los colegios/sostenedores).
- Varios `funcionario` con nombre.apellido (ej. `carlos.retamal`, `ana.martinez`) repartidos en los colegios semilla ("Gabriela Mistral", "San Ignacio") bajo el sostenedor "Fundación Educacional Ejemplo".

No modificar estos datos semilla salvo que la tarea lo pida explícitamente; varios flujos de verificación manual dependen de que existan tal cual.

## 10. Mejoras evaluadas y deliberadamente no implementadas

En una auditoría de código completa (2026-06-27) se identificaron ~20 mejoras; la mayoría se implementó (XSS, fileFilter de uploads, trust proxy, rate limit general, paralelización de queries, paginación real, dedupe de estudiantes adicionales, ESLint/Prettier, CI, tests, limpieza de archivos legacy, auto-versionado del Service Worker). Tres quedaron **fuera de alcance a propósito**, no olvidadas:

- **Quitar `'unsafe-inline'` de la CSP / reemplazar los `onclick=""` inline por `addEventListener`.** Requeriría reescribir cientos de manejadores de eventos en `index.html` y los módulos de `public/js/`, con alto riesgo de regresión en toda la UI, a cambio de un beneficio marginal ya que el vector de XSS real (interpolación sin escapar en `innerHTML`) se cerró con `App.escapeHtml`. Si se aborda en el futuro, hacerlo como un proyecto dedicado con cobertura E2E primero, no como parte de un cambio mixto.
- **Hacer reversibles las migraciones (`down()`)**, que hoy lanzan `Error("no es reversible")`. El patrón actual (cada migración re-ejecuta `schema.sql` completo, idempotente vía `IF NOT EXISTS`) es deliberado y documentado; convertirlo en pasos reversibles exigiría reescribir las 8 migraciones históricas con `DROP COLUMN/TABLE` exactos por paso, con riesgo real de pérdida de datos si algo queda mal escrito. La mitigación real en producción es backup/restore de la base, no `migrate down`.
- **Partir `controllers/casos.js` (~900 líneas) en varios archivos** (ej. `casos.crud.js`, `casos.pdf.js`, `casos.dashboard.js`). Es un refactor puramente mecánico sin cambio funcional, pero toca el archivo más grande del backend y su wiring de rutas; el riesgo de un `require`/export roto no se justifica sin un motivo funcional concreto que lo dispare. Queda como candidato para la próxima vez que haya que tocar ese archivo de todos modos.
