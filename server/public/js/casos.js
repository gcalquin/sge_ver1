const Casos = (() => {
    const TAMANO_PAGINA = 50;
    let paginaActual = 0;

    function filtrosCambiaron() {
        paginaActual = 0;
        renderTablaCasos();
    }

    async function irPaginaAnterior() {
        if (paginaActual === 0) return;
        paginaActual -= 1;
        await renderTablaCasos();
    }

    async function irPaginaSiguiente() {
        paginaActual += 1;
        await renderTablaCasos();
    }

    async function renderTablaCasos() {
        const fEstado = document.getElementById("filter-estado").value;
        const fCat = document.getElementById("filter-categoria").value;
        const fResp = document.getElementById("filter-responsable").value;
        const fSearch = document.getElementById("filter-search").value;

        const params = new URLSearchParams({
            estado: fEstado,
            categoria: fCat,
            responsable: fResp,
            search: fSearch,
            limit: TAMANO_PAGINA,
            offset: paginaActual * TAMANO_PAGINA,
        });
        const tbody = document.getElementById("tabla-casos-body");
        tbody.innerHTML = "";

        const { casos, total } = await Api.apiFetch(`/casos?${params}`);
        renderPaginacion(total, casos.length);

        casos.forEach((c) => {
            let badgeColor =
                c.estado === "Abierto"
                    ? "bg-danger"
                    : c.estado === "Cerrado"
                      ? "bg-success"
                      : "bg-amber-600 text-white";
            const alerta = c.alertaCritica
                ? `<span class="badge bg-danger status-badge text-xs ms-1" data-bs-toggle="tooltip" title="Sin nueva entrada de bitácora hace ${c.diasInactivo} día(s), supera el umbral de alerta crítica."><i class="fa-solid fa-triangle-exclamation"></i> Crítico</span>`
                : "";
            const masEstudiantes =
                Number(c.estudiantesAdicionalesCount) > 0
                    ? `<span class="text-slate-400" data-bs-toggle="tooltip" title="Caso con ${c.estudiantesAdicionalesCount} estudiante(s) adicional(es) involucrado(s).">+${c.estudiantesAdicionalesCount} más</span>`
                    : "";
            tbody.innerHTML += `
                <tr>
                    <td class="px-4 py-3"><div class="font-bold text-slate-800">${App.escapeHtml(c.folio)}</div><div class="text-xs text-slate-500">${App.escapeHtml(c.estudiante)} ${masEstudiantes}</div></td>
                    <td class="px-4 py-3 text-xs">${App.escapeHtml(c.categoria)}</td>
                    <td class="px-4 py-3 text-xs">${App.escapeHtml(c.fechaApertura)}</td>
                    <td class="px-4 py-3 text-xs font-semibold">${c.diasActivo} de Permanencia</td>
                    <td class="px-4 py-3 text-xs">${App.escapeHtml(c.responsablePrincipal)}</td>
                    <td class="px-4 py-3"><span class="badge ${badgeColor} status-badge text-xs">${c.estado}</span>${alerta}</td>
                    <td class="px-4 py-3 text-end">
                        <button onclick="Casos.verDetalleCaso(${c.id})" class="btn btn-xs btn-primary bg-slate-800 border-0 text-xs"><i class="fa-solid fa-folder-open"></i></button>
                    </td>
                </tr>
            `;
        });
        App.inicializarTooltips();
    }

    function renderPaginacion(total, cantidadEnPagina) {
        const desde = total === 0 ? 0 : paginaActual * TAMANO_PAGINA + 1;
        const hasta = paginaActual * TAMANO_PAGINA + cantidadEnPagina;
        document.getElementById("casos-paginacion-info").innerText = `Mostrando ${desde}-${hasta} de ${total} caso(s)`;
        document.getElementById("btn-casos-pag-anterior").disabled = paginaActual === 0;
        document.getElementById("btn-casos-pag-siguiente").disabled = hasta >= total;
    }

    function exportarPdfsZip() {
        const fEstado = document.getElementById("filter-estado").value;
        const fCat = document.getElementById("filter-categoria").value;
        const fResp = document.getElementById("filter-responsable").value;
        const fSearch = document.getElementById("filter-search").value;
        const params = new URLSearchParams({ estado: fEstado, categoria: fCat, responsable: fResp, search: fSearch });
        window.location.href = `${Api.API_BASE}/casos/export-pdf-zip?${params}`;
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
        bootstrap.Tab.getOrCreateInstance(
            document.querySelector('#tabs-detalle-caso button[data-bs-target="#tab-bitacora"]')
        ).show();
        App.switchView("detalle");
    }

    function renderDetalleCasoUI(caso) {
        document.getElementById("det-id").innerText = caso.folio;
        document.getElementById("det-estudiante").innerText = caso.estudiante;
        renderEstudiantesAdicionalesDetalle(caso);
        document.getElementById("det-categoria").innerText = caso.categoria;
        document.getElementById("det-descripcion").innerText = caso.descripcion;
        document.getElementById("det-fecha-apertural").innerText = caso.fechaApertura;
        document.getElementById("det-dias-abierto").innerText = `${caso.diasActivo} Días Activo`;
        document.getElementById("det-resp-principal").innerText = caso.responsablePrincipal;
        document.getElementById("det-curso").innerText = caso.curso || "-";
        document.getElementById("btn-det-pdf").href = `${Api.API_BASE}/casos/${caso.id}/pdf`;

        document.getElementById("print-header-colegio").innerText = caso.colegioNombre
            ? `${caso.colegioNombre}${caso.colegioRbd ? ` (RBD ${caso.colegioRbd})` : ""}`
            : "";
        document.getElementById("print-header-fecha").innerText =
            `Documento generado el ${new Date().toLocaleString("es-CL")}`;

        document.getElementById("det-pie-wrap").classList.toggle("hidden", !caso.tieneNee);
        document.getElementById("det-pie-diagnostico").innerText = caso.diagnosticoPie || "";
        document.getElementById("det-junaeb-wrap").classList.toggle("hidden", !caso.beneficiosJunaeb);
        document.getElementById("det-junaeb").innerText = caso.beneficiosJunaeb || "-";

        document
            .getElementById("banner-denuncia-obligatoria")
            .classList.toggle("hidden", !caso.denunciaObligatoriaPendiente);

        const badge = document.getElementById("det-badge-estado");
        badge.className =
            "badge status-badge " +
            (caso.estado === "Abierto"
                ? "bg-danger"
                : caso.estado === "Cerrado"
                  ? "bg-success"
                  : "bg-amber-600 text-white");
        badge.innerText = caso.estado;

        const puedeEscribir = caso.estado !== "Cerrado" && App.estado.currentUser.rol !== "invitado";

        const panelAcciones = document.getElementById("panel-operacional-acciones");
        panelAcciones.classList.toggle("hidden", !puedeEscribir);

        ["form-derivacion"].forEach((idForm) => {
            const form = document.getElementById(idForm);
            form.classList.toggle("opacity-40", !puedeEscribir);
            form.classList.toggle("pointer-events-none", !puedeEscribir);
        });
        document.getElementById("form-estudiante-adicional-wrap").classList.toggle("hidden", !puedeEscribir);

        Bitacora.renderBitacora(caso.bitacora, caso.id);
        renderPasosProtocolo(caso);
        renderDerivaciones(caso);
        Mediaciones.render(caso);

        document.getElementById("tab-badge-bitacora").innerText = (caso.bitacora || []).length;
        document.getElementById("tab-badge-protocolo").innerText = (caso.pasosProtocolo || []).length;
        document.getElementById("tab-badge-derivaciones").innerText = (caso.derivaciones || []).length;
        document.getElementById("tab-badge-mediaciones").innerText = (caso.mediaciones || []).length;
    }

    function renderEstudiantesAdicionalesDetalle(caso) {
        const wrap = document.getElementById("det-estudiantes-adicionales-wrap");
        const lista = document.getElementById("det-estudiantes-adicionales-lista");
        const adicionales = caso.estudiantesAdicionales || [];
        wrap.classList.toggle("hidden", adicionales.length === 0);
        const puedeEscribir = caso.estado !== "Cerrado" && App.estado.currentUser.rol !== "invitado";
        lista.innerHTML = adicionales
            .map(
                (e) => `<span class="badge bg-slate-100 text-slate-700 status-badge text-xs">
                    ${App.escapeHtml(e.nombre)}
                    ${puedeEscribir ? `<i class="fa-solid fa-xmark ms-1 no-print" style="cursor:pointer" onclick="Casos.eliminarEstudianteAdicionalDetalle(${e.id})" title="Quitar"></i>` : ""}
                </span>`
            )
            .join("");
    }

    async function agregarEstudianteAdicionalDetalle() {
        const input = document.getElementById("det-nuevo-estudiante-adicional");
        const nombre = input.value.trim();
        if (!nombre) return;
        try {
            App.estado.casoActual = await Api.apiFetch(
                `/casos/${App.estado.casoSeleccionadoId}/estudiantes-adicionales`,
                {
                    method: "POST",
                    body: JSON.stringify({ nombre }),
                }
            );
            input.value = "";
            renderDetalleCasoUI(App.estado.casoActual);
            App.mostrarToast("Estudiante agregado al caso.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function eliminarEstudianteAdicionalDetalle(estId) {
        try {
            App.estado.casoActual = await Api.apiFetch(
                `/casos/${App.estado.casoSeleccionadoId}/estudiantes-adicionales/${estId}`,
                {
                    method: "DELETE",
                }
            );
            renderDetalleCasoUI(App.estado.casoActual);
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    function renderPasosProtocolo(caso) {
        document.getElementById("det-protocolo-normativa").innerText = caso.protocoloNombre
            ? `${caso.protocoloNombre} — ${caso.protocoloNormativa}`
            : "";

        const cont = document.getElementById("lista-pasos-protocolo");
        const puedeEscribir = caso.estado !== "Cerrado" && App.estado.currentUser.rol !== "invitado";
        const hoy = new Date().toISOString().slice(0, 10);
        cont.innerHTML = (caso.pasosProtocolo || [])
            .map((p) => {
                const vencido = !p.completado && p.fechaLimite && p.fechaLimite < hoy;
                return `<div class="flex items-start gap-2 p-1.5 rounded ${vencido ? "bg-red-50" : ""}">
                    <input type="checkbox" class="form-check-input mt-0.5" ${p.completado ? "checked" : ""} ${puedeEscribir ? "" : "disabled"}
                        onchange="Casos.actualizarPasoProtocolo(${caso.id}, ${p.id}, this.checked)">
                    <div>
                        <span class="${p.completado ? "text-slate-400 line-through" : vencido ? "text-red-700 font-semibold" : "text-slate-700"}">${App.escapeHtml(p.descripcion)}</span>
                        <div class="text-xs text-slate-400">Plazo: ${p.fechaLimite || "-"} ${vencido ? "(VENCIDO)" : ""}</div>
                    </div>
                </div>`;
            })
            .join("");
    }

    async function actualizarPasoProtocolo(casoId, pasoId, completado) {
        try {
            await Api.apiFetch(`/casos/${casoId}/pasos-protocolo/${pasoId}`, {
                method: "PATCH",
                body: JSON.stringify({ completado }),
            });
            App.estado.casoActual = await Api.apiFetch(`/casos/${casoId}`);
            renderDetalleCasoUI(App.estado.casoActual);
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    function renderDerivaciones(caso) {
        const cont = document.getElementById("lista-derivaciones");
        cont.innerHTML = (caso.derivaciones || []).length
            ? caso.derivaciones
                  .map((d) => {
                      const adjuntosBtn =
                          Number(d.adjuntos) > 0
                              ? `<button type="button" onclick="Casos.toggleAdjuntosDerivacion(${caso.id}, ${d.id})" class="text-xs text-blue-700 underline no-print">📎 ${d.adjuntos} medio(s) de verificación</button>`
                              : '<span class="text-xs text-slate-400 no-print">Sin medios de verificación</span>';
                      return `<div class="border-b border-slate-100 py-1.5">
                          <div class="flex justify-between"><b>${App.escapeHtml(d.institucion)}</b><span class="badge bg-secondary status-badge text-xs">${App.escapeHtml(d.estado)}</span></div>
                          <div class="text-slate-500">${App.escapeHtml(d.tipo)} — ${App.escapeHtml(d.fechaDerivacion)}${d.folioExterno ? ` — Folio: ${App.escapeHtml(d.folioExterno)}` : ""}</div>
                          ${d.notas ? `<div class="text-slate-400 italic">${App.escapeHtml(d.notas)}</div>` : ""}
                          <div class="flex items-center justify-between mt-1 no-print">
                              ${adjuntosBtn}
                              <label class="text-xs text-slate-500 hover:underline cursor-pointer">
                                  Adjuntar archivo(s)
                                  <input type="file" multiple class="hidden" onchange="Casos.subirAdjuntosDerivacion(event, ${caso.id}, ${d.id})">
                              </label>
                          </div>
                          <div id="der-adjuntos-list-${d.id}" class="hidden mt-1 text-xs space-y-1 no-print"></div>
                      </div>`;
                  })
                  .join("")
            : '<p class="text-slate-400 italic">Sin derivaciones registradas.</p>';
    }

    async function crearDerivacion(e) {
        e.preventDefault();
        const payload = {
            institucion: document.getElementById("der-institucion").value,
            tipo: document.getElementById("der-tipo").value,
            fechaDerivacion: document.getElementById("der-fecha").value,
            folioExterno: document.getElementById("der-folio").value || null,
            notas: document.getElementById("der-notas").value || null,
        };
        try {
            await Api.apiFetch(`/casos/${App.estado.casoSeleccionadoId}/derivaciones`, {
                method: "POST",
                body: JSON.stringify(payload),
            });
            document.getElementById("form-derivacion").reset();
            App.estado.casoActual = await Api.apiFetch(`/casos/${App.estado.casoSeleccionadoId}`);
            renderDetalleCasoUI(App.estado.casoActual);
            App.mostrarToast("Derivación registrada.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function toggleAdjuntosDerivacion(casoId, derivacionId) {
        const contenedor = document.getElementById(`der-adjuntos-list-${derivacionId}`);
        if (!contenedor.classList.contains("hidden")) {
            contenedor.classList.add("hidden");
            return;
        }
        const adjuntos = await Api.apiFetch(`/casos/${casoId}/derivaciones/${derivacionId}/adjuntos`);
        contenedor.innerHTML = adjuntos
            .map(
                (a) =>
                    `<a href="${Api.API_BASE}/casos/${casoId}/adjuntos/${a.id}" target="_blank" class="d-block text-blue-700"><i class="fa-solid fa-paperclip me-1"></i>${App.escapeHtml(a.nombre)}</a>`
            )
            .join("");
        contenedor.classList.remove("hidden");
    }

    async function subirAdjuntosDerivacion(e, casoId, derivacionId) {
        const archivos = e.target.files;
        if (!archivos || archivos.length === 0) return;
        const formData = new FormData();
        Array.from(archivos).forEach((f) => formData.append("archivos", f));
        try {
            await Api.subirArchivo(`/casos/${casoId}/derivaciones/${derivacionId}/adjuntos`, formData);
            App.estado.casoActual = await Api.apiFetch(`/casos/${casoId}`);
            renderDetalleCasoUI(App.estado.casoActual);
            App.mostrarToast("Medio(s) de verificación adjuntado(s).", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        } finally {
            e.target.value = "";
        }
    }

    function generarCitacionApoderado() {
        const caso = App.estado.casoActual;
        if (!caso) return;

        const plantilla = `COLEGIO\nDEPARTAMENTO DE CONVIVENCIA ESCOLAR\n\nREF: CITACIÓN OFICIAL DE APODERADO - ${caso.folio}\n\nEstimado(a) Apoderado(a) de ${caso.estudiante}:\n\nPor medio de la presente, se le cita formalmente a una entrevista presencial de carácter obligatorio...\n\nAtentamente,\nEquipo Multidisciplinario`;
        document.getElementById("txt-citacion-cuerpo").value = plantilla;
        new bootstrap.Modal(document.getElementById("modalCitacion")).show();
    }

    let chipsEstudiantesAdicionales = [];

    function openModalApertura() {
        if (App.estado.currentUser.rol === "invitado") return;
        document.getElementById("in-fecha").value = new Date().toISOString().split("T")[0];
        chipsEstudiantesAdicionales = [];
        renderChipsEstudiantesAdicionales();
        new bootstrap.Modal(document.getElementById("modalApertura")).show();
    }

    function renderChipsEstudiantesAdicionales() {
        document.getElementById("chips-estudiantes-adicionales").innerHTML = chipsEstudiantesAdicionales
            .map(
                (nombre, i) => `<span class="badge bg-slate-100 text-slate-700 status-badge text-xs">
                    ${App.escapeHtml(nombre)}
                    <i class="fa-solid fa-xmark ms-1" style="cursor:pointer" onclick="Casos.quitarChipEstudianteAdicional(${i})" title="Quitar"></i>
                </span>`
            )
            .join("");
    }

    function agregarChipEstudianteAdicional() {
        const input = document.getElementById("in-estudiante-adicional");
        const nombre = input.value.trim().replace(/\s+/g, " ");
        if (!nombre) return;
        if (chipsEstudiantesAdicionales.some((n) => n.toLowerCase() === nombre.toLowerCase())) {
            App.mostrarToast("Ese estudiante ya está en la lista.", "info");
            input.value = "";
            return;
        }
        chipsEstudiantesAdicionales.push(nombre);
        input.value = "";
        renderChipsEstudiantesAdicionales();
    }

    function quitarChipEstudianteAdicional(i) {
        chipsEstudiantesAdicionales.splice(i, 1);
        renderChipsEstudiantesAdicionales();
    }

    async function guardarNuevoCaso(e) {
        e.preventDefault();
        const payload = {
            estudiante: document.getElementById("in-estudiante").value,
            estudiantesAdicionales: chipsEstudiantesAdicionales,
            fechaApertura: document.getElementById("in-fecha").value,
            categoria: document.getElementById("in-categoria").value,
            responsableId: parseInt(document.getElementById("in-responsable").value, 10),
            descripcion: document.getElementById("in-descripcion").value,
            curso: document.getElementById("in-curso").value.trim() || null,
            tieneNee: document.getElementById("in-tiene-nee").checked,
            diagnosticoPie: document.getElementById("in-diagnostico-pie").value.trim() || null,
            beneficiosJunaeb: document.getElementById("in-junaeb").value.trim() || null,
        };

        try {
            await Api.apiFetch("/casos", { method: "POST", body: JSON.stringify(payload) });
            document.getElementById("form-apertura").reset();
            document.getElementById("campo-diagnostico-pie").classList.add("hidden");
            chipsEstudiantesAdicionales = [];
            renderChipsEstudiantesAdicionales();
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
        filtrosCambiaron,
        irPaginaAnterior,
        irPaginaSiguiente,
        exportarPdfsZip,
        verDetalleCaso,
        renderDetalleCasoUI,
        actualizarPasoProtocolo,
        crearDerivacion,
        toggleAdjuntosDerivacion,
        subirAdjuntosDerivacion,
        generarCitacionApoderado,
        openModalApertura,
        agregarChipEstudianteAdicional,
        quitarChipEstudianteAdicional,
        agregarEstudianteAdicionalDetalle,
        eliminarEstudianteAdicionalDetalle,
        guardarNuevoCaso,
        openModalCierre,
        guardarCierreCaso,
    };
})();
