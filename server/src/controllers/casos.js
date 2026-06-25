const PDFDocument = require("pdfkit");
const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

const TIPO_BITACORA = { entrevista: "Entrevista", seguimiento: "Seguimiento", medida: "Medida" };

async function getCasoDetalle(colegioId, id) {
    const { rows: casoRows } = await pool.query(
        `SELECT * FROM v_casos WHERE colegio_id = $1 AND id = $2`,
        [colegioId, id]
    );
    const caso = casoRows[0];
    if (!caso) return null;

    const { rows: bitacora } = await pool.query(
        `SELECT b.id, b.tipo, b.fecha_ejecucion AS fecha, b.contenido,
                b.subtipo_entrevista AS subtipo, b.estado_medida AS "estadoMedida",
                b.motivo_cierre AS motivo, b.evaluacion_cierre AS evaluacion,
                op.nombre AS operador,
                (SELECT count(*) FROM adjuntos a WHERE a.bitacora_id = b.id) AS adjuntos
         FROM bitacora b
         JOIN usuarios op ON op.id = b.operador_id
         WHERE b.caso_id = $1
         ORDER BY b.id`,
        [id]
    );

    return {
        id: caso.id,
        folio: caso.folio,
        estudiante: caso.estudiante,
        categoria: caso.categoria,
        descripcion: caso.descripcion,
        estado: caso.estado,
        fechaApertura: caso.fecha_apertura,
        fechaCierre: caso.fecha_cierre,
        motivoCierre: caso.motivo_cierre,
        diasActivo: caso.dias_activo,
        responsablePrincipal: caso.responsable_nombre,
        responsableId: caso.responsable_id,
        bitacora,
    };
}

