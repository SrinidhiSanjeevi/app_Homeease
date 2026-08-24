const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const User = require("../models/User");
const metrics = require("../metrics");
const nodemailer = require("nodemailer");

// ─── Real Email Transporter (Gmail) ───────────────────────────────────────────
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * Sends a real email via Gmail SMTP.
 * Falls back gracefully if EMAIL_USER / EMAIL_PASS are not set.
 */
const sendRealEmail = async ({ to, subject, html }) => {
  const transporter = createTransporter();
  if (!transporter) {
    console.log("📧 [Email Simulation] No SMTP config — email logged only.");
    return { simulated: true };
  }
  try {
    // Determine target recipients.
    // If the recipient email uses dummy domain (@homeease.com, @example.com), 
    // include process.env.EMAIL_USER so a copy lands in the real inbox!
    const recipients = new Set([to]);
    if ((to.endsWith("@homeease.com") || to.endsWith("@example.com") || to.includes("dummy")) && process.env.EMAIL_USER) {
      recipients.add(process.env.EMAIL_USER);
    }

    const recipientList = Array.from(recipients).join(", ");

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `ServiceXpress <${process.env.EMAIL_USER}>`,
      to: recipientList,
      subject,
      html,
    });
    console.log(`📧 [Real Email Sent] To: ${recipientList} | MsgId: ${info.messageId}`);
    return { simulated: false, messageId: info.messageId };
  } catch (err) {
    console.error("📧 [Email Error]", err.message);
    return { simulated: true, error: err.message };
  }
};

/**
 * Simulates Payment handling:
 * - Cash / Cash on Delivery: Always successful (collected in person at service time).
 * - Online (UPI / Card / Razorpay): 95% random success simulation.
 */
const processPaymentSimulation = async (booking, userId, amount, method = "Simulated Payment") => {
  const isCash = method === "Cash" || method === "Cash on Delivery";

  // Cash always succeeds; Online has 95% success rate
  const isSuccess = isCash ? true : Math.random() >= 0.05;
  const status = isSuccess ? "Success" : "Failure";
  const transactionId = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const payment = await Payment.create({
    booking: booking._id,
    user: userId,
    amount: amount || booking.totalPrice,
    status,
    paymentMethod: isCash ? "Cash on Delivery" : method,
    transactionId,
    failureReason: isSuccess ? "" : "Online Gateway Timeout / Card Declined (Simulated)"
  });

  if (!isSuccess && metrics && metrics.paymentFailures) {
    metrics.paymentFailures.inc();
  } else if (isSuccess && metrics && metrics.paymentSuccess) {
    metrics.paymentSuccess.inc();
  }

  return { success: isSuccess, payment };
};

/**
 * Sends a single Email Notification upon booking confirmation.
 * Also sends a real Gmail email if EMAIL_USER / EMAIL_PASS are configured.
 */
