const { pool } = require("../config/db");
const { logger } = require("../config/logger");
const { getColegioEfectivo } = require("./auth");

function auditar(accion, detalleFn) {
    return (req, res, next) => {
        res.on("finish", () => {
            try {
                if (res.statusCode < 200 || res.statusCode >= 400) return;
                const detalle = detalleFn ? detalleFn(req, res) : {};
                pool
                    .query(
                        `INSERT INTO auditoria (usuario_id, colegio_id, accion, detalle, ip)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [req.usuario?.id || null, getColegioEfectivo(req), accion, JSON.stringify(detalle), req.ip]
                    )
                    .catch((err) => logger.error({ err }, "No se pudo registrar auditoría"));
            } catch (err) {
                logger.error({ err }, "No se pudo registrar auditoría");
            }
        });
        next();
    };
}

module.exports = { auditar };
