function validar(schema, source = "body") {
    return (req, res, next) => {
        const resultado = schema.safeParse(req[source]);
        if (!resultado.success) {
            return res.status(400).json({ error: "Datos inválidos.", detalles: resultado.error.flatten() });
        }
        req[source] = resultado.data;
        next();
    };
}

module.exports = { validar };
