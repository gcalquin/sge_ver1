const express = require("express");
const { validar } = require("../middleware/validate");
const { requireAuth, requireRol, requireColegioContexto } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const { metaPmeSchema } = require("../validation/reportes");
const controller = require("../controllers/reportes");

const router = express.Router();

router.use(requireAuth, requireColegioContexto);

router.get("/superintendencia", controller.superintendencia);
router.get("/superintendencia.csv", controller.superintendenciaCsv);

router.get("/metas-pme", controller.listarMetasPme);
router.post(
    "/metas-pme",
    requireRol("admin", "superadmin"),
    validar(metaPmeSchema),
    auditar("reportes.metaPme.crear"),
    controller.crearMetaPme
);
router.delete("/metas-pme/:id", requireRol("admin", "superadmin"), auditar("reportes.metaPme.eliminar"), controller.eliminarMetaPme);

router.get("/auditoria", requireRol("admin", "superadmin"), controller.listarAuditoria);

module.exports = router;
