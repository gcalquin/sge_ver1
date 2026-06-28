const { z } = require("zod");

const crearEstudianteSchema = z.object({
    nombre: z.string().min(2).max(150),
    curso: z.string().max(20).optional().nullable(),
    rut: z.string().max(20).optional().nullable(),
});

const actualizarEstudianteSchema = z.object({
    nombre: z.string().min(2).max(150).optional(),
    curso: z.string().max(20).optional().nullable(),
    rut: z.string().max(20).optional().nullable(),
    activo: z.boolean().optional(),
});

module.exports = { crearEstudianteSchema, actualizarEstudianteSchema };
