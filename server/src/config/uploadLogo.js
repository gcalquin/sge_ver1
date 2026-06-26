const multer = require("multer");

const MIME_PERMITIDOS = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const uploadLogo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!MIME_PERMITIDOS.includes(file.mimetype)) {
            const err = new Error("Formato de imagen no permitido. Usa PNG, JPG, WEBP o GIF.");
            err.status = 400;
            return cb(err);
        }
        cb(null, true);
    },
});

module.exports = { uploadLogo };
