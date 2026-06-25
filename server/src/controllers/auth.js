const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

function usuarioSesion(fila) {
    return {
        id: fila.id,
        nombre: fila.nombre,
        rol: fila.rol,
        rolInstitucional: fila.rol_institucional,
        colegioId: fila.colegio_id,
    };
}

const login = asyncHandler(async (req, res) => {
    const { ambito, username, password } = req.body;

    let fila;
    if (ambito === "central") {
        const { rows } = await pool.query(
            `SELECT * FROM usuarios WHERE colegio_id IS NULL AND activo = TRUE AND lower(username) = lower($1)`,
            [username]
        );
        fila = rows[0];
    } else {
        const { rows: colegioRows } = await pool.query("SELECT activo FROM colegios WHERE id = $1", [ambito]);
        if (!colegioRows[0] || !colegioRows[0].activo) {
            return res.status(401).json({ error: "Colegio inválido o inactivo." });
        }
        const { rows } = await pool.query(
            `SELECT * FROM usuarios WHERE colegio_id = $1 AND activo = TRUE AND lower(username) = lower($2)`,
            [ambito, username]
        );
        fila = rows[0];
    }

    if (!fila || !(await bcrypt.compare(password, fila.password_hash))) {
        return res.status(401).json({ error: "Credenciales incorrectas." });
    }

    const usuario = usuarioSesion(fila);

    req.session.regenerate((err) => {
        if (err) throw err;
        req.session.usuario = usuario;
        req.session.contextoColegioId = null;
        // El regenerate descarta el csrfToken previo (atado a la sesión anónima);
        // se emite uno nuevo para que el cliente pueda seguir operando sin re-pedirlo.
        req.session.csrfToken = crypto.randomBytes(24).toString("hex");
        req.session.save((errSave) => {
            if (errSave) throw errSave;
            res.json({ usuario, csrfToken: req.session.csrfToken });
        });
    });
});

const logout = (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ ok: true });
    });
};

const me = asyncHandler(async (req, res) => {
    let colegioActual = null;
    const colegioId = req.usuario.rol === "superadmin" ? req.session.contextoColegioId : req.usuario.colegioId;
    if (colegioId) {
        const { rows } = await pool.query("SELECT id, nombre FROM colegios WHERE id = $1", [colegioId]);
        colegioActual = rows[0] || null;
    }
    res.json({ usuario: req.usuario, colegioActual });
});

const cambiarPassword = asyncHandler(async (req, res) => {
    const { actual, nueva } = req.body;
    const { rows } = await pool.query("SELECT password_hash FROM usuarios WHERE id = $1", [req.usuario.id]);
    const fila = rows[0];
    if (!fila || !(await bcrypt.compare(actual, fila.password_hash))) {
        return res.status(401).json({ error: "La contraseña actual no es correcta." });
    }
    const hash = await bcrypt.hash(nueva, 10);
    await pool.query("UPDATE usuarios SET password_hash = $1 WHERE id = $2", [hash, req.usuario.id]);
    res.json({ ok: true });
});

const entrarContexto = asyncHandler(async (req, res) => {
    const { colegioId } = req.body;
    const { rows } = await pool.query("SELECT id, nombre, activo FROM colegios WHERE id = $1", [colegioId]);
    const colegio = rows[0];
    if (!colegio || !colegio.activo) {
        return res.status(404).json({ error: "Colegio no encontrado o inactivo." });
    }
    req.session.contextoColegioId = colegio.id;
    res.json({ ok: true, colegioActual: { id: colegio.id, nombre: colegio.nombre } });
});

const salirContexto = (req, res) => {
    req.session.contextoColegioId = null;
    res.json({ ok: true });
};

module.exports = { login, logout, me, cambiarPassword, entrarContexto, salirContexto };
