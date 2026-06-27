const { logger } = require("../config/logger");

function notFound(req, res) {
    res.status(404).json({ error: "Recurso no encontrado." });
}

// El 4to parámetro (sin usar) es lo que le indica a Express que esto es un
// error-handling middleware en vez de uno normal: Express decide por aridad.
function errorHandler(err, req, res, _next) {
    logger.error({ err }, "Error no controlado");
    if (err.status) {
        return res.status(err.status).json({ error: err.message });
    }
    if (err.code === "23503") {
        return res.status(409).json({ error: "La operación viola una relación existente." });
    }
    res.status(500).json({ error: "Error interno del servidor." });
}

module.exports = { notFound, errorHandler };
