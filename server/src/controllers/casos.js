const PDFDocument = require("pdfkit");
const archiver = require("archiver");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { calcularHash } = require("../utils/hash");
const { enviarCorreo } = require("../config/mailer");
const { obtenerMediacionesDeCaso } = require("./mediaciones");
const { listarProximasAVencer } = require("./capacitaciones");
const { obtenerPasosProtocoloEfectivo } = require("./convivencia");

const TIPO_BITACORA = { entrevista: "Entrevista", seguimiento: "Seguimiento", medida: "Medida" };

// Construye un fragmento SQL que convierte un parámetro de búsqueda libre (que
// puede tener varias palabras, ej. un nombre completo) en un tsquery válido con
// coincidencia por prefijo en cada palabra ("ana maria" -> "ana:* & maria:*").
// to_tsquery() no acepta texto plano con espacios, por eso no se le puede pasar
// el parámetro tal cual + ':*' cuando tiene más de una palabra.
function tsQueryBusqueda(param) {
    return `regexp_replace(trim(inmutable_unaccent(${param})), '\\s+', ':* & ', 'g') || ':*'`;
}

function aCsv(filas, columnas) {
    const escapar = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const encabezado = columnas.join(",");
    const cuerpo = filas.map((fila) => columnas.map((c) => escapar(fila[c])).join(",")).join("\n");
    return `${encabezado}\n${cuerpo}`;
}

async function getCasoDetalle(colegioId, id, usuario) {
    const { rows: casoRows } = await pool.query(`SELECT * FROM v_casos WHERE colegio_id = $1 AND id = $2`, [colegioId, id]);
    const caso = casoRows[0];
    if (!caso) return null;

    const { rows: bitacora } = await pool.query(
        `SELECT b.id, b.tipo, b.fecha_ejecucion AS fecha, b.contenido,
                b.subtipo_entrevista AS subtipo, b.estado_medida AS "estadoMedida",
                b.motivo_cierre AS motivo, b.evaluacion_cierre AS evaluacion,
                b.consentimiento_apoderado AS "consentimientoApoderado",
                b.justificacion_sin_consentimiento AS "justificacionSinConsentimiento",
                b.hash,
                op.nombre AS operador,
                (SELECT count(*) FROM adjuntos a WHERE a.bitacora_id = b.id) AS adjuntos
         FROM bitacora b
         JOIN usuarios op ON op.id = b.operador_id
         WHERE b.caso_id = $1
         ORDER BY b.id`,
        [id]
    );

    const { rows: pasosProtocolo } = await pool.query(
        `SELECT id, orden, descripcion, plazo_dias AS "plazoDias", fecha_limite AS "fechaLimite",
                completado, fecha_completado AS "fechaCompletado"
         FROM caso_pasos_protocolo WHERE caso_id = $1 ORDER BY orden`,
        [id]
    );

    const { rows: derivaciones } = await pool.query(
        `SELECT d.id, d.institucion, d.tipo, d.fecha_derivacion AS "fechaDerivacion", d.folio_externo AS "folioExterno",
                d.estado, d.notas, (SELECT count(*) FROM adjuntos ad WHERE ad.derivacion_id = d.id) AS adjuntos
         FROM derivaciones d WHERE d.caso_id = $1 ORDER BY d.id DESC`,
        [id]
    );

    const mediaciones = await obtenerMediacionesDeCaso(id);

    const { rows: estudiantesAdicionales } = await pool.query(
        "SELECT id, nombre FROM caso_estudiantes_adicionales WHERE caso_id = $1 ORDER BY id",
        [id]
    );

    const { rows: colegioRows } = await pool.query("SELECT nombre, rbd FROM colegios WHERE id = $1", [colegioId]);
    const { rows: overrideRows } = await pool.query(
        "SELECT nombre, normativa FROM protocolos_colegio WHERE colegio_id = $1 AND categoria = $2",
        [colegioId, caso.categoria]
    );
    const { rows: protocoloRows } = overrideRows[0]
        ? { rows: overrideRows }
        : await pool.query("SELECT nombre, normativa FROM protocolos WHERE categoria = $1", [caso.categoria]);

    const puedeVerPie =
        usuario && (usuario.rol === "admin" || usuario.rol === "superadmin" || usuario.especialidad === "Psicólogo PIE");
    const denunciaObligatoriaPendiente =
        caso.categoria === "Vulneración de Derechos" && !derivaciones.some((d) => d.tipo === "Denuncia Obligatoria");

    return {
        id: caso.id,
        folio: caso.folio,
        estudiante: caso.estudiante,
        estudiantesAdicionales,
        categoria: caso.categoria,
        descripcion: caso.descripcion,
        estado: caso.estado,
        fechaApertura: caso.fecha_apertura,
        fechaCierre: caso.fecha_cierre,
        motivoCierre: caso.motivo_cierre,
        diasActivo: caso.dias_activo,
        responsablePrincipal: caso.responsable_nombre,
        responsableId: caso.responsable_id,
        curso: caso.curso,
        tieneNee: caso.tiene_nee,
        diagnosticoPie: !caso.diagnostico_pie ? null : puedeVerPie ? caso.diagnostico_pie : "(Información PIE confidencial — acceso restringido)",
        beneficiosJunaeb: caso.beneficios_junaeb,
        denunciaObligatoriaPendiente,
        colegioNombre: colegioRows[0]?.nombre || null,
        colegioRbd: colegioRows[0]?.rbd || null,
        protocoloNombre: protocoloRows[0]?.nombre || null,
        protocoloNormativa: protocoloRows[0]?.normativa || null,
        pasosProtocolo,
        derivaciones,
        mediaciones,
        bitacora,
    };
}

