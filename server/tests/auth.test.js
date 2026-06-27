import { describe, it, expect, beforeAll } from "vitest";
const { cargarApp, loginComo, request } = require("./helpers");

describe("autenticación, CSRF y roles", () => {
    let app;

    beforeAll(async () => {
        app = await cargarApp();
    });

    it("rechaza credenciales incorrectas con 401", async () => {
        const agent = request.agent(app);
        const { res } = await loginComo(agent, { username: "admin", password: "clave-incorrecta" });
        expect(res.status).toBe(401);
    });

    it("permite iniciar sesión con credenciales válidas y entrega csrfToken", async () => {
        const agent = request.agent(app);
        const { res } = await loginComo(agent, { username: "admin", password: "admin123" });
        expect(res.status).toBe(200);
        expect(res.body.usuario.rol).toBe("admin");
        expect(res.body.csrfToken).toBeTruthy();
    });

    it("rechaza una escritura sin token CSRF (403), aunque la sesión esté activa", async () => {
        const agent = request.agent(app);
        await loginComo(agent, { username: "admin", password: "admin123" });
        const res = await agent.post("/api/casos").send({ estudiante: "Sin CSRF Test" });
        expect(res.status).toBe(403);
    });

    it("bloquea a un usuario invitado (solo lectura) al intentar crear un caso", async () => {
        const agent = request.agent(app);
        const { csrfToken } = await loginComo(agent, { username: "invitado", password: "invitado123" });
        const res = await agent
            .post("/api/casos")
            .set("X-CSRF-Token", csrfToken)
            .send({
                estudiante: "Bloqueado Invitado Test",
                fechaApertura: new Date().toISOString().slice(0, 10),
                categoria: "Convivencia Escolar",
                responsableId: 1,
                descripcion: "No debería poder crearse.",
            });
        expect(res.status).toBe(403);
    });

    it("GET /api/auth/me sin sesión responde 401", async () => {
        const agent = request.agent(app);
        const res = await agent.get("/api/auth/me");
        expect(res.status).toBe(401);
    });

    it("logout invalida la sesión: /auth/me vuelve a dar 401", async () => {
        const agent = request.agent(app);
        await loginComo(agent, { username: "admin", password: "admin123" });
        expect((await agent.get("/api/auth/me")).status).toBe(200);
        await agent.post("/api/auth/logout").send({});
        expect((await agent.get("/api/auth/me")).status).toBe(401);
    });
});
