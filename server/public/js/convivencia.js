const Convivencia = (() => {
    function puedeGestionar() {
        return App.estado.currentUser.rol === "admin" || App.estado.currentUser.rol === "superadmin";
    }

    // ===================== actividades de convivencia =====================

    let actividadesCache = [];

    const COLOR_TIPO_ACTIVIDAD = {
        Taller: "bg-blue-100 text-blue-800",
        Charla: "bg-teal-100 text-teal-800",
        Capacitación: "bg-purple-100 text-purple-800",
        Otro: "bg-slate-100 text-slate-700",
    };

    async function renderActividades() {
        actividadesCache = await Api.apiFetch("/convivencia/actividades");
        renderListaActividadesFiltrada();
    }

    function filtrarActividades() {
        renderListaActividadesFiltrada();
    }

    function renderListaActividadesFiltrada() {
        const lista = document.getElementById("lista-actividades");
        const filtroTipo = document.getElementById("act-filtro-tipo").value;
        const filtroEstado = document.getElementById("act-filtro-estado").value;

        const filtradas = actividadesCache.filter((a) => {
            if (filtroTipo !== "Todos" && a.tipo !== filtroTipo) return false;
            if (filtroEstado === "Abiertas" && a.cerrada) return false;
            if (filtroEstado === "Cerradas" && !a.cerrada) return false;
            return true;
        });

        lista.innerHTML = filtradas.length
            ? filtradas
                  .map(
                      (a) => `<div class="border border-slate-100 rounded-lg p-2">
                          <div class="flex justify-between items-start">
                              <div>
                                  <b>${a.nombre}</b> <span class="badge ${COLOR_TIPO_ACTIVIDAD[a.tipo] || COLOR_TIPO_ACTIVIDAD.Otro} status-badge text-xs">${a.tipo}</span>
                                  ${a.cerrada ? '<span class="badge bg-slate-200 text-slate-700 status-badge text-xs ms-1">Cerrada</span>' : ""}
                                  <div class="text-slate-400">${a.fecha} — registrado por ${a.creadoPor}</div>
                                  ${a.descripcion ? `<div class="text-slate-500 italic">${a.descripcion}</div>` : ""}
                              </div>
                              <div class="text-right shrink-0 ms-2 flex flex-col items-end gap-1">
                                  <button onclick="Convivencia.toggleDetalleActividad(${a.id})" class="text-blue-700 hover:underline block text-xs">
                                      Ver bitácora / cierre (${a.bitacora}) <i class="fa-solid fa-paperclip ms-1"></i>${a.adjuntos}
                                  </button>
                                  <button onclick="Convivencia.eliminarActividad(${a.id})" class="text-slate-400 hover:text-red-600 text-xs" data-bs-toggle="tooltip" title="Quitar actividad">
                                      <i class="fa-solid fa-trash"></i>
                                  </button>
                              </div>
                          </div>
                          <div id="act-detalle-${a.id}" class="hidden mt-2 pt-2 border-t border-slate-100 space-y-2 text-xs"></div>
                      </div>`
                  )
                  .join("")
            : `<p class="text-slate-400 italic">${actividadesCache.length ? "Ninguna actividad coincide con el filtro." : "Sin actividades registradas."}</p>`;
        App.inicializarTooltips();
    }

    function toggleFormActividad() {
        document.getElementById("form-actividad").classList.toggle("hidden");
    }

    async function crearActividad(e) {
        e.preventDefault();
        const payload = {
            nombre: document.getElementById("act-nombre").value.trim(),
            tipo: document.getElementById("act-tipo").value,
            fecha: document.getElementById("act-fecha").value,
            descripcion: document.getElementById("act-descripcion").value.trim() || null,
        };
        try {
            await Api.apiFetch("/convivencia/actividades", { method: "POST", body: JSON.stringify(payload) });
            document.getElementById("form-actividad").reset();
            document.getElementById("form-actividad").classList.add("hidden");
            await renderActividades();
            App.mostrarToast("Actividad registrada.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function eliminarActividad(id) {
        const actividad = actividadesCache.find((a) => a.id === id);
        const ok = await App.confirmar(
            `¿Quitar la actividad "${actividad ? actividad.nombre : ""}"? Se perderá su bitácora, cierre y medios de verificación adjuntos. Esta acción no se puede deshacer.`,
            { titulo: "Quitar actividad", textoBoton: "Quitar" }
        );
        if (!ok) return;
        try {
            await Api.apiFetch(`/convivencia/actividades/${id}`, { method: "DELETE" });
            await renderActividades();
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function toggleDetalleActividad(id) {
        const cont = document.getElementById(`act-detalle-${id}`);
        if (!cont.classList.contains("hidden")) {
            cont.classList.add("hidden");
            return;
        }
        await renderDetalleActividad(id);
        cont.classList.remove("hidden");
    }

    async function renderDetalleActividad(id) {
        const cont = document.getElementById(`act-detalle-${id}`);
        const actividad = actividadesCache.find((a) => a.id === id);
        if (!actividad) return;
        const esInvitado = App.estado.currentUser.rol === "invitado";

        const [bitacora, adjuntos] = await Promise.all([
            Api.apiFetch(`/convivencia/actividades/${id}/bitacora`),
            Api.apiFetch(`/convivencia/actividades/${id}/adjuntos`),
        ]);

        cont.innerHTML = `
            <div>
                <div class="font-semibold text-slate-600 mb-1">Bitácora de Seguimiento</div>
                <div class="space-y-1 mb-2">
                    ${
                        bitacora.length
                            ? bitacora
                                  .map(
                                      (b) =>
                                          `<div class="border-b border-slate-50 pb-1"><b>${b.fecha}</b> — ${b.operador}<div class="text-slate-500">${b.contenido}</div></div>`
                                  )
                                  .join("")
                            : '<p class="text-slate-400 italic">Sin entradas de seguimiento registradas.</p>'
                    }
                </div>
                ${
                    esInvitado
                        ? ""
                        : `<form class="flex gap-1 mb-2" onsubmit="Convivencia.agregarBitacoraActividad(event, ${id})">
                    <input type="date" class="form-control form-control-sm" style="max-width:140px" required>
                    <input type="text" class="form-control form-control-sm" placeholder="Registro de seguimiento (asistencia, avances...)" required>
                    <button class="btn btn-sm btn-outline-secondary">+</button>
                </form>`
                }
            </div>
            <div>
                <div class="font-semibold text-slate-600 mb-1">Medios de Verificación</div>
                <div class="space-y-1 mb-2">
                    ${
                        adjuntos.length
                            ? adjuntos
                                  .map(
                                      (a) =>
                                          `<a href="${Api.API_BASE}/convivencia/actividades/${id}/adjuntos/${a.id}" target="_blank" class="d-block text-blue-700"><i class="fa-solid fa-paperclip me-1"></i>${a.nombre}</a>`
                                  )
                                  .join("")
                            : '<p class="text-slate-400 italic">Sin archivos adjuntos.</p>'
                    }
                </div>
                ${
                    esInvitado
                        ? ""
                        : `<label class="text-slate-500 hover:underline cursor-pointer">
                    Adjuntar archivo(s) (fotos, listas de asistencia, etc.)
                    <input type="file" multiple class="hidden" onchange="Convivencia.subirAdjuntosActividad(event, ${id})">
                </label>`
                }
            </div>
            <div class="flex items-center justify-between pt-1 border-t border-slate-100">
                <a href="${Api.API_BASE}/convivencia/actividades/${id}/pdf" target="_blank" class="text-indigo-700 hover:underline">
                    <i class="fa-solid fa-file-pdf me-1"></i>Descargar / imprimir resumen PDF
                </a>
                ${
                    actividad.cerrada || esInvitado
                        ? ""
                        : `<button onclick="Convivencia.abrirModalCerrarActividad(${id})" class="btn btn-xs btn-outline-danger">Cerrar Actividad</button>`
                }
            </div>
            ${
                actividad.cerrada
                    ? `<div class="bg-slate-50 rounded p-2"><b>Cerrada el ${actividad.fechaCierre}.</b> ${actividad.evaluacionCierre || ""}</div>`
                    : ""
            }
        `;
    }

    async function agregarBitacoraActividad(e, id) {
        e.preventDefault();
        const inputs = e.target.querySelectorAll("input");
        const payload = { fecha: inputs[0].value, contenido: inputs[1].value.trim() };
        try {
            await Api.apiFetch(`/convivencia/actividades/${id}/bitacora`, { method: "POST", body: JSON.stringify(payload) });
            const actividad = actividadesCache.find((a) => a.id === id);
            if (actividad) actividad.bitacora = Number(actividad.bitacora) + 1;
            await renderDetalleActividad(id);
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function subirAdjuntosActividad(e, id) {
        const archivos = e.target.files;
        if (!archivos || archivos.length === 0) return;
        const formData = new FormData();
        Array.from(archivos).forEach((f) => formData.append("archivos", f));
        try {
            await Api.subirArchivo(`/convivencia/actividades/${id}/adjuntos`, formData);
            const actividad = actividadesCache.find((a) => a.id === id);
            if (actividad) actividad.adjuntos = Number(actividad.adjuntos) + archivos.length;
            await renderDetalleActividad(id);
            App.mostrarToast("Medio(s) de verificación adjuntado(s).", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        } finally {
            e.target.value = "";
        }
    }

    function abrirModalCerrarActividad(id) {
        document.getElementById("cierre-act-id").value = id;
        document.getElementById("cierre-act-fecha").value = new Date().toISOString().split("T")[0];
        document.getElementById("cierre-act-evaluacion").value = "";
        new bootstrap.Modal(document.getElementById("modalCerrarActividad")).show();
    }

    async function guardarCierreActividad(e) {
        e.preventDefault();
        const id = parseInt(document.getElementById("cierre-act-id").value, 10);
        const payload = {
            fecha: document.getElementById("cierre-act-fecha").value,
            evaluacion: document.getElementById("cierre-act-evaluacion").value.trim(),
        };
        try {
            await Api.apiFetch(`/convivencia/actividades/${id}/cierre`, { method: "POST", body: JSON.stringify(payload) });
            bootstrap.Modal.getInstance(document.getElementById("modalCerrarActividad")).hide();
            await renderActividades();
            App.mostrarToast("Actividad cerrada.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    // ===================== catálogo de medidas reparatorias =====================

    async function renderMedidas() {
        const lista = document.getElementById("lista-medidas-catalogo");
        const medidas = await Api.apiFetch("/convivencia/medidas-catalogo");
        lista.innerHTML = medidas.length
            ? medidas
                  .map(
                      (m) => `<div class="flex justify-between items-center bg-slate-50 px-2 py-1 rounded">
                          <span class="${m.activo ? "" : "text-slate-400 line-through"}">${m.nombre}</span>
                          <span class="space-x-2 shrink-0">
                              <button onclick="Convivencia.toggleMedida(${m.id}, ${!m.activo})" class="text-blue-700 hover:underline">${m.activo ? "Desactivar" : "Activar"}</button>
                              <button onclick="Convivencia.eliminarMedida(${m.id})" class="text-red-600 hover:underline">Eliminar</button>
                          </span>
                      </div>`
                  )
                  .join("")
            : '<p class="text-slate-400 italic">Sin medidas registradas.</p>';
    }

    async function crearMedida(e) {
        e.preventDefault();
        const nombre = document.getElementById("medida-nombre").value.trim();
        try {
            await Api.apiFetch("/convivencia/medidas-catalogo", { method: "POST", body: JSON.stringify({ nombre }) });
            document.getElementById("form-medida-catalogo").reset();
            await renderMedidas();
            App.mostrarToast("Medida agregada al catálogo.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function toggleMedida(id, activo) {
        try {
            await Api.apiFetch(`/convivencia/medidas-catalogo/${id}`, { method: "PATCH", body: JSON.stringify({ activo }) });
            await renderMedidas();
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function eliminarMedida(id) {
        try {
            await Api.apiFetch(`/convivencia/medidas-catalogo/${id}`, { method: "DELETE" });
            await renderMedidas();
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function cargarOpcionesMedida(selectEl) {
        const medidas = await Api.apiFetch("/convivencia/medidas-catalogo");
        const activas = medidas.filter((m) => m.activo);
        selectEl.innerHTML = activas.map((m) => `<option value="${m.nombre}">${m.nombre}</option>`).join("");
    }

    // ===================== protocolos personalizados =====================

    let protocolosCache = [];

    async function renderProtocolos() {
        const lista = document.getElementById("lista-protocolos-colegio");
        protocolosCache = await Api.apiFetch("/convivencia/protocolos");
        const gestion = puedeGestionar();
        lista.innerHTML = protocolosCache
            .map(
                (p) => `<div class="border-b border-slate-100 py-2">
                    <div class="flex justify-between items-start">
                        <div>
                            <b>${p.categoria}</b>
                            ${p.personalizado ? '<span class="badge bg-blue-100 text-blue-800 status-badge text-xs ms-1">Personalizado</span>' : '<span class="badge bg-secondary status-badge text-xs ms-1">Global</span>'}
                            <div class="text-slate-500">${p.nombre}</div>
                            <div class="text-slate-400 text-xs">${p.normativa || ""}</div>
                        </div>
                        ${
                            gestion
                                ? `<span class="space-x-2 shrink-0">
                            <button onclick="Convivencia.abrirEditarProtocolo('${p.categoria}')" class="text-blue-700 hover:underline">Personalizar</button>
                            ${p.personalizado ? `<button onclick="Convivencia.restablecerProtocolo('${p.categoria}')" class="text-red-600 hover:underline">Restablecer</button>` : ""}
                        </span>`
                                : ""
                        }
                    </div>
                </div>`
            )
            .join("");
    }

    function abrirEditarProtocolo(categoria) {
        const p = protocolosCache.find((x) => x.categoria === categoria);
        if (!p) return;
        document.getElementById("prot-categoria").value = categoria;
        document.getElementById("prot-categoria-label").innerText = categoria;
        document.getElementById("prot-nombre").value = p.nombre;
        document.getElementById("prot-normativa").value = p.normativa || "";
        document.getElementById("prot-pasos").value = (p.pasos || [])
            .map((paso) => `${paso.descripcion} | ${paso.plazoDias ?? ""}`)
            .join("\n");
        new bootstrap.Modal(document.getElementById("modalProtocoloColegio")).show();
    }

    async function guardarProtocolo(e) {
        e.preventDefault();
        const categoria = document.getElementById("prot-categoria").value;
        const lineas = document
            .getElementById("prot-pasos")
            .value.split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

        const pasos = lineas.map((linea, i) => {
            const [descripcion, plazo] = linea.split("|").map((s) => s.trim());
            return { orden: i + 1, descripcion, plazoDias: plazo ? parseInt(plazo, 10) : null };
        });

        const payload = {
            nombre: document.getElementById("prot-nombre").value.trim(),
            normativa: document.getElementById("prot-normativa").value.trim() || null,
            pasos,
        };

        try {
            await Api.apiFetch(`/convivencia/protocolos/${encodeURIComponent(categoria)}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            });
            bootstrap.Modal.getInstance(document.getElementById("modalProtocoloColegio")).hide();
            await renderProtocolos();
            App.mostrarToast("Protocolo personalizado guardado.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function restablecerProtocolo(categoria) {
        const ok = await App.confirmar(
            `¿Restablecer el protocolo de "${categoria}" a la versión global? Se perderá la personalización.`,
            { titulo: "Restablecer protocolo", textoBoton: "Restablecer" }
        );
        if (!ok) return;
        try {
            await Api.apiFetch(`/convivencia/protocolos/${encodeURIComponent(categoria)}`, { method: "DELETE" });
            await renderProtocolos();
            App.mostrarToast("Protocolo restablecido al catálogo global.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function renderVista() {
        await renderActividades();
        await renderMedidas();
        await renderProtocolos();

        const gestion = puedeGestionar();
        const esInvitado = App.estado.currentUser.rol === "invitado";
        document.getElementById("panel-bloqueo-convivencia").classList.toggle("hidden", gestion);

        ["form-medida-catalogo"].forEach((id) => {
            const form = document.getElementById(id);
            form.classList.toggle("opacity-40", !gestion);
            form.classList.toggle("pointer-events-none", !gestion);
        });
        document.getElementById("btn-toggle-form-actividad").classList.toggle("hidden", esInvitado);

        App.inicializarTooltips();
    }

    return {
        renderVista,
        filtrarActividades,
        toggleFormActividad,
        crearActividad,
        eliminarActividad,
        toggleDetalleActividad,
        agregarBitacoraActividad,
        subirAdjuntosActividad,
        abrirModalCerrarActividad,
        guardarCierreActividad,
        crearMedida,
        toggleMedida,
        eliminarMedida,
        cargarOpcionesMedida,
        abrirEditarProtocolo,
        guardarProtocolo,
        restablecerProtocolo,
    };
})();
