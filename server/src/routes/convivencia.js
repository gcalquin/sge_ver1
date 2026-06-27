const express = require("express");
const { validar } = require("../middleware/validate");
const { requireAuth, requireRol, requireEscritura, requireColegioContexto } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { upload } = require("../config/upload");
const {
    actividadConvivenciaSchema,
    actividadBitacoraSchema,
    cierreActividadSchema,
    protocoloColegioSchema,
    medidaCatalogoSchema,
    actualizarMedidaCatalogoSchema,
} = require("../validation/convivencia");
const controller = require("../controllers/convivencia");
const adjuntosController = require("../controllers/adjuntos");

const router = express.Router();

router.use(requireAuth, requireColegioContexto);

router.get("/actividades", controller.listarActividades);
router.post(
    "/actividades",
    requireEscritura,
    validar(actividadConvivenciaSchema),
    auditar("convivencia.actividad.crear"),
    controller.crearActividad
);
router.delete("/actividades/:id", requireEscritura, auditar("convivencia.actividad.eliminar"), controller.eliminarActividad);

router.get("/actividades/:actId/bitacora", controller.listarBitacoraActividad);
router.post(
    "/actividades/:actId/bitacora",
    requireEscritura,
    validar(actividadBitacoraSchema),
    auditar("convivencia.actividad.bitacora.crear"),
    controller.crearBitacoraActividad
);
router.post(
    "/actividades/:actId/cierre",
    requireEscritura,
    validar(cierreActividadSchema),
    auditar("convivencia.actividad.cerrar"),
    controller.cerrarActividad
);
router.get("/actividades/:actId/pdf", controller.pdfActividad);
router.post(
    "/actividades/:actId/adjuntos",
    requireEscritura,
    upload.array("archivos", 10),
    auditar("convivencia.actividad.adjuntos.subir"),
    adjuntosController.subirParaActividad
);
router.get("/actividades/:actId/adjuntos", adjuntosController.listarPorActividad);
router.get("/actividades/:actId/adjuntos/:adjId", adjuntosController.descargarDeActividad);

router.get("/protocolos", controller.listarProtocolos);
router.put(
    "/protocolos/:categoria",
    requireRol("admin", "superadmin"),
    validar(protocoloColegioSchema),
    auditar("convivencia.protocolo.guardar"),
    controller.guardarProtocoloColegio
);
router.delete(
    "/protocolos/:categoria",
    requireRol("admin", "superadmin"),
    auditar("convivencia.protocolo.eliminar"),
    controller.eliminarProtocoloColegio
);

router.get("/medidas-catalogo", controller.listarMedidas);
router.post(
    "/medidas-catalogo",
    requireRol("admin", "superadmin"),
    validar(medidaCatalogoSchema),
    auditar("convivencia.medida.crear"),
    controller.crearMedida
);
router.patch(
    "/medidas-catalogo/:id",
    requireRol("admin", "superadmin"),
    validar(actualizarMedidaCatalogoSchema),
    auditar("convivencia.medida.actualizar"),
    controller.actualizarMedida
);
router.delete(
    "/medidas-catalogo/:id",
    requireRol("admin", "superadmin"),
    auditar("convivencia.medida.eliminar"),
    controller.eliminarMedida
);

module.exports = router;
