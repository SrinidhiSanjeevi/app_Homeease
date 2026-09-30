const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { createOrder, verifyPayment, handleWebhook } = require("../controllers/paymentController");
const { paymentLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const { createOrderRules, verifyPaymentRules } = require("../validators/paymentValidators");

router.post("/webhook", handleWebhook);

// ─── Protected Routes (Require User JWT) ────────────────────────────────────
router.use(protect);
router.post("/create-order", paymentLimiter, validate(createOrderRules), createOrder);
router.post("/verify", paymentLimiter, validate(verifyPaymentRules), verifyPayment);

module.exports = router;
