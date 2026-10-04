const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

const sendEmail = async ({ to, subject, html }) => {
  const transporter = createTransporter();
  if (!transporter) {
    logger.info({ to, subject }, "[EmailProvider] No SMTP config — email simulated/logged only");
    return { simulated: true, success: true };
  }

  try {
    const recipients = new Set([to]);
    if (
      (to.endsWith("@homeease.com") || to.endsWith("@example.com") || to.includes("dummy")) &&
      process.env.EMAIL_USER
    ) {
      recipients.add(process.env.EMAIL_USER);
    }
    const recipientList = Array.from(recipients).join(", ");

    // Optional audit/ops copy of every email (comma-separated), skipping anyone already addressed directly.
    const bcc = (process.env.NOTIFICATION_BCC || "")
      .split(",")
      .map((address) => address.trim())
      .filter((address) => address && !recipients.has(address));

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `ServiceXpress <${process.env.EMAIL_USER}>`,
      to: recipientList,
      ...(bcc.length ? { bcc: bcc.join(", ") } : {}),
      subject,
      html
    });

    logger.info({ to: recipientList, messageId: info.messageId }, "[EmailProvider] Real email delivered successfully");
    return { simulated: false, success: true, messageId: info.messageId };
  } catch (err) {
    logger.error({ error: err.message, to }, "[EmailProvider] Delivery failure");
    return { simulated: true, success: false, error: err.message };
  }
};

module.exports = { sendEmail };
