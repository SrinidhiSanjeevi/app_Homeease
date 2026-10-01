// Proves AppError and the env validator report the right status and missing variables.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const AppError = require("../utils/AppError");
const { validateEnv, REQUIRED_ENV } = require("../config/validateEnv");

test("AppError sets fail for 4xx and error for 5xx", () => {
  const bad = new AppError("bad", 400);
  assert.deepEqual([bad.statusCode, bad.status, bad.isOperational], [400, "fail", true]);
  assert.equal(new AppError("boom", 502).status, "error");
});

test("validateEnv accepts a complete environment", () => {
  const env = Object.fromEntries(REQUIRED_ENV.map((key) => [key, "value"]));
  assert.deepEqual(validateEnv(env), { isValid: true, missing: [] });
});

test("validateEnv lists missing and blank variables", () => {
  const result = validateEnv({ MONGO_URI: "  ", RAZORPAY_KEY_ID: "id" });
  assert.equal(result.isValid, false);
  assert.deepEqual(result.missing, ["MONGO_URI", "RAZORPAY_KEY_SECRET"]);
});
