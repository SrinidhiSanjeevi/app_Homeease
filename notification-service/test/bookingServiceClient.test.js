// Proves the booking-service client builds safe URLs, sends the internal token, and maps failures to AppError.
process.env.LOG_LEVEL = "silent";
process.env.BOOKING_SERVICE_URL = "http://booking.test:5000";
process.env.INTERNAL_SERVICE_TOKEN = "secret-token";
const test = require("node:test");
const assert = require("node:assert/strict");
const client = require("../services/bookingServiceClient");

const ID = "64b7f0c2a1b2c3d4e5f60718";
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const stubFetch = (t, impl) => t.mock.method(globalThis, "fetch", impl);

test("safeId accepts ObjectIds and rejects anything else", () => {
  assert.equal(client._safeId(ID), ID);
  for (const bad of ["../etc/passwd", "abc", `${ID}/x`, "", undefined]) {
    assert.throws(() => client._safeId(bad), { statusCode: 400 });
  }
});

test("buildUrl keeps requests on the booking service origin", () => {
  assert.equal(client._buildUrl("/api/x"), "http://booking.test:5000/api/x");
  assert.throws(() => client._buildUrl("@evil.com/x"), { statusCode: 400 });
});

test("getBooking and getUser return the unwrapped document and send the token", async (t) => {
  const fetchMock = stubFetch(t, async (url) => reply(url.includes("/users/") ? { user: { name: "Asha" } } : { booking: { _id: ID } }));
  assert.deepEqual(await client.getBooking(ID), { _id: ID });
  assert.deepEqual(await client.getUser(ID), { name: "Asha" });
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, `http://booking.test:5000/api/internal/bookings/${ID}`);
  assert.equal(options.headers["X-Internal-Token"], "secret-token");
});

test("a non-ok response becomes an AppError with upstream status and message", async (t) => {
  stubFetch(t, async () => reply({ message: "Not here" }, 404));
  await assert.rejects(client.getBooking(ID), { statusCode: 404, message: "Not here" });
  stubFetch(t, async () => ({ ok: false, status: 500, json: async () => { throw new Error("bad json"); } }));
  await assert.rejects(client.getUser(ID), { message: "Booking service error (500)" });
});

test("timeouts become 503 'timed out' and other failures 503 'unavailable'", async (t) => {
  stubFetch(t, async () => { throw Object.assign(new Error("slow"), { name: "TimeoutError" }); });
  await assert.rejects(client.getBooking(ID), { statusCode: 503, message: "Booking service request timed out" });
  stubFetch(t, async () => { throw new Error("ECONNREFUSED"); });
  await assert.rejects(client.getBooking(ID), { statusCode: 503, message: "Booking service is temporarily unavailable" });
});

test("an invalid id never reaches fetch", async (t) => {
  const fetchMock = stubFetch(t, async () => reply({}));
  await assert.rejects(client.getUser("../x"), { statusCode: 400 });
  assert.equal(fetchMock.mock.callCount(), 0);
});
