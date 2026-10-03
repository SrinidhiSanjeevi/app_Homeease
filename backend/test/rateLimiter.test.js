// Proves trusted internal service calls bypass the end-user rate limit, and only with the exact shared token.
process.env.LOG_LEVEL = "silent";
process.env.INTERNAL_SERVICE_TOKEN = "s3cret-internal";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isInternalServiceCall } = require("../middleware/rateLimiter");

const req = (token) => ({ headers: token === undefined ? {} : { "x-internal-token": token } });

test("a request with the exact internal token is treated as trusted", () => {
  assert.equal(isInternalServiceCall(req("s3cret-internal")), true);
  assert.equal(isInternalServiceCall(req("  s3cret-internal ")), true);
});

test("missing, empty, wrong or different-length tokens are rate limited like any other client", () => {
  for (const bad of [undefined, "", "wrong", "s3cret-internal-extra", "s3cret-interna"]) {
    assert.equal(isInternalServiceCall(req(bad)), false, String(bad));
  }
});
