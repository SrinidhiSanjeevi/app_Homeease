const test = require("node:test");
const assert = require("node:assert/strict");
const Booking = require("../models/Booking");
const { countScheduleBuckets, OPEN_STATUSES } = require("../services/booking/bookingBuckets");

test("pending = open bookings dated today or earlier; upcoming = open bookings after today", async (t) => {
  const queries = [];
  t.mock.method(Booking, "countDocuments", async (filter) => {
    queries.push(filter);
    return queries.length === 1 ? 2 : 5;
  });

  // 2026-10-06 12:00 IST -> local "today" is 2026-10-06
  const result = await countScheduleBuckets(new Date("2026-10-06T06:30:00Z"));

  assert.deepEqual(result, { pending: 2, upcoming: 5 });
  assert.deepEqual(queries[0].status.$in, [...OPEN_STATUSES]);
  assert.equal(queries[0].date.$lte.toISOString(), "2026-10-06T00:00:00.000Z");
  assert.equal(queries[1].date.$gt.toISOString(), "2026-10-06T00:00:00.000Z");
});

test("completed and cancelled bookings are never counted as open work", () => {
  assert.ok(!OPEN_STATUSES.includes("Completed"));
  assert.ok(!OPEN_STATUSES.includes("Cancelled"));
});
