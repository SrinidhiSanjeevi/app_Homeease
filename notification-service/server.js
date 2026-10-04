const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

dotenv.config();

const logger = require("./utils/logger");
const { validateEnv } = require("./config/validateEnv");

if (process.env.NODE_ENV !== "test") {
  const { isValid, missing } = validateEnv();
  if (!isValid) {
    const varLabel = missing.length === 1 ? "variable" : "variables";
    logger.fatal(`[Startup] FATAL: Missing required environment ${varLabel}: ${missing.join(", ")}`);
    process.exit(1);
  }
}

const connectDB = require("./config/db");
const metrics = require("./metrics");

if (process.env.NODE_ENV !== "test") {
  void connectDB();
}

const app = express();
app.set("trust proxy", 1);

app.use(helmet());

// CORS: only known origins may make credentialed cross-origin requests.
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

// ─── Prometheus HTTP metrics ──────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path === "/metrics" || req.path.startsWith("/health")) return next();
  metrics.httpRequestsInFlight.inc();
  const end = metrics.httpRequestDurationSeconds.startTimer({ method: req.method });
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const routeLabel = req.route ? (req.baseUrl + req.route.path) : (req.baseUrl ? `${req.baseUrl}/*` : "unmatched");
    metrics.httpRequestsInFlight.dec();
    metrics.httpRequestsTotal.inc({ method: req.method, route: routeLabel, code: res.statusCode });
    end({ route: routeLabel, code: res.statusCode });
    // One structured line per request (same shape as the backend's pino-http line) so
    // CloudWatch Logs Insights can chart request rate, errors and latency percentiles.
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger[level](
      {
        req: { method: req.method, url: req.originalUrl.split("?")[0] },
        res: { statusCode: res.statusCode },
        responseTime: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
        route: routeLabel
      },
      "request completed"
    );
  });
  next();
});

// Health probes
app.get("/health/live", (req, res) => {
  res.status(200).json({ status: "ok", service: "homeease-notification-service" });
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
    service: "homeease-notification-service",
    db: dbReady ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

// Prometheus metrics
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

app.get("/", (req, res) => res.send("HomeEase Notification Service Running"));

app.use("/api/internal/notifications", require("./routes/notificationRoutes"));

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});

// Centralized error handler
app.use((err, req, res, _next) => {
  logger.error({ err: err.message }, "Unhandled error in Notification Service");
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.isOperational ? err.message : "Internal Server Error"
  });
});

const PORT = process.env.NOTIFICATION_SERVICE_PORT || process.env.PORT || 5003;
let server = null;

if (process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "HomeEase Notification Service started");
  });

  const scheduler = require("./services/scheduler");
  scheduler.start();

  const shutdown = (signal) => {
    logger.info({ signal }, "Notification Service graceful shutdown initiated");
    scheduler.stop();
    if (server) {
      server.close(() => {
        mongoose.connection.close(false).then(() => {
          logger.info("Notification Service connections closed");
          process.exit(0);
        });
      });
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = app;
