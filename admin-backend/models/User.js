const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["user", "admin", "professional"], default: "user" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

userSchema.index({ createdAt: -1 });
userSchema.index({ role: 1, createdAt: -1 });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
