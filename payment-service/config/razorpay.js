const Razorpay = require("razorpay");
const logger = require("../utils/logger");

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  logger.warn("⚠️  RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — online payments will fail in live mode.");
}

// .trim() guards against a trailing newline/space slipping into the secret
// when it's injected via a Kubernetes Secret / Key Vault CSI mount — that
// whitespace becomes part of the HMAC key and silently breaks every
// signature verification while leaving order creation unaffected.
const razorpay = new Razorpay({
  key_id: (process.env.RAZORPAY_KEY_ID || "rzp_placeholder_key").trim(),
  key_secret: (process.env.RAZORPAY_KEY_SECRET || "placeholder_secret").trim(),
});

module.exports = razorpay;
