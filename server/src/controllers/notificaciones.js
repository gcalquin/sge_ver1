const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");
const { enviarCorreo } = require("../config/mailer");

const enviarAlertas = asyncHandler(async (req, res) => {
    const { rows: colegioRows } = await pool.query("SELECT dias_alerta_critico FROM colegios WHERE id = $1", [
        req.colegioId,
    ]);
    const diasAlertaCritico = colegioRows[0]?.dias_alerta_critico ?? 10;

    const { rows: casos } = await pool.query(
        `SELECT id, folio, estudiante FROM v_casos WHERE colegio_id = $1 AND estado != 'Cerrado'`,
        [req.colegioId]
    );

    const { rows: bitacora } = await pool.query(
        `SELECT b.caso_id, b.fecha_ejecucion AS fecha
         FROM bitacora b JOIN casos c ON c.id = b.caso_id
         WHERE c.colegio_id = $1`,
        [req.colegioId]
    );

    const ultimaPorCaso = new Map();
    bitacora.forEach((b) => {
        const actual = ultimaPorCaso.get(b.caso_id);
        if (!actual || new Date(b.fecha) > new Date(actual)) ultimaPorCaso.set(b.caso_id, b.fecha);
    });

    const ahora = new Date();
    const alertas = casos
        .map((c) => {
            const ultima = ultimaPorCaso.get(c.id);
            const diasInactivo = ultima ? Math.ceil(Math.abs(ahora - new Date(ultima)) / (1000 * 60 * 60 * 24)) : null;
            return { ...c, diasInactivo };
        })
        .filter((c) => c.diasInactivo !== null && c.diasInactivo >= diasAlertaCritico);

    const destinatario = req.body?.destinatario || process.env.SMTP_FROM || "alertas@colegio.local";
    const texto = alertas.length
        ? alertas.map((a) => `${a.folio} - ${a.estudiante}: ${a.diasInactivo} días sin actividad.`).join("\n")
        : "No hay alertas pendientes.";

    const resultado = await enviarCorreo({
        to: destinatario,
        subject: `SGE - Resumen de alertas (${alertas.length})`,
        text: texto,
    });

    res.json({ ok: true, totalAlertas: alertas.length, dryRun: Boolean(resultado.dryRun) });
});

module.exports = { enviarAlertas };
