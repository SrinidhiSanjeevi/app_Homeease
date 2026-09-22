/**
 * Backfill existing Professional documents with demo coordinates, so
 * nearest-provider matching has something to match against.
 *
 * This does NOT create new professionals — it only adds a `location`
 * to ones that already exist (created via the admin panel), grouped
 * by category. For each category it demonstrates all three cases the
 * capstone spec asks for:
 *   - Provider A: ~1km from the reference point   → nearest, Available
 *   - Provider B: ~8km from the reference point   → farther, Available
 *   - Provider C: ~2km from the reference point   → closer than B,
 *                 but marked Busy, so it must be ignored
 *
 * A category with fewer than 3 professionals just gets what it can
 * (e.g. 1 professional = Provider A only).
 *
 * Usage:
 *   node backend/scripts/seedProviderLocations.js
 *
 * Reads MONGO_URI the same way scripts/seedAdmin.js does.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Professional = require("../models/Professional");

// Coimbatore, Tamil Nadu — arbitrary reference point, not tied to any
// real customer address. Small offsets below approximate real-world
// distances closely enough for a capstone demo (roughly 111km per
// degree of latitude near the equator).
const REFERENCE = { latitude: 11.0168, longitude: 76.9558 };

const DEMO_OFFSETS = [
  { label: "Provider A (nearest)", latDelta: 0.009, lngDelta: 0.0, status: "Available" }, // ~1km
  { label: "Provider C (closer, but unavailable)", latDelta: 0.0, lngDelta: 0.018, status: "Busy" }, // ~2km
  { label: "Provider B (farther)", latDelta: 0.07, lngDelta: 0.0, status: "Available" } // ~8km
];

async function seedProviderLocations() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("Error: MONGO_URI is missing in environment.");
    process.exit(1);
  }

  console.log("Connecting to database...");
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB.");

  const professionals = await Professional.find({ active: true }).sort({ category: 1, createdAt: 1 });
  const byCategory = new Map();
  for (const professional of professionals) {
    if (!byCategory.has(professional.category)) byCategory.set(professional.category, []);
    byCategory.get(professional.category).push(professional);
  }

  let updated = 0;
  for (const [category, list] of byCategory.entries()) {
    console.log(`\n${category}: ${list.length} professional(s)`);

    for (let i = 0; i < list.length && i < DEMO_OFFSETS.length; i++) {
      const professional = list[i];
      const offset = DEMO_OFFSETS[i];

      professional.location = {
        type: "Point",
        coordinates: [
          REFERENCE.longitude + offset.lngDelta,
          REFERENCE.latitude + offset.latDelta
        ]
      };
      professional.status = offset.status;
      await professional.save();
      updated++;

      console.log(`  ${offset.label}: ${professional.name} -> status=${offset.status}`);
    }
  }

  console.log(`\nDone. Updated ${updated} professional(s) with demo coordinates.`);
  console.log(`Reference point (approximate "customer" location for testing): ${REFERENCE.latitude}, ${REFERENCE.longitude}`);

  await mongoose.disconnect();
  process.exit(0);
}

seedProviderLocations().catch((error) => {
  console.error("Failed to seed provider locations:", error.message);
  process.exit(1);
});
