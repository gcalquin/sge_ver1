const { z } = require("zod");

// Traduce los mensajes por defecto de Zod (en inglés) al español, sin tener que
// repetir required_error/invalid_type_error en cada campo de cada esquema.
z.setErrorMap((issue, ctx) => {
    switch (issue.code) {
        case z.ZodIssueCode.invalid_type:
            if (issue.received === "undefined" || issue.received === "null")
                return { message: "Este campo es obligatorio." };
            if (issue.received === "nan" && issue.expected === "number")
                return { message: "Debe ser un número válido (o este campo es obligatorio)." };
            return { message: `Tipo de dato inválido (se esperaba ${issue.expected}).` };
        case z.ZodIssueCode.too_small:
            if (issue.type === "string") return { message: `Debe tener al menos ${issue.minimum} caracter(es).` };
            if (issue.type === "number") return { message: `Debe ser mayor o igual a ${issue.minimum}.` };
            if (issue.type === "array") return { message: `Debe tener al menos ${issue.minimum} elemento(s).` };
            break;
        case z.ZodIssueCode.too_big:
            if (issue.type === "string") return { message: `Debe tener como máximo ${issue.maximum} caracter(es).` };
            if (issue.type === "number") return { message: `Debe ser menor o igual a ${issue.maximum}.` };
            if (issue.type === "array") return { message: `Debe tener como máximo ${issue.maximum} elemento(s).` };
            break;
        case z.ZodIssueCode.invalid_enum_value:
            return { message: `Valor inválido. Opciones permitidas: ${issue.options.join(", ")}.` };
        case z.ZodIssueCode.invalid_string:
            if (issue.validation === "email") return { message: "Debe ser un correo electrónico válido." };
            break;
        case z.ZodIssueCode.invalid_date:
            return { message: "Fecha inválida." };
    }
    return { message: ctx.defaultError };
});

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
