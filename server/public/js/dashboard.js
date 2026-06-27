const Dashboard = (() => {
    let chartCategoriasObj = null;
    let chartResponsablesObj = null;
    let chartImpactoObj = null;

    async function actualizarMetricasDashboard() {
        const fCat = document.getElementById("db-filter-categoria").value;
        const fDesde = document.getElementById("db-filter-desde").value;
        const params = new URLSearchParams({ categoria: fCat, desde: fDesde || "" });
        const data = await Api.apiFetch(`/casos/dashboard?${params}`);

        document.getElementById("kpi-total").innerText = data.kpis.total;
        document.getElementById("kpi-abiertos").innerText = data.kpis.abiertos;
        document.getElementById("kpi-seguimiento").innerText = data.kpis.seguimiento;
        document.getElementById("kpi-cerrados").innerText = data.kpis.cerrados;

        document.getElementById("lbl-dias-alerta-critico").innerText = data.diasAlertaCritico;
        document.getElementById("btn-export-superintendencia").href = `${Api.API_BASE}/reportes/superintendencia.csv`;
        document.getElementById("btn-export-anonimo").href = `${Api.API_BASE}/casos/export-anonimo.csv`;

        const contenedorVencimientos = document.getElementById("contenedor-vencimientos");
        contenedorVencimientos.innerHTML = data.proximosVencimientos.length
            ? data.proximosVencimientos
                  .map(
                      (v) =>
                          `<div class="flex justify-between items-center bg-amber-50 px-2 py-1 rounded">
                              <span>${v.folio} (${v.estudiante}) — ${v.descripcion}</span>
                              <button onclick="Casos.verDetalleCaso(${v.casoId})" class="text-blue-700 underline ms-2 shrink-0">Ver</button>
                          </div>`
                  )
                  .join("")
            : '<p class="text-slate-400 italic">Sin vencimientos próximos.</p>';

        const contenedorPme = document.getElementById("contenedor-pme");
        contenedorPme.innerHTML = data.pmeCruce.length
            ? data.pmeCruce
                  .map((m) => {
                      const cumple = m.valorActual !== null && Number(m.valorActual) >= Number(m.metaValor);
                      const valorTexto = m.valorActual === null ? "sin datos" : m.valorActual;
                      return `<div class="border-b border-slate-100 pb-1">
                          <div class="flex justify-between"><b>${m.indicador}</b><span class="${cumple ? "text-green-600" : "text-red-600"} font-bold">${valorTexto} / meta ${m.metaValor}</span></div>
                          ${m.descripcion ? `<div class="text-slate-400">${m.descripcion}</div>` : ""}
                      </div>`;
                  })
                  .join("")
            : '<p class="text-slate-400 italic">Sin metas PME configuradas (ver Configuración).</p>';

        const contenedorAlertas = document.getElementById("contenedor-alertas");
        contenedorAlertas.innerHTML = "";

        if (data.alertas.length === 0) {
            contenedorAlertas.innerHTML = `<p class="text-xs text-slate-400 italic py-2">No se registran alertas desatendidas.</p>`;
        } else {
            data.alertas.forEach((a) => {
                contenedorAlertas.innerHTML += `
                    <div class="alert alert-danger p-2 mb-1 rounded flex justify-between items-center text-xs border-s-4 border-red-600 bg-red-50">
                        <div>
                            <span class="font-bold text-red-900">🚨 ALERTA: ${a.folio} (${a.estudiante})</span>
                            <p class="text-xs text-slate-600 m-0">Lleva ${a.diasInactivo} días sin bitácora actualizada.</p>
                        </div>
                        <button onclick="Casos.verDetalleCaso(${a.id})" class="text-xs text-blue-800 underline font-semibold">Revisar Caso</button>
                    </div>
                `;
            });
        }

        document.getElementById("lbl-meses-reincidencia").innerText = data.mesesAlertaReincidencia;

        const contenedorCarga = document.getElementById("contenedor-carga-trabajo");
        contenedorCarga.innerHTML = data.cargaTrabajo.length
            ? data.cargaTrabajo
                  .map((u) => {
                      const sobrecargado = u.casosActivos >= 8;
                      return `<div class="flex justify-between items-center px-1 py-1 ${sobrecargado ? "bg-red-50 rounded" : ""}">
                          <span>${u.nombre}</span>
                          <span class="font-bold ${sobrecargado ? "text-red-700" : "text-slate-700"}">${u.casosActivos} caso(s) activo(s)</span>
                      </div>`;
                  })
                  .join("")
            : '<p class="text-slate-400 italic">Sin integrantes asignables.</p>';

        const contenedorReincidencias = document.getElementById("contenedor-reincidencias");
        contenedorReincidencias.innerHTML = data.reincidencias.length
            ? data.reincidencias
                  .map(
                      (r) => `<div class="bg-red-50 px-2 py-1 rounded flex justify-between items-center">
                          <div>
                              <b>${r.estudiante}</b> — ${r.folio} (${r.categoriaNueva})
                              <div class="text-slate-400">Caso previo ${r.folioAnterior} (${r.categoriaAnterior}) cerrado el ${r.fechaCierreAnterior}</div>
                          </div>
                          <button onclick="Casos.verDetalleCaso(${r.id})" class="text-blue-700 underline ms-2 shrink-0">Ver</button>
                      </div>`
                  )
                  .join("")
            : '<p class="text-slate-400 italic">Sin reincidencias detectadas.</p>';

        const contenedorCapacitaciones = document.getElementById("contenedor-capacitaciones-vencer");
        contenedorCapacitaciones.innerHTML = data.capacitacionesPorVencer.length
            ? data.capacitacionesPorVencer
                  .map(
                      (c) => `<div class="flex justify-between bg-amber-50 px-2 py-1 rounded">
                          <span>${c.usuario} — ${c.nombre}</span>
                          <span class="text-slate-500 shrink-0 ms-2">Vence ${c.fechaVencimiento}</span>
                      </div>`
                  )
                  .join("")
            : '<p class="text-slate-400 italic">Sin capacitaciones por vencer.</p>';

        if (chartCategoriasObj) chartCategoriasObj.destroy();
        chartCategoriasObj = new Chart(document.getElementById("chartCategorias").getContext("2d"), {
            type: "bar",
            data: {
                labels: data.categorias.labels,
                datasets: [{ data: data.categorias.data, backgroundColor: "#3b82f6", borderRadius: 4 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
        });

        if (chartResponsablesObj) chartResponsablesObj.destroy();
        chartResponsablesObj = new Chart(document.getElementById("chartResponsables").getContext("2d"), {
            type: "doughnut",
            data: {
                labels: data.responsables.labels,
                datasets: [{ data: data.responsables.data, backgroundColor: ["#1e3a8a", "#0d9488", "#f59e0b"] }],
            },
            options: { responsive: true, maintainAspectRatio: false },
        });

        const datosImpacto =
            data.impacto.casesWithMedida > 0 ? [data.impacto.efectivas, data.impacto.noEfectivas] : [1, 0];

        if (chartImpactoObj) chartImpactoObj.destroy();
        chartImpactoObj = new Chart(document.getElementById("chartImpacto").getContext("2d"), {
            type: "pie",
            data: {
                labels: ["Éxito Aplicado", "En Ejecución / Reincidentes"],
                datasets: [{ data: datosImpacto, backgroundColor: ["#10b981", "#cbd5e1"] }],
            },
            options: { responsive: true, maintainAspectRatio: false },
        });
    }

    async function enviarResumenAlertas() {
        try {
            const resultado = await Api.apiFetch("/notificaciones/alertas", { method: "POST", body: JSON.stringify({}) });
            const detalle = resultado.dryRun ? " (modo dry-run: solo se registró en el log del servidor)" : "";
            App.mostrarToast(`Resumen enviado: ${resultado.totalAlertas} alertas${detalle}.`, "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    return { actualizarMetricasDashboard, enviarResumenAlertas };
})();
