const Casos = (() => {
    async function renderTablaCasos() {
        const fEstado = document.getElementById("filter-estado").value;
        const fCat = document.getElementById("filter-categoria").value;
        const fResp = document.getElementById("filter-responsable").value;
        const fSearch = document.getElementById("filter-search").value;

        const params = new URLSearchParams({ estado: fEstado, categoria: fCat, responsable: fResp, search: fSearch });
        const tbody = document.getElementById("tabla-casos-body");
        tbody.innerHTML = "";

        const casos = await Api.apiFetch(`/casos?${params}`);

        casos.forEach((c) => {
            let badgeColor = c.estado === "Abierto" ? "bg-danger" : c.estado === "Cerrado" ? "bg-success" : "bg-warning text-dark";
            tbody.innerHTML += `
                <tr>
                    <td class="px-4 py-3"><div class="font-bold text-slate-800">${c.folio}</div><div class="text-xs text-slate-500">${c.estudiante}</div></td>
                    <td class="px-4 py-3 text-xs">${c.categoria}</td>
                    <td class="px-4 py-3 text-xs">${c.fechaApertura}</td>
                    <td class="px-4 py-3 text-xs font-semibold">${c.diasActivo} de Permanencia</td>
                    <td class="px-4 py-3 text-xs">${c.responsablePrincipal}</td>
                    <td class="px-4 py-3"><span class="badge ${badgeColor} status-badge text-[10px]">${c.estado}</span></td>
                    <td class="px-4 py-3 text-end">
                        <button onclick="Casos.verDetalleCaso(${c.id})" class="btn btn-xs btn-primary bg-slate-800 border-0 text-xs"><i class="fa-solid fa-folder-open"></i></button>
                    </td>
                </tr>
            `;
        });
    }

    async function verDetalleCaso(id) {
        App.estado.casoSeleccionadoId = id;
        try {
            App.estado.casoActual = await Api.apiFetch(`/casos/${id}`);
        } catch (err) {
            App.mostrarToast(err.message, "danger");
            return;
        }
        renderDetalleCasoUI(App.estado.casoActual);
        App.switchView("detalle");
    }

    function renderDetalleCasoUI(caso) {
        document.getElementById("det-id").innerText = caso.folio;
        document.getElementById("det-estudiante").innerText = caso.estudiante;
        document.getElementById("det-categoria").innerText = caso.categoria;
        document.getElementById("det-descripcion").innerText = caso.descripcion;
        document.getElementById("det-fecha-apertural").innerText = caso.fechaApertura;
        document.getElementById("det-dias-abierto").innerText = `${caso.diasActivo} Días Activo`;
        document.getElementById("det-resp-principal").innerText = caso.responsablePrincipal;
        document.getElementById("btn-det-pdf").href = `${Api.API_BASE}/casos/${caso.id}/pdf`;

        const badge = document.getElementById("det-badge-estado");
        badge.className =
            "badge status-badge " +
            (caso.estado === "Abierto" ? "bg-danger" : caso.estado === "Cerrado" ? "bg-success" : "bg-warning text-dark");
        badge.innerText = caso.estado;

        const panelAcciones = document.getElementById("panel-operacional-acciones");
        if (caso.estado === "Cerrado" || App.estado.currentUser.rol === "invitado") {
            panelAcciones.classList.add("hidden");
        } else {
            panelAcciones.classList.remove("hidden");
        }

        Bitacora.renderBitacora(caso.bitacora, caso.id);
    }

    function generarCitacionApoderado() {
        const caso = App.estado.casoActual;
        if (!caso) return;

        const plantilla = `COLEGIO\nDEPARTAMENTO DE CONVIVENCIA ESCOLAR\n\nREF: CITACIÓN OFICIAL DE APODERADO - ${caso.folio}\n\nEstimado(a) Apoderado(a) de ${caso.estudiante}:\n\nPor medio de la presente, se le cita formalmente a una entrevista presencial de carácter obligatorio...\n\nAtentamente,\nEquipo Multidisciplinario`;
        document.getElementById("txt-citacion-cuerpo").value = plantilla;
        new bootstrap.Modal(document.getElementById("modalCitacion")).show();
    }

    function openModalApertura() {
        if (App.estado.currentUser.rol === "invitado") return;
        document.getElementById("in-fecha").value = new Date().toISOString().split("T")[0];
        new bootstrap.Modal(document.getElementById("modalApertura")).show();
    }

    async function guardarNuevoCaso(e) {
        e.preventDefault();
        const payload = {
            estudiante: document.getElementById("in-estudiante").value,
            fechaApertura: document.getElementById("in-fecha").value,
            categoria: document.getElementById("in-categoria").value,
            responsableId: parseInt(document.getElementById("in-responsable").value, 10),
            descripcion: document.getElementById("in-descripcion").value,
        };

        try {
            await Api.apiFetch("/casos", { method: "POST", body: JSON.stringify(payload) });
            document.getElementById("form-apertura").reset();
            bootstrap.Modal.getInstance(document.getElementById("modalApertura")).hide();
            App.mostrarToast("Caso creado correctamente.", "success");
            App.switchView("casos");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    function openModalCierre() {
        if (App.estado.currentUser.rol === "invitado") return;
        document.getElementById("in-cierre-fecha").value = new Date().toISOString().split("T")[0];
        document.getElementById("in-cierre-operador-label").value = App.estado.currentUser.nombre;
        new bootstrap.Modal(document.getElementById("modalCierre")).show();
    }

    async function guardarCierreCaso(e) {
        e.preventDefault();
        const payload = {
            cierre: {
                fecha: document.getElementById("in-cierre-fecha").value,
                motivo: document.getElementById("in-cierre-motivo").value,
                evaluacion: document.getElementById("in-cierre-evaluacion").value,
            },
        };

        try {
            App.estado.casoActual = await Api.apiFetch(`/casos/${App.estado.casoSeleccionadoId}`, {
                method: "PATCH",
                body: JSON.stringify(payload),
            });
            bootstrap.Modal.getInstance(document.getElementById("modalCierre")).hide();
            renderDetalleCasoUI(App.estado.casoActual);
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    return {
        renderTablaCasos,
        verDetalleCaso,
        renderDetalleCasoUI,
        generarCitacionApoderado,
        openModalApertura,
        guardarNuevoCaso,
        openModalCierre,
        guardarCierreCaso,
    };
})();
