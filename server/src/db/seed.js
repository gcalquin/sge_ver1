require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

async function upsertSostenedor(client, { nombre, rut }) {
    const { rows } = await client.query(
        `INSERT INTO sostenedores (nombre, rut)
         VALUES ($1, $2)
         ON CONFLICT (nombre) DO UPDATE SET rut = EXCLUDED.rut
         RETURNING id`,
        [nombre, rut]
    );
    return rows[0].id;
}

async function upsertColegio(client, { nombre, comuna, direccion, rbd, sostenedorId }) {
    const { rows } = await client.query(
        `INSERT INTO colegios (nombre, comuna, direccion, rbd, sostenedor_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (nombre) DO UPDATE SET comuna = EXCLUDED.comuna, rbd = EXCLUDED.rbd, sostenedor_id = EXCLUDED.sostenedor_id
         RETURNING id`,
        [nombre, comuna, direccion, rbd, sostenedorId]
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

async function upsertUsuarioColegio(client, colegioId, { username, nombre, rolInstitucional, clave, rol, especialidad, email }) {
    const hash = await bcrypt.hash(clave, 10);
    const { rows } = await client.query(
        `INSERT INTO usuarios (colegio_id, username, nombre, rol_institucional, password_hash, rol, especialidad, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (colegio_id, lower(username)) WHERE colegio_id IS NOT NULL
         DO UPDATE SET especialidad = EXCLUDED.especialidad, email = EXCLUDED.email
         RETURNING id`,
        [colegioId, username, nombre, rolInstitucional, hash, rol, especialidad || null, email || null]
    );
    if (rows[0]) return rows[0].id;
    const existente = await client.query(
        "SELECT id FROM usuarios WHERE colegio_id = $1 AND lower(username) = lower($2)",
        [colegioId, username]
    );
    return existente.rows[0].id;
}

async function upsertCursoProfesorJefe(client, colegioId, curso, profesorJefeId) {
    await client.query(
        `INSERT INTO cursos_profesor_jefe (colegio_id, curso, profesor_jefe_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (colegio_id, curso) DO UPDATE SET profesor_jefe_id = EXCLUDED.profesor_jefe_id`,
        [colegioId, curso, profesorJefeId]
    );
}

async function upsertMetaPme(client, colegioId, { indicador, metaValor, descripcion }) {
    const { rows: existentes } = await client.query("SELECT id FROM metas_pme WHERE colegio_id = $1 AND indicador = $2", [
        colegioId,
        indicador,
    ]);
    if (existentes.length > 0) return;
    await client.query(
        `INSERT INTO metas_pme (colegio_id, indicador, meta_valor, descripcion) VALUES ($1, $2, $3, $4)`,
        [colegioId, indicador, metaValor, descripcion]
    );
}

async function sembrarDerivacion(client, casoId, { institucion, tipo, fechaDerivacion, estado, notas, registradoPorId }) {
    const { rows: existentes } = await client.query("SELECT id FROM derivaciones WHERE caso_id = $1 AND tipo = $2", [
        casoId,
        tipo,
    ]);
    if (existentes.length > 0) return;
    await client.query(
        `INSERT INTO derivaciones (caso_id, institucion, tipo, fecha_derivacion, estado, notas, registrado_por_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [casoId, institucion, tipo, fechaDerivacion, estado, notas, registradoPorId]
    );
}

async function sembrarPasosProtocolo(client, casoId, categoria, fechaApertura) {
    const { rows: existentes } = await client.query("SELECT 1 FROM caso_pasos_protocolo WHERE caso_id = $1", [casoId]);
    if (existentes.length > 0) return;

    const { rows: protocoloRows } = await client.query("SELECT pasos FROM protocolos WHERE categoria = $1", [categoria]);
    const pasos = protocoloRows[0]?.pasos || [];
    for (const paso of pasos) {
        const fechaLimite = new Date(`${fechaApertura}T00:00:00`);
        fechaLimite.setDate(fechaLimite.getDate() + (paso.plazoDias || 0));
        await client.query(
            `INSERT INTO caso_pasos_protocolo (caso_id, orden, descripcion, plazo_dias, fecha_limite)
             VALUES ($1, $2, $3, $4, $5)`,
            [casoId, paso.orden, paso.descripcion, paso.plazoDias || null, fechaLimite.toISOString().slice(0, 10)]
        );
    }
}

async function sembrarCaso(client, { colegioId, estudiante, categoria, descripcion, estado, fechaApertura, responsableId, curso, tieneNee, diagnosticoPie, beneficiosJunaeb, bitacora }) {
    const { rows: existentes } = await client.query("SELECT id FROM casos WHERE colegio_id = $1 AND estudiante = $2", [
        colegioId,
        estudiante,
    ]);
    if (existentes.length > 0) {
        await client.query(
            `UPDATE casos SET curso = $1, tiene_nee = $2, diagnostico_pie = $3, beneficios_junaeb = $4 WHERE id = $5`,
            [curso || null, Boolean(tieneNee), diagnosticoPie || null, beneficiosJunaeb || null, existentes[0].id]
        );
        await sembrarPasosProtocolo(client, existentes[0].id, categoria, fechaApertura);
        return existentes[0].id;
    }

    const { rows: caso } = await client.query(
        `INSERT INTO casos (colegio_id, estudiante, categoria, descripcion, estado, fecha_apertura, responsable_id,
                             curso, tiene_nee, diagnostico_pie, beneficios_junaeb)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [colegioId, estudiante, categoria, descripcion, estado, fechaApertura, responsableId, curso || null, Boolean(tieneNee), diagnosticoPie || null, beneficiosJunaeb || null]
    );
    const casoId = caso[0].id;

    for (const entrada of bitacora) {
        await client.query(
            `INSERT INTO bitacora (caso_id, tipo, fecha_ejecucion, operador_id, contenido, estado_medida)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [casoId, entrada.tipo, entrada.fecha, entrada.operadorId, entrada.contenido, entrada.estadoMedida || null]
        );
    }

    await sembrarPasosProtocolo(client, casoId, categoria, fechaApertura);

    return casoId;
}

async function sembrarCasosGabrielaMistral(client, colegioId, { anaId, carlosId, mariaId }) {
    const joaquinId = await sembrarCaso(client, {
        colegioId,
        estudiante: "Joaquín Maino Palma",
        categoria: "Convivencia Escolar",
        descripcion:
            "Discusión verbal recurrente en el patio con compañeros de curso durante el periodo de colación. Afecta el clima de convivencia del aula.",
        estado: "En seguimiento",
        fechaApertura: "2026-05-10",
        responsableId: anaId,
        curso: "5ºA",
        bitacora: [
            { tipo: "Apertura", fecha: "2026-05-10", operadorId: anaId, contenido: "Apertura formal de folio." },
            {
                tipo: "Medida",
                fecha: "2026-05-12",
                operadorId: anaId,
                contenido: "Firma de compromiso de mediación estudiantil de sana convivencia.",
                estadoMedida: "Compromiso de Mediación",
            },
        ],
    });

    await sembrarCaso(client, {
        colegioId,
        estudiante: "Francisca Silva Fuentes",
        categoria: "Académico / Rendimiento",
        descripcion: "Baja abrupta de calificaciones en el último trimestre escolar. Se evidencia desmotivación severa.",
        estado: "Abierto",
        fechaApertura: "2026-06-01",
        responsableId: carlosId,
        curso: "8ºB",
        bitacora: [
            {
                tipo: "Apertura",
                fecha: "2026-06-01",
                operadorId: carlosId,
                contenido: "Apertura del expediente por alerta del sistema académico de notas.",
            },
        ],
    });

    await sembrarCaso(client, {
        colegioId,
        estudiante: "Cristóbal Vega Henríquez",
        categoria: "Asistencia / Deserción",
        descripcion: "Inasistencias reiteradas durante el mes, sin justificativo formal de apoderado. Riesgo de desvinculación.",
        estado: "En seguimiento",
        fechaApertura: "2026-06-14",
        responsableId: anaId,
        curso: "6ºC",
        tieneNee: true,
        diagnosticoPie:
            "Diagnóstico de Trastorno por Déficit Atencional con Hiperactividad (TDAH), con PACI vigente. Requiere apoyo de aula de recursos 3 horas semanales (información confidencial PIE).",
        bitacora: [
            { tipo: "Apertura", fecha: "2026-06-14", operadorId: anaId, contenido: "Apertura de expediente por alerta de asistencia." },
            {
                tipo: "Seguimiento",
                fecha: "2026-06-16",
                operadorId: anaId,
                contenido: "Se contacta telefónicamente al apoderado, quien se compromete a regularizar la asistencia.",
            },
        ],
    });

    const matiasId = await sembrarCaso(client, {
        colegioId,
        estudiante: "Matías Contreras Vidal",
        categoria: "Salud Mental / Emocional",
        descripcion:
            "Estudiante manifiesta episodios de ansiedad y aislamiento social tras situación familiar compleja. Se deriva a acompañamiento psicosocial.",
        estado: "En seguimiento",
        fechaApertura: "2026-06-18",
        responsableId: mariaId,
        curso: "7ºA",
        bitacora: [
            { tipo: "Apertura", fecha: "2026-06-18", operadorId: mariaId, contenido: "Apertura de expediente por derivación de profesor jefe." },
            {
                tipo: "Entrevista",
                fecha: "2026-06-20",
                operadorId: mariaId,
                contenido: "Primera entrevista de contención con el estudiante. Se activa seguimiento psicosocial.",
            },
        ],
    });

    await sembrarCaso(client, {
        colegioId,
        estudiante: "Valentina Soto Muñoz",
        categoria: "Vulneración de Derechos",
        descripcion:
            "Se recibe antecedente de posible negligencia en el cuidado parental, derivado por inspectoría. Se activa protocolo de resguardo.",
        estado: "Abierto",
        fechaApertura: "2026-06-22",
        responsableId: carlosId,
        curso: "8ºB",
        bitacora: [
            { tipo: "Apertura", fecha: "2026-06-22", operadorId: carlosId, contenido: "Apertura de expediente y activación de protocolo de resguardo." },
        ],
    });

    await upsertCursoProfesorJefe(client, colegioId, "5ºA", anaId);
    await upsertCursoProfesorJefe(client, colegioId, "8ºB", mariaId);
    await upsertCursoProfesorJefe(client, colegioId, "6ºC", carlosId);
    await upsertCursoProfesorJefe(client, colegioId, "7ºA", anaId);

    await sembrarDerivacion(client, matiasId, {
        institucion: "COSAM",
        tipo: "Derivación de Apoyo",
        fechaDerivacion: "2026-06-21",
        estado: "Pendiente",
        notas: "Se solicita hora de evaluación psicológica externa para complementar el acompañamiento interno.",
        registradoPorId: mariaId,
    });

    await upsertMetaPme(client, colegioId, {
        indicador: "Tasa de éxito de medidas aplicadas (%)",
        metaValor: 80,
        descripcion: "Meta PME 2026: mantener sobre 80% de efectividad en las medidas de convivencia escolar aplicadas.",
    });
    await upsertMetaPme(client, colegioId, {
        indicador: "Casos cerrados (%)",
        metaValor: 60,
        descripcion: "Meta PME 2026: cerrar al menos 60% de los casos abiertos dentro del semestre.",
    });
}

async function sembrarCasosSanIgnacio(client, colegioId, { pedroId, luciaId }) {
    await sembrarCaso(client, {
        colegioId,
        estudiante: "Tomás Bravo Lagos",
        categoria: "Asistencia / Deserción",
        descripcion: "Inasistencias reiteradas sin justificativo durante el último mes. Riesgo de desvinculación escolar.",
        estado: "Abierto",
        fechaApertura: "2026-06-10",
        responsableId: pedroId,
        curso: "4ºB",
        beneficiosJunaeb: "Beca BARE, Programa de Alimentación Escolar (PAE)",
        bitacora: [
            { tipo: "Apertura", fecha: "2026-06-10", operadorId: pedroId, contenido: "Apertura de expediente por alerta de asistencia." },
        ],
    });

    await sembrarCaso(client, {
        colegioId,
        estudiante: "Benjamín Rojas Paredes",
        categoria: "Convivencia Escolar",
        descripcion: "Conflictos reiterados con compañeros de curso, con denuncias cruzadas de agresión verbal.",
        estado: "En seguimiento",
        fechaApertura: "2026-06-05",
        responsableId: luciaId,
        curso: "6ºA",
        bitacora: [
            { tipo: "Apertura", fecha: "2026-06-05", operadorId: luciaId, contenido: "Apertura de expediente por denuncia de inspectoría." },
            {
                tipo: "Seguimiento",
                fecha: "2026-06-08",
                operadorId: luciaId,
                contenido: "Se realiza mediación entre las partes involucradas y se acuerdan compromisos de convivencia.",
            },
        ],
    });

    await sembrarCaso(client, {
        colegioId,
        estudiante: "Camila Fuentes Díaz",
        categoria: "Académico / Rendimiento",
        descripcion: "Descenso sostenido en el rendimiento académico durante el semestre, con riesgo de repitencia.",
        estado: "Abierto",
        fechaApertura: "2026-06-23",
        responsableId: pedroId,
        curso: "7ºB",
        bitacora: [
            { tipo: "Apertura", fecha: "2026-06-23", operadorId: pedroId, contenido: "Apertura de expediente por alerta del departamento académico." },
        ],
    });

    const ignacioId = await sembrarCaso(client, {
        colegioId,
        estudiante: "Ignacio Pizarro Reyes",
        categoria: "Salud Mental / Emocional",
        descripcion: "Estudiante presenta señales de angustia y bajo ánimo sostenido, reportadas por su profesora jefe.",
        estado: "En seguimiento",
        fechaApertura: "2026-06-12",
        responsableId: luciaId,
        curso: "8ºA",
        bitacora: [
            { tipo: "Apertura", fecha: "2026-06-12", operadorId: luciaId, contenido: "Apertura de expediente por derivación de profesora jefe." },
            {
                tipo: "Entrevista",
                fecha: "2026-06-14",
                operadorId: luciaId,
                contenido: "Entrevista de contención inicial. Se coordina acompañamiento con trabajadora social.",
            },
        ],
    });

    await sembrarCaso(client, {
        colegioId,
        estudiante: "Antonia Herrera Campos",
        categoria: "Vulneración de Derechos",
        descripcion: "Se recibe antecedente de posible vulneración en el entorno familiar, reportado por apoderado de un compañero.",
        estado: "Abierto",
        fechaApertura: "2026-06-24",
        responsableId: pedroId,
        curso: "6ºA",
        bitacora: [
            { tipo: "Apertura", fecha: "2026-06-24", operadorId: pedroId, contenido: "Apertura de expediente y activación de protocolo de resguardo." },
        ],
    });

    await upsertCursoProfesorJefe(client, colegioId, "4ºB", pedroId);
    await upsertCursoProfesorJefe(client, colegioId, "6ºA", luciaId);
    await upsertCursoProfesorJefe(client, colegioId, "7ºB", pedroId);
    await upsertCursoProfesorJefe(client, colegioId, "8ºA", luciaId);

    await sembrarDerivacion(client, ignacioId, {
        institucion: "Hospital / Centro de Salud",
        tipo: "Derivación de Apoyo",
        fechaDerivacion: "2026-06-15",
        estado: "Con Respuesta",
        notas: "Centro de salud confirma hora de evaluación con psiquiatría infanto-juvenil para el próximo mes.",
        registradoPorId: luciaId,
    });

    await upsertMetaPme(client, colegioId, {
        indicador: "Tasa de éxito de medidas aplicadas (%)",
        metaValor: 75,
        descripcion: "Meta PME 2026: mantener sobre 75% de efectividad en las medidas de convivencia escolar aplicadas.",
    });
    await upsertMetaPme(client, colegioId, {
        indicador: "Casos cerrados (%)",
        metaValor: 50,
        descripcion: "Meta PME 2026: cerrar al menos 50% de los casos abiertos dentro del semestre.",
    });
}

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await upsertSuperAdmin(client, { username: "superadmin", nombre: "Super Administrador Global", clave: "super123" });

        const sostenedorId = await upsertSostenedor(client, {
            nombre: "Fundación Educacional Ejemplo",
            rut: "65.123.456-7",
        });

        const gabrielaMistralId = await upsertColegio(client, {
            nombre: "Colegio Gabriela Mistral",
            comuna: "Santiago",
            direccion: null,
            rbd: "10234",
            sostenedorId,
        });
        await upsertUsuarioColegio(client, gabrielaMistralId, {
            username: "admin",
            nombre: "Administrador General",
            rolInstitucional: "Administrador del Colegio",
            clave: "admin123",
            rol: "admin",
            email: "admin@gabrielamistral.cl",
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
            especialidad: "Orientador",
            email: "ana.martinez@gabrielamistral.cl",
        });
        const carlosId = await upsertUsuarioColegio(client, gabrielaMistralId, {
            username: "carlos.retamal",
            nombre: "Carlos Retamal",
            rolInstitucional: "Psicólogo Escolar",
            clave: "123",
            rol: "funcionario",
            especialidad: "Psicólogo PIE",
            email: "carlos.retamal@gabrielamistral.cl",
        });
        const mariaId = await upsertUsuarioColegio(client, gabrielaMistralId, {
            username: "maria.ossa",
            nombre: "María José Ossa",
            rolInstitucional: "Directora de Convivencia",
            clave: "123",
            rol: "funcionario",
            especialidad: "Encargado de Convivencia Escolar",
            email: "maria.ossa@gabrielamistral.cl",
        });
        await sembrarCasosGabrielaMistral(client, gabrielaMistralId, { anaId, carlosId, mariaId });

        const sanIgnacioId = await upsertColegio(client, {
            nombre: "Colegio San Ignacio",
            comuna: "Providencia",
            direccion: null,
            rbd: "10567",
            sostenedorId,
        });
        await upsertUsuarioColegio(client, sanIgnacioId, {
            username: "admin",
            nombre: "Administrador General",
            rolInstitucional: "Administrador del Colegio",
            clave: "admin123",
            rol: "admin",
            email: "admin@sanignacio.cl",
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
            especialidad: "Inspector General",
            email: "pedro.soto@sanignacio.cl",
        });
        const luciaId = await upsertUsuarioColegio(client, sanIgnacioId, {
            username: "lucia.vera",
            nombre: "Lucía Vera",
            rolInstitucional: "Trabajadora Social",
            clave: "123",
            rol: "funcionario",
            especialidad: "Trabajador Social",
            email: "lucia.vera@sanignacio.cl",
        });
        await sembrarCasosSanIgnacio(client, sanIgnacioId, { pedroId, luciaId });

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
