import { describe, it, expect, beforeAll, afterAll } from "vitest";
// El Pool de pg se construye al cargar src/config/db.js leyendo
// process.env.DATABASE_URL; dotenv debe correr antes de ese require (igual que
// hace cargarApp() en helpers.js) o el Pool queda armado sin credenciales.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { cargarApp, loginComo, request } = require("./helpers");
const { pool } = require("../src/config/db");

describe("API de casos: CRUD, búsqueda y paginación", () => {
    let app;
    let agent;
    let csrfToken;
    let responsableId;
    const idsCreados = [];

    beforeAll(async () => {
        app = await cargarApp();
        agent = request.agent(app);
        ({ csrfToken } = await loginComo(agent, { username: "admin", password: "admin123" }));
        const equipo = await agent.get("/api/equipo");
        responsableId = equipo.body.find((u) => u.rolPermiso !== "invitado").id;
    });

    afterAll(async () => {
        if (idsCreados.length) {
            await pool.query("DELETE FROM casos WHERE id = ANY($1)", [idsCreados]);
        }
    });

    async function crearCaso(overrides = {}) {
        const res = await agent
            .post("/api/casos")
            .set("X-CSRF-Token", csrfToken)
            .send({
                estudiante: "Caso De Prueba Vitest",
                fechaApertura: new Date().toISOString().slice(0, 10),
                categoria: "Convivencia Escolar",
                responsableId,
                descripcion: "Caso creado por la suite automatizada de tests.",
                ...overrides,
            });
        if (res.status === 201) idsCreados.push(res.body.id);
        return res;
    }

    it("crea un caso y lo devuelve con estudiantesAdicionales vacío por defecto", async () => {
        const res = await crearCaso();
        expect(res.status).toBe(201);
        expect(res.body.folio).toMatch(/^CASO-/);
        expect(res.body.estudiantesAdicionales).toEqual([]);
    });

    it("rechaza la creación con datos inválidos (descripción muy corta)", async () => {
        const res = await crearCaso({ descripcion: "x" });
        expect(res.status).toBe(400);
    });

    it("GET /api/casos devuelve { casos, total } y respeta limit/offset", async () => {
        const res = await agent.get("/api/casos?limit=1&offset=0");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("total");
        expect(res.body.casos.length).toBeLessThanOrEqual(1);
        expect(typeof res.body.total).toBe("number");
    });

    it("la búsqueda con un término de varias palabras no rompe el endpoint (regresión tsquery)", async () => {
        const res = await crearCaso({ estudiante: "Nombre Compuesto De Prueba" });
        expect(res.status).toBe(201);

        const busqueda = await agent.get("/api/casos?search=" + encodeURIComponent("Nombre Compuesto"));
        expect(busqueda.status).toBe(200);
        expect(busqueda.body.casos.some((c) => c.id === res.body.id)).toBe(true);
    });

    it("encuentra un caso por el nombre de un estudiante adicional, no solo el principal", async () => {
        const res = await crearCaso({
            estudiante: "Principal Vitest",
            estudiantesAdicionales: ["Secundario Vitest Buscable"],
        });
        expect(res.status).toBe(201);

        const busqueda = await agent.get("/api/casos?search=" + encodeURIComponent("Secundario Vitest"));
        expect(busqueda.body.casos.some((c) => c.id === res.body.id)).toBe(true);
    });

    it("deduplica nombres repetidos (case-insensitive, con espacios extra) al crear", async () => {
        const res = await crearCaso({
            estudiante: "Principal Dedupe Vitest",
            estudiantesAdicionales: ["Juan Pérez", "juan   pérez", " JUAN PÉREZ "],
        });
        expect(res.status).toBe(201);
        expect(res.body.estudiantesAdicionales).toHaveLength(1);
        expect(res.body.estudiantesAdicionales[0].nombre).toBe("Juan Pérez");
    });

    it("rechaza agregar un estudiante adicional duplicado a un caso existente (409)", async () => {
        const creado = await crearCaso({
            estudiante: "Principal Conflicto Vitest",
            estudiantesAdicionales: ["Ana Soto"],
        });
        const dup = await agent
            .post(`/api/casos/${creado.body.id}/estudiantes-adicionales`)
            .set("X-CSRF-Token", csrfToken)
            .send({ nombre: "ana soto" });
        expect(dup.status).toBe(409);
    });
});
