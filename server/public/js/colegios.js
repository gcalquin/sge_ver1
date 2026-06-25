const Colegios = (() => {
    let sostenedoresCache = [];

    async function cargarAmbitos() {
        const select = document.getElementById("auth-ambito");
        const colegios = await fetch(`${Api.API_BASE}/colegios/public`).then((r) => r.json());
        [...select.querySelectorAll("option[data-colegio]")].forEach((opt) => opt.remove());
        colegios.forEach((c) => {
            const opt = document.createElement("option");
            opt.value = c.id;
            opt.dataset.colegio = "1";
            opt.innerText = c.nombre;
            select.appendChild(opt);
        });
    }

    async function cargarSostenedores() {
        sostenedoresCache = await Api.apiFetch("/sostenedores");
        const select = document.getElementById("col-sostenedor");
        select.innerHTML = '<option value="">Sin sostenedor asignado</option>';
        sostenedoresCache.forEach((s) => {
            select.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
        });

        const lista = document.getElementById("lista-sostenedores");
        lista.innerHTML = sostenedoresCache.length
            ? sostenedoresCache
                  .map(
                      (s) =>
                          `<div class="flex justify-between items-center bg-slate-50 px-2 py-1 rounded">
                              <span>${s.nombre} <span class="text-slate-400">(${s.total_colegios} colegio/s)</span></span>
                          </div>`
                  )
                  .join("")
            : '<p class="text-slate-400 italic">Sin sostenedores registrados.</p>';
    }

    async function crearSostenedor(e) {
        e.preventDefault();
        const nombre = document.getElementById("sost-nombre").value.trim();
        const rut = document.getElementById("sost-rut").value.trim();
        try {
            await Api.apiFetch("/sostenedores", { method: "POST", body: JSON.stringify({ nombre, rut: rut || null }) });
            document.getElementById("form-sostenedor").reset();
            await cargarSostenedores();
            App.mostrarToast("Sostenedor creado.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function renderPanelCentral() {
        await cargarSostenedores();
        const colegios = await Api.apiFetch("/colegios");
        const tbody = document.getElementById("tabla-colegios-body");
        tbody.innerHTML = "";
        colegios.forEach((c) => {
            const badge = c.activo
                ? '<span class="badge bg-success status-badge text-[10px]">Activo</span>'
                : '<span class="badge bg-secondary status-badge text-[10px]">Inactivo</span>';
            tbody.innerHTML += `
                <tr>
                    <td class="font-bold text-slate-700">${c.nombre}</td>
                    <td class="text-xs font-mono text-slate-600">${c.rbd || "-"}</td>
                    <td class="text-xs text-slate-600">${c.sostenedor_nombre || "-"}</td>
                    <td class="text-xs text-slate-600">${c.comuna || "-"}</td>
                    <td>${badge}</td>
                    <td class="text-xs">${c.total_usuarios}</td>
                    <td class="text-xs">${c.total_casos}</td>
                    <td class="text-end space-x-1">
                        <button onclick="Colegios.toggleActivo(${c.id}, ${!c.activo})" class="btn btn-xs btn-outline-secondary text-[11px]">
                            ${c.activo ? "Desactivar" : "Activar"}
                        </button>
                        <button onclick="Colegios.entrarContexto(${c.id})" class="btn btn-xs btn-primary bg-blue-800 border-0 text-[11px]">
                            Entrar
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    async function crearColegio(e) {
        e.preventDefault();
        const nombre = document.getElementById("col-nombre").value.trim();
        const rbd = document.getElementById("col-rbd").value.trim();
        const sostenedorId = document.getElementById("col-sostenedor").value;
        const comuna = document.getElementById("col-comuna").value.trim();
        const direccion = document.getElementById("col-direccion").value.trim();

        try {
            await Api.apiFetch("/colegios", {
                method: "POST",
                body: JSON.stringify({ nombre, rbd: rbd || null, sostenedorId: sostenedorId || null, comuna, direccion }),
            });
            document.getElementById("form-colegio").reset();
            await cargarAmbitos();
            renderPanelCentral();
            App.mostrarToast("Colegio creado correctamente.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function toggleActivo(id, nuevoEstado) {
        try {
            await Api.apiFetch(`/colegios/${id}`, { method: "PATCH", body: JSON.stringify({ activo: nuevoEstado }) });
            await cargarAmbitos();
            renderPanelCentral();
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function entrarContexto(colegioId) {
        try {
            await Api.apiFetch("/auth/contexto", { method: "POST", body: JSON.stringify({ colegioId }) });
            await Auth.verificarSesionExistente();
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function salirContexto() {
        try {
            await Api.apiFetch("/auth/contexto/salir", { method: "POST" });
            await Auth.verificarSesionExistente();
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    return { cargarAmbitos, renderPanelCentral, crearColegio, crearSostenedor, toggleActivo, entrarContexto, salirContexto };
})();
