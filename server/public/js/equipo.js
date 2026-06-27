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
            const btnCapacitaciones = `<button onclick="Capacitaciones.abrirModal(${m.id}, '${m.nombre.replace(/'/g, "\\'")}')" class="text-purple-700 text-xs font-bold hover:underline me-2">Capacitaciones</button>`;
            const acciones = puedeGestionar
                ? btnCapacitaciones +
                  `<button onclick="Equipo.abrirEditarMiembro(${m.id})" class="text-blue-700 text-xs font-bold hover:underline me-2">Editar</button>` +
                  (esUnoMismo
                      ? `<span class="text-slate-300 text-xs italic">Tú</span>`
                      : `<button onclick="Equipo.eliminarMiembroEquipo(${m.id})" class="text-red-600 text-xs font-bold hover:underline">Remover</button>`)
                : btnCapacitaciones + `<span class="text-slate-300 text-xs italic">Protegido</span>`;
            const badgePermiso =
                m.rolPermiso === "admin"
                    ? "bg-primary"
                    : m.rolPermiso === "invitado"
                      ? "bg-secondary"
                      : "bg-success";
            const especialidad = m.especialidad ? `<br><span class="text-xs text-purple-600">${m.especialidad}</span>` : "";
            tbody.innerHTML += `<tr>
                <td class="font-bold text-slate-700">${m.nombre}</td>
                <td class="text-xs font-mono text-slate-500">${m.username}</td>
                <td class="text-slate-600 text-xs">${m.rolInstitucional}${especialidad}</td>
                <td><span class="badge ${badgePermiso} status-badge text-xs">${ETIQUETAS_PERMISO[m.rolPermiso] || m.rolPermiso}</span></td>
                <td class="text-end">${acciones}</td>
            </tr>`;
        });
    }

    async function agregarMiembroEquipo(e) {
        e.preventDefault();
        const nombre = document.getElementById("eq-nombre").value.trim();
        const rol = document.getElementById("eq-rol").value.trim();
        const especialidad = document.getElementById("eq-especialidad").value;
        const email = document.getElementById("eq-email").value.trim();
        const username = document.getElementById("eq-username").value.trim();
        const rolPermiso = document.getElementById("eq-rol-permiso").value;
        const clave = document.getElementById("eq-password").value;

        try {
            await Api.apiFetch("/equipo", {
                method: "POST",
                body: JSON.stringify({
                    nombre,
                    rol,
                    rolPermiso,
                    especialidad: especialidad || null,
                    email: email || null,
                    username: username || null,
                    clave,
                }),
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

    function abrirEditarMiembro(id) {
        const m = App.estado.equipoCache.find((x) => x.id === id);
        if (!m) return;
        document.getElementById("edeq-id").value = m.id;
        document.getElementById("edeq-nombre").value = m.nombre;
        document.getElementById("edeq-rol").value = m.rolInstitucional || "";
        document.getElementById("edeq-especialidad").value = m.especialidad || "";
        document.getElementById("edeq-rol-permiso").value = m.rolPermiso;
        document.getElementById("edeq-email").value = m.email || "";
        document.getElementById("edeq-username").value = m.username;
        document.getElementById("edeq-password").value = "";
        new bootstrap.Modal(document.getElementById("modalEditarEquipo")).show();
    }

    async function guardarEdicionMiembro(e) {
        e.preventDefault();
        const id = document.getElementById("edeq-id").value;
        const payload = {
            nombre: document.getElementById("edeq-nombre").value.trim(),
            rol: document.getElementById("edeq-rol").value.trim(),
            especialidad: document.getElementById("edeq-especialidad").value || null,
            rolPermiso: document.getElementById("edeq-rol-permiso").value,
            email: document.getElementById("edeq-email").value.trim() || null,
            username: document.getElementById("edeq-username").value.trim(),
        };
        const clave = document.getElementById("edeq-password").value;
        if (clave) payload.clave = clave;

        try {
            await Api.apiFetch(`/equipo/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
            bootstrap.Modal.getInstance(document.getElementById("modalEditarEquipo")).hide();
            await cargarEquipoCache();
            actualizarSelectoresEquipo();
            renderTablaEquipo();
            App.mostrarToast("Integrante actualizado.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function eliminarMiembroEquipo(id, nuevoResponsableId) {
        try {
            const body = nuevoResponsableId ? JSON.stringify({ nuevoResponsableId }) : undefined;
            await Api.apiFetch(`/equipo/${id}`, { method: "DELETE", body });
            await cargarEquipoCache();
            actualizarSelectoresEquipo();
            renderTablaEquipo();
            await renderProfesoresJefe();
        } catch (err) {
            if (err.data && err.data.requiereReasignacion) {
                abrirModalReasignacion(id, err.data.casosAsignados);
                return;
            }
            App.mostrarToast(err.message, "danger");
        }
    }

    function abrirModalReasignacion(usuarioId, casosAsignados) {
        document.getElementById("reas-usuario-id").value = usuarioId;
        document.getElementById("reas-lista-casos").innerHTML = casosAsignados
            .map((c) => `<div><i class="fa-solid fa-folder text-amber-500 me-1"></i>${c.folio}</div>`)
            .join("");

        const select = document.getElementById("reas-nuevo-responsable");
        select.innerHTML = "";
        App.estado.equipoCache
            .filter((m) => m.id !== Number(usuarioId) && (m.rolPermiso === "admin" || m.rolPermiso === "funcionario"))
            .forEach((m) => {
                select.innerHTML += `<option value="${m.id}">${m.nombre} (${m.rolInstitucional})</option>`;
            });

        new bootstrap.Modal(document.getElementById("modalReasignarCaso")).show();
    }

    async function confirmarReasignacionYEliminar(e) {
        e.preventDefault();
        const usuarioId = document.getElementById("reas-usuario-id").value;
        const nuevoResponsableId = document.getElementById("reas-nuevo-responsable").value;
        try {
            await Api.apiFetch(`/equipo/${usuarioId}`, {
                method: "DELETE",
                body: JSON.stringify({ nuevoResponsableId }),
            });
            bootstrap.Modal.getInstance(document.getElementById("modalReasignarCaso")).hide();
            await cargarEquipoCache();
            actualizarSelectoresEquipo();
            renderTablaEquipo();
            await renderProfesoresJefe();
            App.mostrarToast("Casos reasignados e integrante removido.", "success");
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
        abrirEditarMiembro,
        guardarEdicionMiembro,
        eliminarMiembroEquipo,
        confirmarReasignacionYEliminar,
        renderProfesoresJefe,
        agregarProfesorJefe,
        eliminarProfesorJefe,
    };
})();
