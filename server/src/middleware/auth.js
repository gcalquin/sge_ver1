function getColegioEfectivo(req) {
    if (!req.usuario || !req.session) return null;
    if (req.usuario.rol === "superadmin") return req.session.contextoColegioId || null;
    return req.usuario.colegioId;
}

function requireAuth(req, res, next) {
    if (!req.session.usuario) {
        return res.status(401).json({ error: "No autenticado." });
    }
    req.usuario = req.session.usuario;
    next();
}

function requireRol(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.usuario.rol)) {
            return res.status(403).json({ error: "No tienes permisos para esta acción." });
        }
        next();
    };
}

function requireEscritura(req, res, next) {
    if (req.usuario.rol === "invitado") {
        return res.status(403).json({ error: "El usuario invitado solo tiene acceso de lectura." });
    }
    next();
}

function requireColegioContexto(req, res, next) {
    const colegioId = getColegioEfectivo(req);
    if (!colegioId) {
        return res.status(400).json({ error: "Debes seleccionar un colegio para operar." });
    }
    req.colegioId = colegioId;
    next();
}

module.exports = { getColegioEfectivo, requireAuth, requireRol, requireEscritura, requireColegioContexto };
