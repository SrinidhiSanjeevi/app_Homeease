process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:1/homeease-test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "silent";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const app = require("../server");

let server;
let base;

before(async () => {
  mongoose.set("bufferCommands", false);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const json = (path, body) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("GET /health/live returns ok without a database", async () => {
  const res = await fetch(`${base}/health/live`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.service, "homeease-backend");
});

test("GET /health/ready reports 503 while MongoDB is not connected", async () => {
  const res = await fetch(`${base}/health/ready`);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).db, "disconnected");
});

test("POST /api/auth/signup rejects an empty body with field errors", async () => {
  const res = await json("/api/auth/signup", {});
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(Array.isArray(body.errors) && body.errors.length > 0);
});

test("POST /api/auth/signup rejects a weak password", async () => {
  const res = await json("/api/auth/signup", { name: "Test User", email: "test@example.com", password: "short" });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.errors.some((e) => e.field === "password"));
});

test("POST /api/auth/login rejects an invalid email", async () => {
  const res = await json("/api/auth/login", { email: "not-an-email", password: "Whatever123" });
  assert.equal(res.status, 400);
});

test("booking endpoints require a bearer token", async () => {
  const res = await fetch(`${base}/api/bookings/my-bookings`);
  assert.equal(res.status, 401);
  assert.match((await res.json()).message, /no token/i);
});

test("booking endpoints reject a forged token", async () => {
  const res = await fetch(`${base}/api/bookings/my-bookings`, { headers: { Authorization: "Bearer not.a.jwt" } });
  assert.equal(res.status, 401);
});

test("GET /metrics exposes the HTTP and business metrics Grafana uses", async () => {
  const res = await fetch(`${base}/metrics`);
  assert.equal(res.status, 200);
  const text = await res.text();
  for (const name of [
    "http_requests_total",
    "http_request_duration_seconds_bucket",
    "serviceexpress_bookings_by_status",
    "serviceexpress_professional_assignment_time_seconds_bucket",
    "serviceexpress_booking_latency_seconds_bucket"
  ]) {
    assert.ok(text.includes(name), `missing metric ${name}`);
  }
});

test("unmatched requests get a bounded route label, not the raw path", async () => {
  await fetch(`${base}/api/bookings/66f0c0ffee0000000000abcd/cancel`, { method: "PUT" }); // 401 before a route matches
  const text = await (await fetch(`${base}/metrics`)).text();
  assert.ok(!text.includes("66f0c0ffee0000000000abcd"), "raw id leaked into a metric label");
  assert.ok(text.includes('route="/api/bookings/*"'));
});

test("unknown routes return a JSON 404", async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).success, false);
});
