const multer = require("multer");
const { randomUUID } = require("crypto");
const { uploadBuffer, generateImageUrl } = require("../services/blobStorage");
const logger = require("../utils/logger");

// ── Allowed MIME types ────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif"
]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(
          new Error("Only image files are allowed (jpeg/png/webp/gif/avif)"),
          { status: 400 }
        )
      );
    }
  }
}).single("image");

// ── Extension map from MIME ───────────────────────────────────
const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/gif":  "gif",
  "image/avif": "avif"
};

const FOLDER_TO_CONTAINER = {
  services: "service-images",
  professionals: "professional-images"
};

async function uploadImage(req, res, next) {
  upload(req, res, async (multerErr) => {
    if (multerErr) {
      if (multerErr.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "File exceeds the 5 MB limit" });
      }
      return res.status(multerErr.status || 400).json({ error: multerErr.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No image file provided in field 'image'" });
    }

    // Validate folder param
    const rawFolder = req.query.folder || "services";
    const folder = ["services", "professionals"].includes(rawFolder)
      ? rawFolder
      : "services";

    const ext = MIME_TO_EXT[req.file.mimetype] || "jpg";
    const blobName = `${randomUUID()}.${ext}`;
    const containerName = FOLDER_TO_CONTAINER[folder];
    const imageKey = `${containerName}/${blobName}`;

    try {
      await uploadBuffer(req.file.buffer, containerName, blobName, req.file.mimetype);

      const imageUrl = await generateImageUrl(imageKey, 15);

      logger.info(
        { adminEmail: req.user?.email, imageKey, folder, bytes: req.file.size },
        "Admin image uploaded"
      );

      return res.status(200).json({ imageKey, imageUrl });
    } catch (err) {
      logger.error(
        { adminEmail: req.user?.email, folder, error: err.message },
        "Azure Blob upload failed"
      );
      return next(err);
    }
  });
}

module.exports = { uploadImage };
