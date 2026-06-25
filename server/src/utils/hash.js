const crypto = require("crypto");

function calcularHash({ contenido, fecha, operadorId, hashAnterior }) {
    return crypto
        .createHash("sha256")
        .update(`${hashAnterior || ""}|${fecha}|${operadorId}|${contenido}`)
        .digest("hex");
}

module.exports = { calcularHash };
