const PDFDocument = require("pdfkit");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { CATEGORIA_SUMARIO } = require("../validation/constants");

// ===================== actividades de convivencia escolar =====================

async function actividadPerteneceAlColegio(actividadId, colegioId) {
    const { rows } = await pool.query("SELECT id FROM actividades_convivencia WHERE id = $1 AND colegio_id = $2", [
        actividadId,
        colegioId,
    ]);
    return Boolean(rows[0]);
}

const listarActividades = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT a.id, a.nombre, a.tipo, a.fecha, a.descripcion, a.meta_pme_id AS "metaPmeId",
                a.cerrada, a.fecha_cierre AS "fechaCierre", a.evaluacion_cierre AS "evaluacionCierre",
                u.nombre AS "creadoPor",
                (SELECT count(*) FROM actividad_bitacora b WHERE b.actividad_id = a.id) AS bitacora,
                (SELECT count(*) FROM adjuntos ad WHERE ad.actividad_id = a.id) AS adjuntos
         FROM actividades_convivencia a
         JOIN usuarios u ON u.id = a.creado_por
         WHERE a.colegio_id = $1
         ORDER BY a.fecha DESC`,
        [req.colegioId]
    );
    res.json(rows);
});

const crearActividad = asyncHandler(async (req, res) => {
    const { nombre, tipo, fecha, descripcion, metaPmeId } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO actividades_convivencia (colegio_id, nombre, tipo, fecha, descripcion, meta_pme_id, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, nombre, tipo, fecha, descripcion, meta_pme_id AS "metaPmeId"`,
        [req.colegioId, nombre, tipo, fecha, descripcion || null, metaPmeId || null, req.usuario.id]
    );
    res.status(201).json(rows[0]);
});

const eliminarActividad = asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM actividades_convivencia WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: "Actividad no encontrada." });
    res.json({ ok: true });
});

// ===================== bitácora de seguimiento de la actividad =====================

const listarBitacoraActividad = asyncHandler(async (req, res) => {
    if (!(await actividadPerteneceAlColegio(req.params.actId, req.colegioId))) {
        return res.status(404).json({ error: "Actividad no encontrada." });
    }
    const { rows } = await pool.query(
        `SELECT b.id, b.fecha, b.contenido, u.nombre AS operador
         FROM actividad_bitacora b
         JOIN usuarios u ON u.id = b.operador_id
         WHERE b.actividad_id = $1
         ORDER BY b.id`,
        [req.params.actId]
    );
    res.json(rows);
});

