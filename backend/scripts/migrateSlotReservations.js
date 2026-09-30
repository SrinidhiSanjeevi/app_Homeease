require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");
const SlotReservation = require("../models/SlotReservation");

const apply = process.argv.includes("--apply");

async function migrate() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("Error: MONGO_URI is missing in environment.");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  if (apply) await SlotReservation.syncIndexes();

  const active = await Booking.find({
    status: { $in: ["Created", "Assigned", "Confirmed"] },
    professional: { $ne: null }
  }).sort({ createdAt: 1 });

  const seen = new Set();
  let reserved = 0;
  let clashes = 0;
  for (const booking of active) {
    const key = `${booking.professional}|${booking.date.toISOString()}|${booking.timeSlot}`;
    if (seen.has(key)) {
      clashes++;
      console.log(`  clash: booking ${booking._id} → back to waiting`);
      if (apply) {
        await Booking.updateOne(
          { _id: booking._id },
          { $set: { professional: null, ...(booking.status === "Confirmed" ? { status: "Assigned" } : {}) } }
        );
      }
      continue;
    }
    seen.add(key);
    reserved++;
    if (apply) {
      await SlotReservation.updateOne(
        { professional: booking.professional, date: booking.date, timeSlot: booking.timeSlot },
        { $setOnInsert: { booking: booking._id } },
        { upsert: true }
      );
    }
  }

  const onEmergency = await EmergencyRequest.find({
    status: { $in: ["Dispatched", "OnTheWay", "Arrived"] },
    assignedProfessional: { $ne: null }
  }).distinct("assignedProfessional");

  const toFree = await Professional.countDocuments({ status: "Busy", _id: { $nin: onEmergency } });
  if (apply) {
    await Professional.updateMany({ status: "Busy", _id: { $nin: onEmergency } }, { $set: { status: "Available" } });
  }

  console.log(`Reservations ${apply ? "created" : "to create"}: ${reserved}`);
  console.log(`Clashing bookings ${apply ? "sent back to waiting" : "to send back"}: ${clashes}`);
  console.log(`Professionals ${apply ? "set" : "to set"} Available: ${toFree} (kept Busy on emergencies: ${onEmergency.length})`);
  if (!apply) console.log("\nDry run only. Re-run with --apply to migrate.");

  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
