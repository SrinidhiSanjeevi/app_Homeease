#!/usr/bin/env node
/**
 * split-by-service.js
 *
 * One-time local data migration: fans a single seed database
 * (`homeease_seed`, populated beforehand via `mongodump`/`mongorestore`
 * from a real snapshot) out into the 4 per-service databases the
 * split microservices now own, by collection ownership:
 *
 *   homeease_booking:      users, bookings, professionals, services,
 *                          emergencyrequests, slotreservations
 *   homeease_payment:      payments
 *   homeease_notification: notifications
 *   homeease_admin:        auditlogs
 *
 * Uses the raw `mongodb` driver (not Mongoose) so copying is not subject
 * to any service's schema validation. For each collection it reads every
 * document from `homeease_seed.<collection>` and drop+insertMany's it
 * into the owning target database's collection of the same name — every
 * `_id` and every cross-collection ObjectId reference is copied
 * byte-for-byte, untouched. Re-running is safe (drop+insertMany makes
 * each collection idempotent).
 *
 * Indexes are NOT hand-copied here: each service's own Mongoose models
 * declare their own `schema.index(...)`, and `autoIndex: true` (the
 * default, unchanged anywhere in this codebase) rebuilds them on first
 * connect.
 *
 * Usage:
 *   node scripts/local-db-split/split-by-service.js
 *   MONGO_URI="mongodb://127.0.0.1:27017" node scripts/local-db-split/split-by-service.js
 *
 * Source database name can be overridden with SEED_DB_NAME (defaults to
 * "homeease_seed").
 */

"use strict";

const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const SEED_DB_NAME = process.env.SEED_DB_NAME || "homeease_seed";

// Target database -> collections it owns, copied verbatim from the plan.
const OWNERSHIP = {
  homeease_booking: [
    "users",
    "bookings",
    "professionals",
    "services",
    "emergencyrequests",
    "slotreservations",
  ],
  homeease_payment: ["payments"],
  homeease_notification: ["notifications"],
  homeease_admin: ["auditlogs"],
};

async function splitCollection(seedDb, targetDb, collectionName) {
  const sourceCollection = seedDb.collection(collectionName);
  const docs = await sourceCollection.find({}).toArray();

  const targetCollection = targetDb.collection(collectionName);

  // Idempotent: drop the target collection (if it exists) before
  // re-inserting, so re-running this script is always safe.
  const existing = await targetDb
    .listCollections({ name: collectionName })
    .toArray();
  if (existing.length > 0) {
    await targetCollection.drop();
  }

  if (docs.length === 0) {
    console.log(
      `  [${targetDb.databaseName}] ${collectionName}: 0 docs in source, skipping insert (collection left absent)`
    );
    return 0;
  }

  await targetCollection.insertMany(docs, { ordered: true });
  console.log(
    `  [${targetDb.databaseName}] ${collectionName}: copied ${docs.length} doc(s)`
  );
  return docs.length;
}

async function main() {
  console.log(`Connecting to ${MONGO_URI} ...`);
  const client = new MongoClient(MONGO_URI);

  let totalCopied = 0;
  const failures = [];

  try {
    await client.connect();

    const seedDb = client.db(SEED_DB_NAME);
    const seedCollectionNames = new Set(
      (await seedDb.listCollections({}, { nameOnly: true }).toArray()).map(
        (c) => c.name
      )
    );

    if (seedCollectionNames.size === 0) {
      throw new Error(
        `Source database "${SEED_DB_NAME}" has no collections. Did you run ` +
          `mongorestore into it first? (see scripts/local-db-split/README.md)`
      );
    }

    for (const [targetDbName, collections] of Object.entries(OWNERSHIP)) {
      console.log(`\n-> ${targetDbName}`);
      const targetDb = client.db(targetDbName);

      for (const collectionName of collections) {
        if (!seedCollectionNames.has(collectionName)) {
          console.warn(
            `  [${targetDbName}] ${collectionName}: NOT FOUND in ${SEED_DB_NAME}, skipping`
          );
          continue;
        }
        try {
          totalCopied += await splitCollection(
            seedDb,
            targetDb,
            collectionName
          );
        } catch (err) {
          failures.push({ targetDbName, collectionName, err });
          console.error(
            `  [${targetDbName}] ${collectionName}: FAILED - ${err.message}`
          );
        }
      }
    }

    console.log(`\nTotal documents copied: ${totalCopied}`);

    if (failures.length > 0) {
      console.error(
        `\n${failures.length} collection(s) failed to copy:`
      );
      for (const f of failures) {
        console.error(`  - ${f.targetDbName}.${f.collectionName}: ${f.err.message}`);
      }
      throw new Error("split-by-service.js completed with failures");
    }

    console.log("\nSplit completed successfully.");
  } finally {
    await client.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\nsplit-by-service.js failed:", err && err.message ? err.message : err);
    process.exit(1);
  }
);
