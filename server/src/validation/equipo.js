const { z } = require("zod");

// "rol" es el cargo institucional en texto libre (ej. "Psicólogo Escolar");
// "rolPermiso" es el rol de permisos del sistema (admin/funcionario/invitado),
// seleccionable por quien crea el usuario (admin del colegio o superadmin).
const crearUsuarioColegioSchema = z.object({
    nombre: z.string().min(2),
    rol: z.string().min(2),
    rolPermiso: z.enum(["admin", "funcionario", "invitado"]),
    clave: z.string().min(4),
});

module.exports = { crearUsuarioColegioSchema };
