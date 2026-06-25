const { z } = require("zod");

const crearColegioSchema = z.object({
    nombre: z.string().min(2),
    comuna: z.string().optional().nullable(),
    direccion: z.string().optional().nullable(),
});

const actualizarColegioSchema = z.object({
    nombre: z.string().min(2).optional(),
    comuna: z.string().optional().nullable(),
    direccion: z.string().optional().nullable(),
    activo: z.boolean().optional(),
});

module.exports = { crearColegioSchema, actualizarColegioSchema };
