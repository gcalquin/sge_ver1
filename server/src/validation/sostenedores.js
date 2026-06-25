const { z } = require("zod");

const crearSostenedorSchema = z.object({
    nombre: z.string().min(2),
    rut: z.string().optional().nullable(),
});

const actualizarSostenedorSchema = z.object({
    nombre: z.string().min(2).optional(),
    rut: z.string().optional().nullable(),
});

module.exports = { crearSostenedorSchema, actualizarSostenedorSchema };
