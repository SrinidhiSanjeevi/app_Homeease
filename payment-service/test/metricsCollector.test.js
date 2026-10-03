// Proves the collector turns MongoDB aggregates into gauges (zero-filling missing statuses) and never throws.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const Payment = require("../models/Payment");
const metrics = require("../metrics");
const { collectDbMetrics, STATUSES } = require("../services/metricsCollector");

const gaugeValue = async (gauge, status) => {
  const { values } = await gauge.get();
  const hit = values.find((v) => v.labels.status === status);
  return hit ? hit.value : undefined;
};

test("collector publishes counts, amounts and last-seen time per status", async (t) => {
  const last = new Date("2026-10-03T10:00:00Z");
  t.mock.method(Payment, "aggregate", async () => [
    { _id: "Success", count: 7, amount: 4200, last },
    { _id: "Failure", count: 2, amount: 900, last }
  ]);
  await collectDbMetrics();
  assert.equal(await gaugeValue(metrics.paymentRecordsByStatus, "Success"), 7);
  assert.equal(await gaugeValue(metrics.paymentAmountByStatus, "Success"), 4200);
  assert.equal(await gaugeValue(metrics.paymentRecordsByStatus, "Failure"), 2);
  assert.equal(await gaugeValue(metrics.paymentLastRecordTimestamp, "Success"), Math.floor(last.getTime() / 1000));
});

test("statuses with no records are zero, not missing", async (t) => {
  t.mock.method(Payment, "aggregate", async () => []);
  await collectDbMetrics();
  for (const status of STATUSES) {
    assert.equal(await gaugeValue(metrics.paymentRecordsByStatus, status), 0);
  }
});

test("a database error is swallowed and keeps the previous values", async (t) => {
  t.mock.method(Payment, "aggregate", async () => [{ _id: "Success", count: 5, amount: 1, last: new Date() }]);
  await collectDbMetrics();
  t.mock.method(Payment, "aggregate", async () => {
    throw new Error("db down");
  });
  await assert.doesNotReject(collectDbMetrics());
  assert.equal(await gaugeValue(metrics.paymentRecordsByStatus, "Success"), 5);
});
