const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { tsQueryBusqueda } = require("../utils/search");

const listar = asyncHandler(async (req, res) => {
    const { search = "", soloActivos = "true" } = req.query;

    const condiciones = ["colegio_id = $1"];
    const valores = [req.colegioId];

    if (soloActivos !== "false") {
        condiciones.push("activo = TRUE");
    }
    if (search) {
        valores.push(search);
        const tsquery = tsQueryBusqueda(`$${valores.length}`);
        condiciones.push(`to_tsvector('spanish', inmutable_unaccent(nombre)) @@ to_tsquery('spanish', ${tsquery})`);
    }

    const { rows } = await pool.query(
        `SELECT id, nombre, curso, rut, activo FROM estudiantes WHERE ${condiciones.join(" AND ")} ORDER BY nombre LIMIT 20`,
        valores
    );
    res.json(rows);
});

const crear = asyncHandler(async (req, res) => {
    const { nombre, curso, rut } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO estudiantes (colegio_id, nombre, curso, rut) VALUES ($1, $2, $3, $4)
         RETURNING id, nombre, curso, rut, activo`,
        [req.colegioId, nombre, curso || null, rut || null]
    );
    res.status(201).json(rows[0]);
});

const actualizar = asyncHandler(async (req, res) => {
    const { nombre, curso, rut, activo } = req.body;
    const { rows } = await pool.query(
        `UPDATE estudiantes
            SET nombre = COALESCE($1, nombre), curso = COALESCE($2, curso), rut = COALESCE($3, rut),
                activo = COALESCE($4, activo)
          WHERE id = $5 AND colegio_id = $6
        RETURNING id, nombre, curso, rut, activo`,
        [nombre || null, curso || null, rut || null, activo ?? null, req.params.id, req.colegioId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Estudiante no encontrado." });
    res.json(rows[0]);
});

module.exports = { listar, crear, actualizar };
