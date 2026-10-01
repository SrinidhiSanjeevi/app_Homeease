// Proves professional matching (ranking, slot reservation, claiming, reassignment) works against stubbed models.
const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.LOG_LEVEL = "silent";

const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");
const SlotReservation = require("../models/SlotReservation");
const notificationClient = require("../services/notification/notificationClient");
const matcher = require("../services/professionalMatcher");

const DATE = new Date("2030-01-11T00:00:00Z");

// Fake mongoose query: chainable and await-able; distinct() resolves to `distinctValue`.
function query(rows, distinctValue = []) {
  const q = {
    select: () => q, lean: () => q, sort: () => q, limit: () => q, populate: () => q,
    distinct: async () => distinctValue,
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject)
  };
  return q;
}

test("professionalCategoryFor maps emergency names and trims input", () => {
  assert.equal(matcher.professionalCategoryFor("Electrical"), "Electrician");
  assert.equal(matcher.professionalCategoryFor("  Plumbing "), "Plumbing");
  assert.equal(matcher.professionalCategoryFor(42), "");
});

test("coversArea checks service areas, falling back to the home locality", () => {
  assert.equal(matcher.coversArea({ serviceAreas: ["Kondapur"] }, "kondapur"), true);
  assert.equal(matcher.coversArea({ locality: "Madhapur" }, "Madhapur"), true);
  assert.equal(matcher.coversArea({ locality: "Madhapur" }, "Kondapur"), false);
  assert.equal(matcher.coversArea({ locality: "Madhapur" }, null), false);
});

test("reserveProfessional returns nothing when required details are missing", async () => {
  assert.deepEqual(await matcher.reserveProfessional({ category: "Plumbing" }), { professional: null, distanceKm: null });
});

test("reserveProfessional reserves the best candidate (same area first, then nearest)", async (t) => {
  const far = { _id: "far", locality: "Kondapur", serviceAreas: [], rating: 5 };
  const local = { _id: "local", locality: "Gachibowli", serviceAreas: ["Gachibowli"], rating: 3 };
  let findFilter;
  t.mock.method(SlotReservation, "find", () => query([], ["busy1"]));
  t.mock.method(Professional, "find", (filter) => { findFilter = filter; return query([far, local]); });
  const created = t.mock.method(SlotReservation, "create", async () => ({}));
  t.mock.method(Professional, "findById", async (id) => ({ _id: id }));

  const result = await matcher.reserveProfessional({
    category: "Electrical", area: "Gachibowli", date: DATE, timeSlot: "09:00 AM - 11:00 AM", bookingId: "b1"
  });
  assert.equal(result.professional._id, "local");
  assert.equal(result.distanceKm, 0);
  assert.deepEqual(findFilter._id, { $nin: ["busy1"] });
  assert.deepEqual(findFilter.category, { $eq: "Electrician" });
  assert.equal(created.mock.calls[0].arguments[0].professional, "local");
});

test("reserveProfessional honours a preferred professional and skips ones taken by a race", async (t) => {
  const a = { _id: "a", locality: "Gachibowli" };
  const b = { _id: "b", locality: "Gachibowli" };
  t.mock.method(SlotReservation, "find", () => query([], []));
  t.mock.method(Professional, "find", () => query([a, b]));
  const create = t.mock.method(SlotReservation, "create", async ({ professional }) => {
    if (professional === "b") throw Object.assign(new Error("dup"), { code: 11000 });
    return {};
  });
  t.mock.method(Professional, "findById", async (id) => ({ _id: id }));
  const args = { category: "Plumbing", area: "Gachibowli", date: DATE, timeSlot: "x", bookingId: "b1" };

  // preferred "b" goes first but is taken -> falls back to "a"
  const result = await matcher.reserveProfessional({ ...args, preferredProfessionalId: "b" });
  assert.equal(result.professional._id, "a");
  assert.equal(create.mock.callCount(), 2);

  // a non-duplicate error is rethrown
  create.mock.mockImplementation(async () => { throw new Error("db down"); });
  await assert.rejects(matcher.reserveProfessional(args), /db down/);

  // everyone taken -> nothing
  create.mock.mockImplementation(async () => { throw Object.assign(new Error("dup"), { code: 11000 }); });
  assert.deepEqual(await matcher.reserveProfessional(args), { professional: null, distanceKm: null });
});

test("releaseBookingReservation deletes reservations only when given an id", async (t) => {
  const del = t.mock.method(SlotReservation, "deleteMany", async () => ({}));
  await matcher.releaseBookingReservation(null);
  assert.equal(del.mock.callCount(), 0);
  await matcher.releaseBookingReservation("b1");
  assert.deepEqual(del.mock.calls[0].arguments[0], { booking: "b1" });
});

