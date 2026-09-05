const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: {
      type: String,
      enum: ["SMS", "Email", "Push Notification"],
      required: true
    },
    status: {
      type: String,
      enum: ["Pending", "Processing", "Sent", "Success", "Failed", "Failure"],
      default: "Pending",
      required: true,
      index: true
    },
    recipient: {
      type: String,
      default: ""
    },
    message: {
      type: String,
      required: true
    },
    notificationType: {
      type: String,
      default: ""
    },
    idempotencyKey: {
      type: String,
      sparse: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    maxAttempts: {
      type: Number,
      default: 3
    },
    nextRetryAt: {
      type: Date,
      default: null
    },
    lastError: {
      type: String,
      default: ""
    },
    processedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

notificationSchema.index({ status: 1, nextRetryAt: 1 });
notificationSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
notificationSchema.index({ booking: 1, notificationType: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
