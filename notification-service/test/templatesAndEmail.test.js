// Proves email templates include the booking details and the email provider simulates, sends, or reports failure correctly.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");
const { getBookingConfirmedTemplate, getBookingCompletedTemplate } = require("../services/notificationTemplates");
const { sendEmail } = require("../services/emailProvider");

const booking = { date: "2030-01-15T00:00:00Z", timeSlot: "10-12", address: "12 Main St", paymentMethod: "Razorpay", totalPrice: 499 };

test("confirmed template contains reference, name, address and price", () => {
  const out = getBookingConfirmedTemplate({ recipientName: "Asha", bookingRef: "ABC123", booking, recipientEmail: "a@x.com" });
  assert.match(out.subject, /ABC123/);
  assert.match(out.message, /a@x\.com/);
  for (const text of ["Asha", "12 Main St", "10-12", "₹499", "Razorpay"]) assert.ok(out.html.includes(text), text);
});

test("confirmed template falls back to defaults when details are missing", () => {
  const out = getBookingConfirmedTemplate({ recipientName: "A", bookingRef: "R", booking: {}, recipientEmail: "e" });
  assert.match(out.html, /As scheduled/);
  assert.match(out.message, /scheduled date/);
});

test("completed template says the service is completed", () => {
  const out = getBookingCompletedTemplate({ recipientName: "Asha", bookingRef: "ABC123", booking });
  assert.match(out.subject, /Service Completed/);
  assert.match(out.message, /COMPLETED/);
  assert.match(out.html, /12 Main St/);
  const bare = getBookingCompletedTemplate({ recipientName: "A", bookingRef: "R", booking: {} });
  assert.match(bare.html, /Completed/);
});

test("sendEmail only simulates when SMTP settings are missing", async () => {
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
  assert.deepEqual(await sendEmail({ to: "a@b.com", subject: "s", html: "h" }), { simulated: true, success: true });
});

test("sendEmail sends through the transporter and copies the sender for dummy addresses", async (t) => {
  process.env.EMAIL_USER = "sender@gmail.com";
  process.env.EMAIL_PASS = "pw";
  const sendMail = async (message) => ({ messageId: "m1", message });
  const calls = [];
  t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async (m) => { calls.push(m); return sendMail(m); } }));
  try {
    const real = await sendEmail({ to: "customer@gmail.com", subject: "s", html: "h" });
    assert.deepEqual([real.success, real.simulated, real.messageId], [true, false, "m1"]);
    assert.equal(calls[0].to, "customer@gmail.com");
    await sendEmail({ to: "x@example.com", subject: "s", html: "h" });
    assert.equal(calls[1].to, "x@example.com, sender@gmail.com");
    assert.match(calls[1].from, /sender@gmail\.com/);
  } finally {
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
  }
});

test("sendEmail returns success=false when delivery throws", async (t) => {
  process.env.EMAIL_USER = "sender@gmail.com";
  process.env.EMAIL_PASS = "pw";
  t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async () => { throw new Error("SMTP down"); } }));
  try {
    assert.deepEqual(await sendEmail({ to: "a@b.com", subject: "s", html: "h" }), { simulated: true, success: false, error: "SMTP down" });
  } finally {
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
  }
});

test("sendEmail copies every email to NOTIFICATION_BCC, except people already addressed", async (t) => {
  process.env.EMAIL_USER = "sender@gmail.com";
  process.env.EMAIL_PASS = "pw";
  process.env.NOTIFICATION_BCC = " admin@x.com , ops@x.com ";
  const calls = [];
  t.mock.method(nodemailer, "createTransport", () => ({ sendMail: async (m) => { calls.push(m); return { messageId: "m" }; } }));
  try {
    await sendEmail({ to: "customer@gmail.com", subject: "s", html: "h" });
    assert.equal(calls[0].bcc, "admin@x.com, ops@x.com");
    await sendEmail({ to: "admin@x.com", subject: "s", html: "h" }); // already the recipient: not copied to itself
    assert.equal(calls[1].bcc, "ops@x.com");
    delete process.env.NOTIFICATION_BCC;
    await sendEmail({ to: "customer@gmail.com", subject: "s", html: "h" });
    assert.equal("bcc" in calls[2], false);
  } finally {
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.NOTIFICATION_BCC;
  }
});
