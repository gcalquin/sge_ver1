const path = require("path");
const express = require("express");
const helmet = require("helmet");
const pinoHttp = require("pino-http");
const rateLimit = require("express-rate-limit");

const { logger } = require("./config/logger");
const { sessionMiddleware } = require("./config/session");
const { verificarCsrf } = require("./middleware/csrf");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const apiRouter = require("./routes");

const app = express();

// Solo se activa si el despliegue real está detrás de un proxy/balanceador
// (Nginx, Render, etc.). Sin esto, ese proxy queda como "IP del cliente" para
// el rate-limiter de login y para la IP que se guarda en auditoría, lo que
// vuelve inútil el límite por IP y falsea el registro de auditoría.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                // El prototipo usa manejadores onclick="" en línea: script-src-attr
                // es la directiva que Helmet aplica por defecto para ese caso ('none'),
                // independiente de script-src, por lo que debe afinarse aparte.
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:"],
                fontSrc: ["'self'", "data:"],
                connectSrc: ["'self'"],
            },
        },
    })
);

app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(sessionMiddleware);
// Las respuestas de /api dependen de la sesión (colegio en contexto, rol, etc.);
// sin esto el navegador puede servir una respuesta cacheada de OTRA sesión para
// la misma URL (p. ej. GET /api/casos tras cambiar de colegio).
app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
});
// Límite general de la API (además del límite más estricto de /auth/login).
// Cubre uso autenticado normal de un colegio sin molestar, pero frena scraping
// masivo o abuso desde una sesión comprometida.
app.use(
    "/api",
    rateLimit({
        windowMs: 60 * 1000,
        limit: 300,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Demasiadas solicitudes. Intenta nuevamente en un minuto." },
    })
);
app.use("/api", verificarCsrf);
app.use("/api", apiRouter);

app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/vendor/bootstrap", express.static(path.join(__dirname, "..", "node_modules", "bootstrap", "dist")));
app.use(
    "/vendor/fontawesome",
    express.static(path.join(__dirname, "..", "node_modules", "@fortawesome", "fontawesome-free"))
);
app.use("/vendor/chartjs", express.static(path.join(__dirname, "..", "node_modules", "chart.js", "dist")));

app.use("/api", notFound);
app.use(errorHandler);

module.exports = app;
