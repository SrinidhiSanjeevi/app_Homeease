// Proves the express-validator rule sets accept good input and report the right message for bad input.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { signupRules, loginRules } = require("../validators/authValidators");
const { createBookingRules, cancelBookingRules, rateBookingRules } = require("../validators/bookingValidators");
const { dispatchEmergencyRules, cancelEmergencyRules } = require("../validators/emergencyValidators");
const { createOrderRules, verifyPaymentRules } = require("../validators/paymentValidators");
const { serviceIdRules, serviceReviewsRules, recentReviewsRules } = require("../validators/serviceValidators");

const ID = "507f1f77bcf86cd799439011";

// Runs every rule against a fake request and returns the list of error messages.
async function run(rules, req) {
  const messages = [];
  const fakeReq = { body: {}, params: {}, query: {}, headers: {}, ...req };
  for (const rule of rules) {
    const result = await rule.run(fakeReq);
    messages.push(...result.array().map((e) => e.msg));
  }
  return { messages, req: fakeReq };
}

test("signup: valid body passes, weak password and bad email fail", async () => {
  assert.deepEqual((await run(signupRules, { body: { name: "Asha", email: "a@b.com", password: "Passw0rdX" } })).messages, []);
  const bad = await run(signupRules, { body: { name: "", email: "nope", password: "abc" } });
  assert.ok(bad.messages.includes("Name is required"));
  assert.ok(bad.messages.includes("A valid email is required"));
  assert.ok(bad.messages.includes("Password must include an uppercase letter"));
});

test("login: needs an email and a password", async () => {
  assert.deepEqual((await run(loginRules, { body: { email: "a@b.com", password: "x" } })).messages, []);
  assert.ok((await run(loginRules, { body: {} })).messages.includes("Password is required"));
});

test("booking: valid request passes and contact number is normalised", async () => {
  const body = {
    address: "12 Main Road", contactNumber: "+91 98765-43210", area: "Gachibowli",
    date: "2030-01-11", timeSlot: "09:00 AM - 11:00 AM", serviceId: ID, paymentMethod: "Cash"
  };
  const { messages, req } = await run(createBookingRules, { body });
  assert.deepEqual(messages, []);
  assert.equal(req.body.contactNumber, "9876543210");
});

test("booking: invalid fields give specific messages", async () => {
  const { messages } = await run(createBookingRules, {
    body: { address: "x", contactNumber: "123", area: "Mars", date: "11/01/2030", timeSlot: "noon", serviceId: "bad", paymentMethod: "Bitcoin" }
  });
  assert.ok(messages.includes("Please enter a valid 10-digit mobile number"));
  assert.ok(messages.includes("Please pick a valid date"));
  assert.ok(messages.includes("Please pick an available time slot"));
  assert.ok(messages.includes("Invalid service"));
  assert.ok(messages.includes("Invalid payment method"));
});

test("booking: id and rating rules", async () => {
  assert.deepEqual((await run(cancelBookingRules, { params: { id: ID } })).messages, []);
  assert.equal((await run(cancelBookingRules, { params: { id: "1" } })).messages.length, 1);
  assert.deepEqual((await run(rateBookingRules, { params: { id: ID }, body: { rating: 5 } })).messages, []);
  assert.ok((await run(rateBookingRules, { params: { id: ID }, body: { rating: 9 } })).messages.includes("Rating must be a whole number from 1 to 5"));
});

test("emergency: dispatch and cancel rules", async () => {
  const good = { category: "Plumbing", address: "12 Main Road", contactNumber: "9876543210", area: "Kondapur", description: "pipe burst" };
  assert.deepEqual((await run(dispatchEmergencyRules, { body: good })).messages, []);
  const bad = await run(dispatchEmergencyRules, { body: { ...good, category: "Alien", severity: "Huge" } });
  assert.equal(bad.messages.length, 2);
  assert.deepEqual((await run(cancelEmergencyRules, { params: { id: ID } })).messages, []);
  assert.equal((await run(cancelEmergencyRules, { params: { id: "x" } })).messages.length, 1);
});

test("payment: order and verify rules", async () => {
  assert.deepEqual((await run(createOrderRules, { body: { bookingId: ID } })).messages, []);
  assert.equal((await run(createOrderRules, { body: { bookingId: "x" } })).messages.length, 1);
  const missing = await run(verifyPaymentRules, { body: { bookingId: ID } });
  assert.ok(missing.messages.includes("Razorpay signature is required"));
});

test("service: id and limit rules", async () => {
  assert.deepEqual((await run(serviceIdRules, { params: { id: ID } })).messages, []);
  assert.equal((await run(serviceReviewsRules, { params: { id: ID }, query: { limit: "100" } })).messages.length, 1);
  assert.equal((await run(recentReviewsRules, { query: { limit: "13" } })).messages.length, 1);
  assert.deepEqual((await run(recentReviewsRules, { query: { limit: "5" } })).messages, []);
});
