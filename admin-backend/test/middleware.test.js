// Proves the request-id, admin, permission and error-handler middleware behave correctly with fake req/res/next.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const requestId = require("../middleware/requestId");
const { adminOnly } = require("../middleware/adminMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const errorHandler = require("../middleware/errorHandler");

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    setHeader(name, value) { this.headers[name] = value; }
  };
}

test("requestId reuses a trimmed incoming id", () => {
  const req = { headers: { "x-request-id": "  abc  " } };
  const res = fakeRes();
  let called = false;
  requestId(req, res, () => { called = true; });
  assert.equal(req.id, "abc");
  assert.equal(res.headers["X-Request-ID"], "abc");
  assert.ok(called);
});

test("requestId generates a UUID when none is sent", () => {
  const req = { headers: {} };
  requestId(req, fakeRes(), () => {});
  assert.match(req.id, /^[0-9a-f-]{36}$/);
});

test("adminOnly lets admins through and blocks everyone else", () => {
  let called = 0;
  adminOnly({ user: { role: "admin" } }, fakeRes(), () => { called++; });
  assert.equal(called, 1);
  const res = fakeRes();
  adminOnly({ user: { role: "user" } }, res, () => { called++; });
  assert.equal(res.statusCode, 403);
  assert.equal(called, 1);
});

test("requirePermission rejects anonymous users and non-admins", () => {
  const guard = requirePermission("users");
  const anon = fakeRes();
  guard({}, anon, () => assert.fail("should not pass"));
  assert.equal(anon.statusCode, 401);
  const normal = fakeRes();
  guard({ user: { role: "user" } }, normal, () => assert.fail("should not pass"));
  assert.equal(normal.statusCode, 403);
});

test("requirePermission allows empty list, 'all' or the exact permission", () => {
  const guard = requirePermission("users");
  let passed = 0;
  for (const permissions of [[], ["all"], ["users"], undefined]) {
    guard({ user: { role: "admin", permissions } }, fakeRes(), () => { passed++; });
  }
  assert.equal(passed, 4);
});

test("requirePermission denies an admin who lacks the permission", () => {
  const res = fakeRes();
  requirePermission("users")({ user: { role: "admin", permissions: ["bookings"] } }, res, () => assert.fail("blocked"));
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /users/);
});

test("errorHandler uses the error's own status code", () => {
  const res = fakeRes();
  errorHandler({ statusCode: 404, message: "missing" }, { id: "r1", method: "GET", originalUrl: "/x" }, res, () => {});
  assert.equal(res.statusCode, 404);
  assert.deepEqual([res.body.success, res.body.message, res.body.requestId], [false, "missing", "r1"]);
});

test("errorHandler maps known library errors to client statuses", () => {
  const cases = [
    [{ name: "CastError", path: "id" }, 400],
    [{ name: "ValidationError", errors: { a: { message: "bad a" } } }, 422],
    [{ name: "JsonWebTokenError" }, 401],
    [{ name: "TokenExpiredError" }, 401]
  ];
  for (const [err, expected] of cases) {
    const res = fakeRes();
    errorHandler(err, { headers: {} }, res, () => {});
    assert.equal(res.statusCode, expected, err.name);
  }
});

test("errorHandler hides the stack in production but shows it otherwise for 5xx", () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const prod = fakeRes();
    errorHandler(new Error("x"), {}, prod, () => {});
    assert.equal(prod.statusCode, 500);
    assert.equal(prod.body.stack, undefined);
    process.env.NODE_ENV = "development";
    const dev = fakeRes();
    errorHandler(new Error("x"), {}, dev, () => {});
    assert.ok(dev.body.stack);
  } finally {
    process.env.NODE_ENV = original;
  }
});
