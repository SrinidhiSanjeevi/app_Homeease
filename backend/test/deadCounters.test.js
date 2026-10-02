const test = require("node:test");
const assert = require("node:assert");

const metrics = require("../metrics");
const notificationClient = require("../services/notification/notificationClient");
const { processNotificationSimulation, processCompletionEmailNotification } = require("../services/simulationService");

const valueOf = async (counter) => (await counter.get()).values.reduce((sum, v) => sum + v.value, 0);

test("notification dispatch success increments notificationSuccess only", async (t) => {
  t.mock.method(notificationClient, "dispatch", async () => ({ notification: { id: "n1" } }));
  const okBefore = await valueOf(metrics.notificationSuccess);
  const failBefore = await valueOf(metrics.notificationFailures);

  await processNotificationSimulation({ _id: "b1" }, "u1");
  await processCompletionEmailNotification({ _id: "b1" }, "u1");

  assert.strictEqual(await valueOf(metrics.notificationSuccess), okBefore + 2);
  assert.strictEqual(await valueOf(metrics.notificationFailures), failBefore);
});

test("notification dispatch failure increments notificationFailures and rethrows", async (t) => {
  t.mock.method(notificationClient, "dispatch", async () => {
    throw new Error("notification service down");
  });
  const okBefore = await valueOf(metrics.notificationSuccess);
  const failBefore = await valueOf(metrics.notificationFailures);

  await assert.rejects(() => processNotificationSimulation({ _id: "b1" }, "u1"), /notification service down/);

  assert.strictEqual(await valueOf(metrics.notificationSuccess), okBefore);
  assert.strictEqual(await valueOf(metrics.notificationFailures), failBefore + 1);
});

test("verifyPayment counts success and failure outcomes", async (t) => {
  const paymentClient = require("../services/payment/paymentClient");
  const { verifyPayment } = require("../controllers/paymentController");
  const res = () => {
    const r = { statusCode: null, body: null };
    r.status = (c) => ((r.statusCode = c), r);
    r.json = (b) => ((r.body = b), r);
    return r;
  };
  const req = { user: { _id: "u1" }, body: { bookingId: "b1" } };

  const okBefore = await valueOf(metrics.paymentSuccess);
  const failBefore = await valueOf(metrics.paymentFailures);

  t.mock.method(paymentClient, "verifyPayment", async () => ({ success: true }));
  await verifyPayment(req, res());
  t.mock.method(paymentClient, "verifyPayment", async () => ({ success: false, message: "bad signature" }));
  await verifyPayment(req, res());
  t.mock.method(paymentClient, "verifyPayment", async () => {
    throw new Error("payment service down");
  });
  await verifyPayment(req, res());

  assert.strictEqual(await valueOf(metrics.paymentSuccess), okBefore + 1);
  assert.strictEqual(await valueOf(metrics.paymentFailures), failBefore + 2);
});
