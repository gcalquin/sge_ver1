import { describe, it, expect, beforeAll, afterAll } from "vitest";
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { cargarApp, loginComo, request } = require("./helpers");
const { pool } = require("../src/config/db");

describe("Funcionalidades comerciales: Aula Segura, Sumarios, confidencialidad, estudiantes, dashboard sostenedor", () => {
    let app;
    let adminAgent;
    let funcionarioAgent;
    let adminCsrf;
    let responsableId;
    const idsCasosCreados = [];
    const idsEstudiantesCreados = [];

    beforeAll(async () => {
        app = await cargarApp();

        adminAgent = request.agent(app);
        ({ csrfToken: adminCsrf } = await loginComo(adminAgent, { username: "admin", password: "admin123" }));
        const equipo = await adminAgent.get("/api/equipo");
        responsableId = equipo.body.find((u) => u.rolPermiso === "admin").id;

        funcionarioAgent = request.agent(app);
        await loginComo(funcionarioAgent, { username: "ana.martinez", password: "123" });
    });

    afterAll(async () => {
        if (idsCasosCreados.length) {
            await pool.query("DELETE FROM casos WHERE id = ANY($1)", [idsCasosCreados]);
        }
        if (idsEstudiantesCreados.length) {
            await pool.query("DELETE FROM estudiantes WHERE id = ANY($1)", [idsEstudiantesCreados]);
        }
    });

    async function crearCaso(overrides = {}) {
        const res = await adminAgent
            .post("/api/casos")
            .set("X-CSRF-Token", adminCsrf)
            .send({
                estudiante: "Caso Base Vitest Comercial",
                fechaApertura: new Date().toISOString().slice(0, 10),
                categoria: "Convivencia Escolar",
                responsableId,
                descripcion: "Caso creado por la suite de funcionalidades comerciales.",
                ...overrides,
            });
        if (res.status === 201) idsCasosCreados.push(res.body.id);
        return res;
    }

    it("Aula Segura: aplica automáticamente el protocolo de la Ley 21.128 con sus pasos", async () => {
        const res = await crearCaso({
            estudiante: "Aula Segura Vitest",
            categoria: "Aula Segura",
            descripcion: "Incidente de violencia física grave registrado por la suite.",
        });
        expect(res.status).toBe(201);
        expect(res.body.protocoloNombre).toMatch(/Aula Segura/);
        expect(res.body.pasosProtocolo.length).toBeGreaterThan(0);
        expect(res.body.denunciaObligatoriaPendiente).toBe(true);
    });

    it("Sumarios: un usuario funcionario no puede listarlos ni acceder a uno por ninguna ruta", async () => {
        const crear = await adminAgent
            .post("/api/sumarios")
            .set("X-CSRF-Token", adminCsrf)
            .send({
                funcionarioInvolucrado: "Funcionario Vitest",
                fechaApertura: new Date().toISOString().slice(0, 10),
                responsableId,
                descripcion: "Denuncia registrada por la suite automatizada de tests.",
            });
        expect(crear.status).toBe(201);
        idsCasosCreados.push(crear.body.id);

        const listaSumarios = await funcionarioAgent.get("/api/sumarios");
        expect(listaSumarios.status).toBe(403);

        const accesoDirecto = await funcionarioAgent.get(`/api/sumarios/${crear.body.id}`);
        expect(accesoDirecto.status).toBe(403);

        const bypassPorCasosGeneral = await funcionarioAgent.get(`/api/casos/${crear.body.id}`);
        expect(bypassPorCasosGeneral.status).toBe(404);

        const listaCasosGeneral = await funcionarioAgent.get("/api/casos?limit=200");
        expect(listaCasosGeneral.body.casos.some((c) => c.id === crear.body.id)).toBe(false);

        // Un admin sí puede verlo y generar su PDF.
        const comoAdmin = await adminAgent.get(`/api/sumarios/${crear.body.id}`);
        expect(comoAdmin.status).toBe(200);
        expect(comoAdmin.body.ambito).toBe("Funcionario");
    });

    it("Derivaciones confidenciales: se enmascaran para quien no tenga permiso", async () => {
        const caso = await crearCaso();
        expect(caso.status).toBe(201);

        const derivacion = await adminAgent
            .post(`/api/casos/${caso.body.id}/derivaciones`)
            .set("X-CSRF-Token", adminCsrf)
            .send({
                institucion: "GES / Programa de Salud Mental Escolar",
                tipo: "Derivación de Apoyo",
                fechaDerivacion: new Date().toISOString().slice(0, 10),
                notas: "Información clínica sensible registrada por la suite.",
                confidencial: true,
            });
        expect(derivacion.status).toBe(201);

        const detalleFuncionario = await funcionarioAgent.get(`/api/casos/${caso.body.id}`);
        const derivacionVisible = detalleFuncionario.body.derivaciones.find((d) => d.id === derivacion.body.id);
        expect(derivacionVisible.oculto).toBe(true);
        expect(derivacionVisible.notas).toBeNull();

        const detalleAdmin = await adminAgent.get(`/api/casos/${caso.body.id}`);
        const derivacionAdmin = detalleAdmin.body.derivaciones.find((d) => d.id === derivacion.body.id);
        expect(derivacionAdmin.oculto).toBe(false);
        expect(derivacionAdmin.notas).toMatch(/Información clínica sensible/);
    });

    it("Catálogo de estudiantes: lo creado se encuentra vía autocompletado por búsqueda parcial", async () => {
        const crear = await adminAgent
            .post("/api/estudiantes")
            .set("X-CSRF-Token", adminCsrf)
            .send({ nombre: "Estudiante Catalogo Vitest", curso: "5ºA" });
        expect(crear.status).toBe(201);
        idsEstudiantesCreados.push(crear.body.id);

        const busqueda = await adminAgent.get("/api/estudiantes?search=" + encodeURIComponent("Catalogo Vitest"));
        expect(busqueda.status).toBe(200);
        expect(busqueda.body.some((e) => e.id === crear.body.id)).toBe(true);
    });

    it("Dashboard consolidado de sostenedor: agrega correctamente los casos de cada colegio", async () => {
        const superadminAgent = request.agent(app);
        const { csrfToken: superCsrf } = await loginComo(superadminAgent, {
            ambito: "central",
            username: "superadmin",
            password: "super123",
        });
        void superCsrf;

        const sostenedores = await superadminAgent.get("/api/sostenedores");
        const conVariosColegios = sostenedores.body.find((s) => Number(s.total_colegios) >= 2);
        expect(conVariosColegios).toBeTruthy();

        const dashboard = await superadminAgent.get(`/api/sostenedores/${conVariosColegios.id}/dashboard`);
        expect(dashboard.status).toBe(200);
        expect(dashboard.body.colegios.length).toBe(Number(conVariosColegios.total_colegios));
        dashboard.body.colegios.forEach((c) => {
            expect(c.casosAbiertos + c.casosCerrados).toBe(c.totalCasos);
        });
    });
});
