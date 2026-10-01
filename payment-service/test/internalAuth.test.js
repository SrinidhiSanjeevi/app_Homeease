// Proves internal routes require the shared X-Internal-Token and open up only when no token is configured.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");

const makeRes = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; }
});

function loadMiddleware(token) {
  process.env.INTERNAL_SERVICE_TOKEN = token;
  delete require.cache[require.resolve("../middleware/internalAuth")];
  return require("../middleware/internalAuth").requireInternalToken;
}

test("a matching token is allowed through", () => {
  const guard = loadMiddleware("s3cret");
  let called = false;
  guard({ headers: { "x-internal-token": "s3cret" } }, makeRes(), () => { called = true; });
  assert.ok(called);
});

test("a wrong, same-length wrong, or missing token gets 401", () => {
  const guard = loadMiddleware("s3cret");
  for (const headers of [{ "x-internal-token": "s3creX" }, { "x-internal-token": "short" }, {}]) {
    const res = makeRes();
    guard({ headers }, res, () => assert.fail("must not pass"));
    assert.equal(res.statusCode, 401);
  }
});

test("with no configured token the guard lets requests through", () => {
  const guard = loadMiddleware("");
  let called = false;
  guard({ headers: {} }, makeRes(), () => { called = true; });
  assert.ok(called);
});
