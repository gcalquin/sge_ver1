const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

const listarPorUsuario = asyncHandler(async (req, res) => {
    const { rows: usuarioRows } = await pool.query("SELECT id FROM usuarios WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (!usuarioRows[0]) return res.status(404).json({ error: "Usuario no encontrado." });

    const { rows } = await pool.query(
        `SELECT id, nombre, institucion, fecha_obtencion AS "fechaObtencion", fecha_vencimiento AS "fechaVencimiento"
         FROM capacitaciones WHERE usuario_id = $1 AND colegio_id = $2 ORDER BY fecha_obtencion DESC`,
        [req.params.id, req.colegioId]
    );
    res.json(rows);
});

const crear = asyncHandler(async (req, res) => {
    const { rows: usuarioRows } = await pool.query("SELECT id FROM usuarios WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (!usuarioRows[0]) return res.status(404).json({ error: "Usuario no encontrado." });

    const { nombre, institucion, fechaObtencion, fechaVencimiento } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO capacitaciones (colegio_id, usuario_id, nombre, institucion, fecha_obtencion, fecha_vencimiento)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, nombre, institucion, fecha_obtencion AS "fechaObtencion", fecha_vencimiento AS "fechaVencimiento"`,
        [req.colegioId, req.params.id, nombre, institucion || null, fechaObtencion, fechaVencimiento || null]
    );
    res.status(201).json(rows[0]);
});

const eliminar = asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query("DELETE FROM capacitaciones WHERE id = $1 AND colegio_id = $2", [
        req.params.capId,
        req.colegioId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: "Capacitación no encontrada." });
    res.json({ ok: true });
});

const listarProximasAVencer = async (colegioId, dias = 60) => {
    const { rows } = await pool.query(
        `SELECT cap.id, cap.nombre, cap.fecha_vencimiento AS "fechaVencimiento", u.nombre AS usuario
         FROM capacitaciones cap
         JOIN usuarios u ON u.id = cap.usuario_id
         WHERE cap.colegio_id = $1 AND cap.fecha_vencimiento IS NOT NULL
           AND cap.fecha_vencimiento <= CURRENT_DATE + $2::int
         ORDER BY cap.fecha_vencimiento`,
        [colegioId, dias]
    );
    return rows;
};

module.exports = { listarPorUsuario, crear, eliminar, listarProximasAVencer };
