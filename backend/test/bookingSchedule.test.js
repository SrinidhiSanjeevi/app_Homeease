// Proves slot/date validation and "has the slot started/ended" logic (IST, UTC+5:30) work from a fixed clock.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const s = require("../services/booking/bookingSchedule");

// 2030-01-10 10:00 IST = 04:30 UTC
const NOW = new Date("2030-01-10T04:30:00Z");
const day = new Date("2030-01-10T00:00:00Z");

test("localToday returns the IST calendar day at UTC midnight", () => {
  assert.equal(s.localToday(NOW).toISOString(), "2030-01-10T00:00:00.000Z");
  assert.equal(s.localToday(new Date("2030-01-10T20:00:00Z")).toISOString(), "2030-01-11T00:00:00.000Z");
});

test("getScheduledStart/End read the first and last time in the slot", () => {
  const booking = { date: day, timeSlot: "09:00 AM - 11:00 AM" };
  assert.equal(s.getScheduledStart(booking).toISOString(), "2030-01-10T03:30:00.000Z");
  assert.equal(s.getScheduledEnd(booking).toISOString(), "2030-01-10T05:30:00.000Z");
  assert.equal(s.getScheduledStart(null), null);
  assert.equal(s.getScheduledEnd({}), null);
});

test("a booking with no slot text runs from the start to the end of the day", () => {
  assert.equal(s.getScheduledStart({ date: day }).toISOString(), "2030-01-09T18:30:00.000Z");
  assert.equal(s.getScheduledEnd({ date: day }).toISOString(), "2030-01-10T18:30:00.000Z");
});

test("hasScheduledTimeStarted / Ended compare against now", () => {
  const booking = { date: day, timeSlot: "09:00 AM - 11:00 AM" };
  assert.equal(s.hasScheduledTimeStarted(booking, NOW), true);
  assert.equal(s.hasScheduledTimeEnded(booking, NOW), false);
  assert.equal(s.hasScheduledTimeEnded(booking, new Date("2030-01-10T06:00:00Z")), true);
  assert.equal(s.hasScheduledTimeStarted(null, NOW), true);
  assert.equal(s.hasScheduledTimeEnded({ date: "garbage" }, NOW), true);
});

test("currentSlot finds the slot running now, or null", () => {
  assert.equal(s.currentSlot(NOW), "09:00 AM - 11:00 AM");
  assert.equal(s.currentSlot(new Date("2030-01-10T19:00:00Z")), null);
});

test("validateSchedule accepts a future slot", () => {
  const result = s.validateSchedule("2030-01-11", "09:00 AM - 11:00 AM", NOW);
  assert.equal(result.ok, true);
  assert.equal(result.date.toISOString(), "2030-01-11T00:00:00.000Z");
});

test("validateSchedule rejects bad input with a message", () => {
  const bad = (date, slot) => s.validateSchedule(date, slot, NOW);
  assert.equal(bad(20300111, s.TIME_SLOTS[0]).ok, false);
  assert.equal(bad("2030-02-31", s.TIME_SLOTS[0]).ok, false);
  assert.equal(bad("2030-01-11", "midnight").ok, false);
  assert.match(bad("2030-01-09", s.TIME_SLOTS[0]).message, /past/);
  assert.match(bad("2031-01-11", s.TIME_SLOTS[0]).message, /in advance/);
  assert.match(bad("2030-01-10", "09:00 AM - 11:00 AM").message, /already started/);
});
