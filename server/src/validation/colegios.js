const { z } = require("zod");

const crearColegioSchema = z.object({
    nombre: z.string().min(2),
    comuna: z.string().optional().nullable(),
    direccion: z.string().optional().nullable(),
    rbd: z.string().min(2).max(20).optional().nullable(),
    sostenedorId: z.coerce.number().int().positive().optional().nullable(),
});

const actualizarColegioSchema = z.object({
    nombre: z.string().min(2).optional(),
    comuna: z.string().optional().nullable(),
    direccion: z.string().optional().nullable(),
    activo: z.boolean().optional(),
    rbd: z.string().min(2).max(20).optional().nullable(),
    sostenedorId: z.coerce.number().int().positive().optional().nullable(),
});

const actualizarConfiguracionSchema = z
    .object({
        diasAlertaCritico: z.number().int().min(1).max(90).optional(),
        diasRetencionCerrados: z.number().int().min(30).max(7300).optional(),
    })
    .refine((datos) => datos.diasAlertaCritico !== undefined || datos.diasRetencionCerrados !== undefined, {
        message: "Debes enviar al menos un campo de configuración.",
    });

module.exports = { crearColegioSchema, actualizarColegioSchema, actualizarConfiguracionSchema };
