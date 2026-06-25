const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

const listarPublico = asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT id, nombre FROM colegios WHERE activo = TRUE ORDER BY nombre");
    res.json(rows);
});

const listar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT c.*, s.nombre AS sostenedor_nombre,
                (SELECT count(*) FROM usuarios u WHERE u.colegio_id = c.id) AS total_usuarios,
                (SELECT count(*) FROM casos ca WHERE ca.colegio_id = c.id) AS total_casos
         FROM colegios c
         LEFT JOIN sostenedores s ON s.id = c.sostenedor_id
         ORDER BY c.nombre`
    );
    res.json(rows);
});

const crear = asyncHandler(async (req, res) => {
    const { nombre, comuna, direccion, rbd, sostenedorId } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO colegios (nombre, comuna, direccion, rbd, sostenedor_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [nombre, comuna || null, direccion || null, rbd || null, sostenedorId || null]
    );
    res.status(201).json(rows[0]);
});

const obtenerActual = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, nombre, comuna, direccion, rbd, sostenedor_id AS "sostenedorId",
                dias_alerta_critico AS "diasAlertaCritico", dias_retencion_cerrados AS "diasRetencionCerrados"
         FROM colegios WHERE id = $1`,
        [req.colegioId]
    );
    res.json(rows[0]);
});

const actualizarConfiguracion = asyncHandler(async (req, res) => {
    const { diasAlertaCritico, diasRetencionCerrados } = req.body;
    const { rows } = await pool.query(
        `UPDATE colegios
            SET dias_alerta_critico = COALESCE($1, dias_alerta_critico),
                dias_retencion_cerrados = COALESCE($2, dias_retencion_cerrados)
          WHERE id = $3
        RETURNING id, nombre, comuna, direccion, rbd, sostenedor_id AS "sostenedorId",
                  dias_alerta_critico AS "diasAlertaCritico", dias_retencion_cerrados AS "diasRetencionCerrados"`,
        [diasAlertaCritico ?? null, diasRetencionCerrados ?? null, req.colegioId]
    );
    res.json(rows[0]);
});

const MAPA_COLUMNAS = { sostenedorId: "sostenedor_id" };

const actualizar = asyncHandler(async (req, res) => {
    const campos = req.body;
    const claves = Object.keys(campos);
    if (claves.length === 0) return res.status(400).json({ error: "No hay campos para actualizar." });

    const sets = claves.map((clave, i) => `${MAPA_COLUMNAS[clave] || clave} = $${i + 1}`);
    const valores = claves.map((clave) => campos[clave]);

    const { rows } = await pool.query(
        `UPDATE colegios SET ${sets.join(", ")} WHERE id = $${valores.length + 1} RETURNING *`,
        [...valores, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Colegio no encontrado." });
    res.json(rows[0]);
});

module.exports = { listarPublico, listar, crear, actualizar, obtenerActual, actualizarConfiguracion };
