const Offline = (() => {
    const KEY = "sge_cola_offline";

    function leerCola() {
        return JSON.parse(localStorage.getItem(KEY) || "[]");
    }

    function guardarCola(cola) {
        localStorage.setItem(KEY, JSON.stringify(cola));
    }

    function encolar(item) {
        const cola = leerCola();
        cola.push(item);
        guardarCola(cola);
    }

    function tamanoCola() {
        return leerCola().length;
    }

    async function sincronizar() {
        const cola = leerCola();
        if (cola.length === 0) return;

        const restantes = [];
        for (const item of cola) {
            try {
                await Api.apiFetch(item.path, { method: item.method, body: JSON.stringify(item.body) });
            } catch (err) {
                restantes.push(item);
            }
        }
        guardarCola(restantes);

        if (restantes.length < cola.length) {
            App.mostrarToast(
                restantes.length === 0
                    ? "Bitácora offline sincronizada correctamente."
                    : `Se sincronizaron algunas entradas; ${restantes.length} quedaron pendientes.`,
                "success"
            );
            if (App.estado.casoSeleccionadoId) Casos.verDetalleCaso(App.estado.casoSeleccionadoId);
        }
    }

    window.addEventListener("online", sincronizar);

    return { encolar, tamanoCola, sincronizar };
})();