test("professionalsInCurrentSlot is empty outside any slot and uses the slot otherwise", async (t) => {
  t.mock.method(SlotReservation, "find", () => query([], ["p1"]));
  assert.deepEqual(await matcher.professionalsInCurrentSlot(new Date("2030-01-10T19:00:00Z")), []);
  assert.deepEqual(await matcher.professionalsInCurrentSlot(new Date("2030-01-10T04:30:00Z")), ["p1"]);
});

test("claimProfessional marks the first free candidate Busy", async (t) => {
  assert.deepEqual(await matcher.claimProfessional(null), { professional: null, distanceKm: null });
  t.mock.method(SlotReservation, "find", () => query([], []));
  t.mock.method(Professional, "find", () => query([{ _id: "p1", locality: "Gachibowli" }, { _id: "p2", locality: "Gachibowli" }]));
  const update = t.mock.method(Professional, "findOneAndUpdate", async (filter) => (filter._id === "p1" ? null : { _id: filter._id }));
  const result = await matcher.claimProfessional("Plumbing", "Gachibowli");
  assert.equal(result.professional._id, "p2");
  assert.equal(update.mock.callCount(), 2);

  update.mock.mockImplementation(async () => null);
  assert.equal((await matcher.claimProfessional("Plumbing", "Gachibowli")).professional, null);
});

test("assignWaitingBooking confirms a booking when a professional is reserved", async (t) => {
  assert.equal(await matcher.assignWaitingBooking({ isCustom: false, service: null }), false);

  t.mock.method(SlotReservation, "find", () => query([], []));
  t.mock.method(Professional, "find", () => query([{ _id: "p1", locality: "Gachibowli" }]));
  t.mock.method(SlotReservation, "create", async () => ({}));
  t.mock.method(Professional, "findById", async () => ({ _id: "p1", name: "Ravi" }));
  const dispatch = t.mock.method(notificationClient, "dispatch", async () => ({}));
  const update = t.mock.method(Booking, "findOneAndUpdate", async () => ({ _id: "b1", user: "u1" }));
  const booking = { _id: "b1", status: "Assigned", area: "Gachibowli", date: DATE, timeSlot: "x", isCustom: true, customCategory: "Plumbing", createdAt: new Date() };

  assert.equal(await matcher.assignWaitingBooking(booking), true);
  assert.equal(update.mock.calls[0].arguments[1].$set.status, "Confirmed");
  assert.equal(dispatch.mock.callCount(), 1);

  // somebody else assigned it first -> reservation is released
  update.mock.mockImplementation(async () => null);
  const release = t.mock.method(SlotReservation, "deleteMany", async () => ({}));
  assert.equal(await matcher.assignWaitingBooking(booking), false);
  assert.equal(release.mock.callCount(), 1);
});

test("assignWaitingBooking returns false when nobody is free", async (t) => {
  t.mock.method(SlotReservation, "find", () => query([], []));
  t.mock.method(Professional, "find", () => query([]));
  const booking = { _id: "b1", status: "Assigned", date: DATE, timeSlot: "x", service: { category: "Plumbing" } };
  assert.equal(await matcher.assignWaitingBooking(booking), false);
});

test("reassignWaitingBookings skips bookings whose slot already started", async (t) => {
  const started = { _id: "old", date: new Date("2020-01-01T00:00:00Z"), timeSlot: "09:00 AM - 11:00 AM" };
  t.mock.method(Booking, "find", () => query([started]));
  const find = t.mock.method(Professional, "find", () => query([]));
  await matcher.reassignWaitingBookings();
  assert.equal(find.mock.callCount(), 0);
});

test("reassignWaitingEmergencies assigns a professional, or frees them if the emergency was taken", async (t) => {
  const emergency = { _id: "e1", category: "Plumbing", area: "Gachibowli" };
  t.mock.method(EmergencyRequest, "find", () => query([emergency]));
  t.mock.method(SlotReservation, "find", () => query([], []));
  t.mock.method(Professional, "find", () => query([{ _id: "p1", locality: "Gachibowli" }]));
  t.mock.method(Professional, "findOneAndUpdate", async () => ({ _id: "p1", name: "Ravi" }));
  const emergencyUpdate = t.mock.method(EmergencyRequest, "findOneAndUpdate", async () => ({ _id: "e1" }));
  const free = t.mock.method(Professional, "updateOne", async () => ({}));

  await matcher.reassignWaitingEmergencies();
  assert.equal(emergencyUpdate.mock.callCount(), 1);
  assert.equal(free.mock.callCount(), 0);

  emergencyUpdate.mock.mockImplementation(async () => null);
  await matcher.reassignWaitingEmergencies();
  assert.equal(free.mock.callCount(), 1);
});

test("reassignWaitingWork runs both reassignment passes", async (t) => {
  const bookings = t.mock.method(Booking, "find", () => query([]));
  const emergencies = t.mock.method(EmergencyRequest, "find", () => query([]));
  await matcher.reassignWaitingWork();
  assert.equal(bookings.mock.callCount(), 1);
  assert.equal(emergencies.mock.callCount(), 1);
});
