const Razorpay = require("razorpay");
const logger = require("../utils/logger");

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  logger.warn("⚠️  RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — online payments will fail in live mode.");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_placeholder_key",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder_secret",
});

module.exports = razorpay;
