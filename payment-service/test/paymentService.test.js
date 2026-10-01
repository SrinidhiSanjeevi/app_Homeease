// Proves payment rules: ownership checks, signature verification, already-paid handling, amount handling, refunds and webhooks.
process.env.LOG_LEVEL = "silent";
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Payment = require("../models/Payment");
const razorpay = require("../config/razorpay");
const bookingClient = require("../services/bookingServiceClient");
const paymentService = require("../services/paymentService");

const BOOKING_ID = "64b7f0c2a1b2c3d4e5f60718";
const USER_ID = "64b7f0c2a1b2c3d4e5f60719";
const sign = (payload, secret) => crypto.createHmac("sha256", secret).update(payload).digest("hex");

// A fake mongoose query: awaitable, and also supports .sort().
const query = (value) => ({ sort: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
const booking = (overrides = {}) => ({
  _id: BOOKING_ID, user: USER_ID, paymentMethod: "Razorpay", paymentStatus: "Pending", status: "Created", totalPrice: 499.5, ...overrides
});
const orderRecord = { _id: "o1", booking: BOOKING_ID, amount: 499.5, razorpayOrderId: "order_1" };

function stubBooking(t, value, settleResult = { settled: true, booking: { status: "Confirmed" } }) {
  t.mock.method(bookingClient, "getBooking", async () => {
    if (value === null) throw Object.assign(new Error("none"), { isOperational: true, statusCode: 404 });
    return { booking: value };
  });
  return t.mock.method(bookingClient, "settlePayment", async () => settleResult);
}

// ─── createOrder ─────────────────────────────────────────────────────────────
test("createOrder rejects invalid ids", async () => {
  await assert.rejects(paymentService.createOrder({ bookingId: "x", userId: USER_ID }), { statusCode: 400 });
  await assert.rejects(paymentService.createOrder({ bookingId: BOOKING_ID, userId: undefined }), { statusCode: 400 });
});

test("createOrder returns 404 for a missing booking or another user's booking", async (t) => {
  stubBooking(t, null);
  await assert.rejects(paymentService.createOrder({ bookingId: BOOKING_ID, userId: USER_ID }), { statusCode: 404 });
  stubBooking(t, booking({ user: "64b7f0c2a1b2c3d4e5f60700" }));
  await assert.rejects(paymentService.createOrder({ bookingId: BOOKING_ID, userId: USER_ID }), { statusCode: 404 });
});

test("createOrder refuses cash, already-paid and expired bookings", async (t) => {
  const cases = [
    [{ paymentMethod: "Cash on Delivery" }, /paid in cash/],
    [{ paymentStatus: "Paid" }, /already paid/],
    [{ status: "Cancelled" }, /no longer be paid/]
  ];
  for (const [overrides, message] of cases) {
    stubBooking(t, booking(overrides));
    await assert.rejects(paymentService.createOrder({ bookingId: BOOKING_ID, userId: USER_ID }), { statusCode: 400, message: message });
  }
});

test("createOrder reuses an open order when the amount is unchanged", async (t) => {
  stubBooking(t, booking());
  t.mock.method(Payment, "findOne", () => query({ razorpayOrderId: "order_old", amount: 499.5 }));
  const create = t.mock.method(razorpay.orders, "create", async () => assert.fail("must not create a new order"));
  const result = await paymentService.createOrder({ bookingId: BOOKING_ID, userId: USER_ID });
  assert.deepEqual(result, { orderId: "order_old", amount: 49950, currency: "INR", keyId: "rzp_test_key" });
  assert.equal(create.mock.callCount(), 0);
});

test("createOrder creates a Razorpay order in paise and stores a Pending payment", async (t) => {
  stubBooking(t, booking());
  t.mock.method(Payment, "findOne", () => query(null));
  const create = t.mock.method(razorpay.orders, "create", async () => ({ id: "order_new", amount: 49950, currency: "INR" }));
  const saved = t.mock.method(Payment, "create", async () => ({}));
  const result = await paymentService.createOrder({ bookingId: BOOKING_ID, userId: USER_ID });
  assert.equal(create.mock.calls[0].arguments[0].amount, 49950);
  assert.equal(result.orderId, "order_new");
  assert.deepEqual([saved.mock.calls[0].arguments[0].status, saved.mock.calls[0].arguments[0].transactionId], ["Pending", "ORDER-order_new"]);
});

// ─── verifyPayment ───────────────────────────────────────────────────────────
const verifyArgs = (overrides = {}) => {
  const signature = sign("order_1|pay_1", process.env.RAZORPAY_KEY_SECRET);
  return { bookingId: BOOKING_ID, userId: USER_ID, razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", razorpaySignature: signature, ...overrides };
};

test("verifyPayment validates its input and ownership", async (t) => {
  await assert.rejects(paymentService.verifyPayment(verifyArgs({ bookingId: "bad" })), { statusCode: 400 });
  await assert.rejects(paymentService.verifyPayment(verifyArgs({ razorpayPaymentId: "  " })), { statusCode: 400 });
  stubBooking(t, null);
  await assert.rejects(paymentService.verifyPayment(verifyArgs()), { statusCode: 404 });
  stubBooking(t, booking());
  await assert.rejects(paymentService.verifyPayment(verifyArgs({ userId: "other" })), { statusCode: 403 });
});

test("verifyPayment rejects an order that does not belong to the booking", async (t) => {
  stubBooking(t, booking());
  t.mock.method(Payment, "findOne", () => query(null));
  await assert.rejects(paymentService.verifyPayment(verifyArgs()), { statusCode: 400, message: /does not belong/ });
});

test("verifyPayment records a failure when the signature is wrong", async (t) => {
  const settle = stubBooking(t, booking());
  t.mock.method(Payment, "findOne", () => query(orderRecord));
  const create = t.mock.method(Payment, "create", async () => ({}));
  for (const razorpaySignature of ["deadbeef", sign("order_1|pay_1", "wrong-secret")]) {
    const result = await paymentService.verifyPayment(verifyArgs({ razorpaySignature }));
    assert.equal(result.isValid, false);
  }
  assert.equal(create.mock.calls[0].arguments[0].status, "Failure");
  assert.equal(settle.mock.callCount(), 0);
});

test("verifyPayment settles the booking when the signature is correct", async (t) => {
  const settle = stubBooking(t, booking());
  t.mock.method(Payment, "findOne", (filter) => query(filter.transactionId ? null : orderRecord));
  const update = t.mock.method(Payment, "findOneAndUpdate", async () => ({ status: "Success" }));
  const result = await paymentService.verifyPayment(verifyArgs());
  assert.equal(result.isValid, true);
  assert.equal(settle.mock.calls[0].arguments[1].paymentId, "pay_1");
  const $set = update.mock.calls[0].arguments[1].$set;
  assert.deepEqual([$set.status, $set.amount, $set.transactionId], ["Success", 499.5, "pay_1"]);
});

test("verifyPayment does not charge twice when the payment is already recorded", async (t) => {
  const settle = stubBooking(t, booking());
  t.mock.method(Payment, "findOne", (filter) => query(filter.transactionId ? { status: "Success" } : orderRecord));
  const result = await paymentService.verifyPayment(verifyArgs());
  assert.equal(result.isValid, true);
  assert.equal(settle.mock.callCount(), 0);
});

test("verifyPayment reports a refund when the payment was already refunded", async (t) => {
  stubBooking(t, booking());
  t.mock.method(Payment, "findOne", (filter) => query(filter.transactionId ? { status: "Refunded" } : orderRecord));
  const result = await paymentService.verifyPayment(verifyArgs());
  assert.equal(result.isValid, false);
  assert.match(result.message, /refunded/);
});

test("verifyPayment refunds automatically when the booking can no longer take the payment", async (t) => {
  stubBooking(t, booking(), { settled: false, booking: null });
  const saved = { amount: 499.5, paymentMethod: "Razorpay", transactionId: "pay_1", save: async function () { return this; } };
  t.mock.method(Payment, "findOne", (filter) => query(filter.transactionId ? null : orderRecord));
  t.mock.method(Payment, "findOneAndUpdate", async () => saved);
  const refund = t.mock.method(razorpay.payments, "refund", async () => ({ id: "rfnd_1" }));
  const result = await paymentService.verifyPayment(verifyArgs());
  assert.equal(result.isValid, false);
  assert.match(result.message, /refunded/);
  assert.equal(refund.mock.calls[0].arguments[1].amount, 49950);
  assert.equal(saved.status, "Refunded");
});

test("verifyPayment explains when the automatic refund itself failed", async (t) => {
  stubBooking(t, booking(), { settled: false, booking: null });
  t.mock.method(Payment, "findOne", (filter) => query(filter.transactionId ? null : orderRecord));
  t.mock.method(Payment, "findOneAndUpdate", async () => ({ amount: 499.5, paymentMethod: "Razorpay", transactionId: "pay_1" }));
  t.mock.method(razorpay.payments, "refund", async () => { throw new Error("gateway down"); });
  const result = await paymentService.verifyPayment(verifyArgs());
  assert.match(result.message, /refund is being processed/);
});

// ─── refundPayment / getPaymentStatus ────────────────────────────────────────
test("refundPayment returns null for invalid ids and ineligible payments", async (t) => {
  assert.equal(await paymentService.refundPayment("nope"), null);
  for (const payment of [null, { paymentMethod: "Cash on Delivery", transactionId: "x" }, { paymentMethod: "Razorpay", transactionId: "ORDER-1" }, { paymentMethod: "Razorpay" }]) {
    t.mock.method(Payment, "findOne", () => query(payment));
    assert.equal(await paymentService.refundPayment(BOOKING_ID), null);
  }
});

test("refundPayment marks full and partial refunds", async (t) => {
  const refund = t.mock.method(razorpay.payments, "refund", async () => ({ id: "rfnd_1" }));
  const make = () => ({ amount: 100, paymentMethod: "Razorpay", transactionId: "pay_1", save: async () => {} });
  const full = make();
  t.mock.method(Payment, "findOne", () => query(full));
  await paymentService.refundPayment(BOOKING_ID);
  assert.deepEqual([full.status, full.refundId], ["Refunded", "rfnd_1"]);

  const partial = make();
  Payment.findOne.mock.restore();
  t.mock.method(Payment, "findOne", () => query(partial));
  await paymentService.refundPayment(BOOKING_ID, 40);
  assert.equal(partial.status, "Partially Refunded");
  assert.equal(refund.mock.calls[1].arguments[1].amount, 4000);
});

test("getPaymentStatus looks up by transactionId or bookingId and validates input", async (t) => {
  const findOne = t.mock.method(Payment, "findOne", () => query({ status: "Success" }));
  await paymentService.getPaymentStatus({ transactionId: " pay_1 " });
  assert.deepEqual(findOne.mock.calls[0].arguments[0], { transactionId: { $eq: "pay_1" } });
  await paymentService.getPaymentStatus({ bookingId: BOOKING_ID });
  assert.ok(findOne.mock.calls[1].arguments[0].booking);
  await assert.rejects(paymentService.getPaymentStatus({ bookingId: "bad" }), { statusCode: 400 });
  findOne.mock.restore();
  t.mock.method(Payment, "findOne", () => query(null));
  await assert.rejects(paymentService.getPaymentStatus({ transactionId: "x" }), { statusCode: 404 });
});

// ─── processWebhook ──────────────────────────────────────────────────────────
const SECRET = "whsec_test";
const event = (name, entity, extra = {}) => JSON.stringify({ event: name, payload: { payment: entity ? { entity } : undefined }, ...extra });
const webhook = (rawPayload, overrides = {}) =>
  paymentService.processWebhook({ rawPayload, signature: sign(rawPayload, SECRET), webhookSecret: SECRET, ...overrides });
const capturedEntity = { id: "pay_1", order_id: "order_1", amount: 49950, notes: { bookingId: BOOKING_ID } };

test("webhook rejects missing signature, missing secret and bad signatures", async () => {
  assert.equal((await paymentService.processWebhook({ rawPayload: "{}", webhookSecret: SECRET })).statusCode, 400);
  assert.equal((await paymentService.processWebhook({ rawPayload: "{}", signature: "x" })).statusCode, 500);
  assert.equal((await webhook("{}", { signature: sign("{}", "other") })).statusCode, 400);
  assert.equal((await webhook("{}", { signature: 12345 })).statusCode, 400);
});

test("webhook ignores events it does not handle and payloads without a payment", async () => {
  assert.equal((await webhook(event("refund.created", null))).status, "ignored");
  assert.equal((await webhook(event("payment.captured", null))).statusCode, 400);
  assert.equal((await webhook(event("payment.captured", { id: "  " }))).statusCode, 400);
});

test("webhook returns 404 when the order or booking cannot be found or does not match", async (t) => {
  t.mock.method(Payment, "findOne", () => query(null));
  assert.equal((await webhook(event("payment.captured", capturedEntity))).statusCode, 404);
  assert.equal((await webhook(event("payment.captured", { id: "pay_1" }))).statusCode, 404);
  Payment.findOne.mock.restore();
  t.mock.method(Payment, "findOne", () => query({ ...orderRecord, booking: { toString: () => "64b7f0c2a1b2c3d4e5f60799" } }));
  assert.equal((await webhook(event("payment.captured", capturedEntity))).statusCode, 404);
});

test("webhook payment.failed stores a Failure record", async (t) => {
  stubBooking(t, booking());
  t.mock.method(Payment, "findOne", () => query({ ...orderRecord, booking: { toString: () => BOOKING_ID } }));
  const update = t.mock.method(Payment, "findOneAndUpdate", async () => ({}));
  const result = await webhook(event("payment.failed", { ...capturedEntity, error_description: "Card declined" }));
  assert.equal(result.message, "Payment failure recorded");
  const $set = update.mock.calls[0].arguments[1].$set;
  assert.deepEqual([$set.status, $set.failureReason], ["Failure", "Card declined"]);
});

test("webhook payment.captured settles the booking and uses the amount the gateway reports", async (t) => {
  const settle = stubBooking(t, booking());
  t.mock.method(Payment, "findOne", (filter) =>
    query(filter.transactionId ? null : { ...orderRecord, booking: { toString: () => BOOKING_ID } }));
  const update = t.mock.method(Payment, "findOneAndUpdate", async () => ({ status: "Success" }));
  // Gateway says 400.00 although the order was for 499.50: mismatch is logged, paid amount is stored.
  const result = await webhook(event("payment.captured", { ...capturedEntity, amount: 40000 }), {});
  assert.equal(result.message, "Payment paid");
  assert.equal(settle.mock.callCount(), 1);
  assert.equal(update.mock.calls[0].arguments[1].$set.amount, 400);
  assert.equal(update.mock.calls[0].arguments[1].$set.razorpayOrderId, "order_1");
});

test("webhook payment.captured is a no-op when the payment is already recorded", async (t) => {
  const settle = stubBooking(t, booking());
  t.mock.method(Payment, "findOne", (filter) =>
    query(filter.transactionId ? { status: "Success" } : { ...orderRecord, booking: { toString: () => BOOKING_ID } }));
  const result = await webhook(event("order.paid", capturedEntity));
  assert.equal(result.message, "Payment paid");
  assert.equal(settle.mock.callCount(), 0);
});
