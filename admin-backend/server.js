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
const requestIdMiddleware = require("./middleware/requestId");
const errorHandler = require("./middleware/errorHandler");

connectDB();

const app = express();
app.set("trust proxy", 1);

// ─── Security ─────────────────────────────────────────────────────────────────

app.use(helmet());

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

// ─── Structured HTTP logging ──────────────────────────────────────────────────
let pinoHttp;
try { pinoHttp = require("pino-http"); } catch (_) { pinoHttp = null; }
if (pinoHttp) {
  app.use(pinoHttp({
    logger,
    customLogLevel: (req, res) => res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    autoLogging: { ignore: (req) => req.url === "/api/health" || req.url.startsWith("/health") || req.url === "/metrics" },
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
app.get("/health/live", (req, res) => {
  res.status(200).json({ status: "ok", service: "homeease-admin-backend" });
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
    service: "homeease-admin",
    db: dbReady ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

// Keep legacy alias
app.get("/admin-health", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({ status: dbReady ? "ok" : "degraded", service: "homeease-admin", timestamp: new Date().toISOString() });
});

// Prometheus metrics
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

app.get("/", (req, res) => res.send("HomeEase Admin Service Running"));

// ─── Admin routes ─────────────────────────────────────────────────────────────
app.use("/api/admin", require("./routes/adminRoutes"));

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});

// ─── Centralized error handler ────────────────────────────────────────────────
app.use(errorHandler);

// ─── Server start ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "HomeEase Admin Backend started");
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
  setTimeout(() => { logger.error("Graceful shutdown timed out, forcing exit"); process.exit(1); }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = app; // for testing
