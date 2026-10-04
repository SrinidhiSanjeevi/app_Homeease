// Proves the notification outbox: idempotent enqueue, claim-and-send, bounded retries with backoff, and the sweeper.
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const Notification = require("../models/Notification");
const bookingClient = require("../services/bookingServiceClient");

// The service destructures sendEmail when it loads, so swap the email module BEFORE requiring the service.
const emailPath = require.resolve("../services/emailProvider");
let emailImpl = async () => ({ success: true });
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: { sendEmail: (...args) => emailImpl(...args) } };
const service = require("../services/notificationService");

const BOOKING_ID = "64b7f0c2a1b2c3d4e5f60718";
const USER_ID = "64b7f0c2a1b2c3d4e5f60719";

// A claimed notification document with a spy-able save().
const pendingDoc = (overrides = {}) => ({
  _id: "n1", booking: BOOKING_ID, notificationType: "BOOKING_CONFIRMED", recipient: "a@x.com",
  attempts: 1, maxAttempts: 3, status: "Processing", save: async function () { return this; }, ...overrides
});

function stubEmail(t, result) {
  const sendEmail = t.mock.fn(async () => result);
  emailImpl = sendEmail;
  t.after(() => { emailImpl = async () => ({ success: true }); });
  return sendEmail;
}

test("resolveTemplateData picks the template by type and falls back to a generic message", () => {
  const booking = { _id: BOOKING_ID, totalPrice: 10 };
  assert.match(service.resolveTemplateData("BOOKING_CONFIRMED", booking, "A", "a@x.com").subject, /Confirmed/);
  assert.match(service.resolveTemplateData("BOOKING_COMPLETED", booking, "A", "a@x.com").subject, /Completed/);
  const generic = service.resolveTemplateData("PAYMENT_SUCCESS", BOOKING_ID, "A", "a@x.com");
  assert.equal(generic.subject, `HomeEase Notification [${BOOKING_ID.slice(-6).toUpperCase()}]`);
});

test("enqueueNotification returns the existing record without creating a duplicate", async (t) => {
  const existing = { _id: "n0", status: "Success" };
  t.mock.method(Notification, "findOne", async (filter) => {
    assert.deepEqual(filter, { idempotencyKey: { $eq: `booking_${BOOKING_ID}_BOOKING_CONFIRMED` } });
    return existing;
  });
  const create = t.mock.method(Notification, "create", async () => assert.fail("must not create"));
  const result = await service.enqueueNotification({ type: "BOOKING_CONFIRMED", booking: BOOKING_ID, userId: USER_ID });
  assert.equal(result, existing);
  assert.equal(create.mock.callCount(), 0);
});

test("enqueueNotification looks up the user and stores a Pending outbox record", async (t) => {
  t.mock.method(Notification, "findOne", async () => null);
  t.mock.method(bookingClient, "getUser", async () => ({ email: "asha@x.com", name: "Asha" }));
  const create = t.mock.method(Notification, "create", async (doc) => ({ _id: "n1", ...doc }));
  const result = await service.enqueueNotification({ type: "BOOKING_CONFIRMED", booking: { _id: BOOKING_ID }, userId: USER_ID });
  const doc = create.mock.calls[0].arguments[0];
  assert.deepEqual([doc.recipient, doc.status, doc.type, doc.attempts, doc.maxAttempts], ["asha@x.com", "Pending", "Email", 0, 3]);
  assert.match(doc.message, /asha@x\.com/);
  assert.equal(result._id, "n1");
});

test("enqueueNotification uses fallback recipient details when the user lookup fails", async (t) => {
  t.mock.method(Notification, "findOne", async () => null);
  t.mock.method(bookingClient, "getUser", async () => { throw new Error("down"); });
  const create = t.mock.method(Notification, "create", async (doc) => doc);
  await service.enqueueNotification({ type: "BOOKING_COMPLETED", booking: BOOKING_ID, userId: USER_ID });
  assert.equal(create.mock.calls[0].arguments[0].recipient, "customer@homeease.com");
  create.mock.restore();
  const explicit = t.mock.method(Notification, "create", async (doc) => doc);
  await service.enqueueNotification({ type: "BOOKING_COMPLETED", booking: BOOKING_ID, userId: USER_ID, recipientEmail: "e@x.com", recipientName: "E" });
  assert.equal(explicit.mock.calls[0].arguments[0].recipient, "e@x.com");
});

test("enqueueNotification returns null instead of throwing when the database fails", async (t) => {
  t.mock.method(Notification, "findOne", async () => { throw new Error("db"); });
  assert.equal(await service.enqueueNotification({ type: "X", booking: BOOKING_ID, userId: USER_ID }), null);
});

