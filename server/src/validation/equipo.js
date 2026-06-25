const { z } = require("zod");
const { ESPECIALIDADES } = require("./constants");

// "rol" es el cargo institucional en texto libre (ej. "Psicólogo Escolar");
// "rolPermiso" es el rol de permisos del sistema (admin/funcionario/invitado),
// seleccionable por quien crea el usuario (admin del colegio o superadmin).
// "especialidad" es un rol funcional típico del contexto escolar chileno, usado
// para enrutar notificaciones (ej. derivar a quien tenga "Encargado de Convivencia Escolar").
const crearUsuarioColegioSchema = z.object({
    nombre: z.string().min(2),
    rol: z.string().min(2),
    rolPermiso: z.enum(["admin", "funcionario", "invitado"]),
    especialidad: z.enum(ESPECIALIDADES).optional().nullable(),
    email: z.string().email().optional().nullable(),
    clave: z.string().min(4),
});

module.exports = { crearUsuarioColegioSchema };
