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

const upload = multer({ storage, limits: { fileSize: maxUploadBytes } });

module.exports = { upload, uploadDir };
