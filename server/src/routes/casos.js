const express = require("express");
const { validar } = require("../middleware/validate");
const { requireAuth, requireEscritura, requireColegioContexto } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { upload } = require("../config/upload");
const { crearCasoSchema, actualizarCasoSchema, bitacoraSchema, cierreSchema } = require("../validation/casos");
const casosController = require("../controllers/casos");
const adjuntosController = require("../controllers/adjuntos");

const router = express.Router();

router.use(requireAuth, requireColegioContexto);

const actualizarCasoConCierreSchema = actualizarCasoSchema.extend({
    cierre: cierreSchema.optional(),
});

router.get("/dashboard", casosController.dashboard);
router.get("/", casosController.listar);
router.post("/", requireEscritura, validar(crearCasoSchema), auditar("casos.crear"), casosController.crear);

router.get("/:id", casosController.obtener);
router.patch(
    "/:id",
    requireEscritura,
    validar(actualizarCasoConCierreSchema),
    auditar("casos.actualizar"),
    casosController.actualizar
);
router.get("/:id/pdf", casosController.pdf);

router.post(
    "/:id/bitacora",
    requireEscritura,
    validar(bitacoraSchema),
    auditar("casos.bitacora.crear"),
    casosController.bitacora
);

router.post(
    "/:id/bitacora/:bitId/adjuntos",
    requireEscritura,
    upload.single("archivo"),
    auditar("casos.adjuntos.subir"),
    adjuntosController.subir
);
router.get("/:id/bitacora/:bitId/adjuntos", adjuntosController.listarPorBitacora);
router.get("/:id/adjuntos/:adjId", adjuntosController.descargar);

module.exports = router;