const processNotificationSimulation = async (booking, userId) => {
  const userDoc = await User.findById(userId).lean();
  const recipientEmail = userDoc?.email || "customer@homeease.com";
  const recipientName  = userDoc?.name  || "Customer";
  const bookingRef     = booking._id.toString().slice(-6).toUpperCase();

  const message = `Email Confirmation: Booking #${bookingRef} confirmed for ${recipientEmail}. Service date: ${booking.date ? new Date(booking.date).toLocaleDateString() : "scheduled date"}.`;

  // Send real Gmail email — Booking Confirmation
  await sendRealEmail({
    to: recipientEmail,
    subject: `✅ Booking Confirmed — ServiceXpress #${bookingRef}`,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 36px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:26px;letter-spacing:-0.5px;">ServiceXpress</h1>
          <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">Your trusted home service platform</p>
        </div>
        <!-- Body -->
        <div style="padding:32px 36px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;background:#dcfce7;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:30px;">✅</div>
            <h2 style="color:#111827;margin:12px 0 4px;">Booking Confirmed!</h2>
            <p style="color:#6b7280;margin:0;font-size:14px;">Hi <strong>${recipientName}</strong>, your service has been booked successfully.</p>
          </div>
          <!-- Details Table -->
          <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;font-size:14px;margin-bottom:24px;">
            <tr style="background:#f3f4f6;"><td style="padding:12px 16px;font-weight:700;color:#374151;width:40%;">Booking ID</td><td style="padding:12px 16px;color:#6366f1;font-weight:700;">#${bookingRef}</td></tr>
            <tr style="background:#ffffff;"><td style="padding:12px 16px;font-weight:700;color:#374151;">Service Date</td><td style="padding:12px 16px;color:#111827;">${booking.date ? new Date(booking.date).toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" }) : "As scheduled"}</td></tr>
            <tr style="background:#f3f4f6;"><td style="padding:12px 16px;font-weight:700;color:#374151;">Time Slot</td><td style="padding:12px 16px;color:#111827;">${booking.timeSlot || "As scheduled"}</td></tr>
            <tr style="background:#ffffff;"><td style="padding:12px 16px;font-weight:700;color:#374151;">Service Address</td><td style="padding:12px 16px;color:#111827;">${booking.address || "—"}</td></tr>
            <tr style="background:#f3f4f6;"><td style="padding:12px 16px;font-weight:700;color:#374151;">Payment Method</td><td style="padding:12px 16px;color:#111827;">${booking.paymentMethod || "Online Payment"}</td></tr>
            <tr style="background:#ffffff;"><td style="padding:12px 16px;font-weight:700;color:#374151;">Total Amount</td><td style="padding:12px 16px;color:#16a34a;font-weight:700;font-size:16px;">₹${booking.totalPrice}</td></tr>
          </table>
          <p style="color:#374151;font-size:14px;line-height:1.6;">A verified professional has been assigned and will arrive at your address on the scheduled date. You can track your booking status anytime through the ServiceXpress app.</p>
        </div>
        <!-- Footer -->
        <div style="background:#f9fafb;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:12px;margin:0;">© ${new Date().getFullYear()} ServiceXpress. All rights reserved.</p>
          <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">This is an automated email — please do not reply.</p>
        </div>
      </div>
    `,
  });

  // Save single Email notification record to DB
  const notificationDoc = await Notification.create({
    booking: booking._id,
    user: userId,
    type: "Email",
    status: "Success",
    recipient: recipientEmail,
    message
  });

  if (metrics && metrics.notificationSuccess) metrics.notificationSuccess.inc();

  return [notificationDoc];
};


/**
 * Dispatches Service Completion Email to the customer's real email address.
 */
const processCompletionEmailNotification = async (booking, userId) => {
  try {
    const userDoc = await User.findById(userId).lean();
    const recipientEmail = userDoc?.email || "customer@homeease.com";
    const recipientName  = userDoc?.name  || "Customer";
    const bookingRef     = booking._id.toString().slice(-6).toUpperCase();

    // ── Send real completion email ───────────────────────────────
    await sendRealEmail({
      to: recipientEmail,
      subject: `🎉 Service Completed — ServiceXpress #${bookingRef}`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:32px 36px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:26px;letter-spacing:-0.5px;">ServiceXpress</h1>
            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">Your trusted home service platform</p>
          </div>
          <!-- Body -->
          <div style="padding:32px 36px;">
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-block;background:#dcfce7;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:30px;">🎉</div>
              <h2 style="color:#111827;margin:12px 0 4px;">Service Successfully Completed!</h2>
              <p style="color:#6b7280;margin:0;font-size:14px;">Hi <strong>${recipientName}</strong>, thank you for choosing ServiceXpress.</p>
            </div>
            <!-- Status Banner -->
            <div style="background:#dcfce7;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;text-align:center;margin-bottom:24px;">
              <span style="color:#15803d;font-weight:700;font-size:16px;">✅ Status: COMPLETED</span>
            </div>
            <!-- Details Table -->
            <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;font-size:14px;margin-bottom:24px;">
              <tr style="background:#f3f4f6;"><td style="padding:12px 16px;font-weight:700;color:#374151;width:40%;">Booking ID</td><td style="padding:12px 16px;color:#6366f1;font-weight:700;">#${bookingRef}</td></tr>
              <tr style="background:#ffffff;"><td style="padding:12px 16px;font-weight:700;color:#374151;">Service Date</td><td style="padding:12px 16px;color:#111827;">${booking.date ? new Date(booking.date).toLocaleDateString("en-IN", { weekday:"long", year:"numeric", month:"long", day:"numeric" }) : "Completed"}</td></tr>
              <tr style="background:#f3f4f6;"><td style="padding:12px 16px;font-weight:700;color:#374151;">Service Address</td><td style="padding:12px 16px;color:#111827;">${booking.address || "—"}</td></tr>
              <tr style="background:#ffffff;"><td style="padding:12px 16px;font-weight:700;color:#374151;">Payment Method</td><td style="padding:12px 16px;color:#111827;">${booking.paymentMethod || "—"}</td></tr>
              <tr style="background:#f3f4f6;"><td style="padding:12px 16px;font-weight:700;color:#374151;">Total Amount Paid</td><td style="padding:12px 16px;color:#16a34a;font-weight:700;font-size:16px;">₹${booking.totalPrice}</td></tr>
            </table>
            <p style="color:#374151;font-size:14px;line-height:1.6;">We hope you had a great experience! Your feedback matters — please leave a rating and review in the app to help us serve you better.</p>
            <div style="text-align:center;margin-top:20px;">
              <p style="color:#6b7280;font-size:13px;">Thank you for trusting ServiceXpress. 🙏</p>
            </div>
          </div>
          <!-- Footer -->
          <div style="background:#f9fafb;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© ${new Date().getFullYear()} ServiceXpress. All rights reserved.</p>
            <p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">This is an automated email — please do not reply.</p>
          </div>
        </div>
      `,
    });

    const completionNotification = await Notification.create({
      booking: booking._id,
      user: userId,
      type: "Email",
      status: "Success",
      recipient: recipientEmail,
      message: `Service Completed: Dear ${recipientName}, your service #${bookingRef} has been marked COMPLETED. Thank you for using ServiceXpress!`
    });

    if (metrics && metrics.notificationSuccess) metrics.notificationSuccess.inc();

    return completionNotification;
  } catch (err) {
    if (metrics && metrics.notificationFailures) metrics.notificationFailures.inc();
    console.error("Completion email notification error:", err);
  }
};

module.exports = {
  processPaymentSimulation,
  processNotificationSimulation,
  processCompletionEmailNotification
};
