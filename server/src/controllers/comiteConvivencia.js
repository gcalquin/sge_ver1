const PDFDocument = require("pdfkit");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { seccionTitulo, lineaDato, encabezadoInstitucional, piePaginas } = require("../utils/pdfHelpers");
const { CATEGORIA_SUMARIO } = require("../validation/constants");

// ===================== actas del Comité de Buena Convivencia Escolar =====================
// Mismo patrón que mediaciones.js (obtenerMediacionesDeCaso): se trae el acta y,
// con un único query adicional con ANY($1), todos sus compromisos, y se mergean
// en memoria. Acá no hay "caso" al que pertenezcan: las actas son del colegio.

async function obtenerActasDeColegio(colegioId) {
    const { rows: actas } = await pool.query(
        `SELECT a.id, a.fecha_reunion AS "fechaReunion", a.asistentes, a.temas_tratados AS "temasTratados",
                a.acuerdos, u.nombre AS "creadoPor",
                (SELECT count(*) FROM adjuntos ad WHERE ad.acta_comite_id = a.id) AS adjuntos
         FROM actas_comite_convivencia a
         JOIN usuarios u ON u.id = a.creado_por
         WHERE a.colegio_id = $1
         ORDER BY a.fecha_reunion DESC, a.id DESC`,
        [colegioId]
    );

    const actaIds = actas.map((a) => a.id);
    let compromisos = [];
    if (actaIds.length > 0) {
        const { rows } = await pool.query(
            `SELECT id, acta_id AS "actaId", descripcion, responsable, fecha_limite AS "fechaLimite",
                    cumplido, fecha_cumplido AS "fechaCumplido"
             FROM acta_comite_compromisos WHERE acta_id = ANY($1) ORDER BY id`,
            [actaIds]
        );
        compromisos = rows;
    }

    return actas.map((a) => ({ ...a, compromisos: compromisos.filter((c) => c.actaId === a.id) }));
}

const listar = asyncHandler(async (req, res) => {
    res.json(await obtenerActasDeColegio(req.colegioId));
});

const crear = asyncHandler(async (req, res) => {
    const { fechaReunion, asistentes, temasTratados, acuerdos, compromisos = [] } = req.body;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(
            `INSERT INTO actas_comite_convivencia (colegio_id, fecha_reunion, asistentes, temas_tratados, acuerdos, creado_por)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [req.colegioId, fechaReunion, asistentes, temasTratados, acuerdos, req.usuario.id]
        );
        const actaId = rows[0].id;

        for (const c of compromisos) {
            await client.query(
                `INSERT INTO acta_comite_compromisos (acta_id, descripcion, responsable, fecha_limite)
                 VALUES ($1, $2, $3, $4)`,
                [actaId, c.descripcion, c.responsable || null, c.fechaLimite || null]
            );
        }
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }

    res.status(201).json(await obtenerActasDeColegio(req.colegioId));
});

const agregarCompromiso = asyncHandler(async (req, res) => {
    const { rows: actaRows } = await pool.query("SELECT id FROM actas_comite_convivencia WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (!actaRows[0]) return res.status(404).json({ error: "Acta no encontrada." });

    const { descripcion, responsable, fechaLimite } = req.body;
    await pool.query(
        `INSERT INTO acta_comite_compromisos (acta_id, descripcion, responsable, fecha_limite)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, descripcion, responsable || null, fechaLimite || null]
    );
    res.status(201).json(await obtenerActasDeColegio(req.colegioId));
});

