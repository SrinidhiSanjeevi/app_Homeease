/**
 * Split the old catch-all "Repair" category into:
 *   - Cleaning : house / sofa / upholstery cleaning
 *   - Repair   : appliance repair (AC, fan, TV, fridge, washing machine...)
 *
 * Moves the matching services and one existing professional so every
 * category that has services still has someone to assign bookings to.
 *
 * Deploy the backend + admin-backend with "Cleaning" in the Service enum
 * BEFORE running with --apply, otherwise old pods fail validation when
 * they save these services.
 *
 * Usage:
 *   node scripts/migrations/migrateCleaningCategory.js          # dry run
 *   node scripts/migrations/migrateCleaningCategory.js --apply  # write
 */

const mongoose = require("mongoose");
require("dotenv").config();

const Service = require("../../models/Service");
const Professional = require("../../models/Professional");

const APPLY = process.argv.includes("--apply");

const SERVICE_MOVES = {
  "Deep House Cleaning": "Cleaning",
  "Sofa & Upholstery Dry Cleaning": "Cleaning",
  "AC Deep Filter & Foam Service": "Repair",
  "Ceiling Fan Installation & Repair": "Repair"
};

const PROFESSIONAL_MOVES = {
  "Henry Collins": "Cleaning"
};

async function move(Model, label, moves) {
  for (const [name, category] of Object.entries(moves)) {
    const doc = await Model.findOne({ name }, { category: 1 }).lean();

    if (!doc) {
      console.log(`SKIP ${label}: "${name}" not found`);
      continue;
    }

    if (doc.category === category) {
      console.log(`OK   ${label}: "${name}" already ${category}`);
      continue;
    }

    console.log(`${APPLY ? "MOVE" : "WOULD MOVE"} ${label}: "${name}" ${doc.category} -> ${category}`);

    if (APPLY) {
      await Model.updateOne({ _id: doc._id }, { $set: { category } });
    }
  }
}

async function printCounts() {
  const [services, pros] = await Promise.all([
    Service.aggregate([{ $group: { _id: "$category", n: { $sum: 1 } } }]),
    Professional.aggregate([{ $group: { _id: "$category", n: { $sum: 1 } } }])
  ]);

  const counts = {};
  services.forEach((s) => { counts[s._id] = { services: s.n, pros: 0 }; });
  pros.forEach((p) => { counts[p._id] = { services: 0, ...counts[p._id], pros: p.n }; });

  console.table(counts);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  console.log(APPLY ? "Applying changes\n" : "Dry run (pass --apply to write)\n");

  await move(Service, "service", SERVICE_MOVES);
  await move(Professional, "professional", PROFESSIONAL_MOVES);

  console.log("");
  await printCounts();

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("\nMigration failed:");
  console.error(error);

  try {
    await mongoose.disconnect();
  } catch (_) {}

  process.exit(1);
});
