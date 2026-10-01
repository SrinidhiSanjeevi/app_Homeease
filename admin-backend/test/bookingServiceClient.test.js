// Proves the booking-service client builds safe URLs, sends the internal token, and maps failures to AppError.
process.env.LOG_LEVEL = "silent";
process.env.BOOKING_SERVICE_URL = "http://booking.test:5000";
process.env.INTERNAL_SERVICE_TOKEN = "secret-token";
const test = require("node:test");
const assert = require("node:assert/strict");
const client = require("../services/bookingServiceClient");

const ID = "64b7f0c2a1b2c3d4e5f60718";
const okResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const stubFetch = (t, impl) => t.mock.method(globalThis, "fetch", impl);

test("safeId accepts ObjectIds and rejects anything else", () => {
  assert.equal(client._safeId(ID), ID);
  for (const bad of ["../etc/passwd", "abc", `${ID}/x`, "", undefined]) {
    assert.throws(() => client._safeId(bad), { statusCode: 400 });
  }
});

test("buildUrl keeps requests on the booking service origin", () => {
  assert.equal(client._buildUrl("/api/x?a=1"), "http://booking.test:5000/api/x?a=1");
  assert.throws(() => client._buildUrl("@evil.com/x"), { statusCode: 400 });
  assert.throws(() => client._buildUrl(".evil.com/x"), { statusCode: 400 });
});

test("getStats calls the internal URL with the internal token header", async (t) => {
  const fetchMock = stubFetch(t, async () => okResponse({ stats: 1 }));
  assert.deepEqual(await client.getStats(), { stats: 1 });
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "http://booking.test:5000/api/internal/admin/stats");
  assert.equal(options.headers["X-Internal-Token"], "secret-token");
  assert.equal(options.method, "GET");
});

test("list calls add only non-empty query parameters", async (t) => {
  const fetchMock = stubFetch(t, async () => okResponse({}));
  await client.getAllUsers({ page: 2, search: "", role: null, q: undefined, name: "a b" });
  assert.equal(fetchMock.mock.calls[0].arguments[0], "http://booking.test:5000/api/internal/admin/users?page=2&name=a+b");
  await client.getAllBookings();
  assert.ok(fetchMock.mock.calls[1].arguments[0].endsWith("/bookings"));
});

test("every endpoint helper uses the right method and path", async (t) => {
  const fetchMock = stubFetch(t, async () => okResponse({}));
  const calls = [
    [() => client.getUserById(ID), "GET", `/users/${ID}`],
    [() => client.deleteUser(ID), "DELETE", `/users/${ID}`],
    [() => client.updateBookingStatus(ID, "Done"), "PUT", `/bookings/${ID}/status`],
    [() => client.getAllServices({}), "GET", "/services"],
    [() => client.createService({ a: 1 }), "POST", "/services"],
    [() => client.updateService(ID, { a: 1 }), "PUT", `/services/${ID}`],
    [() => client.deleteService(ID), "DELETE", `/services/${ID}`],
    [() => client.getAllProfessionals({}), "GET", "/professionals"],
    [() => client.createProfessional({}), "POST", "/professionals"],
    [() => client.updateProfessional(ID, {}), "PUT", `/professionals/${ID}`],
    [() => client.deleteProfessional(ID), "DELETE", `/professionals/${ID}`],
    [() => client.getAllEmergencies({}), "GET", "/emergencies"],
    [() => client.updateEmergencyStatus(ID, "Closed"), "PUT", `/emergencies/${ID}/status`],
    [() => client.getAreas(), "GET", "/areas"]
  ];
  for (const [call] of calls) await call();
  calls.forEach(([, method, path], i) => {
    const [url, options] = fetchMock.mock.calls[i].arguments;
    assert.equal(url, `http://booking.test:5000/api/internal/admin${path}`);
    assert.equal(options.method, method);
  });
});

test("a non-ok response becomes an AppError with the upstream status and message", async (t) => {
  stubFetch(t, async () => okResponse({ message: "Not here" }, 404));
  await assert.rejects(client.getStats(), { statusCode: 404, message: "Not here" });
  stubFetch(t, async () => ({ ok: false, status: 500, json: async () => { throw new Error("no body"); } }));
  await assert.rejects(client.getStats(), { statusCode: 500, message: "Booking service error (500)" });
});

test("a timeout becomes a 503 'timed out' error", async (t) => {
  stubFetch(t, async () => { throw Object.assign(new Error("slow"), { name: "TimeoutError" }); });
  await assert.rejects(client.getStats(), { statusCode: 503, message: "Booking service request timed out" });
});

test("a network failure becomes a 503 'unavailable' error", async (t) => {
  stubFetch(t, async () => { throw new Error("ECONNREFUSED"); });
  await assert.rejects(client.getStats(), { statusCode: 503, message: "Booking service is temporarily unavailable" });
});

test("an invalid id never reaches fetch", async (t) => {
  const fetchMock = stubFetch(t, async () => okResponse({}));
  await assert.rejects(client.getUserById("../admin"), { statusCode: 400 });
  assert.equal(fetchMock.mock.callCount(), 0);
});
