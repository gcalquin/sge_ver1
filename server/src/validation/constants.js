const CATEGORIAS = [
    "Convivencia Escolar",
    "Académico / Rendimiento",
    "Asistencia / Deserción",
    "Salud Mental / Emocional",
    "Vulneración de Derechos",
];

const ESTADOS = ["Abierto", "En seguimiento", "Cerrado"];

const TIPOS_BITACORA = ["entrevista", "seguimiento", "medida"];

const MOTIVOS_CIERRE = ["Exitosa sin Reincidencia", "Derivado Externo", "Cierre por Deserción"];

const ESPECIALIDADES = [
    "Encargado de Convivencia Escolar",
    "Psicólogo PIE",
    "Inspector General",
    "Trabajador Social",
    "Orientador",
    "Otro",
];

const INSTITUCIONES_DERIVACION = [
    "Carabineros",
    "PDI",
    "Fiscalía",
    "Tribunal de Familia",
    "OPD",
    "Mejor Niñez (ex-SENAME)",
    "COSAM",
    "Hospital / Centro de Salud",
    "Otro",
];

const TIPOS_DERIVACION = ["Denuncia Obligatoria", "Derivación de Apoyo"];

const ESTADOS_DERIVACION = ["Pendiente", "Realizada", "Con Respuesta", "Cerrada"];

const IDIOMAS_CITACION = ["es", "es-simple", "ht"];

module.exports = {
    CATEGORIAS,
    ESTADOS,
    TIPOS_BITACORA,
    MOTIVOS_CIERRE,
    ESPECIALIDADES,
    INSTITUCIONES_DERIVACION,
    TIPOS_DERIVACION,
    ESTADOS_DERIVACION,
    IDIOMAS_CITACION,
};
