const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

dotenv.config();

// ─── Startup validation ───────────────────────────────────────────────────────
const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[Startup] FATAL: Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const logger = require("./utils/logger");
const connectDB = require("./config/db");
const metrics = require("./metrics");
const { startMetricsCollector } = require("./services/metricsCollector");
const requestIdMiddleware = require("./middleware/requestId");
const errorHandler = require("./middleware/errorHandler");
const { generalLimiter } = require("./middleware/rateLimiter");

connectDB();
startMetricsCollector();

const app = express();
app.set("trust proxy", 1);

// ─── Security middleware ──────────────────────────────────────────────────────

app.use(helmet());

// CORS: include Docker frontend (:8080) and Vite dev (:5173) defaults, plus any env-configured origins
const defaultOrigins = [
  "http://localhost:8080",
  "http://localhost:5173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173"
];
const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server, health checkers)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// ─── Request correlation ID ───────────────────────────────────────────────────
app.use(requestIdMiddleware);

// ─── Structured HTTP logging (skip noisy health/metrics paths) ───────────────
let pinoHttp;
try {
  pinoHttp = require("pino-http");
} catch (_) {
  pinoHttp = null;
}
if (pinoHttp) {
  app.use(pinoHttp({
    logger,
    customLogLevel: (req, res) => {
      if (res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    autoLogging: {
      ignore: (req) => req.url === "/api/health" || req.url === "/health/live" || req.url === "/health/ready" || req.url === "/metrics"
    },
    genReqId: (req) => req.id
  }));
}

// ─── Prometheus HTTP metrics ──────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === "/metrics" || req.path.startsWith("/health")) return next();
  metrics.httpRequestsInFlight.inc();
  const end = metrics.httpRequestDurationSeconds.startTimer({ method: req.method });
  res.on("finish", () => {
    const routeLabel = req.route ? (req.baseUrl + req.route.path) : req.path;
    metrics.httpRequestsInFlight.dec();
    metrics.httpRequestsTotal.inc({ method: req.method, route: routeLabel, code: res.statusCode });
    end({ route: routeLabel, code: res.statusCode });
  });
  next();
});

// ─── Health probes ────────────────────────────────────────────────────────────
// Liveness: always 200 — if this returns, the process is alive
app.get("/health/live", (req, res) => {
  res.status(200).json({ status: "ok", service: "homeease-backend" });
});

// Readiness: 200 only when MongoDB is connected
app.get("/health/ready", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  if (dbReady) {
    return res.status(200).json({ status: "ready", db: "connected" });
  }
  return res.status(503).json({ status: "not_ready", db: "disconnected" });
});

// Backward-compatible health alias
app.get("/api/health", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? "ok" : "degraded",
    service: "homeease-backend",
    db: dbReady ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

// Prometheus metrics
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

// Root
app.get("/", (req, res) => res.send("HomeEase Backend Running"));

// ─── General rate limiting ────────────────────────────────────────────────────
app.use("/api/", generalLimiter);

// ─── API routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/services", require("./routes/serviceRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/emergency", require("./routes/emergencyRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});

// ─── Centralized error handler (must be last) ─────────────────────────────────
app.use(errorHandler);

// ─── Server start ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `HomeEase Backend started`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const shutdown = (signal) => {
  logger.info({ signal }, "Graceful shutdown initiated");
  server.close(() => {
    logger.info("HTTP server closed");
    mongoose.connection.close(false).then(() => {
      logger.info("MongoDB connection closed");
      process.exit(0);
    }).catch((err) => {
      logger.error({ err: err.message }, "Error closing MongoDB connection");
      process.exit(1);
    });
  });

  // Force exit if graceful close takes too long
  setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = app; // for testing
