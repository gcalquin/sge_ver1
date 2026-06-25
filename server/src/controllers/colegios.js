const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

const listarPublico = asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT id, nombre FROM colegios WHERE activo = TRUE ORDER BY nombre");
    res.json(rows);
});

const listar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT c.*,
                (SELECT count(*) FROM usuarios u WHERE u.colegio_id = c.id) AS total_usuarios,
                (SELECT count(*) FROM casos ca WHERE ca.colegio_id = c.id) AS total_casos
         FROM colegios c
         ORDER BY c.nombre`
    );
    res.json(rows);
});

const crear = asyncHandler(async (req, res) => {
    const { nombre, comuna, direccion } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO colegios (nombre, comuna, direccion) VALUES ($1, $2, $3) RETURNING *`,
        [nombre, comuna || null, direccion || null]
    );
    res.status(201).json(rows[0]);
});

const actualizar = asyncHandler(async (req, res) => {
    const campos = req.body;
    const claves = Object.keys(campos);
    if (claves.length === 0) return res.status(400).json({ error: "No hay campos para actualizar." });

    const sets = claves.map((clave, i) => `${clave === "nombre" ? "nombre" : clave} = $${i + 1}`);
    const valores = claves.map((clave) => campos[clave]);

    const { rows } = await pool.query(
        `UPDATE colegios SET ${sets.join(", ")} WHERE id = $${valores.length + 1} RETURNING *`,
        [...valores, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Colegio no encontrado." });
    res.json(rows[0]);
});

module.exports = { listarPublico, listar, crear, actualizar };
