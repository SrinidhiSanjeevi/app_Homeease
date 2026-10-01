// Proves the JWT auth middleware accepts valid admin tokens and rejects missing, bad, pending-MFA and deactivated users.
process.env.LOG_LEVEL = "silent";
process.env.JWT_SECRET = "test-secret";
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");
const client = require("../services/bookingServiceClient");
const { protect } = require("../middleware/authMiddleware");

const makeRes = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(data) { this.body = data; return this; }
});
const tokenFor = (payload) => jwt.sign(payload, process.env.JWT_SECRET);
const run = async (headers) => {
  const req = { headers };
  const res = makeRes();
  let nextCalled = false;
  await protect(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
};

test("protect rejects a request with no bearer token", async () => {
  assert.equal((await run({})).res.statusCode, 401);
  assert.equal((await run({ authorization: "Bearer " })).res.statusCode, 401);
});

test("protect rejects a token that is not valid", async () => {
  const { res } = await run({ authorization: "Bearer not-a-jwt" });
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /token failed/);
});

test("protect rejects tokens still waiting for two-factor verification", async () => {
  const { res } = await run({ authorization: `Bearer ${tokenFor({ id: "1", mfaPending: true })}` });
  assert.match(res.body.message, /Two-factor/);
});

test("protect attaches the user and calls next for a valid token", async (t) => {
  t.mock.method(client, "getUserById", async () => ({ user: { _id: "u1", role: "admin" } }));
  const { req, nextCalled } = await run({ authorization: `Bearer ${tokenFor({ id: "u1" })}` });
  assert.equal(nextCalled, true);
  assert.equal(req.user.role, "admin");
});

test("protect says 'user not found' when the booking service returns 404 or no user", async (t) => {
  const mock = t.mock.method(client, "getUserById", async () => { throw new AppError("gone", 404); });
  const header = { authorization: `Bearer ${tokenFor({ id: "u1" })}` };
  assert.match((await run(header)).res.body.message, /user not found/);
  mock.mock.restore();
  t.mock.method(client, "getUserById", async () => ({}));
  assert.match((await run(header)).res.body.message, /user not found/);
});

test("protect blocks deactivated accounts and other lookup failures", async (t) => {
  const header = { authorization: `Bearer ${tokenFor({ id: "u1" })}` };
  const mock = t.mock.method(client, "getUserById", async () => ({ user: { active: false } }));
  assert.match((await run(header)).res.body.message, /deactivated/);
  mock.mock.restore();
  t.mock.method(client, "getUserById", async () => { throw new AppError("down", 503); });
  assert.match((await run(header)).res.body.message, /token failed/);
});
