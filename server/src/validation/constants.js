const CATEGORIAS = [
    "Convivencia Escolar",
    "Académico / Rendimiento",
    "Asistencia / Deserción",
    "Salud Mental / Emocional",
    "Vulneración de Derechos",
    "Aula Segura",
];

// Categoría reservada para sumarios a funcionarios (Ley Karin). No aparece en
// CATEGORIAS porque nunca debe ofrecerse en el selector público de /casos: solo
// la usa internamente controllers/sumarios.js.
const CATEGORIA_SUMARIO = "Sumario Interno (Ley Karin)";

// Categorías que, conforme al Art. 175 letra e) del Código Procesal Penal,
// obligan a denunciar a Carabineros/PDI/Fiscalía/Tribunal de Familia.
const CATEGORIAS_CON_DENUNCIA_OBLIGATORIA = ["Vulneración de Derechos", "Aula Segura"];

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
    "OLN (Oficina Local de la Niñez)",
    "Mejor Niñez (ex-SENAME)",
    "COSAM",
    "Hospital / Centro de Salud",
    "GES / Programa de Salud Mental Escolar",
    "Otro",
];

const TIPOS_DERIVACION = ["Denuncia Obligatoria", "Derivación de Apoyo"];

const ESTADOS_DERIVACION = ["Pendiente", "Realizada", "Con Respuesta", "Cerrada"];

module.exports = {
    CATEGORIAS,
    CATEGORIA_SUMARIO,
    CATEGORIAS_CON_DENUNCIA_OBLIGATORIA,
    ESTADOS,
    TIPOS_BITACORA,
    MOTIVOS_CIERRE,
    ESPECIALIDADES,
    INSTITUCIONES_DERIVACION,
    TIPOS_DERIVACION,
    ESTADOS_DERIVACION,
};
