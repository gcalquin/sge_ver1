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

DO $$ BEGIN
    CREATE TYPE especialidad_usuario AS ENUM (
        'Encargado de Convivencia Escolar',
        'Psicólogo PIE',
        'Inspector General',
        'Trabajador Social',
        'Orientador',
        'Otro'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE estado_derivacion AS ENUM ('Pendiente', 'Realizada', 'Con Respuesta', 'Cerrada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger generico para mantener updated_at.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===================== sostenedores =====================
-- Una misma entidad sostenedora puede administrar varios colegios/sedes
-- (jardín, básica, media), cada uno con su propio RBD ante MINEDUC.
CREATE TABLE IF NOT EXISTS sostenedores (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL UNIQUE,
    rut         VARCHAR(20),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_sostenedores_updated_at ON sostenedores;
CREATE TRIGGER trg_sostenedores_updated_at
    BEFORE UPDATE ON sostenedores
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===================== colegios =====================
CREATE TABLE IF NOT EXISTS colegios (
    id           SERIAL PRIMARY KEY,
    nombre       VARCHAR(150) NOT NULL UNIQUE,
    comuna       VARCHAR(100),
    direccion    VARCHAR(200),
    activo       BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_folio INTEGER NOT NULL DEFAULT 0,
    dias_alerta_critico INTEGER NOT NULL DEFAULT 10,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE colegios ADD COLUMN IF NOT EXISTS dias_alerta_critico INTEGER NOT NULL DEFAULT 10;
-- RBD: Rol Base de Datos oficial de MINEDUC, requerido para reportes SIGE / Superintendencia.
ALTER TABLE colegios ADD COLUMN IF NOT EXISTS rbd VARCHAR(20);
ALTER TABLE colegios ADD COLUMN IF NOT EXISTS sostenedor_id INTEGER REFERENCES sostenedores(id);
-- Días que se conserva un expediente Cerrado antes de quedar elegible para purga (Ley 19.628/21.719).
ALTER TABLE colegios ADD COLUMN IF NOT EXISTS dias_retencion_cerrados INTEGER NOT NULL DEFAULT 1825;
-- Logo institucional, guardado como data URI (CSP ya permite "data:" en imgSrc); opcional.
ALTER TABLE colegios ADD COLUMN IF NOT EXISTS logo_data_uri TEXT;

CREATE INDEX IF NOT EXISTS idx_colegios_sostenedor ON colegios(sostenedor_id);

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
    especialidad       especialidad_usuario,
    activo             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS especialidad especialidad_usuario;
-- Usado para notificar automáticamente (modo dry-run) al Profesor Jefe de un curso.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(150);

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

ALTER TABLE casos ADD COLUMN IF NOT EXISTS curso VARCHAR(20);
-- Programa de Integración Escolar: marca y antecedentes de Necesidades Educativas Especiales.
-- diagnostico_pie se redacta a nivel de aplicación para roles sin autorización (confidencialidad reforzada).
ALTER TABLE casos ADD COLUMN IF NOT EXISTS tiene_nee BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE casos ADD COLUMN IF NOT EXISTS diagnostico_pie TEXT;
ALTER TABLE casos ADD COLUMN IF NOT EXISTS beneficios_junaeb VARCHAR(200);

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

-- Cadena de hash (sello de integridad) para que la bitácora de casos graves pueda
-- respaldarse ante el Ministerio Público: cada entrada referencia el hash de la anterior.
ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS hash VARCHAR(64);
ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS hash_anterior VARCHAR(64);
-- Consentimiento informado para entrevistar a un menor (o aplicación del interés superior del niño sin él).
ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS consentimiento_apoderado BOOLEAN;
ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS justificacion_sin_consentimiento TEXT;
-- Ampliado para admitir "Otro: <nombre del entrevistado>" cuando no es Estudiante ni Apoderado/Tutor.
ALTER TABLE bitacora ALTER COLUMN subtipo_entrevista TYPE VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_bitacora_caso ON bitacora(caso_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON bitacora(fecha_ejecucion);

-- ===================== cursos_profesor_jefe =====================
-- Mapea cada curso del colegio a su Profesor Jefe, para notificarlo automáticamente
-- cuando se abre un caso de un estudiante de "su" curso.
CREATE TABLE IF NOT EXISTS cursos_profesor_jefe (
    id                SERIAL PRIMARY KEY,
    colegio_id        INTEGER NOT NULL REFERENCES colegios(id) ON DELETE CASCADE,
    curso             VARCHAR(20) NOT NULL,
    profesor_jefe_id  INTEGER NOT NULL REFERENCES usuarios(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (colegio_id, curso)
);

CREATE INDEX IF NOT EXISTS idx_cursos_pj_colegio ON cursos_profesor_jefe(colegio_id);

-- ===================== protocolos =====================
-- Catálogo global (no por colegio) de protocolos de actuación con sus pasos
-- obligatorios y plazos, según la normativa de convivencia escolar vigente en Chile.
CREATE TABLE IF NOT EXISTS protocolos (
    id          SERIAL PRIMARY KEY,
    categoria   categoria_caso NOT NULL UNIQUE,
    nombre      VARCHAR(150) NOT NULL,
    normativa   VARCHAR(300) NOT NULL,
    pasos       JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================== caso_pasos_protocolo =====================
-- Snapshot de los pasos del protocolo aplicados a un caso concreto, con su
-- propio plazo y estado de avance (alimenta el calendario de vencimientos).
CREATE TABLE IF NOT EXISTS caso_pasos_protocolo (
    id                SERIAL PRIMARY KEY,
    caso_id           INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    orden             INTEGER NOT NULL,
    descripcion       TEXT NOT NULL,
    plazo_dias        INTEGER,
    fecha_limite      DATE,
    completado        BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_completado  DATE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pasos_protocolo_caso ON caso_pasos_protocolo(caso_id);

-- ===================== derivaciones =====================
-- Derivaciones externas (OPD, Mejor Niñez, COSAM, hospital) y denuncias obligatorias
-- (Carabineros, PDI, Fiscalía, Tribunal de Familia) asociadas a un caso.
CREATE TABLE IF NOT EXISTS derivaciones (
    id                  SERIAL PRIMARY KEY,
    caso_id             INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    institucion         VARCHAR(60) NOT NULL,
    tipo                VARCHAR(40) NOT NULL,
    fecha_derivacion    DATE NOT NULL,
    folio_externo       VARCHAR(60),
    estado              estado_derivacion NOT NULL DEFAULT 'Pendiente',
    notas               TEXT,
    registrado_por_id   INTEGER NOT NULL REFERENCES usuarios(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_derivaciones_caso ON derivaciones(caso_id);

DROP TRIGGER IF EXISTS trg_derivaciones_updated_at ON derivaciones;
CREATE TRIGGER trg_derivaciones_updated_at
    BEFORE UPDATE ON derivaciones
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===================== firmas =====================
-- Firma electrónica simple (Ley 19.799) de recepción de citaciones o acuerdos reparatorios.
CREATE TABLE IF NOT EXISTS firmas (
    id               SERIAL PRIMARY KEY,
    caso_id          INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
    bitacora_id      INTEGER REFERENCES bitacora(id) ON DELETE CASCADE,
    tipo_documento   VARCHAR(60) NOT NULL,
    nombre_firmante  VARCHAR(150) NOT NULL,
    rut_firmante     VARCHAR(20) NOT NULL,
    fecha_firma      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_origen        VARCHAR(64),
    hash_documento   VARCHAR(64),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firmas_caso ON firmas(caso_id);

-- ===================== metas_pme =====================
-- Metas del Plan de Mejoramiento Educativo del colegio, para cruzar con los
-- indicadores de convivencia calculados por el sistema.
CREATE TABLE IF NOT EXISTS metas_pme (
    id           SERIAL PRIMARY KEY,
    colegio_id   INTEGER NOT NULL REFERENCES colegios(id) ON DELETE CASCADE,
    indicador    VARCHAR(150) NOT NULL,
    meta_valor   NUMERIC(6,2) NOT NULL,
    descripcion  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metas_pme_colegio ON metas_pme(colegio_id);

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
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
        ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
    END IF;
END $$;

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
    c.updated_at,
    c.curso,
    c.tiene_nee,
    c.diagnostico_pie,
    c.beneficios_junaeb
FROM casos c
JOIN usuarios u ON u.id = c.responsable_id;

-- ===================== catálogo de protocolos de actuación =====================
-- Referencia global (no por colegio), alineada a la normativa chilena vigente.
INSERT INTO protocolos (categoria, nombre, normativa, pasos) VALUES
('Convivencia Escolar', 'Protocolo de Convivencia Escolar',
 'Ley 20.536 sobre Violencia Escolar; Circular de Convivencia Escolar de la Superintendencia de Educación',
 '[
   {"orden":1,"descripcion":"Recepción y registro formal del relato de la situación.","plazoDias":1},
   {"orden":2,"descripcion":"Resguardo inmediato de los estudiantes involucrados (separación si corresponde).","plazoDias":1},
   {"orden":3,"descripcion":"Investigación y recopilación de antecedentes con las partes.","plazoDias":5},
   {"orden":4,"descripcion":"Aplicación de medidas formativas o disciplinarias según el Reglamento Interno.","plazoDias":10},
   {"orden":5,"descripcion":"Comunicación a los apoderados y cierre con seguimiento posterior.","plazoDias":15}
 ]'::jsonb),
('Académico / Rendimiento', 'Protocolo de Apoyo Académico',
 'Decreto 67/2018 de Evaluación, Calificación y Promoción; Ley 20.845 de Inclusión Escolar',
 '[
   {"orden":1,"descripcion":"Diagnóstico de la situación académica con el equipo docente.","plazoDias":3},
   {"orden":2,"descripcion":"Entrevista con el apoderado para informar la situación.","plazoDias":5},
   {"orden":3,"descripcion":"Elaboración de un plan de apoyo pedagógico individual.","plazoDias":10},
   {"orden":4,"descripcion":"Seguimiento periódico del avance del plan de apoyo.","plazoDias":30},
   {"orden":5,"descripcion":"Evaluación de resultados y cierre o renovación del plan.","plazoDias":60}
 ]'::jsonb),
('Asistencia / Deserción', 'Protocolo de Retención Escolar',
 'Ley 20.370 General de Educación; Circular de Asistencia y Retención Escolar MINEDUC; Ley de Subvención Escolar Preferencial',
 '[
   {"orden":1,"descripcion":"Alerta y registro formal de inasistencias reiteradas.","plazoDias":1},
   {"orden":2,"descripcion":"Contacto telefónico o presencial con el apoderado.","plazoDias":3},
   {"orden":3,"descripcion":"Visita domiciliaria o derivación a la red municipal/JUNAEB si no hay respuesta.","plazoDias":10},
   {"orden":4,"descripcion":"Elaboración de un plan de reinserción y permanencia escolar.","plazoDias":15},
   {"orden":5,"descripcion":"Seguimiento mensual de asistencia hasta normalizar la situación.","plazoDias":30}
 ]'::jsonb),
('Salud Mental / Emocional', 'Protocolo de Salud Mental y Bienestar',
 'Programa Habilidades para la Vida (JUNAEB); Circular de Gestión de la Convivencia Escolar en Salud Mental, MINEDUC',
 '[
   {"orden":1,"descripcion":"Contención emocional inicial del estudiante.","plazoDias":1},
   {"orden":2,"descripcion":"Evaluación preliminar de riesgo (autolesión, ideación suicida, crisis).","plazoDias":2},
   {"orden":3,"descripcion":"Derivación a especialista (psicólogo escolar, COSAM, red de salud).","plazoDias":5},
   {"orden":4,"descripcion":"Coordinación con la familia y consentimiento para el acompañamiento.","plazoDias":7},
   {"orden":5,"descripcion":"Seguimiento periódico del proceso terapéutico y reintegración.","plazoDias":30}
 ]'::jsonb),
('Vulneración de Derechos', 'Protocolo de Resguardo y Denuncia Obligatoria',
 'Ley 21.430 de Garantías y Protección Integral de los Derechos de la Niñez; Art. 175 letra e) del Código Procesal Penal (denuncia obligatoria); Ley 21.128 Aula Segura',
 '[
   {"orden":1,"descripcion":"Resguardo inmediato del estudiante y activación de medidas de protección.","plazoDias":1},
   {"orden":2,"descripcion":"Denuncia obligatoria a Carabineros, PDI o Fiscalía (plazo legal de 24 horas).","plazoDias":1},
   {"orden":3,"descripcion":"Derivación a OPD, Mejor Niñez (ex-SENAME) u otra red de protección.","plazoDias":3},
   {"orden":4,"descripcion":"Comunicación a la familia o adulto responsable no involucrado en la vulneración.","plazoDias":3},
   {"orden":5,"descripcion":"Seguimiento del proceso y cierre con informe a la dirección.","plazoDias":30}
 ]'::jsonb)
ON CONFLICT (categoria) DO NOTHING;
