/**
 * Remove fake 0,0 locations from bookings and emergencies.
 *
 * Before the service-area change, a request without a shared location
 * stored Number(null) === 0 for both coordinates, i.e. a point in the
 * Gulf of Guinea. Those records can never be matched to a professional
 * and show "0.0000, 0.0000" in the admin panel, so drop the field.
 *
 * Usage:
 *   node backend/scripts/cleanupZeroLocations.js           # dry run
 *   node backend/scripts/cleanupZeroLocations.js --apply
 *
 * Reads MONGO_URI the same way scripts/seedAdmin.js does.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");

const apply = process.argv.includes("--apply");
const zeroFilter = { "location.latitude": 0, "location.longitude": 0 };

async function cleanup() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("Error: MONGO_URI is missing in environment.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  for (const [label, Model] of [["bookings", Booking], ["emergencies", EmergencyRequest]]) {
    const count = await Model.countDocuments(zeroFilter);
    if (apply && count > 0) {
      await Model.updateMany(zeroFilter, { $unset: { location: "", assignedDistanceKm: "" } });
    }
    console.log(`${label}: ${count} record(s) with a 0,0 location${apply ? " — cleaned" : ""}`);
  }

  if (!apply) console.log("\nDry run only. Re-run with --apply to clean them.");

  await mongoose.disconnect();
  process.exit(0);
}

cleanup().catch((error) => {
  console.error("Cleanup failed:", error.message);
  process.exit(1);
});
