const Colegios = (() => {
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

    async function renderPanelCentral() {
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
        const comuna = document.getElementById("col-comuna").value.trim();
        const direccion = document.getElementById("col-direccion").value.trim();

        try {
            await Api.apiFetch("/colegios", { method: "POST", body: JSON.stringify({ nombre, comuna, direccion }) });
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

    return { cargarAmbitos, renderPanelCentral, crearColegio, toggleActivo, entrarContexto, salirContexto };
})();
