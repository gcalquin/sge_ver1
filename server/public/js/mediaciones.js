const Mediaciones = (() => {
    function render(caso) {
        const cont = document.getElementById("lista-mediaciones");
        const puedeEscribir = caso.estado !== "Cerrado" && App.estado.currentUser.rol !== "invitado";
        cont.innerHTML = (caso.mediaciones || []).length
            ? caso.mediaciones
                  .map((m) => {
                      const adjuntosBtn =
                          Number(m.adjuntos) > 0
                              ? `<button type="button" onclick="Mediaciones.toggleAdjuntos(${caso.id}, ${m.id})" class="text-xs text-blue-700 underline no-print">📎 ${m.adjuntos} acta(s) firmada(s)</button>`
                              : '<span class="text-xs text-slate-400 no-print">Sin acta firmada adjunta</span>';
                      return `
                <div class="border-b border-slate-100 py-2">
                    <div class="flex justify-between"><b>Mediación ${m.fechaMediacion}</b><span class="text-slate-400 text-xs">Mediador(a): ${m.mediador}</span></div>
                    <div class="text-slate-500">Participantes: ${m.participantes}</div>
                    <div class="text-slate-600 italic">Acuerdo: ${m.acuerdo}</div>
                    <div class="mt-1 space-y-1">
                        ${(m.compromisos || [])
                            .map(
                                (c) => `
                            <div class="flex items-start gap-2 ps-2">
                                <input type="checkbox" class="form-check-input mt-0.5" ${c.cumplido ? "checked" : ""} ${puedeEscribir ? "" : "disabled"}
                                    onchange="Mediaciones.toggleCompromiso(${m.id}, ${c.id}, this.checked)">
                                <span class="${c.cumplido ? "text-slate-400 line-through" : ""}">${c.descripcion}${c.responsable ? ` — ${c.responsable}` : ""}${c.fechaLimite ? ` (plazo: ${c.fechaLimite})` : ""}</span>
                            </div>`
                            )
                            .join("")}
                    </div>
                    <form class="no-print flex gap-1 mt-2" onsubmit="Mediaciones.agregarCompromiso(event, ${m.id})">
                        <input type="text" class="form-control form-control-sm" placeholder="Nuevo compromiso" required>
                        <input type="text" class="form-control form-control-sm" placeholder="Responsable" style="max-width:110px">
                        <input type="date" class="form-control form-control-sm" style="max-width:130px">
                        <button class="btn btn-sm btn-outline-secondary">+</button>
                    </form>
                    <div class="flex items-center justify-between mt-2 no-print">
                        <a href="${Api.API_BASE}/casos/${caso.id}/mediaciones/${m.id}/pdf" target="_blank" class="text-xs text-indigo-700 hover:underline" data-bs-toggle="tooltip" title="Genera un PDF del acta para imprimir, firmar a mano y luego volver a subir como medio de verificación.">
                            <i class="fa-solid fa-file-pdf me-1"></i>Imprimir acta para firmar
                        </a>
                        ${adjuntosBtn}
                        <label class="text-xs text-slate-500 hover:underline cursor-pointer">
                            Subir acta firmada
                            <input type="file" multiple class="hidden" onchange="Mediaciones.subirAdjuntos(event, ${caso.id}, ${m.id})">
                        </label>
                    </div>
                    <div id="med-adjuntos-list-${m.id}" class="hidden mt-1 text-xs space-y-1 no-print"></div>
                </div>`;
                  })
                  .join("")
            : '<p class="text-slate-400 italic">Sin actas de mediación registradas.</p>';
    }

    async function toggleAdjuntos(casoId, medId) {
        const contenedor = document.getElementById(`med-adjuntos-list-${medId}`);
        if (!contenedor.classList.contains("hidden")) {
            contenedor.classList.add("hidden");
            return;
        }
        const adjuntos = await Api.apiFetch(`/casos/${casoId}/mediaciones/${medId}/adjuntos`);
        contenedor.innerHTML = adjuntos
            .map(
                (a) =>
                    `<a href="${Api.API_BASE}/casos/${casoId}/adjuntos/${a.id}" target="_blank" class="d-block text-blue-700"><i class="fa-solid fa-paperclip me-1"></i>${a.nombre}</a>`
            )
            .join("");
        contenedor.classList.remove("hidden");
    }

    async function subirAdjuntos(e, casoId, medId) {
        const archivos = e.target.files;
        if (!archivos || archivos.length === 0) return;
        const formData = new FormData();
        Array.from(archivos).forEach((f) => formData.append("archivos", f));
        try {
            await Api.subirArchivo(`/casos/${casoId}/mediaciones/${medId}/adjuntos`, formData);
            App.estado.casoActual = await Api.apiFetch(`/casos/${casoId}`);
            Casos.renderDetalleCasoUI(App.estado.casoActual);
            App.mostrarToast("Acta firmada adjuntada como medio de verificación.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        } finally {
            e.target.value = "";
        }
    }

    async function crearActa(e) {
        e.preventDefault();
        const payload = {
            fechaMediacion: document.getElementById("med-fecha").value,
            participantes: document.getElementById("med-participantes").value.trim(),
            acuerdo: document.getElementById("med-acuerdo").value.trim(),
        };
        try {
            const mediaciones = await Api.apiFetch(`/casos/${App.estado.casoSeleccionadoId}/mediaciones`, {
                method: "POST",
                body: JSON.stringify(payload),
            });
            document.getElementById("form-mediacion").reset();
            App.estado.casoActual.mediaciones = mediaciones;
            render(App.estado.casoActual);
            App.mostrarToast("Acta de mediación registrada.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function agregarCompromiso(e, medId) {
        e.preventDefault();
        const inputs = e.target.querySelectorAll("input");
        const payload = {
            descripcion: inputs[0].value.trim(),
            responsable: inputs[1].value.trim() || null,
            fechaLimite: inputs[2].value || null,
        };
        try {
            const mediaciones = await Api.apiFetch(
                `/casos/${App.estado.casoSeleccionadoId}/mediaciones/${medId}/compromisos`,
                { method: "POST", body: JSON.stringify(payload) }
            );
            App.estado.casoActual.mediaciones = mediaciones;
            render(App.estado.casoActual);
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function toggleCompromiso(medId, compId, cumplido) {
        try {
            const mediaciones = await Api.apiFetch(
                `/casos/${App.estado.casoSeleccionadoId}/mediaciones/${medId}/compromisos/${compId}`,
                { method: "PATCH", body: JSON.stringify({ cumplido }) }
            );
            App.estado.casoActual.mediaciones = mediaciones;
            render(App.estado.casoActual);
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    return { render, crearActa, agregarCompromiso, toggleCompromiso, toggleAdjuntos, subirAdjuntos };
})();
