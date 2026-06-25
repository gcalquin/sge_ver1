const PDFDocument = require("pdfkit");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { calcularHash } = require("../utils/hash");
const { enviarCorreo } = require("../config/mailer");
const { enviarWhatsapp, enviarSms } = require("../config/whatsapp");

const TIPO_BITACORA = { entrevista: "Entrevista", seguimiento: "Seguimiento", medida: "Medida" };

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
        `SELECT id, institucion, tipo, fecha_derivacion AS "fechaDerivacion", folio_externo AS "folioExterno", estado, notas
         FROM derivaciones WHERE caso_id = $1 ORDER BY id DESC`,
        [id]
    );

    const { rows: firmas } = await pool.query(
        `SELECT id, tipo_documento AS "tipoDocumento", nombre_firmante AS "nombreFirmante",
                rut_firmante AS "rutFirmante", fecha_firma AS "fechaFirma"
         FROM firmas WHERE caso_id = $1 ORDER BY id DESC`,
        [id]
    );

    const puedeVerPie =
        usuario && (usuario.rol === "admin" || usuario.rol === "superadmin" || usuario.especialidad === "Psicólogo PIE");
    const denunciaObligatoriaPendiente =
        caso.categoria === "Vulneración de Derechos" && !derivaciones.some((d) => d.tipo === "Denuncia Obligatoria");

    return {
        id: caso.id,
        folio: caso.folio,
        estudiante: caso.estudiante,
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
        pasosProtocolo,
        derivaciones,
        firmas,
        bitacora,
    };
}

const listar = asyncHandler(async (req, res) => {
    const { estado = "Todos", categoria = "Todos", responsable = "Todos", search = "", limit = 50, offset = 0 } = req.query;

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
        condiciones.push(
            `to_tsvector('spanish', inmutable_unaccent(estudiante)) @@ to_tsquery('spanish', inmutable_unaccent($${valores.length}) || ':*')`
        );
    }

    valores.push(Math.min(Number(limit) || 50, 200));
    valores.push(Number(offset) || 0);

    const { rows } = await pool.query(
        `SELECT id, folio, estudiante, categoria, fecha_apertura AS "fechaApertura", dias_activo AS "diasActivo",
                responsable_nombre AS "responsablePrincipal", estado
         FROM v_casos
         WHERE ${condiciones.join(" AND ")}
         ORDER BY id DESC
         LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
        valores
    );

    res.json(rows);
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

    res.json({
        kpis,
        alertas,
        diasAlertaCritico,
        categorias: { labels: Object.keys(categoriasContador), data: Object.values(categoriasContador) },
        responsables: { labels: Object.keys(responsablesContador), data: Object.values(responsablesContador) },
        impacto: { casesWithMedida: casesWithMedida.length, efectivas, noEfectivas },
        proximosVencimientos: vencimientos,
        pmeCruce,
    });
});

const obtener = asyncHandler(async (req, res) => {
    const caso = await getCasoDetalle(req.colegioId, req.params.id, req.usuario);
    if (!caso) return res.status(404).json({ error: "Caso no encontrado." });
    res.json(caso);
});

const crear = asyncHandler(async (req, res) => {
    const { estudiante, fechaApertura, categoria, responsableId, descripcion, curso, tieneNee, diagnosticoPie, beneficiosJunaeb } =
        req.body;

    const { rows: respRows } = await pool.query(
        "SELECT id FROM usuarios WHERE id = $1 AND colegio_id = $2 AND rol IN ('admin','funcionario') AND activo = TRUE",
        [responsableId, req.colegioId]
    );
    if (respRows.length === 0) return res.status(400).json({ error: "Responsable inválido." });

    const { rows: protocoloRows } = await pool.query("SELECT pasos FROM protocolos WHERE categoria = $1", [categoria]);
    const pasos = protocoloRows[0]?.pasos || [];

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

const pdf = asyncHandler(async (req, res) => {
    const caso = await getCasoDetalle(req.colegioId, req.params.id, req.usuario);
    if (!caso) return res.status(404).json({ error: "Caso no encontrado." });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Expediente_${caso.folio}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(16).text(`Expediente ${caso.folio}`, { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Estudiante: ${caso.estudiante}`);
    doc.text(`Categoría: ${caso.categoria}`);
    doc.text(`Estado: ${caso.estado}`);
    doc.text(`Fecha de apertura: ${caso.fechaApertura}`);
    doc.text(`Responsable: ${caso.responsablePrincipal}`);
    doc.moveDown();
    doc.text("Descripción:", { underline: true });
    doc.text(caso.descripcion);
    doc.moveDown();

    doc.fontSize(13).text("Bitácora cronológica", { underline: true });
    doc.moveDown(0.5);
    caso.bitacora.forEach((entrada) => {
        doc.fontSize(11).text(`[${entrada.fecha}] ${entrada.tipo} — Operador: ${entrada.operador}`);
        doc.fontSize(10).text(entrada.contenido);
        doc.moveDown(0.5);
    });

    doc.end();
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

const notificarApoderado = asyncHandler(async (req, res) => {
    const { rows: casoRows } = await pool.query("SELECT folio FROM casos WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (!casoRows[0]) return res.status(404).json({ error: "Caso no encontrado." });

    const { canal, destinatario, mensaje } = req.body;
    let resultado;
    if (canal === "whatsapp") resultado = await enviarWhatsapp({ to: destinatario, mensaje });
    else if (canal === "sms") resultado = await enviarSms({ to: destinatario, mensaje });
    else resultado = await enviarCorreo({ to: destinatario, subject: `SGE - Notificación caso ${casoRows[0].folio}`, text: mensaje });

    res.json({ ok: true, canal, dryRun: Boolean(resultado.dryRun) });
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
    bitacora,
    pdf,
    getCasoDetalle,
    listarPasosProtocolo,
    actualizarPasoProtocolo,
    notificarApoderado,
    elegiblesPurga,
    purgar,
    exportarAnonimoCsv,
};
