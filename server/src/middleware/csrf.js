const crypto = require("crypto");

function emitirCsrf(req, res) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(24).toString("hex");
    }
    res.json({ csrfToken: req.session.csrfToken });
}

// Logout es idempotente y de bajo riesgo: se exime de CSRF para que siempre
// pueda limpiar la sesión del cliente, incluso si su token quedó desincronizado
// (p. ej. tras un logout previo o una sesión expirada).
const RUTAS_EXENTAS = new Set(["/auth/logout"]);

function verificarCsrf(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (RUTAS_EXENTAS.has(req.path)) return next();

    const tokenHeader = req.headers["x-csrf-token"];
    if (!tokenHeader || tokenHeader !== req.session.csrfToken) {
        return res.status(403).json({ error: "Token CSRF inválido o ausente." });
    }
    next();
}

module.exports = { emitirCsrf, verificarCsrf };
