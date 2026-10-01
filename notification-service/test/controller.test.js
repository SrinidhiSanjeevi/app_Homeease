// Proves the notification controller validates ids/types and returns 202/200 or 400/500 as expected.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const Notification = require("../models/Notification");

// The controller destructures dispatchNotification when it loads, so swap the service module BEFORE requiring it.
const servicePath = require.resolve("../services/notificationService");
let dispatchImpl = async () => ({});
require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: { dispatchNotification: (...args) => dispatchImpl(...args) } };
const controller = require("../controllers/notificationController");

const ID = "64b7f0c2a1b2c3d4e5f60718";
const makeRes = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; }
});
const call = async (handler, req) => {
  const res = makeRes();
  await handler(req, res);
  return res;
};

test("dispatch rejects a bad type, bookingId or userId", async () => {
  const bad = [
    {}, { type: "NOPE", bookingId: ID, userId: ID },
    { type: "BOOKING_CONFIRMED", bookingId: "x", userId: ID },
    { type: "BOOKING_CONFIRMED", bookingId: ID, userId: "x" }
  ];
  for (const body of bad) assert.equal((await call(controller.dispatch, { body })).statusCode, 400);
  assert.equal((await call(controller.dispatch, {})).statusCode, 400);
});

test("dispatch answers 202 with the notification, and 500 on failure", async (t) => {
  const send = t.mock.fn(async () => undefined);
  dispatchImpl = send;
  const res = await call(controller.dispatch, { body: { type: "BOOKING_CONFIRMED", bookingId: ID, userId: ID } });
  assert.deepEqual([res.statusCode, res.body.notification], [202, null]);
  assert.equal(send.mock.calls[0].arguments[0].booking, ID);
  dispatchImpl = async () => { throw new Error("x"); };
  assert.equal((await call(controller.dispatch, { body: { type: "BOOKING_CONFIRMED", bookingId: ID, userId: ID } })).statusCode, 500);
});

test("getNotificationsForBooking validates the id and lists records", async (t) => {
  assert.equal((await call(controller.getNotificationsForBooking, { params: { bookingId: "x" } })).statusCode, 400);
  const find = t.mock.method(Notification, "find", () => ({ sort() { return this; }, lean: async () => [{ _id: 1 }] }));
  const res = await call(controller.getNotificationsForBooking, { params: { bookingId: ID } });
  assert.equal(res.body.notifications.length, 1);
  assert.deepEqual(find.mock.calls[0].arguments[0], { booking: { $eq: ID } });
  find.mock.restore();
  t.mock.method(Notification, "find", () => { throw new Error("db"); });
  assert.equal((await call(controller.getNotificationsForBooking, { params: { bookingId: ID } })).statusCode, 500);
});
