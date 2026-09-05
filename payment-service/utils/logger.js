const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "authorization",
      "Authorization",
      "password",
      "*.password",
      "token",
      "*.token",
      "secret",
      "*.secret",
      "webhookSecret",
      "*.webhookSecret",
      "keySecret",
      "*.keySecret",
      "RAZORPAY_KEY_SECRET",
      "RAZORPAY_WEBHOOK_SECRET",
      "MONGO_URI",
      "razorpay_signature",
      "*.razorpay_signature",
      "razorpaySignature",
      "*.razorpaySignature",
      "x-razorpay-signature",
      "req.headers['x-razorpay-signature']",
      "rawPayload",
      "req.body",
      "body"
    ],
    censor: "[REDACTED]"
  },
  base: { service: "homeease-payment-service", env: process.env.NODE_ENV || "development" },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
