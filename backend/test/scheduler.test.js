// Proves the scheduler expires unpaid bookings, cancels unassignable ones, and only runs when the database is connected.
const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.LOG_LEVEL = "silent";

const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const scheduler = require("../services/scheduler");

const query = (rows) => ({ limit: () => Promise.resolve(rows) });

test("expireUnpaidBookings cancels stale unpaid bookings as the system", async (t) => {
  let filter;
  t.mock.method(Booking, "find", (f) => { filter = f; return query([{ _id: "b1" }]); });
  // cancelBooking is real; it stops right after this update returns null (nothing else to stub)
  const cancel = t.mock.method(Booking, "findOneAndUpdate", async () => null);
  const now = new Date("2030-01-01T12:00:00Z");
  await scheduler.expireUnpaidBookings(now);
  assert.equal(filter.createdAt.$lt.toISOString(), new Date(now.getTime() - scheduler.UNPAID_EXPIRY_MINUTES * 60000).toISOString());
  assert.equal(cancel.mock.calls[0].arguments[1].$set.cancelledBy, "system");
});

test("cancelUnassignableBookings only cancels bookings whose slot has started", async (t) => {
  const started = { _id: "old", date: new Date("2020-01-01T00:00:00Z"), timeSlot: "09:00 AM - 11:00 AM" };
  const future = { _id: "new", date: new Date("2090-01-01T00:00:00Z"), timeSlot: "09:00 AM - 11:00 AM" };
  t.mock.method(Booking, "find", () => query([started, future]));
  // cancelBooking is real; it stops right after this update returns null (nothing else to stub)
  const cancel = t.mock.method(Booking, "findOneAndUpdate", async () => null);
  await scheduler.cancelUnassignableBookings();
  assert.equal(cancel.mock.callCount(), 1);
  assert.equal(cancel.mock.calls[0].arguments[0]._id, "old");
});

test("runOnce does nothing while MongoDB is disconnected", async (t) => {
  const find = t.mock.method(Booking, "find", () => query([]));
  await scheduler.runOnce();
  assert.equal(find.mock.callCount(), 0);
});

test("runOnce keeps going when a step fails", async (t) => {
  Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
  t.after(() => delete mongoose.connection.readyState);
  const find = t.mock.method(Booking, "find", () => { throw new Error("db error"); });
  await scheduler.runOnce();
  assert.equal(find.mock.callCount(), 4); // every step ran even though each one threw
});

test("start does nothing under NODE_ENV=test; stop is safe to call", () => {
  scheduler.start();
  scheduler.stop();
});

test("acquireLease lets one instance hold the lock and reports a held lock as not acquired", async (t) => {
  t.mock.method(mongoose.connection, "collection", () => ({ findOneAndUpdate: async () => ({}) }));
  assert.equal(await scheduler.acquireLease(), true);
  t.mock.method(mongoose.connection, "collection", () => ({
    findOneAndUpdate: async () => { throw Object.assign(new Error("dup"), { code: 11000 }); }
  }));
  assert.equal(await scheduler.acquireLease(), false);
});

test("acquireLease rethrows database errors other than a held lock", async (t) => {
  t.mock.method(mongoose.connection, "collection", () => ({
    findOneAndUpdate: async () => { throw new Error("network down"); }
  }));
  await assert.rejects(() => scheduler.acquireLease(), /network down/);
});
