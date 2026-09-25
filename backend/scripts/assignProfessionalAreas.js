/**
 * Give every active professional without a home area one of the service
 * areas (services/areas.js), spread round-robin within each category so
 * each trade is covered across Gachibowli and nearby. Admins can change
 * any of them afterwards from the admin panel.
 *
 * Usage:
 *   node backend/scripts/assignProfessionalAreas.js           # dry run
 *   node backend/scripts/assignProfessionalAreas.js --apply
 *
 * Reads MONGO_URI the same way scripts/seedAdmin.js does.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const Professional = require("../models/Professional");
const { AREAS, findArea } = require("../services/areas");

const apply = process.argv.includes("--apply");

async function run() {
  if (!process.env.MONGO_URI) {
    console.error("Error: MONGO_URI is missing in environment.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  const pros = await Professional.find({ active: true }).sort({ category: 1, createdAt: 1 });
  const nextIndex = {};
  let updated = 0;

  for (const pro of pros) {
    if (findArea(pro.locality)) {
      console.log(`  keep  ${pro.category.padEnd(12)} ${pro.name} → ${pro.locality}`);
      continue;
    }
    const i = nextIndex[pro.category] || 0;
    nextIndex[pro.category] = i + 1;
    const area = AREAS[i % AREAS.length].name;
    console.log(`  set   ${pro.category.padEnd(12)} ${pro.name} → ${area}`);
    if (apply) await Professional.updateOne({ _id: pro._id }, { $set: { locality: area } });
    updated++;
  }

  console.log(`\n${updated} professional(s) ${apply ? "updated" : "would be updated"}.`);
  if (!apply) console.log("Dry run only. Re-run with --apply to save.");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
