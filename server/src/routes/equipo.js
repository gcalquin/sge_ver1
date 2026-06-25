const express = require("express");
const { validar } = require("../middleware/validate");
const { requireAuth, requireRol, requireColegioContexto } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { crearUsuarioColegioSchema } = require("../validation/equipo");
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
router.delete("/:id", requireRol("admin", "superadmin"), auditar("equipo.eliminar"), controller.eliminar);

module.exports = router;
