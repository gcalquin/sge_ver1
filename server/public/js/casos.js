const Casos = (() => {
    const PLANTILLAS_NOTIFICACION = {
        es: (c) => `Estimado(a) apoderado(a) de ${c.estudiante}: le informamos que el caso ${c.folio} (${c.categoria}) requiere su atención. Por favor contacte al establecimiento a la brevedad.`,
        "es-simple": (c) => `Hola. Necesitamos hablar con usted sobre ${c.estudiante}. Por favor llame al colegio pronto. Caso ${c.folio}.`,
        ht: (c) => `Bonjou. Nou bezwen pale avèk ou sou ${c.estudiante}. Tanpri rele lekòl la talè. Dosye ${c.folio}.`,
    };

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
        document.getElementById("det-curso").innerText = caso.curso || "-";
        document.getElementById("btn-det-pdf").href = `${Api.API_BASE}/casos/${caso.id}/pdf`;

        document.getElementById("det-pie-wrap").classList.toggle("hidden", !caso.tieneNee);
        document.getElementById("det-pie-diagnostico").innerText = caso.diagnosticoPie || "";
        document.getElementById("det-junaeb-wrap").classList.toggle("hidden", !caso.beneficiosJunaeb);
        document.getElementById("det-junaeb").innerText = caso.beneficiosJunaeb || "-";

        document.getElementById("banner-denuncia-obligatoria").classList.toggle("hidden", !caso.denunciaObligatoriaPendiente);

        const badge = document.getElementById("det-badge-estado");
        badge.className =
            "badge status-badge " +
            (caso.estado === "Abierto" ? "bg-danger" : caso.estado === "Cerrado" ? "bg-success" : "bg-warning text-dark");
        badge.innerText = caso.estado;

        const puedeEscribir = caso.estado !== "Cerrado" && App.estado.currentUser.rol !== "invitado";

        const panelAcciones = document.getElementById("panel-operacional-acciones");
        panelAcciones.classList.toggle("hidden", !puedeEscribir);

        ["form-derivacion", "form-firma", "form-notificar"].forEach((idForm) => {
            const form = document.getElementById(idForm);
            form.classList.toggle("opacity-40", !puedeEscribir);
            form.classList.toggle("pointer-events-none", !puedeEscribir);
        });

        document.getElementById("not-mensaje").value = PLANTILLAS_NOTIFICACION[document.getElementById("not-idioma").value](caso);

        Bitacora.renderBitacora(caso.bitacora, caso.id);
        renderPasosProtocolo(caso);
        renderDerivaciones(caso);
        renderFirmas(caso);
    }

    function renderPasosProtocolo(caso) {
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
                        <span class="${p.completado ? "text-slate-400 line-through" : vencido ? "text-red-700 font-semibold" : "text-slate-700"}">${p.descripcion}</span>
                        <div class="text-[10px] text-slate-400">Plazo: ${p.fechaLimite || "-"} ${vencido ? "(VENCIDO)" : ""}</div>
                    </div>
                </div>`;
            })
            .join("");
    }

    async function actualizarPasoProtocolo(casoId, pasoId, completado) {
        try {
            await Api.apiFetch(`/casos/${casoId}/pasos-protocolo/${pasoId}`, { method: "PATCH", body: JSON.stringify({ completado }) });
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
                  .map(
                      (d) => `<div class="border-b border-slate-100 py-1">
                          <div class="flex justify-between"><b>${d.institucion}</b><span class="badge bg-secondary status-badge text-[10px]">${d.estado}</span></div>
                          <div class="text-slate-500">${d.tipo} — ${d.fechaDerivacion}${d.folioExterno ? ` — Folio: ${d.folioExterno}` : ""}</div>
                          ${d.notas ? `<div class="text-slate-400 italic">${d.notas}</div>` : ""}
                      </div>`
                  )
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
            await Api.apiFetch(`/casos/${App.estado.casoSeleccionadoId}/derivaciones`, { method: "POST", body: JSON.stringify(payload) });
            document.getElementById("form-derivacion").reset();
            App.estado.casoActual = await Api.apiFetch(`/casos/${App.estado.casoSeleccionadoId}`);
            renderDetalleCasoUI(App.estado.casoActual);
            App.mostrarToast("Derivación registrada.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    function renderFirmas(caso) {
        const cont = document.getElementById("lista-firmas");
        cont.innerHTML = (caso.firmas || []).length
            ? caso.firmas
                  .map(
                      (f) => `<div class="border-b border-slate-100 py-1">
                          <b>${f.tipoDocumento}</b> — ${f.nombreFirmante} (${f.rutFirmante})
                          <div class="text-slate-400">${new Date(f.fechaFirma).toLocaleString("es-CL")}</div>
                      </div>`
                  )
                  .join("")
            : '<p class="text-slate-400 italic">Sin firmas registradas.</p>';
    }

    async function crearFirma(e) {
        e.preventDefault();
        const payload = {
            tipoDocumento: document.getElementById("firma-tipo-documento").value,
            nombreFirmante: document.getElementById("firma-nombre").value.trim(),
            rutFirmante: document.getElementById("firma-rut").value.trim(),
        };
        try {
            await Api.apiFetch(`/casos/${App.estado.casoSeleccionadoId}/firmas`, { method: "POST", body: JSON.stringify(payload) });
            document.getElementById("form-firma").reset();
            App.estado.casoActual = await Api.apiFetch(`/casos/${App.estado.casoSeleccionadoId}`);
            renderDetalleCasoUI(App.estado.casoActual);
            App.mostrarToast("Firma registrada.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    function actualizarPlantillaNotificacion() {
        const caso = App.estado.casoActual;
        if (!caso) return;
        document.getElementById("not-mensaje").value = PLANTILLAS_NOTIFICACION[document.getElementById("not-idioma").value](caso);
    }

    async function notificarApoderado(e) {
        e.preventDefault();
        const payload = {
            canal: document.getElementById("not-canal").value,
            destinatario: document.getElementById("not-destinatario").value.trim(),
            idioma: document.getElementById("not-idioma").value,
            mensaje: document.getElementById("not-mensaje").value,
        };
        try {
            const resultado = await Api.apiFetch(`/casos/${App.estado.casoSeleccionadoId}/notificar-apoderado`, {
                method: "POST",
                body: JSON.stringify(payload),
            });
            const detalle = resultado.dryRun ? " (modo dry-run: solo se registró en el log del servidor)" : "";
            App.mostrarToast(`Notificación enviada por ${resultado.canal}${detalle}.`, "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
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
            curso: document.getElementById("in-curso").value.trim() || null,
            tieneNee: document.getElementById("in-tiene-nee").checked,
            diagnosticoPie: document.getElementById("in-diagnostico-pie").value.trim() || null,
            beneficiosJunaeb: document.getElementById("in-junaeb").value.trim() || null,
        };

        try {
            await Api.apiFetch("/casos", { method: "POST", body: JSON.stringify(payload) });
            document.getElementById("form-apertura").reset();
            document.getElementById("campo-diagnostico-pie").classList.add("hidden");
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
        actualizarPasoProtocolo,
        crearDerivacion,
        crearFirma,
        actualizarPlantillaNotificacion,
        notificarApoderado,
        generarCitacionApoderado,
        openModalApertura,
        guardarNuevoCaso,
        openModalCierre,
        guardarCierreCaso,
    };
})();
