// Recalcula CACHE_NAME en public/sw.js a partir de un hash del contenido real
// del app shell, en vez de depender de que alguien se acuerde de subir
// manualmente "sge-shell-vN" cada vez que toca index.html/css/js (ver gotcha #1
// de CLAUDE.md: si se olvida, los usuarios con la pestaña abierta quedan
// atrapados en la versión cacheada vieja indefinidamente).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const swPath = path.join(__dirname, "..", "public", "sw.js");
const swSource = readFileSync(swPath, "utf8");

const appShellMatch = swSource.match(/const APP_SHELL = \[([\s\S]*?)\];/);
if (!appShellMatch) {
    throw new Error("No se encontró el array APP_SHELL en public/sw.js");
}
const rutas = [...appShellMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

// Mismos mounts estáticos que registra src/app.js: cada ruta de APP_SHELL se
// resuelve al archivo real en disco para poder hashear su contenido.
function resolverRuta(ruta) {
    if (ruta.startsWith("/vendor/bootstrap/")) {
        return path.join(__dirname, "..", "node_modules", "bootstrap", "dist", ruta.replace("/vendor/bootstrap/", ""));
    }
    if (ruta.startsWith("/vendor/fontawesome/")) {
        return path.join(
            __dirname,
            "..",
            "node_modules",
            "@fortawesome",
            "fontawesome-free",
            ruta.replace("/vendor/fontawesome/", "")
        );
    }
    if (ruta.startsWith("/vendor/chartjs/")) {
        return path.join(__dirname, "..", "node_modules", "chart.js", "dist", ruta.replace("/vendor/chartjs/", ""));
    }
    return path.join(__dirname, "..", "public", ruta);
}

const hash = createHash("sha256");
for (const ruta of rutas) {
    hash.update(readFileSync(resolverRuta(ruta)));
}
const nuevoCacheName = `sge-shell-${hash.digest("hex").slice(0, 12)}`;

const nuevoSource = swSource.replace(/const CACHE_NAME = "[^"]*";/, `const CACHE_NAME = "${nuevoCacheName}";`);

if (nuevoSource === swSource) {
    console.log(`sw.js sin cambios (CACHE_NAME ya está al día: ${nuevoCacheName}).`);
} else {
    writeFileSync(swPath, nuevoSource);
    console.log(`CACHE_NAME actualizado a "${nuevoCacheName}".`);
}
