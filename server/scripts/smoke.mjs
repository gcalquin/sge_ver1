const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000/api";

let cookie = "";
let csrfToken = "";

function actualizarCookie(res) {
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
}

async function req(path, options = {}) {
    const headers = { ...(options.headers || {}), Cookie: cookie };
    if (options.body) headers["Content-Type"] = "application/json";
    if (options.method && options.method !== "GET") headers["X-CSRF-Token"] = csrfToken;

    const res = await fetch(`${BASE}${path}`, { ...options, headers });
    actualizarCookie(res);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
}

function assert(condicion, mensaje) {
    if (!condicion) throw new Error(`FALLO: ${mensaje}`);
    console.log(`OK: ${mensaje}`);
}

async function main() {
    let r = await req("/health");
    assert(r.status === 200 && r.data.ok === true && r.data.db === "up", "GET /health responde ok:true, db:up");

    r = await req("/csrf");
    csrfToken = r.data.csrfToken;
    assert(Boolean(csrfToken), "GET /csrf entrega un token");

    r = await req("/colegios/public");
    assert(r.status === 200 && r.data.length >= 2, "GET /colegios/public devuelve al menos 2 colegios");
    const gabrielaMistral = r.data.find((c) => c.nombre.includes("Gabriela Mistral"));
    const sanIgnacio = r.data.find((c) => c.nombre.includes("San Ignacio"));
    assert(gabrielaMistral && sanIgnacio, "Existen los colegios semilla Gabriela Mistral y San Ignacio");

    r = await req("/auth/login", {
        method: "POST",
        body: JSON.stringify({ ambito: "central", username: "superadmin", password: "super123" }),
    });
    assert(r.status === 200, "Login superadmin / super123 en ámbito central");
    csrfToken = r.data.csrfToken;

    r = await req("/auth/me");
    assert(r.data.usuario.rol === "superadmin", "GET /auth/me confirma rol superadmin");

    r = await req("/auth/contexto", { method: "POST", body: JSON.stringify({ colegioId: gabrielaMistral.id }) });
    assert(r.status === 200, "Superadmin entra al contexto de Gabriela Mistral");

    r = await req("/casos");
    assert(r.data.length === 2, "Gabriela Mistral tiene los 2 casos semilla");

    await req("/auth/contexto/salir", { method: "POST" });
    await req("/auth/logout", { method: "POST" });

    r = await req("/csrf");
    csrfToken = r.data.csrfToken;

    r = await req("/auth/login", {
        method: "POST",
        body: JSON.stringify({ ambito: gabrielaMistral.id, username: "admin", password: "admin123" }),
    });
    assert(r.status === 200, "Login admin/admin123 del colegio Gabriela Mistral");
    csrfToken = r.data.csrfToken;

    r = await req("/casos");
    assert(r.data.length === 2, "Admin de Gabriela Mistral ve sus 2 casos");

    await req("/auth/logout", { method: "POST" });

    r = await req("/csrf");
    csrfToken = r.data.csrfToken;

    r = await req("/auth/login", {
        method: "POST",
        body: JSON.stringify({ ambito: sanIgnacio.id, username: "admin", password: "admin123" }),
    });
    assert(r.status === 200, "Login admin/admin123 del colegio San Ignacio");
    csrfToken = r.data.csrfToken;

    r = await req("/casos");
    assert(r.data.length === 1, "Admin de San Ignacio ve solo su 1 caso (aislamiento entre colegios)");

    await req("/auth/logout", { method: "POST" });

    console.log("\nSMOKE TEST OK: todos los chequeos pasaron.");
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
