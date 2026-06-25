const express = require("express");
const { validar } = require("../middleware/validate");
const { requireAuth, requireRol } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { crearSostenedorSchema, actualizarSostenedorSchema } = require("../validation/sostenedores");
const controller = require("../controllers/sostenedores");

const router = express.Router();

router.use(requireAuth, requireRol("superadmin"));

router.get("/", controller.listar);
router.post("/", validar(crearSostenedorSchema), auditar("sostenedores.crear"), controller.crear);
router.patch("/:id", validar(actualizarSostenedorSchema), auditar("sostenedores.actualizar"), controller.actualizar);

module.exports = router;
