const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { slugify } = require("../utils/slugify");

const listar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, nombre, rol_institucional AS "rolInstitucional", rol AS "rolPermiso"
         FROM usuarios
         WHERE colegio_id = $1 AND activo = TRUE
         ORDER BY id`,
        [req.colegioId]
    );
    res.json(rows);
});

const crear = asyncHandler(async (req, res) => {
    const { nombre, rol, rolPermiso, clave } = req.body;

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
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, nombre, rol_institucional AS "rolInstitucional", rol AS "rolPermiso"`,
        [req.colegioId, username, nombre.trim(), rol.trim(), hash, rolPermiso]
    );

    res.status(201).json(rows[0]);
});

const eliminar = asyncHandler(async (req, res) => {
    if (Number(req.params.id) === req.usuario.id) {
        return res.status(400).json({ error: "No puedes eliminar tu propia cuenta." });
    }

    const { rows: objetivo } = await pool.query("SELECT rol FROM usuarios WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (!objetivo[0]) return res.status(404).json({ error: "Usuario no encontrado." });

    if (objetivo[0].rol === "admin") {
        const { rows: admins } = await pool.query(
            "SELECT count(*) FROM usuarios WHERE colegio_id = $1 AND rol = 'admin' AND activo = TRUE",
            [req.colegioId]
        );
        if (Number(admins[0].count) <= 1) {
            return res.status(409).json({ error: "No se puede eliminar al último administrador del colegio." });
        }
    }

    await pool.query("DELETE FROM usuarios WHERE id = $1 AND colegio_id = $2", [req.params.id, req.colegioId]);
    res.json({ ok: true });
});

module.exports = { listar, crear, eliminar };
