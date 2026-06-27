const Capacitaciones = (() => {
    function hoyMasDias(dias) {
        const d = new Date();
        d.setDate(d.getDate() + dias);
        return d.toISOString().slice(0, 10);
    }

    async function abrirModal(usuarioId, nombreUsuario) {
        document.getElementById("cap-usuario-id").value = usuarioId;
        document.getElementById("cap-nombre-usuario").innerText = nombreUsuario;

        const puedeGestionar = App.estado.currentUser.rol === "admin" || App.estado.currentUser.rol === "superadmin";
        document.getElementById("cap-form-contenedor").classList.toggle("hidden", !puedeGestionar);
        document.getElementById("form-capacitacion").reset();

        await renderLista(usuarioId);
        new bootstrap.Modal(document.getElementById("modalCapacitaciones")).show();
    }

    async function renderLista(usuarioId) {
        const cont = document.getElementById("lista-capacitaciones");
        const puedeGestionar = App.estado.currentUser.rol === "admin" || App.estado.currentUser.rol === "superadmin";
        const capacitaciones = await Api.apiFetch(`/equipo/${usuarioId}/capacitaciones`);
        const hoy = new Date().toISOString().slice(0, 10);
        const limiteAlerta = hoyMasDias(60);

        cont.innerHTML = capacitaciones.length
            ? capacitaciones
                  .map((c) => {
                      const vencida = c.fechaVencimiento && c.fechaVencimiento < hoy;
                      const porVencer = !vencida && c.fechaVencimiento && c.fechaVencimiento <= limiteAlerta;
                      const colorClase = vencida ? "text-red-600" : porVencer ? "text-amber-600" : "text-slate-600";
                      return `<div class="flex justify-between items-center border-b border-slate-100 py-1">
                          <div>
                              <b>${App.escapeHtml(c.nombre)}</b>${c.institucion ? ` — ${App.escapeHtml(c.institucion)}` : ""}
                              <div class="${colorClase}">Obtenida: ${App.escapeHtml(c.fechaObtencion)}${c.fechaVencimiento ? ` — Vence: ${App.escapeHtml(c.fechaVencimiento)}${vencida ? " (VENCIDA)" : porVencer ? " (por vencer)" : ""}` : ""}</div>
                          </div>
                          ${puedeGestionar ? `<button onclick="Capacitaciones.eliminar(${usuarioId}, ${c.id})" class="text-red-600 hover:underline shrink-0 ms-2">Quitar</button>` : ""}
                      </div>`;
                  })
                  .join("")
            : '<p class="text-slate-400 italic">Sin capacitaciones registradas.</p>';
    }

    async function crear(e) {
        e.preventDefault();
        const usuarioId = document.getElementById("cap-usuario-id").value;
        const payload = {
            nombre: document.getElementById("cap-nombre").value.trim(),
            institucion: document.getElementById("cap-institucion").value.trim() || null,
            fechaObtencion: document.getElementById("cap-fecha-obtencion").value,
            fechaVencimiento: document.getElementById("cap-fecha-vencimiento").value || null,
        };
        try {
            await Api.apiFetch(`/equipo/${usuarioId}/capacitaciones`, {
                method: "POST",
                body: JSON.stringify(payload),
            });
            document.getElementById("form-capacitacion").reset();
            await renderLista(usuarioId);
            App.mostrarToast("Capacitación registrada.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function eliminar(usuarioId, capId) {
        try {
            await Api.apiFetch(`/equipo/capacitaciones/${capId}`, { method: "DELETE" });
            await renderLista(usuarioId);
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    return { abrirModal, crear, eliminar };
})();