const listar = asyncHandler(async (req, res) => {
    const { estado = "Todos", categoria = "Todos", responsable = "Todos", search = "", limit = 50, offset = 0 } = req.query;

    const condiciones = ["vc.colegio_id = $1"];
    const valores = [req.colegioId];

    if (estado !== "Todos") {
        valores.push(estado);
        condiciones.push(`vc.estado = $${valores.length}`);
    }
    if (categoria !== "Todos") {
        valores.push(categoria);
        condiciones.push(`vc.categoria = $${valores.length}`);
    }
    if (responsable !== "Todos") {
        valores.push(responsable);
        condiciones.push(`vc.responsable_nombre = $${valores.length}`);
    }
    if (search) {
        valores.push(search);
        const tsquery = tsQueryBusqueda(`$${valores.length}`);
        condiciones.push(
            `(to_tsvector('spanish', inmutable_unaccent(vc.estudiante)) @@ to_tsquery('spanish', ${tsquery})
              OR EXISTS (
                  SELECT 1 FROM caso_estudiantes_adicionales cea
                  WHERE cea.caso_id = vc.id
                    AND to_tsvector('spanish', inmutable_unaccent(cea.nombre)) @@ to_tsquery('spanish', ${tsquery})
              ))`
        );
    }

    valores.push(Math.min(Number(limit) || 50, 200));
    valores.push(Number(offset) || 0);

    const { rows } = await pool.query(
        `SELECT vc.id, vc.folio, vc.estudiante, vc.categoria, vc.fecha_apertura AS "fechaApertura", vc.dias_activo AS "diasActivo",
                vc.responsable_nombre AS "responsablePrincipal", vc.estado,
                COALESCE(
                    (CURRENT_DATE - (SELECT MAX(b.fecha_ejecucion) FROM bitacora b WHERE b.caso_id = vc.id)),
                    vc.dias_activo
                ) AS "diasInactivo",
                (SELECT count(*) FROM caso_estudiantes_adicionales cea WHERE cea.caso_id = vc.id) AS "estudiantesAdicionalesCount"
         FROM v_casos vc
         WHERE ${condiciones.join(" AND ")}
         ORDER BY vc.id DESC
         LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
        valores
    );

    const { rows: colegioRows } = await pool.query("SELECT dias_alerta_critico FROM colegios WHERE id = $1", [req.colegioId]);
    const diasAlertaCritico = colegioRows[0]?.dias_alerta_critico ?? 10;

    res.json(
        rows.map((c) => ({
            ...c,
            alertaCritica: c.estado !== "Cerrado" && c.diasInactivo >= diasAlertaCritico,
        }))
    );
});

const dashboard = asyncHandler(async (req, res) => {
    const { categoria = "Todos", desde = "" } = req.query;

    const { rows: colegioRows } = await pool.query("SELECT dias_alerta_critico FROM colegios WHERE id = $1", [
        req.colegioId,
    ]);
    const diasAlertaCritico = colegioRows[0]?.dias_alerta_critico ?? 10;

    const { rows: casos } = await pool.query(
        `SELECT id, folio, estudiante, estado, fecha_apertura AS fecha_apertura,
                categoria, responsable_nombre AS responsable
         FROM v_casos WHERE colegio_id = $1`,
        [req.colegioId]
    );

    const { rows: bitacora } = await pool.query(
        `SELECT b.caso_id, b.tipo, b.fecha_ejecucion AS fecha, b.motivo_cierre
         FROM bitacora b
         JOIN casos c ON c.id = b.caso_id
         WHERE c.colegio_id = $1`,
        [req.colegioId]
    );

    const bitacoraPorCaso = new Map();
    bitacora.forEach((b) => {
        if (!bitacoraPorCaso.has(b.caso_id)) bitacoraPorCaso.set(b.caso_id, []);
        bitacoraPorCaso.get(b.caso_id).push(b);
    });

    const filtrados = casos.filter((c) => {
        if (categoria !== "Todos" && c.categoria !== categoria) return false;
        if (desde && new Date(c.fecha_apertura) < new Date(desde)) return false;
        return true;
    });

    const kpis = {
        total: filtrados.length,
        abiertos: filtrados.filter((c) => c.estado === "Abierto").length,
        seguimiento: filtrados.filter((c) => c.estado === "En seguimiento").length,
        cerrados: filtrados.filter((c) => c.estado === "Cerrado").length,
    };

    const ahora = new Date();
    const alertas = casos
        .filter((c) => c.estado !== "Cerrado")
        .map((c) => {
            const entradas = bitacoraPorCaso.get(c.id) || [];
            const ultimaFecha = new Date(Math.max(...entradas.map((b) => new Date(b.fecha))));
            const diasInactivo = Math.ceil(Math.abs(ahora - ultimaFecha) / (1000 * 60 * 60 * 24));
            return { id: c.id, folio: c.folio, estudiante: c.estudiante, diasInactivo };
        })
        .filter((a) => a.diasInactivo >= diasAlertaCritico);

    const categoriasContador = {};
    const responsablesContador = {};
    filtrados.forEach((c) => {
        categoriasContador[c.categoria] = (categoriasContador[c.categoria] || 0) + 1;
        responsablesContador[c.responsable] = (responsablesContador[c.responsable] || 0) + 1;
    });

    const casesWithMedida = casos.filter((c) => (bitacoraPorCaso.get(c.id) || []).some((b) => b.tipo === "Medida"));
    const efectivas = casesWithMedida.filter(
        (c) =>
            c.estado === "Cerrado" &&
            (bitacoraPorCaso.get(c.id) || []).some((b) => b.tipo === "Cierre" && b.motivo_cierre === "Exitosa sin Reincidencia")
    ).length;
    const noEfectivas = casesWithMedida.length - efectivas;

    const { rows: vencimientos } = await pool.query(
        `SELECT cpp.id, cpp.descripcion, cpp.fecha_limite AS "fechaLimite", c.id AS "casoId", c.folio, c.estudiante
         FROM caso_pasos_protocolo cpp
         JOIN casos c ON c.id = cpp.caso_id
         WHERE c.colegio_id = $1 AND cpp.completado = FALSE AND cpp.fecha_limite IS NOT NULL
           AND cpp.fecha_limite <= CURRENT_DATE + INTERVAL '7 days'
         ORDER BY cpp.fecha_limite
         LIMIT 20`,
        [req.colegioId]
    );

    const { rows: metas } = await pool.query(
        `SELECT id, indicador, meta_valor AS "metaValor", descripcion FROM metas_pme WHERE colegio_id = $1 ORDER BY id`,
        [req.colegioId]
    );
    const tasaExitoMedidas = casesWithMedida.length > 0 ? Math.round((efectivas / casesWithMedida.length) * 1000) / 10 : null;
    const tasaCierre = filtrados.length > 0 ? Math.round((kpis.cerrados / filtrados.length) * 1000) / 10 : null;
    const indicadoresCalculados = {
        "Tasa de éxito de medidas aplicadas (%)": tasaExitoMedidas,
        "Casos cerrados (%)": tasaCierre,
        "Casos de Convivencia Escolar abiertos": filtrados.filter((c) => c.categoria === "Convivencia Escolar").length,
    };
    const pmeCruce = metas.map((m) => ({ ...m, valorActual: indicadoresCalculados[m.indicador] ?? null }));

    const capacitacionesPorVencer = await listarProximasAVencer(req.colegioId, 60);

    const { rows: cargaTrabajo } = await pool.query(
        `SELECT u.id, u.nombre, count(c.id) FILTER (WHERE c.estado != 'Cerrado')::int AS "casosActivos"
         FROM usuarios u
         LEFT JOIN casos c ON c.responsable_id = u.id
         WHERE u.colegio_id = $1 AND u.activo = TRUE AND u.rol IN ('admin', 'funcionario')
         GROUP BY u.id, u.nombre
         ORDER BY "casosActivos" DESC`,
        [req.colegioId]
    );

    const { rows: colegioReincidenciaRows } = await pool.query(
        "SELECT meses_alerta_reincidencia FROM colegios WHERE id = $1",
        [req.colegioId]
    );
    const mesesAlertaReincidencia = colegioReincidenciaRows[0]?.meses_alerta_reincidencia ?? 6;
    // "todos_estudiantes" junta el estudiante principal de cada caso con sus
    // estudiantes adicionales, para que la reincidencia se detecte aunque el
    // nombre que coincide no sea el principal en uno de los dos casos.
    const { rows: reincidencias } = await pool.query(
        `WITH todos_estudiantes AS (
             SELECT id AS caso_id, estudiante AS nombre FROM casos WHERE colegio_id = $1
             UNION ALL
             SELECT cea.caso_id, cea.nombre
             FROM caso_estudiantes_adicionales cea
             JOIN casos c ON c.id = cea.caso_id
             WHERE c.colegio_id = $1
         )
         SELECT DISTINCT c2.id, c2.folio, c2.estudiante, c2.categoria AS "categoriaNueva", c2.fecha_apertura AS "fechaNueva",
                c1.folio AS "folioAnterior", c1.categoria AS "categoriaAnterior", c1.fecha_cierre AS "fechaCierreAnterior"
         FROM todos_estudiantes te1
         JOIN todos_estudiantes te2 ON lower(inmutable_unaccent(te2.nombre)) = lower(inmutable_unaccent(te1.nombre))
                                    AND te2.caso_id != te1.caso_id
         JOIN casos c1 ON c1.id = te1.caso_id AND c1.estado = 'Cerrado'
         JOIN casos c2 ON c2.id = te2.caso_id
                      AND c2.fecha_apertura > c1.fecha_cierre
                      AND c2.fecha_apertura <= c1.fecha_cierre + ($2 || ' months')::interval
         ORDER BY c2.fecha_apertura DESC
         LIMIT 20`,
        [req.colegioId, mesesAlertaReincidencia]
    );

    res.json({
        kpis,
        alertas,
        diasAlertaCritico,
        categorias: { labels: Object.keys(categoriasContador), data: Object.values(categoriasContador) },
        responsables: { labels: Object.keys(responsablesContador), data: Object.values(responsablesContador) },
        impacto: { casesWithMedida: casesWithMedida.length, efectivas, noEfectivas },
        proximosVencimientos: vencimientos,
        pmeCruce,
        capacitacionesPorVencer,
        cargaTrabajo,
        mesesAlertaReincidencia,
        reincidencias,
    });
});

const obtener = asyncHandler(async (req, res) => {
    const caso = await getCasoDetalle(req.colegioId, req.params.id, req.usuario);
    if (!caso) return res.status(404).json({ error: "Caso no encontrado." });
    res.json(caso);
});

const crear = asyncHandler(async (req, res) => {
    const {
        estudiante,
        estudiantesAdicionales = [],
        fechaApertura,
        categoria,
        responsableId,
        descripcion,
        curso,
        tieneNee,
        diagnosticoPie,
        beneficiosJunaeb,
    } = req.body;

    const { rows: respRows } = await pool.query(
        "SELECT id FROM usuarios WHERE id = $1 AND colegio_id = $2 AND rol IN ('admin','funcionario') AND activo = TRUE",
        [responsableId, req.colegioId]
    );
    if (respRows.length === 0) return res.status(400).json({ error: "Responsable inválido." });

    const pasos = await obtenerPasosProtocoloEfectivo(req.colegioId, categoria);

    const client = await pool.connect();
    let casoId;
    try {
        await client.query("BEGIN");
        const { rows: nuevoCaso } = await client.query(
            `INSERT INTO casos (colegio_id, estudiante, categoria, descripcion, estado, fecha_apertura, responsable_id,
                                 curso, tiene_nee, diagnostico_pie, beneficios_junaeb)
             VALUES ($1, $2, $3, $4, 'Abierto', $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [
                req.colegioId,
                estudiante,
                categoria,
                descripcion,
                fechaApertura,
                responsableId,
                curso || null,
                Boolean(tieneNee),
                diagnosticoPie || null,
                beneficiosJunaeb || null,
            ]
        );
        casoId = nuevoCaso[0].id;

        for (const nombreAdicional of estudiantesAdicionales) {
            await client.query("INSERT INTO caso_estudiantes_adicionales (caso_id, nombre) VALUES ($1, $2)", [
                casoId,
                nombreAdicional,
            ]);
        }

        const contenidoApertura = "Apertura de expediente institucional.";
        const hash = calcularHash({ contenido: contenidoApertura, fecha: fechaApertura, operadorId: req.usuario.id, hashAnterior: null });
        await client.query(
            `INSERT INTO bitacora (caso_id, tipo, fecha_ejecucion, operador_id, contenido, hash, hash_anterior)
             VALUES ($1, 'Apertura', $2, $3, $4, $5, NULL)`,
            [casoId, fechaApertura, req.usuario.id, contenidoApertura, hash]
        );

        for (const paso of pasos) {
            const fechaLimite = new Date(`${fechaApertura}T00:00:00`);
            fechaLimite.setDate(fechaLimite.getDate() + (paso.plazoDias || 0));
            await client.query(
                `INSERT INTO caso_pasos_protocolo (caso_id, orden, descripcion, plazo_dias, fecha_limite)
                 VALUES ($1, $2, $3, $4, $5)`,
                [casoId, paso.orden, paso.descripcion, paso.plazoDias || null, fechaLimite.toISOString().slice(0, 10)]
            );
        }

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }

    if (curso) {
        const { rows: pj } = await pool.query(
            `SELECT u.nombre, u.email FROM cursos_profesor_jefe cpj
             JOIN usuarios u ON u.id = cpj.profesor_jefe_id
             WHERE cpj.colegio_id = $1 AND cpj.curso = $2`,
            [req.colegioId, curso]
        );
        if (pj[0]) {
            await enviarCorreo({
                to: pj[0].email || "profesor-jefe@colegio.local",
                subject: `SGE - Nuevo caso abierto en el curso ${curso}`,
                text: `Hola ${pj[0].nombre}, se abrió un nuevo caso de categoría "${categoria}" para un estudiante de tu curso ${curso}. Revisa el sistema SGE para más detalles.`,
            });
        }
    }

    res.status(201).json(await getCasoDetalle(req.colegioId, casoId, req.usuario));
});

