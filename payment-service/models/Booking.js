const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    service: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
    professional: { type: mongoose.Schema.Types.ObjectId, ref: "Professional" },
    totalPrice: { type: Number, required: true },
    paymentMethod: { type: String, required: true, default: "Cash on Delivery" },
    paymentStatus: { type: String, required: true, default: "Pending" },
    status: {
      type: String,
      required: true,
      enum: ["Created", "Assigned", "Confirmed", "Completed", "Cancelled"],
      default: "Created"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
