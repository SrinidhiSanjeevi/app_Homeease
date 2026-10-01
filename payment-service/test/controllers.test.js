// Proves the payment and internal controllers validate input and turn service results and errors into HTTP responses.
process.env.LOG_LEVEL = "silent";
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
const test = require("node:test");
const assert = require("node:assert/strict");
const AppError = require("../utils/AppError");
const Payment = require("../models/Payment");
const paymentService = require("../services/paymentService");
const paymentController = require("../controllers/paymentController");
const internalController = require("../controllers/internalController");

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

test("createOrder requires bookingId and userId", async () => {
  assert.equal((await call(paymentController.createOrder, { body: {} })).statusCode, 400);
});

test("createOrder returns the order, service errors with their status, and 500 for unexpected errors", async (t) => {
  const stub = t.mock.method(paymentService, "createOrder", async () => ({ orderId: "o1" }));
  const ok = await call(paymentController.createOrder, { body: { bookingId: ID, userId: ID } });
  assert.deepEqual([ok.statusCode, ok.body.orderId], [200, "o1"]);
  stub.mock.restore();
  t.mock.method(paymentService, "createOrder", async () => { throw new AppError("Booking not found", 404); });
  assert.equal((await call(paymentController.createOrder, { body: { bookingId: ID, userId: ID } })).statusCode, 404);
  paymentService.createOrder.mock.restore();
  t.mock.method(paymentService, "createOrder", async () => { throw new Error("db"); });
  assert.equal((await call(paymentController.createOrder, { body: { bookingId: ID, userId: ID } })).statusCode, 500);
});

