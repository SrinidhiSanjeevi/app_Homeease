const pino = require("pino");

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
      "creditCard",
      "MONGO_URI",
      "EMAIL_PASS"
    ],
    censor: "[REDACTED]"
  },
  base: {
    service: "homeease-notification-service",
    env: process.env.NODE_ENV || "development"
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
