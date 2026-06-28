const ComiteConvivencia = (() => {
    function toggleFormActa() {
        document.getElementById("form-acta-comite").classList.toggle("hidden");
    }

    async function renderVista() {
        await renderActas();
        poblarSelectorAnio();
    }

    function poblarSelectorAnio() {
        const select = document.getElementById("plan-gestion-anio");
        if (select.options.length) return;
        const anioActual = new Date().getFullYear();
        for (let anio = anioActual; anio >= anioActual - 4; anio--) {
            const option = document.createElement("option");
            option.value = anio;
            option.textContent = anio;
            select.appendChild(option);
        }
    }

    function generarPlanGestionPdf() {
        const anio = document.getElementById("plan-gestion-anio").value;
        window.open(`${Api.API_BASE}/convivencia/plan-gestion.pdf?anio=${anio}`, "_blank");
    }

    async function renderActas() {
        const cont = document.getElementById("lista-actas-comite");
        try {
            const actas = await Api.apiFetch("/convivencia/comite");
            cont.innerHTML = actas.length
                ? actas
                      .map(
                          (a) => `<div class="border-b border-slate-100 py-1.5">
                            <div class="flex justify-between items-center">
                                <b>Reunión del ${App.escapeHtml(a.fechaReunion)}</b>
                                <a href="${Api.API_BASE}/convivencia/comite/${a.id}/pdf" target="_blank" class="text-indigo-700 hover:underline" title="Generar PDF del acta"><i class="fa-solid fa-file-pdf"></i></a>
                            </div>
                            <div class="text-slate-500">Asistentes: ${App.escapeHtml(a.asistentes)}</div>
                            <div class="text-slate-500">Temas: ${App.escapeHtml(a.temasTratados)}</div>
                            <div class="text-slate-400 italic">Acuerdos: ${App.escapeHtml(a.acuerdos)}</div>
                            ${
                                a.compromisos.length
                                    ? `<div class="mt-1 space-y-0.5">${a.compromisos
                                          .map(
                                              (c) => `<div class="flex items-center gap-1">
                                        <input type="checkbox" ${c.cumplido ? "checked" : ""} onchange="ComiteConvivencia.actualizarCompromiso(${a.id}, ${c.id}, this.checked)">
                                        <span class="${c.cumplido ? "text-slate-400 text-decoration-line-through" : ""}">${App.escapeHtml(c.descripcion)}${c.responsable ? ` — ${App.escapeHtml(c.responsable)}` : ""}${c.fechaLimite ? ` (plazo: ${App.escapeHtml(c.fechaLimite)})` : ""}</span>
                                    </div>`
                                          )
                                          .join("")}</div>`
                                    : ""
                            }
                        </div>`
                      )
                      .join("")
                : '<p class="text-slate-400 italic">Sin actas registradas.</p>';
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function crearActa(e) {
        e.preventDefault();
        const payload = {
            fechaReunion: document.getElementById("comite-fecha").value,
            asistentes: document.getElementById("comite-asistentes").value.trim(),
            temasTratados: document.getElementById("comite-temas").value.trim(),
            acuerdos: document.getElementById("comite-acuerdos").value.trim(),
        };
        try {
            await Api.apiFetch("/convivencia/comite", { method: "POST", body: JSON.stringify(payload) });
            document.getElementById("form-acta-comite").reset();
            document.getElementById("form-acta-comite").classList.add("hidden");
            await renderActas();
            App.mostrarToast("Acta registrada.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function actualizarCompromiso(actaId, compId, cumplido) {
        try {
            await Api.apiFetch(`/convivencia/comite/${actaId}/compromisos/${compId}`, {
                method: "PATCH",
                body: JSON.stringify({ cumplido }),
            });
            await renderActas();
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    return { toggleFormActa, renderVista, crearActa, actualizarCompromiso, generarPlanGestionPdf };
})();
