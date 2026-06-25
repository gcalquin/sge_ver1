const express = require("express");
const { validar } = require("../middleware/validate");
const { requireAuth, requireRol } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { crearColegioSchema, actualizarColegioSchema } = require("../validation/colegios");
const controller = require("../controllers/colegios");

const router = express.Router();

router.get("/public", controller.listarPublico);

router.use(requireAuth, requireRol("superadmin"));

router.get("/", controller.listar);
router.post("/", validar(crearColegioSchema), auditar("colegios.crear"), controller.crear);
router.patch("/:id", validar(actualizarColegioSchema), auditar("colegios.actualizar"), controller.actualizar);

module.exports = router;
