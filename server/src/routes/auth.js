const express = require("express");
const rateLimit = require("express-rate-limit");
const { validar } = require("../middleware/validate");
const { requireAuth, requireRol } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { loginSchema, contextoSchema, cambiarPasswordSchema } = require("../validation/auth");
const controller = require("../controllers/auth");

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos de inicio de sesión. Intenta nuevamente en un minuto." },
});

router.post("/login", loginLimiter, validar(loginSchema), auditar("auth.login"), controller.login);
router.post("/logout", auditar("auth.logout"), controller.logout);
router.get("/me", requireAuth, controller.me);
router.patch("/password", requireAuth, validar(cambiarPasswordSchema), auditar("auth.password"), controller.cambiarPassword);
router.post(
    "/contexto",
    requireAuth,
    requireRol("superadmin"),
    validar(contextoSchema),
    auditar("auth.contexto.entrar"),
    controller.entrarContexto
);
router.post("/contexto/salir", requireAuth, requireRol("superadmin"), auditar("auth.contexto.salir"), controller.salirContexto);

module.exports = router;
