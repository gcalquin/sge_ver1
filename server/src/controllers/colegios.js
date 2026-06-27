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

const subirLogo = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No se recibió ninguna imagen." });

    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    const { rows } = await pool.query(`UPDATE colegios SET logo_data_uri = $1 WHERE id = $2 RETURNING *`, [
        dataUri,
        req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Colegio no encontrado." });
    res.json(rows[0]);
});

const MEDIDAS_CATALOGO_DEFAULT = ["Compromiso de Mediación", "Derivación Psicológica", "Plan Reparatorio"];

const crear = asyncHandler(async (req, res) => {
    const { nombre, comuna, direccion, rbd, sostenedorId } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO colegios (nombre, comuna, direccion, rbd, sostenedor_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [nombre, comuna || null, direccion || null, rbd || null, sostenedorId || null]
    );

    for (const medida of MEDIDAS_CATALOGO_DEFAULT) {
        await pool.query("INSERT INTO medidas_catalogo (colegio_id, nombre) VALUES ($1, $2)", [rows[0].id, medida]);
    }

    res.status(201).json(rows[0]);
});

const obtenerActual = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, nombre, comuna, direccion, rbd, sostenedor_id AS "sostenedorId", logo_data_uri AS "logoDataUri",
                dias_alerta_critico AS "diasAlertaCritico", dias_retencion_cerrados AS "diasRetencionCerrados",
                meses_alerta_reincidencia AS "mesesAlertaReincidencia"
         FROM colegios WHERE id = $1`,
        [req.colegioId]
    );
    res.json(rows[0]);
});

const actualizarConfiguracion = asyncHandler(async (req, res) => {
    const { diasAlertaCritico, diasRetencionCerrados, mesesAlertaReincidencia } = req.body;
    const { rows } = await pool.query(
        `UPDATE colegios
            SET dias_alerta_critico = COALESCE($1, dias_alerta_critico),
                dias_retencion_cerrados = COALESCE($2, dias_retencion_cerrados),
                meses_alerta_reincidencia = COALESCE($3, meses_alerta_reincidencia)
          WHERE id = $4
        RETURNING id, nombre, comuna, direccion, rbd, sostenedor_id AS "sostenedorId",
                  dias_alerta_critico AS "diasAlertaCritico", dias_retencion_cerrados AS "diasRetencionCerrados",
                  meses_alerta_reincidencia AS "mesesAlertaReincidencia"`,
        [diasAlertaCritico ?? null, diasRetencionCerrados ?? null, mesesAlertaReincidencia ?? null, req.colegioId]
    );
    res.json(rows[0]);
});

const MAPA_COLUMNAS = { sostenedorId: "sostenedor_id", logoDataUri: "logo_data_uri" };

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

module.exports = { listarPublico, listar, crear, actualizar, obtenerActual, actualizarConfiguracion, subirLogo };
