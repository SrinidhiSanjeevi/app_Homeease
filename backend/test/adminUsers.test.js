// Proves the admin user list hides deactivated users by default, and delete reports deactivate-vs-remove correctly.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/User");
const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const admin = require("../controllers/internal/adminBookingController");

const makeRes = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; }
});
const chain = (rows) => {
  const q = { select: () => q, sort: () => q, skip: () => q, limit: () => q, lean: async () => rows };
  return q;
};

test("getAllUsers hides deactivated users unless includeInactive=true", async (t) => {
  const filters = [];
  t.mock.method(User, "countDocuments", async (f) => { filters.push(f); return 1; });
  t.mock.method(User, "find", (f) => { filters.push(f); return chain([{ name: "A" }]); });

  const res = makeRes();
  await admin.getAllUsers({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(filters[0].active, { $ne: false });

  filters.length = 0;
  await admin.getAllUsers({ query: { includeInactive: "true" } }, makeRes());
  assert.equal(filters[0].active, undefined);
});

test("deleteUser deactivates a user who has bookings and removes one who has none", async (t) => {
  const user = { _id: "u1", role: "user" };
  t.mock.method(User, "findById", async () => user);
  const update = t.mock.method(User, "findByIdAndUpdate", async () => ({ ...user, active: false }));
  const remove = t.mock.method(User, "findByIdAndDelete", async () => user);
  t.mock.method(EmergencyRequest, "exists", async () => null);

  const exists = t.mock.method(Booking, "exists", async () => ({ _id: "b1" }));
  let res = makeRes();
  await admin.deleteUser({ params: { id: "u1" } }, res);
  assert.match(res.body.message, /kept anonymously/);
  assert.equal(update.mock.callCount(), 1);
  const patch = update.mock.calls[0].arguments[1];
  assert.equal(patch.active, false);
  assert.equal(patch.name, "Deleted user");
  assert.equal(patch.email, "deleted-u1@deleted.homeease.invalid"); // original email is released for re-registration
  assert.deepEqual(patch.refreshTokens, []);
  assert.equal(remove.mock.callCount(), 0);

  exists.mock.mockImplementation(async () => null);
  res = makeRes();
  await admin.deleteUser({ params: { id: "u1" } }, res);
  assert.equal(res.body.message, "User deleted successfully");
  assert.equal(remove.mock.callCount(), 1);

  user.role = "admin";
  res = makeRes();
  await admin.deleteUser({ params: { id: "u1" } }, res);
  assert.equal(res.statusCode, 400);
});
