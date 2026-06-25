const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

async function casoPerteneceAlColegio(casoId, colegioId) {
    const { rows } = await pool.query("SELECT id FROM casos WHERE id = $1 AND colegio_id = $2", [casoId, colegioId]);
    return Boolean(rows[0]);
}

const listar = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { rows } = await pool.query(
        `SELECT d.id, d.institucion, d.tipo, d.fecha_derivacion AS "fechaDerivacion", d.folio_externo AS "folioExterno",
                d.estado, d.notas, u.nombre AS "registradoPor", d.created_at AS "creadoEn"
         FROM derivaciones d
         JOIN usuarios u ON u.id = d.registrado_por_id
         WHERE d.caso_id = $1
         ORDER BY d.id DESC`,
        [req.params.id]
    );
    res.json(rows);
});

const crear = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { institucion, tipo, fechaDerivacion, folioExterno, notas } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO derivaciones (caso_id, institucion, tipo, fecha_derivacion, folio_externo, notas, registrado_por_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, institucion, tipo, fecha_derivacion AS "fechaDerivacion", folio_externo AS "folioExterno", estado, notas`,
        [req.params.id, institucion, tipo, fechaDerivacion, folioExterno || null, notas || null, req.usuario.id]
    );
    res.status(201).json(rows[0]);
});

const actualizar = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { estado, folioExterno, notas } = req.body;
    const { rows } = await pool.query(
        `UPDATE derivaciones
            SET estado = COALESCE($1, estado), folio_externo = COALESCE($2, folio_externo), notas = COALESCE($3, notas)
          WHERE id = $4 AND caso_id = $5
        RETURNING id, institucion, tipo, fecha_derivacion AS "fechaDerivacion", folio_externo AS "folioExterno", estado, notas`,
        [estado || null, folioExterno || null, notas || null, req.params.derivacionId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Derivación no encontrada." });
    res.json(rows[0]);
});

module.exports = { listar, crear, actualizar };
