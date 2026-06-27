const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

const listar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT s.*, (SELECT count(*) FROM colegios c WHERE c.sostenedor_id = s.id) AS total_colegios
         FROM sostenedores s
         ORDER BY s.nombre`
    );
    res.json(rows);
});

const crear = asyncHandler(async (req, res) => {
    const { nombre, rut } = req.body;
    const { rows } = await pool.query(`INSERT INTO sostenedores (nombre, rut) VALUES ($1, $2) RETURNING *`, [
        nombre,
        rut || null,
    ]);
    res.status(201).json(rows[0]);
});

const actualizar = asyncHandler(async (req, res) => {
    const { nombre, rut } = req.body;
    const { rows } = await pool.query(
        `UPDATE sostenedores SET nombre = COALESCE($1, nombre), rut = COALESCE($2, rut) WHERE id = $3 RETURNING *`,
        [nombre, rut, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Sostenedor no encontrado." });
    res.json(rows[0]);
});

const eliminar = asyncHandler(async (req, res) => {
    const { rows: colegios } = await pool.query("SELECT count(*) FROM colegios WHERE sostenedor_id = $1", [
        req.params.id,
    ]);
    if (Number(colegios[0].count) > 0) {
        return res.status(409).json({ error: "No se puede eliminar: hay colegios asociados a este sostenedor." });
    }
    const { rowCount } = await pool.query("DELETE FROM sostenedores WHERE id = $1", [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Sostenedor no encontrado." });
    res.json({ ok: true });
});

module.exports = { listar, crear, actualizar, eliminar };
