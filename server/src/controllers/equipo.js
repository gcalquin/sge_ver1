const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { slugify } = require("../utils/slugify");

const listar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, nombre, rol_institucional AS rol
         FROM usuarios
         WHERE colegio_id = $1 AND rol = 'funcionario' AND activo = TRUE
         ORDER BY id`,
        [req.colegioId]
    );
    res.json(rows);
});

const crear = asyncHandler(async (req, res) => {
    const { nombre, rol, clave } = req.body;

    const base = slugify(nombre);
    let username = base;
    let sufijo = 1;
    while (
        (await pool.query("SELECT 1 FROM usuarios WHERE colegio_id = $1 AND lower(username) = lower($2)", [
            req.colegioId,
            username,
        ])).rows.length > 0
    ) {
        sufijo += 1;
        username = `${base}${sufijo}`;
    }

    const hash = await bcrypt.hash(clave, 10);
    const { rows } = await pool.query(
        `INSERT INTO usuarios (colegio_id, username, nombre, rol_institucional, password_hash, rol)
         VALUES ($1, $2, $3, $4, $5, 'funcionario')
         RETURNING id, nombre, rol_institucional AS rol`,
        [req.colegioId, username, nombre.trim(), rol.trim(), hash]
    );

    res.status(201).json(rows[0]);
});

const eliminar = asyncHandler(async (req, res) => {
    const { rowCount } = await pool.query(
        "DELETE FROM usuarios WHERE id = $1 AND colegio_id = $2 AND rol = 'funcionario'",
        [req.params.id, req.colegioId]
    );
    if (rowCount === 0) return res.status(404).json({ error: "Funcionario no encontrado." });
    res.json({ ok: true });
});

module.exports = { listar, crear, eliminar };
