const rateLimit = require("express-rate-limit");

const isTest = process.env.NODE_ENV === "test";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 10,
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
  max: parseInt(process.env.RATE_LIMIT_PAYMENT_MAX, 10) || 25,
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
  max: parseInt(process.env.RATE_LIMIT_EMERGENCY_MAX, 10) || 30,
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
  max: parseInt(process.env.RATE_LIMIT_GENERAL_MAX, 10) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later."
  },
  skip: () => isTest
});

module.exports = {
  authLimiter,
  paymentLimiter,
  emergencyLimiter,
  generalLimiter
};
