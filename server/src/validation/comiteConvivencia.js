const { z } = require("zod");

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida, usa AAAA-MM-DD.");

const compromisoActaSchema = z.object({
    descripcion: z.string().min(2),
    responsable: z.string().max(150).optional().nullable(),
    fechaLimite: fechaSchema.optional().nullable(),
});

const actaComiteSchema = z.object({
    fechaReunion: fechaSchema,
    asistentes: z.string().min(2),
    temasTratados: z.string().min(2),
    acuerdos: z.string().min(2),
    compromisos: z.array(compromisoActaSchema).optional().default([]),
});

const actualizarCompromisoActaSchema = z.object({
    cumplido: z.boolean(),
});

module.exports = { actaComiteSchema, compromisoActaSchema, actualizarCompromisoActaSchema };
