const crypto = require("crypto");
const logger = require("../utils/logger");

// Service-to-service auth: the backend sends X-Internal-Token on every
// call. When INTERNAL_SERVICE_TOKEN is not set (local development), the
// check is skipped with a warning — production must set it.
const TOKEN = (process.env.INTERNAL_SERVICE_TOKEN || "").trim();

if (!TOKEN) {
  logger.warn("[internalAuth] INTERNAL_SERVICE_TOKEN is not set — internal payment routes are unauthenticated");
}

function requireInternalToken(req, res, next) {
  if (!TOKEN) return next();

  const provided = String(req.headers["x-internal-token"] || "");
  const valid =
    provided.length === TOKEN.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(TOKEN));

  if (!valid) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  return next();
}

module.exports = { requireInternalToken };