const actualizar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT estado FROM casos WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    const caso = rows[0];
    if (!caso) return res.status(404).json({ error: "Caso no encontrado." });

    const { cierre, ...edicion } = req.body;

    if (cierre) {
        if (caso.estado === "Cerrado") return res.status(409).json({ error: "El caso ya se encuentra cerrado." });

        const { rows: ultimaRows } = await pool.query("SELECT hash FROM bitacora WHERE caso_id = $1 ORDER BY id DESC LIMIT 1", [
            req.params.id,
        ]);
        const hashAnterior = ultimaRows[0]?.hash || null;
        const hash = calcularHash({ contenido: cierre.evaluacion, fecha: cierre.fecha, operadorId: req.usuario.id, hashAnterior });

        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                "UPDATE casos SET estado = 'Cerrado', fecha_cierre = $1, motivo_cierre = $2 WHERE id = $3",
                [cierre.fecha, cierre.motivo, req.params.id]
            );
            await client.query(
                `INSERT INTO bitacora (caso_id, tipo, fecha_ejecucion, operador_id, contenido, motivo_cierre, evaluacion_cierre, hash, hash_anterior)
                 VALUES ($1, 'Cierre', $2, $3, $4, $5, $4, $6, $7)`,
                [req.params.id, cierre.fecha, req.usuario.id, cierre.evaluacion, cierre.motivo, hash, hashAnterior]
            );
            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    }

    const claves = Object.keys(edicion);
    if (claves.length > 0) {
        const mapaColumnas = {
            estudiante: "estudiante",
            categoria: "categoria",
            descripcion: "descripcion",
            responsableId: "responsable_id",
            curso: "curso",
            tieneNee: "tiene_nee",
            diagnosticoPie: "diagnostico_pie",
            beneficiosJunaeb: "beneficios_junaeb",
        };
        const sets = claves.map((clave, i) => `${mapaColumnas[clave]} = $${i + 1}`);
        const valores = claves.map((clave) => edicion[clave]);
        await pool.query(`UPDATE casos SET ${sets.join(", ")} WHERE id = $${valores.length + 1}`, [
            ...valores,
            req.params.id,
        ]);
    }

    res.json(await getCasoDetalle(req.colegioId, req.params.id, req.usuario));
});

