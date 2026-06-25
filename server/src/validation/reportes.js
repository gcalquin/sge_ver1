const { z } = require("zod");

const metaPmeSchema = z.object({
    indicador: z.string().min(3).max(150),
    metaValor: z.coerce.number(),
    descripcion: z.string().optional().nullable(),
});

module.exports = { metaPmeSchema };
