const Config = (() => {
    async function renderVistaConfig() {
        const data = await Api.apiFetch("/colegios/actual");
        document.getElementById("cfg-dias-alerta").value = data.diasAlertaCritico;
        document.getElementById("cfg-dias-retencion").value = data.diasRetencionCerrados;
        document.getElementById("cfg-meses-reincidencia").value = data.mesesAlertaReincidencia;
        document.getElementById("cfg-rbd").innerText = data.rbd || "(no asignado)";

        await renderPurga();
        await renderMetasPme();
        await renderAuditoria();
        App.inicializarTooltips();
    }

    async function guardarConfiguracion(e) {
        e.preventDefault();
        const diasAlertaCritico = parseInt(document.getElementById("cfg-dias-alerta").value, 10);
        const diasRetencionCerrados = parseInt(document.getElementById("cfg-dias-retencion").value, 10);
        const mesesAlertaReincidencia = parseInt(document.getElementById("cfg-meses-reincidencia").value, 10);
        try {
            await Api.apiFetch("/colegios/actual", {
                method: "PATCH",
                body: JSON.stringify({ diasAlertaCritico, diasRetencionCerrados, mesesAlertaReincidencia }),
            });
            App.mostrarToast("Configuración guardada.", "success");
            await renderPurga();
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function renderAuditoria() {
        const card = document.getElementById("card-auditoria");
        const esAdmin = App.estado.currentUser.rol === "admin" || App.estado.currentUser.rol === "superadmin";
        card.classList.toggle("hidden", !esAdmin);
        if (!esAdmin) return;

        const registros = await Api.apiFetch("/reportes/auditoria");
        const tbody = document.getElementById("tabla-auditoria-body");
        tbody.innerHTML = registros.length
            ? registros
                  .map(
                      (r) => `<tr>
                          <td class="text-slate-500">${new Date(r.creadoEn).toLocaleString("es-CL")}</td>
                          <td>${r.usuario || "-"}</td>
                          <td><span class="badge bg-slate-100 text-slate-700 status-badge text-xs">${r.accion}</span></td>
                          <td class="text-slate-400 font-mono text-xs">${r.detalle && Object.keys(r.detalle).length ? JSON.stringify(r.detalle) : "-"}</td>
                      </tr>`
                  )
                  .join("")
            : '<tr><td colspan="4" class="text-slate-400 italic text-center py-2">Sin registros de auditoría.</td></tr>';
    }

    async function renderPurga() {
        const data = await Api.apiFetch("/casos/elegibles-purga");
        const lista = document.getElementById("lista-purga");
        lista.innerHTML = data.casos.length
            ? data.casos
                  .map((c) => `<div class="flex justify-between bg-amber-50 px-2 py-1 rounded"><span>${c.folio} — ${c.estudiante}</span><span class="text-slate-400">Cerrado ${c.fechaCierre}</span></div>`)
                  .join("")
            : `<p class="text-slate-400 italic">No hay casos elegibles para purga (retención vigente: ${data.diasRetencion} días).</p>`;
    }

    async function purgarTodosElegibles() {
        const data = await Api.apiFetch("/casos/elegibles-purga");
        if (data.casos.length === 0) {
            App.mostrarToast("No hay casos elegibles para purgar.", "info");
            return;
        }
        const ok = await App.confirmar(
            `Esto eliminará permanentemente ${data.casos.length} caso(s) cerrado(s) que superaron el período de retención. Esta acción no se puede deshacer.`,
            { titulo: "Purgar casos elegibles", textoBoton: "Purgar" }
        );
        if (!ok) return;

        for (const c of data.casos) {
            try {
                await Api.apiFetch(`/casos/${c.id}/purgar`, { method: "DELETE" });
            } catch (err) {
                App.mostrarToast(`No se pudo purgar ${c.folio}: ${err.message}`, "danger");
            }
        }
        App.mostrarToast("Purga completada.", "success");
        await renderPurga();
    }

    async function renderMetasPme() {
        const metas = await Api.apiFetch("/reportes/metas-pme");
        const lista = document.getElementById("lista-metas-pme");
        lista.innerHTML = metas.length
            ? metas
                  .map(
                      (m) =>
                          `<div class="flex justify-between items-center bg-slate-50 px-2 py-1 rounded">
                              <span>${m.indicador}: meta ${m.metaValor}</span>
                              <button onclick="Config.eliminarMetaPme(${m.id})" class="text-red-600 hover:underline">Quitar</button>
                          </div>`
                  )
                  .join("")
            : '<p class="text-slate-400 italic">Sin metas PME registradas.</p>';
    }

    async function crearMetaPme(e) {
        e.preventDefault();
        const indicador = document.getElementById("meta-indicador").value;
        const metaValor = parseFloat(document.getElementById("meta-valor").value);
        const descripcion = document.getElementById("meta-descripcion").value.trim();
        try {
            await Api.apiFetch("/reportes/metas-pme", { method: "POST", body: JSON.stringify({ indicador, metaValor, descripcion }) });
            document.getElementById("form-meta-pme").reset();
            await renderMetasPme();
            App.mostrarToast("Meta PME agregada.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function eliminarMetaPme(id) {
        await Api.apiFetch(`/reportes/metas-pme/${id}`, { method: "DELETE" });
        await renderMetasPme();
    }

    return { renderVistaConfig, guardarConfiguracion, purgarTodosElegibles, crearMetaPme, eliminarMetaPme };
})();
