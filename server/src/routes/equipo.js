const express = require("express");
const { validar } = require("../middleware/validate");
const { requireAuth, requireRol, requireColegioContexto } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { crearUsuarioColegioSchema, actualizarUsuarioColegioSchema, eliminarUsuarioSchema } = require("../validation/equipo");
const controller = require("../controllers/equipo");

const router = express.Router();

router.use(requireAuth, requireColegioContexto);

router.get("/", controller.listar);
router.post(
    "/",
    requireRol("admin", "superadmin"),
    validar(crearUsuarioColegioSchema),
    auditar("equipo.crear"),
    controller.crear
);
router.patch(
    "/:id",
    requireRol("admin", "superadmin"),
    validar(actualizarUsuarioColegioSchema),
    auditar("equipo.actualizar"),
    controller.actualizar
);
router.delete(
    "/:id",
    requireRol("admin", "superadmin"),
    validar(eliminarUsuarioSchema),
    auditar("equipo.eliminar"),
    controller.eliminar
);

module.exports = router;
