const { z } = require("zod");

const crearCursoProfesorJefeSchema = z.object({
    curso: z.string().min(1).max(20),
    profesorJefeId: z.coerce.number().int().positive(),
});

module.exports = { crearCursoProfesorJefeSchema };
