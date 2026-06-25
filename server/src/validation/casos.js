const { z } = require("zod");
const { CATEGORIAS, TIPOS_BITACORA, MOTIVOS_CIERRE } = require("./constants");

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida, usa AAAA-MM-DD.");

const crearCasoSchema = z.object({
    estudiante: z.string().min(2),
    fechaApertura: fechaSchema,
    categoria: z.enum(CATEGORIAS),
    responsableId: z.coerce.number().int().positive(),
    descripcion: z.string().min(5),
});

const actualizarCasoSchema = z.object({
    estudiante: z.string().min(2).optional(),
    categoria: z.enum(CATEGORIAS).optional(),
    descripcion: z.string().min(5).optional(),
    responsableId: z.coerce.number().int().positive().optional(),
});

const bitacoraSchema = z.object({
    tipo: z.enum(TIPOS_BITACORA),
    fecha: fechaSchema,
    contenido: z.string().min(2),
    subtipo: z.string().optional(),
    estadoMedida: z.string().optional(),
});

const cierreSchema = z.object({
    fecha: fechaSchema,
    motivo: z.enum(MOTIVOS_CIERRE),
    evaluacion: z.string().min(2),
});

module.exports = { crearCasoSchema, actualizarCasoSchema, bitacoraSchema, cierreSchema };
