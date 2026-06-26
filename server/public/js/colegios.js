const Colegios = (() => {
    let sostenedoresCache = [];
    let colegiosCache = [];

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

    function llenarSelectSostenedor(select) {
        select.innerHTML = '<option value="">Sin sostenedor asignado</option>';
        sostenedoresCache.forEach((s) => {
            select.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
        });
    }

    async function cargarSostenedores() {
        sostenedoresCache = await Api.apiFetch("/sostenedores");
        llenarSelectSostenedor(document.getElementById("col-sostenedor"));

        const lista = document.getElementById("lista-sostenedores");
        lista.innerHTML = sostenedoresCache.length
            ? sostenedoresCache
                  .map(
                      (s) =>
                          `<div class="flex justify-between items-center bg-slate-50 px-2 py-1 rounded">
                              <span>${s.nombre} <span class="text-slate-400">(${s.total_colegios} colegio/s)</span></span>
                              <span class="space-x-2">
                                  <button onclick="Colegios.abrirEditarSostenedor(${s.id})" class="text-blue-700 hover:underline">Editar</button>
                                  <button onclick="Colegios.eliminarSostenedor(${s.id})" class="text-red-600 hover:underline">Eliminar</button>
                              </span>
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

    function abrirEditarSostenedor(id) {
        const s = sostenedoresCache.find((x) => x.id === id);
        if (!s) return;
        document.getElementById("edsost-id").value = s.id;
        document.getElementById("edsost-nombre").value = s.nombre;
        document.getElementById("edsost-rut").value = s.rut || "";
        new bootstrap.Modal(document.getElementById("modalEditarSostenedor")).show();
    }

    async function guardarEdicionSostenedor(e) {
        e.preventDefault();
        const id = document.getElementById("edsost-id").value;
        const nombre = document.getElementById("edsost-nombre").value.trim();
        const rut = document.getElementById("edsost-rut").value.trim();
        try {
            await Api.apiFetch(`/sostenedores/${id}`, { method: "PATCH", body: JSON.stringify({ nombre, rut: rut || null }) });
            bootstrap.Modal.getInstance(document.getElementById("modalEditarSostenedor")).hide();
            await cargarSostenedores();
            App.mostrarToast("Sostenedor actualizado.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function eliminarSostenedor(id) {
        try {
            await Api.apiFetch(`/sostenedores/${id}`, { method: "DELETE" });
            await cargarSostenedores();
            App.mostrarToast("Sostenedor eliminado.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function renderPanelCentral() {
        await cargarSostenedores();
        colegiosCache = await Api.apiFetch("/colegios");
        const tbody = document.getElementById("tabla-colegios-body");
        tbody.innerHTML = "";
        colegiosCache.forEach((c) => {
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
                        <button onclick="Colegios.abrirEditarColegio(${c.id})" class="btn btn-xs btn-outline-secondary text-[11px]">
                            Editar
                        </button>
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

    function abrirEditarColegio(id) {
        const c = colegiosCache.find((x) => x.id === id);
        if (!c) return;
        document.getElementById("edcol-id").value = c.id;
        document.getElementById("edcol-nombre").value = c.nombre;
        document.getElementById("edcol-rbd").value = c.rbd || "";
        document.getElementById("edcol-comuna").value = c.comuna || "";
        document.getElementById("edcol-direccion").value = c.direccion || "";
        document.getElementById("edcol-logo-file").value = "";
        llenarSelectSostenedor(document.getElementById("edcol-sostenedor"));
        document.getElementById("edcol-sostenedor").value = c.sostenedor_id || "";

        const preview = document.getElementById("edcol-logo-preview");
        const vacio = document.getElementById("edcol-logo-vacio");
        const btnQuitar = document.getElementById("edcol-btn-quitar-logo");
        if (c.logo_data_uri) {
            preview.src = c.logo_data_uri;
            preview.classList.remove("hidden");
            vacio.classList.add("hidden");
            btnQuitar.classList.remove("hidden");
        } else {
            preview.classList.add("hidden");
            vacio.classList.remove("hidden");
            btnQuitar.classList.add("hidden");
        }

        new bootstrap.Modal(document.getElementById("modalEditarColegio")).show();
    }

    async function guardarEdicionColegio(e) {
        e.preventDefault();
        const id = document.getElementById("edcol-id").value;
        const payload = {
            nombre: document.getElementById("edcol-nombre").value.trim(),
            rbd: document.getElementById("edcol-rbd").value.trim() || null,
            sostenedorId: document.getElementById("edcol-sostenedor").value || null,
            comuna: document.getElementById("edcol-comuna").value.trim() || null,
            direccion: document.getElementById("edcol-direccion").value.trim() || null,
        };
        const archivo = document.getElementById("edcol-logo-file").files[0];

        try {
            await Api.apiFetch(`/colegios/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

            if (archivo) {
                const formData = new FormData();
                formData.append("logo", archivo);
                await Api.subirArchivo(`/colegios/${id}/logo`, formData);
            }

            bootstrap.Modal.getInstance(document.getElementById("modalEditarColegio")).hide();
            await cargarAmbitos();
            await renderPanelCentral();
            if (App.estado.colegioActual && App.estado.colegioActual.id === Number(id)) {
                await Auth.verificarSesionExistente();
            }
            App.mostrarToast("Colegio actualizado.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function quitarLogoColegio() {
        const id = document.getElementById("edcol-id").value;
        try {
            await Api.apiFetch(`/colegios/${id}`, { method: "PATCH", body: JSON.stringify({ logoDataUri: null }) });
            document.getElementById("edcol-logo-preview").classList.add("hidden");
            document.getElementById("edcol-logo-vacio").classList.remove("hidden");
            document.getElementById("edcol-btn-quitar-logo").classList.add("hidden");
            await renderPanelCentral();
            if (App.estado.colegioActual && App.estado.colegioActual.id === Number(id)) {
                await Auth.verificarSesionExistente();
            }
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

    return {
        cargarAmbitos,
        renderPanelCentral,
        crearColegio,
        crearSostenedor,
        abrirEditarSostenedor,
        guardarEdicionSostenedor,
        eliminarSostenedor,
        toggleActivo,
        abrirEditarColegio,
        guardarEdicionColegio,
        quitarLogoColegio,
        entrarContexto,
        salirContexto,
    };
})();
