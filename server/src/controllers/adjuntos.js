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

async function insertarAdjuntos({ files, casoId, columnaPadre, idPadre, usuarioId }) {
    const insertados = [];
    for (const file of files) {
        const { rows } = await pool.query(
            `INSERT INTO adjuntos (caso_id, ${columnaPadre}, nombre_orig, nombre_disco, mime, tamano, subido_por)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, nombre_orig AS nombre, mime, tamano`,
            [casoId, idPadre, file.originalname, file.filename, file.mimetype, file.size, usuarioId]
        );
        insertados.push(rows[0]);
    }
    return insertados;
}

// ===================== medios de verificación de una derivación =====================

const subirParaDerivacion = asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No se recibió ningún archivo." });

    const { rows } = await pool.query(
        `SELECT d.id FROM derivaciones d JOIN casos c ON c.id = d.caso_id
         WHERE d.id = $1 AND d.caso_id = $2 AND c.colegio_id = $3`,
        [req.params.derivacionId, req.params.id, req.colegioId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Derivación no encontrada." });

    const insertados = await insertarAdjuntos({
        files: req.files,
        casoId: req.params.id,
        columnaPadre: "derivacion_id",
        idPadre: req.params.derivacionId,
        usuarioId: req.usuario.id,
    });
    res.status(201).json(insertados);
});

const listarPorDerivacion = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT a.id, a.nombre_orig AS nombre, a.mime, a.tamano, a.created_at
         FROM adjuntos a
         JOIN derivaciones d ON d.id = a.derivacion_id
         JOIN casos c ON c.id = d.caso_id
         WHERE a.derivacion_id = $1 AND d.caso_id = $2 AND c.colegio_id = $3
         ORDER BY a.id`,
        [req.params.derivacionId, req.params.id, req.colegioId]
    );
    res.json(rows);
});

// ===================== medios de verificación de una acta de mediación =====================

const subirParaMediacion = asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No se recibió ningún archivo." });

    const { rows } = await pool.query(
        `SELECT m.id FROM mediaciones m JOIN casos c ON c.id = m.caso_id
         WHERE m.id = $1 AND m.caso_id = $2 AND c.colegio_id = $3`,
        [req.params.medId, req.params.id, req.colegioId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Acta de mediación no encontrada." });

    const insertados = await insertarAdjuntos({
        files: req.files,
        casoId: req.params.id,
        columnaPadre: "mediacion_id",
        idPadre: req.params.medId,
        usuarioId: req.usuario.id,
    });
    res.status(201).json(insertados);
});

const listarPorMediacion = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT a.id, a.nombre_orig AS nombre, a.mime, a.tamano, a.created_at
         FROM adjuntos a
         JOIN mediaciones m ON m.id = a.mediacion_id
         JOIN casos c ON c.id = m.caso_id
         WHERE a.mediacion_id = $1 AND m.caso_id = $2 AND c.colegio_id = $3
         ORDER BY a.id`,
        [req.params.medId, req.params.id, req.colegioId]
    );
    res.json(rows);
});

// ===================== medios de verificación de una actividad de convivencia =====================
// Las actividades no cuelgan de un caso, por lo que se validan y descargan
// directamente contra el colegio en sesión en lugar de contra un caso.

const subirParaActividad = asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No se recibió ningún archivo." });

    const { rows } = await pool.query("SELECT id FROM actividades_convivencia WHERE id = $1 AND colegio_id = $2", [
        req.params.actId,
        req.colegioId,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: "Actividad no encontrada." });

    const insertados = [];
    for (const file of req.files) {
        const { rows: ins } = await pool.query(
            `INSERT INTO adjuntos (actividad_id, nombre_orig, nombre_disco, mime, tamano, subido_por)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, nombre_orig AS nombre, mime, tamano`,
            [req.params.actId, file.originalname, file.filename, file.mimetype, file.size, req.usuario.id]
        );
        insertados.push(ins[0]);
    }
    res.status(201).json(insertados);
});

const listarPorActividad = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT a.id, a.nombre_orig AS nombre, a.mime, a.tamano, a.created_at
         FROM adjuntos a
         JOIN actividades_convivencia ac ON ac.id = a.actividad_id
         WHERE a.actividad_id = $1 AND ac.colegio_id = $2
         ORDER BY a.id`,
        [req.params.actId, req.colegioId]
    );
    res.json(rows);
});

const descargarDeActividad = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT a.* FROM adjuntos a
         JOIN actividades_convivencia ac ON ac.id = a.actividad_id
         WHERE a.id = $1 AND a.actividad_id = $2 AND ac.colegio_id = $3`,
        [req.params.adjId, req.params.actId, req.colegioId]
    );
    const adjunto = rows[0];
    if (!adjunto) return res.status(404).json({ error: "Adjunto no encontrado." });

    res.download(path.join(uploadDir, adjunto.nombre_disco), adjunto.nombre_orig);
});

module.exports = {
    subir,
    listarPorBitacora,
    descargar,
    subirParaDerivacion,
    listarPorDerivacion,
    subirParaMediacion,
    listarPorMediacion,
    subirParaActividad,
    listarPorActividad,
    descargarDeActividad,
};
