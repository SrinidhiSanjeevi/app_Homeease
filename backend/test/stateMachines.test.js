// Proves booking and emergency status changes follow the allowed transition rules.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { canTransition, assertTransition } = require("../services/booking/bookingStateMachine");
const { canTransitionEmergency } = require("../services/emergencyStateMachine");
const emergencyConfig = require("../services/customerCore/emergencyConfig");
const customerCore = require("../services/customerCore");

test("booking: valid forward moves are allowed", () => {
  assert.equal(canTransition("Created", "Assigned", false), true);
  assert.equal(canTransition("Confirmed", "Completed", true), true);
});

test("booking: same status is idempotent, missing status is not allowed", () => {
  assert.equal(canTransition("Created", "Created", false), true);
  assert.equal(canTransition(null, "Created", false), false);
});

test("booking: confirming or completing needs a professional", () => {
  assert.equal(canTransition("Assigned", "Confirmed", false), false);
  assert.equal(canTransition("Assigned", "Confirmed", true), true);
});

test("booking: finished bookings cannot move", () => {
  assert.equal(canTransition("Completed", "Cancelled", true), false);
  assert.equal(canTransition("Cancelled", "Created", true), false);
});

test("assertTransition throws a 400 AppError for illegal moves", () => {
  assert.throws(() => assertTransition("Completed", "Created", true), (e) => e.statusCode === 400 && /Illegal/.test(e.message));
  assert.throws(() => assertTransition("Assigned", "Confirmed", false), /no professional/);
  assert.doesNotThrow(() => assertTransition("Created", "Cancelled", false));
});

test("emergency: both state machines agree on the allowed moves", () => {
  for (const check of [canTransitionEmergency, emergencyConfig.canTransitionEmergency]) {
    assert.equal(check("Dispatched", "OnTheWay"), true);
    assert.equal(check("Arrived", "OnTheWay"), false);
    assert.equal(check("Resolved", "Cancelled"), false);
    assert.equal(check("Unknown", "Resolved"), false);
  }
});

test("emergency config lists the categories we can dispatch and the public numbers", () => {
  assert.deepEqual(emergencyConfig.VALID_EMERGENCY_CATEGORIES, ["Electrical", "Plumbing", "Security", "Fire", "Medical"]);
  assert.equal(emergencyConfig.PUBLIC_EMERGENCY_NUMBERS.Fire.number, "101");
});

test("customerCore re-exports the state machine and config helpers", () => {
  assert.equal(typeof customerCore.canTransition, "function");
  assert.equal(typeof customerCore.reserveProfessional, "function");
  assert.ok(customerCore.SEVERITY_CONFIG.Low);
});
