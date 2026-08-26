const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
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
    amount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ["Pending", "Success", "Failure", "Refunded"],
      required: true
    },
    paymentMethod: {
      type: String,
      default: "Razorpay"
    },
    transactionId: {
      type: String,
      required: true
    },
    // ─── Razorpay-specific fields ────────────────────────────────
    // Only populated for online payments; undefined/absent for
    // Cash on Delivery entries, which is fine — none of these are `required`.
    razorpayOrderId: {
      type: String
    },
    razorpaySignature: {
      type: String
    },
    refundId: {
      type: String
    },
    failureReason: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Payment", paymentSchema);