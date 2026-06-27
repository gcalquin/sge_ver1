const express = require("express");
const { requireAuth, requireColegioContexto } = require("../middleware/auth");
const { auditar } = require("../middleware/audit");
const controller = require("../controllers/notificaciones");

const router = express.Router();

router.post(
    "/alertas",
    requireAuth,
    requireColegioContexto,
    auditar("notificaciones.alertas"),
    controller.enviarAlertas
);

module.exports = router;
