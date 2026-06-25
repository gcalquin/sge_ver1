const { z } = require("zod");

const ambitoSchema = z.union([z.literal("central"), z.coerce.number().int().positive()]);

const loginSchema = z.object({
    ambito: ambitoSchema,
    username: z.string().min(1, "El usuario es obligatorio."),
    password: z.string().min(1, "La contraseña es obligatoria."),
});

const contextoSchema = z.object({
    colegioId: z.coerce.number().int().positive(),
});

const cambiarPasswordSchema = z.object({
    actual: z.string().min(1),
    nueva: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres."),
});

module.exports = { loginSchema, contextoSchema, cambiarPasswordSchema };
