// Proves paymentClient and notificationClient call the right URLs and turn HTTP/network failures into AppErrors (fetch is stubbed, no network).
const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.LOG_LEVEL = "silent";

const paymentClient = require("../services/payment/paymentClient");
const notificationClient = require("../services/notification/notificationClient");
const { processNotificationSimulation, processCompletionEmailNotification, processProfessionalAssignedNotification } = require("../services/simulationService");

function stubFetch(t, impl) {
  return t.mock.method(globalThis, "fetch", impl);
}
const reply = (status, data) => async () => ({ ok: status < 400, status, json: async () => data });

test("payment: createOrder posts to the payment service and returns its JSON", async (t) => {
  const fetchStub = stubFetch(t, reply(200, { orderId: "o1" }));
  const result = await paymentClient.createOrder({ bookingId: "b1", userId: "u1" });
  assert.equal(result.orderId, "o1");
  const [url, options] = fetchStub.mock.calls[0].arguments;
  assert.ok(url.endsWith("/api/payments/order"));
  assert.equal(options.method, "POST");
  assert.deepEqual(JSON.parse(options.body), { bookingId: "b1", userId: "u1" });
});

test("payment: an error response becomes an AppError with the same status", async (t) => {
  stubFetch(t, reply(402, { message: "declined" }));
  await assert.rejects(paymentClient.verifyPayment({ bookingId: "b1" }), (e) => e.statusCode === 402 && e.message === "declined");
});

test("payment: network failure and timeout become 503", async (t) => {
  const fetchStub = stubFetch(t, async () => { throw new Error("ECONNREFUSED"); });
  await assert.rejects(paymentClient.getPaymentStatus({ bookingId: "b1", transactionId: "t1" }), (e) => e.statusCode === 503 && /unavailable/.test(e.message));
  assert.ok(fetchStub.mock.calls[0].arguments[0].includes("bookingId=b1&transactionId=t1"));

  fetchStub.mock.mockImplementation(async () => { const e = new Error("slow"); e.name = "TimeoutError"; throw e; });
  await assert.rejects(paymentClient.createCodPayment({ bookingId: "b1" }), /timed out/);
});

test("payment: refundPayment returns null instead of throwing", async (t) => {
  stubFetch(t, reply(500, {}));
  assert.equal(await paymentClient.refundPayment("b1", 10), null);
  stubFetch(t, reply(200, { refund: { id: "r1" } }));
  assert.deepEqual(await paymentClient.refundPayment("b1", 10), { id: "r1" });
});

test("payment: other endpoints use the expected paths", async (t) => {
  const fetchStub = stubFetch(t, reply(200, { ok: true }));
  await paymentClient.settleCodPayment("b1");
  await paymentClient.getPaymentsForBooking("b1");
  const urls = fetchStub.mock.calls.map((c) => c.arguments[0]);
  assert.ok(urls[0].endsWith("/api/internal/payments/cod/b1/settle"));
  assert.ok(urls[1].endsWith("/api/internal/payments/booking/b1"));
});

test("payment: processWebhook forwards the payload and reports status without throwing", async (t) => {
  stubFetch(t, reply(200, { success: true }));
  const ok = await paymentClient.processWebhook({ rawPayload: { a: 1 }, signature: "sig" });
  assert.deepEqual(ok, { statusCode: 200, success: true });
  stubFetch(t, async () => { throw new Error("down"); });
  const down = await paymentClient.processWebhook({ rawPayload: "{}" });
  assert.equal(down.statusCode, 503);
  assert.equal(down.success, false);
});

test("notification: dispatch and lookup call the notification service", async (t) => {
  const fetchStub = stubFetch(t, reply(200, { notification: { id: "n1" } }));
  await notificationClient.dispatch({ type: "BOOKING_CONFIRMED", bookingId: "b1", userId: "u1" });
  await notificationClient.getNotificationsForBooking("b1");
  const urls = fetchStub.mock.calls.map((c) => c.arguments[0]);
  assert.ok(urls[0].endsWith("/api/internal/notifications/dispatch"));
  assert.ok(urls[1].endsWith("/api/internal/notifications/booking/b1"));
});

test("notification: errors map to AppError", async (t) => {
  stubFetch(t, reply(400, {}));
  await assert.rejects(notificationClient.dispatch({}), (e) => e.statusCode === 400 && /Notification service error/.test(e.message));
  stubFetch(t, async () => { throw new Error("down"); });
  await assert.rejects(notificationClient.dispatch({}), (e) => e.statusCode === 503);
  stubFetch(t, async () => { const e = new Error("slow"); e.name = "AbortError"; throw e; });
  await assert.rejects(notificationClient.dispatch({}), /timed out/);
});

test("simulationService wraps dispatch results", async (t) => {
  const dispatch = t.mock.method(notificationClient, "dispatch", async () => ({ notification: { id: "n1" } }));
  assert.deepEqual(await processNotificationSimulation({ _id: "b1" }, "u1"), [{ id: "n1" }]);
  assert.deepEqual(await processCompletionEmailNotification("b2", "u1"), { id: "n1" });
  assert.equal(dispatch.mock.calls[0].arguments[0].type, "BOOKING_CONFIRMED");
  assert.equal(dispatch.mock.calls[1].arguments[0].bookingId, "b2");

  dispatch.mock.mockImplementation(async () => ({}));
  assert.deepEqual(await processNotificationSimulation("b1", "u1"), []);
  assert.equal(await processCompletionEmailNotification("b1", "u1"), null);
});

test("simulationService notifies the provider with their email, or none so the service can fall back", async (t) => {
  const dispatch = t.mock.method(notificationClient, "dispatch", async () => ({ notification: { id: "n9" } }));
  assert.deepEqual(await processProfessionalAssignedNotification({ _id: "b1" }, "u1", { name: "Ravi", email: "ravi@x.com" }), { id: "n9" });
  assert.deepEqual(dispatch.mock.calls[0].arguments[0], {
    type: "PROFESSIONAL_NEW_JOB", bookingId: "b1", userId: "u1", recipientEmail: "ravi@x.com", recipientName: "Ravi"
  });
  await processProfessionalAssignedNotification("b2", "u1", { name: "NoMail" });
  assert.equal(dispatch.mock.calls[1].arguments[0].recipientEmail, undefined);
  await processProfessionalAssignedNotification("b3", "u1", null);
  assert.equal(dispatch.mock.calls[2].arguments[0].recipientName, undefined);
  dispatch.mock.mockImplementation(async () => ({}));
  assert.equal(await processProfessionalAssignedNotification("b4", "u1", { name: "R" }), null);
});
