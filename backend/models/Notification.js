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
      enum: ["Success", "Failure"],
      required: true
    },
    recipient: {
      type: String,
      default: ""
    },
    message: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Notification", notificationSchema);
