// Proves the outbox scheduler only sweeps when MongoDB is connected and only starts outside test/disabled modes.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const scheduler = require("../services/scheduler");

// Pretend the MongoDB connection is in the given state (1 = connected).
function fakeConnectionState(t, state) {
  Object.defineProperty(mongoose.connection, "readyState", { get: () => state, configurable: true });
  t.after(() => { delete mongoose.connection.readyState; });
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("runOnce does nothing when MongoDB is not connected", async (t) => {
  fakeConnectionState(t, 0);
  const find = t.mock.method(Notification, "find", () => assert.fail("must not query"));
  await scheduler.runOnce();
  assert.equal(find.mock.callCount(), 0);
});

test("runOnce sweeps pending notifications when connected, and survives a log-worthy result or an error", async (t) => {
  fakeConnectionState(t, 1);
  const docs = [];
  const find = t.mock.method(Notification, "find", () => ({ limit: async () => docs }));
  await scheduler.runOnce();
  assert.equal(find.mock.callCount(), 1);
  find.mock.restore();
  t.mock.method(Notification, "find", () => { throw new Error("db"); });
  await assert.doesNotReject(scheduler.runOnce());
});

test("start does nothing in test mode or when the scheduler is disabled", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const saved = [process.env.NODE_ENV, process.env.SCHEDULER_ENABLED];
  t.after(() => { process.env.NODE_ENV = saved[0]; process.env.SCHEDULER_ENABLED = saved[1]; scheduler.stop(); });
  fakeConnectionState(t, 1);
  const find = t.mock.method(Notification, "find", () => ({ limit: async () => [] }));
  process.env.NODE_ENV = "test";
  scheduler.start();
  process.env.NODE_ENV = "production";
  process.env.SCHEDULER_ENABLED = "false";
  scheduler.start();
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(find.mock.callCount(), 0);
});

test("start sweeps every 30 seconds, ignores a second start, and stop cancels it", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const saved = [process.env.NODE_ENV, process.env.SCHEDULER_ENABLED];
  t.after(() => {
    process.env.NODE_ENV = saved[0];
    if (saved[1] === undefined) delete process.env.SCHEDULER_ENABLED; else process.env.SCHEDULER_ENABLED = saved[1];
    scheduler.stop();
  });
  process.env.NODE_ENV = "production";
  delete process.env.SCHEDULER_ENABLED;
  fakeConnectionState(t, 1);
  const find = t.mock.method(Notification, "find", () => ({ limit: async () => [] }));
  scheduler.start();
  scheduler.start();
  t.mock.timers.tick(30000);
  await flush();
  assert.equal(find.mock.callCount(), 1);
  scheduler.stop();
  t.mock.timers.tick(30000);
  await flush();
  assert.equal(find.mock.callCount(), 1);
});
