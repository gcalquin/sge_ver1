const PDFDocument = require("pdfkit");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

async function casoPerteneceAlColegio(casoId, colegioId) {
    const { rows } = await pool.query("SELECT id FROM casos WHERE id = $1 AND colegio_id = $2", [casoId, colegioId]);
    return Boolean(rows[0]);
}

async function obtenerMediacionesDeCaso(casoId) {
    const { rows: mediaciones } = await pool.query(
        `SELECT m.id, m.fecha_mediacion AS "fechaMediacion", m.participantes, m.acuerdo, u.nombre AS mediador,
                (SELECT count(*) FROM adjuntos a WHERE a.mediacion_id = m.id) AS adjuntos
         FROM mediaciones m
         JOIN usuarios u ON u.id = m.mediador_id
         WHERE m.caso_id = $1
         ORDER BY m.id DESC`,
        [casoId]
    );

    const medIds = mediaciones.map((m) => m.id);
    let compromisos = [];
    if (medIds.length > 0) {
        const { rows } = await pool.query(
            `SELECT id, mediacion_id AS "mediacionId", descripcion, responsable, fecha_limite AS "fechaLimite",
                    cumplido, fecha_cumplido AS "fechaCumplido"
             FROM mediacion_compromisos WHERE mediacion_id = ANY($1) ORDER BY id`,
            [medIds]
        );
        compromisos = rows;
    }

    return mediaciones.map((m) => ({ ...m, compromisos: compromisos.filter((c) => c.mediacionId === m.id) }));
}

const listar = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    res.json(await obtenerMediacionesDeCaso(req.params.id));
});