const actualizarCompromiso = asyncHandler(async (req, res) => {
    const { cumplido } = req.body;
    const { rows } = await pool.query(
        `UPDATE acta_comite_compromisos cc
            SET cumplido = $1, fecha_cumplido = CASE WHEN $1 THEN CURRENT_DATE ELSE NULL END
          FROM actas_comite_convivencia a
         WHERE cc.id = $2 AND cc.acta_id = a.id AND a.id = $3 AND a.colegio_id = $4
        RETURNING cc.id`,
        [cumplido, req.params.compId, req.params.id, req.colegioId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Compromiso no encontrado." });
    res.json(await obtenerActasDeColegio(req.colegioId));
});

const pdf = asyncHandler(async (req, res) => {
    const { rows: actaRows } = await pool.query(
        `SELECT a.id, a.fecha_reunion AS "fechaReunion", a.asistentes, a.temas_tratados AS "temasTratados",
                a.acuerdos, u.nombre AS "creadoPor"
         FROM actas_comite_convivencia a JOIN usuarios u ON u.id = a.creado_por
         WHERE a.id = $1 AND a.colegio_id = $2`,
        [req.params.id, req.colegioId]
    );
    const acta = actaRows[0];
    if (!acta) return res.status(404).json({ error: "Acta no encontrada." });

    const { rows: compromisos } = await pool.query(
        `SELECT descripcion, responsable, fecha_limite AS "fechaLimite", cumplido
         FROM acta_comite_compromisos WHERE acta_id = $1 ORDER BY id`,
        [req.params.id]
    );
    const { rows: colegioRows } = await pool.query("SELECT nombre, rbd FROM colegios WHERE id = $1", [req.colegioId]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Acta_Comite_Convivencia_${acta.id}.pdf`);

    const doc = new PDFDocument({ margin: 50, bufferPages: true });
    doc.pipe(res);

    encabezadoInstitucional(doc, {
        colegioNombre: colegioRows[0]?.nombre,
        colegioRbd: colegioRows[0]?.rbd,
        titulo: "Acta del Comité de Buena Convivencia Escolar",
        subtitulo: `Reunión del ${acta.fechaReunion}`,
    });

    seccionTitulo(doc, "Datos de la Reunión");
    lineaDato(doc, "Fecha:", acta.fechaReunion);
    lineaDato(doc, "Registrada por:", acta.creadoPor);

    seccionTitulo(doc, "Asistentes");
    doc.fontSize(10).text(acta.asistentes);

    seccionTitulo(doc, "Temas Tratados");
    doc.fontSize(10).text(acta.temasTratados);

    seccionTitulo(doc, "Acuerdos");
    doc.fontSize(10).text(acta.acuerdos);

    seccionTitulo(doc, "Compromisos de Seguimiento");
    if (compromisos.length === 0) {
        doc.fontSize(10).text("Sin compromisos registrados.");
    } else {
        compromisos.forEach((c) => {
            const marca = c.cumplido ? "[Cumplido]" : "[Pendiente]";
            doc.fontSize(9)
                .fillColor(c.cumplido ? "#15803d" : "#475569")
                .text(`${marca} `, { continued: true });
            doc.fillColor("#000000").text(
                `${c.descripcion}${c.responsable ? ` — Responsable: ${c.responsable}` : ""}${c.fechaLimite ? ` (plazo: ${c.fechaLimite})` : ""}`
            );
        });
    }

    piePaginas(doc);
    doc.end();
});

// ===================== Plan de Gestión de Convivencia Escolar (anual) =====================
// Documento-resumen exigido por la normativa de convivencia escolar: junta lo que
// el sistema ya gestiona durante el año (actas del comité, actividades, protocolos
// vigentes y estadísticas de casos) en un solo PDF, en vez de pedirle al colegio
// que lo arme a mano en un Word aparte.

const planGestionPdf = asyncHandler(async (req, res) => {
    const anio = Number(req.query.anio) || new Date().getFullYear();
    const desde = `${anio}-01-01`;
    const hasta = `${anio}-12-31`;

    const [{ rows: colegioRows }, { rows: actas }, { rows: actividades }, { rows: protocolos }, { rows: estadisticas }] =
        await Promise.all([
            pool.query("SELECT nombre, rbd FROM colegios WHERE id = $1", [req.colegioId]),
            pool.query(
                `SELECT fecha_reunion AS "fechaReunion", temas_tratados AS "temasTratados", acuerdos
                 FROM actas_comite_convivencia
                 WHERE colegio_id = $1 AND fecha_reunion BETWEEN $2 AND $3
                 ORDER BY fecha_reunion`,
                [req.colegioId, desde, hasta]
            ),
            pool.query(
                `SELECT nombre, tipo, fecha, descripcion, cerrada
                 FROM actividades_convivencia
                 WHERE colegio_id = $1 AND fecha BETWEEN $2 AND $3
                 ORDER BY fecha`,
                [req.colegioId, desde, hasta]
            ),
            pool.query(
                `SELECT p.categoria, COALESCE(pc.nombre, p.nombre) AS nombre, COALESCE(pc.normativa, p.normativa) AS normativa
                 FROM protocolos p
                 LEFT JOIN protocolos_colegio pc ON pc.categoria = p.categoria AND pc.colegio_id = $1
                 WHERE p.categoria != $2
                 ORDER BY p.categoria`,
                [req.colegioId, CATEGORIA_SUMARIO]
            ),
            pool.query(
                `SELECT categoria, count(*)::int AS total
                 FROM casos
                 WHERE colegio_id = $1 AND ambito = 'Estudiantil' AND fecha_apertura BETWEEN $2 AND $3
                 GROUP BY categoria ORDER BY total DESC`,
                [req.colegioId, desde, hasta]
            ),
        ]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Plan_Gestion_Convivencia_${anio}.pdf`);

    const doc = new PDFDocument({ margin: 50, bufferPages: true });
    doc.pipe(res);

    encabezadoInstitucional(doc, {
        colegioNombre: colegioRows[0]?.nombre,
        colegioRbd: colegioRows[0]?.rbd,
        titulo: `Plan de Gestión de Convivencia Escolar ${anio}`,
        subtitulo: "Resumen anual de gestión",
    });

    seccionTitulo(doc, "Casos por Categoría");
    if (estadisticas.length === 0) {
        doc.fontSize(10).text("Sin casos registrados en el período.");
    } else {
        estadisticas.forEach((e) => lineaDato(doc, `${e.categoria}:`, `${e.total} caso(s)`));
    }

    seccionTitulo(doc, "Protocolos de Actuación Vigentes");
    protocolos.forEach((p) => {
        doc.fontSize(10).text(`${p.categoria} — ${p.nombre}`);
        doc.fontSize(8)
            .fillColor("#64748b")
            .text(p.normativa || "");
        doc.fillColor("#000000");
        doc.moveDown(0.2);
    });

    seccionTitulo(doc, `Actividades de Convivencia Escolar Realizadas (${actividades.length})`);
    if (actividades.length === 0) {
        doc.fontSize(10).text("Sin actividades registradas en el período.");
    } else {
        actividades.forEach((a) => {
            doc.fontSize(10).text(`[${a.fecha}] ${a.nombre} (${a.tipo})${a.cerrada ? " — Cerrada" : ""}`);
            if (a.descripcion)
                doc.fontSize(9)
                    .fillColor("#475569")
                    .text(a.descripcion);
            doc.fillColor("#000000");
            doc.moveDown(0.2);
        });
    }

    seccionTitulo(doc, `Reuniones del Comité de Buena Convivencia Escolar (${actas.length})`);
    if (actas.length === 0) {
        doc.fontSize(10).text("Sin reuniones del comité registradas en el período.");
    } else {
        actas.forEach((a) => {
            doc.fontSize(10).text(`Reunión del ${a.fechaReunion}`);
            doc.fontSize(9).fillColor("#475569").text(`Temas: ${a.temasTratados}`);
            doc.fillColor("#000000").text(`Acuerdos: ${a.acuerdos}`);
            doc.moveDown(0.3);
        });
    }

    piePaginas(
        doc,
        "Este documento es un respaldo de gestión generado automáticamente por el Sistema de Gestión de Casos Estudiantiles (SGE) en base a la información registrada durante el período."
    );
    doc.end();
});

module.exports = { obtenerActasDeColegio, listar, crear, agregarCompromiso, actualizarCompromiso, pdf, planGestionPdf };
