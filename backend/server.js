const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const metrics = require("./metrics");
const { startMetricsCollector } = require("./services/metricsCollector");

dotenv.config();

connectDB();
startMetricsCollector(); // polls Mongo every 30s in-process, sets business Gauges — no separate pod needed

const app = express();
app.use(cors());
app.use(express.json());

// HTTP Metrics middleware — RED method (Rate/Errors/Duration).
// Skips /metrics and /api/health so scrapes and health checks don't
// pollute the request metrics themselves.
app.use((req, res, next) => {
  if (req.path === "/metrics" || req.path === "/api/health") return next();
  metrics.httpRequestsInFlight.inc();
  const end = metrics.httpRequestDurationSeconds.startTimer({ method: req.method, route: req.path });
  res.on("finish", () => {
    metrics.httpRequestsInFlight.dec();
    metrics.httpRequestsTotal.inc({ method: req.method, route: req.path, code: res.statusCode });
    end({ code: res.statusCode });
  });
  next();
});

app.get("/", (req, res) => {
  res.send("HomeEase Backend Running");
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "homeease-backend", timestamp: new Date().toISOString() });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/services", require("./routes/serviceRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/emergency", require("./routes/emergencyRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});