// Unit tests for requireInternalToken with INTERNAL_SERVICE_TOKEN actually
// set — the app-level tests in api.test.js exercise the unset/dev-mode
// branch instead. TOKEN is read once at module load time, so this file
// sets the env var and re-requires a fresh copy of the module.
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const loadMiddleware = (token) => {
  if (token === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
  else process.env.INTERNAL_SERVICE_TOKEN = token;
  delete require.cache[require.resolve("../middleware/internalAuth")];
  return require("../middleware/internalAuth").requireInternalToken;
};

const mockRes = () => {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

test("rejects a request with no X-Internal-Token when a token is configured", () => {
  const requireInternalToken = loadMiddleware("shared-secret");
  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;

  requireInternalToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test("rejects a request with the wrong X-Internal-Token", () => {
  const requireInternalToken = loadMiddleware("shared-secret");
  const req = { headers: { "x-internal-token": "wrong-secret" } };
  const res = mockRes();
  let nextCalled = false;

  requireInternalToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("calls next() with the correct X-Internal-Token", () => {
  const requireInternalToken = loadMiddleware("shared-secret");
  const req = { headers: { "x-internal-token": "shared-secret" } };
  const res = mockRes();
  let nextCalled = false;

  requireInternalToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test("skips the check entirely when INTERNAL_SERVICE_TOKEN is unset", () => {
  const requireInternalToken = loadMiddleware(undefined);
  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;

  requireInternalToken(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});
