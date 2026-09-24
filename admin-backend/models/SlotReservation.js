const mongoose = require("mongoose");

// Mirrors backend/models/SlotReservation.js — same collection.
const slotReservationSchema = new mongoose.Schema(
  {
    professional: { type: mongoose.Schema.Types.ObjectId, ref: "Professional", required: true },
    date: { type: Date, required: true },
    timeSlot: { type: String, required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true }
  },
  { timestamps: true }
);

slotReservationSchema.index({ professional: 1, date: 1, timeSlot: 1 }, { unique: true });
slotReservationSchema.index({ booking: 1 });
slotReservationSchema.index({ date: 1, timeSlot: 1 });

module.exports =
  mongoose.models.SlotReservation ||
  mongoose.model("SlotReservation", slotReservationSchema);
