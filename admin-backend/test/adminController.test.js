// Proves each admin controller forwards to the booking client with the right args, and reports errors with the right status.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const client = require("../services/bookingServiceClient");
const AuditLog = require("../models/AuditLog");
const controller = require("../controllers/adminController");

const makeRes = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; }
});

// controller name -> [client method, expected success status, request]
const forwarding = [
  ["getAreas", "getAreas", 200, {}],
  ["getStats", "getStats", 200, {}],
  ["getAllUsers", "getAllUsers", 200, { query: { page: "1" } }],
  ["deleteUser", "deleteUser", 200, { params: { id: "1" } }],
  ["getAllBookings", "getAllBookings", 200, { query: {} }],
  ["updateBookingStatus", "updateBookingStatus", 200, { params: { id: "1" }, body: { status: "Done" } }],
  ["getAllServices", "getAllServices", 200, { query: {} }],
  ["createService", "createService", 201, { body: { name: "x" } }],
  ["updateService", "updateService", 200, { params: { id: "1" }, body: {} }],
  ["deleteService", "deleteService", 200, { params: { id: "1" } }],
  ["getAllProfessionals", "getAllProfessionals", 200, { query: {} }],
  ["createProfessional", "createProfessional", 201, { body: {} }],
  ["updateProfessional", "updateProfessional", 200, { params: { id: "1" }, body: {} }],
  ["deleteProfessional", "deleteProfessional", 200, { params: { id: "1" } }],
  ["getAllEmergencies", "getAllEmergencies", 200, { query: {} }],
  ["updateEmergencyStatus", "updateEmergencyStatus", 200, { params: { id: "1" }, body: { status: "Closed" } }]
];

for (const [name, method, status, req] of forwarding) {
  test(`${name} returns the booking service data with status ${status}`, async (t) => {
    t.mock.method(client, method, async () => ({ ok: name }));
    const res = makeRes();
    await controller[name](req, res);
    assert.equal(res.statusCode, status);
    assert.deepEqual(res.body, { ok: name });
  });

  test(`${name} passes through the upstream error status`, async (t) => {
    t.mock.method(client, method, async () => { throw Object.assign(new Error("upstream"), { statusCode: 404 }); });
    const res = makeRes();
    await controller[name](req, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { success: false, message: "upstream" });
  });
}

test("an error without status or message becomes a generic 500", async (t) => {
  t.mock.method(client, "getStats", async () => { throw new Error(""); });
  const res = makeRes();
  await controller.getStats({}, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "Something went wrong, please try again");
});

function stubAuditLogQuery(t, total, logs) {
  const calls = {};
  const chain = {
    sort(arg) { calls.sort = arg; return this; },
    skip(arg) { calls.skip = arg; return this; },
    limit(arg) { calls.limit = arg; return this; },
    populate() { return this; },
    lean: async () => logs
  };
  t.mock.method(AuditLog, "countDocuments", async (q) => { calls.countQuery = q; return total; });
  t.mock.method(AuditLog, "find", (q) => { calls.findQuery = q; return chain; });
  return calls;
}

test("getAuditLogs paginates and filters by trimmed action", async (t) => {
  const calls = stubAuditLogQuery(t, 45, [{ action: "X" }]);
  const res = makeRes();
  await controller.getAuditLogs({ query: { page: "2", limit: "20", action: "  X " } }, res);
  assert.deepEqual(calls.findQuery, { action: "X" });
  assert.equal(calls.skip, 20);
  assert.deepEqual(res.body.pagination, { page: 2, limit: 20, total: 45, totalPages: 3 });
  assert.equal(res.body.logs.length, 1);
});

test("getAuditLogs clamps bad page and limit values", async (t) => {
  const calls = stubAuditLogQuery(t, 0, []);
  const res = makeRes();
  await controller.getAuditLogs({ query: { page: "-4", limit: "9999", action: 5 } }, res);
  assert.deepEqual(calls.findQuery, {});
  assert.equal(res.body.pagination.page, 1);
  assert.equal(res.body.pagination.limit, 100);
});

test("getAuditLogs returns 500 when the database fails", async (t) => {
  t.mock.method(AuditLog, "countDocuments", async () => { throw new Error("db"); });
  t.mock.method(AuditLog, "find", () => ({ sort() { return this; }, skip() { return this; }, limit() { return this; }, populate() { return this; }, lean: async () => [] }));
  const res = makeRes();
  await controller.getAuditLogs({ query: {} }, res);
  assert.equal(res.statusCode, 500);
});

test("getAuditLogs shows the admin from the stored email (no cross-database populate)", async (t) => {
  const log = { _id: "l1", adminId: "a1", adminEmail: "admin@homeease.com", action: "USER_DELETED" };
  t.mock.method(AuditLog, "countDocuments", async () => 1);
  t.mock.method(AuditLog, "find", () => ({
    sort() { return this; }, skip() { return this; }, limit() { return this; },
    populate() { assert.fail("populate would need the User model from another service's database"); },
    lean: async () => [log]
  }));
  const res = makeRes();
  await controller.getAuditLogs({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.logs[0].adminId, { _id: "a1", email: "admin@homeease.com", name: "admin@homeease.com" });
  assert.equal(res.body.logs[0].action, "USER_DELETED");
});
