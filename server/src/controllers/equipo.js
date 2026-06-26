const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { slugify } = require("../utils/slugify");
const { calcularHash } = require("../utils/hash");

const listar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, username, nombre, rol_institucional AS "rolInstitucional", rol AS "rolPermiso", especialidad, email
         FROM usuarios
         WHERE colegio_id = $1 AND activo = TRUE
         ORDER BY id`,
        [req.colegioId]
    );
    res.json(rows);
});

async function usernameDisponible(colegioId, username, excluirId) {
    const { rows } = await pool.query(
        "SELECT 1 FROM usuarios WHERE colegio_id = $1 AND lower(username) = lower($2) AND id != $3",
        [colegioId, username, excluirId || 0]
    );
    return rows.length === 0;
}

const crear = asyncHandler(async (req, res) => {
    const { nombre, rol, rolPermiso, especialidad, email, clave, username: usernameDeseado } = req.body;

    let username;
    if (usernameDeseado) {
        if (!(await usernameDisponible(req.colegioId, usernameDeseado))) {
            return res.status(409).json({ error: "Ese nombre de usuario ya está en uso en este colegio." });
        }
        username = usernameDeseado.trim();
    } else {
        const base = slugify(nombre);
        username = base;
        let sufijo = 1;
        while (!(await usernameDisponible(req.colegioId, username))) {
            sufijo += 1;
            username = `${base}${sufijo}`;
        }
    }

    const hash = await bcrypt.hash(clave, 10);
    const { rows } = await pool.query(
        `INSERT INTO usuarios (colegio_id, username, nombre, rol_institucional, password_hash, rol, especialidad, email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, username, nombre, rol_institucional AS "rolInstitucional", rol AS "rolPermiso", especialidad, email`,
        [req.colegioId, username, nombre.trim(), rol.trim(), hash, rolPermiso, especialidad || null, email || null]
    );

    res.status(201).json(rows[0]);
});

async function bloqueaUltimoAdmin(colegioId, usuarioId, rolPermisoNuevo) {
    if (rolPermisoNuevo === "admin") return false;
    const { rows: objetivo } = await pool.query("SELECT rol FROM usuarios WHERE id = $1 AND colegio_id = $2", [
        usuarioId,
        colegioId,
    ]);
    if (!objetivo[0] || objetivo[0].rol !== "admin") return false;
    const { rows: admins } = await pool.query(
        "SELECT count(*) FROM usuarios WHERE colegio_id = $1 AND rol = 'admin' AND activo = TRUE",
        [colegioId]
    );
    return Number(admins[0].count) <= 1;
}

const actualizar = asyncHandler(async (req, res) => {
    const { nombre, rol, rolPermiso, especialidad, email, username: usernameDeseado, clave } = req.body;

    const { rows: existente } = await pool.query("SELECT * FROM usuarios WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (!existente[0]) return res.status(404).json({ error: "Usuario no encontrado." });

    if (await bloqueaUltimoAdmin(req.colegioId, req.params.id, rolPermiso)) {
        return res.status(409).json({ error: "No se puede quitar el rol de administrador al último administrador del colegio." });
    }

    let username = existente[0].username;
    if (usernameDeseado.trim().toLowerCase() !== username.toLowerCase()) {
        if (!(await usernameDisponible(req.colegioId, usernameDeseado, req.params.id))) {
            return res.status(409).json({ error: "Ese nombre de usuario ya está en uso en este colegio." });
        }
        username = usernameDeseado.trim();
    }

    const passwordHash = clave ? await bcrypt.hash(clave, 10) : existente[0].password_hash;

    const { rows } = await pool.query(
        `UPDATE usuarios
            SET nombre = $1, rol_institucional = $2, rol = $3, especialidad = $4, email = $5,
                username = $6, password_hash = $7
          WHERE id = $8 AND colegio_id = $9
        RETURNING id, username, nombre, rol_institucional AS "rolInstitucional", rol AS "rolPermiso", especialidad, email`,
        [nombre.trim(), rol.trim(), rolPermiso, especialidad || null, email || null, username, passwordHash, req.params.id, req.colegioId]
    );

    res.json(rows[0]);
});

const eliminar = asyncHandler(async (req, res) => {
    if (Number(req.params.id) === req.usuario.id) {
        return res.status(400).json({ error: "No puedes eliminar tu propia cuenta." });
    }

    const { rows: objetivo } = await pool.query("SELECT id, nombre, rol FROM usuarios WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    if (!objetivo[0]) return res.status(404).json({ error: "Usuario no encontrado." });

    if (objetivo[0].rol === "admin") {
        const { rows: admins } = await pool.query(
            "SELECT count(*) FROM usuarios WHERE colegio_id = $1 AND rol = 'admin' AND activo = TRUE",
            [req.colegioId]
        );
        if (Number(admins[0].count) <= 1) {
            return res.status(409).json({ error: "No se puede eliminar al último administrador del colegio." });
        }
    }

    // FK responsable_id no tiene ON DELETE; cualquier caso (incluso Cerrado) bloquearía el DELETE,
    // por eso se reasignan todos, no solo los activos.
    const { rows: casosAsignados } = await pool.query(
        `SELECT id, folio FROM casos WHERE responsable_id = $1 AND colegio_id = $2`,
        [req.params.id, req.colegioId]
    );

    if (casosAsignados.length > 0) {
        const nuevoResponsableId = req.body?.nuevoResponsableId;
        if (!nuevoResponsableId) {
            return res.status(409).json({
                error: "Este usuario tiene casos activos asignados. Debes reasignarlos a otra persona antes de eliminarlo.",
                requiereReasignacion: true,
                casosAsignados,
            });
        }

        const { rows: nuevoResponsable } = await pool.query(
            `SELECT id, nombre FROM usuarios
             WHERE id = $1 AND colegio_id = $2 AND activo = TRUE AND rol IN ('admin', 'funcionario') AND id != $3`,
            [nuevoResponsableId, req.colegioId, req.params.id]
        );
        if (!nuevoResponsable[0]) {
            return res.status(400).json({ error: "El responsable de reemplazo no es válido." });
        }

        for (const caso of casosAsignados) {
            await pool.query("UPDATE casos SET responsable_id = $1 WHERE id = $2", [nuevoResponsableId, caso.id]);

            const { rows: ultimaRows } = await pool.query(
                "SELECT hash FROM bitacora WHERE caso_id = $1 ORDER BY id DESC LIMIT 1",
                [caso.id]
            );
            const hashAnterior = ultimaRows[0]?.hash || null;
            const fecha = new Date().toISOString().slice(0, 10);
            const contenido = `Reasignación automática: el caso pasa de ${objetivo[0].nombre} a ${nuevoResponsable[0].nombre} por baja del usuario responsable anterior.`;
            const hash = calcularHash({ contenido, fecha, operadorId: req.usuario.id, hashAnterior });

            await pool.query(
                `INSERT INTO bitacora (caso_id, tipo, fecha_ejecucion, operador_id, contenido, hash, hash_anterior)
                 VALUES ($1, 'Seguimiento', $2, $3, $4, $5, $6)`,
                [caso.id, fecha, req.usuario.id, contenido, hash, hashAnterior]
            );
        }
    }

    try {
        await pool.query("DELETE FROM usuarios WHERE id = $1 AND colegio_id = $2", [req.params.id, req.colegioId]);
    } catch (err) {
        if (err.code === "23503") {
            return res.status(409).json({
                error: "No se puede eliminar: el usuario tiene historial registrado (entrevistas, firmas, derivaciones u otras acciones) en el sistema.",
            });
        }
        throw err;
    }
    res.json({ ok: true });
});

module.exports = { listar, crear, actualizar, eliminar };
