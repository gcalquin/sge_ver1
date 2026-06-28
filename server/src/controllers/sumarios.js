const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { crearCasoInterno, getCasoDetalle } = require("./casos");
const { CATEGORIA_SUMARIO } = require("../validation/constants");

// Confirma que el id de la URL es efectivamente un sumario (ambito='Funcionario')
// antes de delegar en las funciones genéricas de casosController (bitacora,
// pasos-protocolo, pdf), que de otro modo operarían igual sobre cualquier caso
// estudiantil del colegio — confuso para la auditoría y para la intención de
// esta ruta, aunque no sea una fuga de privilegios real (un admin ya puede
// editar casos estudiantiles por la ruta general).
const verificarEsSumario = asyncHandler(async (req, res, next) => {
    const { rows } = await pool.query("SELECT id FROM casos WHERE id = $1 AND colegio_id = $2 AND ambito = 'Funcionario'", [
        req.params.id,
        req.colegioId,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Sumario no encontrado." });
    next();
});

// Sumarios a funcionarios (Ley Karin): reutiliza el motor completo de "casos"
// (bitácora con hash-chain, pasos de protocolo, PDF de expediente) vía
// crearCasoInterno/getCasoDetalle de casosController, marcando ambito='Funcionario'
// y una categoría fija que nunca se ofrece en el selector público de /casos.
// La confidencialidad se cierra en dos capas: esta ruta exige admin/superadmin
// (ver routes/sumarios.js) y getCasoDetalle trata cualquier caso con
// ambito='Funcionario' como 404 para quien no sea admin/superadmin.

const listar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, folio, estudiante AS "funcionarioInvolucrado", fecha_apertura AS "fechaApertura", estado
         FROM casos WHERE colegio_id = $1 AND ambito = 'Funcionario' ORDER BY id DESC`,
        [req.colegioId]
    );
    res.json(rows);
});

const obtener = asyncHandler(async (req, res) => {
    const caso = await getCasoDetalle(req.colegioId, req.params.id, req.usuario);
    if (!caso || caso.ambito !== "Funcionario") return res.status(404).json({ error: "Sumario no encontrado." });
    res.json(caso);
});

const crear = asyncHandler(async (req, res) => {
    const { funcionarioInvolucrado, fechaApertura, descripcion, responsableId } = req.body;

    const { rows: respRows } = await pool.query(
        "SELECT id FROM usuarios WHERE id = $1 AND colegio_id = $2 AND rol IN ('admin','superadmin') AND activo = TRUE",
        [responsableId, req.colegioId]
    );
    if (respRows.length === 0) {
        return res.status(400).json({ error: "Responsable inválido (debe ser administrador o superadministrador)." });
    }

    const casoId = await crearCasoInterno({
        colegioId: req.colegioId,
        usuario: req.usuario,
        ambito: "Funcionario",
        datos: {
            estudiante: funcionarioInvolucrado,
            categoria: CATEGORIA_SUMARIO,
            fechaApertura,
            descripcion,
            responsableId,
        },
    });

    res.status(201).json(await getCasoDetalle(req.colegioId, casoId, req.usuario));
});

module.exports = { listar, obtener, crear, verificarEsSumario };
