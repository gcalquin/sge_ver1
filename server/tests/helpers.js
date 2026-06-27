const path = require("path");
const request = require("supertest");

// Carga la app real (Express) tal cual la usa producción. Se hace de forma
// perezosa/cacheada porque varios archivos de test la necesitan y app.js es
// un módulo CommonJS importado dinámicamente (ver tests/health.test.js).
let appPromise = null;
async function cargarApp() {
    if (!appPromise) {
        require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
        appPromise = import("../src/app.js").then((m) => m.default);
    }
    return appPromise;
}

// Inicia sesión en un agente de supertest (mantiene cookies entre llamadas) y
// deja el token CSRF ya vigente, listo para usar en escrituras subsiguientes.
async function loginComo(agent, { ambito = "1", username, password }) {
    const csrfRes = await agent.get("/api/csrf");
    let csrfToken = csrfRes.body.csrfToken;
    const loginRes = await agent
        .post("/api/auth/login")
        .set("X-CSRF-Token", csrfToken)
        .send({ ambito, username, password });
    if (loginRes.status === 200) csrfToken = loginRes.body.csrfToken;
    return { res: loginRes, csrfToken };
}

module.exports = { cargarApp, loginComo, request };
