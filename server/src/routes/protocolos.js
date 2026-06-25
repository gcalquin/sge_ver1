const express = require("express");
const { requireAuth } = require("../middleware/auth");
const controller = require("../controllers/protocolos");

const router = express.Router();

router.get("/", requireAuth, controller.listarCatalogo);

module.exports = router;
