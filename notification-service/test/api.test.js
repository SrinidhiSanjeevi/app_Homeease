// HTTP-level tests for the notification-service Express app. No database is
// needed: NODE_ENV=test makes server.js skip connectDB, the scheduler and
// app.listen, and every route tested here answers before touching MongoDB
// (health, internal-auth, validation, 404, CORS, metrics).
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent";
delete process.env.INTERNAL_SERVICE_TOKEN;

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const app = require("../server");
const Notification = require("../models/Notification");
const bookingServiceClient = require("../services/bookingServiceClient");

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

// ─── Controller success/error branches ────────────────────────────────────
//
// The tests above only ever reach the controllers' validation `return`s
// (400s) — never the line that actually calls the service or the
// try/catch's error branch. dispatchNotification/Notification.find are
// destructured or referenced through singletons the controller shares with
// this test file (mongoose, the Notification model), so mocking them here
// with node:test's TestContext tracker (auto-restored after each test)
// drives the real controller code through its 202/200 and 500 branches too.

test("POST /api/internal/notifications/dispatch returns 202 with the enqueued+delivered notification", async (t) => {
  t.mock.method(Notification, "findOne", async () => null);
  const created = {
    _id: "notif-1",
    status: "Pending",
    recipient: "asha@example.com",
    attempts: 0,
    maxAttempts: 3,
    save: async function () { return this; }
  };
  t.mock.method(Notification, "create", async () => created);
  t.mock.method(Notification, "findOneAndUpdate", async () => created);
  t.mock.method(bookingServiceClient, "getBooking", async () => ({ _id: "66f0c0ffee0000000000abcd" }));

  process.env.EMAIL_USER = "ci@example.com";
  process.env.EMAIL_PASS = "app-password";
  t.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async () => ({ messageId: "msg-1" })
  }));

  const res = await post("/api/internal/notifications/dispatch", {
    type: "BOOKING_CREATED",
    bookingId: "66f0c0ffee0000000000abcd",
    userId: "66f0c0ffee0000000000abce"
  });

  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.notification.status, "Success");

  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
});

test("POST /api/internal/notifications/dispatch returns a generic 500 on an unexpected internal error", async (t) => {
  t.mock.method(mongoose.Types.ObjectId, "isValid", () => {
    throw new Error("internal validator exploded");
  });

  const res = await post("/api/internal/notifications/dispatch", {
    type: "BOOKING_CREATED",
    bookingId: "66f0c0ffee0000000000abcd",
    userId: "66f0c0ffee0000000000abce"
  });

  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.message, "Something went wrong, please try again");
  assert.ok(!body.message.includes("internal validator exploded"), "internal error details must not leak to the client");
});

test("GET /api/internal/notifications/booking/:bookingId returns 200 with the booking's notifications", async (t) => {
  const fakeDocs = [{ _id: "notif-1", status: "Success" }];
  t.mock.method(Notification, "find", () => ({
    sort: () => ({ lean: async () => fakeDocs })
  }));

  const res = await fetch(`${base}/api/internal/notifications/booking/66f0c0ffee0000000000abcd`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.notifications, fakeDocs);
});

test("GET /api/internal/notifications/booking/:bookingId returns a generic 500 when the query fails", async (t) => {
  t.mock.method(Notification, "find", () => {
    throw new Error("mongo connection dropped");
  });

  const res = await fetch(`${base}/api/internal/notifications/booking/66f0c0ffee0000000000abcd`);
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.message, "Something went wrong, please try again");
});