test("processNotification marks a delivered email as Success", async (t) => {
  const doc = pendingDoc();
  t.mock.method(Notification, "findOneAndUpdate", async () => doc);
  t.mock.method(bookingClient, "getBooking", async () => ({ _id: BOOKING_ID, totalPrice: 5 }));
  const send = stubEmail(t, { success: true });
  const result = await service.processNotification("n1");
  assert.equal(result.status, "Success");
  assert.ok(result.processedAt instanceof Date);
  assert.equal(send.mock.calls[0].arguments[0].to, "a@x.com");
});

test("processNotification still sends when the booking lookup fails", async (t) => {
  t.mock.method(Notification, "findOneAndUpdate", async () => pendingDoc({ notificationType: "SOMETHING_ELSE" }));
  t.mock.method(bookingClient, "getBooking", async () => { throw new Error("down"); });
  stubEmail(t, { success: true });
  assert.equal((await service.processNotification("n1")).status, "Success");
});

test("processNotification schedules a retry with exponential backoff after a failed send", async (t) => {
  const doc = pendingDoc({ attempts: 2 });
  t.mock.method(Notification, "findOneAndUpdate", async () => doc);
  t.mock.method(bookingClient, "getBooking", async () => ({ _id: BOOKING_ID }));
  stubEmail(t, { success: false, error: "smtp" });
  const before = Date.now();
  const result = await service.processNotification("n1");
  assert.equal(result.status, "Pending");
  assert.equal(result.lastError, "smtp");
  const delay = result.nextRetryAt.getTime() - before;
  assert.ok(delay >= 3900 && delay < 6000, `expected ~4s backoff, got ${delay}`);
});

test("processNotification gives up with Failure after the last attempt", async (t) => {
  const doc = pendingDoc({ attempts: 3 });
  t.mock.method(Notification, "findOneAndUpdate", async () => doc);
  t.mock.method(bookingClient, "getBooking", async () => ({ _id: BOOKING_ID }));
  stubEmail(t, { success: false });
  const result = await service.processNotification("n1");
  assert.deepEqual([result.status, result.nextRetryAt, result.lastError], ["Failure", null, "Max retry attempts reached"]);
});

test("processNotification does not resend notifications that are done or cannot be claimed", async (t) => {
  t.mock.method(Notification, "findOneAndUpdate", async () => null);
  const find = t.mock.method(Notification, "findById", async () => ({ status: "Sent" }));
  const send = stubEmail(t, { success: true });
  assert.equal((await service.processNotification("n1")).status, "Sent");
  find.mock.restore();
  t.mock.method(Notification, "findById", async () => ({ status: "Processing" }));
  assert.equal((await service.processNotification("n1")).status, "Processing");
  Notification.findById.mock.restore();
  t.mock.method(Notification, "findById", async () => null);
  assert.equal(await service.processNotification("n1"), null);
  assert.equal(send.mock.callCount(), 0);
});

test("processNotification returns null on unexpected errors", async (t) => {
  t.mock.method(Notification, "findOneAndUpdate", async () => { throw new Error("db"); });
  assert.equal(await service.processNotification("n1"), null);
});

test("processPendingOutbox processes due notifications and skips ones that fail", async (t) => {
  const limit = t.mock.fn(async () => [{ _id: "a" }, { _id: "b" }]);
  t.mock.method(Notification, "find", () => ({ limit }));
  let n = 0;
  t.mock.method(Notification, "findOneAndUpdate", async () => (n++ === 0 ? null : pendingDoc()));
  t.mock.method(Notification, "findById", async () => null);
  t.mock.method(bookingClient, "getBooking", async () => ({ _id: BOOKING_ID }));
  stubEmail(t, { success: true });
  const results = await service.processPendingOutbox({ limit: 5 });
  assert.equal(limit.mock.calls[0].arguments[0], 5);
  assert.equal(results.length, 1);
});

test("processPendingOutbox returns an empty list when the query fails", async (t) => {
  t.mock.method(Notification, "find", () => { throw new Error("db"); });
  assert.deepEqual(await service.processPendingOutbox(), []);
});

test("dispatchNotification enqueues, then sends only Pending records", async (t) => {
  t.mock.method(Notification, "findOne", async () => null);
  t.mock.method(bookingClient, "getUser", async () => ({}));
  t.mock.method(Notification, "create", async (doc) => ({ _id: "n1", ...doc }));
  t.mock.method(Notification, "findOneAndUpdate", async () => pendingDoc());
  t.mock.method(bookingClient, "getBooking", async () => ({ _id: BOOKING_ID }));
  stubEmail(t, { success: true });
  assert.equal((await service.dispatchNotification({ type: "BOOKING_CONFIRMED", booking: BOOKING_ID, userId: USER_ID })).status, "Success");

  Notification.findOne.mock.restore();
  t.mock.method(Notification, "findOne", async () => ({ _id: "old", status: "Success" }));
  assert.equal((await service.dispatchNotification({ type: "BOOKING_CONFIRMED", booking: BOOKING_ID, userId: USER_ID })).status, "Success");
});

