const { z } = require("zod");
const {
    CATEGORIAS,
    TIPOS_BITACORA,
    MOTIVOS_CIERRE,
    INSTITUCIONES_DERIVACION,
    TIPOS_DERIVACION,
    ESTADOS_DERIVACION,
} = require("./constants");

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida, usa AAAA-MM-DD.");

const crearCasoSchema = z.object({
    estudiante: z.string().min(2),
    estudianteId: z.coerce.number().int().positive().optional().nullable(),
    estudiantesAdicionales: z.array(z.string().min(2).max(150)).max(20).optional().default([]),
    fechaApertura: fechaSchema,
    categoria: z.enum(CATEGORIAS),
    responsableId: z.coerce.number().int().positive(),
    descripcion: z.string().min(5),
    curso: z.string().max(20).optional().nullable(),
    tieneNee: z.boolean().optional(),
    diagnosticoPie: z.string().optional().nullable(),
    beneficiosJunaeb: z.string().max(200).optional().nullable(),
});

const estudianteAdicionalSchema = z.object({
    nombre: z.string().min(2).max(150),
    estudianteId: z.coerce.number().int().positive().optional().nullable(),
});

const actualizarCasoSchema = z.object({
    estudiante: z.string().min(2).optional(),
    estudianteId: z.coerce.number().int().positive().optional().nullable(),
    categoria: z.enum(CATEGORIAS).optional(),
    descripcion: z.string().min(5).optional(),
    responsableId: z.coerce.number().int().positive().optional(),
    curso: z.string().max(20).optional().nullable(),
    tieneNee: z.boolean().optional(),
    diagnosticoPie: z.string().optional().nullable(),
    beneficiosJunaeb: z.string().max(200).optional().nullable(),
});

const bitacoraSchema = z.object({
    tipo: z.enum(TIPOS_BITACORA),
    fecha: fechaSchema,
    contenido: z.string().min(2),
    subtipo: z.string().optional(),
    estadoMedida: z.string().optional(),
    consentimientoApoderado: z.boolean().optional(),
    justificacionSinConsentimiento: z.string().optional(),
});

const cierreSchema = z.object({
    fecha: fechaSchema,
    motivo: z.enum(MOTIVOS_CIERRE),
    evaluacion: z.string().min(2),
});

const pasoProtocoloSchema = z.object({
    completado: z.boolean(),
});

const derivacionSchema = z.object({
    institucion: z.enum(INSTITUCIONES_DERIVACION),
    tipo: z.enum(TIPOS_DERIVACION),
    fechaDerivacion: fechaSchema,
    folioExterno: z.string().max(60).optional().nullable(),
    notas: z.string().optional().nullable(),
    confidencial: z.boolean().optional(),
});

const actualizarDerivacionSchema = z.object({
    estado: z.enum(ESTADOS_DERIVACION).optional(),
    folioExterno: z.string().max(60).optional().nullable(),
    notas: z.string().optional().nullable(),
    confidencial: z.boolean().optional(),
});

const compromisoMediacionSchema = z.object({
    descripcion: z.string().min(2),
    responsable: z.string().max(150).optional().nullable(),
    fechaLimite: fechaSchema.optional().nullable(),
});

const mediacionSchema = z.object({
    fechaMediacion: fechaSchema,
    participantes: z.string().min(2).max(300),
    acuerdo: z.string().min(5),
    compromisos: z.array(compromisoMediacionSchema).optional().default([]),
});

const actualizarCompromisoMediacionSchema = z.object({
    cumplido: z.boolean(),
});

module.exports = {
    crearCasoSchema,
    actualizarCasoSchema,
    estudianteAdicionalSchema,
    bitacoraSchema,
    cierreSchema,
    pasoProtocoloSchema,
    derivacionSchema,
    actualizarDerivacionSchema,
    mediacionSchema,
    compromisoMediacionSchema,
    actualizarCompromisoMediacionSchema,
};