const listar = asyncHandler(async (req, res) => {
    const { estado = "Todos", categoria = "Todos", responsable = "Todos", search = "", limit = 50, offset = 0 } = req.query;

    const condiciones = ["colegio_id = $1"];
    const valores = [req.colegioId];

    if (estado !== "Todos") {
        valores.push(estado);
        condiciones.push(`estado = $${valores.length}`);
    }
    if (categoria !== "Todos") {
        valores.push(categoria);
        condiciones.push(`categoria = $${valores.length}`);
    }
    if (responsable !== "Todos") {
        valores.push(responsable);
        condiciones.push(`responsable_nombre = $${valores.length}`);
    }
    if (search) {
        valores.push(search);
        condiciones.push(
            `to_tsvector('spanish', inmutable_unaccent(estudiante)) @@ to_tsquery('spanish', inmutable_unaccent($${valores.length}) || ':*')`
        );
    }

    valores.push(Math.min(Number(limit) || 50, 200));
    valores.push(Number(offset) || 0);

    const { rows } = await pool.query(
        `SELECT id, folio, estudiante, categoria, fecha_apertura AS "fechaApertura", dias_activo AS "diasActivo",
                responsable_nombre AS "responsablePrincipal", estado
         FROM v_casos
         WHERE ${condiciones.join(" AND ")}
         ORDER BY id DESC
         LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
        valores
    );

    res.json(rows);
});

const dashboard = asyncHandler(async (req, res) => {
    const { categoria = "Todos", desde = "" } = req.query;

    const { rows: casos } = await pool.query(
        `SELECT id, folio, estudiante, estado, fecha_apertura AS fecha_apertura,
                categoria, responsable_nombre AS responsable
         FROM v_casos WHERE colegio_id = $1`,
        [req.colegioId]
    );

    const { rows: bitacora } = await pool.query(
        `SELECT b.caso_id, b.tipo, b.fecha_ejecucion AS fecha, b.motivo_cierre
         FROM bitacora b
         JOIN casos c ON c.id = b.caso_id
         WHERE c.colegio_id = $1`,
        [req.colegioId]
    );

    const bitacoraPorCaso = new Map();
    bitacora.forEach((b) => {
        if (!bitacoraPorCaso.has(b.caso_id)) bitacoraPorCaso.set(b.caso_id, []);
        bitacoraPorCaso.get(b.caso_id).push(b);
    });

    const filtrados = casos.filter((c) => {
        if (categoria !== "Todos" && c.categoria !== categoria) return false;
        if (desde && new Date(c.fecha_apertura) < new Date(desde)) return false;
        return true;
    });

    const kpis = {
        total: filtrados.length,
        abiertos: filtrados.filter((c) => c.estado === "Abierto").length,
        seguimiento: filtrados.filter((c) => c.estado === "En seguimiento").length,
        cerrados: filtrados.filter((c) => c.estado === "Cerrado").length,
    };

    const ahora = new Date();
    const alertas = casos
        .filter((c) => c.estado !== "Cerrado")
        .map((c) => {
            const entradas = bitacoraPorCaso.get(c.id) || [];
            const ultimaFecha = new Date(Math.max(...entradas.map((b) => new Date(b.fecha))));
            const diasInactivo = Math.ceil(Math.abs(ahora - ultimaFecha) / (1000 * 60 * 60 * 24));
            return { id: c.id, folio: c.folio, estudiante: c.estudiante, diasInactivo };
        })
        .filter((a) => a.diasInactivo >= 10);

    const categoriasContador = {};
    const responsablesContador = {};
    filtrados.forEach((c) => {
        categoriasContador[c.categoria] = (categoriasContador[c.categoria] || 0) + 1;
        responsablesContador[c.responsable] = (responsablesContador[c.responsable] || 0) + 1;
    });

    const casesWithMedida = casos.filter((c) => (bitacoraPorCaso.get(c.id) || []).some((b) => b.tipo === "Medida"));
    const efectivas = casesWithMedida.filter(
        (c) =>
            c.estado === "Cerrado" &&
            (bitacoraPorCaso.get(c.id) || []).some((b) => b.tipo === "Cierre" && b.motivo_cierre === "Exitosa sin Reincidencia")
    ).length;
    const noEfectivas = casesWithMedida.length - efectivas;

    res.json({
        kpis,
        alertas,
        categorias: { labels: Object.keys(categoriasContador), data: Object.values(categoriasContador) },
        responsables: { labels: Object.keys(responsablesContador), data: Object.values(responsablesContador) },
        impacto: { casesWithMedida: casesWithMedida.length, efectivas, noEfectivas },
    });
});

const obtener = asyncHandler(async (req, res) => {
    const caso = await getCasoDetalle(req.colegioId, req.params.id);
    if (!caso) return res.status(404).json({ error: "Caso no encontrado." });
    res.json(caso);
});

const crear = asyncHandler(async (req, res) => {
    const { estudiante, fechaApertura, categoria, responsableId, descripcion } = req.body;

    const { rows: respRows } = await pool.query(
        "SELECT id FROM usuarios WHERE id = $1 AND colegio_id = $2 AND rol IN ('admin','funcionario') AND activo = TRUE",
        [responsableId, req.colegioId]
    );
    if (respRows.length === 0) return res.status(400).json({ error: "Responsable inválido." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const { rows: nuevoCaso } = await client.query(
            `INSERT INTO casos (colegio_id, estudiante, categoria, descripcion, estado, fecha_apertura, responsable_id)
             VALUES ($1, $2, $3, $4, 'Abierto', $5, $6)
             RETURNING id`,
            [req.colegioId, estudiante, categoria, descripcion, fechaApertura, responsableId]
        );
        const casoId = nuevoCaso[0].id;

        await client.query(
            `INSERT INTO bitacora (caso_id, tipo, fecha_ejecucion, operador_id, contenido)
             VALUES ($1, 'Apertura', $2, $3, 'Apertura de expediente institucional.')`,
            [casoId, fechaApertura, req.usuario.id]
        );

        await client.query("COMMIT");
        res.status(201).json(await getCasoDetalle(req.colegioId, casoId));
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
});

const actualizar = asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT estado FROM casos WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    const caso = rows[0];
    if (!caso) return res.status(404).json({ error: "Caso no encontrado." });

    const { cierre, ...edicion } = req.body;

    if (cierre) {
        if (caso.estado === "Cerrado") return res.status(409).json({ error: "El caso ya se encuentra cerrado." });

        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                "UPDATE casos SET estado = 'Cerrado', fecha_cierre = $1, motivo_cierre = $2 WHERE id = $3",
                [cierre.fecha, cierre.motivo, req.params.id]
            );
            await client.query(
                `INSERT INTO bitacora (caso_id, tipo, fecha_ejecucion, operador_id, contenido, motivo_cierre, evaluacion_cierre)
                 VALUES ($1, 'Cierre', $2, $3, $4, $5, $4)`,
                [req.params.id, cierre.fecha, req.usuario.id, cierre.evaluacion, cierre.motivo]
            );
            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    }

    const claves = Object.keys(edicion);
    if (claves.length > 0) {
        const mapaColumnas = { estudiante: "estudiante", categoria: "categoria", descripcion: "descripcion", responsableId: "responsable_id" };
        const sets = claves.map((clave, i) => `${mapaColumnas[clave]} = $${i + 1}`);
        const valores = claves.map((clave) => edicion[clave]);
        await pool.query(`UPDATE casos SET ${sets.join(", ")} WHERE id = $${valores.length + 1}`, [
            ...valores,
            req.params.id,
        ]);
    }

    res.json(await getCasoDetalle(req.colegioId, req.params.id));
});

const bitacora = asyncHandler(async (req, res) => {
    const { tipo, fecha, contenido, subtipo, estadoMedida } = req.body;
    const tipoEnum = TIPO_BITACORA[tipo];

    const { rows } = await pool.query("SELECT estado FROM casos WHERE id = $1 AND colegio_id = $2", [
        req.params.id,
        req.colegioId,
    ]);
    const caso = rows[0];
    if (!caso) return res.status(404).json({ error: "Caso no encontrado." });
    if (caso.estado === "Cerrado") {
        return res.status(409).json({ error: "El caso está cerrado, no admite nuevas entradas de bitácora." });
    }

    await pool.query(
        `INSERT INTO bitacora (caso_id, tipo, fecha_ejecucion, operador_id, contenido, subtipo_entrevista, estado_medida)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.params.id, tipoEnum, fecha, req.usuario.id, contenido, subtipo || null, estadoMedida || null]
    );

    if (caso.estado === "Abierto") {
        await pool.query("UPDATE casos SET estado = 'En seguimiento' WHERE id = $1", [req.params.id]);
    }

    res.json(await getCasoDetalle(req.colegioId, req.params.id));
});

const pdf = asyncHandler(async (req, res) => {
    const caso = await getCasoDetalle(req.colegioId, req.params.id);
    if (!caso) return res.status(404).json({ error: "Caso no encontrado." });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Expediente_${caso.folio}.pdf`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(16).text(`Expediente ${caso.folio}`, { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Estudiante: ${caso.estudiante}`);
    doc.text(`Categoría: ${caso.categoria}`);
    doc.text(`Estado: ${caso.estado}`);
    doc.text(`Fecha de apertura: ${caso.fechaApertura}`);
    doc.text(`Responsable: ${caso.responsablePrincipal}`);
    doc.moveDown();
    doc.text("Descripción:", { underline: true });
    doc.text(caso.descripcion);
    doc.moveDown();

    doc.fontSize(13).text("Bitácora cronológica", { underline: true });
    doc.moveDown(0.5);
    caso.bitacora.forEach((entrada) => {
        doc.fontSize(11).text(`[${entrada.fecha}] ${entrada.tipo} — Operador: ${entrada.operador}`);
        doc.fontSize(10).text(entrada.contenido);
        doc.moveDown(0.5);
    });

    doc.end();
});

module.exports = { listar, dashboard, obtener, crear, actualizar, bitacora, pdf, getCasoDetalle };
