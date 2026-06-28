const Estudiantes = (() => {
    let cacheBusqueda = [];
    let temporizadores = {};

    function poblarDatalist(resultados) {
        const datalist = document.getElementById("datalist-estudiantes");
        datalist.innerHTML = resultados.map((e) => `<option value="${App.escapeHtml(e.nombre)}"></option>`).join("");
    }

    function buscarConDebounce(inputId) {
        clearTimeout(temporizadores[inputId]);
        temporizadores[inputId] = setTimeout(async () => {
            const texto = document.getElementById(inputId).value.trim();
            if (texto.length < 2) return;
            try {
                cacheBusqueda = await Api.apiFetch(`/estudiantes?search=${encodeURIComponent(texto)}`);
                poblarDatalist(cacheBusqueda);
            } catch {
                // El autocompletado es una ayuda opcional: si falla, el campo de texto libre sigue funcionando igual.
            }
        }, 250);
    }

    // Si el nombre tipeado coincide exactamente (sin distinguir mayúsculas) con
    // alguno de los últimos resultados de búsqueda, se vincula el caso a ese
    // estudiante del catálogo. Si no coincide, el caso se guarda igual con el
    // texto libre y sin vínculo (estudianteId = null).
    function idPorNombre(nombre) {
        const match = cacheBusqueda.find((e) => e.nombre.toLowerCase() === String(nombre || "").trim().toLowerCase());
        return match ? match.id : null;
    }

    async function renderCatalogo() {
        const cont = document.getElementById("lista-estudiantes-catalogo");
        if (!cont) return;
        try {
            const estudiantes = await Api.apiFetch("/estudiantes?soloActivos=false");
            cont.innerHTML = estudiantes.length
                ? estudiantes
                      .map(
                          (e) => `<div class="flex items-center justify-between border-b border-slate-100 py-1">
                            <span class="${e.activo ? "" : "text-slate-400 text-decoration-line-through"}">
                                ${App.escapeHtml(e.nombre)}${e.curso ? ` <span class="text-slate-400">(${App.escapeHtml(e.curso)})</span>` : ""}
                            </span>
                            <button type="button" class="text-xs ${e.activo ? "text-red-600" : "text-emerald-600"} hover:underline" onclick="Estudiantes.toggleActivo(${e.id}, ${!e.activo})">
                                ${e.activo ? "Desactivar" : "Activar"}
                            </button>
                        </div>`
                      )
                      .join("")
                : '<p class="text-slate-400 italic text-xs">Sin estudiantes registrados en el catálogo.</p>';
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function crear(e) {
        e.preventDefault();
        const nombre = document.getElementById("est-nombre").value.trim();
        const curso = document.getElementById("est-curso").value.trim() || null;
        if (!nombre) return;
        try {
            await Api.apiFetch("/estudiantes", { method: "POST", body: JSON.stringify({ nombre, curso }) });
            document.getElementById("form-estudiante-catalogo").reset();
            await renderCatalogo();
            App.mostrarToast("Estudiante agregado al catálogo.", "success");
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    async function toggleActivo(id, activo) {
        try {
            await Api.apiFetch(`/estudiantes/${id}`, { method: "PATCH", body: JSON.stringify({ activo }) });
            await renderCatalogo();
        } catch (err) {
            App.mostrarToast(err.message, "danger");
        }
    }

    return { buscarConDebounce, idPorNombre, renderCatalogo, crear, toggleActivo };
})();
