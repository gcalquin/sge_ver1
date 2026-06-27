const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

function aCsv(filas, columnas) {
    const escapar = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const encabezado = columnas.join(",");
    const cuerpo = filas.map((fila) => columnas.map((c) => escapar(fila[c])).join(",")).join("\n");
    return `${encabezado}\n${cuerpo}`;
}

async function calcularReporte(colegioId) {
    const { rows: casos } = await pool.query(
        `SELECT folio, categoria, estado, fecha_apertura AS "fechaApertura", fecha_cierre AS "fechaCierre", dias_activo AS "diasActivo"
         FROM v_casos WHERE colegio_id = $1`,
        [colegioId]
    );
    const { rows: bitacoraCount } = await pool.query(
        `SELECT c.id, count(b.id)::int AS entradas
         FROM casos c LEFT JOIN bitacora b ON b.caso_id = c.id
         WHERE c.colegio_id = $1
         GROUP BY c.id`,
        [colegioId]
    );

    const cerrados = casos.filter((c) => c.estado === "Cerrado" && c.fechaCierre);
    const tiempoPromedioResolucionDias = cerrados.length
        ? Math.round(
              cerrados.reduce((acc, c) => acc + (new Date(c.fechaCierre) - new Date(c.fechaApertura)) / 86400000, 0) /
                  cerrados.length
          )
        : null;

    const porCategoria = {};
    const porEstado = {};
    casos.forEach((c) => {
        porCategoria[c.categoria] = (porCategoria[c.categoria] || 0) + 1;
        porEstado[c.estado] = (porEstado[c.estado] || 0) + 1;
    });

    const promedioEntradasBitacoraPorCaso = bitacoraCount.length
        ? Math.round((bitacoraCount.reduce((acc, c) => acc + c.entradas, 0) / bitacoraCount.length) * 10) / 10
        : 0;

    return {
        casos,
        totalCasos: casos.length,
        porCategoria,
        porEstado,
        tiempoPromedioResolucionDias,
        promedioEntradasBitacoraPorCaso,
    };
}

const superintendencia = asyncHandler(async (req, res) => {
    const { casos, ...resumen } = await calcularReporte(req.colegioId);
    res.json({ ...resumen, generadoEn: new Date().toISOString() });
});

const superintendenciaCsv = asyncHandler(async (req, res) => {
    const { casos } = await calcularReporte(req.colegioId);
    const csv = aCsv(casos, ["folio", "categoria", "estado", "fechaApertura", "fechaCierre", "diasActivo"]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=reporte_superintendencia.csv");
    res.send(csv);
});

const listarMetasPme = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT id, indicador, meta_valor AS "metaValor", descripcion FROM metas_pme WHERE colegio_id = $1 ORDER BY id`,
        [req.colegioId]
    );
    res.json(rows);
});

const crearMetaPme = asyncHandler(async (req, res) => {
    const { indicador, metaValor, descripcion } = req.body;
    const { rows } = await pool.query(
        `INSERT INTO metas_pme (colegio_id, indicador, meta_valor, descripcion)
         VALUES ($1, $2, $3, $4)
         RETURNING id, indicador, meta_valor AS "metaValor", descripcion`,
        [req.colegioId, indicador, metaValor, descripcion || null]
    );
    res.status(201).json(rows[0]);
});

const eliminarMetaPme = asyncHandler(async (req, res) => {
    await pool.query("DELETE FROM metas_pme WHERE id = $1 AND colegio_id = $2", [req.params.id, req.colegioId]);
    res.json({ ok: true });
});

const listarAuditoria = asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        `SELECT a.id, a.accion, a.detalle, a.ip, a.created_at AS "creadoEn", u.nombre AS usuario
         FROM auditoria a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         WHERE a.colegio_id = $1
         ORDER BY a.id DESC
         LIMIT 200`,
        [req.colegioId]
    );
    res.json(rows);
});

module.exports = {
    superintendencia,
    superintendenciaCsv,
    listarMetasPme,
    crearMetaPme,
    eliminarMetaPme,
    listarAuditoria,
};