// ─── Provider (service partner) notifications ────────────────────────────────
const { getProfessionalNewJobTemplate } = require("../services/notificationTemplates");

test("provider template shows the job details and escapes untrusted text", () => {
  const out = getProfessionalNewJobTemplate({
    recipientName: "<b>Ravi</b>",
    bookingRef: "ABC123",
    booking: { date: "2030-01-15T00:00:00Z", timeSlot: "10-12", address: "<script>x</script> 12 Main St", contactNumber: "9876543210", totalPrice: 499 }
  });
  assert.match(out.subject, /New job assigned.*ABC123/);
  for (const text of ["#ABC123", "10-12", "9876543210", "₹499", "&lt;b&gt;Ravi&lt;/b&gt;"]) assert.ok(out.html.includes(text), text);
  assert.ok(!out.html.includes("<script>"), "address must be HTML-escaped");
  assert.match(getProfessionalNewJobTemplate({ recipientName: "R", bookingRef: "R", booking: {} }).html, /As scheduled/);
});

test("resolveTemplateData routes PROFESSIONAL_NEW_JOB to the provider template", () => {
  const out = service.resolveTemplateData("PROFESSIONAL_NEW_JOB", { _id: BOOKING_ID }, "Ravi", "r@x.com");
  assert.match(out.subject, /New job assigned/);
});

test("provider notification goes to the professional's own email without looking up the customer", async (t) => {
  t.mock.method(Notification, "findOne", async () => null);
  const getUser = t.mock.method(bookingClient, "getUser", async () => assert.fail("must not look up the customer"));
  const create = t.mock.method(Notification, "create", async (doc) => doc);
  await service.enqueueNotification({
    type: "PROFESSIONAL_NEW_JOB", booking: BOOKING_ID, userId: USER_ID, recipientEmail: "ravi@x.com", recipientName: "Ravi"
  });
  assert.equal(create.mock.calls[0].arguments[0].recipient, "ravi@x.com");
  assert.equal(getUser.mock.callCount(), 0);
});

test("provider notification falls back to the admin mailbox when the professional has no email", async (t) => {
  t.mock.method(Notification, "findOne", async () => null);
  const create = t.mock.method(Notification, "create", async (doc) => doc);
  const previous = { user: process.env.EMAIL_USER, fallback: process.env.PROVIDER_FALLBACK_EMAIL };
  t.after(() => {
    for (const [k, v] of [["EMAIL_USER", previous.user], ["PROVIDER_FALLBACK_EMAIL", previous.fallback]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  delete process.env.PROVIDER_FALLBACK_EMAIL;
  process.env.EMAIL_USER = "admin-mailbox@gmail.com";
  await service.enqueueNotification({ type: "PROFESSIONAL_NEW_JOB", booking: BOOKING_ID, userId: USER_ID });
  assert.equal(create.mock.calls[0].arguments[0].recipient, "admin-mailbox@gmail.com");

  process.env.PROVIDER_FALLBACK_EMAIL = "ops@gmail.com"; // an explicit fallback wins over the sender mailbox
  await service.enqueueNotification({ type: "PROFESSIONAL_NEW_JOB", booking: BOOKING_ID, userId: USER_ID });
  assert.equal(create.mock.calls[1].arguments[0].recipient, "ops@gmail.com");

  delete process.env.PROVIDER_FALLBACK_EMAIL;
  delete process.env.EMAIL_USER;
  assert.equal(await service.enqueueNotification({ type: "PROFESSIONAL_NEW_JOB", booking: BOOKING_ID, userId: USER_ID }), null);
  assert.equal(create.mock.callCount(), 2);
});

test("the recipient's name is stored and used when sending, so a provider is not greeted as 'Customer'", async (t) => {
  t.mock.method(Notification, "findOne", async () => null);
  const create = t.mock.method(Notification, "create", async (doc) => doc);
  await service.enqueueNotification({
    type: "PROFESSIONAL_NEW_JOB", booking: BOOKING_ID, userId: USER_ID, recipientEmail: "ravi@x.com", recipientName: "Ravi"
  });
  assert.equal(create.mock.calls[0].arguments[0].recipientName, "Ravi");

  const sendEmail = stubEmail(t, { success: true });
  t.mock.method(bookingClient, "getBooking", async () => ({ _id: BOOKING_ID, totalPrice: 10 }));
  const doc = pendingDoc({ notificationType: "PROFESSIONAL_NEW_JOB", recipient: "ravi@x.com", recipientName: "Ravi" });
  t.mock.method(Notification, "findOneAndUpdate", async () => doc);
  await service.processNotification("n1");
  assert.match(sendEmail.mock.calls[0].arguments[0].html, /Hi <strong>Ravi<\/strong>/);
});
