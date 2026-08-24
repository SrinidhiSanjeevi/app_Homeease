const mongoose = require("mongoose");

const emergencyRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: String, required: true },
    severity: { type: String, required: true, default: "Medium" },
    description: { type: String, required: true },
    contactNumber: { type: String, required: true },
    address: { type: String, required: true },
    status: { type: String, required: true, default: "Dispatched" },
    assignedProfessional: { type: mongoose.Schema.Types.ObjectId, ref: "Professional" },
    fireEngineDispatched: { type: Boolean, default: false },
    fireEngineNumber: { type: String, default: null },
    emergencyServiceNumber: { type: String, default: null },
    estimatedArrivalMinutes: { type: Number, default: null },
    resolvedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.models.EmergencyRequest || mongoose.model("EmergencyRequest", emergencyRequestSchema);