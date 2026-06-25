const express = require("express");
const { pool } = require("../config/db");
const { emitirCsrf } = require("../middleware/csrf");
const { asyncHandler } = require("../utils/asyncHandler");

const authRoutes = require("./auth");
const colegiosRoutes = require("./colegios");
const casosRoutes = require("./casos");
const equipoRoutes = require("./equipo");
const notificacionesRoutes = require("./notificaciones");

const router = express.Router();

router.get(
    "/health",
    asyncHandler(async (req, res) => {
        try {
            await pool.query("SELECT 1");
            res.json({ ok: true, db: "up" });
        } catch (err) {
            res.status(503).json({ ok: false, db: "down" });
        }
    })
);

router.get("/csrf", emitirCsrf);

router.use("/auth", authRoutes);
router.use("/colegios", colegiosRoutes);
router.use("/casos", casosRoutes);
router.use("/equipo", equipoRoutes);
router.use("/notificaciones", notificacionesRoutes);

module.exports = router;
