const pino = require("pino");

const isProduction = process.env.NODE_ENV === "production";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "*.password",
      "token",
      "*.token",
      "jwt",
      "secret",
      "*.secret",
      "razorpay_signature",
      "creditCard",
      "MONGO_URI",
      "JWT_SECRET",
      "EMAIL_PASS",
      "RAZORPAY_KEY_SECRET"
    ],
    censor: "[REDACTED]"
  },
  base: {
    service: "homeease-backend",
    env: process.env.NODE_ENV || "development"
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
