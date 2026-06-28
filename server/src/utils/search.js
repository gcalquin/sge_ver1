// Construye un fragmento SQL que convierte un parámetro de búsqueda libre (que
// puede tener varias palabras, ej. un nombre completo) en un tsquery válido con
// coincidencia por prefijo en cada palabra ("ana maria" -> "ana:* & maria:*").
// to_tsquery() no acepta texto plano con espacios, por eso no se le puede pasar
// el parámetro tal cual + ':*' cuando tiene más de una palabra.
function tsQueryBusqueda(param) {
    return `regexp_replace(trim(inmutable_unaccent(${param})), '\\s+', ':* & ', 'g') || ':*'`;
}

module.exports = { tsQueryBusqueda };