const crear = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { fechaMediacion, participantes, acuerdo, compromisos = [] } = req.body;

    const client = await pool.connect();
    let mediacionId;
    try {
        await client.query("BEGIN");
        const { rows } = await client.query(
            `INSERT INTO mediaciones (caso_id, fecha_mediacion, participantes, acuerdo, mediador_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [req.params.id, fechaMediacion, participantes, acuerdo, req.usuario.id]
        );
        mediacionId = rows[0].id;

        for (const c of compromisos) {
            await client.query(
                `INSERT INTO mediacion_compromisos (mediacion_id, descripcion, responsable, fecha_limite)
                 VALUES ($1, $2, $3, $4)`,
                [mediacionId, c.descripcion, c.responsable || null, c.fechaLimite || null]
            );
        }
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }

    res.status(201).json(await obtenerMediacionesDeCaso(req.params.id));
});

const agregarCompromiso = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { rows: medRows } = await pool.query("SELECT id FROM mediaciones WHERE id = $1 AND caso_id = $2", [
        req.params.medId,
        req.params.id,
    ]);
    if (!medRows[0]) return res.status(404).json({ error: "Acta de mediación no encontrada." });

    const { descripcion, responsable, fechaLimite } = req.body;
    await pool.query(
        `INSERT INTO mediacion_compromisos (mediacion_id, descripcion, responsable, fecha_limite)
         VALUES ($1, $2, $3, $4)`,
        [req.params.medId, descripcion, responsable || null, fechaLimite || null]
    );
    res.status(201).json(await obtenerMediacionesDeCaso(req.params.id));
});

const actualizarCompromiso = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { cumplido } = req.body;
    const { rows } = await pool.query(
        `UPDATE mediacion_compromisos mc
            SET cumplido = $1, fecha_cumplido = CASE WHEN $1 THEN CURRENT_DATE ELSE NULL END
          FROM mediaciones m
         WHERE mc.id = $2 AND mc.mediacion_id = m.id AND m.id = $3 AND m.caso_id = $4
        RETURNING mc.id`,
        [cumplido, req.params.compId, req.params.medId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Compromiso no encontrado." });
    res.json(await obtenerMediacionesDeCaso(req.params.id));
});

const pdf = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { rows: medRows } = await pool.query(
        `SELECT m.id, m.fecha_mediacion AS "fechaMediacion", m.participantes, m.acuerdo, u.nombre AS mediador
         FROM mediaciones m JOIN usuarios u ON u.id = m.mediador_id
         WHERE m.id = $1 AND m.caso_id = $2`,
        [req.params.medId, req.params.id]
    );
    const mediacion = medRows[0];
    if (!mediacion) return res.status(404).json({ error: "Acta de mediación no encontrada." });

    const { rows: compromisos } = await pool.query(
        `SELECT descripcion, responsable, fecha_limite AS "fechaLimite", cumplido
         FROM mediacion_compromisos WHERE mediacion_id = $1 ORDER BY id`,
        [req.params.medId]
    );

    const { rows: casoRows } = await pool.query("SELECT folio, estudiante FROM casos WHERE id = $1", [req.params.id]);
    const { rows: colegioRows } = await pool.query("SELECT nombre, rbd FROM colegios WHERE id = $1", [req.colegioId]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Acta_Mediacion_${mediacion.id}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(14).fillColor("#1e3a8a").text(colegioRows[0]?.nombre || "Establecimiento Educacional", { align: "center" });
    if (colegioRows[0]?.rbd) doc.fontSize(9).fillColor("#64748b").text(`RBD: ${colegioRows[0].rbd}`, { align: "center" });
    doc.moveDown(0.8);
    doc.fillColor("#000000");
    doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor("#cbd5e1")
        .stroke();
    doc.moveDown(0.8);

    doc.fontSize(16).fillColor("#0f172a").text("Acta de Mediación Escolar", { underline: true });
    doc.fontSize(10).fillColor("#475569").text(`Caso ${casoRows[0]?.folio || ""} — ${casoRows[0]?.estudiante || ""}`);
    doc.fillColor("#000000").moveDown(0.6);

    doc.fontSize(10).fillColor("#475569").text("Fecha de la mediación:", { continued: true }).fillColor("#000000").text(` ${mediacion.fechaMediacion}`);
    doc.fontSize(10).fillColor("#475569").text("Mediador(a):", { continued: true }).fillColor("#000000").text(` ${mediacion.mediador}`);
    doc.fontSize(10).fillColor("#475569").text("Participantes:", { continued: true }).fillColor("#000000").text(` ${mediacion.participantes}`);
    doc.moveDown(0.6);

    doc.fontSize(12).fillColor("#1e3a8a").text("Acuerdo Alcanzado", { underline: true });
    doc.fontSize(10).fillColor("#000000").text(mediacion.acuerdo);
    doc.moveDown(0.6);

    doc.fontSize(12).fillColor("#1e3a8a").text("Compromisos", { underline: true });
    if (compromisos.length === 0) {
        doc.fontSize(10).fillColor("#000000").text("Sin compromisos registrados.");
    } else {
        compromisos.forEach((c) => {
            const marca = c.cumplido ? "[Cumplido]" : "[Pendiente]";
            doc.fontSize(9).fillColor(c.cumplido ? "#15803d" : "#475569").text(`${marca} `, { continued: true });
            doc.fillColor("#000000").text(
                `${c.descripcion}${c.responsable ? ` — Responsable: ${c.responsable}` : ""}${c.fechaLimite ? ` (plazo: ${c.fechaLimite})` : ""}`
            );
        });
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor("#64748b").text(
        "Este documento debe imprimirse y ser firmado físicamente por las partes y el mediador(a). Una vez firmado, debe digitalizarse y adjuntarse en el sistema como medio de verificación."
    );
    doc.moveDown(2.5);

    const anchoFirma = (doc.page.width - 100) / 2 - 10;
    const yFirma = doc.y;
    doc.moveTo(50, yFirma).lineTo(50 + anchoFirma, yFirma).strokeColor("#000000").stroke();
    doc.moveTo(doc.page.width - 50 - anchoFirma, yFirma).lineTo(doc.page.width - 50, yFirma).stroke();
    doc.fontSize(9).text("Firma Mediador(a)", 50, yFirma + 5, { width: anchoFirma, align: "center" });
    doc.fontSize(9).text("Firma Participante(s)", doc.page.width - 50 - anchoFirma, yFirma + 5, { width: anchoFirma, align: "center" });

    doc.end();
});

module.exports = { listar, crear, agregarCompromiso, actualizarCompromiso, obtenerMediacionesDeCaso, pdf };
