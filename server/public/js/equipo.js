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
            const especialidad = m.especialidad ? `<br><span class="text-[10px] text-purple-600">${m.especialidad}</span>` : "";
            tbody.innerHTML += `<tr>
                <td class="font-bold text-slate-700">${m.nombre}</td>
                <td class="text-slate-600 text-xs">${m.rolInstitucional}${especialidad}</td>
                <td><span class="badge ${badgePermiso} status-badge text-[10px]">${ETIQUETAS_PERMISO[m.rolPermiso] || m.rolPermiso}</span></td>
                <td class="text-end">${btnEliminar}</td>
            </tr>`;
        });
    }

    async function agregarMiembroEquipo(e) {
        e.preventDefault();
        const nombre = document.getElementById("eq-nombre").value.trim();
        const rol = document.getElementById("eq-rol").value.trim();
        const especialidad = document.getElementById("eq-especialidad").value;
        const email = document.getElementById("eq-email").value.trim();
        const rolPermiso = document.getElementById("eq-rol-permiso").value;
        const clave = document.getElementById("eq-password").value;

        try {
            await Api.apiFetch("/equipo", {
                method: "POST",
                body: JSON.stringify({ nombre, rol, rolPermiso, especialidad: especialidad || null, email: email || null, clave }),
            });
            document.getElementById("form-equipo").reset();
            await cargarEquipoCache();
            actualizarSelectoresEquipo();
            renderTablaEquipo();
            await renderProfesoresJefe();
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
            await renderProfesoresJefe();
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function renderProfesoresJefe() {
        const lista = document.getElementById("lista-profesores-jefe");
        if (!lista) return;
        const cursos = await Api.apiFetch("/cursos-profesor-jefe");
        lista.innerHTML = cursos.length
            ? cursos
                  .map(
                      (c) =>
                          `<div class="flex justify-between items-center bg-slate-50 px-2 py-1 rounded">
                              <span><b>${c.curso}</b> — ${c.profesorJefeNombre}</span>
                              <button onclick="Equipo.eliminarProfesorJefe(${c.id})" class="text-red-600 hover:underline">Quitar</button>
                          </div>`
                  )
                  .join("")
            : '<p class="text-slate-400 italic">Sin profesores jefe asignados.</p>';
    }

    async function agregarProfesorJefe(e) {
        e.preventDefault();
        const curso = document.getElementById("pj-curso").value.trim();
        const profesorJefeId = document.getElementById("pj-profesor").value;
        try {
            await Api.apiFetch("/cursos-profesor-jefe", { method: "POST", body: JSON.stringify({ curso, profesorJefeId }) });
            document.getElementById("form-profesor-jefe").reset();
            await renderProfesoresJefe();
            App.mostrarToast("Profesor jefe asignado.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function eliminarProfesorJefe(id) {
        await Api.apiFetch(`/cursos-profesor-jefe/${id}`, { method: "DELETE" });
        await renderProfesoresJefe();
    }

    return {
        cargarEquipoCache,
        actualizarSelectoresEquipo,
        renderTablaEquipo,
        agregarMiembroEquipo,
        eliminarMiembroEquipo,
        renderProfesoresJefe,
        agregarProfesorJefe,
        eliminarProfesorJefe,
    };
})();
