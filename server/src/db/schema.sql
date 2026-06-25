-- Esquema PostgreSQL multi-colegio para SGE
-- Idempotente: seguro de correr varias veces sobre la misma base.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper IMMUTABLE de unaccent, requerido para poder indexarlo en un GIN.
CREATE OR REPLACE FUNCTION inmutable_unaccent(text)
RETURNS text AS $$
    SELECT public.unaccent($1);
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

DO $$ BEGIN
    CREATE TYPE estado_caso AS ENUM ('Abierto', 'En seguimiento', 'Cerrado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE categoria_caso AS ENUM (
        'Convivencia Escolar',
        'Académico / Rendimiento',
        'Asistencia / Deserción',
        'Salud Mental / Emocional',
        'Vulneración de Derechos'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE tipo_entrada_bitacora AS ENUM ('Apertura', 'Entrevista', 'Seguimiento', 'Medida', 'Cierre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE rol_usuario AS ENUM ('superadmin', 'admin', 'funcionario', 'invitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger generico para mantener updated_at.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===================== colegios =====================
CREATE TABLE IF NOT EXISTS colegios (
    id           SERIAL PRIMARY KEY,
    nombre       VARCHAR(150) NOT NULL UNIQUE,
    comuna       VARCHAR(100),
    direccion    VARCHAR(200),
    activo       BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_folio INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_colegios_updated_at ON colegios;
CREATE TRIGGER trg_colegios_updated_at
    BEFORE UPDATE ON colegios
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===================== usuarios =====================
CREATE TABLE IF NOT EXISTS usuarios (
    id                 SERIAL PRIMARY KEY,
    colegio_id         INTEGER REFERENCES colegios(id) ON DELETE CASCADE,
    username           VARCHAR(80) NOT NULL,
    nombre             VARCHAR(150) NOT NULL,
    rol_institucional  VARCHAR(120),
    password_hash      VARCHAR(255) NOT NULL,
    rol                rol_usuario NOT NULL DEFAULT 'funcionario',
    activo             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- username único (case-insensitive) dentro de cada colegio.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_username_colegio
    ON usuarios (colegio_id, lower(username))
    WHERE colegio_id IS NOT NULL;

-- username único (case-insensitive) entre super-admins (colegio_id NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_username_superadmin
    ON usuarios (lower(username))
    WHERE colegio_id IS NULL;

DROP TRIGGER IF EXISTS trg_usuarios_updated_at ON usuarios;
CREATE TRIGGER trg_usuarios_updated_at
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===================== casos =====================
CREATE TABLE IF NOT EXISTS casos (
    id              SERIAL PRIMARY KEY,
    colegio_id      INTEGER NOT NULL REFERENCES colegios(id) ON DELETE CASCADE,
    folio           VARCHAR(20),
    estudiante      VARCHAR(150) NOT NULL,
    fecha_apertura  DATE NOT NULL,
    categoria       categoria_caso NOT NULL,
    descripcion     TEXT NOT NULL,
    estado          estado_caso NOT NULL DEFAULT 'Abierto',
    responsable_id  INTEGER NOT NULL REFERENCES usuarios(id),
    fecha_cierre    DATE,
    motivo_cierre   VARCHAR(60),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (colegio_id, folio)
);

CREATE INDEX IF NOT EXISTS idx_casos_colegio ON casos(colegio_id);
CREATE INDEX IF NOT EXISTS idx_casos_estado ON casos(estado);
CREATE INDEX IF NOT EXISTS idx_casos_categoria ON casos(categoria);
CREATE INDEX IF NOT EXISTS idx_casos_responsable ON casos(responsable_id);
CREATE INDEX IF NOT EXISTS idx_casos_estudiante_fts
    ON casos USING GIN (to_tsvector('spanish', inmutable_unaccent(estudiante)));

DROP TRIGGER IF EXISTS trg_casos_updated_at ON casos;
CREATE TRIGGER trg_casos_updated_at
    BEFORE UPDATE ON casos
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Folio correlativo por colegio (CASO-00001, CASO-00002, ...), con bloqueo de
-- fila sobre colegios para evitar folios duplicados ante inserciones concurrentes.
CREATE OR REPLACE FUNCTION set_folio()
RETURNS TRIGGER AS $$
DECLARE
    siguiente INTEGER;
BEGIN
    IF NEW.folio IS NULL THEN
        UPDATE colegios
           SET ultimo_folio = ultimo_folio + 1
         WHERE id = NEW.colegio_id
         RETURNING ultimo_folio INTO siguiente;

        NEW.folio := 'CASO-' || lpad(siguiente::text, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_casos_set_folio ON casos;
CREATE TRIGGER trg_casos_set_folio
    BEFORE INSERT ON casos
    FOR EACH ROW EXECUTE FUNCTION set_folio();

-- ===================== bitacora =====================
CREATE TABLE IF NOT EXISTS bitacora (
    id                  SERIAL PRIMARY KEY,
    caso_id             INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    tipo                tipo_entrada_bitacora NOT NULL,
    fecha_ejecucion     DATE NOT NULL,
    operador_id         INTEGER NOT NULL REFERENCES usuarios(id),
    contenido           TEXT NOT NULL,
    subtipo_entrevista  VARCHAR(40),
    estado_medida       VARCHAR(60),
    motivo_cierre       VARCHAR(60),
    evaluacion_cierre    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bitacora_caso ON bitacora(caso_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON bitacora(fecha_ejecucion);

-- ===================== adjuntos =====================
CREATE TABLE IF NOT EXISTS adjuntos (
    id            SERIAL PRIMARY KEY,
    caso_id       INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    bitacora_id   INTEGER REFERENCES bitacora(id) ON DELETE CASCADE,
    nombre_orig   VARCHAR(255) NOT NULL,
    nombre_disco  VARCHAR(255) NOT NULL,
    mime          VARCHAR(120) NOT NULL,
    tamano        INTEGER NOT NULL,
    subido_por    INTEGER NOT NULL REFERENCES usuarios(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adjuntos_caso ON adjuntos(caso_id);
CREATE INDEX IF NOT EXISTS idx_adjuntos_bitacora ON adjuntos(bitacora_id);

-- ===================== auditoria =====================
CREATE TABLE IF NOT EXISTS auditoria (
    id          SERIAL PRIMARY KEY,
    usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    colegio_id  INTEGER REFERENCES colegios(id) ON DELETE SET NULL,
    accion      VARCHAR(80) NOT NULL,
    detalle     JSONB,
    ip          VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_colegio ON auditoria(colegio_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);

-- ===================== session (connect-pg-simple) =====================
CREATE TABLE IF NOT EXISTS "session" (
    "sid"    VARCHAR NOT NULL COLLATE "default",
    "sess"   JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL
);

DO $$ BEGIN
    ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- ===================== vista v_casos =====================
CREATE OR REPLACE VIEW v_casos AS
SELECT
    c.id,
    c.colegio_id,
    c.folio,
    c.estudiante,
    c.fecha_apertura,
    c.categoria,
    c.descripcion,
    c.estado,
    c.fecha_cierre,
    c.motivo_cierre,
    c.responsable_id,
    u.nombre AS responsable_nombre,
    u.rol_institucional AS responsable_rol,
    CASE
        WHEN c.estado = 'Cerrado' THEN (c.fecha_cierre - c.fecha_apertura)
        ELSE (CURRENT_DATE - c.fecha_apertura)
    END AS dias_activo,
    c.created_at,
    c.updated_at
FROM casos c
JOIN usuarios u ON u.id = c.responsable_id;
