# local-db-split

One-time local data migration for the shared-database → microservices split.

## What it does

`split-by-service.js` reads every collection out of a single seed database
(`homeease_seed`) and fans it out into the 4 databases the split services now
own, by collection ownership:

| Target database         | Collections |
|--------------------------|-------------|
| `homeease_booking`       | `users`, `bookings`, `professionals`, `services`, `emergencyrequests`, `slotreservations` |
| `homeease_payment`       | `payments` |
| `homeease_notification`  | `notifications` |
| `homeease_admin`         | `auditlogs` |

For each collection it does a `drop` + `insertMany` into the target, so it's
safe to re-run — every document (including `_id` and every cross-collection
ObjectId reference) is copied byte-for-byte, untouched. It uses the raw
`mongodb` driver, not Mongoose, so no service's schema validation runs during
the copy. Indexes aren't hand-copied — each service's own Mongoose models
declare `schema.index(...)` and `autoIndex: true` (the default) rebuilds them
on first connect.

## When to run it

Once, locally, **before** starting the split services (`backend`,
`admin-backend`, `payment-service`, `notification-service`) against the new
`mongo` docker-compose container — and after you've restored a real data
snapshot into `homeease_seed`:

```bash
# 1. Read-only dump from Atlas (never writes to Atlas)
mongodump --uri="<ATLAS_URI>" --out=./scratch/atlas-snapshot

# 2. Restore that snapshot into a local homeease_seed database
mongorestore --uri="mongodb://127.0.0.1:27017" \
  --nsFrom="<sourceDbName>.*" --nsTo="homeease_seed.*" \
  ./scratch/atlas-snapshot

# 3. Split homeease_seed into the 4 per-service databases
cd scripts/local-db-split
npm install
node split-by-service.js
```

Re-run step 3 any time you want to re-seed the split databases from a fresh
`homeease_seed` — it's idempotent.

## How to invoke it

```bash
node scripts/local-db-split/split-by-service.js
```

Connects to `mongodb://127.0.0.1:27017` by default. Override with:

- `MONGO_URI` — Mongo connection string (e.g. point it at the docker-compose
  `mongo` service via a locally-forwarded port, or a remote instance).
- `SEED_DB_NAME` — source database name (defaults to `homeease_seed`).

The script logs how many documents it copied per collection and exits
non-zero if any collection fails to copy, so a CI/manual runner notices.
