const Bitacora = (() => {
    function renderBitacora(bitacora, casoId) {
        const container = document.getElementById("timeline-container");
        container.innerHTML = "";

        bitacora.forEach((item) => {
            let icon = '<i class="fa-solid fa-file"></i>',
                iconBg = "bg-slate-500",
                titulo = item.tipo;
            if (item.tipo === "Apertura") {
                icon = '<i class="fa-solid fa-door-open"></i>';
                iconBg = "bg-blue-600";
            }
            if (item.tipo === "Entrevista") {
                icon = '<i class="fa-solid fa-comments"></i>';
                iconBg = "bg-sky-500";
                titulo = `Acta Entrevista: ${item.subtipo}`;
            }
            if (item.tipo === "Seguimiento") {
                icon = '<i class="fa-solid fa-clock"></i>';
                iconBg = "bg-amber-500";
            }
            if (item.tipo === "Medida") {
                icon = '<i class="fa-solid fa-gavel"></i>';
                iconBg = "bg-purple-500";
                titulo = `Medida Comprometida: ${item.estadoMedida}`;
            }
            if (item.tipo === "Cierre") {
                icon = '<i class="fa-solid fa-lock"></i>';
                iconBg = "bg-emerald-600";
                titulo = `Cierre - ${item.motivo}`;
            }

            const adjuntosBtn =
                Number(item.adjuntos) > 0
                    ? `<button type="button" onclick="Bitacora.toggleAdjuntos(${casoId}, ${item.id})" class="text-xs text-blue-700 underline no-print">📎 ${item.adjuntos} archivo(s)</button>`
                    : "";

            container.innerHTML += `
                <div class="timeline-item">
                    <div class="timeline-icon ${iconBg}">${icon}</div>
                    <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                        <div class="flex justify-between items-center mb-2 flex-wrap gap-2">
                            <span class="text-xs font-bold text-slate-800">${titulo}</span>
                            <span class="text-xs text-slate-900 bg-slate-100 font-bold px-2 py-0.5 rounded border border-slate-300 shadow-2xs">${item.fecha}</span>
                        </div>
                        <p class="text-xs text-slate-600 mb-1 leading-relaxed">${item.contenido}</p>
                        <div class="text-[9px] text-slate-400 border-t pt-1 mt-2 flex justify-between items-center">
                            <span>Operador Firmante: ${item.operador}</span>
                            ${adjuntosBtn}
                        </div>
                        <div id="adjuntos-list-${item.id}" class="hidden mt-2 text-xs space-y-1 no-print"></div>
                    </div>
                </div>
            `;
        });
    }

    async function toggleAdjuntos(casoId, bitId) {
        const contenedor = document.getElementById(`adjuntos-list-${bitId}`);
        if (!contenedor.classList.contains("hidden")) {
            contenedor.classList.add("hidden");
            return;
        }
        const adjuntos = await Api.apiFetch(`/casos/${casoId}/bitacora/${bitId}/adjuntos`);
        contenedor.innerHTML = adjuntos
            .map(
                (a) =>
                    `<a href="${Api.API_BASE}/casos/${casoId}/adjuntos/${a.id}" target="_blank" class="d-block text-blue-700"><i class="fa-solid fa-paperclip me-1"></i>${a.nombre}</a>`
            )
            .join("");
        contenedor.classList.remove("hidden");
    }

    function openModalAccion(tipo) {
        if (App.estado.currentUser.rol === "invitado") return;
        document.getElementById("in-accion-fecha").value = new Date().toISOString().split("T")[0];
        document.getElementById("in-accion-tipo").value = tipo;
        document.getElementById("in-accion-desc").value = "";
        document.getElementById("in-accion-adjunto").value = "";
        document.getElementById("in-accion-operador-label").value = App.estado.currentUser.nombre;

        document.getElementById("campos-entrevista").classList.add("hidden");
        document.getElementById("campos-medida").classList.add("hidden");
        document.getElementById("in-consentimiento").checked = true;
        document.getElementById("campo-justificacion-consentimiento").classList.add("hidden");
        document.getElementById("in-justificacion-consentimiento").value = "";
        document.getElementById("in-entrevista-tipo").value = "Estudiante";
        document.getElementById("campo-entrevista-otro").classList.add("hidden");
        document.getElementById("in-entrevista-otro-nombre").value = "";

        const header = document.getElementById("modal-accion-header");
        header.className = "modal-header text-white py-3";
        if (tipo === "entrevista") {
            document.getElementById("modal-accion-titulo").innerText = "Registrar Acta de Entrevista";
            document.getElementById("campos-entrevista").classList.remove("hidden");
            header.classList.add("bg-blue-700");
        } else if (tipo === "medida") {
            document.getElementById("modal-accion-titulo").innerText = "Aplicar Medida Reparatoria";
            document.getElementById("campos-medida").classList.remove("hidden");
            Convivencia.cargarOpcionesMedida(document.getElementById("in-medida-estado"));
            header.classList.add("bg-purple-700");
        } else {
            document.getElementById("modal-accion-titulo").innerText = "Bitácora de Seguimiento";
            header.classList.add("bg-amber-600");
        }
        new bootstrap.Modal(document.getElementById("modalAccionBitacora")).show();
    }

    async function guardarAccionBitacora(e) {
        e.preventDefault();
        const tipo = document.getElementById("in-accion-tipo").value;
        const payload = {
            tipo,
            fecha: document.getElementById("in-accion-fecha").value,
            contenido: document.getElementById("in-accion-desc").value,
        };
        if (tipo === "entrevista") {
            const tipoEntrevistado = document.getElementById("in-entrevista-tipo").value;
            if (tipoEntrevistado === "Otro") {
                const otroNombre = document.getElementById("in-entrevista-otro-nombre").value.trim();
                if (!otroNombre) {
                    App.mostrarToast("Indica quién es el otro entrevistado.", "danger");
                    return;
                }
                payload.subtipo = `Otro: ${otroNombre}`;
            } else {
                payload.subtipo = tipoEntrevistado;
            }
            payload.consentimientoApoderado = document.getElementById("in-consentimiento").checked;
            if (!payload.consentimientoApoderado) {
                payload.justificacionSinConsentimiento = document.getElementById("in-justificacion-consentimiento").value;
            }
        }
        if (tipo === "medida") payload.estadoMedida = document.getElementById("in-medida-estado").value;

        const archivo = document.getElementById("in-accion-adjunto").files[0];

        try {
            let caso = await Api.apiFetch(`/casos/${App.estado.casoSeleccionadoId}/bitacora`, {
                method: "POST",
                body: JSON.stringify(payload),
            });

            if (archivo) {
                const nuevaEntrada = caso.bitacora[caso.bitacora.length - 1];
                const formData = new FormData();
                formData.append("archivo", archivo);
                await Api.subirArchivo(`/casos/${caso.id}/bitacora/${nuevaEntrada.id}/adjuntos`, formData);
                caso = await Api.apiFetch(`/casos/${caso.id}`);
            }

            App.estado.casoActual = caso;
            bootstrap.Modal.getInstance(document.getElementById("modalAccionBitacora")).hide();
            Casos.renderDetalleCasoUI(caso);
        } catch (err) {
            // Sin conexión real (no un error HTTP del servidor) y sin adjunto: se encola
            // localmente y se reintenta automáticamente cuando el navegador reconecte.
            if (err instanceof TypeError && !archivo) {
                Offline.encolar({ path: `/casos/${App.estado.casoSeleccionadoId}/bitacora`, method: "POST", body: payload });
                bootstrap.Modal.getInstance(document.getElementById("modalAccionBitacora")).hide();
                App.mostrarToast("Sin conexión: la entrada se guardó en este dispositivo y se enviará al reconectar.", "info");
                return;
            }
            App.mostrarToast(err.message, "danger");
        }
    }

    return { renderBitacora, toggleAdjuntos, openModalAccion, guardarAccionBitacora };
})();
