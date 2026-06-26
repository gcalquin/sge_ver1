const Auth = (() => {
    async function procesarLogin(e) {
        e.preventDefault();
        const ambitoValor = document.getElementById("auth-ambito").value;
        const username = document.getElementById("auth-user").value.trim();
        const password = document.getElementById("auth-pass").value;
        const alertBox = document.getElementById("auth-alert");
        alertBox.classList.add("hidden");

        try {
            const data = await Api.apiFetch("/auth/login", {
                method: "POST",
                body: JSON.stringify({ ambito: ambitoValor, username, password }),
            });
            Api.setCsrfToken(data.csrfToken);
            await verificarSesionExistente();
        } catch (err) {
            alertBox.innerText = "Credenciales incorrectas.";
            alertBox.classList.remove("hidden");
        }
    }

    async function establecerSesion(usuario, colegioActual) {
        App.estado.currentUser = usuario;
        App.estado.colegioActual = colegioActual;

        document.getElementById("auth-screen").classList.add("hidden");
        document.getElementById("current-user-name").innerText = usuario.nombre;
        document.getElementById("current-user-role").innerText = usuario.rolInstitucional || usuario.rol;
        document.getElementById("avatar-sesion").innerText = usuario.nombre.charAt(0);
        document.getElementById("sidebar-colegio").innerText = colegioActual
            ? colegioActual.nombre
            : "Administración Central";

        const logoImg = document.getElementById("sidebar-colegio-logo");
        if (colegioActual && colegioActual.logoDataUri) {
            logoImg.src = colegioActual.logoDataUri;
            logoImg.classList.remove("hidden");
        } else {
            logoImg.src = "";
            logoImg.classList.add("hidden");
        }

        evaluarPermisosYRestriccionesDeRoles();

        if (usuario.rol === "superadmin" && !colegioActual) {
            App.switchView("central");
            return;
        }

        await Equipo.cargarEquipoCache();
        Equipo.actualizarSelectoresEquipo();
        App.switchView("dashboard");
    }

    async function verificarSesionExistente() {
        try {
            const data = await Api.apiFetch("/auth/me");
            await establecerSesion(data.usuario, data.colegioActual);
        } catch (err) {
            // Sin sesión activa: se mantiene la pantalla de login visible.
        }
    }

    function cerrarSesion() {
        // Usa fetch crudo (no Api.apiFetch) para no disparar el interceptor de 401,
        // que llamaría de nuevo a cerrarSesion y generaría una recursión infinita.
        fetch(`${Api.API_BASE}/auth/logout`, { method: "POST", credentials: "same-origin" }).catch(() => {});
        Api.resetCsrfToken();
        App.estado.currentUser = null;
        App.estado.colegioActual = null;
        document.getElementById("auth-screen").classList.remove("hidden");
    }

    function evaluarPermisosYRestriccionesDeRoles() {
        const usuario = App.estado.currentUser;
        const colegioActual = App.estado.colegioActual;
        const enColegio = Boolean(colegioActual);
        const esSuperadmin = usuario.rol === "superadmin";

        document.getElementById("btn-nav-central").classList.toggle("hidden", !(esSuperadmin && !enColegio));
        document.getElementById("btn-volver-central").classList.toggle("hidden", !(esSuperadmin && enColegio));

        ["btn-nav-dashboard", "btn-nav-casos", "btn-nav-equipo", "btn-nav-config"].forEach((id) => {
            document.getElementById(id).classList.toggle("hidden", esSuperadmin && !enColegio);
        });

        const puedeGestionarEquipo = usuario.rol === "admin" || (esSuperadmin && enColegio);

        const formContenedor = document.getElementById("form-contenedor-equipo");
        const bannerBloqueo = document.getElementById("panel-bloqueo-equipo");
        if (puedeGestionarEquipo) {
            formContenedor.classList.remove("opacity-40", "pointer-events-none");
            bannerBloqueo.classList.add("hidden");
        } else {
            formContenedor.classList.add("opacity-40", "pointer-events-none");
            bannerBloqueo.classList.remove("hidden");
        }

        const formContenedorConfig = document.getElementById("form-contenedor-config");
        const bannerBloqueoConfig = document.getElementById("panel-bloqueo-config");
        if (puedeGestionarEquipo) {
            formContenedorConfig.classList.remove("opacity-40", "pointer-events-none");
            bannerBloqueoConfig.classList.add("hidden");
        } else {
            formContenedorConfig.classList.add("opacity-40", "pointer-events-none");
            bannerBloqueoConfig.classList.remove("hidden");
        }

        const btnGlobalNuevo = document.getElementById("btn-global-nuevo-caso");
        const puedeCrearCasos = enColegio && usuario.rol !== "invitado";
        btnGlobalNuevo.classList.toggle("hidden", !puedeCrearCasos);
    }

    return { procesarLogin, establecerSesion, verificarSesionExistente, cerrarSesion, evaluarPermisosYRestriccionesDeRoles };
})();
