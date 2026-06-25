# Especificación de Migración de Stack — SGE (Sistema de Gestión de Casos Estudiantiles)

## 1. Objetivo

Migrar el SGE desde su implementación actual (frontend 100% estático con persistencia en `localStorage`) hacia una arquitectura de **backend con Node.js y base de datos PostgreSQL**, manteniendo **exactamente las mismas funcionalidades** visibles para el usuario. El frontend (HTML/Bootstrap/Tailwind/Chart.js) se conserva; cambia únicamente la capa de datos: pasa de `localStorage` a llamadas HTTP contra una API REST respaldada por PostgreSQL.

No se agregan funcionalidades nuevas ni se quitan las existentes. No se rediseña la UI.

---

## 2. Inventario de funcionalidades actuales (a preservar)

Relevado desde `index.html`:

### 2.1 Autenticación
- Login con usuario/contraseña.
- 3 tipos de cuenta:
  - **Administrador** (`admin` / `admin123`): acceso total, único que puede gestionar el equipo.
  - **Invitado** (`invitado` / `invitado123`): solo lectura (no puede crear casos, ni acciones, ni gestionar equipo).
  - **Funcionario**: usuarios cargados en el "Equipo" (ej. Ana Martínez, Carlos Retamal), pueden operar casos pero no gestionar equipo.
- Sesión persistente (hoy vía `localStorage`, en el nuevo stack vía token de sesión/JWT).
- Cierre de sesión.

### 2.2 Dashboard
- KPIs: Total de casos, Abiertos, En seguimiento, Cerrados.
- Filtros globales: por categoría y por fecha "desde".
- Panel de alertas críticas: casos no cerrados con ≥10 días sin actividad en bitácora.
- 3 gráficos (Chart.js):
  - Casos por categoría (barra).
  - Casos por responsable (dona).
  - Efectividad de medidas reparatorias (torta: éxito vs. en ejecución/reincidentes).

### 2.3 Gestión de Casos
- Listado de casos con filtros: estado, categoría, responsable, búsqueda por nombre de estudiante.
- Columnas: ID/estudiante, categoría, fecha apertura, días activo (calculado), responsable, estado.
- Exportación a CSV.
- Apertura de nuevo caso (estudiante, fecha, categoría, responsable, descripción inicial). Estado inicial: "Abierto".

### 2.4 Detalle / Expediente de Caso
- Ficha resumen: folio, estudiante, estado, categoría, descripción, fecha apertura, días de permanencia, responsable.
- Bitácora cronológica (timeline) con tipos de entrada:
  - **Apertura** (automática al crear el caso).
  - **Entrevista** (subtipo: Estudiante / Apoderado-Tutor).
  - **Seguimiento**.
  - **Medida** (tipo de medida: Compromiso de Mediación, Derivación Psicológica, Plan Reparatorio).
  - **Cierre** (motivo: Exitosa sin Reincidencia, Derivado Externo, Cierre por Deserción).
- Cada entrada de bitácora registra: fecha, operador (usuario logueado que firma), contenido/observaciones.
- Al registrar la primera acción sobre un caso "Abierto", su estado pasa a "En seguimiento".
- Cierre de expediente: cambia estado a "Cerrado", agrega entrada de cierre con motivo y evaluación final.
- Generación de texto de "Citación a Apoderado" (plantilla, se copia al portapapeles).
- Impresión de resumen certificado del expediente (vista de impresión ya tiene sus reglas CSS, se mantiene).
- Reglas de permisos: el panel de acciones rápidas se oculta si el caso está "Cerrado" o si el usuario es "invitado".

### 2.5 Gestor de Equipo
- Listado de funcionarios (nombre, rol institucional).
- Alta de funcionario (nombre, rol, contraseña) — solo `admin`.
- Baja de funcionario — solo `admin`.
- Para el resto de los roles, la sección se muestra bloqueada/deshabilitada (solo lectura).

---

## 3. Stack tecnológico propuesto

