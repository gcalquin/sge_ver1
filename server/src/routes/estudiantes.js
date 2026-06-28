const express = require("express");
const { validar } = require("../middleware/validate");
const { requireAuth, requireEscritura, requireColegioContexto } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { crearEstudianteSchema, actualizarEstudianteSchema } = require("../validation/estudiantes");
const controller = require("../controllers/estudiantes");

const router = express.Router();

router.use(requireAuth, requireColegioContexto);

router.get("/", controller.listar);
router.post("/", requireEscritura, validar(crearEstudianteSchema), auditar("estudiantes.crear"), controller.crear);
router.patch(
    "/:id",
    requireEscritura,
    validar(actualizarEstudianteSchema),
    auditar("estudiantes.actualizar"),
    controller.actualizar
);

module.exports = router;
