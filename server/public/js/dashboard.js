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
                            <p class="text-[11px] text-slate-600 m-0">Lleva ${a.diasInactivo} días sin bitácora actualizada.</p>
                        </div>
                        <button onclick="Casos.verDetalleCaso(${a.id})" class="text-xs text-blue-800 underline font-semibold">Revisar Caso</button>
                    </div>
                `;
            });
        }

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
