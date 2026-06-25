const Equipo = (() => {
    const ETIQUETAS_PERMISO = { admin: "Administrador", funcionario: "Funcionario", invitado: "Invitado" };

    async function cargarEquipoCache() {
        App.estado.equipoCache = await Api.apiFetch("/equipo");
    }

    function actualizarSelectoresEquipo() {
        const selectoresDinamicos = document.querySelectorAll(".selector-dinamico-equipo");
        selectoresDinamicos.forEach((select) => (select.innerHTML = ""));

        const filterResp = document.getElementById("filter-responsable");
        if (filterResp) filterResp.innerHTML = `<option value="Todos">Todos los responsables</option>`;

        // Sólo admin/funcionario pueden ser responsables de un caso (invitado es solo lectura).
        const asignables = App.estado.equipoCache.filter((m) => m.rolPermiso === "admin" || m.rolPermiso === "funcionario");

        asignables.forEach((m) => {
            selectoresDinamicos.forEach((select) => {
                select.innerHTML += `<option value="${m.id}">${m.nombre} (${m.rolInstitucional})</option>`;
            });
            if (filterResp) filterResp.innerHTML += `<option value="${m.nombre}">${m.nombre}</option>`;
        });
    }

    function renderTablaEquipo() {
        const tbody = document.getElementById("tabla-equipo-body");
        tbody.innerHTML = "";
        const puedeGestionar = App.estado.currentUser.rol === "admin" || App.estado.currentUser.rol === "superadmin";
        App.estado.equipoCache.forEach((m) => {
            const esUnoMismo = m.id === App.estado.currentUser.id;
            const btnEliminar = esUnoMismo
                ? `<span class="text-slate-300 text-xs italic">Tú</span>`
                : puedeGestionar
                  ? `<button onclick="Equipo.eliminarMiembroEquipo(${m.id})" class="text-red-600 text-xs font-bold hover:underline">Remover</button>`
                  : `<span class="text-slate-300 text-xs italic">Protegido</span>`;
            const badgePermiso =
                m.rolPermiso === "admin"
                    ? "bg-primary"
                    : m.rolPermiso === "invitado"
                      ? "bg-secondary"
                      : "bg-success";
            tbody.innerHTML += `<tr>
                <td class="font-bold text-slate-700">${m.nombre}</td>
                <td class="text-slate-600 text-xs">${m.rolInstitucional}</td>
                <td><span class="badge ${badgePermiso} status-badge text-[10px]">${ETIQUETAS_PERMISO[m.rolPermiso] || m.rolPermiso}</span></td>
                <td class="text-end">${btnEliminar}</td>
            </tr>`;
        });
    }

    async function agregarMiembroEquipo(e) {
        e.preventDefault();
        const nombre = document.getElementById("eq-nombre").value.trim();
        const rol = document.getElementById("eq-rol").value.trim();
        const rolPermiso = document.getElementById("eq-rol-permiso").value;
        const clave = document.getElementById("eq-password").value;

        try {
            await Api.apiFetch("/equipo", { method: "POST", body: JSON.stringify({ nombre, rol, rolPermiso, clave }) });
            document.getElementById("form-equipo").reset();
            await cargarEquipoCache();
            actualizarSelectoresEquipo();
            renderTablaEquipo();
            App.mostrarToast("Integrante habilitado.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function eliminarMiembroEquipo(id) {
        try {
            await Api.apiFetch(`/equipo/${id}`, { method: "DELETE" });
            await cargarEquipoCache();
            actualizarSelectoresEquipo();
            renderTablaEquipo();
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    return { cargarEquipoCache, actualizarSelectoresEquipo, renderTablaEquipo, agregarMiembroEquipo, eliminarMiembroEquipo };
})();
