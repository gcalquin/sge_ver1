const DIACRITICOS_REGEX = new RegExp("[\\u0300-\\u036f]", "g");

function slugify(nombre) {
    return nombre.normalize("NFD").replace(DIACRITICOS_REGEX, "").toLowerCase().trim().replace(/\s+/g, ".");
}

module.exports = { slugify };
