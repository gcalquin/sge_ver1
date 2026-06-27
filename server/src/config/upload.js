const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const uploadDir = path.join(__dirname, "..", "..", process.env.UPLOAD_DIR || "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const nombreDisco = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${path.extname(file.originalname)}`;
        cb(null, nombreDisco);
    },
});

const maxUploadBytes = (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024;

// Medios de verificación esperados: documentos escaneados/firmados, fotos e
// informes. Se restringe el tipo de archivo para evitar que se almacenen
// ejecutables u otros formatos no relacionados con el expediente.
const MIME_PERMITIDOS = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const upload = multer({
    storage,
    limits: { fileSize: maxUploadBytes },
    fileFilter: (req, file, cb) => {
        if (!MIME_PERMITIDOS.includes(file.mimetype)) {
            const err = new Error(
                "Formato de archivo no permitido. Usa PDF, Word, Excel o una imagen (PNG/JPG/WEBP/GIF)."
            );
            err.status = 400;
            return cb(err);
        }
        cb(null, true);
    },
});

module.exports = { upload, uploadDir };
