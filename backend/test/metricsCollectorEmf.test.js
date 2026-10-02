const test = require("node:test");
const assert = require("node:assert");

test("emitCloudWatchMetrics writes valid Embedded Metric Format lines", () => {
  const { emitCloudWatchMetrics } = require("../services/metricsCollector");
  const lines = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    lines.push(String(chunk));
    return true;
  };
  try {
    emitCloudWatchMetrics({ totals: { TotalBookings: 60, PendingBookings: 1 }, byStatus: [0, 1, 1, 49, 9] });
  } finally {
    process.stdout.write = original;
  }

  const events = lines.map((l) => JSON.parse(l));
  assert.strictEqual(events.length, 6); // 1 totals + 5 statuses
  assert.strictEqual(events[0].TotalBookings, 60);
  assert.strictEqual(events[0]._aws.CloudWatchMetrics[0].Namespace, "HomeEase");
  assert.deepStrictEqual(events[0]._aws.CloudWatchMetrics[0].Dimensions, [["Scope"]]);
  const completed = events.find((e) => e.Status === "Completed");
  assert.strictEqual(completed.Bookings, 49);
  assert.deepStrictEqual(completed._aws.CloudWatchMetrics[0].Dimensions, [["Scope", "Status"]]);
});
