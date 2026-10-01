// Proves the protect middleware accepts a valid token for an active user and rejects every other case with 401.
const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";
process.env.LOG_LEVEL = "silent";

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");

const fakeRes = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; }
});

// Replaces User.findById with a stub that returns `user` from .select().
function stubUser(t, user) {
  t.mock.method(User, "findById", () => ({ select: async () => user }));
}

const bearer = (payload) => ({ headers: { authorization: `Bearer ${jwt.sign(payload, "test-secret")}` } });

test("rejects a request without a Bearer token", async () => {
  const res = fakeRes();
  await protect({ headers: {} }, res, () => assert.fail("next must not be called"));
  assert.equal(res.statusCode, 401);
  const res2 = fakeRes();
  await protect({ headers: { authorization: "Bearer " } }, res2, () => assert.fail("no next"));
  assert.equal(res2.statusCode, 401);
});

test("rejects a bad token", async () => {
  const res = fakeRes();
  await protect({ headers: { authorization: "Bearer not.a.jwt" } }, res, () => assert.fail("no next"));
  assert.equal(res.statusCode, 401);
  assert.match(res.body.message, /token failed/);
});

test("rejects a token that is still waiting for MFA", async () => {
  const res = fakeRes();
  await protect(bearer({ id: "1", mfaPending: true }), res, () => assert.fail("no next"));
  assert.match(res.body.message, /Two-factor/);
});

test("rejects unknown and deactivated users", async (t) => {
  stubUser(t, null);
  const res = fakeRes();
  await protect(bearer({ id: "1" }), res, () => assert.fail("no next"));
  assert.match(res.body.message, /user not found/);

  User.findById.mock.restore();
  stubUser(t, { active: false });
  const res2 = fakeRes();
  await protect(bearer({ id: "1" }), res2, () => assert.fail("no next"));
  assert.match(res2.body.message, /deactivated/);
});

test("sets req.user and calls next for an active user", async (t) => {
  const user = { _id: "1", role: "user", active: true };
  stubUser(t, user);
  const req = bearer({ id: "1" });
  let called = 0;
  await protect(req, fakeRes(), () => called++);
  assert.equal(called, 1);
  assert.equal(req.user, user);
});
