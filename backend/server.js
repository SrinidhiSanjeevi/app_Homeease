const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const metrics = require("./metrics");
const { startMetricsCollector } = require("./services/metricsCollector");

dotenv.config();
connectDB();
startMetricsCollector();

const app = express();
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : "*",
  credentials: true,
}));
app.use(express.json());

app.use((req, res, next) => {
  if (req.path === "/metrics" || req.path === "/api/health") return next();
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

app.get("/", (req, res) => res.send("HomeEase Backend Running"));
app.get("/api/health", (req, res) => res.status(200).json({ status: "ok", service: "homeease-backend", timestamp: new Date().toISOString() }));
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/services", require("./routes/serviceRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/emergency", require("./routes/emergencyRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));