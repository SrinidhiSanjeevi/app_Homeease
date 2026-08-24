const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");

const connectDB = require("./config/db");
const metrics = require("./metrics");

dotenv.config();

connectDB();

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : "*",
  credentials: true,
}));
app.use(express.json());

// HTTP Metrics middleware
app.use((req, res, next) => {
  if (req.path === '/metrics' || req.path === '/api/health') return next();
  metrics.httpRequestsInFlight.inc();
  const end = metrics.httpRequestDurationSeconds.startTimer({ method: req.method, route: req.path });

  res.on('finish', () => {
    metrics.httpRequestsInFlight.dec();
    metrics.httpRequestsTotal.inc({ method: req.method, route: req.path, code: res.statusCode });
    end({ code: res.statusCode });
  });

  next();
});

app.get("/", (req, res) => {
  res.send("HomeEase Admin Service Running");
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "homeease-admin", timestamp: new Date().toISOString() });
});

app.get("/admin-health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "homeease-admin",
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

app.use("/api/admin", require("./routes/adminRoutes"));

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Admin Microservice running on port ${PORT}`);
});