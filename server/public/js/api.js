const Api = (() => {
    const API_BASE = "/api";
    let csrfToken = null;

    async function obtenerCsrf() {
        const res = await fetch(`${API_BASE}/csrf`, { credentials: "same-origin" });
        const data = await res.json();
        csrfToken = data.csrfToken;
        return csrfToken;
    }

    async function apiFetch(path, options = {}) {
        const metodo = (options.method || "GET").toUpperCase();
        const headers = { ...(options.headers || {}) };

        if (options.body) headers["Content-Type"] = "application/json";
        if (metodo !== "GET" && metodo !== "HEAD") {
            if (!csrfToken) await obtenerCsrf();
            headers["X-CSRF-Token"] = csrfToken;
        }

        App.mostrarCargando(true);
        try {
            const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "same-origin" });

            if (res.status === 401) {
                Auth.cerrarSesion();
                throw new Error("Sesión inválida o expirada.");
            }
            if (!res.ok) {
                let data = {};
                try {
                    data = await res.json();
                } catch (e) {}
                const error = new Error(data.error || "Error en la solicitud.");
                error.data = data;
                throw error;
            }
            if (res.status === 204) return null;
            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("application/json")) return res.json();
            return res;
        } finally {
            App.mostrarCargando(false);
        }
    }

    async function subirArchivo(path, formData) {
        if (!csrfToken) await obtenerCsrf();
        App.mostrarCargando(true);
        try {
            const res = await fetch(`${API_BASE}${path}`, {
                method: "POST",
                body: formData,
                headers: { "X-CSRF-Token": csrfToken },
                credentials: "same-origin",
            });
            if (!res.ok) {
                let mensaje = "No se pudo subir el archivo.";
                try {
                    mensaje = (await res.json()).error || mensaje;
                } catch (e) {}
                throw new Error(mensaje);
            }
            return res.json();
        } finally {
            App.mostrarCargando(false);
        }
    }

    function setCsrfToken(token) {
        csrfToken = token;
    }

    function resetCsrfToken() {
        csrfToken = null;
    }

    return { API_BASE, apiFetch, obtenerCsrf, subirArchivo, setCsrfToken, resetCsrfToken };
})();