const crearBitacoraActividad = asyncHandler(async (req, res) => {
    if (!(await actividadPerteneceAlColegio(req.params.actId, req.colegioId))) {
        return res.status(404).json({ error: "Actividad no encontrada." });
    }
    const { fecha, contenido } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO actividad_bitacora (actividad_id, fecha, contenido, operador_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, fecha, contenido`,
        [req.params.actId, fecha, contenido, req.usuario.id]
    );
    res.status(201).json(rows[0]);
});

// ===================== cierre de la actividad =====================

const cerrarActividad = asyncHandler(async (req, res) => {
    const { fecha, evaluacion } = req.body;
    const { rows } = await pool.query(
        `UPDATE actividades_convivencia
            SET cerrada = TRUE, fecha_cierre = $1, evaluacion_cierre = $2, cerrada_por = $3
          WHERE id = $4 AND colegio_id = $5
        RETURNING id, cerrada, fecha_cierre AS "fechaCierre", evaluacion_cierre AS "evaluacionCierre"`,
        [fecha, evaluacion, req.usuario.id, req.params.actId, req.colegioId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Actividad no encontrada." });
    res.json(rows[0]);
});

// ===================== PDF / resumen de impresión de la actividad =====================

const pdfActividad = asyncHandler(async (req, res) => {
    const { rows: actRows } = await pool.query(
        `SELECT a.id, a.nombre, a.tipo, a.fecha, a.descripcion, a.cerrada,
                a.fecha_cierre AS "fechaCierre", a.evaluacion_cierre AS "evaluacionCierre",
                u.nombre AS "creadoPor", cu.nombre AS "cerradaPorNombre"
         FROM actividades_convivencia a
         JOIN usuarios u ON u.id = a.creado_por
         LEFT JOIN usuarios cu ON cu.id = a.cerrada_por
         WHERE a.id = $1 AND a.colegio_id = $2`,
        [req.params.actId, req.colegioId]
    );
    const actividad = actRows[0];
    if (!actividad) return res.status(404).json({ error: "Actividad no encontrada." });

    const { rows: bitacora } = await pool.query(
        `SELECT b.fecha, b.contenido, u.nombre AS operador
         FROM actividad_bitacora b JOIN usuarios u ON u.id = b.operador_id
         WHERE b.actividad_id = $1 ORDER BY b.id`,
        [req.params.actId]
    );
    const { rows: adjuntos } = await pool.query(
        "SELECT nombre_orig AS nombre FROM adjuntos WHERE actividad_id = $1 ORDER BY id",
        [req.params.actId]
    );
    const { rows: colegioRows } = await pool.query("SELECT nombre, rbd FROM colegios WHERE id = $1", [req.colegioId]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Actividad_Convivencia_${actividad.id}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(14)
        .fillColor("#1e3a8a")
        .text(colegioRows[0]?.nombre || "Establecimiento Educacional", { align: "center" });
    if (colegioRows[0]?.rbd)
        doc.fontSize(9).fillColor("#64748b").text(`RBD: ${colegioRows[0].rbd}`, { align: "center" });
    doc.moveDown(0.8);
    doc.fillColor("#000000");
    doc.moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor("#cbd5e1")
        .stroke();
    doc.moveDown(0.8);

    doc.fontSize(16).fillColor("#0f172a").text(actividad.nombre, { underline: true });
    doc.fontSize(10).fillColor("#475569").text(`${actividad.tipo} — ${actividad.fecha}`);
    doc.fillColor("#000000").moveDown(0.4);
    doc.fontSize(10).text(`Registrada por: ${actividad.creadoPor}`);
    if (actividad.descripcion) {
        doc.moveDown(0.4);
        doc.fontSize(12).fillColor("#1e3a8a").text("Descripción", { underline: true });
        doc.fontSize(10).fillColor("#000000").text(actividad.descripcion);
    }

    doc.moveDown(0.6);
    doc.fontSize(12).fillColor("#1e3a8a").text("Bitácora de Seguimiento", { underline: true });
    if (bitacora.length === 0) {
        doc.fontSize(10).fillColor("#000000").text("Sin entradas de seguimiento registradas.");
    } else {
        bitacora.forEach((b) => {
            doc.fontSize(10).fillColor("#0f172a").text(`[${b.fecha}] Operador: ${b.operador}`);
            doc.fontSize(9).fillColor("#000000").text(b.contenido);
            doc.moveDown(0.2);
        });
    }

    doc.moveDown(0.6);
    doc.fontSize(12).fillColor("#1e3a8a").text("Cierre de la Actividad", { underline: true });
    if (!actividad.cerrada) {
        doc.fontSize(10).fillColor("#000000").text("Actividad aún no cerrada.");
    } else {
        doc.fontSize(10).fillColor("#000000").text(`Fecha de cierre: ${actividad.fechaCierre}`);
        doc.text(`Cerrada por: ${actividad.cerradaPorNombre || "-"}`);
        doc.text(`Evaluación: ${actividad.evaluacionCierre || "-"}`);
    }

    doc.moveDown(0.6);
    doc.fontSize(12).fillColor("#1e3a8a").text("Medios de Verificación Adjuntos", { underline: true });
    if (adjuntos.length === 0) {
        doc.fontSize(10).fillColor("#000000").text("Sin archivos adjuntos.");
    } else {
        adjuntos.forEach((a) => doc.fontSize(10).fillColor("#000000").text(`- ${a.nombre}`));
    }

    doc.moveDown(1.5);
    doc.fontSize(8)
        .fillColor("#94a3b8")
        .text("Documento generado automáticamente por el Sistema de Gestión de Casos Estudiantiles (SGE).");

    doc.end();
});

// ===================== protocolos personalizados por colegio =====================

const listarProtocolos = asyncHandler(async (req, res) => {
    // El protocolo de sumarios (Ley Karin) es confidencial e interno: no se
    // ofrece para personalización en el panel general de Convivencia, que
    // pueden ver funcionario/admin sin restricción especial.
    const { rows } = await pool.query(
        `SELECT p.categoria, p.nombre AS "nombreGlobal", p.normativa AS "normativaGlobal", p.pasos AS "pasosGlobal",
                pc.id AS "overrideId", pc.nombre AS "nombreColegio", pc.normativa AS "normativaColegio", pc.pasos AS "pasosColegio"
         FROM protocolos p
         LEFT JOIN protocolos_colegio pc ON pc.categoria = p.categoria AND pc.colegio_id = $1
         WHERE p.categoria != $2
         ORDER BY p.categoria`,
        [req.colegioId, CATEGORIA_SUMARIO]
    );

    res.json(
        rows.map((r) => ({
            categoria: r.categoria,
            personalizado: Boolean(r.overrideId),
            nombre: r.overrideId ? r.nombreColegio : r.nombreGlobal,
            normativa: r.overrideId ? r.normativaColegio : r.normativaGlobal,
            pasos: r.overrideId ? r.pasosColegio : r.pasosGlobal,
            nombreGlobal: r.nombreGlobal,
            normativaGlobal: r.normativaGlobal,
            pasosGlobal: r.pasosGlobal,
        }))
    );
});

const guardarProtocoloColegio = asyncHandler(async (req, res) => {
    const { nombre, normativa, pasos } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO protocolos_colegio (colegio_id, categoria, nombre, normativa, pasos)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (colegio_id, categoria) DO UPDATE SET nombre = EXCLUDED.nombre, normativa = EXCLUDED.normativa, pasos = EXCLUDED.pasos
         RETURNING id`,
        [req.colegioId, req.params.categoria, nombre, normativa || null, JSON.stringify(pasos)]
    );
    res.status(201).json({ ok: true, id: rows[0].id });
});

