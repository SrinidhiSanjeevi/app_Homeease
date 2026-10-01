// Proves the TOTP helpers (base32, token generation/verification, otpauth URL) follow RFC behaviour.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const totp = require("../utils/totp");

test("base32Encode/base32Decode round-trip", () => {
  const input = Buffer.from("HomeEase!");
  assert.deepEqual(totp.base32Decode(totp.base32Encode(input)), input);
});

test("base32Decode ignores padding, spaces, case and invalid characters", () => {
  const clean = totp.base32Decode("MFRGG===");
  assert.deepEqual(totp.base32Decode("mf rgg=="), clean);
  assert.deepEqual(totp.base32Decode("MF1RGG"), clean); // "1" is not in the alphabet
  assert.equal(clean.toString(), "abc");
});

test("generateSecret returns a base32 string of the expected length", () => {
  const secret = totp.generateSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);
});

test("current token verifies and a wrong one does not", () => {
  const secret = totp.generateSecret();
  const token = totp.generateCurrentToken(secret);
  assert.match(token, /^\d{6}$/);
  assert.equal(totp.verifyTotp(token, secret), true);
  const wrong = token === "000000" ? "111111" : "000000";
  assert.equal(totp.verifyTotp(wrong, secret), false);
});

test("verifyTotp rejects missing input and wrong-length tokens", () => {
  const secret = totp.generateSecret();
  assert.equal(totp.verifyTotp("", secret), false);
  assert.equal(totp.verifyTotp("123456", ""), false);
  assert.equal(totp.verifyTotp("12345", secret), false);
});

test("matches the RFC 6238 SHA1 test vector at t=59s", (t) => {
  t.mock.method(Date, "now", () => 59000);
  const secret = totp.base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(totp.generateCurrentToken(secret), "287082");
  assert.equal(totp.verifyTotp("287082", secret), true);
});

test("getOtpAuthUrl builds an otpauth URL with the secret and issuer", () => {
  const url = totp.getOtpAuthUrl("a@b.com", "ABC234");
  assert.ok(url.startsWith("otpauth://totp/HomeEase%3Aa%40b.com?"));
  assert.ok(url.includes("secret=ABC234"));
  assert.ok(url.includes("issuer=HomeEase"));
});
