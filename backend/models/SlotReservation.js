const mongoose = require("mongoose");

// One document per (professional, date, time slot) that is taken by a
// booking. The unique index is what makes double-booking impossible:
// two customers racing for the same professional and slot can't both
// insert, so the loser simply moves on to the next nearest professional.
//
// Reservations are removed when the booking is completed, cancelled or
// expires unpaid — the professional is free for that slot again. The
// professional's own `status` (Available / Busy) is no longer touched by
// scheduled bookings; it means "on duty" and is used for emergencies.
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
