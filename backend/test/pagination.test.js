// Proves parsePagination clamps page/limit to safe defaults and formatPaginationResult computes page counts.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePagination, formatPaginationResult, DEFAULT_LIMIT, MAX_LIMIT } = require("../utils/pagination");

test("uses defaults when query is empty or not numeric", () => {
  assert.deepEqual(parsePagination(), { page: 1, limit: DEFAULT_LIMIT, skip: 0, maxLimit: MAX_LIMIT });
  assert.equal(parsePagination({ page: "abc", limit: "xyz" }).page, 1);
  assert.equal(parsePagination({ page: "0", limit: "-5" }).limit, DEFAULT_LIMIT);
});

test("computes skip from page and limit", () => {
  const result = parsePagination({ page: "3", limit: "10" });
  assert.equal(result.skip, 20);
});

test("caps limit at MAX_LIMIT", () => {
  assert.equal(parsePagination({ limit: "9999" }).limit, MAX_LIMIT);
});

test("formatPaginationResult returns 0 pages for no rows and rounds up otherwise", () => {
  assert.equal(formatPaginationResult({ page: 1, limit: 10, total: 0 }).totalPages, 0);
  assert.equal(formatPaginationResult({ page: 1, limit: 10, total: 21 }).totalPages, 3);
});
