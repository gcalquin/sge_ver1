const express = require("express");
const { validar } = require("../middleware/validate");
const { requireAuth, requireRol, requireColegioContexto } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { crearCursoProfesorJefeSchema } = require("../validation/cursosProfesorJefe");
const controller = require("../controllers/cursosProfesorJefe");

const router = express.Router();

router.use(requireAuth, requireColegioContexto);

router.get("/", controller.listar);
router.post(
    "/",
    requireRol("admin", "superadmin"),
    validar(crearCursoProfesorJefeSchema),
    auditar("cursosProfesorJefe.crear"),
    controller.crear
);
router.delete("/:id", requireRol("admin", "superadmin"), auditar("cursosProfesorJefe.eliminar"), controller.eliminar);

module.exports = router;