| Capa | Tecnología |
|---|---|
| Runtime backend | Node.js (LTS) |
| Framework HTTP | Express |
| Base de datos | PostgreSQL |
| Acceso a datos | `pg` (node-postgres) o un ORM ligero (Prisma o Sequelize) |
| Autenticación | JWT (token en `Authorization: Bearer`) o sesión httpOnly cookie + `express-session` |
| Hash de contraseñas | `bcrypt` |
| Validación de entrada | `zod` o `express-validator` |
| Frontend | Se mantiene el `index.html` actual; las funciones que hoy leen/escriben `localStorage` se reemplazan por `fetch()` a la API REST |

La elección entre JWT y sesión de servidor, y entre `pg` plano u ORM, queda abierta y se puede decidir junto con el usuario antes de implementar — no afecta el modelo de datos descrito abajo.

---

## 4. Modelo de datos (PostgreSQL)

### 4.1 Diagrama relacional (resumen)

```
usuarios (1) ──< casos (responsable_principal_id)
categorias_caso (1) ──< casos (categoria_id)
casos (1) ──< bitacora_entradas (caso_id)
usuarios (1) ──< bitacora_entradas (operador_id)
```

### 4.2 Tabla `usuarios`

Unifica las cuentas hoy hardcodeadas (`admin`, `invitado`) y los funcionarios del "Equipo", ya que en el sistema actual ambos conceptos cumplen el mismo rol funcional (login + firma de acciones).