const agregarEstudianteAdicional = asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT id FROM casos WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Caso no encontrado." });

    await pool.query("INSERT INTO caso_estudiantes_adicionales (caso_id, nombre) VALUES ($1, $2)", [
        req.params.id,
        req.body.nombre,
    ]);
    res.status(201).json(await getCasoDetalle(req.colegioId, req.params.id, req.usuario));
});

const eliminarEstudianteAdicional = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `DELETE FROM caso_estudiantes_adicionales
         WHERE id = $1 AND caso_id = $2
           AND caso_id IN (SELECT id FROM casos WHERE colegio_id = $3)
         RETURNING id`,
        [req.params.estId, req.params.id, req.colegioId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Estudiante adicional no encontrado." });
    res.json(await getCasoDetalle(req.colegioId, req.params.id, req.usuario));
});

const bitacora = asyncHandler(async (req, res) => {
    const { tipo, fecha, contenido, subtipo, estadoMedida, consentimientoApoderado, justificacionSinConsentimiento } = req.body;
    const tipoEnum = TIPO_BITACORA[tipo];

    const { rows } = await pool.query("SELECT estado FROM casos WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    const caso = rows[0];
    if (!caso) return res.status(404).json({ error: "Caso no encontrado." });
    if (caso.estado === "Cerrado") {
        return res.status(409).json({ error: "El caso está cerrado, no admite nuevas entradas de bitácora." });
    }

    const { rows: ultimaRows } = await pool.query("SELECT hash FROM bitacora WHERE caso_id = $1 ORDER BY id DESC LIMIT 1", [
        req.params.id,
    ]);
    const hashAnterior = ultimaRows[0]?.hash || null;
    const hash = calcularHash({ contenido, fecha, operadorId: req.usuario.id, hashAnterior });

    await pool.query(
        `INSERT INTO bitacora (caso_id, tipo, fecha_ejecucion, operador_id, contenido, subtipo_entrevista, estado_medida,
                                hash, hash_anterior, consentimiento_apoderado, justificacion_sin_consentimiento)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
            req.params.id,
            tipoEnum,
            fecha,
            req.usuario.id,
            contenido,
            subtipo || null,
            estadoMedida || null,
            hash,
            hashAnterior,
            consentimientoApoderado ?? null,
            justificacionSinConsentimiento || null,
        ]
    );

    if (caso.estado === "Abierto") {
        await pool.query("UPDATE casos SET estado = 'En seguimiento' WHERE id = $1", [req.params.id]);
    }

    res.json(await getCasoDetalle(req.colegioId, req.params.id, req.usuario));
});

function seccionTitulo(doc, texto) {
    doc.moveDown(0.8);
    doc.fontSize(13).fillColor("#1e3a8a").text(texto, { underline: true });
    doc.fillColor("#000000").fontSize(10);
    doc.moveDown(0.3);
}

function lineaDato(doc, etiqueta, valor) {
    doc.fontSize(10).fillColor("#475569").text(etiqueta, { continued: true }).fillColor("#000000").text(` ${valor}`);
}

function dibujarExpedientePdf(doc, caso) {
    const hoy = new Date().toISOString().slice(0, 10);

    // Encabezado institucional
    doc.fontSize(14).fillColor("#1e3a8a").text(caso.colegioNombre || "Establecimiento Educacional", { align: "center" });
    if (caso.colegioRbd) {
        doc.fontSize(9).fillColor("#64748b").text(`RBD: ${caso.colegioRbd}`, { align: "center" });
    }
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#94a3b8").text(`Documento generado el ${new Date().toLocaleString("es-CL")}`, { align: "center" });
    doc.moveDown(0.8);
    doc.fillColor("#000000");
    doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor("#cbd5e1")
        .stroke();
    doc.moveDown(0.8);

    doc.fontSize(18).fillColor("#0f172a").text(`Expediente ${caso.folio}`, { underline: true });
    doc.fontSize(11).fillColor("#475569").text(caso.categoria);
    doc.fillColor("#000000");

    // Datos generales
    seccionTitulo(doc, "Datos Generales del Caso");
    lineaDato(doc, "Estudiante Principal:", caso.estudiante);
    if (caso.estudiantesAdicionales && caso.estudiantesAdicionales.length) {
        lineaDato(doc, "Otros estudiantes involucrados:", caso.estudiantesAdicionales.map((e) => e.nombre).join(", "));
    }
    lineaDato(doc, "Curso:", caso.curso || "No registrado");
    lineaDato(doc, "Estado:", caso.estado);
    lineaDato(doc, "Fecha de apertura:", caso.fechaApertura);
    if (caso.estado === "Cerrado") {
        lineaDato(doc, "Fecha de cierre:", caso.fechaCierre || "-");
        lineaDato(doc, "Motivo de cierre:", caso.motivoCierre || "-");
    }
    lineaDato(doc, "Días de permanencia:", String(caso.diasActivo));
    lineaDato(doc, "Responsable principal:", caso.responsablePrincipal);
    if (caso.beneficiosJunaeb) lineaDato(doc, "Beneficios JUNAEB:", caso.beneficiosJunaeb);

    if (caso.tieneNee) {
        seccionTitulo(doc, "Programa de Integración Escolar (PIE)");
        doc.fontSize(10).text("Estudiante con Necesidades Educativas Especiales (NEE).");
        doc.text(caso.diagnosticoPie || "Sin diagnóstico registrado.");
    }

    if (caso.denunciaObligatoriaPendiente) {
        seccionTitulo(doc, "Aviso Legal");
        doc.fillColor("#b91c1c").fontSize(10).text(
            "DENUNCIA OBLIGATORIA PENDIENTE: este caso de Vulneración de Derechos aún no registra una denuncia a Carabineros, PDI, Fiscalía o Tribunal de Familia, conforme al Art. 175 letra e) del Código Procesal Penal."
        );
        doc.fillColor("#000000");
    }

    seccionTitulo(doc, "Descripción Inicial");
    doc.fontSize(10).text(caso.descripcion);

    seccionTitulo(doc, "Protocolo de Actuación Aplicado");
    if (caso.protocoloNombre) {
        doc.fontSize(10).text(caso.protocoloNombre, { continued: false });
        doc.fontSize(8).fillColor("#64748b").text(caso.protocoloNormativa || "");
        doc.fillColor("#000000");
        doc.moveDown(0.3);
    }
    if (caso.pasosProtocolo.length === 0) {
        doc.fontSize(10).text("Sin pasos de protocolo registrados.");
    } else {
        caso.pasosProtocolo.forEach((paso) => {
            const vencido = !paso.completado && paso.fechaLimite && paso.fechaLimite < hoy;
            const marca = paso.completado ? "[Completado]" : vencido ? "[VENCIDO]" : "[Pendiente]";
            doc.fontSize(9).fillColor(vencido ? "#b91c1c" : paso.completado ? "#15803d" : "#475569").text(`${marca} `, {
                continued: true,
            });
            doc.fillColor("#000000").text(`${paso.descripcion} (plazo: ${paso.fechaLimite || "sin definir"})`);
        });
    }

    seccionTitulo(doc, "Derivaciones Externas");
    if (caso.derivaciones.length === 0) {
        doc.fontSize(10).text("Sin derivaciones registradas.");
    } else {
        caso.derivaciones.forEach((d) => {
            doc.fontSize(10).text(`${d.institucion} — ${d.tipo} (${d.estado})`);
            doc.fontSize(9).fillColor("#475569").text(
                `Fecha: ${d.fechaDerivacion}${d.folioExterno ? ` — Folio externo: ${d.folioExterno}` : ""}`
            );
            if (d.notas) doc.text(`Notas: ${d.notas}`);
            if (Number(d.adjuntos) > 0) doc.text(`Medios de verificación adjuntos: ${d.adjuntos}`);
            doc.fillColor("#000000");
            doc.moveDown(0.2);
        });
    }

    seccionTitulo(doc, "Actas de Mediación Escolar");
    if (caso.mediaciones.length === 0) {
        doc.fontSize(10).text("Sin actas de mediación registradas.");
    } else {
        caso.mediaciones.forEach((m) => {
            doc.fontSize(10).text(`Mediación del ${m.fechaMediacion} — Mediador(a): ${m.mediador}`);
            doc.fontSize(9).fillColor("#475569").text(`Participantes: ${m.participantes}`);
            doc.fillColor("#000000").text(`Acuerdo: ${m.acuerdo}`);
            if (Number(m.adjuntos) > 0) doc.fontSize(9).fillColor("#475569").text(`Acta firmada adjunta: sí (${m.adjuntos} archivo(s))`);
            doc.fillColor("#000000");
            if (m.compromisos.length > 0) {
                m.compromisos.forEach((c) => {
                    const marca = c.cumplido ? "[Cumplido]" : "[Pendiente]";
                    doc.fontSize(9).fillColor(c.cumplido ? "#15803d" : "#475569").text(`  ${marca} `, { continued: true });
                    doc.fillColor("#000000").text(
                        `${c.descripcion}${c.responsable ? ` — Responsable: ${c.responsable}` : ""}${c.fechaLimite ? ` (plazo: ${c.fechaLimite})` : ""}`
                    );
                });
            }
            doc.moveDown(0.3);
        });
    }

    seccionTitulo(doc, "Bitácora Cronológica Oficial");
    if (caso.bitacora.length === 0) {
        doc.fontSize(10).text("Sin entradas de bitácora registradas.");
    } else {
        caso.bitacora.forEach((entrada) => {
            doc.fontSize(10).fillColor("#0f172a").text(`[${entrada.fecha}] ${entrada.tipo} — Operador: ${entrada.operador}`);
            doc.fillColor("#000000").fontSize(9).text(entrada.contenido);
            if (entrada.tipo === "Entrevista" && entrada.consentimientoApoderado === false) {
                doc.fontSize(8).fillColor("#b45309").text(
                    `Entrevista sin consentimiento informado del apoderado. Justificación: ${entrada.justificacionSinConsentimiento || "no registrada"}.`
                );
                doc.fillColor("#000000");
            }
            doc.moveDown(0.4);
        });
    }

    seccionTitulo(doc, "Cierre del Documento");
    doc.fontSize(8).fillColor("#94a3b8").text(
        "Este documento es un respaldo oficial generado automáticamente por el Sistema de Gestión de Casos Estudiantiles (SGE) y refleja el estado del expediente al momento de su generación."
    );

    const totalPaginas = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPaginas; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor("#94a3b8").text(`Página ${i + 1} de ${totalPaginas}`, 50, doc.page.height - 40, {
            width: doc.page.width - 100,
            align: "center",
        });
    }
}

const pdf = asyncHandler(async (req, res) => {
    const caso = await getCasoDetalle(req.colegioId, req.params.id, req.usuario);
    if (!caso) return res.status(404).json({ error: "Caso no encontrado." });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Expediente_${caso.folio}.pdf`);

    const doc = new PDFDocument({ margin: 50, bufferPages: true });
    doc.pipe(res);
    dibujarExpedientePdf(doc, caso);
    doc.end();
});

const exportarPdfsZip = asyncHandler(async (req, res) => {
    const { estado = "Todos", categoria = "Todos", responsable = "Todos", search = "" } = req.query;

    const condiciones = ["colegio_id = $1"];
    const valores = [req.colegioId];
    if (estado !== "Todos") {
        valores.push(estado);
        condiciones.push(`estado = $${valores.length}`);
    }
    if (categoria !== "Todos") {
        valores.push(categoria);
        condiciones.push(`categoria = $${valores.length}`);
    }
    if (responsable !== "Todos") {
        valores.push(responsable);
        condiciones.push(`responsable_nombre = $${valores.length}`);
    }
    if (search) {
        valores.push(search);
        const tsquery = tsQueryBusqueda(`$${valores.length}`);
        condiciones.push(
            `(to_tsvector('spanish', inmutable_unaccent(estudiante)) @@ to_tsquery('spanish', ${tsquery})
              OR EXISTS (
                  SELECT 1 FROM caso_estudiantes_adicionales cea
                  WHERE cea.caso_id = v_casos.id
                    AND to_tsvector('spanish', inmutable_unaccent(cea.nombre)) @@ to_tsquery('spanish', ${tsquery})
              ))`
        );
    }

    const { rows: casosFiltrados } = await pool.query(
        `SELECT id FROM v_casos WHERE ${condiciones.join(" AND ")} ORDER BY id`,
        valores
    );

    if (casosFiltrados.length === 0) {
        return res.status(404).json({ error: "No hay expedientes que coincidan con los filtros." });
    }
    if (casosFiltrados.length > 200) {
        return res.status(400).json({ error: "Demasiados expedientes (máximo 200 por exportación). Acota los filtros." });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=expedientes_sge.zip");

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    for (const { id } of casosFiltrados) {
        const caso = await getCasoDetalle(req.colegioId, id, req.usuario);
        if (!caso) continue;
        const doc = new PDFDocument({ margin: 50, bufferPages: true });
        archive.append(doc, { name: `Expediente_${caso.folio}.pdf` });
        dibujarExpedientePdf(doc, caso);
        doc.end();
    }

    await archive.finalize();
});

const listarPasosProtocolo = asyncHandler(async (req, res) => {
    const { rows: casoRows } = await pool.query("SELECT id FROM casos WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (!casoRows[0]) return res.status(404).json({ error: "Caso no encontrado." });

    const { rows } = await pool.query(
        `SELECT id, orden, descripcion, plazo_dias AS "plazoDias", fecha_limite AS "fechaLimite",
                completado, fecha_completado AS "fechaCompletado"
         FROM caso_pasos_protocolo WHERE caso_id = $1 ORDER BY orden`,
        [req.params.id]
    );
    res.json(rows);
});

const actualizarPasoProtocolo = asyncHandler(async (req, res) => {
    const { completado } = req.body;
    const { rows: casoRows } = await pool.query("SELECT id FROM casos WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (!casoRows[0]) return res.status(404).json({ error: "Caso no encontrado." });

    const { rows } = await pool.query(
        `UPDATE caso_pasos_protocolo
            SET completado = $1, fecha_completado = CASE WHEN $1 THEN CURRENT_DATE ELSE NULL END
          WHERE id = $2 AND caso_id = $3
        RETURNING id, orden, descripcion, plazo_dias AS "plazoDias", fecha_limite AS "fechaLimite",
                  completado, fecha_completado AS "fechaCompletado"`,
        [completado, req.params.pasoId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Paso de protocolo no encontrado." });
    res.json(rows[0]);
});

const elegiblesPurga = asyncHandler(async (req, res) => {
    const { rows: colegioRows } = await pool.query("SELECT dias_retencion_cerrados FROM colegios WHERE id = $1", [
        req.colegioId,
    ]);
    const diasRetencion = colegioRows[0]?.dias_retencion_cerrados ?? 1825;

    const { rows } = await pool.query(
        `SELECT id, folio, estudiante, fecha_cierre AS "fechaCierre"
         FROM casos
         WHERE colegio_id = $1 AND estado = 'Cerrado' AND fecha_cierre <= CURRENT_DATE - $2::int
         ORDER BY fecha_cierre`,
        [req.colegioId, diasRetencion]
    );
    res.json({ diasRetencion, casos: rows });
});

const purgar = asyncHandler(async (req, res) => {
    const { rows: colegioRows } = await pool.query("SELECT dias_retencion_cerrados FROM colegios WHERE id = $1", [
        req.colegioId,
    ]);
    const diasRetencion = colegioRows[0]?.dias_retencion_cerrados ?? 1825;

    const { rows } = await pool.query(
        `DELETE FROM casos
          WHERE id = $1 AND colegio_id = $2 AND estado = 'Cerrado' AND fecha_cierre <= CURRENT_DATE - $3::int
        RETURNING id`,
        [req.params.id, req.colegioId, diasRetencion]
    );
    if (!rows[0]) {
        return res
            .status(409)
            .json({ error: "El caso no es elegible para purga (no está cerrado o no ha superado el período de retención)." });
    }
    res.json({ ok: true });
});

const exportarAnonimoCsv = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT folio, categoria, estado, fecha_apertura AS "fechaApertura", dias_activo AS "diasActivo",
                responsable_nombre AS responsable
         FROM v_casos WHERE colegio_id = $1 ORDER BY id`,
        [req.colegioId]
    );
    const csv = aCsv(rows, ["folio", "categoria", "estado", "fechaApertura", "diasActivo", "responsable"]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=casos_anonimo.csv");
    res.send(csv);
});

module.exports = {
    listar,
    dashboard,
    obtener,
    crear,
    actualizar,
    agregarEstudianteAdicional,
    eliminarEstudianteAdicional,
    bitacora,
    pdf,
    exportarPdfsZip,
    getCasoDetalle,
    listarPasosProtocolo,
    actualizarPasoProtocolo,
    elegiblesPurga,
    purgar,
    exportarAnonimoCsv,
};
