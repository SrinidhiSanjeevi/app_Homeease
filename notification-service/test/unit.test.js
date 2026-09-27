// Pure/unit-level tests for business logic that doesn't need a database or
// network: error shape, email templates, the no-SMTP-configured email path,
// booking-service-client error mapping, and notification type→template
// resolution. Complements test/api.test.js (HTTP layer) and
// test/internalAuth.test.js (auth middleware).
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const AppError = require("../utils/AppError");
const { getBookingConfirmedTemplate, getBookingCompletedTemplate } = require("../services/notificationTemplates");
const { NOTIFICATION_TYPES } = require("../services/notificationTypes");

test("AppError marks 4xx codes as 'fail' and is operational", () => {
  const err = new AppError("Bad input", 400, { field: "email" });
  assert.equal(err.message, "Bad input");
  assert.equal(err.statusCode, 400);
  assert.equal(err.status, "fail");
  assert.equal(err.isOperational, true);
  assert.deepEqual(err.details, { field: "email" });
  assert.ok(err.stack);
});

test("AppError marks 5xx codes as 'error'", () => {
  const err = new AppError("Boom", 503);
  assert.equal(err.status, "error");
});

test("getBookingConfirmedTemplate renders booking details into subject and body", () => {
  const booking = {
    date: "2026-10-01",
    timeSlot: "10:00-12:00",
    address: "221B Baker Street",
    paymentMethod: "Online Payment",
    totalPrice: 999
  };
  const { subject, message, html } = getBookingConfirmedTemplate({
    recipientName: "Asha",
    bookingRef: "ABC123",
    booking,
    recipientEmail: "asha@example.com"
  });

  assert.match(subject, /Booking Confirmed/);
  assert.match(subject, /ABC123/);
  assert.match(message, /asha@example\.com/);
  assert.match(html, /221B Baker Street/);
  assert.match(html, /₹999/);
});

test("getBookingConfirmedTemplate falls back to placeholders when optional fields are missing", () => {
  const { html } = getBookingConfirmedTemplate({
    recipientName: "Asha",
    bookingRef: "ABC123",
    booking: { totalPrice: 500 },
    recipientEmail: "asha@example.com"
  });

  assert.match(html, /As scheduled/);
  assert.match(html, />—</); // address placeholder
});

test("getBookingCompletedTemplate renders a COMPLETED status block", () => {
  const { subject, message, html } = getBookingCompletedTemplate({
    recipientName: "Asha",
    bookingRef: "XYZ789",
    booking: { date: "2026-10-01", address: "Somewhere", paymentMethod: "Cash", totalPrice: 750 },
    recipientEmail: "asha@example.com"
  });

  assert.match(subject, /Service Completed/);
  assert.match(message, /COMPLETED/);
  assert.match(html, /Status: COMPLETED/);
  assert.match(html, /₹750/);
});

test("sendEmail simulates delivery when no SMTP credentials are configured", async () => {
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
  delete require.cache[require.resolve("../services/emailProvider")];
  const { sendEmail } = require("../services/emailProvider");

  const result = await sendEmail({ to: "user@example.com", subject: "Hi", html: "<p>hi</p>" });
  assert.deepEqual(result, { simulated: true, success: true });
});

test("resolveTemplateData maps BOOKING_CONFIRMED to the confirmed template", () => {
  delete require.cache[require.resolve("../services/notificationService")];
  const { resolveTemplateData } = require("../services/notificationService");

  const { subject } = resolveTemplateData(
    NOTIFICATION_TYPES.BOOKING_CONFIRMED,
    { _id: "66f0c0ffee0000000000abcd", totalPrice: 100 },
    "Asha",
    "asha@example.com"
  );
  assert.match(subject, /Booking Confirmed/);
});

test("resolveTemplateData falls back to a generic template for an unmapped type", () => {
  const { resolveTemplateData } = require("../services/notificationService");

  const { subject, message } = resolveTemplateData(
    NOTIFICATION_TYPES.PAYMENT_SUCCESS,
    { _id: "66f0c0ffee0000000000abcd" },
    "Asha",
    "asha@example.com"
  );
  assert.match(subject, /HomeEase Notification/);
  assert.match(message, /Notification for booking 00ABCD/);
});

test("resolveTemplateData maps BOOKING_COMPLETED to the completed template", () => {
  const { resolveTemplateData } = require("../services/notificationService");

  const { subject } = resolveTemplateData(
    NOTIFICATION_TYPES.BOOKING_COMPLETED,
    { _id: "66f0c0ffee0000000000abcd", totalPrice: 100 },
    "Asha",
    "asha@example.com"
  );
  assert.match(subject, /Service Completed/);
});

test("bookingServiceClient.getBooking maps a connection failure to a 503 AppError", async () => {
  // Port 1 refuses connections immediately (no timeout wait) — deterministic
  // in any environment, unlike pointing at a real booking-service.
  process.env.BOOKING_SERVICE_URL = "http://127.0.0.1:1";
  delete require.cache[require.resolve("../services/bookingServiceClient")];
  const bookingServiceClient = require("../services/bookingServiceClient");

  await assert.rejects(
    () => bookingServiceClient.getBooking("66f0c0ffee0000000000abcd"),
    (err) => {
      assert.equal(err.statusCode, 503);
      assert.equal(err.isOperational, true);
      return true;
    }
  );
});

test("bookingServiceClient.getBooking returns the booking on a successful response", async (t) => {
  delete require.cache[require.resolve("../services/bookingServiceClient")];
  const bookingServiceClient = require("../services/bookingServiceClient");

  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ booking: { _id: "66f0c0ffee0000000000abcd", totalPrice: 500 } })
  }));

  const booking = await bookingServiceClient.getBooking("66f0c0ffee0000000000abcd");
  assert.deepEqual(booking, { _id: "66f0c0ffee0000000000abcd", totalPrice: 500 });
});

test("bookingServiceClient.getUser returns the user on a successful response", async (t) => {
  delete require.cache[require.resolve("../services/bookingServiceClient")];
  const bookingServiceClient = require("../services/bookingServiceClient");

  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ user: { _id: "66f0c0ffee0000000000abce", email: "a@example.com" } })
  }));

  const user = await bookingServiceClient.getUser("66f0c0ffee0000000000abce");
  assert.deepEqual(user, { _id: "66f0c0ffee0000000000abce", email: "a@example.com" });
});

test("bookingServiceClient.getBooking rethrows an operational AppError for a non-ok response", async (t) => {
  delete require.cache[require.resolve("../services/bookingServiceClient")];
  const bookingServiceClient = require("../services/bookingServiceClient");

  t.mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 404,
    json: async () => ({ message: "Booking not found" })
  }));

  await assert.rejects(
    () => bookingServiceClient.getBooking("66f0c0ffee0000000000abcd"),
    (err) => {
      assert.equal(err.statusCode, 404);
      assert.equal(err.isOperational, true);
      assert.equal(err.message, "Booking not found");
      return true;
    }
  );
});
