require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

async function upsertColegio(client, { nombre, comuna, direccion }) {
    const { rows } = await client.query(
        `INSERT INTO colegios (nombre, comuna, direccion)
         VALUES ($1, $2, $3)
         ON CONFLICT (nombre) DO UPDATE SET comuna = EXCLUDED.comuna
         RETURNING id`,
        [nombre, comuna, direccion]
    );
    return rows[0].id;
}

async function upsertSuperAdmin(client, { username, nombre, clave }) {
    const hash = await bcrypt.hash(clave, 10);
    await client.query(
        `INSERT INTO usuarios (colegio_id, username, nombre, rol_institucional, password_hash, rol)
         VALUES (NULL, $1, $2, 'Super Administrador Global', $3, 'superadmin')
         ON CONFLICT (lower(username)) WHERE colegio_id IS NULL DO NOTHING`,
        [username, nombre, hash]
    );
}

async function upsertUsuarioColegio(client, colegioId, { username, nombre, rolInstitucional, clave, rol }) {
    const hash = await bcrypt.hash(clave, 10);
    const { rows } = await client.query(
        `INSERT INTO usuarios (colegio_id, username, nombre, rol_institucional, password_hash, rol)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (colegio_id, lower(username)) WHERE colegio_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [colegioId, username, nombre, rolInstitucional, hash, rol]
    );
    if (rows[0]) return rows[0].id;
    const existente = await client.query(
        "SELECT id FROM usuarios WHERE colegio_id = $1 AND lower(username) = lower($2)",
        [colegioId, username]
    );
    return existente.rows[0].id;
}

async function sembrarCasosGabrielaMistral(client, colegioId, anaId, carlosId) {
    const { rows: existentes } = await client.query("SELECT 1 FROM casos WHERE colegio_id = $1", [colegioId]);
    if (existentes.length > 0) return;

    const { rows: caso1 } = await client.query(
        `INSERT INTO casos (colegio_id, estudiante, categoria, descripcion, estado, fecha_apertura, responsable_id)
         VALUES ($1, 'Joaquín Maino Palma', 'Convivencia Escolar',
                 'Discusión verbal recurrente en el patio con compañeros de curso durante el periodo de colación. Afecta el clima de convivencia del aula.',
                 'En seguimiento', '2026-05-10', $2)
         RETURNING id`,
        [colegioId, anaId]
    );
    const { rows: caso2 } = await client.query(
        `INSERT INTO casos (colegio_id, estudiante, categoria, descripcion, estado, fecha_apertura, responsable_id)
         VALUES ($1, 'Francisca Silva Fuentes', 'Académico / Rendimiento',
                 'Baja abrupta de calificaciones en el último trimestre escolar. Se evidencia desmotivación severa.',
                 'Abierto', '2026-06-01', $2)
         RETURNING id`,
        [colegioId, carlosId]
    );

    await client.query(
        `INSERT INTO bitacora (caso_id, tipo, fecha_ejecucion, operador_id, contenido, estado_medida) VALUES
         ($1, 'Apertura', '2026-05-10', $2, 'Apertura formal de folio.', NULL),
         ($1, 'Medida',   '2026-05-12', $2, 'Firma de compromiso de mediación estudiantil de sana convivencia.', 'Compromiso de Mediación'),
         ($3, 'Apertura', '2026-06-01', $4, 'Apertura del expediente por alerta del sistema académico de notas.', NULL)`,
        [caso1[0].id, anaId, caso2[0].id, carlosId]
    );
}

async function sembrarCasoSanIgnacio(client, colegioId, pedroId) {
    const { rows: existentes } = await client.query("SELECT 1 FROM casos WHERE colegio_id = $1", [colegioId]);
    if (existentes.length > 0) return;

    const { rows: caso } = await client.query(
        `INSERT INTO casos (colegio_id, estudiante, categoria, descripcion, estado, fecha_apertura, responsable_id)
         VALUES ($1, 'Tomás Bravo Lagos', 'Asistencia / Deserción',
                 'Inasistencias reiteradas sin justificativo durante el último mes. Riesgo de desvinculación escolar.',
                 'Abierto', '2026-06-10', $2)
         RETURNING id`,
        [colegioId, pedroId]
    );

    await client.query(
        `INSERT INTO bitacora (caso_id, tipo, fecha_ejecucion, operador_id, contenido)
         VALUES ($1, 'Apertura', '2026-06-10', $2, 'Apertura de expediente por alerta de asistencia.')`,
        [caso[0].id, pedroId]
    );
}

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await upsertSuperAdmin(client, { username: "superadmin", nombre: "Super Administrador Global", clave: "super123" });

        const gabrielaMistralId = await upsertColegio(client, {
            nombre: "Colegio Gabriela Mistral",
            comuna: "Santiago",
            direccion: null,
        });
        await upsertUsuarioColegio(client, gabrielaMistralId, {
            username: "admin",
            nombre: "Administrador General",
            rolInstitucional: "Administrador del Colegio",
            clave: "admin123",
            rol: "admin",
        });
        await upsertUsuarioColegio(client, gabrielaMistralId, {
            username: "invitado",
            nombre: "Usuario Invitado",
            rolInstitucional: "Visualizador Solo Lectura",
            clave: "invitado123",
            rol: "invitado",
        });
        const anaId = await upsertUsuarioColegio(client, gabrielaMistralId, {
            username: "ana.martinez",
            nombre: "Ana Martínez",
            rolInstitucional: "Orientadora Principal",
            clave: "123",
            rol: "funcionario",
        });
        const carlosId = await upsertUsuarioColegio(client, gabrielaMistralId, {
            username: "carlos.retamal",
            nombre: "Carlos Retamal",
            rolInstitucional: "Psicólogo Escolar",
            clave: "123",
            rol: "funcionario",
        });
        await upsertUsuarioColegio(client, gabrielaMistralId, {
            username: "maria.ossa",
            nombre: "María José Ossa",
            rolInstitucional: "Directora de Convivencia",
            clave: "123",
            rol: "funcionario",
        });
        await sembrarCasosGabrielaMistral(client, gabrielaMistralId, anaId, carlosId);

        const sanIgnacioId = await upsertColegio(client, {
            nombre: "Colegio San Ignacio",
            comuna: "Providencia",
            direccion: null,
        });
        await upsertUsuarioColegio(client, sanIgnacioId, {
            username: "admin",
            nombre: "Administrador General",
            rolInstitucional: "Administrador del Colegio",
            clave: "admin123",
            rol: "admin",
        });
        await upsertUsuarioColegio(client, sanIgnacioId, {
            username: "invitado",
            nombre: "Usuario Invitado",
            rolInstitucional: "Visualizador Solo Lectura",
            clave: "invitado123",
            rol: "invitado",
        });
        const pedroId = await upsertUsuarioColegio(client, sanIgnacioId, {
            username: "pedro.soto",
            nombre: "Pedro Soto",
            rolInstitucional: "Inspector General",
            clave: "123",
            rol: "funcionario",
        });
        await upsertUsuarioColegio(client, sanIgnacioId, {
            username: "lucia.vera",
            nombre: "Lucía Vera",
            rolInstitucional: "Trabajadora Social",
            clave: "123",
            rol: "funcionario",
        });
        await sembrarCasoSanIgnacio(client, sanIgnacioId, pedroId);

        await client.query("COMMIT");
        console.log("Seed aplicado correctamente.");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error("Error aplicando el seed:", err);
    process.exit(1);
});
