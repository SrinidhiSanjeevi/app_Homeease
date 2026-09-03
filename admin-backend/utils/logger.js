const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "password", "*.password", "token", "*.token", "secret", "*.secret", "JWT_SECRET", "MONGO_URI"],
    censor: "[REDACTED]"
  },
  base: { service: "homeease-admin-backend", env: process.env.NODE_ENV || "development" },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
