const AuditLog = require("../models/AuditLog");
const logger = require("../utils/logger");

/**
 * Helper to record an audit log entry
 */
async function recordAudit({
  admin,
  action,
  targetType,
  targetId = null,
  status = "SUCCESS",
  details = {},
  req = null
}) {
  try {
    const ipAddress = req
      ? req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""
      : "";
    const userAgent = req ? req.headers["user-agent"] || "" : "";

    await AuditLog.create({
      adminId: admin._id || admin.id,
      adminEmail: admin.email,
      action,
      targetType,
      targetId: targetId ? String(targetId) : null,
      ipAddress: String(ipAddress),
      userAgent: String(userAgent),
      status,
      details
    });

    logger.info(
      { adminEmail: admin.email, action, targetType, targetId, status },
      "Admin Audit Log Recorded"
    );
  } catch (error) {
    logger.error({ err: error.message }, "Failed to write audit log");
  }
}

/**
 * Express middleware that intercepts and records audit logs for mutating requests
 */
function auditAction(action, targetType) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function (data) {
      if (req.user && res.statusCode >= 200 && res.statusCode < 400) {
        const targetId = req.params.id || data?.data?._id || data?.user?._id || data?.service?._id || null;
        recordAudit({
          admin: req.user,
          action,
          targetType,
          targetId,
          status: "SUCCESS",
          details: {
            params: req.params,
            query: req.query,
            bodySummary: req.body ? Object.keys(req.body) : []
          },
          req
        }).catch((err) => logger.error({ err: err.message }, "Audit middleware error"));
      }
      return originalJson(data);
    };

    next();
  };
}

module.exports = {
  recordAudit,
  auditAction
};
