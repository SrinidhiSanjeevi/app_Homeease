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

// Mail that is HTML-only scores worse with spam filters, so every message also carries a plain-text version.
const htmlToText = (html = "") =>
  String(html)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(tr|p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

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
      from: process.env.EMAIL_FROM || `HomeEase <${process.env.EMAIL_USER}>`,
      to: recipientList,
      ...(bcc.length ? { bcc: bcc.join(", ") } : {}),
      replyTo: process.env.EMAIL_USER,
      subject,
      html,
      text: htmlToText(html)
    });

    logger.info({ to: recipientList, messageId: info.messageId }, "[EmailProvider] Real email delivered successfully");
    return { simulated: false, success: true, messageId: info.messageId };
  } catch (err) {
    logger.error({ error: err.message, to }, "[EmailProvider] Delivery failure");
    return { simulated: true, success: false, error: err.message };
  }
};

module.exports = { sendEmail };
