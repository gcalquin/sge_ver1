const PDFDocument = require("pdfkit");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { seccionTitulo, lineaDato, encabezadoInstitucional, piePaginas } = require("../utils/pdfHelpers");

async function casoPerteneceAlColegio(casoId, colegioId) {
    const { rows } = await pool.query("SELECT id FROM casos WHERE id = $1 AND colegio_id = $2", [casoId, colegioId]);
    return Boolean(rows[0]);
}

// Mismo criterio de confidencialidad reforzada usado en casos.js para
// diagnóstico PIE: admin, superadmin y Psicólogo PIE pueden ver notas/folio de
// derivaciones de salud mental marcadas como confidenciales.
function puedeVerConfidencial(usuario) {
    return Boolean(
        usuario && (usuario.rol === "admin" || usuario.rol === "superadmin" || usuario.especialidad === "Psicólogo PIE")
    );
}

function enmascarar(derivacion, usuario) {
    if (!derivacion.confidencial || puedeVerConfidencial(usuario)) return { ...derivacion, oculto: false };
    return { ...derivacion, notas: null, folioExterno: null, oculto: true };
}

const listar = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { rows } = await pool.query(
        `SELECT d.id, d.institucion, d.tipo, d.fecha_derivacion AS "fechaDerivacion", d.folio_externo AS "folioExterno",
                d.estado, d.notas, d.confidencial, u.nombre AS "registradoPor", d.created_at AS "creadoEn"
         FROM derivaciones d
         JOIN usuarios u ON u.id = d.registrado_por_id
         WHERE d.caso_id = $1
         ORDER BY d.id DESC`,
        [req.params.id]
    );
    res.json(rows.map((d) => enmascarar(d, req.usuario)));
});

const crear = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { institucion, tipo, fechaDerivacion, folioExterno, notas, confidencial } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO derivaciones (caso_id, institucion, tipo, fecha_derivacion, folio_externo, notas, registrado_por_id, confidencial)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, institucion, tipo, fecha_derivacion AS "fechaDerivacion", folio_externo AS "folioExterno", estado, notas, confidencial`,
        [
            req.params.id,
            institucion,
            tipo,
            fechaDerivacion,
            folioExterno || null,
            notas || null,
            req.usuario.id,
            Boolean(confidencial),
        ]
    );
    res.status(201).json(rows[0]);
});

const actualizar = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { estado, folioExterno, notas, confidencial } = req.body;
    const { rows } = await pool.query(
        `UPDATE derivaciones
            SET estado = COALESCE($1, estado), folio_externo = COALESCE($2, folio_externo), notas = COALESCE($3, notas),
                confidencial = COALESCE($4, confidencial)
          WHERE id = $5 AND caso_id = $6
        RETURNING id, institucion, tipo, fecha_derivacion AS "fechaDerivacion", folio_externo AS "folioExterno", estado, notas, confidencial`,
        [estado || null, folioExterno || null, notas || null, confidencial ?? null, req.params.derivacionId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Derivación no encontrada." });
    res.json(enmascarar(rows[0], req.usuario));
});

// Oficio de derivación: plantilla interna prellenada con los datos del caso y
// de la derivación, pensada para imprimir y adjuntar al notificar a la
// institución externa. No es el formulario oficial de Carabineros/PDI/OLN (no
// hay un formato único verificado entre instituciones): es un respaldo interno
// que documenta qué se envió, cuándo y por qué.
const pdf = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { rows: derRows } = await pool.query(
        `SELECT d.id, d.institucion, d.tipo, d.fecha_derivacion AS "fechaDerivacion", d.folio_externo AS "folioExterno",
                d.estado, d.notas, d.confidencial, u.nombre AS "registradoPor"
         FROM derivaciones d JOIN usuarios u ON u.id = d.registrado_por_id
         WHERE d.id = $1 AND d.caso_id = $2`,
        [req.params.derivacionId, req.params.id]
    );
    const derivacion = derRows[0];
    if (!derivacion) return res.status(404).json({ error: "Derivación no encontrada." });
    const derivacionVisible = enmascarar(derivacion, req.usuario);

    const { rows: casoRows } = await pool.query(
        "SELECT folio, estudiante, categoria, fecha_apertura AS \"fechaApertura\" FROM casos WHERE id = $1",
        [req.params.id]
    );
    const caso = casoRows[0];
    const { rows: colegioRows } = await pool.query("SELECT nombre, rbd FROM colegios WHERE id = $1", [req.colegioId]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Oficio_Derivacion_${derivacion.id}.pdf`);

    const doc = new PDFDocument({ margin: 50, bufferPages: true });
    doc.pipe(res);

    encabezadoInstitucional(doc, {
        colegioNombre: colegioRows[0]?.nombre,
        colegioRbd: colegioRows[0]?.rbd,
        titulo: "Oficio de Derivación",
        subtitulo: `Folio interno N.º ${derivacion.id}`,
    });

    seccionTitulo(doc, "Antecedentes del Caso");
    lineaDato(doc, "Caso:", `${caso?.folio || ""} — ${caso?.categoria || ""}`);
    lineaDato(doc, "Estudiante:", caso?.estudiante || "");
    lineaDato(doc, "Fecha de apertura del caso:", caso?.fechaApertura || "");

    seccionTitulo(doc, "Datos de la Derivación");
    lineaDato(doc, "Institución destinataria:", derivacion.institucion);
    lineaDato(doc, "Tipo:", derivacion.tipo);
    lineaDato(doc, "Fecha de envío:", derivacion.fechaDerivacion);
    lineaDato(doc, "Estado:", derivacion.estado);
    if (derivacionVisible.folioExterno) lineaDato(doc, "Folio de la institución externa:", derivacionVisible.folioExterno);
    lineaDato(doc, "Registrado por:", derivacion.registradoPor);

    seccionTitulo(doc, "Antecedentes Remitidos / Notas");
    if (derivacionVisible.oculto) {
        doc.fontSize(10).text("(Información confidencial — acceso restringido)");
    } else {
        doc.fontSize(10).text(derivacionVisible.notas || "Sin notas adicionales registradas.");
    }

    doc.moveDown(2);
    doc.fontSize(9)
        .fillColor("#64748b")
        .text(
            "Esta es una plantilla interna de respaldo: no reemplaza el formulario oficial que exija la institución destinataria (Carabineros, PDI, Fiscalía, OLN u otra)."
        );

    piePaginas(doc);
    doc.end();
});

module.exports = { listar, crear, actualizar, pdf, puedeVerConfidencial };
