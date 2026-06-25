const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

const listar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT cpj.id, cpj.curso, cpj.profesor_jefe_id AS "profesorJefeId", u.nombre AS "profesorJefeNombre"
         FROM cursos_profesor_jefe cpj
         JOIN usuarios u ON u.id = cpj.profesor_jefe_id
         WHERE cpj.colegio_id = $1
         ORDER BY cpj.curso`,
        [req.colegioId]
    );
    res.json(rows);
});

const crear = asyncHandler(async (req, res) => {
    const { curso, profesorJefeId } = req.body;
    const { rows: profesor } = await pool.query(
        "SELECT id FROM usuarios WHERE id = $1 AND colegio_id = $2 AND activo = TRUE",
        [profesorJefeId, req.colegioId]
    );
    if (!profesor[0]) return res.status(400).json({ error: "Profesor jefe inválido." });

    const { rows } = await pool.query(
        `INSERT INTO cursos_profesor_jefe (colegio_id, curso, profesor_jefe_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (colegio_id, curso) DO UPDATE SET profesor_jefe_id = EXCLUDED.profesor_jefe_id
         RETURNING id, curso, profesor_jefe_id AS "profesorJefeId"`,
        [req.colegioId, curso.trim(), profesorJefeId]
    );
    res.status(201).json(rows[0]);
});

const eliminar = asyncHandler(async (req, res) => {
    await pool.query("DELETE FROM cursos_profesor_jefe WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    res.json({ ok: true });
});

module.exports = { listar, crear, eliminar };
