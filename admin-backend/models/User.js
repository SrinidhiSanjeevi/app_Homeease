const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["user", "admin", "professional"], default: "user" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    active: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    mfaSecret: { type: String, default: null },
    isMfaEnabled: { type: Boolean, default: false },
    permissions: { type: [String], default: [] },
    refreshTokens: [
      {
        tokenHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        userAgent: { type: String, default: "" },
        ip: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

userSchema.index({ createdAt: -1 });
userSchema.index({ role: 1, createdAt: -1 });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
