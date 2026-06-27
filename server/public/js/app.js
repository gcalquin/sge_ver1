const App = (() => {
    const estado = {
        currentUser: null,
        colegioActual: null,
        casoSeleccionadoId: null,
        casoActual: null,
        equipoCache: [],
    };

    function mostrarCargando(visible) {
        document.getElementById("loading-overlay").classList.toggle("hidden", !visible);
    }

    function mostrarToast(mensaje, tipo = "info") {
        const contenedor = document.getElementById("toast-container");
        const colores = { success: "text-bg-success", danger: "text-bg-danger", info: "text-bg-primary" };
        const toast = document.createElement("div");
        toast.className = `toast align-items-center ${colores[tipo] || colores.info} border-0 show mb-2`;
        toast.innerHTML = `<div class="d-flex"><div class="toast-body">${mensaje}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
        contenedor.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }

    let resolverConfirmarPendiente = null;

    function confirmar(mensaje, opciones = {}) {
        document.getElementById("confirmar-titulo").innerText = opciones.titulo || "Confirmar acción";
        document.getElementById("confirmar-mensaje").innerText = mensaje;
        document.getElementById("confirmar-btn-aceptar").innerText = opciones.textoBoton || "Confirmar";
        const modalEl = document.getElementById("modalConfirmar");
        new bootstrap.Modal(modalEl).show();
        return new Promise((resolve) => {
            resolverConfirmarPendiente = (valor) => {
                bootstrap.Modal.getInstance(modalEl).hide();
                resolverConfirmarPendiente = null;
                resolve(valor);
            };
        });
    }

    function resolverConfirmar(valor) {
        if (resolverConfirmarPendiente) resolverConfirmarPendiente(valor);
    }

    function toggleMenuMobile() {
        const abierto = document.getElementById("sidebar").classList.toggle("mobile-open");
        document.getElementById("sidebar-backdrop").classList.toggle("hidden", !abierto);
    }

    function switchView(viewName) {
        ["central", "dashboard", "casos", "equipo", "convivencia", "config", "detalle"].forEach((v) => {
            document.getElementById(`view-${v}`).classList.add("hidden");
        });
        ["central", "dashboard", "casos", "equipo", "convivencia", "config"].forEach((v) => {
            const btn = document.getElementById(`btn-nav-${v}`);
            if (btn) btn.classList.remove("active");
        });
        document.getElementById("sidebar").classList.remove("mobile-open");
        document.getElementById("sidebar-backdrop").classList.add("hidden");

        if (viewName === "central") {
            document.getElementById("view-central").classList.remove("hidden");
            document.getElementById("btn-nav-central").classList.add("active");
            document.getElementById("page-title").innerText = "Panel de Administración Central";
            Colegios.renderPanelCentral();
        } else if (viewName === "dashboard") {
            document.getElementById("view-dashboard").classList.remove("hidden");
            document.getElementById("btn-nav-dashboard").classList.add("active");
            document.getElementById("page-title").innerText = "Dashboard General";
            Dashboard.actualizarMetricasDashboard();
        } else if (viewName === "casos") {
            document.getElementById("view-casos").classList.remove("hidden");
            document.getElementById("btn-nav-casos").classList.add("active");
            document.getElementById("page-title").innerText = "Gestión Operativa";
            Casos.renderTablaCasos();
        } else if (viewName === "equipo") {
            document.getElementById("view-equipo").classList.remove("hidden");
            document.getElementById("btn-nav-equipo").classList.add("active");
            document.getElementById("page-title").innerText = "Configuración de Personal";
            Equipo.renderTablaEquipo();
            Equipo.renderProfesoresJefe();
        } else if (viewName === "convivencia") {
            document.getElementById("view-convivencia").classList.remove("hidden");
            document.getElementById("btn-nav-convivencia").classList.add("active");
            document.getElementById("page-title").innerText = "Gestión de Convivencia Escolar";
            Convivencia.renderVista();
        } else if (viewName === "config") {
            document.getElementById("view-config").classList.remove("hidden");
            document.getElementById("btn-nav-config").classList.add("active");
            document.getElementById("page-title").innerText = "Configuración del Colegio";
            Config.renderVistaConfig();
        } else if (viewName === "detalle") {
            document.getElementById("view-detalle").classList.remove("hidden");
            document.getElementById("page-title").innerText = "Expediente Técnico";
        }
    }

    function inicializarTooltips() {
        document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
            if (!bootstrap.Tooltip.getInstance(el)) new bootstrap.Tooltip(el);
        });
    }

    document.addEventListener("DOMContentLoaded", async () => {
        inicializarTooltips();
        document.getElementById("modalConfirmar").addEventListener("hidden.bs.modal", () => resolverConfirmar(false));
        await Colegios.cargarAmbitos();
        await Auth.verificarSesionExistente();
    });

    return { estado, mostrarCargando, mostrarToast, confirmar, resolverConfirmar, toggleMenuMobile, switchView, inicializarTooltips };
})();
