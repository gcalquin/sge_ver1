const Equipo = (() => {
    async function cargarEquipoCache() {
        App.estado.equipoCache = await Api.apiFetch("/equipo");
    }

    function actualizarSelectoresEquipo() {
        const selectoresDinamicos = document.querySelectorAll(".selector-dinamico-equipo");
        selectoresDinamicos.forEach((select) => (select.innerHTML = ""));

        const filterResp = document.getElementById("filter-responsable");
        if (filterResp) filterResp.innerHTML = `<option value="Todos">Todos los responsables</option>`;

        App.estado.equipoCache.forEach((m) => {
            selectoresDinamicos.forEach((select) => {
                select.innerHTML += `<option value="${m.id}">${m.nombre} (${m.rol})</option>`;
            });
            if (filterResp) filterResp.innerHTML += `<option value="${m.nombre}">${m.nombre}</option>`;
        });
    }

    function renderTablaEquipo() {
        const tbody = document.getElementById("tabla-equipo-body");
        tbody.innerHTML = "";
        const puedeGestionar = App.estado.currentUser.rol === "admin" || App.estado.currentUser.rol === "superadmin";
        App.estado.equipoCache.forEach((m) => {
            const btnEliminar = puedeGestionar
                ? `<button onclick="Equipo.eliminarMiembroEquipo(${m.id})" class="text-red-600 text-xs font-bold hover:underline">Remover</button>`
                : `<span class="text-slate-300 text-xs italic">Protegido</span>`;
            tbody.innerHTML += `<tr><td class="font-bold text-slate-700">${m.nombre}</td><td class="text-slate-600 text-xs">${m.rol}</td><td class="text-end">${btnEliminar}</td></tr>`;
        });
    }

    async function agregarMiembroEquipo(e) {
        e.preventDefault();
        const nombre = document.getElementById("eq-nombre").value.trim();
        const rol = document.getElementById("eq-rol").value.trim();
        const clave = document.getElementById("eq-password").value;

        try {
            await Api.apiFetch("/equipo", { method: "POST", body: JSON.stringify({ nombre, rol, clave }) });
            document.getElementById("form-equipo").reset();
            await cargarEquipoCache();
            actualizarSelectoresEquipo();
            renderTablaEquipo();
            App.mostrarToast("Funcionario habilitado.", "success");
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
