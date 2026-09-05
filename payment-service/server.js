const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

dotenv.config();

const logger = require("./utils/logger");
const connectDB = require("./config/db");

if (process.env.NODE_ENV !== "test" && process.env.MONGO_URI) {
  connectDB();
}

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));

// Capture raw body for Razorpay webhook signature validation
app.use(
  express.json({
    limit: "2mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: false }));

// Health probes
app.get("/health/live", (req, res) => {
  res.status(200).json({ status: "ok", service: "homeease-payment-service" });
});

app.get("/health/ready", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  return dbReady
    ? res.status(200).json({ status: "ready", db: "connected" })
    : res.status(503).json({ status: "not_ready", db: "disconnected" });
});

app.get("/api/health", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? "ok" : "degraded",
    service: "homeease-payment-service",
    db: dbReady ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

app.get("/", (req, res) => res.send("HomeEase Payment Service Running"));

// Payment Routes
app.use("/api/payments", require("./routes/paymentRoutes"));

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});

// Centralized error handler
app.use((err, req, res, next) => {
  logger.error({ err: err.message }, "Unhandled error in Payment Service");
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.isOperational ? err.message : "Internal Server Error"
  });
});

const PORT = process.env.PAYMENT_SERVICE_PORT || process.env.PORT || 5002;
let server = null;

if (process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "HomeEase Payment Service started");
  });

  const shutdown = (signal) => {
    logger.info({ signal }, "Payment Service graceful shutdown initiated");
    if (server) {
      server.close(() => {
        mongoose.connection.close(false).then(() => {
          logger.info("Payment Service connections closed");
          process.exit(0);
        });
      });
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = app;
