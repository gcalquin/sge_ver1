const DashboardSostenedor = (() => {
    let chartObj = null;

    async function abrir(sostenedorId) {
        try {
            const data = await Api.apiFetch(`/sostenedores/${sostenedorId}/dashboard`);
            App.switchView("dashboard-sostenedor");
            renderizar(data);
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    function renderizar(data) {
        document.getElementById("dash-sost-titulo").innerText = `Dashboard Consolidado — ${data.sostenedor.nombre}`;

        const tbody = document.getElementById("tabla-dashboard-sostenedor-body");
        tbody.innerHTML = data.colegios.length
            ? data.colegios
                  .map(
                      (c) => `<tr>
                        <td>${App.escapeHtml(c.nombre)}</td>
                        <td>${c.totalCasos}</td>
                        <td>${c.casosAbiertos}</td>
                        <td>${c.casosCerrados}</td>
                        <td>${c.alertasCriticas > 0 ? `<span class="badge bg-danger">${c.alertasCriticas}</span>` : "0"}</td>
                        <td>${c.proximosVencimientos > 0 ? `<span class="badge bg-warning text-dark">${c.proximosVencimientos}</span>` : "0"}</td>
                        <td class="text-end"><button onclick="Colegios.entrarContexto(${c.id})" class="btn btn-xs btn-primary bg-blue-800 border-0 text-xs">Entrar</button></td>
                    </tr>`
                  )
                  .join("")
            : '<tr><td colspan="7" class="text-center text-slate-400 italic">Este sostenedor no tiene colegios registrados.</td></tr>';

        if (chartObj) chartObj.destroy();
        chartObj = new Chart(document.getElementById("chartCasosPorColegio").getContext("2d"), {
            type: "bar",
            data: {
                labels: data.colegios.map((c) => c.nombre),
                datasets: [{ label: "Casos abiertos", data: data.colegios.map((c) => c.casosAbiertos), backgroundColor: "#3b82f6", borderRadius: 4 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
        });
    }

    return { abrir };
})();
