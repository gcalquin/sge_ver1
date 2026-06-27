const { z } = require("zod");
const { ESPECIALIDADES } = require("./constants");

// "rol" es el cargo institucional en texto libre (ej. "Psicólogo Escolar");
// "rolPermiso" es el rol de permisos del sistema (admin/funcionario/invitado),
// seleccionable por quien crea el usuario (admin del colegio o superadmin).
// "especialidad" es un rol funcional típico del contexto escolar chileno, usado
// para enrutar notificaciones (ej. derivar a quien tenga "Encargado de Convivencia Escolar").
const usernameSchema = z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-zA-Z0-9._-]+$/, "El usuario solo admite letras, números, puntos, guiones y guion bajo.");

const crearUsuarioColegioSchema = z.object({
    nombre: z.string().min(2),
    rol: z.string().min(2),
    rolPermiso: z.enum(["admin", "funcionario", "invitado"]),
    especialidad: z.enum(ESPECIALIDADES).optional().nullable(),
    email: z.string().email().optional().nullable(),
    clave: z.string().min(4),
    username: usernameSchema.optional().nullable(),
});

const actualizarUsuarioColegioSchema = z.object({
    nombre: z.string().min(2),
    rol: z.string().min(2),
    rolPermiso: z.enum(["admin", "funcionario", "invitado"]),
    especialidad: z.enum(ESPECIALIDADES).optional().nullable(),
    email: z.string().email().optional().nullable(),
    username: usernameSchema,
    clave: z
        .string()
        .optional()
        .nullable()
        .refine((v) => !v || v.length >= 4, { message: "La clave debe tener al menos 4 caracteres." }),
});

const eliminarUsuarioSchema = z.object({
    nuevoResponsableId: z.coerce.number().int().positive().optional(),
});

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida, usa AAAA-MM-DD.");

const capacitacionSchema = z.object({
    nombre: z.string().min(2).max(200),
    institucion: z.string().max(150).optional().nullable(),
    fechaObtencion: fechaSchema,
    fechaVencimiento: fechaSchema.optional().nullable(),
});

module.exports = {
    crearUsuarioColegioSchema,
    actualizarUsuarioColegioSchema,
    eliminarUsuarioSchema,
    capacitacionSchema,
};
