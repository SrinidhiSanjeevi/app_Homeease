// Proves AppError and the pagination helpers produce the status codes, defaults and limits the API relies on.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const AppError = require("../utils/AppError");
const { parsePagination, formatPaginationResult, DEFAULT_LIMIT, MAX_LIMIT } = require("../utils/pagination");

test("AppError marks 4xx as fail and 5xx as error, and keeps details", () => {
  const bad = new AppError("nope", 400, ["x"]);
  assert.equal(bad.status, "fail");
  assert.equal(bad.isOperational, true);
  assert.deepEqual(bad.details, ["x"]);
  assert.equal(new AppError("boom", 500).status, "error");
  assert.ok(bad instanceof Error);
});

test("parsePagination falls back to defaults for missing or invalid input", () => {
  assert.deepEqual(parsePagination(), { page: 1, limit: DEFAULT_LIMIT, skip: 0, maxLimit: MAX_LIMIT });
  assert.equal(parsePagination({ page: "abc", limit: "-3" }).page, 1);
  assert.equal(parsePagination({ page: "0", limit: "0" }).limit, DEFAULT_LIMIT);
});

test("parsePagination computes skip and caps the limit", () => {
  const result = parsePagination({ page: "3", limit: "10" });
  assert.equal(result.skip, 20);
  assert.equal(parsePagination({ limit: "500" }).limit, MAX_LIMIT);
});

test("formatPaginationResult computes total pages", () => {
  assert.equal(formatPaginationResult({ page: 1, limit: 10, total: 0 }).totalPages, 0);
  assert.equal(formatPaginationResult({ page: 1, limit: 10, total: 25 }).totalPages, 3);
});
