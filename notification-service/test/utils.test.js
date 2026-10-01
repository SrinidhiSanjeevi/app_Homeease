// Proves AppError, env validation, notification constants and the internal-token guard behave as documented.
process.env.LOG_LEVEL = "silent";
process.env.INTERNAL_SERVICE_TOKEN = "s3cret";
const test = require("node:test");
const assert = require("node:assert/strict");
const AppError = require("../utils/AppError");
const { validateEnv } = require("../config/validateEnv");
const { NOTIFICATION_TYPES, NOTIFICATION_CHANNELS, NOTIFICATION_STATUS } = require("../services/notificationTypes");
const { requireInternalToken } = require("../middleware/internalAuth");

const makeRes = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; }
});

test("AppError sets fail for 4xx and error for 5xx", () => {
  assert.deepEqual([new AppError("x", 404).status, new AppError("x", 500).status], ["fail", "error"]);
});

test("validateEnv reports missing or blank variables", () => {
  assert.deepEqual(validateEnv({ MONGO_URI: "m", BOOKING_SERVICE_URL: "http://b" }), { isValid: true, missing: [] });
  assert.deepEqual(validateEnv({ MONGO_URI: " " }).missing, ["MONGO_URI", "BOOKING_SERVICE_URL"]);
});

test("notification constants are frozen", () => {
  for (const group of [NOTIFICATION_TYPES, NOTIFICATION_CHANNELS, NOTIFICATION_STATUS]) {
    assert.ok(Object.isFrozen(group));
  }
  assert.equal(NOTIFICATION_STATUS.PENDING, "Pending");
});

test("requireInternalToken allows the right token and blocks the rest", () => {
  let allowed = 0;
  requireInternalToken({ headers: { "x-internal-token": "s3cret" } }, makeRes(), () => { allowed++; });
  assert.equal(allowed, 1);
  for (const headers of [{ "x-internal-token": "s3creX" }, { "x-internal-token": "no" }, {}]) {
    const res = makeRes();
    requireInternalToken({ headers }, res, () => assert.fail("must not pass"));
    assert.equal(res.statusCode, 401);
  }
});

test("requireInternalToken lets everything through when no token is configured", () => {
  process.env.INTERNAL_SERVICE_TOKEN = "";
  delete require.cache[require.resolve("../middleware/internalAuth")];
  let called = false;
  require("../middleware/internalAuth").requireInternalToken({ headers: {} }, makeRes(), () => { called = true; });
  assert.ok(called);
});
