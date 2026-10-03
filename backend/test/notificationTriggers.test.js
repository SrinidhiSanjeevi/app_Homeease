// Proves who gets emailed and when: online payments, admin completion, and the shared assignment helper.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const Booking = require("../models/Booking");
const Professional = require("../models/Professional");
const SlotReservation = require("../models/SlotReservation");
const notificationClient = require("../services/notification/notificationClient");
const { notifyBookingAssigned } = require("../services/simulationService");
const internal = require("../controllers/internal/bookingInternalController");
const admin = require("../controllers/internal/adminBookingController");

const makeRes = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; }
});
const settle = () => new Promise((resolve) => setImmediate(resolve)); // let fire-and-forget notifications run
const selectChain = (value) => ({ select: () => Promise.resolve(value) });
const types = (dispatch) => dispatch.mock.calls.map((c) => c.arguments[0].type);

test("notifyBookingAssigned emails the customer and the provider, and surfaces a failure", async (t) => {
  const dispatch = t.mock.method(notificationClient, "dispatch", async () => ({ notification: { id: "n" } }));
  await notifyBookingAssigned({ _id: "b1", user: "u1" }, { name: "Ravi", email: "r@x.com" });
  assert.deepEqual(types(dispatch), ["BOOKING_CONFIRMED", "PROFESSIONAL_NEW_JOB"]);
  assert.equal(dispatch.mock.calls[1].arguments[0].recipientEmail, "r@x.com");

  dispatch.mock.mockImplementation(async () => { throw new Error("mail service down"); });
  await assert.rejects(notifyBookingAssigned({ _id: "b2", user: { _id: "u2" } }, null), /mail service down/);
});

test("an online payment that confirms a booking now emails the customer and the provider", async (t) => {
  const paid = { _id: "b1", user: "u1", status: "Confirmed", professional: "p1" };
  t.mock.method(Booking, "findOneAndUpdate", () => selectChain(paid));
  t.mock.method(Professional, "findById", () => ({ select: () => ({ lean: async () => ({ name: "Ravi", email: "r@x.com" }) }) }));
  const dispatch = t.mock.method(notificationClient, "dispatch", async () => ({ notification: {} }));

  const res = makeRes();
  await internal.settleBookingPayment({ params: { id: "64b7f0c2a1b2c3d4e5f60718" }, body: { outcome: "paid" } }, res);
  await settle();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(types(dispatch).sort(), ["BOOKING_CONFIRMED", "PROFESSIONAL_NEW_JOB"]);
});

test("an online payment with no professional yet sends no email (the scheduler mails on assignment)", async (t) => {
  t.mock.method(Booking, "findOneAndUpdate", () => selectChain({ _id: "b1", user: "u1", status: "Assigned", professional: null }));
  const dispatch = t.mock.method(notificationClient, "dispatch", async () => ({ notification: {} }));
  const res = makeRes();
  await internal.settleBookingPayment({ params: { id: "64b7f0c2a1b2c3d4e5f60718" }, body: { outcome: "paid" } }, res);
  await settle();
  assert.equal(res.statusCode, 200);
  assert.equal(dispatch.mock.callCount(), 0);
});

test("admin marking a booking Completed emails the customer", async (t) => {
  const existing = { _id: "b1", status: "Confirmed", professional: "p1", paymentMethod: "Cash on Delivery", paymentStatus: "Pending" };
  t.mock.method(Booking, "findById", async () => existing);
  const updated = { ...existing, status: "Completed", user: { _id: "u1", email: "c@x.com" }, populate() { return this; } };
  t.mock.method(Booking, "findOneAndUpdate", () => ({ populate: () => ({ populate: async () => updated }) }));
  t.mock.method(SlotReservation, "deleteMany", async () => ({}));
  t.mock.method(Professional, "updateOne", async () => ({}));
  const dispatch = t.mock.method(notificationClient, "dispatch", async () => ({ notification: {} }));

  const res = makeRes();
  await admin.updateBookingStatus({ params: { id: "b1" }, body: { status: "Completed" } }, res);
  await settle();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(types(dispatch), ["BOOKING_COMPLETED"]);
  assert.equal(dispatch.mock.calls[0].arguments[0].userId, "u1");
});
