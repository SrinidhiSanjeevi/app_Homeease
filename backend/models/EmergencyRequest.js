const mongoose = require("mongoose");

const emergencyRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    category: {
      type: String,
      required: true,
      enum: ["Electrical", "Plumbing", "Security", "Fire", "Medical"]
    },
    severity: {
      type: String,
      required: true,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium"
    },
    description: {
      type: String,
      required: true
    },
    contactNumber: {
      type: String,
      required: true
    },
    address: {
      type: String,
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: ["Dispatched", "OnTheWay", "Arrived", "Resolved", "Cancelled"],
      default: "Dispatched"
    },
    assignedProfessional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Professional"
    },
    // Fire engine / emergency services dispatched based on severity
    fireEngineDispatched: {
      type: Boolean,
      default: false
    },
    fireEngineNumber: {
      type: String,
      default: null
    },
    emergencyServiceNumber: {
      type: String,
      default: null   // e.g. "101", "108", "100"
    },
    // ETA in minutes
    estimatedArrivalMinutes: {
      type: Number,
      default: null
    },
    resolvedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Clear cached model
if (mongoose.models && mongoose.models.EmergencyRequest) {
  delete mongoose.models.EmergencyRequest;
}

module.exports = mongoose.model("EmergencyRequest", emergencyRequestSchema);
