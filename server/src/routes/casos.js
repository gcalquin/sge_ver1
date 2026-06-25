const express = require("express");
const { validar } = require("../middleware/validate");
const { requireAuth, requireEscritura, requireRol, requireColegioContexto } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { upload } = require("../config/upload");
const {
    crearCasoSchema,
    actualizarCasoSchema,
    bitacoraSchema,
    cierreSchema,
    pasoProtocoloSchema,
    derivacionSchema,
    actualizarDerivacionSchema,
    firmaSchema,
    notificarApoderadoSchema,
} = require("../validation/casos");
const casosController = require("../controllers/casos");
const adjuntosController = require("../controllers/adjuntos");
const derivacionesController = require("../controllers/derivaciones");
const firmasController = require("../controllers/firmas");

const router = express.Router();

router.use(requireAuth, requireColegioContexto);

const actualizarCasoConCierreSchema = actualizarCasoSchema.extend({
    cierre: cierreSchema.optional(),
});

// Rutas literales primero: deben declararse antes de "/:id" para no ser
// interpretadas como un id de caso.
router.get("/dashboard", casosController.dashboard);
router.get("/elegibles-purga", requireRol("admin", "superadmin"), casosController.elegiblesPurga);
router.get("/export-anonimo.csv", casosController.exportarAnonimoCsv);
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
router.delete("/:id/purgar", requireRol("admin", "superadmin"), auditar("casos.purgar"), casosController.purgar);
router.get("/:id/pdf", casosController.pdf);

router.post(
    "/:id/bitacora",
    requireEscritura,
    validar(bitacoraSchema),
    auditar("casos.bitacora.crear"),
    casosController.bitacora
);

router.get("/:id/pasos-protocolo", casosController.listarPasosProtocolo);
router.patch(
    "/:id/pasos-protocolo/:pasoId",
    requireEscritura,
    validar(pasoProtocoloSchema),
    auditar("casos.pasoProtocolo.actualizar"),
    casosController.actualizarPasoProtocolo
);

router.get("/:id/derivaciones", derivacionesController.listar);
router.post(
    "/:id/derivaciones",
    requireEscritura,
    validar(derivacionSchema),
    auditar("derivaciones.crear"),
    derivacionesController.crear
);
router.patch(
    "/:id/derivaciones/:derivacionId",
    requireEscritura,
    validar(actualizarDerivacionSchema),
    auditar("derivaciones.actualizar"),
    derivacionesController.actualizar
);

router.get("/:id/firmas", firmasController.listar);
router.post("/:id/firmas", requireEscritura, validar(firmaSchema), auditar("firmas.crear"), firmasController.crear);

router.post(
    "/:id/notificar-apoderado",
    requireEscritura,
    validar(notificarApoderadoSchema),
    auditar("casos.notificarApoderado"),
    casosController.notificarApoderado
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