const eliminarProtocoloColegio = asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM protocolos_colegio WHERE colegio_id = $1 AND categoria = $2", [
        req.colegioId,
        req.params.categoria,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: "No hay un protocolo personalizado para esa categoría." });
    res.json({ ok: true });
});

async function obtenerPasosProtocoloEfectivo(colegioId, categoria) {
    const { rows: overrideRows } = await pool.query(
        "SELECT pasos FROM protocolos_colegio WHERE colegio_id = $1 AND categoria = $2",
        [colegioId, categoria]
    );
    if (overrideRows[0]) return overrideRows[0].pasos;

    const { rows: globalRows } = await pool.query("SELECT pasos FROM protocolos WHERE categoria = $1", [categoria]);
    return globalRows[0]?.pasos || [];
}

// ===================== catálogo de medidas reparatorias =====================

const listarMedidas = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        "SELECT id, nombre, activo FROM medidas_catalogo WHERE colegio_id = $1 ORDER BY nombre",
        [req.colegioId]
    );
    res.json(rows);
});

const crearMedida = asyncHandler(async (req, res) => {
    const { nombre } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO medidas_catalogo (colegio_id, nombre) VALUES ($1, $2)
         ON CONFLICT (colegio_id, nombre) DO UPDATE SET activo = TRUE
         RETURNING id, nombre, activo`,
        [req.colegioId, nombre]
    );
    res.status(201).json(rows[0]);
});

const actualizarMedida = asyncHandler(async (req, res) => {
    const { activo } = req.body;
    const { rows } = await pool.query(
        `UPDATE medidas_catalogo SET activo = $1 WHERE id = $2 AND colegio_id = $3 RETURNING id, nombre, activo`,
        [activo, req.params.id, req.colegioId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Medida no encontrada." });
    res.json(rows[0]);
});

const eliminarMedida = asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM medidas_catalogo WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: "Medida no encontrada." });
    res.json({ ok: true });
});

module.exports = {
    listarActividades,
    crearActividad,
    eliminarActividad,
    listarBitacoraActividad,
    crearBitacoraActividad,
    cerrarActividad,
    pdfActividad,
    listarProtocolos,
    guardarProtocoloColegio,
    eliminarProtocoloColegio,
    obtenerPasosProtocoloEfectivo,
    listarMedidas,
    crearMedida,
    actualizarMedida,
    eliminarMedida,
};
