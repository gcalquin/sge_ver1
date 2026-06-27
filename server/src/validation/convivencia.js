const { z } = require("zod");

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida, usa AAAA-MM-DD.");

const TIPOS_ACTIVIDAD = ["Taller", "Charla", "Capacitación", "Otro"];

const actividadConvivenciaSchema = z.object({
    nombre: z.string().min(2).max(200),
    tipo: z.enum(TIPOS_ACTIVIDAD),
    fecha: fechaSchema,
    descripcion: z.string().optional().nullable(),
    metaPmeId: z.coerce.number().int().positive().optional().nullable(),
});

const actividadBitacoraSchema = z.object({
    fecha: fechaSchema,
    contenido: z.string().min(2),
});

const cierreActividadSchema = z.object({
    fecha: fechaSchema,
    evaluacion: z.string().min(2),
});

const pasoProtocoloColegioSchema = z.object({
    descripcion: z.string().min(2),
    plazoDias: z.coerce.number().int().min(0).optional().nullable(),
    orden: z.coerce.number().int().min(1),
});

const protocoloColegioSchema = z.object({
    nombre: z.string().min(2).max(150),
    normativa: z.string().max(300).optional().nullable(),
    pasos: z.array(pasoProtocoloColegioSchema).min(1),
});

const medidaCatalogoSchema = z.object({
    nombre: z.string().min(2).max(150),
});

const actualizarMedidaCatalogoSchema = z.object({
    activo: z.boolean(),
});

module.exports = {
    TIPOS_ACTIVIDAD,
    actividadConvivenciaSchema,
    actividadBitacoraSchema,
    cierreActividadSchema,
    protocoloColegioSchema,
    medidaCatalogoSchema,
    actualizarMedidaCatalogoSchema,
};
