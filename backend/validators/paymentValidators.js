const { body } = require("express-validator");

const createOrderRules = [
  body("bookingId").isMongoId().withMessage("Valid booking ID is required")
];

const verifyPaymentRules = [
  body("bookingId").isMongoId().withMessage("Valid booking ID is required"),
  body("razorpay_order_id").trim().notEmpty().withMessage("Razorpay order ID is required"),
  body("razorpay_payment_id").trim().notEmpty().withMessage("Razorpay payment ID is required"),
  body("razorpay_signature").trim().notEmpty().withMessage("Razorpay signature is required")
];

module.exports = {
  createOrderRules,
  verifyPaymentRules
};
