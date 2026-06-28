const { z } = require("zod");

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida, usa AAAA-MM-DD.");

const crearSumarioSchema = z.object({
    funcionarioInvolucrado: z.string().min(2),
    fechaApertura: fechaSchema,
    descripcion: z.string().min(5),
    responsableId: z.coerce.number().int().positive(),
});

module.exports = { crearSumarioSchema };
