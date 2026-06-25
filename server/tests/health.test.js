import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";

describe("GET /api/colegios/public", () => {
    let app;

    beforeAll(async () => {
        const path = require("path");
        require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
        app = (await import("../src/app.js")).default;
    });

    it("responde 200 con un arreglo (sin requerir sesión)", async () => {
        const res = await request(app).get("/api/colegios/public");
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});
