const express = require("express");
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  refundPayment,
  getStatus,
  handleWebhook
} = require("../controllers/paymentController");
const { requireInternalToken } = require("../middleware/internalAuth");

// Razorpay calls this directly; it is authenticated by its HMAC signature.
router.post("/webhook", handleWebhook);

// Everything else is internal (called only by the backend) and requires
// the shared service token when INTERNAL_SERVICE_TOKEN is configured.
router.use(requireInternalToken);
router.post("/order", createOrder);
router.post("/create-order", createOrder); // Alias for compatibility
router.post("/verify", verifyPayment);
router.post("/refund", refundPayment);
router.get("/status", getStatus);

module.exports = router;
