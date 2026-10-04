const test = require("node:test");
const assert = require("node:assert");

test("emitCloudWatchMetrics writes one valid EMF line per payment status", () => {
  const { emitCloudWatchMetrics, STATUSES } = require("../services/metricsCollector");
  const rows = new Map([
    ["Success", { count: 12, amount: 8850 }],
    ["Failure", { count: 2, amount: 1200 }]
  ]);
  const lines = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    lines.push(String(chunk));
    return true;
  };
  try {
    emitCloudWatchMetrics(rows);
  } finally {
    process.stdout.write = original;
  }

  const events = lines.map((l) => JSON.parse(l));
  assert.strictEqual(events.length, STATUSES.length);
  const success = events.find((e) => e.Status === "Success");
  assert.strictEqual(success.PaymentRecords, 12);
  assert.strictEqual(success.PaymentAmount, 8850);
  assert.strictEqual(success._aws.CloudWatchMetrics[0].Namespace, "HomeEase");
  assert.deepStrictEqual(success._aws.CloudWatchMetrics[0].Dimensions, [["Scope", "Status"]]);
  const refunded = events.find((e) => e.Status === "Refunded"); // no rows -> zeros, so the graph never has gaps
  assert.strictEqual(refunded.PaymentRecords, 0);
});
