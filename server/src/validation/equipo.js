const { z } = require("zod");

const crearFuncionarioSchema = z.object({
    nombre: z.string().min(2),
    rol: z.string().min(2),
    clave: z.string().min(4),
});

module.exports = { crearFuncionarioSchema };