```sql
CREATE TYPE tipo_cuenta AS ENUM ('admin', 'invitado', 'funcionario');

CREATE TABLE usuarios (
    id              SERIAL PRIMARY KEY,
    nombre_completo VARCHAR(150) NOT NULL,
    rol_institucional VARCHAR(120),        -- ej. "Psicólogo Escolar", "Directora de Convivencia"
    tipo_cuenta     tipo_cuenta NOT NULL DEFAULT 'funcionario',
    nombre_usuario  VARCHAR(80) NOT NULL UNIQUE,  -- usado para login
    password_hash   VARCHAR(255) NOT NULL,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.3 Tabla `categorias_caso`

Las 5 categorías actuales quedan como datos semilla, pero la tabla permite agregar nuevas sin tocar código.

```sql
CREATE TABLE categorias_caso (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO categorias_caso (nombre) VALUES
    ('Convivencia Escolar'),
    ('Académico / Rendimiento'),
    ('Asistencia / Deserción'),
    ('Salud Mental / Emocional'),
    ('Vulneración de Derechos');
```

### 4.4 Tabla `casos`

```sql
CREATE TYPE estado_caso AS ENUM ('Abierto', 'En seguimiento', 'Cerrado');

CREATE TABLE casos (
    id                       SERIAL PRIMARY KEY,
    estudiante               VARCHAR(150) NOT NULL,
    categoria_id             INTEGER NOT NULL REFERENCES categorias_caso(id),
    descripcion              TEXT NOT NULL,
    estado                   estado_caso NOT NULL DEFAULT 'Abierto',
    fecha_apertura           DATE NOT NULL,
    responsable_principal_id INTEGER NOT NULL REFERENCES usuarios(id),
    fecha_cierre             DATE,
    motivo_cierre            VARCHAR(60),     -- 'Exitosa sin Reincidencia' | 'Derivado Externo' | 'Cierre por Deserción'
    creado_en                TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_casos_estado ON casos(estado);
CREATE INDEX idx_casos_categoria ON casos(categoria_id);
CREATE INDEX idx_casos_responsable ON casos(responsable_principal_id);
```

### 4.5 Tabla `bitacora_entradas`

Registra cada hito del expediente (apertura, entrevista, seguimiento, medida, cierre), igual que el array `bitacora` actual de cada caso en `localStorage`.

```sql
CREATE TYPE tipo_bitacora AS ENUM ('Apertura', 'Entrevista', 'Seguimiento', 'Medida', 'Cierre');

CREATE TABLE bitacora_entradas (
    id              SERIAL PRIMARY KEY,
    caso_id         INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    tipo            tipo_bitacora NOT NULL,
    fecha           DATE NOT NULL,
    operador_id     INTEGER NOT NULL REFERENCES usuarios(id),
    contenido       TEXT NOT NULL,
    subtipo_entrevista VARCHAR(40),   -- 'Estudiante' | 'Apoderado / Tutor'  (solo cuando tipo = 'Entrevista')
    estado_medida   VARCHAR(60),      -- 'Compromiso de Mediación' | 'Derivación Psicológica' | 'Plan Reparatorio'  (solo cuando tipo = 'Medida')
    motivo_cierre   VARCHAR(60),      -- duplicado puntual del motivo, solo cuando tipo = 'Cierre' (coincide con casos.motivo_cierre)
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bitacora_caso ON bitacora_entradas(caso_id);
CREATE INDEX idx_bitacora_fecha ON bitacora_entradas(fecha);
```

### 4.6 Datos semilla (equivalentes a `EQUIPO_SEMILLA` y `CASOS_SEMILLA`)

```sql
-- Cuentas especiales + funcionarios actuales
INSERT INTO usuarios (nombre_completo, rol_institucional, tipo_cuenta, nombre_usuario, password_hash) VALUES
    ('Administrador General', 'Administrador Maestro', 'admin', 'admin', '<hash de admin123>'),
    ('Usuario Invitado', 'Visualizador Solo Lectura', 'invitado', 'invitado', '<hash de invitado123>'),
    ('Ana Martínez', 'Orientadora Principal', 'funcionario', 'ana.martinez', '<hash de 123>'),
    ('Carlos Retamal', 'Psicólogo Escolar', 'funcionario', 'carlos.retamal', '<hash de 123>'),
    ('María José Ossa', 'Directora de Convivencia', 'funcionario', 'maria.ossa', '<hash de 123>');

-- Casos de ejemplo (101 y 102), preservando exactamente los datos
-- de demostración actuales (CASOS_SEMILLA), incluida su bitácora.
-- Se resuelven los IDs de usuario/categoría por nombre mediante subconsultas.

INSERT INTO casos (id, estudiante, categoria_id, descripcion, estado, fecha_apertura, responsable_principal_id) VALUES
(
    101,
    'Joaquín Maino Palma',
    (SELECT id FROM categorias_caso WHERE nombre = 'Convivencia Escolar'),
    'Discusión verbal recurrente en el patio con compañeros de curso durante el periodo de colación. Afecta el clima de convivencia del aula.',
    'En seguimiento',
    '2026-05-10',
    (SELECT id FROM usuarios WHERE nombre_completo = 'Ana Martínez')
),
(
    102,
    'Francisca Silva Fuentes',
    (SELECT id FROM categorias_caso WHERE nombre = 'Académico / Rendimiento'),
    'Baja abrupta de calificaciones en el último trimestre escolar. Se evidencia desmotivación severa.',
    'Abierto',
    '2026-06-01',
    (SELECT id FROM usuarios WHERE nombre_completo = 'Carlos Retamal')
);

-- Ajustar la secuencia de autoincremento para que los próximos casos
-- creados desde la UI continúen después del folio 102.
SELECT setval(pg_get_serial_sequence('casos', 'id'), 102, true);

INSERT INTO bitacora_entradas (caso_id, tipo, fecha, operador_id, contenido, estado_medida) VALUES
(101, 'Apertura', '2026-05-10', (SELECT id FROM usuarios WHERE nombre_completo = 'Ana Martínez'), 'Apertura formal de folio.', NULL),
(101, 'Medida',   '2026-05-12', (SELECT id FROM usuarios WHERE nombre_completo = 'Ana Martínez'), 'Firma de compromiso de mediación estudiantil de sana convivencia.', 'Compromiso de Mediación'),
(102, 'Apertura', '2026-06-01', (SELECT id FROM usuarios WHERE nombre_completo = 'Carlos Retamal'), 'Apertura del expediente por alerta del sistema académico de notas.', NULL);
```

> Estos dos casos de ejemplo (folios #101 y #102) deben mantenerse como datos de demostración en el seed del nuevo backend, igual que hoy se mantienen en `CASOS_SEMILLA` dentro del HTML. No se eliminan ni se reemplazan por otros datos de prueba.

> Nota: hoy el login se hace por **nombre completo** (ej. "Ana Martínez"). Se agrega `nombre_usuario` como campo de login normalizado para evitar ambigüedades, pero se debe decidir si el frontend sigue mostrando el nombre completo en el campo de usuario (recomendado, para no romper la experiencia actual) y el backend resuelve internamente por `nombre_usuario` o por `nombre_completo`.

---

## 5. Mapeo de funcionalidades → API REST

| Funcionalidad actual (JS/localStorage) | Endpoint propuesto |
|---|---|
| `procesarLogin` | `POST /api/auth/login` |
| `cerrarSesion` | `POST /api/auth/logout` |
| `verificarSesionExistente` | `GET /api/auth/me` |
| `actualizarMetricasDashboard` (KPIs, alertas, gráficos) | `GET /api/dashboard/metricas?categoria=&desde=` |
| `renderTablaCasos` | `GET /api/casos?estado=&categoria=&responsable=&search=` |
| `guardarNuevoCaso` | `POST /api/casos` |
| `verDetalleCaso` | `GET /api/casos/:id` (incluye bitácora) |
| `guardarAccionBitacora` (entrevista/seguimiento/medida) | `POST /api/casos/:id/bitacora` |
| `guardarCierreCaso` | `POST /api/casos/:id/cierre` |
| `generarCitaciónApoderado` | `GET /api/casos/:id/citacion` (puede seguir generándose en el cliente con los datos ya cargados; no requiere endpoint si no se persiste) |
| `exportarReporteExcel` (CSV) | `GET /api/casos/export.csv` |
| `agregarMiembroEquipo` | `POST /api/equipo` (solo `admin`) |
| eliminar funcionario (`equipo.splice`) | `DELETE /api/equipo/:id` (solo `admin`) |
| `renderTablaEquipo` | `GET /api/equipo` |

Todas las rutas (salvo `/api/auth/login`) requieren autenticación. Las rutas de escritura sobre `/api/equipo` validan en el backend que `tipo_cuenta = 'admin'` (la restricción hoy es solo visual en el frontend; en el nuevo stack debe aplicarse también del lado del servidor).

---

## 6. Reglas de negocio a preservar explícitamente

1. Al crear un caso, se inserta automáticamente una entrada de bitácora tipo `Apertura`.
2. Al registrar la primera entrada de bitácora (entrevista/seguimiento/medida) sobre un caso en estado `Abierto`, el estado pasa a `En seguimiento`.
3. Al cerrar un caso, el estado pasa a `Cerrado`, se guarda `fecha_cierre` y `motivo_cierre`, y se agrega entrada de bitácora tipo `Cierre`.
4. Un caso `Cerrado` no admite nuevas entradas de bitácora (el panel de acciones se oculta también en la UI).
5. El usuario `invitado` no puede crear casos, ni registrar acciones, ni gestionar el equipo (solo lectura) — debe validarse en backend, no solo en frontend.
6. Solo `admin` puede crear o eliminar funcionarios.
7. "Días activo"/"Permanencia" se calcula como `fecha_cierre (o hoy) - fecha_apertura`, igual que `calcularDiasAbiertos` actual.
8. Alerta de inactividad: casos no cerrados cuya última entrada de bitácora tiene ≥10 días de antigüedad respecto a hoy.

---

## 7. Fases de migración sugeridas

1. **Infraestructura**: levantar PostgreSQL, crear esquema (tablas de la sección 4), correr seed.
2. **Backend**: implementar API REST (Express) con los endpoints de la sección 5, incluyendo autenticación y validación de roles en servidor.
3. **Frontend**: reemplazar las funciones que leen/escriben `localStorage` y los arrays globales (`database`, `equipo`, `currentUser`) por llamadas `fetch()` a la API, manteniendo intactos el HTML, las clases CSS y los `id` de elementos (para no romper el resto del código ni el CSS de impresión).
4. **Verificación funcional**: validar uno a uno los flujos de la sección 2 contra la nueva API.
5. **Apagado de `localStorage`**: una vez verificado, eliminar el código de persistencia local remanente.

---

## 8. Fuera de alcance

- No se agregan nuevos roles, estados, categorías o tipos de bitácora.
- No se modifica la UI, estilos, ni el comportamiento de impresión.
- No se agrega gestión de archivos adjuntos, notificaciones por email, ni auditoría adicional — estas son posibles mejoras futuras, no parte de esta migración.
