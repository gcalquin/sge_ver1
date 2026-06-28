const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

const listar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT s.*, (SELECT count(*) FROM colegios c WHERE c.sostenedor_id = s.id) AS total_colegios
         FROM sostenedores s
         ORDER BY s.nombre`
    );
    res.json(rows);
});

const crear = asyncHandler(async (req, res) => {
    const { nombre, rut } = req.body;
    const { rows } = await pool.query(`INSERT INTO sostenedores (nombre, rut) VALUES ($1, $2) RETURNING *`, [
        nombre,
        rut || null,
    ]);
    res.status(201).json(rows[0]);
});

const actualizar = asyncHandler(async (req, res) => {
    const { nombre, rut } = req.body;
    const { rows } = await pool.query(
        `UPDATE sostenedores SET nombre = COALESCE($1, nombre), rut = COALESCE($2, rut) WHERE id = $3 RETURNING *`,
        [nombre, rut, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Sostenedor no encontrado." });
    res.json(rows[0]);
});

const eliminar = asyncHandler(async (req, res) => {
    const { rows: colegios } = await pool.query("SELECT count(*) FROM colegios WHERE sostenedor_id = $1", [
        req.params.id,
    ]);
    if (Number(colegios[0].count) > 0) {
        return res.status(409).json({ error: "No se puede eliminar: hay colegios asociados a este sostenedor." });
    }
    const { rowCount } = await pool.query("DELETE FROM sostenedores WHERE id = $1", [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: "Sostenedor no encontrado." });
    res.json({ ok: true });
});

// Dashboard consolidado: una agregación liviana propia por colegio (no reutiliza
// el cálculo pesado de casosController.dashboard, que es por-colegio), pensada
// para que un sostenedor con varios colegios vea de un vistazo dónde están los
// problemas antes de entrar al contexto de un colegio específico.
const dashboard = asyncHandler(async (req, res) => {
    const { rows: sostenedorRows } = await pool.query("SELECT id, nombre FROM sostenedores WHERE id = $1", [
        req.params.id,
    ]);
    if (!sostenedorRows[0]) return res.status(404).json({ error: "Sostenedor no encontrado." });

    const [{ rows: colegios }, { rows: alertas }, { rows: vencimientos }] = await Promise.all([
        pool.query(
            `SELECT col.id, col.nombre,
                    count(cs.id) FILTER (WHERE cs.ambito = 'Estudiantil')::int AS "totalCasos",
                    count(cs.id) FILTER (WHERE cs.ambito = 'Estudiantil' AND cs.estado != 'Cerrado')::int AS "casosAbiertos",
                    count(cs.id) FILTER (WHERE cs.ambito = 'Estudiantil' AND cs.estado = 'Cerrado')::int AS "casosCerrados"
             FROM colegios col
             LEFT JOIN casos cs ON cs.colegio_id = col.id
             WHERE col.sostenedor_id = $1
             GROUP BY col.id, col.nombre
             ORDER BY col.nombre`,
            [req.params.id]
        ),
        pool.query(
            `SELECT colegio_id, count(*)::int AS total FROM (
                 SELECT c.colegio_id,
                        COALESCE((CURRENT_DATE - (SELECT MAX(b.fecha_ejecucion) FROM bitacora b WHERE b.caso_id = c.id)),
                                  (CURRENT_DATE - c.fecha_apertura)) AS dias_inactivo,
                        col.dias_alerta_critico
                 FROM casos c
                 JOIN colegios col ON col.id = c.colegio_id
                 WHERE col.sostenedor_id = $1 AND c.ambito = 'Estudiantil' AND c.estado != 'Cerrado'
             ) t
             WHERE dias_inactivo >= dias_alerta_critico
             GROUP BY colegio_id`,
            [req.params.id]
        ),
        pool.query(
            `SELECT c.colegio_id, count(*)::int AS total
             FROM caso_pasos_protocolo cpp
             JOIN casos c ON c.id = cpp.caso_id
             JOIN colegios col ON col.id = c.colegio_id
             WHERE col.sostenedor_id = $1 AND cpp.completado = FALSE AND cpp.fecha_limite IS NOT NULL
               AND cpp.fecha_limite <= CURRENT_DATE + INTERVAL '7 days'
             GROUP BY c.colegio_id`,
            [req.params.id]
        ),
    ]);

    const alertasPorColegio = new Map(alertas.map((a) => [a.colegio_id, a.total]));
    const vencimientosPorColegio = new Map(vencimientos.map((v) => [v.colegio_id, v.total]));

    res.json({
        sostenedor: sostenedorRows[0],
        colegios: colegios.map((c) => ({
            ...c,
            alertasCriticas: alertasPorColegio.get(c.id) || 0,
            proximosVencimientos: vencimientosPorColegio.get(c.id) || 0,
        })),
    });
});

module.exports = { listar, crear, actualizar, eliminar, dashboard };
