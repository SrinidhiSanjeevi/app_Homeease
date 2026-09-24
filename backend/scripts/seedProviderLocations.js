/**
 * Give existing professionals a base locality inside the HomeEase
 * service area (Gachibowli, Hyderabad and surroundings).
 *
 * Bookings and emergencies are only ever assigned to professionals with
 * a location within MATCH_RADIUS_KM of the customer, so professionals
 * created before localities existed (or seeded with the old demo
 * coordinates) receive no jobs until this runs.
 *
 * Within each category, professionals are spread round-robin across the
 * localities in services/serviceArea.js. Status is left unchanged.
 *
 * Usage:
 *   node backend/scripts/seedProviderLocations.js          # only those missing / outside the area
 *   node backend/scripts/seedProviderLocations.js --all    # reassign everyone
 *
 * Reads MONGO_URI the same way scripts/seedAdmin.js does.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Professional = require("../models/Professional");
const { LOCALITIES, SERVICE_AREA, isWithinServiceArea } = require("../services/serviceArea");

const reassignAll = process.argv.includes("--all");

function hasValidLocation(professional) {
  const coords = professional.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return false;
  return isWithinServiceArea(coords[1], coords[0]);
}

async function seedProviderLocations() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("Error: MONGO_URI is missing in environment.");
    process.exit(1);
  }

  console.log("Connecting to database...");
  await mongoose.connect(mongoUri);
  console.log(`Connected. Service area: ${SERVICE_AREA.name} (${SERVICE_AREA.radiusKm} km)`);

  const professionals = await Professional.find({ active: true }).sort({ category: 1, createdAt: 1 });
  const byCategory = new Map();
  for (const professional of professionals) {
    if (!byCategory.has(professional.category)) byCategory.set(professional.category, []);
    byCategory.get(professional.category).push(professional);
  }

  let updated = 0;
  for (const [category, list] of byCategory.entries()) {
    console.log(`\n${category}: ${list.length} professional(s)`);

    for (let i = 0; i < list.length; i++) {
      const professional = list[i];
      if (!reassignAll && professional.locality && hasValidLocation(professional)) {
        console.log(`  keep  ${professional.name} -> ${professional.locality}`);
        continue;
      }

      const locality = LOCALITIES[i % LOCALITIES.length];
      professional.locality = locality.name;
      professional.location = { type: "Point", coordinates: [locality.longitude, locality.latitude] };
      await professional.save();
      updated++;

      console.log(`  set   ${professional.name} -> ${locality.name}`);
    }
  }

  console.log(`\nDone. Updated ${updated} professional(s).`);

  await mongoose.disconnect();
  process.exit(0);
}

seedProviderLocations().catch((error) => {
  console.error("Failed to seed provider locations:", error.message);
  process.exit(1);
});
