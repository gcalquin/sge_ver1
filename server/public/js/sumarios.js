const Sumarios = (() => {
    let sumarioActualId = null;

    async function renderLista() {
        const tbody = document.getElementById("tabla-sumarios-body");
        try {
            const sumarios = await Api.apiFetch("/sumarios");
            tbody.innerHTML = sumarios.length
                ? sumarios
                      .map(
                          (s) => `<tr>
                            <td>${App.escapeHtml(s.folio)}</td>
                            <td>${App.escapeHtml(s.funcionarioInvolucrado)}</td>
                            <td>${App.escapeHtml(s.fechaApertura)}</td>
                            <td><span class="badge status-badge ${s.estado === "Cerrado" ? "bg-success" : "bg-danger"}">${App.escapeHtml(s.estado)}</span></td>
                            <td class="text-end"><button onclick="Sumarios.verDetalle(${s.id})" class="btn btn-xs btn-outline-secondary text-xs">Ver</button></td>
                        </tr>`
                      )
                      .join("")
                : '<tr><td colspan="5" class="text-center text-slate-400 italic">Sin sumarios registrados.</td></tr>';
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    function abrirModalNuevo() {
        document.getElementById("sum-fecha").value = new Date().toISOString().split("T")[0];
        const select = document.getElementById("sum-responsable");
        select.innerHTML = (App.estado.equipoCache || [])
            .filter((m) => m.rolPermiso === "admin")
            .map((m) => `<option value="${m.id}">${App.escapeHtml(m.nombre)}</option>`)
            .join("");
        new bootstrap.Modal(document.getElementById("modalNuevoSumario")).show();
    }

    async function crear(e) {
        e.preventDefault();
        const payload = {
            funcionarioInvolucrado: document.getElementById("sum-funcionario").value.trim(),
            fechaApertura: document.getElementById("sum-fecha").value,
            responsableId: parseInt(document.getElementById("sum-responsable").value, 10),
            descripcion: document.getElementById("sum-descripcion").value,
        };
        try {
            await Api.apiFetch("/sumarios", { method: "POST", body: JSON.stringify(payload) });
            document.getElementById("form-nuevo-sumario").reset();
            bootstrap.Modal.getInstance(document.getElementById("modalNuevoSumario")).hide();
            await renderLista();
            App.mostrarToast("Sumario creado.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function verDetalle(id) {
        sumarioActualId = id;
        try {
            const sumario = await Api.apiFetch(`/sumarios/${id}`);
            renderDetalle(sumario);
            App.switchView("detalle-sumario");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    function renderDetalle(s) {
        document.getElementById("sum-det-folio").innerText = s.folio;
        document.getElementById("sum-det-funcionario").innerText = s.estudiante;
        document.getElementById("sum-det-responsable").innerText = s.responsablePrincipal;
        document.getElementById("sum-det-fecha").innerText = s.fechaApertura;
        document.getElementById("sum-det-descripcion").innerText = s.descripcion;
        document.getElementById("btn-sum-det-pdf").href = `${Api.API_BASE}/sumarios/${s.id}/pdf`;

        const badge = document.getElementById("sum-det-badge-estado");
        badge.className = "badge status-badge " + (s.estado === "Cerrado" ? "bg-success" : "bg-danger");
        badge.innerText = s.estado;

        document.getElementById("sum-det-protocolo-normativa").innerText = s.protocoloNombre
            ? `${s.protocoloNombre} — ${s.protocoloNormativa}`
            : "";

        const hoy = new Date().toISOString().slice(0, 10);
        document.getElementById("sum-det-pasos-protocolo").innerHTML = (s.pasosProtocolo || [])
            .map((p) => {
                const vencido = !p.completado && p.fechaLimite && p.fechaLimite < hoy;
                return `<div class="flex items-start gap-2 p-1.5 rounded ${vencido ? "bg-red-50" : ""}">
                    <input type="checkbox" class="form-check-input mt-0.5" ${p.completado ? "checked" : ""}
                        onchange="Sumarios.actualizarPasoProtocolo(${p.id}, this.checked)">
                    <div>
                        <span class="${p.completado ? "text-slate-400 text-decoration-line-through" : vencido ? "text-red-700 fw-bold" : "text-slate-700"}">${App.escapeHtml(p.descripcion)}</span>
                        <div class="text-xs text-slate-400">Plazo: ${p.fechaLimite || "-"} ${vencido ? "(VENCIDO)" : ""}</div>
                    </div>
                </div>`;
            })
            .join("");

        document.getElementById("sum-det-bitacora").innerHTML = (s.bitacora || [])
            .map(
                (b) => `<div class="border-b border-slate-100 py-1.5">
                    <div class="flex justify-between"><b>${App.escapeHtml(b.fecha)}</b><span class="text-slate-400">${App.escapeHtml(b.operador)}</span></div>
                    <div class="text-slate-600">${App.escapeHtml(b.contenido)}</div>
                </div>`
            )
            .join("");
    }

    async function agregarBitacora(e) {
        e.preventDefault();
        const payload = {
            tipo: "seguimiento",
            fecha: document.getElementById("sum-bit-fecha").value,
            contenido: document.getElementById("sum-bit-contenido").value,
        };
        try {
            await Api.apiFetch(`/sumarios/${sumarioActualId}/bitacora`, { method: "POST", body: JSON.stringify(payload) });
            document.getElementById("form-sum-bitacora").reset();
            await verDetalle(sumarioActualId);
            App.mostrarToast("Entrada de bitácora agregada.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function actualizarPasoProtocolo(pasoId, completado) {
        try {
            await Api.apiFetch(`/sumarios/${sumarioActualId}/pasos-protocolo/${pasoId}`, {
                method: "PATCH",
                body: JSON.stringify({ completado }),
            });
            await verDetalle(sumarioActualId);
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    return { renderLista, abrirModalNuevo, crear, verDetalle, agregarBitacora, actualizarPasoProtocolo };
})();
