/**
 * Quick Email Test — run with: node testEmail.js
 * Tests if the Gmail SMTP config in .env is working correctly.
 */
require("dotenv").config();
const nodemailer = require("nodemailer");

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM;

console.log("\n🔍 Checking email config...");
console.log("EMAIL_USER:", EMAIL_USER);
console.log("EMAIL_PASS:", EMAIL_PASS ? "✅ Set (" + EMAIL_PASS.length + " chars)" : "❌ NOT SET");
console.log("EMAIL_FROM:", EMAIL_FROM);

if (!EMAIL_USER || !EMAIL_PASS) {
  console.error("\n❌ EMAIL_USER or EMAIL_PASS is missing in .env — cannot send email.");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

console.log("\n📡 Verifying SMTP connection with Gmail...");
transporter.verify((err, success) => {
  if (err) {
    console.error("\n❌ SMTP Verification FAILED:");
    console.error("   Reason:", err.message);
    console.error("\n   Fix: Make sure:");
    console.error("   1. EMAIL_PASS is the 16-char App Password (not your regular Gmail password)");
    console.error("   2. 2-Step Verification is enabled on the Gmail account");
    console.error("   3. The App Password was generated for 'Mail'");
    process.exit(1);
  }

  console.log("\n✅ SMTP connection verified! Sending test email...\n");

  // Send test email to the same address (self-test)
  transporter.sendMail(
    {
      from: EMAIL_FROM || `ServiceXpress <${EMAIL_USER}>`,
      to: EMAIL_USER,          // sends to itself as a test
      subject: "✅ ServiceXpress — Email Test Successful",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
          <h2 style="color:#6366f1;">ServiceXpress</h2>
          <hr style="border:none;border-top:1px solid #e5e7eb;" />
          <h3 style="color:#16a34a;">✅ Email Configuration Working!</h3>
          <p>This is a test email confirming your SMTP setup is working correctly.</p>
          <p>Customer booking confirmation emails will be sent from this address.</p>
          <br/>
          <p style="color:#6b7280;font-size:12px;">Sent at: ${new Date().toLocaleString()}</p>
        </div>
      `,
    },
    (sendErr, info) => {
      if (sendErr) {
        console.error("❌ Email send FAILED:", sendErr.message);
        process.exit(1);
      }
      console.log("🎉 Test email sent successfully!");
      console.log("   Message ID:", info.messageId);
      console.log(`   Check inbox at: ${EMAIL_USER}`);
      console.log("\n✅ Email is fully working. Customer emails will be delivered.\n");
    }
  );
});