test("verifyPayment accepts both camelCase and snake_case fields", async (t) => {
  const verify = t.mock.method(paymentService, "verifyPayment", async () => ({ isValid: true, booking: {}, payment: {} }));
  const res = await call(paymentController.verifyPayment, {
    body: { bookingId: ID, userId: ID, razorpay_order_id: "o", razorpay_payment_id: "p", razorpay_signature: "s" }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(verify.mock.calls[0].arguments[0].razorpayOrderId, "o");
  assert.equal((await call(paymentController.verifyPayment, { body: { bookingId: ID } })).statusCode, 400);
});

test("verifyPayment answers 400 for an invalid payment and maps errors", async (t) => {
  const stub = t.mock.method(paymentService, "verifyPayment", async () => ({ isValid: false, message: "bad" }));
  const body = { bookingId: ID, userId: ID, razorpayOrderId: "o", razorpayPaymentId: "p", razorpaySignature: "s" };
  const invalid = await call(paymentController.verifyPayment, { body });
  assert.deepEqual([invalid.statusCode, invalid.body.success], [400, false]);
  stub.mock.restore();
  t.mock.method(paymentService, "verifyPayment", async () => { throw new AppError("nope", 403); });
  assert.equal((await call(paymentController.verifyPayment, { body })).statusCode, 403);
  paymentService.verifyPayment.mock.restore();
  t.mock.method(paymentService, "verifyPayment", async () => { throw new Error("x"); });
  assert.equal((await call(paymentController.verifyPayment, { body })).statusCode, 500);
});

test("refundPayment validates input and reports 404, 200 and 500", async (t) => {
  assert.equal((await call(paymentController.refundPayment, { body: {} })).statusCode, 400);
  const stub = t.mock.method(paymentService, "refundPayment", async () => null);
  assert.equal((await call(paymentController.refundPayment, { body: { bookingId: ID } })).statusCode, 404);
  stub.mock.restore();
  const ok = t.mock.method(paymentService, "refundPayment", async () => ({ id: "r1" }));
  assert.equal((await call(paymentController.refundPayment, { body: { bookingId: ID, amount: "25" } })).statusCode, 200);
  assert.equal(ok.mock.calls[0].arguments[1], 25);
  ok.mock.restore();
  t.mock.method(paymentService, "refundPayment", async () => { throw new Error("x"); });
  assert.equal((await call(paymentController.refundPayment, { body: { bookingId: ID } })).statusCode, 500);
});

test("getStatus returns the payment or maps errors", async (t) => {
  const stub = t.mock.method(paymentService, "getPaymentStatus", async () => ({ status: "Success" }));
  assert.equal((await call(paymentController.getStatus, { query: { bookingId: ID } })).body.payment.status, "Success");
  stub.mock.restore();
  t.mock.method(paymentService, "getPaymentStatus", async () => { throw new AppError("none", 404); });
  assert.equal((await call(paymentController.getStatus, { query: {} })).statusCode, 404);
  paymentService.getPaymentStatus.mock.restore();
  t.mock.method(paymentService, "getPaymentStatus", async () => { throw new Error("x"); });
  assert.equal((await call(paymentController.getStatus, { query: {} })).statusCode, 500);
});

test("handleWebhook passes the raw body and signature to the service", async (t) => {
  process.env.RAZORPAY_WEBHOOK_SECRET = "whsec";
  const stub = t.mock.method(paymentService, "processWebhook", async () => ({ statusCode: 202, status: "ok" }));
  const res = await call(paymentController.handleWebhook, { headers: { "x-razorpay-signature": "sig" }, rawBody: Buffer.from("{\"a\":1}"), body: {} });
  assert.deepEqual([res.statusCode, res.body], [202, { status: "ok" }]);
  const args = stub.mock.calls[0].arguments[0];
  assert.deepEqual([args.rawPayload, args.signature, args.webhookSecret], ["{\"a\":1}", "sig", "whsec"]);
  await call(paymentController.handleWebhook, { headers: {}, body: "text" });
  await call(paymentController.handleWebhook, { headers: {}, body: { a: 1 } });
  assert.equal(stub.mock.calls[1].arguments[0].rawPayload, "text");
  assert.equal(stub.mock.calls[2].arguments[0].rawPayload, "{\"a\":1}");
  stub.mock.restore();
  t.mock.method(paymentService, "processWebhook", async () => { throw new Error("x"); });
  assert.equal((await call(paymentController.handleWebhook, { headers: {}, body: {} })).statusCode, 500);
});

// ─── internal (service-to-service) controller ───────────────────────────────
test("createCodPayment validates the body and creates a Pending COD payment", async (t) => {
  for (const body of [undefined, {}, { bookingId: ID, userId: ID, amount: "10" }, { bookingId: ID, userId: ID, amount: -1 }, { bookingId: "x", userId: ID, amount: 1 }]) {
    assert.equal((await call(internalController.createCodPayment, { body })).statusCode, 400);
  }
  const create = t.mock.method(Payment, "create", async (doc) => doc);
  const res = await call(internalController.createCodPayment, { body: { bookingId: ID, userId: ID, amount: 0 } });
  assert.equal(res.statusCode, 201);
  assert.equal(create.mock.calls[0].arguments[0].transactionId, `COD-${ID}`);
  create.mock.restore();
  t.mock.method(Payment, "create", async () => { throw new Error("db"); });
  assert.equal((await call(internalController.createCodPayment, { body: { bookingId: ID, userId: ID, amount: 5 } })).statusCode, 500);
});

test("settleCodPayment only accepts Success and updates the COD payment", async (t) => {
  assert.equal((await call(internalController.settleCodPayment, { params: { bookingId: "x" }, body: {} })).statusCode, 400);
  assert.equal((await call(internalController.settleCodPayment, { params: { bookingId: ID } })).statusCode, 400);
  const update = t.mock.method(Payment, "findOneAndUpdate", async () => null);
  const res = await call(internalController.settleCodPayment, { params: { bookingId: ID }, body: { status: "Success" } });
  assert.deepEqual([res.statusCode, res.body.payment], [200, null]);
  assert.deepEqual(update.mock.calls[0].arguments[0].booking, { $eq: ID });
  update.mock.restore();
  t.mock.method(Payment, "findOneAndUpdate", async () => { throw new Error("db"); });
  assert.equal((await call(internalController.settleCodPayment, { params: { bookingId: ID }, body: { status: "Success" } })).statusCode, 500);
});

test("getPaymentsForBooking lists payments, validates the id and handles errors", async (t) => {
  assert.equal((await call(internalController.getPaymentsForBooking, { params: { bookingId: "x" } })).statusCode, 400);
  const chain = (value) => ({ sort() { return this; }, lean: async () => value });
  t.mock.method(Payment, "find", () => chain([{ _id: 1 }]));
  assert.equal((await call(internalController.getPaymentsForBooking, { params: { bookingId: ID } })).body.payments.length, 1);
  Payment.find.mock.restore();
  t.mock.method(Payment, "find", () => { throw new Error("db"); });
  assert.equal((await call(internalController.getPaymentsForBooking, { params: { bookingId: ID } })).statusCode, 500);
});
