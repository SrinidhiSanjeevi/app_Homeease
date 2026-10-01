// Proves the small express middleware (admin, request id, validate, error handler, internal token) behave correctly with fake req/res/next.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { body } = require("express-validator");

process.env.INTERNAL_SERVICE_TOKEN = "secret-token";
process.env.LOG_LEVEL = "silent";

const { adminOnly } = require("../middleware/adminMiddleware");
const requestId = require("../middleware/requestId");
const validate = require("../middleware/validate");
const errorHandler = require("../middleware/errorHandler");
const { requireInternalToken } = require("../middleware/internalAuth");
const limiters = require("../middleware/rateLimiter");

function fakeRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}

test("adminOnly lets admins through and blocks others with 403", () => {
  let called = 0;
  adminOnly({ user: { role: "admin" } }, fakeRes(), () => called++);
  assert.equal(called, 1);
  const res = fakeRes();
  adminOnly({ user: { role: "user" } }, res, () => called++);
  adminOnly({}, fakeRes(), () => called++);
  assert.equal(called, 1);
  assert.equal(res.statusCode, 403);
});

test("requestId reuses a valid incoming id or generates one", () => {
  const res = fakeRes();
  const req = { headers: { "x-request-id": "  abc  " } };
  requestId(req, res, () => {});
  assert.equal(req.id, "abc");
  assert.equal(res.headers["X-Request-ID"], "abc");

  const req2 = { headers: {} };
  requestId(req2, fakeRes(), () => {});
  assert.match(req2.id, /^[0-9a-f-]{36}$/);
});

test("validate calls next when valid and returns 400 with the first message when not", async () => {
  const middleware = validate([body("name").notEmpty().withMessage("Name is required")]);
  let called = 0;
  await middleware({ body: { name: "x" } }, fakeRes(), () => called++);
  assert.equal(called, 1);

  const res = fakeRes();
  await middleware({ body: {} }, res, () => called++);
  assert.equal(called, 1);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Name is required");
  assert.equal(res.body.errors[0].field, "name");
});

test("errorHandler maps known error types to status codes", () => {
  const send = (err) => {
    const res = fakeRes();
    errorHandler(err, { id: "r1", method: "GET", originalUrl: "/x" }, res, () => {});
    return res;
  };
  assert.equal(send({ message: "boom" }).statusCode, 500);
  assert.equal(send({ statusCode: 404, message: "missing" }).body.message, "missing");
  assert.equal(send({ name: "CastError", path: "_id" }).statusCode, 400);
  const validation = send({ name: "ValidationError", errors: { a: { message: "bad a" } } });
  assert.equal(validation.statusCode, 422);
  assert.deepEqual(validation.body.details, ["bad a"]);
  assert.equal(send({ name: "JsonWebTokenError" }).statusCode, 401);
  assert.match(send({ name: "TokenExpiredError" }).body.message, /expired/);
});

test("requireInternalToken accepts the right token and rejects others", () => {
  let called = 0;
  requireInternalToken({ headers: { "x-internal-token": "secret-token" } }, fakeRes(), () => called++);
  assert.equal(called, 1);
  for (const headers of [{}, { "x-internal-token": "wrong-token!" }, { "x-internal-token": "short" }]) {
    const res = fakeRes();
    requireInternalToken({ headers }, res, () => called++);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(called, 1);
});

test("rate limiters are exported as middleware functions", () => {
  for (const name of ["authLimiter", "paymentLimiter", "emergencyLimiter", "generalLimiter"]) {
    assert.equal(typeof limiters[name], "function");
  }
});
