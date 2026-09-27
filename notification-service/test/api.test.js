// HTTP-level tests for the notification-service Express app. No database is
// needed: NODE_ENV=test makes server.js skip connectDB, the scheduler and
// app.listen, and every route tested here answers before touching MongoDB
// (health, internal-auth, validation, 404, CORS, metrics).
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent";
delete process.env.INTERNAL_SERVICE_TOKEN;

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../server");

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const post = (path, body, headers = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });

test("GET /health/live returns ok without a database", async () => {
  const res = await fetch(`${base}/health/live`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.service, "homeease-notification-service");
});

test("GET /health/ready reports 503 while MongoDB is not connected", async () => {
  const res = await fetch(`${base}/health/ready`);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).db, "disconnected");
});

test("GET /api/health reports degraded while MongoDB is not connected", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.status, "degraded");
  assert.equal(body.db, "disconnected");
});

test("GET / returns the service banner", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "HomeEase Notification Service Running");
});

test("GET /metrics exposes HTTP and notification metrics", async () => {
  const res = await fetch(`${base}/metrics`);
  assert.equal(res.status, 200);
  const text = await res.text();
  for (const name of [
    "http_requests_total",
    "http_request_duration_seconds_bucket",
    "serviceexpress_notification_success_total",
    "serviceexpress_notification_failures_total"
  ]) {
    assert.ok(text.includes(name), `missing metric ${name}`);
  }
});

test("POST /api/internal/notifications/dispatch rejects a missing type", async () => {
  const res = await post("/api/internal/notifications/dispatch", {
    bookingId: "66f0c0ffee0000000000abcd",
    userId: "66f0c0ffee0000000000abce"
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.match(body.message, /notification type/i);
});

test("POST /api/internal/notifications/dispatch rejects an unknown type", async () => {
  const res = await post("/api/internal/notifications/dispatch", {
    type: "NOT_A_REAL_TYPE",
    bookingId: "66f0c0ffee0000000000abcd",
    userId: "66f0c0ffee0000000000abce"
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /notification type/i);
});

test("POST /api/internal/notifications/dispatch rejects an invalid bookingId", async () => {
  const res = await post("/api/internal/notifications/dispatch", {
    type: "BOOKING_CREATED",
    bookingId: "not-an-object-id",
    userId: "66f0c0ffee0000000000abce"
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /bookingId/i);
});

test("POST /api/internal/notifications/dispatch rejects an invalid userId", async () => {
  const res = await post("/api/internal/notifications/dispatch", {
    type: "BOOKING_CREATED",
    bookingId: "66f0c0ffee0000000000abcd",
    userId: "not-an-object-id"
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /userId/i);
});

test("GET /api/internal/notifications/booking/:bookingId rejects an invalid id", async () => {
  const res = await fetch(`${base}/api/internal/notifications/booking/not-an-object-id`);
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /invalid booking id/i);
});

test("internal routes are reachable without X-Internal-Token when INTERNAL_SERVICE_TOKEN is unset", async () => {
  // Reaches the route handler (proven by getting a 400 from validation,
  // not a 401 from requireInternalToken) even with no auth header at all.
  const res = await post("/api/internal/notifications/dispatch", {});
  assert.equal(res.status, 400);
});

test("route label in metrics is bounded, not the raw path", async () => {
  // Not a valid ObjectId, so this 400s on validation — no mongo lookup,
  // no buffering timeout waiting on a database that isn't connected.
  const rawId = "not-a-real-object-id-00000000";
  await fetch(`${base}/api/internal/notifications/booking/${rawId}`);
  const text = await (await fetch(`${base}/metrics`)).text();
  assert.ok(!text.includes(rawId), "raw id leaked into a metric label");
});

test("unknown routes return a JSON 404", async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.match(body.message, /not found/i);
});

test("CORS allows a known dev origin", async () => {
  const res = await fetch(`${base}/health/live`, { headers: { Origin: "http://localhost:5173" } });
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
});

test("CORS does not reflect an arbitrary origin", async () => {
  const res = await fetch(`${base}/health/live`, { headers: { Origin: "https://evil.example" } });
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});
