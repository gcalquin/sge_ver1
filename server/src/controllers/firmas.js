const crypto = require("crypto");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

async function casoPerteneceAlColegio(casoId, colegioId) {
    const { rows } = await pool.query("SELECT id FROM casos WHERE id = $1 AND colegio_id = $2", [casoId, colegioId]);
    return Boolean(rows[0]);
}

const listar = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { rows } = await pool.query(
        `SELECT id, tipo_documento AS "tipoDocumento", nombre_firmante AS "nombreFirmante",
                rut_firmante AS "rutFirmante", fecha_firma AS "fechaFirma", hash_documento AS "hashDocumento"
         FROM firmas WHERE caso_id = $1 ORDER BY id DESC`,
        [req.params.id]
    );
    res.json(rows);
});

const crear = asyncHandler(async (req, res) => {
    if (!(await casoPerteneceAlColegio(req.params.id, req.colegioId))) {
        return res.status(404).json({ error: "Caso no encontrado." });
    }
    const { bitacoraId, tipoDocumento, nombreFirmante, rutFirmante } = req.body;
    const fechaFirma = new Date().toISOString();
    const hashDocumento = crypto
        .createHash("sha256")
        .update(`${req.params.id}|${tipoDocumento}|${nombreFirmante}|${rutFirmante}|${fechaFirma}`)
        .digest("hex");

    const { rows } = await pool.query(
        `INSERT INTO firmas (caso_id, bitacora_id, tipo_documento, nombre_firmante, rut_firmante, ip_origen, hash_documento)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, tipo_documento AS "tipoDocumento", nombre_firmante AS "nombreFirmante",
                   rut_firmante AS "rutFirmante", fecha_firma AS "fechaFirma", hash_documento AS "hashDocumento"`,
        [req.params.id, bitacoraId || null, tipoDocumento, nombreFirmante.trim(), rutFirmante.trim(), req.ip, hashDocumento]
    );
    res.status(201).json(rows[0]);
});

module.exports = { listar, crear };
