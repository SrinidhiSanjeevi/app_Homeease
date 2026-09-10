const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    adminEmail: {
      type: String,
      required: true
    },
    action: {
      type: String,
      required: true
    },
    targetType: {
      type: String,
      required: true
    },
    targetId: {
      type: String,
      default: null
    },
    ipAddress: {
      type: String,
      default: ""
    },
    userAgent: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILURE"],
      default: "SUCCESS"
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
