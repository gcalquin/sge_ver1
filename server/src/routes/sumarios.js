const express = require("express");
const { validar } = require("../middleware/validate");
const { requireAuth, requireRol, requireColegioContexto } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { crearSumarioSchema } = require("../validation/sumarios");
const { bitacoraSchema, pasoProtocoloSchema } = require("../validation/casos");
const sumariosController = require("../controllers/sumarios");
const casosController = require("../controllers/casos");

const router = express.Router();

// Confidencialidad reforzada: TODAS las rutas de sumarios exigen admin/superadmin,
// más estricto que las rutas generales de /casos (que solo exigen sesión + contexto
// de colegio). Ver también el guard a nivel de datos en casosController.getCasoDetalle.
router.use(requireAuth, requireColegioContexto, requireRol("admin", "superadmin"));

router.get("/", sumariosController.listar);
router.post("/", validar(crearSumarioSchema), auditar("sumarios.crear"), sumariosController.crear);
router.get("/:id", sumariosController.obtener);
router.get("/:id/pdf", sumariosController.verificarEsSumario, casosController.pdf);

router.post(
    "/:id/bitacora",
    sumariosController.verificarEsSumario,
    validar(bitacoraSchema),
    auditar("sumarios.bitacora.crear"),
    casosController.bitacora
);

router.get("/:id/pasos-protocolo", sumariosController.verificarEsSumario, casosController.listarPasosProtocolo);
router.patch(
    "/:id/pasos-protocolo/:pasoId",
    sumariosController.verificarEsSumario,
    validar(pasoProtocoloSchema),
    auditar("sumarios.pasoProtocolo.actualizar"),
    casosController.actualizarPasoProtocolo
);

module.exports = router;
