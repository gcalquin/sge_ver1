const js = require("@eslint/js");
const eslintConfigPrettier = require("eslint-config-prettier");

// Globals que cada módulo IIFE de public/js/*.js expone como variable global
// (const Modulo = (() => {...})()) y que los demás módulos consumen sin import,
// ya que se cargan como <script> planos en index.html (ver sección 6 de CLAUDE.md).
const FRONTEND_MODULE_GLOBALS = {
    App: "readonly",
    Api: "readonly",
    Auth: "readonly",
    Colegios: "readonly",
    Dashboard: "readonly",
    Casos: "readonly",
    Bitacora: "readonly",
    Mediaciones: "readonly",
    Capacitaciones: "readonly",
    Convivencia: "readonly",
    Equipo: "readonly",
    Config: "readonly",
    Offline: "readonly",
    Estudiantes: "readonly",
    ComiteConvivencia: "readonly",
    DashboardSostenedor: "readonly",
    Sumarios: "readonly",
};

const BROWSER_GLOBALS = {
    window: "readonly",
    document: "readonly",
    navigator: "readonly",
    fetch: "readonly",
    URLSearchParams: "readonly",
    FormData: "readonly",
    setTimeout: "readonly",
    clearTimeout: "readonly",
    bootstrap: "readonly",
    Chart: "readonly",
};

const NODE_GLOBALS = {
    require: "readonly",
    module: "writable",
    exports: "writable",
    process: "readonly",
    __dirname: "readonly",
    console: "readonly",
    setTimeout: "readonly",
    fetch: "readonly",
};

const UNUSED_VARS_RULE = ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }];

// Cada módulo de public/js/*.js declara `const NombreDelModulo = (() => {...})()`
// como único punto de entrada del archivo; ESLint no puede ver que se consume
// desde onclick="" inline en el HTML o desde otros <script>, así que sin esto
// marcaría como "no usado" justo lo que el archivo existe para exponer.
const FRONTEND_UNUSED_VARS_RULE = [
    "warn",
    {
        argsIgnorePattern: "^_",
        caughtErrors: "none",
        varsIgnorePattern: `^(${Object.keys(FRONTEND_MODULE_GLOBALS).join("|")})$`,
    },
];

module.exports = [
    js.configs.recommended,
    {
        ignores: ["node_modules/**", "public/vendor/**", "public/css/tailwind.css", "uploads/**", "*.log"],
    },
    {
        // Reglas pensadas para librerías de alto nivel, no para este código de
        // aplicación: forzar "cause" al re-lanzar errores o prohibir catch vacíos
        // rompe patrones deliberados (mensajes de error más amigables, ignorar un
        // fallo de parseo de JSON best-effort).
        rules: {
            "preserve-caught-error": "off",
            "no-empty": ["error", { allowEmptyCatch: true }],
        },
    },
    {
        files: ["src/**/*.js", "migrations/**/*.js", "*.config.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: NODE_GLOBALS,
        },
        rules: { "no-unused-vars": UNUSED_VARS_RULE },
    },
    {
        files: ["scripts/**/*.mjs"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: NODE_GLOBALS,
        },
        rules: { "no-unused-vars": UNUSED_VARS_RULE },
    },
    {
        files: ["tests/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: NODE_GLOBALS,
        },
        rules: { "no-unused-vars": UNUSED_VARS_RULE },
    },
    {
        files: ["public/js/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: { ...BROWSER_GLOBALS, ...FRONTEND_MODULE_GLOBALS, localStorage: "readonly" },
        },
        rules: {
            "no-unused-vars": FRONTEND_UNUSED_VARS_RULE,
            // Cada módulo IIFE declara su propio global (const Casos = (() => {...})())
            // y los demás lo consumen sin import: es el mismo nombre por diseño, no
            // una redeclaración accidental.
            "no-redeclare": "off",
        },
    },
    {
        files: ["public/sw.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: { self: "readonly", caches: "readonly", fetch: "readonly", URL: "readonly" },
        },
    },
    eslintConfigPrettier,
];
