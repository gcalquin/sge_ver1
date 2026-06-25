const { z } = require("zod");
const {
    CATEGORIAS,
    TIPOS_BITACORA,
    MOTIVOS_CIERRE,
    INSTITUCIONES_DERIVACION,
    TIPOS_DERIVACION,
    ESTADOS_DERIVACION,
    IDIOMAS_CITACION,
} = require("./constants");

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida, usa AAAA-MM-DD.");

const crearCasoSchema = z.object({
    estudiante: z.string().min(2),
    fechaApertura: fechaSchema,
    categoria: z.enum(CATEGORIAS),
    responsableId: z.coerce.number().int().positive(),
    descripcion: z.string().min(5),
    curso: z.string().max(20).optional().nullable(),
    tieneNee: z.boolean().optional(),
    diagnosticoPie: z.string().optional().nullable(),
    beneficiosJunaeb: z.string().max(200).optional().nullable(),
});

const actualizarCasoSchema = z.object({
    estudiante: z.string().min(2).optional(),
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
});

const actualizarDerivacionSchema = z.object({
    estado: z.enum(ESTADOS_DERIVACION).optional(),
    folioExterno: z.string().max(60).optional().nullable(),
    notas: z.string().optional().nullable(),
});

const firmaSchema = z.object({
    bitacoraId: z.coerce.number().int().positive().optional().nullable(),
    tipoDocumento: z.string().min(2).max(60),
    nombreFirmante: z.string().min(2).max(150),
    rutFirmante: z.string().min(3).max(20),
});

const notificarApoderadoSchema = z.object({
    canal: z.enum(["email", "whatsapp", "sms"]),
    destinatario: z.string().min(3),
    idioma: z.enum(IDIOMAS_CITACION).default("es"),
    mensaje: z.string().min(5),
});

module.exports = {
    crearCasoSchema,
    actualizarCasoSchema,
    bitacoraSchema,
    cierreSchema,
    pasoProtocoloSchema,
    derivacionSchema,
    actualizarDerivacionSchema,
    firmaSchema,
    notificarApoderadoSchema,
};
