const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const isTest = process.env.NODE_ENV === "test";

// Service-to-service calls (admin-backend, payment-service, notification-service) all come from one pod IP and
// authenticate with the shared internal token. They are trusted traffic, so they must not share the end-user
// limit: the admin console alone makes dozens of these calls per minute.
const INTERNAL_TOKEN = (process.env.INTERNAL_SERVICE_TOKEN || "").trim();

const isInternalServiceCall = (req) => {
  const sent = String(req.headers["x-internal-token"] || "").trim();
  if (!INTERNAL_TOKEN || !sent) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(INTERNAL_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again after 15 minutes."
  },
  skip: () => isTest
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_PAYMENT_MAX, 10) || 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many payment operations requested. Please try again after a few minutes."
  },
  skip: () => isTest
});

const emergencyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_EMERGENCY_MAX, 10) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Emergency request rate limit exceeded. Please call emergency services directly if urgent."
  },
  skip: () => isTest
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_GENERAL_MAX, 10) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later."
  },
  skip: (req) => isTest || isInternalServiceCall(req)
});

module.exports = {
  isInternalServiceCall,
  authLimiter,
  paymentLimiter,
  emergencyLimiter,
  generalLimiter
};
