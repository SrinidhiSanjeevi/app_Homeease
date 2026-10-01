// Proves audit logging records successful admin actions and never lets a logging failure break the request.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const AuditLog = require("../models/AuditLog");
const { recordAudit, auditAction } = require("../middleware/auditMiddleware");

const admin = { _id: "a1", email: "admin@x.com" };

test("recordAudit stores admin, action, IP and user agent", async (t) => {
  const create = t.mock.method(AuditLog, "create", async () => ({}));
  const req = { headers: { "x-forwarded-for": "1.2.3.4", "user-agent": "jest" }, socket: {} };
  await recordAudit({ admin, action: "DELETE_USER", targetType: "User", targetId: 42, req });
  const saved = create.mock.calls[0].arguments[0];
  assert.equal(saved.adminEmail, "admin@x.com");
  assert.equal(saved.targetId, "42");
  assert.equal(saved.ipAddress, "1.2.3.4");
  assert.equal(saved.userAgent, "jest");
  assert.equal(saved.status, "SUCCESS");
});

test("recordAudit falls back to the socket address and empty values", async (t) => {
  const create = t.mock.method(AuditLog, "create", async () => ({}));
  await recordAudit({ admin: { id: "a2", email: "e" }, action: "A", targetType: "T", req: { headers: {}, socket: { remoteAddress: "::1" } } });
  await recordAudit({ admin, action: "A", targetType: "T" });
  assert.equal(create.mock.calls[0].arguments[0].ipAddress, "::1");
  assert.equal(create.mock.calls[0].arguments[0].adminId, "a2");
  assert.equal(create.mock.calls[1].arguments[0].ipAddress, "");
  assert.equal(create.mock.calls[1].arguments[0].targetId, null);
});

test("recordAudit swallows database errors", async (t) => {
  t.mock.method(AuditLog, "create", async () => { throw new Error("db down"); });
  await assert.doesNotReject(recordAudit({ admin, action: "A", targetType: "T" }));
});

test("auditAction records only successful responses from authenticated users", async (t) => {
  const create = t.mock.method(AuditLog, "create", async () => ({}));
  const make = (user, statusCode) => {
    const res = { statusCode, json(data) { return data; } };
    const req = { user, params: { id: "p1" }, query: {}, body: { name: "x" }, headers: {}, socket: {} };
    return { req, res };
  };

  const ok = make(admin, 200);
  let nexted = false;
  await auditAction("UPDATE", "Service")(ok.req, ok.res, () => { nexted = true; });
  assert.ok(nexted);
  assert.deepEqual(ok.res.json({ done: true }), { done: true });

  const failed = make(admin, 500);
  await auditAction("UPDATE", "Service")(failed.req, failed.res, () => {});
  failed.res.json({});

  const anonymous = make(undefined, 200);
  await auditAction("UPDATE", "Service")(anonymous.req, anonymous.res, () => {});
  anonymous.res.json({});

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(create.mock.calls.length, 1);
  assert.equal(create.mock.calls[0].arguments[0].targetId, "p1");
  assert.deepEqual(create.mock.calls[0].arguments[0].details.bodySummary, ["name"]);
});
