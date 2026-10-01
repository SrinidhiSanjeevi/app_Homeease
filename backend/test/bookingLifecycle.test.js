// Proves cancellation fees/refunds are calculated correctly and cancelBooking/retryPendingRefunds update bookings via stubbed models.
const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.LOG_LEVEL = "silent";

const Booking = require("../models/Booking");
const SlotReservation = require("../models/SlotReservation");
const paymentClient = require("../services/payment/paymentClient");
const lifecycle = require("../services/booking/bookingLifecycle");

const START = new Date("2030-01-11T03:30:00Z"); // 09:00 IST on 2030-01-11
const booking = (extra = {}) => ({
  _id: "b1", status: "Confirmed", paymentStatus: "Paid", totalPrice: 1000,
  date: new Date("2030-01-11T00:00:00Z"), timeSlot: "09:00 AM - 11:00 AM", ...extra
});

// A fake query: await-able and supports .limit()
const query = (rows) => ({ limit: () => Promise.resolve(rows) });

test("quote: finished bookings cannot be cancelled", () => {
  const quote = lifecycle.customerCancellationQuote(booking({ status: "Completed" }), START);
  assert.equal(quote.allowed, false);
  assert.match(quote.reason, /already completed/);
});

test("quote: cannot cancel once the visit has started", () => {
  const quote = lifecycle.customerCancellationQuote(booking(), new Date(START.getTime() + 1000));
  assert.equal(quote.allowed, false);
});

test("quote: unpaid booking cancels with no fee or refund", () => {
  const quote = lifecycle.customerCancellationQuote(booking({ paymentStatus: "Pending" }), new Date("2030-01-01T00:00:00Z"));
  assert.deepEqual(quote, { allowed: true, fee: 0, refund: 0, reason: null });
});

test("quote: paid booking is free to cancel early, charged a 20% fee when late", () => {
  const early = lifecycle.customerCancellationQuote(booking(), new Date("2030-01-01T00:00:00Z"));
  assert.deepEqual([early.fee, early.refund], [0, 1000]);
  const late = lifecycle.customerCancellationQuote(booking(), new Date(START.getTime() - 30 * 60 * 1000));
  assert.deepEqual([late.fee, late.refund], [200, 800]);
});

test("cancelBooking returns null when the booking changed meanwhile", async (t) => {
  t.mock.method(Booking, "findOneAndUpdate", async () => null);
  assert.equal(await lifecycle.cancelBooking(booking(), { by: "user" }), null);
});

test("cancelBooking refunds a paid booking and marks it Refunded", async (t) => {
  let saved = 0;
  const updated = { _id: "b1", paymentStatus: "Refund Pending", save: async () => saved++ };
  let update;
  t.mock.method(Booking, "findOneAndUpdate", async (_filter, change) => { update = change; return updated; });
  const release = t.mock.method(SlotReservation, "deleteMany", async () => ({}));
  const refund = t.mock.method(paymentClient, "refundPayment", async () => ({ id: "rf" }));

  const result = await lifecycle.cancelBooking(booking(), { by: "user", reason: "changed mind" });
  assert.equal(result.paymentStatus, "Refunded");
  assert.equal(update.$set.status, "Cancelled");
  assert.equal(update.$set.refundAmount, 1000);
  assert.equal(release.mock.callCount(), 1);
  assert.deepEqual(refund.mock.calls[0].arguments, ["b1", 1000]);
  assert.equal(saved, 1);
});

test("cancelBooking keeps Refund Pending when the refund fails, and a fee gives Partially Refunded", async (t) => {
  t.mock.method(SlotReservation, "deleteMany", async () => ({}));
  t.mock.method(Booking, "findOneAndUpdate", async () => ({ _id: "b1", save: async () => {} }));
  const refund = t.mock.method(paymentClient, "refundPayment", async () => null);
  const failed = await lifecycle.cancelBooking(booking(), { by: "user" });
  assert.equal(failed.paymentStatus, "Refund Pending");
  assert.equal(failed.refundAttempts, 1);

  refund.mock.mockImplementation(async () => ({ id: "rf" }));
  const partial = await lifecycle.cancelBooking(booking(), { by: "user", fee: 200, refundAmount: 800 });
  assert.equal(partial.paymentStatus, "Partially Refunded");
});

test("cancelBooking of an unpaid booking does not refund and marks it Expired when cancelled by the system", async (t) => {
  let update;
  t.mock.method(Booking, "findOneAndUpdate", async (_f, change) => { update = change; return { _id: "b1" }; });
  t.mock.method(SlotReservation, "deleteMany", async () => ({}));
  const refund = t.mock.method(paymentClient, "refundPayment", async () => null);
  await lifecycle.cancelBooking(booking({ paymentStatus: "Pending" }), { by: "system" });
  assert.equal(update.$set.paymentStatus, "Expired");
  assert.equal(refund.mock.callCount(), 0);
});

test("retryPendingRefunds marks successful refunds and counts failed attempts", async (t) => {
  const ok = { _id: "1", totalPrice: 500, refundAttempts: 2, cancellationFee: 0, save: async () => {} };
  const partial = { _id: "2", refundAmount: 400, refundAttempts: 0, cancellationFee: 100, save: async () => {} };
  const failing = { _id: "3", totalPrice: 500, refundAttempts: 9, save: async () => {} };
  t.mock.method(Booking, "find", () => query([ok, partial, failing]));
  const refund = t.mock.method(paymentClient, "refundPayment", async (id) => (id === "3" ? null : { id: "rf" }));

  await lifecycle.retryPendingRefunds();
  assert.equal(ok.paymentStatus, "Refunded");
  assert.equal(partial.paymentStatus, "Partially Refunded");
  assert.equal(failing.refundAttempts, 10);
  assert.equal(failing.paymentStatus, undefined);
  assert.equal(refund.mock.calls[1].arguments[1], 400);
});
