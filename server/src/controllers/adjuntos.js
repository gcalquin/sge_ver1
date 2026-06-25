const path = require("path");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { uploadDir } = require("../config/upload");

const subir = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo." });

    const { rows: bitRows } = await pool.query(
        `SELECT b.id FROM bitacora b JOIN casos c ON c.id = b.caso_id
         WHERE b.id = $1 AND b.caso_id = $2 AND c.colegio_id = $3`,
        [req.params.bitId, req.params.id, req.colegioId]
    );
    if (bitRows.length === 0) return res.status(404).json({ error: "Entrada de bitácora no encontrada." });

    const { rows } = await pool.query(
        `INSERT INTO adjuntos (caso_id, bitacora_id, nombre_orig, nombre_disco, mime, tamano, subido_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, nombre_orig AS nombre, mime, tamano`,
        [req.params.id, req.params.bitId, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.usuario.id]
    );

    res.status(201).json(rows[0]);
});

const listarPorBitacora = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT a.id, a.nombre_orig AS nombre, a.mime, a.tamano, a.created_at
         FROM adjuntos a
         JOIN casos c ON c.id = a.caso_id
         WHERE a.bitacora_id = $1 AND a.caso_id = $2 AND c.colegio_id = $3
         ORDER BY a.id`,
        [req.params.bitId, req.params.id, req.colegioId]
    );
    res.json(rows);
});

const descargar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT a.* FROM adjuntos a
         JOIN casos c ON c.id = a.caso_id
         WHERE a.id = $1 AND a.caso_id = $2 AND c.colegio_id = $3`,
        [req.params.adjId, req.params.id, req.colegioId]
    );
    const adjunto = rows[0];
    if (!adjunto) return res.status(404).json({ error: "Adjunto no encontrado." });

    res.download(path.join(uploadDir, adjunto.nombre_disco), adjunto.nombre_orig);
});

module.exports = { subir, listarPorBitacora, descargar };
