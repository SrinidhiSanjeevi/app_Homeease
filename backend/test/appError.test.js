// Proves AppError carries a status code, a fail/error label and the operational flag.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const AppError = require("../utils/AppError");

test("4xx errors are labelled fail, 5xx are labelled error", () => {
  assert.equal(new AppError("bad", 400).status, "fail");
  assert.equal(new AppError("boom", 500).status, "error");
});

test("keeps message, statusCode, details and is operational", () => {
  const err = new AppError("nope", 422, ["x"]);
  assert.ok(err instanceof Error);
  assert.equal(err.message, "nope");
  assert.equal(err.statusCode, 422);
  assert.deepEqual(err.details, ["x"]);
  assert.equal(err.isOperational, true);
});
