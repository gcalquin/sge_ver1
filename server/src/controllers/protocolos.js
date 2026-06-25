const { pool } = require("../config/db");
const { asyncHandler } = require("../utils/asyncHandler");

const listarCatalogo = asyncHandler(async (req, res) => {
    const { rows } = await pool.query("SELECT categoria, nombre, normativa, pasos FROM protocolos ORDER BY categoria");
    res.json(rows);
});

module.exports = { listarCatalogo };
